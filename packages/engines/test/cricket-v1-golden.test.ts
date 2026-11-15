import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { configSchema, sinverseCricket, type DuelConfig } from "../src/sinverse-cricket";
import { playMatch } from "./cricket-fixtures";

/**
 * Version 1 (the 1- and 2-over duel) is frozen: stored match records, replays
 * and digests must mean exactly what they meant when they were played. This
 * corpus was recorded from the duel engine before the international formats
 * were added (commit 0793ec8), and every later engine must reproduce it bit for
 * bit: each ball's physics digest, the scorebook and the verified summary.
 *
 * Regenerate only for a deliberate, documented v1 change: CRICKET_GOLDEN=write.
 */
const FILE = new URL("./fixtures/cricket-v1-golden.json", import.meta.url);

/** FNV-1a: the scorecard JSON is long, so the corpus keeps its hash (still exact). */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

function corpus() {
  const out: unknown[] = [];
  for (const difficulty of ["club", "county", "elite"] as const)
    for (const overs of [1, 2] as const)
      for (const attacking of [true, false])
        for (let k = 0; k < 8; k++) {
          const seed = (k * 2654435761 + overs * 97 + (attacking ? 13 : 0)) >>> 0;
          const config = configSchema.parse({ overs, difficulty, team: k % 2, venue: k % 3 ? "lantern" : "tideglass" }) as DuelConfig;
          const match = playMatch(seed, attacking, config);
          const verified = sinverseCricket.verify(seed, config, match.inputLog);
          out.push({
            seed,
            config,
            digests: match.inputLog.map((e) => (e.k === "ball" ? e.digest : e.k)),
            innings: match.innings.map((i) => [i.team, i.runs, i.wickets, i.balls, i.extras, i.fall.length]),
            result: match.result,
            summary: verified.ok ? { ...verified.result, details: { ...verified.result.details, scorecard: hash(String(verified.result.details.scorecard)) } } : verified.reason,
          });
        }
  return out;
}

describe("Cricket v1 duel golden corpus", () => {
  it("reproduces every recorded duel exactly", () => {
    const now = corpus();
    if (process.env.CRICKET_GOLDEN === "write" || !existsSync(FILE)) writeFileSync(FILE, JSON.stringify(now, null, 0));
    const golden = JSON.parse(readFileSync(FILE, "utf8"));
    expect(now.length).toBe(96);
    expect(JSON.parse(JSON.stringify(now))).toEqual(golden);
    // An explicit budget like the other match-replaying cricket tests: 96 duels take about 2.5 s
    // alone, but more than vitest's 5 s default while the heavy format suites run alongside.
  }, 60_000);
});
