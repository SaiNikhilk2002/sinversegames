import type { SoloSummary } from "@/games/solo-types";

export interface RecoverableRun { token: string; seed: number; config: Record<string, unknown>; runId: string }
export interface SoloSnapshot { stage: "playing" | "pending" | "done"; run: RecoverableRun; log: unknown[]; summary?: SoloSummary }
/** The submit route's own body limit: a snapshot that couldn't be submitted isn't worth keeping. */
const MAX_BYTES = 512 * 1024;
/** Per game, what a recoverable run's config must look like (keys end with the game id). */
const CONFIG_CHECKS: Record<string, (config: Record<string, unknown>) => boolean> = {
  "cuisine-quest": (c) => Number.isInteger(c.level) && Number(c.level) >= 1 && Number(c.level) <= 7,
  "sinverse-cricket": (c) => c.version === 2 && typeof c.format === "string" && Array.isArray(c.xi),
};
export function readSoloSnapshot(key: string): SoloSnapshot | null {
  try {
    const raw = sessionStorage.getItem(key); if (!raw || raw.length > MAX_BYTES) return null;
    const value = JSON.parse(raw) as SoloSnapshot;
    const check = CONFIG_CHECKS[key.slice(key.lastIndexOf(":") + 1)];
    if (!["playing","pending","done"].includes(value.stage) || !value.run || typeof value.run.token !== "string" || value.run.token.length > 4096 || value.run.token.length < 20 || !Number.isInteger(value.run.seed) || value.run.seed < 0 || value.run.seed > 0xffffffff || !/^[a-f\d-]{36}$/i.test(value.run.runId) || !value.run.config || typeof value.run.config !== "object" || !check || !check(value.run.config) || !Array.isArray(value.log) || value.log.length > 4000) return null;
    if (value.stage !== "playing" && (!value.summary || typeof value.summary.score !== "number" || typeof value.summary.completed !== "boolean" || typeof value.summary.headline !== "string" || value.summary.headline.length > 120)) return null;
    return value;
  } catch { return null; }
}
export function saveSoloSnapshot(key: string, value: SoloSnapshot): boolean {
  try { const raw = JSON.stringify(value); if (raw.length > MAX_BYTES) return false; sessionStorage.setItem(key, raw); return true; }
  catch { return false; }
}
export function removeSoloSnapshot(key: string) { try { sessionStorage.removeItem(key); } catch {} }
