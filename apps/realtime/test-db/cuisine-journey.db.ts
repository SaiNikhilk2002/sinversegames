import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { applyQuest, createQuest, questHint, questResult, summariseJourney, type QuestAction } from "@platform/engines/cuisine-quest";
import { getCuisineCampaign, getCuisineRunDetails, getDb, recordMatch, walletBalance, type RecordMatchInput } from "@platform/db";

const database = process.env.ECONOMY_TEST_DATABASE_URL ?? "postgresql://platform:platform@localhost:5433/sinversegames_cuisine_test";
const target = new URL(database);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || !target.pathname.endsWith("_test")) throw new Error("Cuisine tests require a loopback *_test database.");
process.env.DATABASE_URL = database;
const db = getDb()!; const players: string[] = []; const matches: string[] = [];
async function player() { const id = `cqjourney_${randomUUID().replaceAll("-", "")}`; players.push(id); await db.player.create({ data: { id, displayName: "Journey tester", avatarColor: "#6fa67e" } }); return id; }

/** A verified shift, optionally with a mistake and a deliberately slow first pass. */
function shift(level: number, opts: { mistake?: boolean; idleFirst?: number } = {}) {
  const state = createQuest(17, { level });
  if (opts.mistake) applyQuest(state, { kind: "ingredient", order: 0, ingredient: "not-an-ingredient", portions: 1, t: 0 });
  if (opts.idleFirst) applyQuest(state, { kind: "wait", t: opts.idleFirst });
  let guard = 0;
  while (!state.finished && guard++ < 4000) {
    const order = state.orders.find((o) => o.status === "waiting"); const hint = order ? questHint(state, order.id) : null;
    const action: QuestAction = hint?.action ? { ...hint.action, t: state.t + 160 } : { kind: "wait", t: state.t + 160 };
    if (!applyQuest(state, action).ok) throw new Error("Bot action rejected");
  }
  applyQuest(state, { kind: "finish", t: state.t });
  return questResult(state);
}
function input(id: string, result: ReturnType<typeof shift>, gameId: RecordMatchInput["results"]["gameId"] = "cuisine-quest"): RecordMatchInput {
  const match = randomUUID(); matches.push(match);
  return { id: match, solo: true, roomCode: "SOLO", visibility: "solo", config: { level: Number(result.details.level) }, startedAt: Date.now() - result.durationMs, players: [{ id, name: "Journey tester", color: "#6fa67e" }], results: { gameId, reason: "completed", endedAt: Date.now(), entries: [{ playerId: id, name: "Journey tester", color: "#6fa67e", placement: 1, score: result.score, isWinner: result.completed, details: result.details }] } };
}
afterAll(async () => { await db.player.deleteMany({ where: { id: { in: players } } }); await db.match.deleteMany({ where: { id: { in: matches } } }); await db.$disconnect(); });

describe("Chef's Journey from saved runs", () => {
  it("earns seals and mastery from saved runs, with no change to the campaign or coins", async () => {
    const id = await player();
    expect(summariseJourney(await getCuisineRunDetails(db, id))).toEqual({ seals: {}, sealCount: 0, recipes: {} });
    await recordMatch(db, input(id, shift(1)));
    const first = summariseJourney(await getCuisineRunDetails(db, id));
    expect(first.sealCount).toBe(3);
    expect(Object.values(first.recipes).reduce((n, r) => n + r.plates, 0)).toBe(7);
    const coins = await walletBalance(db, id);
    const before = await getCuisineCampaign(db, id);
    const details = await getCuisineRunDetails(db, id);
    expect(summariseJourney(details)).toEqual(first);
    expect(await walletBalance(db, id)).toBe(coins);
    expect(await getCuisineCampaign(db, id)).toEqual(before);
  });
  it("keeps a seal after later, worse runs", async () => {
    const id = await player();
    await recordMatch(db, input(id, shift(1)));
    await recordMatch(db, input(id, shift(1, { mistake: true })));
    expect(summariseJourney(await getCuisineRunDetails(db, id)).seals[1]).toContain("spotless");
  });
  it("counts only that player's completed Cuisine Quest runs", async () => {
    const a = await player(), b = await player();
    await recordMatch(db, input(a, shift(1)));
    expect(await getCuisineRunDetails(db, b)).toEqual([]);
    await recordMatch(db, input(b, { ...shift(1), score: 100 }, "kitchen-rush"));
    expect(await getCuisineRunDetails(db, b)).toEqual([]);
    const failed = shift(1, { idleFirst: 540_000 });
    expect(failed.completed).toBe(false);
    await recordMatch(db, input(b, failed));
    expect(await getCuisineRunDetails(db, b)).toEqual([]);
  });
  it("still credits a run saved before these details existed", async () => {
    const id = await player();
    const old = shift(1);
    const { dishes: _dishes, serviceScore: _s, craftScore: _c, welcomeScore: _w, accuracyScore: _a, ...legacy } = old.details;
    await recordMatch(db, input(id, { ...old, details: legacy }));
    const summary = summariseJourney(await getCuisineRunDetails(db, id));
    expect(summary.sealCount).toBe(3); expect(summary.recipes).toEqual({});
  });
  it("honours the row limit, newest first", async () => {
    const id = await player();
    await recordMatch(db, input(id, shift(1)));
    await recordMatch(db, input(id, shift(1, { mistake: true })));
    const newest = await getCuisineRunDetails(db, id, 1);
    expect(newest).toHaveLength(1);
    expect((newest[0] as { mistakes: number }).mistakes).toBe(1);
  });
});
