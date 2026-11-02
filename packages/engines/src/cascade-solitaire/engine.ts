import { z } from "zod";
import { seededRng, shuffle } from "../core/seeded";
import { checkTimeline, type SoloGameDefinition, type SoloVerifyResult } from "../core/solo";

/**
 * Cascade Solitaire: Klondike rules. Cards are numbers 0–51:
 * suit = floor(card / 13) (0 spades, 1 hearts, 2 diamonds, 3 clubs), rank = card % 13 + 1.
 * The same pure functions drive the browser UI and the server-side replay.
 */

export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
export const suitOf = (c: number) => Math.floor(c / 13);
export const rankOf = (c: number) => (c % 13) + 1;
export const isRed = (c: number) => suitOf(c) === 1 || suitOf(c) === 2;

export const solitaireConfigSchema = z.object({ draw: z.union([z.literal(1), z.literal(3)]).default(1) });
export type SolitaireConfig = z.infer<typeof solitaireConfigSchema>;

export type PileRef = "w" | `f${0 | 1 | 2 | 3}` | `t${0 | 1 | 2 | 3 | 4 | 5 | 6}`;
const pileRef = z.string().regex(/^(w|f[0-3]|t[0-6])$/) as unknown as z.ZodType<PileRef>;

export const solitaireMoveSchema = z.discriminatedUnion("k", [
  z.object({ k: z.literal("draw"), t: z.number().int() }),
  z.object({ k: z.literal("move"), from: pileRef, to: pileRef, n: z.number().int().min(1).max(13).default(1), t: z.number().int() }),
  z.object({ k: z.literal("undo"), t: z.number().int() }),
]);
export type SolitaireMove = z.infer<typeof solitaireMoveSchema>;
export const solitaireLogSchema = z.array(solitaireMoveSchema).max(5000);

export interface Column {
  cards: number[];
  /** Number of face-down cards at the bottom of the column. */
  down: number;
}

export interface SolitaireState {
  draw: 1 | 3;
  stock: number[];
  waste: number[];
  foundations: number[][];
  tableau: Column[];
  score: number;
  moves: number;
  recycles: number;
  undos: number;
  won: boolean;
}

export const SCORE = { wasteToTableau: 5, toFoundation: 10, flip: 5, foundationToTableau: -15, recycleDraw1: -100, recycleDraw3: -20, undo: -10 };

export function deal(seed: number, config: SolitaireConfig): SolitaireState {
  const deck = shuffle(
    Array.from({ length: 52 }, (_, i) => i),
    seededRng(seed),
  );
  const tableau: Column[] = [];
  for (let col = 0; col < 7; col++) tableau.push({ cards: deck.splice(0, col + 1), down: col });
  return { draw: config.draw, stock: deck, waste: [], foundations: [[], [], [], []], tableau, score: 0, moves: 0, recycles: 0, undos: 0, won: false };
}

const clone = (s: SolitaireState): SolitaireState => ({
  ...s,
  stock: [...s.stock],
  waste: [...s.waste],
  foundations: s.foundations.map((f) => [...f]),
  tableau: s.tableau.map((c) => ({ cards: [...c.cards], down: c.down })),
});

const top = <T,>(a: T[]) => a[a.length - 1];

/** The cards a move would pick up, or null when the source can't give them. */
function takeable(s: SolitaireState, from: PileRef, n: number): number[] | null {
  if (from === "w") return n === 1 && s.waste.length ? [top(s.waste)!] : null;
  if (from[0] === "f") {
    const f = s.foundations[Number(from[1])]!;
    return n === 1 && f.length ? [top(f)!] : null;
  }
  const col = s.tableau[Number(from[1])]!;
  if (n > col.cards.length - col.down) return null;
  return col.cards.slice(col.cards.length - n);
}

function canPlace(s: SolitaireState, cards: number[], to: PileRef): boolean {
  const first = cards[0]!;
  if (to === "w") return false;
  if (to[0] === "f") {
    if (cards.length !== 1) return false;
    const f = s.foundations[Number(to[1])]!;
    if (!f.length) return rankOf(first) === 1;
    return suitOf(top(f)!) === suitOf(first) && rankOf(first) === rankOf(top(f)!) + 1;
  }
  const col = s.tableau[Number(to[1])]!;
  if (!col.cards.length) return rankOf(first) === 13;
  const under = top(col.cards)!;
  return isRed(under) !== isRed(first) && rankOf(under) === rankOf(first) + 1;
}

export function isLegal(s: SolitaireState, from: PileRef, to: PileRef, n = 1): boolean {
  if (from === to || s.won) return false;
  const cards = takeable(s, from, n);
  return !!cards && canPlace(s, cards, to);
}

