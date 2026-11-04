import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { equipCosmetic, getDailyBest, getDb, getLeaderboard, getProfile, getWallet, purchaseCosmetic, recordMatch, walletBalance, type RecordMatchInput } from "@platform/db";
import { createDbPersistence } from "../src/persistence";
import { createLogger } from "../src/logger";

const database = process.env.ECONOMY_TEST_DATABASE_URL ?? "postgresql://platform:platform@localhost:5433/sinversegames_expansion_test";
const target = new URL(database);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || !target.pathname.endsWith("_test")) throw new Error("Economy tests require an explicitly local *_test database.");
process.env.DATABASE_URL = database;
const db = getDb()!;
const ids: string[] = [];
const matches: string[] = [];

async function player(balance = 0) {
  const id = `economy_${randomUUID().replaceAll("-", "")}`;
  ids.push(id);
  await db.player.create({ data: { id, displayName: "Economy tester", avatarColor: "#ff4f8b" } });
  if (balance) await db.rewardLedgerEntry.create({ data: { playerId: id, amount: balance, reason: "legacy_balance", refId: randomUUID() } });
  return id;
}
function outcome(id: string, score = 100, duration = 40_000): RecordMatchInput {
  const match = randomUUID(); matches.push(match);
  return { id: match, solo: true, players: [{ id, name: "Economy tester", color: "#ff4f8b" }], roomCode: "SOLO", visibility: "solo", config: { level: 1 }, startedAt: Date.now() - duration,
    results: { gameId: "kitchen-rush", reason: "completed", endedAt: Date.now(), entries: [{ playerId: id, name: "Economy tester", color: "#ff4f8b", placement: 1, score, isWinner: true, details: { level: 1, stars: 1 } }] } };
}
afterAll(async () => {
  await db.player.deleteMany({ where: { id: { in: ids } } });
  await db.match.deleteMany({ where: { id: { in: matches } } });
  await db.$disconnect();
});

