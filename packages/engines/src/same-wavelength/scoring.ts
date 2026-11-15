/**
 * Same Wavelength scoring (docs/SAME_WAVELENGTH_DESIGN.md). Transparent and deterministic: every
 * pair of players who both answered is compared, and the result is one of three levels.
 *
 * - match (2 points each): the same option, the same player, or the same typed answer after a
 *   simple normalisation (case, spacing, punctuation, a leading "a/an/the", a trailing plural "s"),
 *   or two typed answers the prompt lists as the same answer.
 * - close (1 point each): two options the prompt groups together, e.g. "Beach day" and "Mountain
 *   hike" are both "outdoors".
 * - different (0 points).
 *
 * In a predict round only the pairs that include the round's subject count: the others are
 * guessing the subject's answer. No AI or fuzzy matching is used, and the score measures how often
 * your answers matched in this game, nothing more.
 */
import type { Prompt } from "./prompts";

export type MatchLevel = "match" | "close" | "different";
export const POINTS: Record<MatchLevel, number> = { match: 2, close: 1, different: 0 };

export type Answer = { option: string } | { player: string } | { text: string };

/** Lower-case, collapse spaces, drop punctuation, a leading article and a trailing plural "s". */
export function normalizeText(text: string): string {
  let t = text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/^(a|an|the) /, "");
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
  return t;
}

/** Which alias list (if any) a typed answer belongs to. */
function aliasGroup(prompt: Prompt, text: string): number {
  const n = normalizeText(text);
  return prompt.aliases?.findIndex((group) => group.some((a) => normalizeText(a) === n)) ?? -1;
}

export function compare(prompt: Prompt, a: Answer, b: Answer): MatchLevel {
  if ("option" in a && "option" in b) {
    if (a.option === b.option) return "match";
    const ga = prompt.options?.find((x) => x.id === a.option)?.group;
    const gb = prompt.options?.find((x) => x.id === b.option)?.group;
    return ga && ga === gb ? "close" : "different";
  }
  if ("player" in a && "player" in b) return a.player === b.player ? "match" : "different";
  if ("text" in a && "text" in b) {
    if (normalizeText(a.text) === normalizeText(b.text)) return "match";
    const ga = aliasGroup(prompt, a.text);
    return ga >= 0 && ga === aliasGroup(prompt, b.text) ? "match" : "different";
  }
  return "different";
}

export interface PairResult {
  a: string;
  b: string;
  level: MatchLevel;
}

/**
 * Compares every counted pair of answers. `subject` limits a predict round to the pairs that
 * include the subject. Players who didn't answer aren't in any pair.
 */
export function scoreRound(prompt: Prompt, answers: ReadonlyMap<string, Answer>, subject: string | null) {
  const ids = [...answers.keys()];
  const pairs: PairResult[] = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]!, b = ids[j]!;
      if (subject && a !== subject && b !== subject) continue;
      pairs.push({ a, b, level: compare(prompt, answers.get(a)!, answers.get(b)!) });
    }
  const points: Record<string, number> = {};
  for (const id of ids) points[id] = 0;
  let earned = 0;
  for (const p of pairs) {
    earned += POINTS[p.level];
    points[p.a]! += POINTS[p.level];
    points[p.b]! += POINTS[p.level];
  }
  const possible = pairs.length * POINTS.match;
  return { pairs, points, earned, possible, pct: possible ? Math.round((earned / possible) * 100) : 0 };
}
