import { randomInt } from "node:crypto";
import type { Rng } from "./seeded";

export { seededRng, shuffle, sample, type Rng } from "./seeded";

/**
 * Randomness is injected into engines so tests can be deterministic while
 * production uses a CSPRNG (players cannot predict shuffles or word picks).
 */
export const cryptoRng: Rng = {
  int: (maxExclusive) => (maxExclusive <= 1 ? 0 : randomInt(maxExclusive)),
};
