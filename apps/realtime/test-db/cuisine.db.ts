import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { applyQuest, createQuest, cuisineQuest, questHint, questResult, type QuestAction } from "@platform/engines/cuisine-quest";
import { getCuisineCampaign, getCuisineLeaderboard, getCuisineReceipt, getDailyBest, getDb, getProfile, recordMatch, walletBalance, type RecordMatchInput } from "@platform/db";

const database = process.env.ECONOMY_TEST_DATABASE_URL ?? "postgresql://platform:platform@localhost:5433/sinversegames_cuisine_test";
const target = new URL(database);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || !target.pathname.endsWith("_test")) throw new Error("Cuisine tests require a loopback *_test database.");
process.env.DATABASE_URL = database;
const db = getDb()!; const players: string[] = []; const matches: string[] = [];
async function player() { const id = `cqtest_${randomUUID().replaceAll("-", "")}`; players.push(id); await db.player.create({ data: { id, displayName: "Cuisine tester", avatarColor: "#6fa67e" } }); return id; }
function verified(level: number, mistake = false, fail = false) {
  const state = createQuest(17, { level }); const log: QuestAction[] = [];
  if (mistake) { const action: QuestAction = { kind: "ingredient", order: 0, ingredient: "wrong-ingredient", portions: 1, t: 0 }; applyQuest(state, action); log.push(action); }
  if (fail) { const action: QuestAction = { kind: "wait", t: 540000 }; applyQuest(state, action); log.push(action); }
  let guard = 0;
  while (!state.finished && guard++ < 4000) {
    const order = state.orders.find(order => order.status === "waiting"); const hint = order ? questHint(state, order.id) : null;
    const action: QuestAction = hint?.action ? { ...hint.action, t: state.t+160 } : { kind: "wait", t: state.t+160 };
    const result = applyQuest(state, action); if (!result.ok) throw new Error(result.error); log.push(action);
  }
  const finish: QuestAction = { kind: "finish", t: Math.max(state.t, log.at(-1)?.t ?? 0) }; applyQuest(state, finish); log.push(finish);
  const checked = cuisineQuest.verify(17, { level }, log); if (!checked.ok) throw new Error(checked.reason);
  expect(checked.result).toEqual(questResult(state)); return checked.result;
}
function outcome(id: string, level = 1, mistake = false, fail = false): RecordMatchInput {
  const result = verified(level, mistake, fail); const match = randomUUID(); matches.push(match);
  return { id: match, solo: true, roomCode: "SOLO", visibility: "solo", config: { level }, startedAt: Date.now()-result.durationMs, players: [{ id, name: "Cuisine tester", color: "#6fa67e" }], results: { gameId: "cuisine-quest", reason: "completed", endedAt: Date.now(), entries: [{ playerId: id, name: "Cuisine tester", color: "#6fa67e", placement: 1, score: result.score, isWinner: result.completed, details: result.details }] } };
}
afterAll(async () => { await db.player.deleteMany({ where: { id: { in: players } } }); await db.match.deleteMany({ where: { id: { in: matches } } }); await db.$disconnect(); });

