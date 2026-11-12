import { fieldPositions } from "./content";
import { STUMPS_Z, type FieldName } from "./domain";

/**
 * Playing conditions per format, as data. The engine (`match.ts`) reads only
 * these, so each format's rules are isolated and testable on their own.
 *
 * Sources: the standard ICC men's playing conditions for T20 internationals,
 * ODIs and Tests, simplified where noted (no DLS, no Super Over yet, no
 * over-rate penalties, no new ball).
 */
export interface Powerplay {
  /** First and last over it covers (1-based, inclusive). */
  from: number;
  to: number;
  /** Most fielders allowed outside the 30-yard circle. */
  maxOutside: number;
  label: string;
}
export interface FormatRules {
  id: "t20" | "odi" | "test";
  name: string;
  short: string;
  /** Overs per innings; null for an unlimited (Test) innings. */
  overs: number | null;
  /** Innings each side bats. */
  inningsPerSide: 1 | 2;
  /** Most overs one bowler may bowl in an innings; null when unlimited. */
  bowlerOvers: number | null;
  /** Fielding restrictions by over; outside them, `maxOutside`. */
  powerplays: Powerplay[];
  maxOutside: number;
  /** Test cricket: the lead that allows the follow-on, days, overs per day and sessions. */
  followOn?: number;
  days?: number;
  oversPerDay?: number;
  sessionsPerDay?: number;
  /** Balls the player must control themselves for a win to count as theirs (anti-farming). */
  minControlledBalls: number;
}

export const FORMATS: Record<FormatRules["id"], FormatRules> = {
  t20: {
    id: "t20",
    name: "Twenty20",
    short: "T20",
    overs: 20,
    inningsPerSide: 1,
    bowlerOvers: 4,
    powerplays: [{ from: 1, to: 6, maxOutside: 2, label: "Powerplay" }],
    maxOutside: 5,
    minControlledBalls: 30,
  },
  odi: {
    id: "odi",
    name: "One-Day International",
    short: "ODI",
    overs: 50,
    inningsPerSide: 1,
    bowlerOvers: 10,
    powerplays: [
      { from: 1, to: 10, maxOutside: 2, label: "Powerplay 1" },
      { from: 11, to: 40, maxOutside: 4, label: "Powerplay 2" },
      { from: 41, to: 50, maxOutside: 5, label: "Powerplay 3" },
    ],
    maxOutside: 5,
    minControlledBalls: 60,
  },
  /** Engine only: not offered in the match setup (see docs/CRICKET_FORMATS_IMPLEMENTATION.md). */
  test: {
    id: "test",
    name: "Test match",
    short: "Test",
    overs: null,
    inningsPerSide: 2,
    bowlerOvers: null,
    powerplays: [],
    maxOutside: 9,
    followOn: 200,
    days: 5,
    oversPerDay: 90,
    sessionsPerDay: 3,
    minControlledBalls: 120,
  },
};

/** The 30-yard fielding circle: semicircles of 27.432 m about each middle stump, joined by straight lines. */
export const CIRCLE_RADIUS = 27.432;
export function outsideCircle(field: FieldName) {
  return fieldPositions(field).filter((p) => {
    const d = Math.abs(p.z) <= STUMPS_Z ? Math.abs(p.x) : Math.hypot(p.x, p.z - Math.sign(p.z) * STUMPS_Z);
    return d > CIRCLE_RADIUS;
  }).length;
}
/** The powerplay in force for an over (0-based), if any. */
export function powerplayFor(rules: FormatRules, over: number) {
  return rules.powerplays.find((p) => over + 1 >= p.from && over + 1 <= p.to) ?? null;
}
/** Most fielders allowed outside the circle in an over (0-based). */
export function maxOutside(rules: FormatRules, over: number) {
  return powerplayFor(rules, over)?.maxOutside ?? rules.maxOutside;
}
export function fieldAllowed(rules: FormatRules, over: number, field: FieldName) {
  return outsideCircle(field) <= maxOutside(rules, over);
}
/** Test cricket: the day (1-based) and session (1-based) an over (0-based, across the match) falls in. */
export function dayAndSession(rules: FormatRules, matchOver: number) {
  const perDay = rules.oversPerDay ?? 90,
    perSession = perDay / (rules.sessionsPerDay ?? 3);
  return { day: Math.floor(matchOver / perDay) + 1, session: Math.floor((matchOver % perDay) / perSession) + 1 };
}
/** Test cricket: total overs the match allows before it is drawn. */
export const matchOvers = (rules: FormatRules) => (rules.days && rules.oversPerDay ? rules.days * rules.oversPerDay : null);
/** Run rate per six balls. */
export const runRate = (runs: number, balls: number) => (balls ? (runs * 6) / balls : 0);
