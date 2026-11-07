import { byRecipe, CUISINES } from "./content";

/**
 * Chef's Journey: replay goals built on verified results. Everything here is a
 * pure reading of a run's saved details, so nothing needs its own storage or
 * trust in the browser, and runs saved before these goals existed still count.
 * Challenges and mastery are prestige only and never pay coins.
 */

export interface ChefChallenge { id: "spotless" | "swift" | "signature"; title: string; description: string }
export interface ChallengeResult extends ChefChallenge { done: boolean }
export type MasteryTier = "apprentice" | "skilled" | "master";
export interface RecipeMastery { plates: number; best: number; tier: MasteryTier }
export interface CuisineJourney {
  /** Seals earned in any completed run, by level. */
  seals: Record<number, ChefChallenge["id"][]>;
  sealCount: number;
  recipes: Record<string, RecipeMastery>;
}
export const TOTAL_SEALS = 21;

type Details = Record<string, unknown>;
const num = (details: Details, key: string) => { const value = Number(details[key]); return Number.isFinite(value) ? value : 0; };

/**
 * Par times sit about 40% above a flawless fixed-pace run of each kitchen
 * (70-81 s measured across the golden fixture), so they need real multitasking
 * without demanding machine speed.
 */
const GOALS: Record<number, { parMs: number; perfect: number; satisfaction: number }> = {
  1: { parMs: 110_000, perfect: 4, satisfaction: 85 },
  2: { parMs: 110_000, perfect: 5, satisfaction: 85 },
  3: { parMs: 100_000, perfect: 5, satisfaction: 88 },
  4: { parMs: 100_000, perfect: 6, satisfaction: 88 },
  5: { parMs: 105_000, perfect: 6, satisfaction: 90 },
  6: { parMs: 110_000, perfect: 6, satisfaction: 92 },
  7: { parMs: 110_000, perfect: 7, satisfaction: 94 },
};
const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export function challengesFor(level: number): ChefChallenge[] {
  const goal = GOALS[level];
  if (!goal) return [];
  return [
    { id: "spotless", title: "Spotless service", description: "Serve every plate with no mistakes and no burnt batches." },
    { id: "swift", title: "Beat the clock", description: `Serve every plate within ${clock(goal.parMs)}.` },
    { id: "signature", title: "Signature shift", description: `Earn ${goal.perfect}+ perfect plates and ${goal.satisfaction}%+ satisfaction.` },
  ];
}

/** Which of a kitchen's three seals one verified run earned. Unfinished runs earn none. */
export function evaluateChallenges(level: number, details: Details): ChallengeResult[] {
  const goal = GOALS[level];
  const completed = num(details, "stars") >= 1;
  const allServed = num(details, "wanted") > 0 && num(details, "served") === num(details, "wanted");
  return challengesFor(level).map((challenge) => ({
    ...challenge,
    done: completed && !!goal && (challenge.id === "spotless" ? allServed && num(details, "mistakes") === 0 && num(details, "burnt") === 0
      : challenge.id === "swift" ? allServed && num(details, "durationMs") <= goal.parMs
      : num(details, "perfect") >= goal.perfect && num(details, "satisfaction") >= goal.satisfaction),
  }));
}

export const masteryTier = (plates: number, best: number): MasteryTier => plates >= 5 && best >= 95 ? "master" : plates >= 3 && best >= 85 ? "skilled" : "apprentice";

/** Encoded as `recipe:quality` per plate because run details are a flat map of strings and numbers. */
export const encodeDishes = (orders: readonly { recipe: string; plates: readonly number[] }[]) => orders.flatMap((o) => o.plates.map((quality) => `${o.recipe}:${quality}`)).join(",");
export function decodeDishes(value: unknown): { recipe: string; quality: number }[] {
  if (typeof value !== "string" || !value) return [];
  return value.split(",").flatMap((entry) => {
    const [recipe, raw] = entry.split(":");
    const quality = Number(raw);
    return recipe && byRecipe.has(recipe) && Number.isInteger(quality) && quality >= 0 && quality <= 100 ? [{ recipe, quality }] : [];
  });
}

/** Combines saved run details. Malformed or foreign rows are ignored rather than trusted. */
export function summariseJourney(runs: readonly unknown[]): CuisineJourney {
  const seals: Record<number, Set<ChefChallenge["id"]>> = {};
  const recipes = new Map<string, { plates: number; best: number }>();
  for (const run of runs) {
    if (typeof run !== "object" || run === null || Array.isArray(run)) continue;
    const details = run as Details;
    const level = num(details, "level");
    if (!CUISINES.some((cuisine) => cuisine.level === level)) continue;
    for (const challenge of evaluateChallenges(level, details)) if (challenge.done) (seals[level] ??= new Set()).add(challenge.id);
    for (const { recipe, quality } of decodeDishes(details.dishes)) {
      const entry = recipes.get(recipe) ?? { plates: 0, best: 0 };
      recipes.set(recipe, { plates: entry.plates + 1, best: Math.max(entry.best, quality) });
    }
  }
  return {
    seals: Object.fromEntries(Object.entries(seals).map(([level, set]) => [level, [...set]])),
    sealCount: Object.values(seals).reduce((n, set) => n + set.size, 0),
    recipes: Object.fromEntries([...recipes].map(([recipe, { plates, best }]) => [recipe, { plates, best, tier: masteryTier(plates, best) }])),
  };
}
