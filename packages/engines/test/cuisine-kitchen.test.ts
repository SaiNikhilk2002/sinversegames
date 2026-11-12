import { describe, expect, it } from "vitest";
import { chefRank, CHEF_RANKS } from "@platform/shared";
import { advanceQuest, applyQuest, byRecipe, challengesFor, CUISINES, decodeDishes, encodeDishes, createShift, evaluateChallenges, INGREDIENTS, masteryTier, MAX_SHIFT_MS, pantryFor, questHint, RECIPES, scoreShift, summariseJourney, TOTAL_SEALS, type QuestAction, type ShiftPlan } from "../src/cuisine-quest";
import { playBot, type BotProfile } from "./helpers/quest-bot";

const plan = (over: Partial<ShiftPlan["rules"]> = {}, orders = 2): ShiftPlan => ({
  level: 1, seed: 5, intro: "Test shift",
  rules: { openingOrders: orders, seats: 3, batches: 2, limitMs: null, ...over },
  orders: Array.from({ length: orders }, (_, i) => ({ recipe: i % 2 ? "butter-naan" : "masala-dosa", type: "regular" as const, garnish: "herbs" as const, arrivesAt: i * 1000, patienceMs: 60_000, wanted: 1 })),
});
/** Cooks one order to completion through coaching, without serving other tickets. */
function cookOrder(s: ReturnType<typeof createShift>, id: number) {
  let guard = 0;
  while (s.orders[id]!.status === "waiting" && guard++ < 400) {
    const action = questHint(s, id).action;
    const sent: QuestAction = action ? { ...action, t: s.t + 160 } : { kind: "wait", t: s.t + 160 };
    expect(applyQuest(s, sent).ok).toBe(true);
  }
}

describe("Kitchen shift plans", () => {
  it("gives every player identical conditions from one plan, without sharing state", () => {
    const shared = plan();
    const a = createShift(shared), b = createShift(shared);
    expect(a).toEqual(b);
    applyQuest(a, { kind: "ingredient", order: 0, ingredient: "rice", portions: 1, t: 10 });
    expect(a.orders[0]!.step).toBe(1); expect(b.orders[0]!.step).toBe(0);
    expect(createShift(shared)).toEqual(b);
    expect(shared.orders[0]).not.toHaveProperty("step");
  });
  it("two players' identical actions always reach identical results", () => {
    const a = createShift(plan()), b = createShift(plan());
    cookOrder(a, 0); cookOrder(b, 0);
    expect(a).toEqual(b); expect(scoreShift(a)).toEqual(scoreShift(b));
  });
  it.each([
    ["no orders", { ...plan(), orders: [] }],
    ["too many orders", { ...plan({ openingOrders: 1 }), orders: Array(7).fill(plan().orders[0]) }],
    ["an unknown recipe", { ...plan(), orders: [{ ...plan().orders[0]!, recipe: "mystery-stew" }] }],
    ["no seats", plan({ seats: 0 })],
    ["no batches", plan({ batches: 0 })],
    ["opening orders beyond the list", plan({ openingOrders: 3 })],
    ["a limit beyond the shift bound", plan({ limitMs: MAX_SHIFT_MS + 1 })],
    ["a fractional limit", plan({ limitMs: 10.5 })],
    ["a guest wanting nothing", { ...plan(), orders: [{ ...plan().orders[0]!, wanted: 0 }] }],
  ] as [string, ShiftPlan][])("refuses a plan with %s", (_name, bad) => expect(() => createShift(bad)).toThrow());
  it("honours the batch limit, with a clear message", () => {
    const s = createShift(plan({ batches: 1 }));
    advanceQuest(s, 1000);
    expect(applyQuest(s, { kind: "ingredient", order: 0, ingredient: "rice", portions: 1, t: 1000 }).ok).toBe(true);
    expect(applyQuest(s, { kind: "ingredient", order: 1, ingredient: "flour", portions: 1, t: 1000 })).toEqual({ ok: false, error: "A batch is active. Finish one before opening another." });
  });
  it("honours the seat limit: a queued guest waits, with patience not yet running", () => {
    const s = createShift(plan({ seats: 1 }));
    advanceQuest(s, 5000);
    expect(s.orders[1]).toMatchObject({ status: "queued", arrivedAt: null });
    cookOrder(s, 0);
    expect(s.orders[0]!.status).toBe("served"); expect(s.orders[1]!.status).toBe("waiting");
    expect(s.orders[1]!.arrivedAt).toBe(s.orders[0]!.resolvedAt);
  });
  it("releases held guests when the last opening order resolves, and supports having none", () => {
    const held = plan({ openingOrders: 1 });
    held.orders[1]!.arrivesAt = null;
    const s = createShift(held);
    advanceQuest(s, 30_000); expect(s.orders[1]!.status).toBe("queued");
    cookOrder(s, 0); expect(s.orders[1]!.status).toBe("waiting");
    const none = createShift(plan({ openingOrders: 2 }));
    cookOrder(none, 0); cookOrder(none, 1);
    expect(none).toMatchObject({ finished: true, served: 2, missed: 0 });
  });
});

