/**
 * Progression rules (XP, levels, achievements, rewards). Defined in code so they
 * are versioned and testable; the database only stores outcomes.
 */

export const XP_RULES = { matchPlayed: 20, matchWon: 30 } as const;

/** Level n requires 50·(n−1)² XP: 1 → 0, 2 → 50, 3 → 200, 4 → 450 … */
export const levelForXp = (xp: number): number => Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
export const xpForLevel = (level: number): number => 50 * (level - 1) ** 2;

/**
 * Virtual reward currency. Non-purchasable, non-transferable and without any
 * monetary value; set REWARDS_ENABLED=false to stop granting it.
 */
export const REWARD_RULES = { matchPlayed: 2, matchWon: 10 } as const;
export const rewardsEnabled = (): boolean => process.env.REWARDS_ENABLED !== "false";

export interface StatsSnapshot {
  gameId: string;
  gamesPlayed: number;
  wins: number;
  bestScore: number;
}

export interface AchievementDef {
  key: string;
  title: string;
  description: string;
  /** Evaluated after a match with the player's updated per-game stats. */
  unlocked: (stats: StatsSnapshot[], lastMatch: { gameId: string; score: number; isWinner: boolean }) => boolean;
}

const total = (stats: StatsSnapshot[], k: "gamesPlayed" | "wins") => stats.reduce((n, s) => n + s[k], 0);
const forGame = (stats: StatsSnapshot[], id: string) => stats.find((s) => s.gameId === id);

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: "first-match", title: "First steps", description: "Finish your first match.", unlocked: (s) => total(s, "gamesPlayed") >= 1 },
  { key: "first-win", title: "Winner winner", description: "Win a match.", unlocked: (s) => total(s, "wins") >= 1 },
  { key: "regular", title: "Regular", description: "Finish 10 matches.", unlocked: (s) => total(s, "gamesPlayed") >= 10 },
  { key: "clash-champion", title: "Clash champion", description: "Win 5 games of Color Clash.", unlocked: (s) => (forGame(s, "color-clash")?.wins ?? 0) >= 5 },
  { key: "doodle-star", title: "Doodle star", description: "Win 5 games of Doodle Duel.", unlocked: (s) => (forGame(s, "doodle-duel")?.wins ?? 0) >= 5 },
  {
    key: "master-sketcher",
    title: "Master sketcher",
    description: "Score 1,500+ points in a single Doodle Duel match.",
    unlocked: (_s, m) => m.gameId === "doodle-duel" && m.score >= 1500,
  },
  {
    key: "big-hand",
    title: "Clean sweep",
    description: "Win a Color Clash match worth 100+ points.",
    unlocked: (_s, m) => m.gameId === "color-clash" && m.isWinner && m.score >= 100,
  },
];

export const achievementByKey = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));
