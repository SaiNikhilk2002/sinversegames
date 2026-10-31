import { z } from "zod";

export const WORD_CATEGORIES = {
  animals: "Animals",
  food: "Food & drink",
  objects: "Objects",
  nature: "Nature",
  entertainment: "Entertainment",
  activities: "Everyday activities",
  sports: "Sports",
  places: "Places",
  technology: "Technology",
} as const;
export type WordCategory = keyof typeof WORD_CATEGORIES;
export type WordDifficulty = "easy" | "medium" | "hard";

const categoryKeys = Object.keys(WORD_CATEGORIES) as [WordCategory, ...WordCategory[]];

/** Lobby-configurable Doodle Duel settings. */
export const doodleConfigSchema = z.object({
  /** Each round, every player draws once. */
  rounds: z.number().int().min(1).max(6).default(3),
  drawSeconds: z.number().int().min(30).max(180).default(80),
  chooseSeconds: z.number().int().min(5).max(30).default(15),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
  category: z.enum([...categoryKeys, "mixed"]).default("mixed"),
  hints: z.boolean().default(true),
  typoTolerance: z.boolean().default(true),
});
export type DoodleConfig = z.infer<typeof doodleConfigSchema>;

export const REVEAL_MS = 6_000;
export const DRAWER_DISCONNECT_GRACE_MS = 15_000;
export const WORD_CHOICES = 3;
export const MAX_GUESS_LENGTH = 80;
