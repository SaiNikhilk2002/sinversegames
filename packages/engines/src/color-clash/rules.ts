import { isWild, type Card, type CardColor } from "./cards";
import type { ColorClashConfig } from "./config";

export interface PlayContext {
  top: Card;
  activeColor: CardColor;
  /** Accumulated draw penalty waiting on the current player (only with stacking). */
  pendingDraw: number;
  /** The rest of the player's hand, used for the Prism +4 restriction. */
  hand: readonly Card[];
  config: ColorClashConfig;
}

/**
 * Whether `card` may legally be played given the discard pile and house rules.
 * Pure function shared by move validation and by the "playable" hints sent to clients.
 */
export function canPlay(card: Card, ctx: PlayContext): boolean {
  if (ctx.pendingDraw > 0) {
    // A pending penalty can only be answered by stacking another draw card.
    if (!ctx.config.stackDrawCards) return false;
    if (ctx.top.kind === "plus2") return card.kind === "plus2" || card.kind === "prism4";
    if (ctx.top.kind === "prism4") return card.kind === "prism4";
    return false;
  }

  if (card.kind === "prism") return true;
  if (card.kind === "prism4") {
    if (ctx.config.prism4AnyTime) return true;
    return !ctx.hand.some((c) => c.id !== card.id && c.color === ctx.activeColor);
  }
  if (card.color === ctx.activeColor) return true;
  if (card.kind === "number") return ctx.top.kind === "number" && ctx.top.value === card.value;
  // Action cards match the same action symbol regardless of colour.
  return !isWild(ctx.top) && ctx.top.kind === card.kind;
}

export const drawPenalty = (card: Card): number => (card.kind === "plus2" ? 2 : card.kind === "prism4" ? 4 : 0);
