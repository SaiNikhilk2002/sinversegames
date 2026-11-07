"use client";

import dynamic from "next/dynamic";
import type { MultiplayerGameId } from "@platform/shared";
import { BrandLoader } from "@/components/ui/brand-loader";
import { ColorClashSettings, summarizeColorClash } from "./color-clash/settings";
import { DoodleDuelSettings, summarizeDoodleDuel } from "./doodle-duel/settings";
import { BumperBlitzSettings, summarizeBumperBlitz } from "./bumper-blitz/settings";
import { ChefRivalsSettings, summarizeChefRivals } from "./chef-rivals/settings";
import { KitchenCoopSettings, summarizeKitchenCoop } from "./kitchen-rush-coop/settings";
import { TokenTrailSettings, summarizeTokenTrail } from "./token-trail/settings";
import type { GameClient } from "./types";

const loading = () => (
  <div className="flex justify-center py-24">
    <BrandLoader label="Loading game" />
  </div>
);

/**
 * Client game registry. Game UIs are code-split so visitors only download the
 * game they're playing. Adding a game = one entry here.
 */
export const GAME_CLIENTS: Record<MultiplayerGameId, GameClient> = {
  "kitchen-rush-coop": {
    Game: dynamic(() => import("./kitchen-rush-coop/coop-game").then((m) => m.KitchenCoopGame), { ssr: false, loading }),
    Settings: KitchenCoopSettings,
    summarize: summarizeKitchenCoop,
    Results: dynamic(() => import("./kitchen-rush-coop/coop-results").then((m) => m.CoopResults), { ssr: false }),
  },
  "chef-rivals": {
    Game: dynamic(() => import("./chef-rivals/rivals-game").then((m) => m.ChefRivalsGame), { ssr: false, loading }),
    Settings: ChefRivalsSettings,
    summarize: summarizeChefRivals,
    Results: dynamic(() => import("./chef-rivals/rivals-results").then((m) => m.RivalsResults), { ssr: false }),
  },
  "color-clash": {
    Game: dynamic(() => import("./color-clash/color-clash-game").then((m) => m.ColorClashGame), { ssr: false, loading }),
    Settings: ColorClashSettings,
    summarize: summarizeColorClash,
  },
  "doodle-duel": {
    Game: dynamic(() => import("./doodle-duel/doodle-duel-game").then((m) => m.DoodleDuelGame), { ssr: false, loading }),
    Settings: DoodleDuelSettings,
    summarize: summarizeDoodleDuel,
  },
  "token-trail": {
    Game: dynamic(() => import("./token-trail/token-trail-game").then((m) => m.TokenTrailGame), { ssr: false, loading }),
    Settings: TokenTrailSettings,
    summarize: summarizeTokenTrail,
  },
  "bumper-blitz": {
    Game: dynamic(() => import("./bumper-blitz/bumper-blitz-game").then((m) => m.BumperBlitzGame), { ssr: false, loading }),
    Settings: BumperBlitzSettings,
    summarize: summarizeBumperBlitz,
  },
};
