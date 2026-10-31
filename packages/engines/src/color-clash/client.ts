/** Browser-safe exports for the Color Clash client (no Node APIs, no engine internals). */
export * from "./cards";
export * from "./config";
export { canPlay } from "./rules";
export type { CCView, CCPlayerView, CCPublicAction, ColorClashAction } from "./engine";
