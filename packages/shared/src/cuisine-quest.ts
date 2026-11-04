/** Small shared campaign contract; gameplay content remains in the engine. */
export const CUISINE_IDS = ["indian", "italian", "japanese", "mexican", "thai", "chinese", "mediterranean"] as const;
export interface CuisineLevelProgress { level: number; cuisine: string; unlocked: boolean; stars: number; bestScore: number; completedRuns: number; perfectRuns: number; mastered: boolean }
export interface CuisineCampaign { levels: CuisineLevelProgress[]; totalStars: number; completed: number; mastered: number }
