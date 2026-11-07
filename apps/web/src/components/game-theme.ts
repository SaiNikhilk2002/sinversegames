import type { GameId } from "@platform/shared";

/** Each game's signature colours, for frames, glows and page accents. */
export const GAME_THEME: Record<GameId, { accent: string; deep: string; ink: string }> = {
  "sinverse-cricket": { accent: "#55e0bf", deep: "#102d3a", ink: "#f1f8ef" },
  "cuisine-quest": { accent: "#e8bf7a", deep: "#254841", ink: "#fff1cf" },
  "chef-rivals": { accent: "#ff8a5c", deep: "#2a1533", ink: "#fff6ea" },
  "kitchen-rush": { accent: "#e0533c", deep: "#3a1d12", ink: "#fffaf0" },
  "bumper-blitz": { accent: "#ff4f8b", deep: "#0b0620", ink: "#ffffff" },
  "token-trail": { accent: "#ffc83d", deep: "#2a1a12", ink: "#f3e6cc" },
  "cascade-solitaire": { accent: "#f2d48a", deep: "#123b2b", ink: "#fffdf6" },
  "mahjong-garden": { accent: "#f6a5c0", deep: "#2a1d3f", ink: "#fff6ea" },
  "doodle-duel": { accent: "#2fd6a8", deep: "#3b2618", ink: "#fffdf8" },
  "color-clash": { accent: "#3d8bff", deep: "#0c2a24", ink: "#ffffff" },
};
