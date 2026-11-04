import { describe, expect, it } from "vitest";
import { CUISINES, PATHS, RECIPES, applyQuest, advanceQuest, canUnlock, cookForm, createQuest, cuisineQuest, currentStep, questHint, questLogSchema, questResult, starRating, type QuestAction, type QuestState } from "../src/cuisine-quest";

/** Plays through public coaching and real intents, with an explicit logical clock. */
export function playQuest(level: number, seed = 17) {
  const state = createQuest(seed, { level }); const log: QuestAction[] = [];
  let guard = 0;
  while (!state.finished && guard++ < 4000) {
    const o = state.orders.find(o => o.status === "waiting");
    const hint = o ? questHint(state, o.id) : null;
    const t = state.t + 160;
    const action: QuestAction = hint?.action ? { ...hint.action, t } : { kind: "wait", t };
    const result = applyQuest(state, action);
    if (!result.ok) throw new Error(`Level ${level}, ${JSON.stringify(action)}: ${result.error}`);
    log.push(action);
  }
  if (!state.finished) throw new Error("Campaign bot did not finish");
  const finish: QuestAction = { kind: "finish", t: state.t };
  expect(applyQuest(state, finish).ok).toBe(true); log.push(finish);
  return { state, log, result: questResult(state) };
}
function cooking() {
  const state = createQuest(1, { level: 1 }); let guard = 0;
  while (guard++ < 100) {
    const o = state.orders[0]!; const step = currentStep(o);
    if (step?.kind === "cook" && o.startedAt !== null && o.heat === step.heat) return state;
    const hint = questHint(state, 0); expect(hint.action).not.toBeNull();
    expect(applyQuest(state, { ...hint.action!, t: state.t + 160 }).ok).toBe(true);
  }
  throw new Error("No cooking step");
}
const clone = (s: QuestState): QuestState => JSON.parse(JSON.stringify(s));

describe("Cuisine Quest seven complete kitchens", () => {
  it.each(CUISINES)("$name completes every authored recipe with a replay-verified three-star service", ({ level, recipes }) => {
    const { state, log, result } = playQuest(level);
    expect(state.served).toBe(7); expect(state.orders.every(o => o.status === "served")).toBe(true);
    expect(state.orders.slice(0, 4).map(o => o.recipe)).toEqual(recipes);
    expect(result).toMatchObject({ completed: true, details: { level, stars: 3, perfect: 7, burnt: 0, mistakes: 0, precision: 100 } });
    expect(result.durationMs).toBeGreaterThanOrEqual(30_000); expect(result.durationMs).toBeLessThan(180_000);
    expect(result.score).toBeLessThanOrEqual(10_000); expect(result.score).toBeGreaterThanOrEqual(8500);
    expect(questLogSchema.safeParse(log).success).toBe(true);
    expect(cuisineQuest.verify(17, { level }, log)).toEqual({ ok: true, result });
  });
  it("has all 28 distinct recipes, meaningful technique differences and only relevant station definitions", () => {
    expect(RECIPES).toHaveLength(28); expect(new Set(RECIPES.map(r => r.id)).size).toBe(28);
    for (const cuisine of CUISINES) {
      expect(cuisine.recipes).toHaveLength(4);
      const recipes = RECIPES.filter(r => r.level === cuisine.level);
      expect(new Set(recipes.map(r => r.steps.map(s => s.kind === "technique" ? s.technique : s.kind === "cook" ? s.method : s.ingredient).join(","))).size).toBe(4);
      for (const r of recipes) { expect(r.steps.at(-1)).toMatchObject({ kind: "technique", technique: "plate" }); expect(r.steps.some(s => s.kind === "ingredient")).toBe(true); }
    }
    expect(new Set(RECIPES.flatMap(r => r.steps.filter(s => s.kind === "technique").map(s => s.technique))).size).toBe(Object.keys(PATHS).length);
  });
  it("keeps independent seeds reproducible while varying the final orders", () => {
    expect(createQuest(123, { level: 1 })).toEqual(createQuest(123, { level: 1 }));
    const signatures = new Set(Array.from({ length: 16 }, (_, seed) => createQuest(seed, { level: 4 }).orders.slice(4).map(o => o.recipe).join(",")));
    expect(signatures.size).toBeGreaterThan(3);
  });
});

