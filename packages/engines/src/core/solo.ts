import type { z } from "zod";

/**
 * Single-player games run entirely in the browser, which can't be trusted to
 * report its own score. Instead the server issues a seed, the client plays and
 * submits its move log, and the server replays that log through the same
 * deterministic rules to compute the score. Every solo game implements this.
 */
export interface SoloRunResult {
  score: number;
  /** The player finished the game (cleared the board, completed the level…). */
  completed: boolean;
  /** In-game duration according to the log, used to reject impossibly fast runs. */
  durationMs: number;
  details: Record<string, number | string>;
}

export type SoloVerifyResult = { ok: true; result: SoloRunResult } | { ok: false; reason: string };

export interface SoloGameDefinition<C, L> {
  readonly id: string;
  readonly configSchema: z.ZodType<C>;
  readonly logSchema: z.ZodType<L>;
  verify(seed: number, config: C, log: L): SoloVerifyResult;
}

/** Shared checks for a timestamped log: ordered, bounded timestamps. */
export function checkTimeline(times: number[], maxMs: number): string | null {
  let last = 0;
  for (const t of times) {
    if (!Number.isInteger(t) || t < last || t > maxMs) return "Invalid move timing";
    last = t;
  }
  return null;
}
