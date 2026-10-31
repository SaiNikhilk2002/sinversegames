import type { GameId } from "@platform/shared";
import type { AnyGameEngine } from "./core/types";
import { colorClashEngine } from "./color-clash/engine";
import { doodleDuelEngine } from "./doodle-duel/engine";

export * from "./core/types";
export * from "./core/rng";
export { colorClashEngine } from "./color-clash/engine";
export { doodleDuelEngine, createDoodleEngine } from "./doodle-duel/engine";

/** Server-side engine registry. Adding a game = adding its engine here + metadata in @platform/shared. */
export const ENGINES: Record<GameId, AnyGameEngine> = {
  "color-clash": colorClashEngine,
  "doodle-duel": doodleDuelEngine,
};

export const getEngine = (id: GameId): AnyGameEngine => ENGINES[id];
