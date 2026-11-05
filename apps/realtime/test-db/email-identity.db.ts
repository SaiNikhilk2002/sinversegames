import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  AccountError,
  claimUsername,
  createAccountSession,
  getDb,
  getProfile,
  linkEmail,
  recordMatch,
  verifiedEmailFor,
  walletBalance,
} from "@platform/db";

const database =
  process.env.ECONOMY_TEST_DATABASE_URL ??
  "postgresql://platform:platform@localhost:5433/sinversegames_identity_test";
const target = new URL(database);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  !target.pathname.endsWith("_test")
)
  throw Error("Email identity tests require a loopback *_test database.");
process.env.DATABASE_URL = database;
const db = getDb()!;
const players = new Set<string>();
const email = () => `${randomUUID()}@example.invalid`;
async function guest() {
  const id = `email_${randomUUID().replaceAll("-", "")}`;
  players.add(id);
  await db.player.create({
    data: { id, displayName: "Email guest", avatarColor: "#8d86df" },
  });
  return id;
}
afterAll(async () => {
  await db.player.deleteMany({ where: { id: { in: [...players] } } });
  await db.$disconnect();
});

describe("linkEmail", () => {
  it("creates one registered player, then returns that player every time", async () => {
    const address = email();
    const first = await linkEmail(db, address, null);
    players.add(first.player.id);
    expect(first.created).toBe(true);
    expect(first.player.kind).toBe("REGISTERED");
    const second = await linkEmail(db, address, null);
    expect(second.created).toBe(false);
    expect(second.player.id).toBe(first.player.id);
    expect(await db.externalIdentity.count({ where: { subject: address } })).toBe(1);
    expect(await verifiedEmailFor(db, first.player.id)).toBe(address);
  });

  it("creates only one player when the same new address verifies concurrently", async () => {
    const address = email();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => linkEmail(db, address, null)),
    );
    const ids = new Set(results.map((r) => r.player.id));
    for (const id of ids) players.add(id);
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await db.externalIdentity.count({ where: { subject: address } })).toBe(1);
  });

  it("keeps a guest's id and progress when the address is new", async () => {
    const id = await guest();
    const match = randomUUID();
    await recordMatch(db, {
      id: match,
      solo: true,
      visibility: "solo",
      roomCode: "SOLO",
      config: {},
      startedAt: Date.now() - 1000,
      players: [{ id, name: "Email guest", color: "#8d86df" }],
      results: {
        gameId: "cascade-solitaire",
        reason: "completed",
        endedAt: Date.now(),
        entries: [
          { playerId: id, name: "Email guest", color: "#8d86df", placement: 1, score: 100, isWinner: true },
        ],
      },
    } as Parameters<typeof recordMatch>[1]);
    const before = await db.player.findUniqueOrThrow({
      where: { id },
      include: { stats: true, rewards: true, achievements: true },
    });
    const { player, created } = await linkEmail(db, email(), id);
    expect(created).toBe(true);
    expect(player.id).toBe(id);
    expect(player.kind).toBe("REGISTERED");
    expect(player.displayName).toBe("Email guest");
    const after = await db.player.findUniqueOrThrow({
      where: { id },
      include: { stats: true, rewards: true, achievements: true },
    });
    expect(after.stats).toEqual(before.stats);
    expect(after.rewards).toEqual(before.rewards);
    expect(after.achievements).toEqual(before.achievements);
    await db.match.delete({ where: { id: match } });
  });

  it("never merges a guest into an address that already has a player", async () => {
    const address = email();
    const owner = await linkEmail(db, address, null);
    players.add(owner.player.id);
    const id = await guest();
    const result = await linkEmail(db, address, id);
    expect(result.player.id).toBe(owner.player.id);
    expect(result.created).toBe(false);
    const row = await db.player.findUniqueOrThrow({ where: { id } });
    expect(row.kind).toBe("GUEST");
    expect(await verifiedEmailFor(db, id)).toBeNull();
    expect(await walletBalance(db, id)).toBe(0);
  });

  it("refuses to give one registered player a second address", async () => {
    const { player } = await linkEmail(db, email(), null);
    players.add(player.id);
    await expect(linkEmail(db, email(), player.id)).rejects.toMatchObject({
      code: "already_linked",
    });
  });

  it("refuses suspended players", async () => {
    const address = email();
    const { player } = await linkEmail(db, address, null);
    players.add(player.id);
    await db.player.update({
      where: { id: player.id },
      data: { bannedUntil: new Date(Date.now() + 60_000) },
    });
    await expect(linkEmail(db, address, null)).rejects.toBeInstanceOf(AccountError);
    const banned = await guest();
    await db.player.update({
      where: { id: banned },
      data: { bannedUntil: new Date(Date.now() + 60_000) },
    });
    await expect(linkEmail(db, email(), banned)).rejects.toMatchObject({ code: "suspended" });
  });

  it("treats a deleted guest as no guest, creating a separate player", async () => {
    const { player, created } = await linkEmail(db, email(), `email_missing_${randomUUID()}`);
    players.add(player.id);
    expect(created).toBe(true);
  });

  it("removes earlier sessions when a guest becomes registered", async () => {
    const { player } = await linkEmail(db, email(), null);
    players.add(player.id);
    await createAccountSession(db, player.id);
    expect(await db.accountSession.count({ where: { playerId: player.id } })).toBe(1);
    const id = await guest();
    await linkEmail(db, email(), id);
    expect(await db.accountSession.count({ where: { playerId: id } })).toBe(0);
  });
});

describe("usernames for new email players", () => {
  it("replaces only the placeholder name", async () => {
    const { player } = await linkEmail(db, email(), null);
    players.add(player.id);
    const username = `e_${randomUUID().slice(0, 8)}`;
    const row = await claimUsername(db, player.id, username);
    expect(row.displayName).toBe(username);
    const named = await guest();
    await linkEmail(db, email(), named);
    const kept = await claimUsername(db, named, `k_${randomUUID().slice(0, 8)}`);
    expect(kept.displayName).toBe("Email guest");
  });

  it("rejects a username another player holds", async () => {
    const a = await linkEmail(db, email(), null);
    const b = await linkEmail(db, email(), null);
    players.add(a.player.id);
    players.add(b.player.id);
    const username = `u_${randomUUID().slice(0, 8)}`;
    await claimUsername(db, a.player.id, username);
    await expect(claimUsername(db, b.player.id, username)).rejects.toMatchObject({
      code: "username_taken",
    });
    expect((await getProfile(db, b.player.id))?.username).toBeNull();
  });
});
