/**
 * Deterministic randomness with no Node.js dependencies, so it can run in the
 * browser and on Cloudflare Workers. Single-player games use it to make every
 * run reproducible from its seed: the server replays the move log with the
 * same seed to verify the score.
 */
export interface Rng {
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

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