describe("Kitchen time limit", () => {
  it("stops exactly at the deadline however far time is advanced, with no free score", () => {
    const s = createShift(plan({ limitMs: 30_000 }));
    advanceQuest(s, 200_000);
    expect(s).toMatchObject({ finished: true, finishedAt: 30_000, t: 30_000, served: 0, missed: 2 });
    expect(s.orders.map(o => o.status)).toEqual(["left", "left"]);
    expect(scoreShift(s).score).toBe(0);
  });
  it("counts guests who never arrived as missed, once each", () => {
    const held = plan({ openingOrders: 1, limitMs: 500 });
    held.orders[1] = { ...held.orders[1]!, arrivesAt: null, wanted: 2 };
    const s = createShift(held);
    advanceQuest(s, 500);
    expect(s.missed).toBe(3);
  });
  it("does not double-count a guest whose patience ends on the deadline", () => {
    const tied = plan({ limitMs: 60_000 });
    const s = createShift(tied);
    advanceQuest(s, 60_000);
    expect(s.missed).toBe(2); expect(s.orders[0]!.resolvedAt).toBe(60_000);
  });
  it("refuses actions after the deadline but keeps earlier work, and can then be sealed", () => {
    const patient = plan({ limitMs: 90_000 });
    patient.orders = patient.orders.map(order => ({ ...order, patienceMs: 200_000 }));
    const s = createShift(patient);
    cookOrder(s, 0);
    expect(s.served).toBe(1);
    expect(applyQuest(s, { kind: "ingredient", order: 1, ingredient: "flour", portions: 1, t: 90_001 })).toEqual({ ok: false, error: "The shift has finished" });
    expect(s).toMatchObject({ served: 1, missed: 1, t: 90_000 });
    expect(scoreShift(s).score).toBeGreaterThan(0);
    expect(applyQuest(s, { kind: "finish", t: 90_001 }).ok).toBe(true);
    expect(applyQuest(s, { kind: "wait", t: 90_002 }).ok).toBe(false);
  });
  it("stops cooking at the deadline, whatever later clock value arrives", () => {
    const a = createShift(plan({ limitMs: 20_000 })), b = createShift(plan({ limitMs: 20_000 }));
    for (const s of [a, b]) {
      for (const ingredient of ["rice", "lentils", "potato", "spice"]) applyQuest(s, { kind: "ingredient", order: 0, ingredient, portions: 1, t: s.t });
    }
    advanceQuest(a, 20_000); advanceQuest(b, 500_000);
    expect(b).toEqual(a);
  });
  it("a campaign shift has no limit", () => expect(playBot(1, 1, "clean").state.rules.limitMs).toBeNull());
});

describe("Score breakdown", () => {
  const profiles: BotProfile[] = ["clean", "human", "messy"];
  it.each(profiles)("the four parts always add up to the score for %s play", (profile) => {
    for (const { level } of CUISINES) for (const seed of [1, 17, 123, 987654]) {
      const { state, result } = playBot(level, seed, profile);
      const { score, parts } = scoreShift(state);
      expect(score).toBe(result.score);
      expect(parts.service + parts.craft + parts.welcome + parts.accuracy).toBe(score);
      expect(Math.min(...Object.values(parts))).toBeGreaterThanOrEqual(0);
    }
  });
  it("saves the parts and one quality per plate with the run", () => {
    const { result, state } = playBot(5, 17, "human");
    expect(decodeDishes(result.details.dishes)).toHaveLength(state.served);
    expect(Number(result.details.serviceScore) + Number(result.details.craftScore) + Number(result.details.welcomeScore) + Number(result.details.accuracyScore)).toBe(result.score);
  });
});

