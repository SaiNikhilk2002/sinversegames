import { randomInt } from "node:crypto";

/**
 * Randomness is injected into engines so tests can be deterministic while
 * production uses a CSPRNG (players cannot predict shuffles or word picks).
 */
export interface Rng {
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

export const cryptoRng: Rng = {
  int: (maxExclusive) => (maxExclusive <= 1 ? 0 : randomInt(maxExclusive)),
};

/** Deterministic mulberry32 generator for tests and reproducible simulations. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { int: (maxExclusive) => (maxExclusive <= 1 ? 0 : Math.floor(next() * maxExclusive)) };
}

/** Unbiased in-place Fisher–Yates shuffle. */
export function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/** Picks `count` distinct elements. */
export function sample<T>(items: readonly T[], count: number, rng: Rng): T[] {
  return shuffle([...items], rng).slice(0, count);
}