describe("Cuisine Quest verified campaign and shared economy", () => {
  it("saves all seven verified cuisines, 21 stars, mastery, history, achievements and capped coins", async () => {
    const id = await player(); expect((await getCuisineCampaign(db,id)).levels.map(level=>level.unlocked)).toEqual([true,false,false,false,false,false,false]);
    for (let level = 1; level <= 7; level++) {
      const input = outcome(id,level); await recordMatch(db,input);
      const campaign = await getCuisineCampaign(db,id); expect(campaign.completed).toBe(level); expect(campaign.totalStars).toBe(level*3);
      if (level < 7) expect(campaign.levels[level]!.unlocked).toBe(true);
      expect((await getCuisineReceipt(db,id,input.id!))?.details).toMatchObject({ level, stars:3, cuisinesCompleted:level });
    }
    const campaign = await getCuisineCampaign(db,id); expect(campaign).toMatchObject({ completed:7, mastered:7, totalStars:21 });
    expect(await walletBalance(db,id)).toBe(80);
    const profile = await getProfile(db,id); expect(profile?.cuisineRuns).toHaveLength(6); expect(profile?.cuisineProgress).toHaveLength(7);
    expect(profile?.achievements.filter(row=>row.achievementKey.startsWith("cq-"))).toHaveLength(13);
    expect(profile?.achievements.some(row=>row.achievementKey === "cq-world-chef")).toBe(true);
    expect(profile?.xp).toBe(350);
  });
  it("does not repeat cuisine completion/win coins or one-time achievements on replays", async () => {
    const id = await player(); const first = outcome(id); await recordMatch(db,first); const balance = await walletBalance(db,id);
    const replay = outcome(id); const saved = await recordMatch(db,replay); expect(saved?.earned[id] ?? 0).toBe(0);
    expect(await walletBalance(db,id)).toBe(balance);
    expect((await getCuisineCampaign(db,id)).levels[0]).toMatchObject({ stars:3,completedRuns:2 });
    expect(await db.rewardLedgerEntry.count({ where:{ playerId:id,reason:"match_played" } })).toBe(1);
    expect(await db.rewardLedgerEntry.count({ where:{ playerId:id,reason:"match_won" } })).toBe(1);
    expect((await getCuisineReceipt(db,id,first.id!))?.earnedCoins).toBe(balance);
    expect((await getCuisineReceipt(db,id,replay.id!))?.earnedCoins).toBe(0);
  });
  it("serializes simultaneous first completions and rejects repeated run IDs without changing progress", async () => {
    const id = await player(); const a = outcome(id), b = outcome(id);
    await Promise.all([recordMatch(db,a),recordMatch(db,b)]);
    const receipts = await Promise.all([getCuisineReceipt(db,id,a.id!),getCuisineReceipt(db,id,b.id!)]);
    expect(receipts.map(r=>r!.earnedCoins).sort((a,b)=>a-b)).toEqual([0,52]);
    await expect(recordMatch(db,a)).rejects.toMatchObject({ code:"P2002" });
    expect(await walletBalance(db,id)).toBe(52); expect((await getCuisineCampaign(db,id)).levels[0]!.completedRuns).toBe(2);
    expect((await getProfile(db,id))?.xp).toBe(100);
  });
  it("rejects skipping earlier cuisines and rolls back the attempted result", async () => {
    const id = await player(); const input = outcome(id,7);
    await expect(recordMatch(db,input)).rejects.toThrow("Complete the preceding cuisines first");
    expect(await db.match.count({where:{id:input.id}})).toBe(0); expect((await getCuisineCampaign(db,id)).completed).toBe(0); expect(await walletBalance(db,id)).toBe(0);
  });
  it("records failed shifts without unlocking cuisines or earning coins", async () => {
    const id = await player(); await recordMatch(db,outcome(id,1,false,true));
    expect((await getCuisineCampaign(db,id)).levels[1]!.unlocked).toBe(false); expect(await walletBalance(db,id)).toBe(0);
    expect(await db.playerAchievement.count({where:{playerId:id,achievementKey:{startsWith:"cq-"}}})).toBe(0);
  });
  it("improves a per-cuisine record, rewards a genuine PB once and never loses previously earned stars", async () => {
    const id = await player(); await recordMatch(db,outcome(id,1,true)); const before = await walletBalance(db,id);
    const clean = outcome(id); await recordMatch(db,clean); expect(await walletBalance(db,id)).toBe(before+8);
    expect(await db.rewardLedgerEntry.count({where:{playerId:id,reason:"personal_best"}})).toBe(1);
    await recordMatch(db,outcome(id,1,false,true));
    expect((await getCuisineCampaign(db,id)).levels[0]).toMatchObject({stars:3,bestScore:clean.results.entries[0]!.score,completedRuns:2});
  });
  it("isolates private receipts and removes award metadata from public daily rankings", async () => {
    const id = await player(), other = await player(); const input = outcome(id); await recordMatch(db,input);
    expect(await getCuisineReceipt(db,other,input.id!)).toBeNull(); expect((await getCuisineCampaign(db,other)).totalStars).toBe(0);
    const board = await getDailyBest(db,"cuisine-quest",100); const row = board.find(row=>row.playerId===id)!;
    expect(row.details.stars).toBe(3); expect(row.details).not.toHaveProperty("coinsEarned"); expect(row.details).not.toHaveProperty("unlockedKeys");
    expect((await getCuisineLeaderboard(db,1)).some(row=>row.score===input.results.entries[0]!.score)).toBe(true);
  });
  it("enforces database level/star/score constraints", async () => {
    const id = await player();
    for (const data of [{playerId:id,level:8},{playerId:id,level:1,stars:4},{playerId:id,level:1,bestScore:10001}]) await expect(db.cuisineProgress.create({data})).rejects.toBeDefined();
    expect(await db.cuisineProgress.count({where:{playerId:id}})).toBe(0);
  });
  it("rolls progress, match, stats, XP, achievements and coins back together on a late ledger failure", async () => {
    const id = await player(); const input = outcome(id);
    await db.$executeRawUnsafe('ALTER TABLE "RewardLedgerEntry" ADD CONSTRAINT "cuisine_test_abort" CHECK ("reason" <> \'match_played\') NOT VALID');
    try {
      await expect(recordMatch(db,input)).rejects.toBeDefined();
      expect((await getCuisineCampaign(db,id)).completed).toBe(0); expect(await getCuisineReceipt(db,id,input.id!)).toBeNull();
      expect((await getProfile(db,id))?.xp).toBe(0); expect(await walletBalance(db,id)).toBe(0); expect(await db.playerAchievement.count({where:{playerId:id}})).toBe(0);
    } finally { await db.$executeRawUnsafe('ALTER TABLE "RewardLedgerEntry" DROP CONSTRAINT "cuisine_test_abort"'); }
  });
});
