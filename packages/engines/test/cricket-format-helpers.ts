import { expect } from "vitest";
import {
  CricketMatch,
  INTERNATIONAL_TEAMS,
  STEP,
  totalExtras,
  VARIATIONS_FOR,
  type FormatBallLog,
  type FormatConfig,
  type FormatRules,
  type Innings,
} from "../src/sinverse-cricket";
import { calibratedShot } from "./cricket-fixtures";

export const team = (n: number) => INTERNATIONAL_TEAMS[n]!;
export function cfg(format: "t20" | "odi", a = 0, b = 1, extra: Partial<FormatConfig> = {}): FormatConfig {
  const t = team(a);
  return { version: 2, format, team: t.id, opponent: team(b).id, xi: [...t.xi], captain: t.captain, keeper: t.keeper, venue: "lantern", difficulty: "county", ...extra };
}
/** Plays a whole match: simulated passages, or (every `own`-th over) deliveries the player controls. */
export function play(seed: number, config: FormatConfig, own = 0, decision: "bat" | "bowl" = "bat") {
  const m = new CricketMatch(seed, config);
  m.toss({ k: "toss", call: m.tossFace, decision, t: 0 });
  let t = 0;
  while (m.phase !== "finished") {
    if (m.phase === "interval") m.nextInnings();
    const over = Math.floor(m.current.balls / 6);
    if (own && over % own === 0) {
      const batting = m.humanBatting;
      const options = batting ? [] : m.bowlerOptions();
      const newOver = m.current.balls % 6 === 0 && !(m.current.overBowlers![over] !== undefined);
      const slot = batting ? -1 : newOver ? options[options.length - 1]! : m.current.bowlers[m.current.overBowlers![over]!]!.slot!;
      const bowls = batting ? null : m.sides[1 - m.current.team]!.players[slot]!.bowls ?? "medium";
      const move = {
        bowling: batting ? null : { variation: VARIATIONS_FOR[bowls!][0]!, line: 0.1, length: 4.5, speed: 0.6, release: 0 },
        shot: batting ? calibratedShot(m) : null,
        runAt: [],
        field: m.fieldForAI() as FormatBallLog["field"],
        ...(newOver && !batting ? { bowler: slot } : {}),
      };
      const d = m.createDelivery(move);
      d.complete();
      t += Math.ceil(d.tick * STEP * 1000) + 1000;
      if (!m.record({ k: "ball", seq: m.seq, ...move, digest: d.digest, t }, d)) throw Error("own delivery rejected");
    } else {
      t += 1500;
      if (!m.simulate({ k: "sim", seq: m.seq, balls: own ? 6 - (m.current.balls % 6) : 600, t })) throw Error("simulation refused");
    }
  }
  return m;
}
/** Scorecard invariants every innings must satisfy. */
export function checkInnings(i: Innings, rules: FormatRules) {
  expect(i.runs).toBe(i.batsmen.reduce((n, b) => n + b.runs, 0) + totalExtras(i));
  expect(i.runs).toBe(i.bowlers.reduce((n, b) => n + b.runs, 0) + i.extras.byes + i.extras.legByes);
  expect(i.bowlers.reduce((n, b) => n + b.balls, 0)).toBe(i.balls);
  expect(i.wickets).toBeLessThanOrEqual(10);
  expect(i.fall.length).toBe(i.wickets);
  expect(i.batsmen.filter((b) => b.dismissal).length).toBe(i.wickets);
  if (rules.overs) expect(i.balls).toBeLessThanOrEqual(rules.overs * 6);
  for (const b of i.bowlers) if (rules.bowlerOvers) expect(b.balls).toBeLessThanOrEqual(rules.bowlerOvers * 6);
  for (let o = 1; o < i.overBowlers!.length; o++) expect(i.overBowlers![o]).not.toBe(i.overBowlers![o - 1]);
  expect(i.partnerships!.reduce((n, p) => n + p.runs, 0)).toBe(i.runs);
  expect(i.partnerships!.length).toBe(i.wickets < 10 ? i.wickets + 1 : 10);
  expect(["all-out", "overs", "target", "declared", "time"]).toContain(i.closed);
}