describe("Sin Coins with real PostgreSQL transactions", () => {
  it("preserves legacy balances, rewards a verified completion and grants achievements once", async () => {
    const id = await player(17);
    const first = outcome(id);
    await recordMatch(db, first);
    expect(await walletBalance(db, id)).toBe(39);
    await expect(recordMatch(db, first)).rejects.toMatchObject({ code: "P2002" });
    expect(await walletBalance(db, id)).toBe(39);
    await recordMatch(db, outcome(id, 110));
    expect(await walletBalance(db, id)).toBe(54); // completion/win + PB; no repeated achievement.
    expect(await db.playerAchievement.count({ where: { playerId: id } })).toBe(2);
    expect((await getProfile(db, id))?.stats[0]?.gamesPlayed).toBe(2);
  });

  it("gives no coins for instant, incomplete, nonpositive, abandoned or aborted outcomes", async () => {
    for (const kind of ["instant", "incomplete", "zero", "abandoned", "aborted"] as const) {
      const id = await player(); const input = outcome(id);
      if (kind === "instant") input.startedAt = Date.now() - 1000;
      if (kind === "incomplete") input.results.entries[0]!.isWinner = false;
      if (kind === "zero") input.results.entries[0]!.score = 0;
      if (kind === "abandoned") input.results.reason = "players-left";
      if (kind === "aborted") input.results.reason = "aborted";
      await recordMatch(db, input);
      expect(await walletBalance(db, id), kind).toBe(0);
    }
  });

  it("caps all reward reasons at 80 per UTC day and excludes yesterday's credits", async () => {
    const id = await player();
    const yesterday = new Date(Date.now() - 86_400_000);
    await db.rewardLedgerEntry.create({ data: { playerId: id, amount: 80, reason: "match_played", refId: "yesterday", createdAt: yesterday } });
    await Promise.all(Array.from({ length: 8 }, (_, i) => recordMatch(db, outcome(id, 100 + i))));
    expect(await walletBalance(db, id)).toBe(160);
    await recordMatch(db, outcome(id, 500));
    expect(await walletBalance(db, id)).toBe(160);
  });

  it("serializes concurrent records without losing XP, plays, personal best or duplicate credits", async () => {
    const id = await player();
    const input = outcome(id, 300);
    const results = await Promise.allSettled([recordMatch(db, input), recordMatch(db, input), recordMatch(db, outcome(id, 200))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const p = await getProfile(db, id);
    expect(p?.xp).toBe(100);
    expect(p?.stats[0]).toMatchObject({ gamesPlayed: 2, bestScore: 300 });
    expect(await db.matchParticipant.count({ where: { playerId: id } })).toBe(2);
  });

  it("acknowledges a stable-ID persistence retry after a prior commit without new credits", async () => {
    const id = await player(); const input = outcome(id);
    await recordMatch(db, input);
    const balance = await walletBalance(db, id);
    const persistence = createDbPersistence(createLogger("error"));
    expect(await persistence.recordMatch(input)).toEqual({ unlocked: {}, earned: {} });
    expect(await walletBalance(db, id)).toBe(balance);
    expect(await db.match.count({ where: { id: input.id } })).toBe(1);
  });

  it("rolls back a debit if the inventory insert fails after the balance check", async () => {
    const id = await player(50);
    // A fixture-only constraint in the isolated *_test DB injects a failure
    // after the debit has been written. Always remove it, even on assertion failure.
    await db.$executeRawUnsafe('ALTER TABLE "CosmeticInventory" ADD CONSTRAINT "economy_test_insert_failure" CHECK ("itemId" <> \'frame-jade-studio\')');
    try {
      await expect(purchaseCosmetic(db, id, "frame-jade-studio")).rejects.toBeDefined();
      expect(await walletBalance(db, id)).toBe(50);
      expect(await db.cosmeticInventory.count({ where: { playerId: id } })).toBe(0);
      expect(await db.rewardLedgerEntry.count({ where: { playerId: id, reason: "cosmetic_purchase" } })).toBe(0);
    } finally { await db.$executeRawUnsafe('ALTER TABLE "CosmeticInventory" DROP CONSTRAINT "economy_test_insert_failure"'); }
  });

  it("prevents concurrent purchases from overspending and rolls back failed debits", async () => {
    const id = await player(25);
    const results = await Promise.allSettled([purchaseCosmetic(db, id, "frame-brass-orbit"), purchaseCosmetic(db, id, "nameplate-sunset")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const w = await getWallet(db, id);
    expect(w.inventory).toHaveLength(1);
    expect(w.balance).toBeGreaterThanOrEqual(0);
    expect(w.transactions.filter((r) => r.reason === "cosmetic_purchase")).toHaveLength(1);
    const prior = w.balance;
    await expect(purchaseCosmetic(db, id, "frame-ink-star")).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    expect(await walletBalance(db, id)).toBe(prior);
  });

  it("makes simultaneous and later same-item purchase retries idempotent", async () => {
    const id = await player(40);
    const responses = await Promise.all([purchaseCosmetic(db, id, "frame-brass-orbit"), purchaseCosmetic(db, id, "frame-brass-orbit")]);
    expect(responses.map((r) => r.purchased).sort()).toEqual([false, true]);
    expect(await purchaseCosmetic(db, id, "frame-brass-orbit")).toEqual({ purchased: false, balance: 25 });
    expect(await db.rewardLedgerEntry.count({ where: { playerId: id, amount: { lt: 0 } } })).toBe(1);
    expect(await db.cosmeticInventory.count({ where: { playerId: id } })).toBe(1);
  });

  it("requires ownership and correct category to equip; never changes another player's equipment", async () => {
    const a = await player(50); const b = await player();
    await expect(equipCosmetic(db, a, "profile-frame", "frame-brass-orbit")).rejects.toMatchObject({ code: "NOT_OWNED" });
    await purchaseCosmetic(db, a, "frame-brass-orbit");
    await expect(equipCosmetic(db, a, "nameplate", "frame-brass-orbit")).rejects.toMatchObject({ code: "UNKNOWN_ITEM" });
    await equipCosmetic(db, a, "profile-frame", "frame-brass-orbit");
    expect((await getWallet(db, a)).equipment).toHaveLength(1);
    expect((await getWallet(db, b)).equipment).toHaveLength(0);
    await equipCosmetic(db, a, "profile-frame", null);
    expect((await getWallet(db, a)).equipment).toHaveLength(0);
    expect(await walletBalance(db, a)).toBe(35);
    await expect(purchaseCosmetic(db, a, "forged-price-item")).rejects.toMatchObject({ code: "UNKNOWN_ITEM" });
  });

  it("paginates deterministic history without repeating or losing entries", async () => {
    const id = await player();
    await db.rewardLedgerEntry.createMany({ data: Array.from({ length: 45 }, (_, i) => ({ playerId: id, amount: 1, reason: "legacy_balance", refId: String(i), createdAt: new Date("2026-11-01T12:00:00Z") })) });
    const first = await getWallet(db, id);
    const second = await getWallet(db, id, first.nextCursor!);
    const third = await getWallet(db, id, second.nextCursor!);
    const all = [...first.transactions, ...second.transactions, ...third.transactions];
    expect(all).toHaveLength(45); expect(new Set(all.map((r) => r.id)).size).toBe(45);
    expect(third.nextCursor).toBeNull();
    expect(third.balance).toBe(45);
  });

  it("honors the rewards switch without losing stats or legacy balance", async () => {
    const id = await player(9); const before = process.env.REWARDS_ENABLED;
    try { process.env.REWARDS_ENABLED = "false"; await recordMatch(db, outcome(id)); }
    finally { if (before === undefined) delete process.env.REWARDS_ENABLED; else process.env.REWARDS_ENABLED = before; }
    expect(await walletBalance(db, id)).toBe(9);
    expect((await getProfile(db, id))?.stats[0]?.gamesPlayed).toBe(1);
  });

  it("ranks every daily player before limiting, with deterministic ties and expired-ban eligibility", async () => {
    const a = await player(); const b = await player(); const c = await player();
    const now = new Date();
    await db.player.update({ where: { id: b }, data: { bannedUntil: new Date(Date.now() - 1000) } });
    await db.player.update({ where: { id: c }, data: { bannedUntil: new Date(Date.now() + 3600_000) } });
    const gameId = `test_${randomUUID().slice(0, 8)}`;
    const rows = Array.from({ length: 505 }, (_, i) => ({ id: randomUUID(), gameId, roomCode: "TEST", visibility: "solo", playerCount: 1, config: {}, endReason: "completed", startedAt: now, endedAt: now, durationMs: 40_000 }));
    matches.push(...rows.map((row) => row.id));
    await db.match.createMany({ data: rows });
    await db.matchParticipant.createMany({ data: rows.map((row, i) => ({ matchId: row.id, playerId: i < 503 ? a : i === 503 ? b : c, displayName: "Tester", placement: 1, score: i < 503 ? 100 : 50, isWinner: true, createdAt: now })) });
    const board = await getDailyBest(db, gameId, 25, now);
    expect(board.map((row) => row.playerId)).toEqual([a, b]);
    expect(board.map((row) => row.rank)).toEqual([1, 2]);
    await db.playerGameStats.createMany({ data: [a, b, c].map((id) => ({ playerId: id, gameId, gamesPlayed: 1, bestScore: 50, totalPoints: 50 })) });
    const allTime = await getLeaderboard(db, gameId, "bestScore");
    expect(allTime.map((row) => row.playerId)).toEqual([a, b].sort());
  });
});
