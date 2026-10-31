import type { Word } from "./words";

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalizeGuess(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Levenshtein distance with an early exit once `max` is exceeded. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

export type GuessVerdict = "correct" | "close" | "wrong";

/**
 * Typo tolerance: answers of 6+ characters accept one edit (e.g. "girafe").
 * "Close" is reported privately for one edit on shorter words and two edits on longer ones.
 * Comparisons also ignore spaces so "icecream" matches "ice cream".
 */
export function classifyGuess(guess: string, word: Pick<Word, "text" | "alternatives">, typoTolerance: boolean): GuessVerdict {
  const g = normalizeGuess(guess);
  if (!g) return "wrong";
  const gCompact = g.replace(/ /g, "");
  let best = Infinity;
  let bestLen = 0;
  let containsAnswer = false;
  for (const answer of [word.text, ...word.alternatives]) {
    const a = normalizeGuess(answer);
    const aCompact = a.replace(/ /g, "");
    if (g === a || gCompact === aCompact) return "correct";
    // "it's a cat!" must never be broadcast publicly, so it is treated as close.
    if (a && ` ${g} `.includes(` ${a} `)) containsAnswer = true;
    const d = editDistance(gCompact, aCompact, 3);
    if (d < best) {
      best = d;
      bestLen = aCompact.length;
    }
  }
  if (typoTolerance && bestLen >= 6 && best === 1) return "correct";
  if (containsAnswer) return "close";
  if (bestLen >= 4 && best <= (bestLen >= 6 ? 2 : 1)) return "close";
  return "wrong";
}
