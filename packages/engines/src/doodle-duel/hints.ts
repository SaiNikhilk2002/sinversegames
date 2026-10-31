import type { Rng } from "../core/rng";
import type { WordDifficulty } from "./words";

/**
 * Progressive hints:
 *   1. At the start of drawing: category and letter count (blanks).
 *   2. Letters are revealed one at a time, evenly spaced between 35% and 85%
 *      of the drawing time.
 *   3. The word's text hint (if it has one) is shown at 50%.
 * The share of letters that can be revealed depends on difficulty, and at
 * least one letter always stays hidden, so hints never reveal the full answer.
 */
export const REVEAL_SHARE: Record<WordDifficulty, number> = { easy: 0.5, medium: 0.35, hard: 0.25 };
export const HINT_WINDOW = { start: 0.35, end: 0.85 } as const;
export const TEXT_HINT_AT = 0.5;

const isLetter = (ch: string) => /[\p{L}\p{N}]/u.test(ch);

export function letterIndexes(word: string): number[] {
  return [...word].flatMap((ch, i) => (isLetter(ch) ? [i] : []));
}

export function maxReveals(word: string, difficulty: WordDifficulty): number {
  const letters = letterIndexes(word).length;
  return Math.max(0, Math.min(letters - 1, Math.floor(letters * REVEAL_SHARE[difficulty])));
}

/** Timestamps at which successive letters are revealed. */
export function revealSchedule(startedAt: number, durationMs: number, count: number): number[] {
  if (count <= 0) return [];
  const from = startedAt + durationMs * HINT_WINDOW.start;
  const span = durationMs * (HINT_WINDOW.end - HINT_WINDOW.start);
  return Array.from({ length: count }, (_, i) => Math.round(from + (count === 1 ? 0 : (span * i) / (count - 1))));
}

/** Picks a not-yet-revealed letter index. */
export function pickRevealIndex(word: string, revealed: readonly number[], rng: Rng): number | null {
  const candidates = letterIndexes(word).filter((i) => !revealed.includes(i));
  if (candidates.length <= 1) return null; // never reveal the last hidden letter
  return candidates[rng.int(candidates.length)]!;
}

/** Mask shown to guessers: letters become "_" unless revealed; spaces and punctuation are kept. */
export function maskWord(word: string, revealed: readonly number[]): string[] {
  return [...word].map((ch, i) => (!isLetter(ch) ? ch : revealed.includes(i) ? ch : "_"));
}