describe("Content model", () => {
  it("has one authored recipe list that every kitchen's menu points into", () => {
    expect(new Set(CUISINES.flatMap(c => c.recipes))).toEqual(new Set(RECIPES.map(r => r.id)));
    for (const cuisine of CUISINES) for (const id of cuisine.recipes) expect(byRecipe.get(id)!.level).toBe(cuisine.level);
  });
  it("uses only bounded values the action schema can express", () => {
    for (const recipe of RECIPES) for (const step of recipe.steps) {
      if (step.kind === "ingredient") { expect(INGREDIENTS).toContain(step.ingredient); expect(step.portions).toBeGreaterThanOrEqual(1); expect(step.portions).toBeLessThanOrEqual(3); expect(step.ingredient.length).toBeLessThanOrEqual(24); }
      if (step.kind === "cook") { expect(step.heat).toBeGreaterThanOrEqual(1); expect(step.heat).toBeLessThanOrEqual(5); expect(step.ms).toBeGreaterThan(0); }
    }
  });
  it("always offers every ingredient a recipe needs, plus at least one decoy", () => {
    for (const recipe of RECIPES) {
      const pantry = pantryFor(recipe);
      expect(pantry.length).toBeLessThanOrEqual(6);
      for (const step of recipe.steps) if (step.kind === "ingredient") expect(pantry).toContain(step.ingredient);
      expect(pantry.some(id => !recipe.steps.some(step => step.kind === "ingredient" && step.ingredient === id))).toBe(true);
    }
  });
});

describe("Chef's Journey challenges", () => {
  const done = (level: number, details: Record<string, number | string>) => evaluateChallenges(level, details).filter(c => c.done).map(c => c.id);
  const perfect = { stars: 3, served: 7, wanted: 7, mistakes: 0, burnt: 0, durationMs: 90_000, perfect: 7, satisfaction: 98 };
  it("defines three distinct seals for every kitchen, 21 in all", () => {
    const all = CUISINES.flatMap(c => challengesFor(c.level));
    expect(all).toHaveLength(TOTAL_SEALS);
    for (const c of CUISINES) expect(new Set(challengesFor(c.level).map(x => x.id)).size).toBe(3);
    expect(challengesFor(8)).toEqual([]);
  });
  it.each(CUISINES.map(c => c.level))("kitchen %i's seals can all be earned through real play", (level) => {
    for (const seed of [1, 17, 123, 987654]) expect(done(level, playBot(level, seed, "clean").result.details)).toEqual(["spotless", "swift", "signature"]);
  });
  it("a sloppy shift earns nothing, and goals aren't automatic for good human-paced play", () => {
    for (const { level } of CUISINES) for (const seed of [1, 17, 123, 987654]) expect(done(level, playBot(level, seed, "messy").result.details)).not.toContain("spotless");
    const human = CUISINES.flatMap(c => [1, 17, 123, 987654].map(seed => done(c.level, playBot(c.level, seed, "human").result.details).length));
    expect(human.some(n => n < 3)).toBe(true);
  });
  it.each([
    ["one mistake loses spotless", { mistakes: 1 }, ["swift", "signature"]],
    ["one burn loses spotless", { burnt: 1 }, ["swift", "signature"]],
    ["a missed plate loses spotless and the clock", { served: 6 }, ["signature"]],
    ["exactly par beats the clock", { durationMs: 110_000 }, ["spotless", "swift", "signature"]],
    ["1 ms over par does not", { durationMs: 110_001 }, ["spotless", "signature"]],
    ["too few perfect plates lose the signature", { perfect: 3 }, ["spotless", "swift"]],
    ["too little satisfaction loses the signature", { satisfaction: 84 }, ["spotless", "swift"]],
    ["no star earns no seals, however clean", { stars: 0 }, []],
  ])("%s", (_name, change, expected) => expect(done(1, { ...perfect, ...change })).toEqual(expected));
  it("is harder in later kitchens", () => {
    const signature = (level: number) => challengesFor(level).find(c => c.id === "signature")!.description;
    expect(signature(1)).toContain("4+ perfect"); expect(signature(7)).toContain("7+ perfect");
    expect(done(7, { ...perfect, satisfaction: 93 })).not.toContain("signature");
  });
});

