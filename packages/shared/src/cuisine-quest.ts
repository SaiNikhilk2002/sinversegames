/** Small shared campaign contract; gameplay content remains in the engine. */
export const CUISINE_IDS = ["indian", "italian", "japanese", "mexican", "thai", "chinese", "mediterranean"] as const;
export interface CuisineLevelProgress { level: number; cuisine: string; unlocked: boolean; stars: number; bestScore: number; completedRuns: number; perfectRuns: number; mastered: boolean }
export interface CuisineCampaign { levels: CuisineLevelProgress[]; totalStars: number; completed: number; mastered: number }

/** Chef rank follows saved stars alone, so it can only rise and needs no storage of its own. */
export const CHEF_RANKS = [
  { title: "Commis Chef", stars: 0 },
  { title: "Line Cook", stars: 3 },
  { title: "Sous Chef", stars: 7 },
  { title: "Head Chef", stars: 12 },
  { title: "Executive Chef", stars: 18 },
  { title: "World Chef", stars: 21 },
] as const;
export function chefRank(totalStars: number) {
  const index = CHEF_RANKS.reduce((best, rank, i) => (totalStars >= rank.stars ? i : best), 0);
  const next = CHEF_RANKS[index + 1];
  return { title: CHEF_RANKS[index]!.title, next: next ? { title: next.title, starsNeeded: next.stars - totalStars } : null };
}
