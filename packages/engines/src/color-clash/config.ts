import { z } from "zod";

/**
 * Lobby-configurable house rules. Defaults reproduce the standard rule set in
 * GAME_RULES.md; each flag documents the variation it enables.
 */
export const colorClashConfigSchema = z.object({
  /** Cards dealt to each player. */
  handSize: z.number().int().min(3).max(10).default(7),
  /** Seconds per turn. 0 disables the turn timer (disconnected players still time out). */
  turnSeconds: z.union([z.literal(0), z.number().int().min(10).max(120)]).default(30),
  /** Allow answering a +2 with a +2 (or a Prism +4 with a +2/+4) to pass the penalty along. */
  stackDrawCards: z.boolean().default(false),
  /** When drawing, keep drawing until a playable card appears. */
  drawUntilPlayable: z.boolean().default(false),
  /** When false, Prism +4 may only be played if you hold no card of the active colour. */
  prism4AnyTime: z.boolean().default(true),
});

export type ColorClashConfig = z.infer<typeof colorClashConfigSchema>;

/** Time a disconnected player gets on their turn before it is auto-played. */
export const DISCONNECTED_TURN_MS = 10_000;
