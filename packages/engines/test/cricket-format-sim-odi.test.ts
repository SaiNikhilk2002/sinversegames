import { describe, expect, it } from "vitest";
import { FORMATS, sinverseCricket, type CricketLog, type Innings } from "../src/sinverse-cricket";
import { cfg, checkInnings, play } from "./cricket-format-helpers";

/** One file per format, so the two long simulation runs go in parallel. */
const format = "odi" as const;
describe("ODI simulated matches", () => {
    it(`${format}: 100 deterministic simulated matches keep every scorecard invariant and verify exactly`, () => {
      const rules = FORMATS[format],
        results: Record<string, number> = {};
      for (let s = 0; s < 100; s++) {
        const a = s % 20,
          b = (a + 1 + (s * 7) % 19) % 20;
        const config = cfg(format, a, b, { difficulty: (["club", "county", "elite"] as const)[s % 3], venue: s % 2 ? "tideglass" : "lantern" });
        const m = play(9000 + s, config, 0, s % 2 ? "bat" : "bowl");
        expect(m.innings.length).toBe(2);
        for (const i of m.innings) checkInnings(i, rules);
        const [first, second] = m.innings as [Innings, Innings];
        // The chase stops once the target is reached; the result follows the totals.
        expect(second.runs).toBeLessThanOrEqual(first.runs + 6);
        if (second.runs > first.runs) {
          expect(m.winner).toBe(second.team);
          expect(second.closed).toBe("target");
        } else if (second.runs < first.runs) expect(m.winner).toBe(first.team);
        else expect(m.result).toBe("Match tied");
        results[m.winner === null ? "tie" : m.winner === second.team ? "chase" : "defend"] = (results[m.winner === null ? "tie" : m.winner === second.team ? "chase" : "defend"] ?? 0) + 1;
        if (s % 10 === 0) {
          const verified = sinverseCricket.verify(9000 + s, config, m.inputLog as CricketLog);
          expect(verified.ok).toBe(true);
          if (verified.ok) expect(verified.result).toEqual(m.summary());
        }
      }
      // Both outcomes happen: neither batting first nor chasing always wins.
      expect(results.chase ?? 0).toBeGreaterThan(10);
      expect(results.defend ?? 0).toBeGreaterThan(10);
    }, 600_000);
});
