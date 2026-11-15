import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getDb, recordMatch, walletBalance } from "@platform/db";
import { sameWavelengthEngine as engine } from "@platform/engines/same-wavelength";
import { seededRng } from "@platform/engines";
import { promptById } from "../../../packages/engines/src/same-wavelength/prompts";

/**
 * Same Wavelength results in real PostgreSQL (docs/SAME_WAVELENGTH_DESIGN.md): a cooperative,
 * neutral result (no wins, no losses), aggregates only (no answers stored), the shared coin rules
 * and the two new achievements. Existing tables and rows are only added to.
 */
const database = process.env.ECONOMY_TEST_DATABASE_URL ?? "postgresql://platform:platform@localhost:5433/sinversegames_expansion_test";
const target = new URL(database);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || !target.pathname.endsWith("_test")) throw Error("These tests require a loopback *_test database");
process.env.DATABASE_URL = database;
const db = getDb()!;
const players: string[] = [];
const matches: string[] = [];
afterAll(async () => {
  await db.player.deleteMany({ where: { id: { in: players } } });
  await db.match.deleteMany({ where: { id: { in: matches } } });
  await db.$disconnect();
});

async function player(name: string) {
  const id = `swtest_${randomUUID().replaceAll("-", "")}`;
  players.push(id);
  await db.player.create({ data: { id, displayName: name, avatarColor: "#ff7a9c" } });
  return { id, name, color: "#ff7a9c" };
}

/** Plays a whole Couples game where both always give the same answer (or always differ). */
function playGame(ps: { id: string; name: string; color: string }[], agree: boolean) {
  const rng = seededRng(11);
  let now = 1_000_000;
  const s = engine.create(ps, engine.configSchema.parse({ mode: "couples", rounds: 5, textAnswers: true }), { now, rng }).state;
  now = engine.nextDeadline(s)!;
  engine.tick(s, { now, rng });
  for (let r = 1; r <= 5; r++) {
    const prompt = promptById.get(s.current!.promptId)!;
    ps.forEach((p, k) => {
      const pick = agree ? 0 : k;
      const payload = prompt.kind === "text" ? { text: agree ? "pizza" : ["pizza", "sushi"][k] } : prompt.kind === "who" ? { player: ps[pick]!.id } : { option: prompt.options![pick]!.id };
      const res = engine.handleAction(s, p.id, engine.actionSchema.parse({ type: "wave:answer", round: r, ...payload }), { now: now + 500, rng });
      if (!res.ok) throw Error(res.message);
    });
    now = engine.nextDeadline(s)!;
    engine.tick(s, { now, rng });
  }
  expect(engine.isFinished(s)).toBe(true);
  return engine.results(s);
}

async function record(ps: { id: string; name: string; color: string }[], results: ReturnType<typeof playGame>) {
  const id = randomUUID();
  matches.push(id);
  return recordMatch(db, { id, roomCode: "WAVE01", visibility: "private", config: { mode: "couples" }, startedAt: Date.now() - 120_000, players: ps, results: { ...results, endedAt: Date.now() } });
}

describe("Same Wavelength results in the platform database", () => {
  it("records a shared, neutral result with aggregates only, and the base reward", async () => {
    const a = await player("Asha"), b = await player("Ben");
    const before = await walletBalance(db, a.id);
    const results = playGame([a, b], true);
    const saved = await record([a, b], results);
    expect(saved).toBeTruthy();
    for (const p of [a, b]) {
      const stats = await db.playerGameStats.findUniqueOrThrow({ where: { playerId_gameId: { playerId: p.id, gameId: "same-wavelength" } } });
      expect(stats).toMatchObject({ gamesPlayed: 1, wins: 0, losses: 0 });
    }
    const rows = await db.matchParticipant.findMany({ where: { playerId: { in: [a.id, b.id] } } });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.details).toMatchObject({ result: "shared", mode: "couples", rounds: 5, matchPct: 100, perfectRounds: 5 });
      // No answers in the stored match: no typed text, no option labels.
      expect(JSON.stringify(row.details)).not.toMatch(/pizza|sushi/);
    }
    // Played, positive score, over 30 seconds: the shared base reward for a completed match (not a win).
    expect((await walletBalance(db, a.id)) - before).toBeGreaterThan(0);
    // 100% over 5 rounds unlocks "Same brain energy".
    const unlocked = await db.playerAchievement.findMany({ where: { playerId: a.id } });
    expect(unlocked.map((u) => u.achievementKey)).toContain("same-brain");
  });

  it("a mostly different game is still played, neutral and without the 80% achievement", async () => {
    const a = await player("Chen"), b = await player("Dev");
    const results = playGame([a, b], false);
    await record([a, b], results);
    const stats = await db.playerGameStats.findUniqueOrThrow({ where: { playerId_gameId: { playerId: a.id, gameId: "same-wavelength" } } });
    expect(stats).toMatchObject({ gamesPlayed: 1, wins: 0, losses: 0 });
    const keys = (await db.playerAchievement.findMany({ where: { playerId: a.id } })).map((u) => u.achievementKey);
    expect(keys).not.toContain("same-brain");
    expect(keys).toContain("first-match");
  });

  it("refuses a duplicate result id atomically", async () => {
    const a = await player("Ema"), b = await player("Finn");
    const results = playGame([a, b], true);
    const id = randomUUID();
    matches.push(id);
    const input = { id, roomCode: "WAVE02", visibility: "private", config: {}, startedAt: Date.now() - 60_000, players: [a, b], results: { ...results, endedAt: Date.now() } };
    await recordMatch(db, input);
    const balance = await walletBalance(db, a.id);
    await expect(recordMatch(db, input)).rejects.toMatchObject({ code: "P2002" });
    expect(await walletBalance(db, a.id)).toBe(balance);
    const stats = await db.playerGameStats.findUniqueOrThrow({ where: { playerId_gameId: { playerId: a.id, gameId: "same-wavelength" } } });
    expect(stats.gamesPlayed).toBe(1);
  });
});
