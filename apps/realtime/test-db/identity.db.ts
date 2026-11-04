import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  claimUsername,
  createAccountSession,
  getDb,
  getProfile,
  identityLimit,
  linkGoogle,
  resolveAccountSession,
  walletBalance,
} from "@platform/db";
import {
  hashSecret,
  usernameSchema,
  USERNAME_RENAME_MS,
} from "@platform/shared";
const database =
  process.env.ECONOMY_TEST_DATABASE_URL ??
  "postgresql://platform:platform@localhost:5433/sinversegames_identity_test";
const target = new URL(database);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  !target.pathname.endsWith("_test")
)
  throw Error("Identity tests require a loopback *_test database.");
process.env.DATABASE_URL = database;
const db = getDb()!;
const players: string[] = [];
const subjects: string[] = [];
async function guest() {
  const id = `identity_${randomUUID().replaceAll("-", "")}`;
  players.push(id);
  await db.player.create({
    data: { id, displayName: "Identity adventurer", avatarColor: "#8d86df" },
  });
  return id;
}
function subject() {
  const value = randomUUID();
  subjects.push(value);
  return value;
}
afterAll(async () => {
  for (const s of subjects) {
    const identity = await db.externalIdentity.findUnique({
      where: { provider_subject: { provider: "google", subject: s } },
    });
    if (identity && !players.includes(identity.playerId))
      players.push(identity.playerId);
  }
  await db.player.deleteMany({ where: { id: { in: players } } });
  await db.$disconnect();
});
describe("Permanent player identity", () => {
  it("links a rich guest without changing ID, ledger, cosmetics, achievements, stats or campaign", async () => {
    const id = await guest();
    await db.rewardLedgerEntry.create({
      data: { playerId: id, amount: 73, reason: "legacy", refId: randomUUID() },
    });
    await db.cosmeticInventory.create({
      data: { playerId: id, itemId: "frame-nebula" },
    });
    await db.cosmeticEquipment.create({
      data: { playerId: id, itemId: "frame-nebula", category: "profile-frame" },
    });
    await db.playerAchievement.createMany({
      data: [
        { playerId: id, achievementKey: "first-match" },
        { playerId: id, achievementKey: "cq-three-star-chef" },
      ],
    });
    await db.playerGameStats.create({
      data: {
        playerId: id,
        gameId: "cuisine-quest",
        gamesPlayed: 4,
        wins: 3,
        bestScore: 9700,
      },
    });
    await db.cuisineProgress.create({
      data: {
        playerId: id,
        level: 1,
        stars: 3,
        bestScore: 9700,
        completedRuns: 3,
        perfectRuns: 1,
      },
    });
    await db.player.update({ where: { id }, data: { xp: 170, level: 2 } });
    const before = await getProfile(db, id);
    const provider = subject();
    const result = await linkGoogle(db, provider, id, "link");
    expect(result).toMatchObject({ id, kind: "REGISTERED" });
    const after = await getProfile(db, id);
    for (const key of [
      "stats",
      "achievements",
      "inventory",
      "equipment",
      "cuisineProgress",
      "rewardBalance",
      "xp",
      "level",
    ] as const)
      expect(after?.[key]).toEqual(before?.[key]);
    expect(await walletBalance(db, id)).toBe(73);
    expect((await linkGoogle(db, provider, null, "signin")).id).toBe(id);
  });
  it("creates a new registered player only for a new sign-in subject", async () => {
    const s = subject();
    const p = await linkGoogle(db, s, null, "signin");
    players.push(p.id);
    expect(p.kind).toBe("REGISTERED");
    expect((await linkGoogle(db, s, null, "signin")).id).toBe(p.id);
    expect(await db.externalIdentity.count({ where: { subject: s } })).toBe(1);
  });
  it("never merges two players on a provider collision", async () => {
    const a = await guest(),
      b = await guest(),
      s = subject();
    await linkGoogle(db, s, a, "link");
    await expect(linkGoogle(db, s, b, "link")).rejects.toMatchObject({
      code: "identity_collision",
    });
    expect((await db.player.findUnique({ where: { id: b } }))?.kind).toBe(
      "GUEST",
    );
    expect((await linkGoogle(db, s, b, "signin")).id).toBe(a);
  });
  it("rejects another provider subject on an already registered player", async () => {
    const id = await guest();
    await linkGoogle(db, subject(), id, "link");
    await expect(linkGoogle(db, subject(), id, "link")).rejects.toMatchObject({
      code: "already_linked",
    });
  });
  it("serializes duplicate provider claims without duplicate wallets or players", async () => {
    const a = await guest(),
      b = await guest(),
      s = subject();
    const result = await Promise.allSettled([
      linkGoogle(db, s, a, "link"),
      linkGoogle(db, s, b, "link"),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.externalIdentity.count({ where: { subject: s } })).toBe(1);
    expect(
      await db.player.count({
        where: { id: { in: [a, b] }, kind: "REGISTERED" },
      }),
    ).toBe(1);
  });
  it("rejects missing or banned linking actors", async () => {
    await expect(
      linkGoogle(db, subject(), "missing-player", "link"),
    ).rejects.toMatchObject({ code: "session_changed" });
    const id = await guest();
    await db.player.update({
      where: { id },
      data: { bannedUntil: new Date(Date.now() + 60000) },
    });
    await expect(linkGoogle(db, subject(), id, "link")).rejects.toMatchObject({
      code: "suspended",
    });
  });
  it("stores only session hashes, supports independent sessions, expiry and revocation", async () => {
    const id = await guest();
    await linkGoogle(db, subject(), id, "link");
    const a = await createAccountSession(db, id),
      b = await createAccountSession(db, id);
    expect(a.tokenHash).not.toBe(a.secret);
    expect(a.tokenHash).toBe(await hashSecret(a.secret));
    expect((await resolveAccountSession(db, a.tokenHash))?.playerId).toBe(id);
    await db.accountSession.delete({ where: { tokenHash: a.tokenHash } });
    expect(await resolveAccountSession(db, a.tokenHash)).toBeNull();
    expect((await resolveAccountSession(db, b.tokenHash))?.playerId).toBe(id);
    await db.accountSession.update({
      where: { tokenHash: b.tokenHash },
      data: { expiresAt: new Date(0) },
    });
    expect(await resolveAccountSession(db, b.tokenHash)).toBeNull();
  });
  it("does not resolve registered sessions while banned", async () => {
    const id = await guest();
    await linkGoogle(db, subject(), id, "link");
    const session = await createAccountSession(db, id);
    await db.player.update({
      where: { id },
      data: { bannedUntil: new Date(Date.now() + 60000) },
    });
    expect(await resolveAccountSession(db, session.tokenHash)).toBeNull();
  });
});
describe("Unique usernames and identity limits", () => {
  it.each([
    "ab",
    "_bad",
    "bad_",
    "bad__name",
    "bad name",
    " bad",
    "admin",
    "Admin_2",
    "system",
    "sinversegames",
    "fuck",
    "日本語",
  ])("rejects invalid or reserved %s", (name) => {
    expect(usernameSchema.safeParse(name).success).toBe(false);
  });
  it("stores canonical lowercase and protects concurrent case-insensitive claims", async () => {
    const a = await guest(),
      b = await guest();
    await linkGoogle(db, subject(), a, "link");
    await linkGoogle(db, subject(), b, "link");
    const name = "Chef_" + randomUUID().replaceAll("-", "").slice(0, 10);
    const results = await Promise.allSettled([
      claimUsername(db, a, name),
      claimUsername(db, b, name.toLowerCase()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.player.count({ where: { username: name.toLowerCase() } }),
    ).toBe(1);
  });
  it("keeps unchanged names idempotent, limits renames and allows a rename after 30 days", async () => {
    const id = await guest();
    await linkGoogle(db, subject(), id, "link");
    const name = "u" + randomUUID().replaceAll("-", "").slice(0, 15);
    const now = new Date();
    await claimUsername(db, id, name, now);
    await claimUsername(db, id, name.toUpperCase(), now);
    await expect(claimUsername(db, id, name + "x", now)).rejects.toMatchObject({
      code: "rename_cooldown",
    });
    expect(
      (
        await claimUsername(
          db,
          id,
          name + "x",
          new Date(now.getTime() + USERNAME_RENAME_MS),
        )
      ).username,
    ).toBe(name + "x");
  });
  it("requires a registered player and enforces canonical SQL constraints", async () => {
    const id = await guest();
    await expect(claimUsername(db, id, "guest_claim")).rejects.toMatchObject({
      code: "registration_required",
    });
    await expect(
      db.player.update({ where: { id }, data: { username: "UPPERCASE" } }),
    ).rejects.toBeDefined();
  });
  it("counts simultaneous sensitive requests atomically", async () => {
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        identityLimit(db, "test-identity", key, 5, 60000),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(5);
    await db.identityRateLimit.delete({
      where: { key: await hashSecret(`test-identity:${key}`) },
    });
  });
});