/** Applies a move in place. Returns false (and leaves state untouched) when illegal. */
export function applyMove(s: SolitaireState, move: Exclude<SolitaireMove, { k: "undo" }>): boolean {
  if (s.won) return false;
  if (move.k === "draw") {
    if (s.stock.length) {
      const n = Math.min(s.draw, s.stock.length);
      for (let i = 0; i < n; i++) s.waste.push(s.stock.pop()!);
    } else if (s.waste.length) {
      s.stock = s.waste.reverse();
      s.waste = [];
      s.recycles++;
      s.score = Math.max(0, s.score + (s.draw === 1 ? SCORE.recycleDraw1 : SCORE.recycleDraw3));
    } else {
      return false;
    }
    s.moves++;
    return true;
  }
  const { from, to, n } = move;
  if (!isLegal(s, from, to, n)) return false;
  let moved: number[];
  if (from === "w") moved = [s.waste.pop()!];
  else if (from[0] === "f") moved = [s.foundations[Number(from[1])]!.pop()!];
  else moved = s.tableau[Number(from[1])]!.cards.splice(-n);
  if (to[0] === "f") s.foundations[Number(to[1])]!.push(...moved);
  else s.tableau[Number(to[1])]!.cards.push(...moved);

  if (to[0] === "f") s.score += SCORE.toFoundation;
  else if (from === "w") s.score += SCORE.wasteToTableau;
  else if (from[0] === "f") s.score = Math.max(0, s.score + SCORE.foundationToTableau);
  if (from[0] === "t") {
    const col = s.tableau[Number(from[1])]!;
    if (col.cards.length && col.down >= col.cards.length) {
      col.down = col.cards.length - 1;
      s.score += SCORE.flip;
    }
  }
  s.moves++;
  s.won = s.foundations.every((f) => f.length === 13);
  return true;
}

export type HintMove = { from: PileRef; to: PileRef; n: number } | { draw: true };

/** Useful moves, best first: foundation plays, moves that reveal cards, waste plays, then drawing. */
export function hints(s: SolitaireState): HintMove[] {
  if (s.won) return [];
  const out: { move: HintMove; weight: number }[] = [];
  const sources: PileRef[] = ["w", ...([0, 1, 2, 3, 4, 5, 6].map((i) => `t${i}`) as PileRef[])];
  for (const from of sources) {
    for (let f = 0; f < 4; f++) {
      const to = `f${f}` as PileRef;
      if (isLegal(s, from, to, 1)) out.push({ move: { from, to, n: 1 }, weight: 100 });
    }
  }
  for (let c = 0; c < 7; c++) {
    const col = s.tableau[c]!;
    const from = `t${c}` as PileRef;
    for (let n = col.cards.length - col.down; n >= 1; n--) {
      for (let d = 0; d < 7; d++) {
        if (d === c) continue;
        const to = `t${d}` as PileRef;
        if (!isLegal(s, from, to, n)) continue;
        const reveals = n === col.cards.length - col.down && col.down > 0;
        const kingShuffle = col.down === 0 && n === col.cards.length; // pointless: moving a whole column to an empty one
        if (kingShuffle) continue;
        out.push({ move: { from, to, n }, weight: reveals ? 80 : 20 });
      }
    }
  }
  for (let d = 0; d < 7; d++) {
    const to = `t${d}` as PileRef;
    if (isLegal(s, "w", to, 1)) out.push({ move: { from: "w", to, n: 1 }, weight: 50 });
  }
  if (s.stock.length || s.waste.length) out.push({ move: { draw: true }, weight: 1 });
  return out.sort((a, b) => b.weight - a.weight).map((x) => x.move);
}

/** All cards face-up and the stock empty: the rest can be played to the foundations automatically. */
export const canAutoComplete = (s: SolitaireState) =>
  !s.won && s.stock.length === 0 && s.waste.length === 0 && s.tableau.every((c) => c.down === 0);

export const winBonus = (durationMs: number) => 500 + Math.max(0, 600 - Math.floor(durationMs / 1000)) * 2;

/** Score shown to the player and recorded: board score minus undo penalties, plus the win bonus. */
export const totalScore = (s: SolitaireState, durationMs: number) =>
  Math.max(0, s.score + SCORE.undo * s.undos) + (s.won ? winBonus(durationMs) : 0);

/** A game: the current state plus the snapshots that make undo possible. */
export class SolitaireGame {
  state: SolitaireState;
  private history: SolitaireState[] = [];
  constructor(seed: number, config: SolitaireConfig) {
    this.state = deal(seed, config);
  }
  apply(move: SolitaireMove): boolean {
    if (move.k === "undo") {
      const prev = this.history.pop();
      if (!prev) return false;
      // Undo restores the board but not the undo count, so each undo keeps costing points.
      this.state = { ...prev, undos: this.state.undos + 1 };
      return true;
    }
    const snapshot = clone(this.state);
    if (!applyMove(this.state, move)) return false;
    this.history.push(snapshot);
    if (this.history.length > 500) this.history.shift();
    return true;
  }
  get canUndo() {
    return this.history.length > 0 && !this.state.won;
  }
}

export const cascadeSolitaire: SoloGameDefinition<SolitaireConfig, SolitaireMove[]> = {
  id: "cascade-solitaire",
  configSchema: solitaireConfigSchema,
  logSchema: solitaireLogSchema,
  verify(seed, config, log): SoloVerifyResult {
    const timing = checkTimeline(
      log.map((m) => m.t),
      4 * 60 * 60 * 1000,
    );
    if (timing) return { ok: false, reason: timing };
    const game = new SolitaireGame(seed, config);
    for (const move of log) {
      if (!game.apply(move)) return { ok: false, reason: "The move log contains an illegal move" };
    }
    const s = game.state;
    const durationMs = log.length ? log[log.length - 1]!.t : 0;
    const score = totalScore(s, durationMs);
    return {
      ok: true,
      result: {
        score,
        completed: s.won,
        durationMs,
        details: { moves: s.moves, foundation: s.foundations.reduce((n, f) => n + f.length, 0), draw: s.draw, undos: s.undos },
      },
    };
  },
};
