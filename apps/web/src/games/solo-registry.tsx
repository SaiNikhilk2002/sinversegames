"use client";

import dynamic from "next/dynamic";
import type { SoloGameId } from "@platform/shared";
import { Spinner } from "@/components/ui/primitives";
import type { SoloClient } from "./solo-types";

const loading = () => (
  <div className="flex justify-center py-24">
    <Spinner label="Loading game" />
  </div>
);

/** Single-player game clients, code-split like the multiplayer ones. */
export const SOLO_CLIENTS: Record<SoloGameId, SoloClient> = {
  "cuisine-quest": {
    Setup: dynamic(() => import("./cuisine-quest/cuisine-quest-game").then(m => m.CuisineQuestSetup), { ssr: false, loading }),
    Game: dynamic(() => import("./cuisine-quest/cuisine-quest-game").then(m => m.CuisineQuestGame), { ssr: false, loading }),
    ResultDetails: dynamic(() => import("./cuisine-quest/cuisine-quest-game").then(m => m.CuisineQuestResultDetails), { ssr: false }),
    recoverable: true,
  },
  "kitchen-rush": {
    Setup: dynamic(() => import("./kitchen-rush/kitchen-rush-game").then((m) => m.KitchenRushSetup), { ssr: false, loading }),
    Game: dynamic(() => import("./kitchen-rush/kitchen-rush-game").then((m) => m.KitchenRushGame), { ssr: false, loading }),
  },
  "cascade-solitaire": {
    Setup: dynamic(() => import("./cascade-solitaire/cascade-solitaire-game").then((m) => m.SolitaireSetup), { ssr: false, loading }),
    Game: dynamic(() => import("./cascade-solitaire/cascade-solitaire-game").then((m) => m.CascadeSolitaireGame), { ssr: false, loading }),
  },
  "mahjong-garden": {
    Setup: dynamic(() => import("./mahjong-garden/mahjong-garden-game").then((m) => m.MahjongSetup), { ssr: false, loading }),
    Game: dynamic(() => import("./mahjong-garden/mahjong-garden-game").then((m) => m.MahjongGardenGame), { ssr: false, loading }),
  },
};
