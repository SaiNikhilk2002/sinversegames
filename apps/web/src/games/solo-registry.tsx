"use client";

import dynamic from "next/dynamic";
import type { SoloGameId } from "@platform/shared";
import { BrandLoader } from "@/components/ui/brand-loader";
import type { SoloClient } from "./solo-types";

const loading = () => (
  <div className="flex justify-center py-24">
    <BrandLoader label="Loading game" />
  </div>
);

/** Single-player game clients, code-split like the multiplayer ones. */
export const SOLO_CLIENTS: Record<SoloGameId, SoloClient> = {
  "sinverse-cricket": {
    Setup: dynamic(() => import("./sinverse-cricket/cricket-game").then(m => m.CricketSetup), { ssr: false, loading }),
    Game: dynamic(() => import("./sinverse-cricket/cricket-game").then(m => m.CricketGame), { ssr: false, loading }),
    ResultDetails: dynamic(() => import("./sinverse-cricket/cricket-game").then(m => m.CricketResultDetails), { ssr: false }),
    fullWidthSetup: true,
  },
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
