import type { Innings } from "./domain";
import type { CricketPlayer, CricketTeam, PlayerRole } from "./teams";

/**
 * Presentation summaries of a scorebook and of a playing XI. Pure functions of
 * recorded data: they never feed back into a match, a verification or a reward.
 */

/** A playing XI's profile, on the same 0-100 scale as `CricketTeam.ratings`. */
export interface XiProfile {
  batting: number;
  bowling: number;
  fielding: number;
  /** Bowling options other than the wicketkeeper, and how many are spinners. */
  bowlers: number;
  spinners: number;
  roles: Record<PlayerRole, number>;
}
const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
/**
 * Batting: the top eight in the chosen order. Bowling: the five best bowling
 * options other than the keeper (the five who would bowl the most). Fielding:
 * all eleven. For the catalogue's default XI these match the team ratings
 * except where a side has more than five bowlers.
 */
export function xiProfile(team: CricketTeam, pick: { xi: readonly string[]; keeper: string }): XiProfile {
  const byId = new Map(team.squad.map((p) => [p.id, p])),
    xi = pick.xi.map((id) => byId.get(id)).filter((p): p is CricketPlayer => !!p);
  const bowlers = xi.filter((p) => p.bowls && p.id !== pick.keeper).sort((a, b) => b.bowling - a.bowling);
  const roles = { batter: 0, keeper: 0, "all-rounder": 0, pace: 0, spin: 0 } as Record<PlayerRole, number>;
  for (const p of xi) roles[p.role]++;
  return {
    batting: mean(xi.slice(0, 8).map((p) => p.batting)),
    bowling: mean(bowlers.slice(0, 5).map((p) => p.bowling)),
    fielding: mean(xi.map((p) => p.fielding)),
    bowlers: bowlers.length,
    spinners: bowlers.filter((p) => p.bowls!.includes("spin")).length,
    roles,
  };
}

export interface Performance {
  name: string;
  team: number;
  runs: number;
  balls: number;
  wickets: number;
  conceded: number;
  overs: number;
  /** Catches, stumpings and run-outs, read from the dismissal text. */
  dismissalsTaken: number;
  /** runs + 20 a wicket + 8 a catch, stumping or run-out: a published rule of thumb, shown with the award. */
  impact: number;
}
/** Every player's match figures, by team, from the innings records (fielding sides' players appear as bowlers and in dismissals). */
export function performances(innings: Innings[]): Performance[] {
  const all = new Map<string, Performance>();
  const get = (name: string, team: number) => {
    const key = `${team}:${name}`;
    let p = all.get(key);
    if (!p) all.set(key, (p = { name, team, runs: 0, balls: 0, wickets: 0, conceded: 0, overs: 0, dismissalsTaken: 0, impact: 0 }));
    return p;
  };
  for (const i of innings) {
    const fielding = 1 - i.team;
    for (const b of i.batsmen)
      if (b.balls || b.runs || b.dismissal) {
        const p = get(b.name, i.team);
        p.runs += b.runs;
        p.balls += b.balls;
      }
    for (const b of i.bowlers) {
      const p = get(b.name, fielding);
      p.wickets += b.wickets;
      p.conceded += b.runs;
      p.overs += b.balls;
    }
    for (const b of i.batsmen) {
      const d = b.dismissal ?? "";
      // "c X b Y", "c & b Y", "st X b Y", "run out (X)".
      const fielder = /^c & b (.+)$/.exec(d)?.[1] ?? /^(?:c|st) (.+?) b /.exec(d)?.[1] ?? /^run out \((.+)\)$/.exec(d)?.[1];
      if (fielder && fielder !== "sub") get(fielder, fielding).dismissalsTaken++;
    }
  }
  for (const p of all.values()) p.impact = p.runs + p.wickets * 20 + p.dismissalsTaken * 8;
  return [...all.values()];
}
/** The match's standout figures: the top performer, and each side's best batting, bowling and partnership. */
export function matchAwards(innings: Innings[]) {
  const people = performances(innings);
  const top = [...people].sort((a, b) => b.impact - a.impact || b.runs - a.runs || a.conceded - b.conceded || a.name.localeCompare(b.name))[0] ?? null;
  const bySide = (team: number) => {
    const own = innings.filter((i) => i.team === team),
      bowled = innings.filter((i) => i.team !== team);
    const batting = own.flatMap((i) => i.batsmen.filter((b) => b.balls || b.runs)).sort((a, b) => b.runs - a.runs || a.balls - b.balls)[0] ?? null;
    const bowling = bowled.flatMap((i) => i.bowlers.filter((b) => b.balls)).sort((a, b) => b.wickets - a.wickets || a.runs - b.runs || a.balls - b.balls)[0] ?? null;
    const partnership =
      own
        .flatMap((i) => (i.partnerships ?? []).map((p) => ({ ...p, names: [i.batsmen[p.a]?.name ?? "", i.batsmen[p.b]?.name ?? ""] as [string, string] })))
        .sort((a, b) => b.runs - a.runs || a.balls - b.balls)[0] ?? null;
    return { batting, bowling, partnership };
  };
  return { top, sides: [bySide(0), bySide(1)] as const };
}
