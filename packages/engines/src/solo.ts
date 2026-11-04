import type { SoloGameId } from "@platform/shared";
import type { SoloGameDefinition } from "./core/solo";
import { cascadeSolitaire } from "./cascade-solitaire/engine";
import { kitchenRush } from "./kitchen-rush/engine";
import { mahjongGarden } from "./mahjong-garden/engine";
import { cuisineQuest } from "./cuisine-quest/engine";

/**
 * Single-player games. Browser-safe (no Node.js APIs): imported by the game
 * UIs and by the web app's score-verification API on Cloudflare Workers.
 */
export * from "./core/solo";
export { seededRng } from "./core/seeded";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SOLO_GAMES: Record<SoloGameId, SoloGameDefinition<any, any>> = {
  "cuisine-quest": cuisineQuest,
  "kitchen-rush": kitchenRush,
  "cascade-solitaire": cascadeSolitaire,
  "mahjong-garden": mahjongGarden,
};
