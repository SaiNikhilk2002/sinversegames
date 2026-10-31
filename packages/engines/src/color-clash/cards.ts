/**
 * Color Clash card definitions. This module is pure data (no Node APIs) so the
 * web client can import it for rendering.
 *
 * Deck composition (108 cards) — see GAME_RULES.md:
 *   For each of the 4 colours (Ember, Tide, Grove, Sun):
 *     1 × "0", 2 × each of "1"–"9"          → 19 number cards
 *     2 × Block, 2 × Flip, 2 × +2           →  6 action cards
 *   4 × Prism (wild), 4 × Prism +4 (wild draw four)
 *   = 4 × 25 + 8 = 108
 */

export const CARD_COLORS = ["ember", "tide", "grove", "sun"] as const;
export type CardColor = (typeof CARD_COLORS)[number];

export const CARD_KINDS = ["number", "block", "flip", "plus2", "prism", "prism4"] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export interface Card {
  id: string;
  kind: CardKind;
  /** null for Prism wild cards. */
  color: CardColor | null;
  /** 0–9 for number cards, null otherwise. */
  value: number | null;
}

export const COLOR_META: Record<CardColor, { label: string; hex: string; deep: string }> = {
  ember: { label: "Ember", hex: "#ff4f5e", deep: "#b3122a" },
  tide: { label: "Tide", hex: "#3d8bff", deep: "#1546a8" },
  grove: { label: "Grove", hex: "#2ec27e", deep: "#11734a" },
  sun: { label: "Sun", hex: "#ffc23d", deep: "#b37400" },
};

export const KIND_META: Record<CardKind, { label: string; short: string; description: string }> = {
  number: { label: "Number", short: "#", description: "Match by colour or number." },
  block: { label: "Block", short: "Block", description: "The next player loses their turn." },
  flip: { label: "Flip", short: "Flip", description: "Reverses the direction of play. With two players it acts like Block." },
  plus2: { label: "+2", short: "+2", description: "The next player draws two cards and loses their turn." },
  prism: { label: "Prism", short: "Prism", description: "Wild: play on anything and choose the next colour." },
  prism4: { label: "Prism +4", short: "+4", description: "Wild: choose the next colour; the next player draws four and loses their turn." },
};

export const DECK_COMPOSITION = {
  numberZeroPerColor: 1,
  numberOneToNinePerColor: 2,
  actionCardsPerColor: { block: 2, flip: 2, plus2: 2 },
  prism: 4,
  prism4: 4,
} as const;

export const isWild = (card: Pick<Card, "kind">): boolean => card.kind === "prism" || card.kind === "prism4";

/** Builds the deck in a fixed order. Shuffle it with an injected RNG before use. */
export function buildDeck(): Card[] {
  const cards: Card[] = [];
  let n = 0;
  const push = (kind: CardKind, color: CardColor | null, value: number | null) => {
    cards.push({ id: `k${(n++).toString(36)}`, kind, color, value });
  };
  for (const color of CARD_COLORS) {
    for (let i = 0; i < DECK_COMPOSITION.numberZeroPerColor; i++) push("number", color, 0);
    for (let v = 1; v <= 9; v++) {
      for (let i = 0; i < DECK_COMPOSITION.numberOneToNinePerColor; i++) push("number", color, v);
    }
    for (const [kind, count] of Object.entries(DECK_COMPOSITION.actionCardsPerColor)) {
      for (let i = 0; i < count; i++) push(kind as CardKind, color, null);
    }
  }
  for (let i = 0; i < DECK_COMPOSITION.prism; i++) push("prism", null, null);
  for (let i = 0; i < DECK_COMPOSITION.prism4; i++) push("prism4", null, null);
  return cards;
}

export function describeCard(card: Pick<Card, "kind" | "color" | "value">): string {
  const colour = card.color ? `${COLOR_META[card.color].label} ` : "";
  return card.kind === "number" ? `${colour}${card.value}` : `${colour}${KIND_META[card.kind].label}`;
}

/** Sort order used to present a hand: by colour, then kind, then value; wilds last. */
export function compareCards(a: Card, b: Card): number {
  const colorRank = (c: Card) => (c.color ? CARD_COLORS.indexOf(c.color) : CARD_COLORS.length);
  const kindRank = (c: Card) => CARD_KINDS.indexOf(c.kind);
  return colorRank(a) - colorRank(b) || kindRank(a) - kindRank(b) || (a.value ?? 0) - (b.value ?? 0);
}
