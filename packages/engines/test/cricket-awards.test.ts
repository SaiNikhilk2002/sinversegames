import { describe, expect, it } from "vitest";
import { INTERNATIONAL_TEAMS, matchAwards, performances, xiProfile } from "../src/sinverse-cricket";
import { cfg, play } from "./cricket-format-helpers";

describe("XI profile", () => {
  it("matches the catalogue ratings for every default XI and counts roles and bowlers", () => {
    for (const t of INTERNATIONAL_TEAMS) {
      const p = xiProfile(t, t);
      expect(p.batting).toBe(t.ratings.batting);
      expect(p.fielding).toBe(t.ratings.fielding);
      // Every default XI has exactly five bowling options, none of them the keeper.
      expect(p.bowlers).toBe(5);
      expect(p.bowling).toBe(t.ratings.bowling);
      expect(Object.values(p.roles).reduce((a, b) => a + b, 0)).toBe(11);
      expect(p.roles.keeper).toBe(1);
    }
  });
  it("follows the chosen eleven: dropping a bowler for a batter lowers the bowling options", () => {
    const t = INTERNATIONAL_TEAMS[0]!,
      spare = t.squad.find((p) => !t.xi.includes(p.id) && !p.bowls)!,
      bowler = t.xi.find((id) => t.squad.find((p) => p.id === id)!.bowls)!;
    const p = xiProfile(t, { xi: t.xi.map((id) => (id === bowler ? spare.id : id)), keeper: t.keeper });
    expect(p.bowlers).toBe(4);
  });
});

describe("match awards", () => {
  it("adds up each player's match figures and picks a top performer by the published rule", () => {
    for (const seed of [21, 22, 23]) {
      const m = play(seed, cfg("t20", seed % 20, (seed + 5) % 20));
      const people = performances(m.innings);
      for (const i of m.innings) {
        expect(people.filter((p) => p.team === i.team).reduce((n, p) => n + p.runs, 0)).toBe(i.batsmen.reduce((n, b) => n + b.runs, 0));
        expect(people.filter((p) => p.team !== i.team).reduce((n, p) => n + p.wickets, 0)).toBe(i.bowlers.reduce((n, b) => n + b.wickets, 0));
        // Catches, stumpings and run-outs credited never exceed the wickets that aren't bowled or lbw.
        const fielded = i.batsmen.filter((b) => /^(c |st |run out)/.test(b.dismissal ?? "")).length;
        expect(people.filter((p) => p.team !== i.team).reduce((n, p) => n + p.dismissalsTaken, 0)).toBeLessThanOrEqual(fielded);
      }
      for (const p of people) expect(p.impact).toBe(p.runs + p.wickets * 20 + p.dismissalsTaken * 8);
      const awards = matchAwards(m.innings);
      expect(awards.top).not.toBeNull();
      expect(awards.top!.impact).toBe(Math.max(...people.map((p) => p.impact)));
      for (const team of [0, 1]) {
        const side = awards.sides[team]!,
          inn = m.innings.find((i) => i.team === team)!;
        expect(side.batting!.runs).toBe(Math.max(...inn.batsmen.filter((b) => b.balls || b.runs).map((b) => b.runs)));
        expect(side.partnership!.runs).toBe(Math.max(...inn.partnerships!.map((p) => p.runs)));
      }
    }
  }, 120_000);
});
