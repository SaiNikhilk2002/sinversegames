import type { MultiplayerGameId } from "@platform/shared";
import type { AnyGameEngine } from "./core/types";
import { bumperBlitzEngine } from "./bumper-blitz/engine";
import { colorClashEngine } from "./color-clash/engine";
import { doodleDuelEngine } from "./doodle-duel/engine";
import { tokenTrailEngine } from "./token-trail/engine";

export * from "./core/types";
export * from "./core/rng";
export { colorClashEngine } from "./color-clash/engine";
export { doodleDuelEngine, createDoodleEngine } from "./doodle-duel/engine";
export { tokenTrailEngine } from "./token-trail/engine";
export { bumperBlitzEngine } from "./bumper-blitz/engine";

/** Server-side engine registry. Adding a multiplayer game = adding its engine here + metadata in @platform/shared. */
export const ENGINES: Record<MultiplayerGameId, AnyGameEngine> = {
  "color-clash": colorClashEngine,
  "doodle-duel": doodleDuelEngine,
  "token-trail": tokenTrailEngine,
  "bumper-blitz": bumperBlitzEngine,
};

export const getEngine = (id: MultiplayerGameId): AnyGameEngine => ENGINES[id];
