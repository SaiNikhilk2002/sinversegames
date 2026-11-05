import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  getDb,
  getProfile,
  getDailyBest,
  recordMatch,
  walletBalance,
  type RecordMatchInput,
} from "@platform/db";
import {
  configSchema,
  sinverseCricket,
} from "@platform/engines/sinverse-cricket";
import { playMatch } from "../../../packages/engines/test/cricket-fixtures";

const database =
  process.env.ECONOMY_TEST_DATABASE_URL ??
  "postgresql://platform:platform@localhost:5433/sinversegames_cricket_test";
const target = new URL(database);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  !target.pathname.endsWith("_test")
)
  throw Error("Cricket tests require a loopback *_test database");
process.env.DATABASE_URL = database;
const db = getDb()!,
  players: string[] = [],
  matches: string[] = [];
async function player() {
  const id = `crtest_${randomUUID().replaceAll("-", "")}`;
  players.push(id);
  await db.player.create({
    data: { id, displayName: "Cricket QA", avatarColor: "#68d9be" },
  });
  return id;
}
function verifiedInput(id: string, seed = 5, attack = true): RecordMatchInput {
  const match = playMatch(seed, attack),
    config = configSchema.parse({});
  const verified = sinverseCricket.verify(seed, config, match.inputLog);
  if (!verified.ok) throw Error(verified.reason);
  expect(verified.result).toEqual(match.summary());
  const result = verified.result,
    matchId = randomUUID();
  matches.push(matchId);
  return {
    id: matchId,
    solo: true,
    roomCode: "SOLO",
    visibility: "solo",
    config,
    startedAt: Date.now() - result.durationMs,
    players: [{ id, name: "Cricket QA", color: "#68d9be" }],
    results: {
      gameId: "sinverse-cricket",
      reason: "completed",
      endedAt: Date.now(),
      entries: [
        {
          playerId: id,
          name: "Cricket QA",
          color: "#68d9be",
          placement: result.completed ? 1 : 2,
          score: result.score,
          isWinner: result.completed,
          details: result.details,
        },
      ],
    },
  };
}
afterAll(async () => {
  await db.player.deleteMany({ where: { id: { in: players } } });
  await db.match.deleteMany({ where: { id: { in: matches } } });
  await db.$disconnect();
});
describe("Cricket verified results in the existing platform ledger", () => {
  it("saves a genuinely simulated win, scorebook, profile, leaderboard, XP and achievements", async () => {
    const id = await player(),
      input = verifiedInput(id);
    expect(input.results.entries[0]!.details).toMatchObject({
      result: "win",
      sixes: 2,
    });
    await recordMatch(db, input);
    const stats = await db.playerGameStats.findUniqueOrThrow({
      where: { playerId_gameId: { playerId: id, gameId: "sinverse-cricket" } },
    });
    expect(stats).toMatchObject({
      gamesPlayed: 1,
      wins: 1,
      losses: 0,
      bestScore: input.results.entries[0]!.score,
    });
    const participant = await db.matchParticipant.findUniqueOrThrow({
      where: { matchId_playerId: { matchId: input.id!, playerId: id } },
    });
    expect(participant.details).toEqual(input.results.entries[0]!.details);
    expect((await getProfile(db, id))?.xp).toBe(50);
    expect(
      (await getDailyBest(db, "sinverse-cricket", 100)).some(
        (row) => row.playerId === id,
      ),
    ).toBe(true);
    expect(
      (
        await db.playerAchievement.findMany({
          where: { playerId: id, achievementKey: { startsWith: "cricket-" } },
        })
      )
        .map((a) => a.achievementKey)
        .sort(),
    ).toEqual([
      "cricket-breakthrough",
      "cricket-duel-winner",
      "cricket-first-six",
    ]);
    expect(await walletBalance(db, id)).toBeGreaterThan(0);
  });
  it("rejects duplicate result IDs atomically without paying or progressing twice", async () => {
    const id = await player(),
      input = verifiedInput(id);
    const settled = await Promise.allSettled([
      recordMatch(db, input),
      recordMatch(db, input),
    ]);
    expect(settled.filter((v) => v.status === "fulfilled")).toHaveLength(1);
    expect(
      (
        await db.playerGameStats.findUniqueOrThrow({
          where: {
            playerId_gameId: { playerId: id, gameId: "sinverse-cricket" },
          },
        })
      ).gamesPlayed,
    ).toBe(1);
    expect(
      await db.rewardLedgerEntry.count({
        where: { playerId: id, reason: "match_won" },
      }),
    ).toBe(1);
    expect((await getProfile(db, id))?.xp).toBe(50);
  });
  it("records a real tie neutrally and a loss as a loss, with no solo win coins", async () => {
    const id = await player(),
      tie = verifiedInput(id, 1, false),
      loss = verifiedInput(id, 5, false);
    expect(tie.results.entries[0]!.details?.result).toBe("tie");
    expect(loss.results.entries[0]!.details?.result).toBe("loss");
    await recordMatch(db, tie);
    await recordMatch(db, loss);
    expect(
      await db.playerGameStats.findUniqueOrThrow({
        where: {
          playerId_gameId: { playerId: id, gameId: "sinverse-cricket" },
        },
      }),
    ).toMatchObject({ gamesPlayed: 2, wins: 0, losses: 1 });
    expect(await walletBalance(db, id)).toBe(0);
    expect((await getProfile(db, id))?.xp).toBe(40);
  });
  it("retains the shared daily coin cap over distinct verified duels", async () => {
    const id = await player();
    for (let n = 0; n < 8; n++) await recordMatch(db, verifiedInput(id));
    expect(await walletBalance(db, id)).toBe(80);
    expect(await db.matchParticipant.count({ where: { playerId: id } })).toBe(
      8,
    );
    expect(
      await db.playerAchievement.count({
        where: { playerId: id, achievementKey: "cricket-first-six" },
      }),
    ).toBe(1);
  });
  it("rolls back match, stats, XP and achievements when the ledger fails", async () => {
    const id = await player(),
      input = verifiedInput(id);
    await db.$executeRawUnsafe(
      'ALTER TABLE "RewardLedgerEntry" ADD CONSTRAINT "cricket_test_abort" CHECK ("reason" <> \'match_played\') NOT VALID',
    );
    try {
      await expect(recordMatch(db, input)).rejects.toBeDefined();
      expect(await db.match.count({ where: { id: input.id } })).toBe(0);
      expect(await db.playerGameStats.count({ where: { playerId: id } })).toBe(
        0,
      );
      expect((await getProfile(db, id))?.xp).toBe(0);
      expect(
        await db.playerAchievement.count({ where: { playerId: id } }),
      ).toBe(0);
      expect(await walletBalance(db, id)).toBe(0);
    } finally {
      await db.$executeRawUnsafe(
        'ALTER TABLE "RewardLedgerEntry" DROP CONSTRAINT "cricket_test_abort"',
      );
    }
  });
});
