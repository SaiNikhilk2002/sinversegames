"use client";

import dynamic from "next/dynamic";
import type { GameId } from "@platform/shared";
import { Spinner } from "@/components/ui/primitives";
import { ColorClashSettings, summarizeColorClash } from "./color-clash/settings";
import { DoodleDuelSettings, summarizeDoodleDuel } from "./doodle-duel/settings";
import type { GameClient } from "./types";

const loading = () => (
  <div className="flex justify-center py-24">
    <Spinner label="Loading game" />
  </div>
);

/**
 * Client game registry. Game UIs are code-split so visitors only download the
 * game they're playing. Adding a game = one entry here.
 */
export const GAME_CLIENTS: Record<GameId, GameClient> = {
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
};