describe("Cuisine Quest actions, time and mistakes", () => {
  it.each([[0, "cooking"], [4999, "cooking"], [5000, "perfect"], [6999, "perfect"], [7000, "overcooked"], [9999, "overcooked"], [10000, "burnt"]] as const)("cooking boundary %i is %s", (elapsed, expected) => {
    const s = cooking(); advanceQuest(s, s.t + elapsed); expect(cookForm(s.orders[0]!)).toBe(expected);
  });
  it("distinguishes raw, prepared, active, overcooked and burnt food", () => {
    const s = createQuest(1, { level: 1 }); expect(cookForm(s.orders[0]!)).toBe("unprepared");
    applyQuest(s, { kind: "ingredient", t: 0, order: 0, ingredient: "rice", portions: 1 }); expect(cookForm(s.orders[0]!)).toBe("prepared");
    const cook = cooking(); advanceQuest(cook, cook.t + 10_000); expect(cook.burnt).toBe(1); advanceQuest(cook, cook.t + 5000); expect(cook.burnt).toBe(1);
    expect(applyQuest(cook, { kind: "restart", order: 0, t: cook.t }).ok).toBe(true); expect(cookForm(cook.orders[0]!)).toBe("unprepared"); expect(cook.burnt).toBe(1);
  });
  it("integrates heat identically across different rendering intervals", () => {
    const a = cooking(); const b = clone(a); const end = a.t + 11_200;
    advanceQuest(a, end); while (b.t < end) advanceQuest(b, Math.min(end, b.t + 37));
    expect(b).toEqual(a);
  });
  it("records recoverable wrong ingredients/portions and corrects them without accepting a score", () => {
    const s = createQuest(1, { level: 5 }); const first = currentStep(s.orders[0]!)!;
    expect(first).toMatchObject({ kind: "ingredient", portions: 2 });
    expect(applyQuest(s, { kind: "ingredient", t: 1, order: 0, ingredient: "rice", portions: 1 }).ok).toBe(true);
    expect(s.mistakes).toBe(1); expect(s.orders[0]!.step).toBe(0);
    const hint = questHint(s, 0); expect(applyQuest(s, { ...hint.action!, t: 2 }).ok).toBe(true); expect(s.orders[0]!.step).toBe(1);
    expect(questLogSchema.safeParse([{ ...hint.action, t: 3, score: 99999 }]).success).toBe(false);
  });
  it("rejects impossible actions, queued guests, premature serving and premature finish", () => {
    const s = createQuest(1, { level: 1 });
    for (const action of [{ kind: "serve", order: 0, garnish: "herbs", t: 0 }, { kind: "lift", order: 0, t: 0 }, { kind: "begin", order: 0, t: 0 }, { kind: "ingredient", order: 4, ingredient: "rice", portions: 1, t: 0 }, { kind: "finish", t: 0 }] as QuestAction[]) expect(applyQuest(s, action).ok).toBe(false);
  });
  it("enforces gesture order, geometry and movement spacing", () => {
    const s = createQuest(1, { level: 1 });
    while (currentStep(s.orders[0]!)?.kind === "ingredient") applyQuest(s, { ...questHint(s, 0).action!, t: s.t + 160 });
    applyQuest(s, { kind: "begin", order: 0, t: s.t });
    expect(applyQuest(s, { kind: "gesture", order: 0, node: 3, x: 0, y: 0, t: s.t }).ok).toBe(true);
    expect(s.mistakes).toBe(1); expect(s.orders[0]!.node).toBe(0);
    expect(applyQuest(s, { ...questHint(s, 0).action!, t: s.t + 1 }).ok).toBe(false);
    expect(applyQuest(s, { ...questHint(s, 0).action!, t: s.t + 160 }).ok).toBe(true); expect(s.orders[0]!.node).toBe(1);
  });
  it("penalizes an early flip and missing technique work while keeping the batch recoverable", () => {
    const s = cooking(); expect(applyQuest(s, { kind: "flip", order: 0, t: s.t + 100 }).ok).toBe(true); expect(s.mistakes).toBe(1);
    expect(applyQuest(s, { kind: "lift", order: 0, t: s.t + 100 }).ok).toBe(false);
    advanceQuest(s, s.orders[0]!.startedAt! + 5000); expect(applyQuest(s, { kind: "lift", order: 0, t: s.t }).ok).toBe(true);
    expect(s.orders[0]!.cookQuality).toBeLessThan(100);
  });
  it("starts queued patience only after seating and finishes unattended shifts with no free score", () => {
    const s = createQuest(1, { level: 1 }); advanceQuest(s, 154_999); expect(s.orders[3]!.arrivedAt).toBeNull();
    advanceQuest(s, 155_000); expect(s.orders[0]!.status).toBe("left"); expect(s.orders[3]!.arrivedAt).toBe(155_000);
    advanceQuest(s, 540_000); expect(s.finished).toBe(true); expect(questResult(s)).toMatchObject({ score: 0, completed: false, details: { stars: 0, served: 0 } });
    expect(cuisineQuest.verify(1, { level: 1 }, [{kind:"wait",t:540000},{kind:"finish",t:540000}])).toMatchObject({ok:true,result:{score:0,completed:false}});
  });
  it("requires two separately cooked plates for a large order and a different finish for special requests", () => {
    const { state } = playQuest(5);
    expect(state.orders[3]).toMatchObject({ type: "large", wanted: 2, delivered: 2 });
    expect(state.orders[4]!.garnish).not.toBe(CUISINES[4]!.garnish); expect(state.served).toBe(7);
  });
  it("limits active batches and excludes concurrent work at the same station", () => {
    const s = createQuest(1, { level: 1 });
    const ingredients = (order: number) => {
      while (currentStep(s.orders[order]!)?.kind === "ingredient") expect(applyQuest(s, { ...questHint(s, order).action!, t: s.t + 160 }).ok).toBe(true);
    };
    ingredients(0); expect(applyQuest(s, { kind: "begin", order: 0, t: s.t }).ok).toBe(true);
    advanceQuest(s, 14_000); ingredients(1);
    expect(applyQuest(s, { kind: "begin", order: 1, t: s.t }).ok).toBe(true);
    // Paneer can be cut on the board while dosa batter occupies the mixer.
    while (currentStep(s.orders[1]!)?.kind === "technique" && s.orders[1]!.startedAt !== null) expect(applyQuest(s, { ...questHint(s, 1).action!, t: s.t + 160 }).ok).toBe(true);
    expect(currentStep(s.orders[1]!)).toMatchObject({ technique: "marinate", station: "mixer" });
    expect(applyQuest(s, { kind: "begin", order: 1, t: s.t })).toMatchObject({ ok: false, error: expect.stringContaining("Station busy") });
    advanceQuest(s, 28_000);
    expect(applyQuest(s, { ...questHint(s, 2).action!, t: s.t })).toMatchObject({ ok: false, error: expect.stringContaining("Two batches") });
    while (s.orders[0]!.startedAt !== null) expect(applyQuest(s, { ...questHint(s, 0).action!, t: s.t + 160 }).ok).toBe(true);
    expect(applyQuest(s, { kind: "begin", order: 1, t: s.t }).ok).toBe(true);
    expect(applyQuest(s, { kind: "restart", order: 0, t: s.t }).ok).toBe(true);
    expect(applyQuest(s, { ...questHint(s, 2).action!, t: s.t }).ok).toBe(true);
  });
  it("keeps plated food recoverable after delivery to the wrong guest or with the wrong finish", () => {
    const s = createQuest(1, { level: 1 }); let guard = 0;
    while (currentStep(s.orders[0]!) && guard++ < 500) {
      const action = questHint(s, 0).action;
      expect(applyQuest(s, action ? { ...action, t: s.t + 160 } : { kind: "wait", t: s.t + 160 }).ok).toBe(true);
    }
    expect(currentStep(s.orders[0]!)).toBeUndefined();
    expect(applyQuest(s, { kind: "serve", order: 0, recipient: 1, garnish: "herbs", t: s.t }).ok).toBe(true);
    expect(applyQuest(s, { kind: "serve", order: 0, recipient: 0, garnish: "lemon", t: s.t }).ok).toBe(true);
    expect(s.served).toBe(0); expect(s.mistakes).toBe(2); expect(s.orders[0]!.batchActive).toBe(true);
    expect(applyQuest(s, { kind: "serve", order: 0, recipient: 0, garnish: s.orders[0]!.garnish, t: s.t }).ok).toBe(true);
    expect(s.served).toBe(1); expect(s.orders[0]!.status).toBe("served"); expect(s.qualitySum).toBe(90);
  });
  it("rejects malformed, out-of-order, oversized and incomplete replays", () => {
    expect(cuisineQuest.verify(1, { level: 1 }, [{ kind: "finish", t: 0 }]).ok).toBe(false);
    expect(cuisineQuest.verify(1, { level: 1 }, [{ kind: "wait", t: 1000 }, { kind: "wait", t: 500 }]).ok).toBe(false);
    expect(cuisineQuest.verify(1, { level: 1 }, [{ kind: "wait", t: 1000 }]).ok).toBe(false);
    for (const input of [null, [], [{ kind: "wait", t: -1 }], [{ kind: "heat", order: 0, t: 10, value: 99 }], Array.from({ length: 3001 }, () => ({ kind: "wait", t: 1 }))]) expect(questLogSchema.safeParse(input).success).toBe(false);
  });
});

describe("Cuisine Quest fair stars and unlocks", () => {
  it.each([[5199, 7, 100, 0], [5200, 5, 100, 1], [6999, 6, 100, 1], [7000, 6, 100, 2], [8499, 7, 100, 2], [8500, 7, 85, 3], [8500, 7, 84, 2], [10000, 4, 100, 0]])("score %i, served %i, precision %i => %i stars", (score, served, precision, stars) => expect(starRating(true, served!, 7, score!, precision!)).toBe(stars));
  it("never unlocks from missing preceding progress or a failed first shift", () => {
    expect(canUnlock(1, [])).toBe(true); expect(canUnlock(2, [0])).toBe(false); expect(canUnlock(2, [1])).toBe(true);
    expect(canUnlock(7, [3, 3, 3, 0, 3, 3])).toBe(false); expect(canUnlock(7, [1, 1, 1, 1, 1, 1])).toBe(true);
    expect(starRating(false, 7, 7, 10000, 100)).toBe(0);
  });
});
