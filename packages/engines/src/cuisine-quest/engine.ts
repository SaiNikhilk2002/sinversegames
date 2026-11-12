import { z } from "zod";
import { seededRng } from "../core/seeded";
import { checkTimeline, type SoloGameDefinition, type SoloRunResult } from "../core/solo";
import { CUISINES } from "./content";
import { encodeDishes } from "./journey";
import { applyQuest, createShift, MAX_SHIFT_MS, questLogSchema, scoreShift, wantedPlates, type CustomerType, type QuestAction, type QuestState } from "./kitchen";

export * from "./kitchen";

/** The seven-kitchen campaign: how a kitchen's shift is planned, scored and starred. */

export const questConfigSchema = z.object({ level: z.number().int().min(1).max(7).default(1) }).strict();
export type QuestConfig = z.infer<typeof questConfigSchema>;
export const canUnlock = (level: number, stars: readonly number[]) => level === 1 || (level >= 2 && level <= 7 && Array.from({ length: level - 1 }, (_, i) => stars[i] ?? 0).every(n => n >= 1));

export function createQuest(seed: number, config: QuestConfig): QuestState {
  const cuisine = CUISINES[config.level - 1]!;
  const rng = seededRng(seed);
  const types: CustomerType[] = ["regular", "patient", config.level >= 3 ? "impatient" : "regular", "large", "special", "regular"];
  const recipes = [...cuisine.recipes, cuisine.recipes[rng.int(4)]!, cuisine.recipes[rng.int(4)]!];
  return createShift({
    level: config.level, seed, intro: "Read your first ticket, then choose its ingredients in order.",
    rules: { openingOrders: 4, seats: 3, batches: 2, limitMs: null },
    orders: recipes.map((recipe, id) => ({
      recipe, type: types[id]!, garnish: types[id] === "special" ? (cuisine.garnish === "herbs" ? "lemon" : "herbs") : cuisine.garnish,
      arrivesAt: id < 4 ? id * 14_000 : null,
      patienceMs: types[id] === "patient" ? 180_000 : types[id] === "large" ? 200_000 : types[id] === "impatient" ? 125_000 : 155_000,
      wanted: types[id] === "large" ? 2 : 1,
    })),
  });
}

export function questResult(s: QuestState): SoloRunResult {
  const wanted = wantedPlates(s);
  const { score, quality, satisfaction, parts } = scoreShift(s);
  const stars = starRating(s.finished, s.served, wanted, score, quality);
  return { score, completed: stars >= 1, durationMs: s.finishedAt ?? s.t, details: { level: s.level, cuisine: CUISINES[s.level - 1]!.id, stars, served: s.served, wanted, missed: s.missed, mistakes: s.mistakes, burnt: s.burnt, perfect: s.perfect, precision: Math.round(quality), satisfaction: Math.round(satisfaction), durationMs: s.finishedAt ?? s.t, serviceScore: parts.service, craftScore: parts.craft, welcomeScore: parts.welcome, accuracyScore: parts.accuracy, dishes: encodeDishes(s.orders) } };
}
export const starRating = (finished: boolean, served: number, wanted: number, score: number, precision: number): 0 | 1 | 2 | 3 =>
  !finished || served < 5 || score < 5200 ? 0 : served === wanted && precision >= 85 && score >= 8500 ? 3 : served >= 6 && score >= 7000 ? 2 : 1;
export const cuisineQuest: SoloGameDefinition<QuestConfig, QuestAction[]> = {
  id: "cuisine-quest", configSchema: questConfigSchema, logSchema: questLogSchema,
  verify(seed, config, log) {
    const timing = checkTimeline(log.map(a => a.t), MAX_SHIFT_MS);
    if (timing) return { ok: false, reason: timing };
    const s = createQuest(seed, config);
    for (const a of log) {
      const result = applyQuest(s, a);
      if (!result.ok) return { ok: false, reason: result.error ?? "Invalid cooking action" };
    }
    if (!s.finished || !s.sealed || log.at(-1)?.kind !== "finish") return { ok: false, reason: "Finish the entire service before submitting" };
    return { ok: true, result: questResult(s) };
  },
};