describe("Journey summary", () => {
  const run = (level: number, extra: Record<string, unknown> = {}) => ({ level, stars: 3, served: 7, wanted: 7, mistakes: 0, burnt: 0, durationMs: 90_000, perfect: 7, satisfaction: 98, ...extra });
  it("counts runs saved before these goals existed, which have no dishes", () => {
    const summary = summariseJourney([run(1)]);
    expect(summary).toEqual({ seals: { 1: ["spotless", "swift", "signature"] }, sealCount: 3, recipes: {} });
  });
  it("keeps a seal once earned and never counts it twice", () => {
    const summary = summariseJourney([run(1), run(1), run(1, { mistakes: 5, durationMs: 400_000, perfect: 0 })]);
    expect(summary.sealCount).toBe(3);
  });
  it("combines different seals from different runs", () => {
    const summary = summariseJourney([run(2, { mistakes: 1, perfect: 0 }), run(2, { durationMs: 500_000, perfect: 0 })]);
    expect(summary.seals[2]!.sort()).toEqual(["spotless", "swift"]);
  });
  it("tops out at every seal", () => expect(summariseJourney(CUISINES.map(c => run(c.level))).sealCount).toBe(TOTAL_SEALS));
  it("ignores malformed and foreign rows instead of trusting them", () => {
    expect(summariseJourney([null, 7, "x", [], {}, { level: 99, stars: 3 }, { level: "1; DROP", stars: 3 }, run(1, { served: "many", wanted: "all", durationMs: "soon", perfect: "lots" })]).sealCount).toBe(0);
    expect(decodeDishes("masala-dosa:100,unknown-dish:100,butter-naan:101,butter-naan:-1,butter-naan:9.5,:,,tacos")).toEqual([{ recipe: "masala-dosa", quality: 100 }]);
    expect(decodeDishes(5)).toEqual([]); expect(decodeDishes(undefined)).toEqual([]);
  });
  it.each([[1, 100, "apprentice"], [3, 84, "apprentice"], [3, 85, "skilled"], [5, 94, "skilled"], [4, 100, "skilled"], [5, 95, "master"]] as const)("%i plates at best %i is %s", (plates, best, tier) => expect(masteryTier(plates, best)).toBe(tier));
  it("builds recipe mastery from every plate, across runs", () => {
    const summary = summariseJourney([run(1, { dishes: "masala-dosa:80,masala-dosa:96,butter-naan:70" }), run(1, { dishes: "masala-dosa:90,masala-dosa:91,masala-dosa:60" })]);
    expect(summary.recipes["masala-dosa"]).toEqual({ plates: 5, best: 96, tier: "master" });
    expect(summary.recipes["butter-naan"]).toEqual({ plates: 1, best: 70, tier: "apprentice" });
  });
  it("round-trips dish encoding, including two plates for one guest", () => {
    const orders = [{ recipe: "ramen", plates: [90, 95] }, { recipe: "tempura", plates: [] }, { recipe: "tacos", plates: [100] }];
    expect(decodeDishes(encodeDishes(orders))).toEqual([{ recipe: "ramen", quality: 90 }, { recipe: "ramen", quality: 95 }, { recipe: "tacos", quality: 100 }]);
  });
});

describe("Chef rank", () => {
  it.each([[0, "Commis Chef"], [2, "Commis Chef"], [3, "Line Cook"], [6, "Line Cook"], [7, "Sous Chef"], [12, "Head Chef"], [18, "Executive Chef"], [20, "Executive Chef"], [21, "World Chef"]])("%i stars is %s", (stars, title) => expect(chefRank(stars).title).toBe(title));
  it("states the next rank, and that the top has none", () => {
    expect(chefRank(5).next).toEqual({ title: "Sous Chef", starsNeeded: 2 });
    expect(chefRank(21).next).toBeNull();
  });
  it("never lowers as stars rise, and every rank is reachable", () => {
    const seen = Array.from({ length: 22 }, (_, stars) => chefRank(stars).title);
    expect(new Set(seen).size).toBe(CHEF_RANKS.length);
    expect(seen.map(title => CHEF_RANKS.findIndex(r => r.title === title))).toEqual([...seen.map(title => CHEF_RANKS.findIndex(r => r.title === title))].sort((a, b) => a - b));
  });
});
