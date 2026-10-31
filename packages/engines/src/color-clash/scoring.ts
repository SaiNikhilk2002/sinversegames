import type { Card } from "./cards";

/**
 * Scoring is kept separate from the game engine so rule variations can change
 * point values without touching turn logic.
 *
 * Default: the winner scores the total value of every card left in opponents'
 * hands. Number cards score their face value, action cards 20, Prism wilds 50.
 */
export interface ColorClashScoring {
  actionValue: number;
  wildValue: number;
  /** Flat bonus for winning, added to the hand-value total. */
  winBonus: number;
}

export const DEFAULT_SCORING: ColorClashScoring = { actionValue: 20, wildValue: 50, winBonus: 0 };

export function cardPoints(card: Card, scoring: ColorClashScoring = DEFAULT_SCORING): number {
  switch (card.kind) {
    case "number":
      return card.value ?? 0;
    case "block":
    case "flip":
    case "plus2":
      return scoring.actionValue;
    case "prism":
    case "prism4":
      return scoring.wildValue;
  }
}

export const handPoints = (hand: readonly Card[], scoring: ColorClashScoring = DEFAULT_SCORING): number =>
  hand.reduce((sum, card) => sum + cardPoints(card, scoring), 0);

export interface ScoringInput {
  id: string;
  hand: readonly Card[];
  left: boolean;
}

export interface ScoredEntry {
  id: string;
  placement: number;
  score: number;
  handPoints: number;
  cardsLeft: number;
}

/**
 * Ranks players: winner first, then remaining players by fewest hand points
 * (ties by fewest cards). Players who left the match are ranked last.
 */
export function scoreMatch(
  players: readonly ScoringInput[],
  winnerId: string | null,
  scoring: ColorClashScoring = DEFAULT_SCORING,
): ScoredEntry[] {
  const withPoints = players.map((p) => ({ ...p, points: handPoints(p.hand, scoring) }));
  const winnerScore =
    winnerId === null
      ? 0
      : withPoints.filter((p) => p.id !== winnerId).reduce((sum, p) => sum + p.points, 0) + scoring.winBonus;

  const ordered = [...withPoints].sort((a, b) => {
    if (a.id === winnerId) return -1;
    if (b.id === winnerId) return 1;
    if (a.left !== b.left) return a.left ? 1 : -1;
    return a.points - b.points || a.hand.length - b.hand.length;
  });

  return ordered.map((p, i) => ({
    id: p.id,
    placement: i + 1,
    score: p.id === winnerId ? winnerScore : 0,
    handPoints: p.points,
    cardsLeft: p.hand.length,
  }));
}
