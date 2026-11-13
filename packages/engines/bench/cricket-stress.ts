/**
 * Release stress run for international cricket (engine v2).
 *
 *   CRICKET_MATCHES=<n> pnpm --filter @platform/engines stress:cricket
 *
 * For each format, plays N deterministic matches with varied seeds, team pairs,
 * difficulties, grounds, tosses and amounts of the player's own play, as a browser
 * would build them. Each match is checked ball by ball and innings by innings,
 * then verified exactly as POST /api/solo/submit verifies it (server/client
 * agreement), and two in five logs (those with own deliveries) are tampered
 * with in eight ways that must all be rejected.
 * Exits non-zero on any failure. The default `pnpm test` keeps its 100-match
 * suites; this is the long run recorded in docs/CRICKET_RULES_VALIDATION.md.
 */
import {
  CricketMatch,
  FORMATS,
  INTERNATIONAL_TEAMS,
  STEP,
  VARIATIONS_FOR,
  fieldAllowed,
  sinverseCricket,
  totalExtras,
  type CricketLog,
  type FormatBallLog,
  type FormatConfig,
  type FormatRules,
  type Innings,
} from "../src/sinverse-cricket";
import { calibratedShot } from "../test/cricket-fixtures";

const per = Number(process.env.CRICKET_MATCHES ?? (/^\d+$/.test(process.argv[2] ?? "") ? process.argv[2] : 500));
const failures: string[] = [];
const fail = (where: string, what: string) => {
  if (failures.length < 50) console.error(`FAIL ${where}: ${what}`);
  failures.push(`${where}: ${what}`);
};
const check = (where: string, ok: boolean, what: string) => ok || fail(where, what);

function checkInnings(where: string, i: Innings, rules: FormatRules) {
  const bat = i.batsmen.reduce((n, b) => n + b.runs, 0);
  check(where, i.runs === bat + totalExtras(i), `runs ${i.runs} != batters ${bat} + extras ${totalExtras(i)}`);
  check(where, i.runs === i.bowlers.reduce((n, b) => n + b.runs, 0) + i.extras.byes + i.extras.legByes, "runs != bowlers + byes + leg-byes");
  check(where, i.bowlers.reduce((n, b) => n + b.balls, 0) === i.balls, "bowlers' balls != innings balls");
  check(where, i.wickets <= 10 && i.fall.length === i.wickets, "wickets/falls mismatch");
  check(where, i.batsmen.filter((b) => b.dismissal).length === i.wickets, "dismissals != wickets");
  check(where, i.bowlers.reduce((n, b) => n + b.wickets, 0) === i.wickets - i.batsmen.filter((b) => b.dismissal?.startsWith("run out")).length, "bowler wickets != wickets - run-outs");
  check(where, i.batsmen.filter((b) => b.balls > 0 || b.dismissal).length <= i.wickets + 2, "more batters came in than wickets allow");
  if (rules.overs) check(where, i.balls <= rules.overs * 6, "over limit");
  for (const b of i.bowlers) if (rules.bowlerOvers) check(where, b.balls <= rules.bowlerOvers * 6, `${b.name} over quota`);
  for (let o = 1; o < i.overBowlers!.length; o++) check(where, i.overBowlers![o] !== i.overBowlers![o - 1], `consecutive overs at ${o}`);
  check(where, i.partnerships!.reduce((n, p) => n + p.runs, 0) === i.runs, "partnerships != total");
  check(where, i.partnerships!.length === (i.wickets < 10 ? i.wickets + 1 : 10), "partnership count");
  check(where, i.bowlers.every((b) => (b.maidens ?? 0) <= Math.floor(b.balls / 6)), "more maidens than overs");
  check(where, ["all-out", "overs", "target"].includes(i.closed ?? ""), `closed ${i.closed}`);
}

/** Plays one match; the player controls every `own`-th over (0: all simulated). Checks every ball as it goes. */
function play(where: string, seed: number, config: FormatConfig, own: number, decision: "bat" | "bowl") {
  const rules = FORMATS[config.format],
    m = new CricketMatch(seed, config);
  m.toss({ k: "toss", call: seed % 3 ? m.tossFace : m.tossFace === "heads" ? "tails" : "heads", decision, t: 0 });
  let t = 0;
  while (m.phase !== "finished") {
    if (m.phase === "interval") m.nextInnings();
    const i = m.current,
      over = Math.floor(i.balls / 6);
    // Fielding restrictions for the coming ball, whichever side sets the field.
    check(where, fieldAllowed(rules, over, m.fieldForAI()), `AI field illegal at over ${over + 1}`);
    if (i.balls % 6 === 0 && i.overBowlers![over] === undefined) {
      const options = m.bowlerOptions();
      check(where, options.length > 0, `no legal bowler at over ${over + 1}`);
      check(where, !options.includes(m.sides[1 - i.team]!.keeper), "keeper offered as a bowler");
    }
    const before = { striker: i.striker, nonStriker: i.nonStriker, balls: i.balls, wickets: i.wickets, runs: i.runs, freeHit: i.freeHit, history: m.history.length };
    if (own && over % own === 0) {
      const batting = m.humanBatting,
        newOver = i.balls % 6 === 0 && i.overBowlers![over] === undefined,
        options = batting ? [] : m.bowlerOptions(),
        slot = batting ? -1 : newOver ? options[seed % options.length]! : i.bowlers[i.overBowlers![over]!]!.slot!,
        bowls = batting ? null : (m.sides[1 - i.team]!.players[slot]!.bowls ?? "medium"),
        field = batting ? m.fieldForAI() : ((["attack", "balanced", "deep"] as const).filter((f) => fieldAllowed(rules, over, f))[seed % 2] ?? "attack");
      const move = {
        bowling: batting ? null : { variation: VARIATIONS_FOR[bowls!][seed % VARIATIONS_FOR[bowls!].length]!, line: ((seed % 5) - 2) / 10, length: 2 + (seed % 4), speed: 0.6, release: 0 },
        shot: batting ? calibratedShot(m) : null,
        runAt: [] as number[],
        field: field as FormatBallLog["field"],
        ...(newOver && !batting ? { bowler: slot } : {}),
      };
      const d = m.createDelivery(move, false);
      d.complete();
      t += Math.ceil(d.tick * STEP * 1000) + 800;
      if (!m.record({ k: "ball", seq: m.seq, ...move, digest: d.digest, t }, d)) return fail(where, "own delivery rejected"), null;
    } else {
      t += 1200;
      if (!m.simulate({ k: "sim", seq: m.seq, balls: 1, t })) return fail(where, "simulation refused"), null;
    }
    // Ball-by-ball laws for the delivery just played (skip the change of innings).
    // (A one-ball simulation bowls wides and no-balls again, so it can hold several deliveries.)
    const played = m.history.slice(before.history);
    if (m.innings.at(-1) === i && played.length === 1) {
      const last = played[0]!,
        legal = i.balls === before.balls + 1;
      check(where, i.runs === before.runs + last.runs, "runs didn't add the delivery's total");
      check(where, i.balls - before.balls <= 1, "more than one ball counted");
      // Strike: the batters cross on an odd number of runs run (never on a boundary), and change ends after the over.
      // Readable from the scorebook label for dots, boundaries, runs and byes; wides and no-balls don't say if a boundary was hit.
      const runs = /^(\d+)( B| LB)?$/.exec(last.label);
      if (!last.wicket && legal && (last.label === "DOT" || runs)) {
        const crossed = last.label === "DOT" ? false : Number(runs![1]) % 2 === 1,
          swap = i.balls % 6 === 0 ? !crossed : crossed,
          swapped = i.striker === before.nonStriker && i.nonStriker === before.striker,
          same = i.striker === before.striker && i.nonStriker === before.nonStriker;
        check(where, swap ? swapped : same, `strike after ${last.label} at ball ${i.balls}`);
      }
      if (!last.wicket) check(where, new Set([i.striker, i.nonStriker, before.striker, before.nonStriker]).size === 2, "batters changed without a wicket");
      if (last.wicket) check(where, i.wickets === before.wickets + 1, "wicket not counted");
      if (/NB/.test(last.label)) check(where, i.freeHit, "no free hit after a no-ball");
      if (before.freeHit && last.wicket) check(where, last.wicket === "run-out", `dismissed ${last.wicket} on a free hit`);
    }
  }
  return m;
}

function tamper(log: CricketLog, kind: number, keeper: number): CricketLog | null {
  const copy = structuredClone(log) as CricketLog & Record<string, unknown>[];
  const own = copy.findIndex((e) => e.k === "ball");
  switch (kind) {
    case 0: // A changed trajectory digest on one of the player's own deliveries.
      if (own < 0) return null;
      (copy[own] as { digest: string }).digest = (copy[own] as { digest: string }).digest === "00000000" ? "00000001" : "00000000";
      return copy;
    case 1: // A skipped sequence number.
      if (own < 0) return null;
      (copy[own] as { seq: number }).seq += 1;
      return copy;
    case 2: // A truncated log: the match isn't finished.
      return copy.slice(0, -1);
    case 3: // A duplicated entry.
      return [...copy.slice(0, 2), copy[1]!, ...copy.slice(2)] as CricketLog;
    case 4: // Time running backwards.
      (copy.at(-1) as { t: number }).t = 0;
      return copy;
    case 5: // An illegal field in the powerplay for an own delivery.
      if (own < 0 || (copy[own] as { field: string }).field === "deep") return null;
      (copy[own] as { field: string }).field = "deep";
      return copy;
    case 6: // The wicketkeeper named as the bowler (or any bowler named by the batting side).
      if (own < 0) return null;
      (copy[own] as { bowler?: number }).bowler = keeper;
      return copy;
    default: // Faster than the delivery can be played: every own ball's time pulled forward to the previous entry.
      for (let n = 1; n < copy.length; n++) if (copy[n]!.k === "ball") (copy[n] as { t: number }).t = (copy[n - 1] as { t: number }).t;
      return own < 0 ? null : copy;
  }
}

const started = performance.now();
const totals: Record<string, Record<string, number>> = {};
for (const format of ["t20", "odi"] as const) {
  const rules = FORMATS[format],
    tally: Record<string, number> = { matches: 0, verified: 0, tamperedRejected: 0, chase: 0, defend: 0, tie: 0, own: 0, sim: 0, runOuts: 0 };
  for (let s = 0; s < per; s++) {
    const a = (s * 7) % 20,
      b = (a + 1 + ((s * 11) % 19)) % 20,
      t = INTERNATIONAL_TEAMS[a]!,
      config: FormatConfig = { version: 2, format, team: t.id, opponent: INTERNATIONAL_TEAMS[b]!.id, xi: [...t.xi], captain: t.captain, keeper: t.keeper, venue: s % 2 ? "tideglass" : "lantern", difficulty: (["club", "county", "elite"] as const)[s % 3] };
    const seed = 120_000 + s * 31,
      where = `${format} #${s} seed ${seed}`,
      own = [0, 0, 4, 2, 7][s % 5]!;
    const m = play(where, seed, config, own, s % 2 ? "bat" : "bowl");
    if (!m) continue;
    tally.matches!++;
    check(where, m.innings.length === 2, "not two innings");
    for (const i of m.innings) checkInnings(where, i, rules);
    const [first, second] = m.innings as [Innings, Innings];
    if (second.runs > first.runs) {
      check(where, m.winner === second.team && second.closed === "target", "chase result");
      tally.chase!++;
    } else if (second.runs < first.runs) {
      check(where, m.winner === first.team, "defence result");
      tally.defend!++;
    } else {
      check(where, m.winner === null && m.result === "Match tied", "tie result");
      tally.tie!++;
    }
    tally.own! += m.controlled;
    tally.sim! += m.simulated;
    tally.runOuts! += m.innings.reduce((n, i) => n + i.batsmen.filter((x) => x.dismissal?.startsWith("run out")).length, 0);
    // Server verification of exactly what the browser would submit, and agreement with the browser's own result.
    const log = JSON.parse(JSON.stringify(m.inputLog)) as CricketLog,
      verified = sinverseCricket.verify(seed, config, sinverseCricket.logSchema.parse(log));
    if (!verified.ok) fail(where, `verification rejected: ${verified.reason}`);
    else {
      check(where, JSON.stringify(verified.result) === JSON.stringify(m.summary()), "server summary differs from the browser's");
      const earned = m.winner === 0 && m.controlled >= rules.minControlledBalls;
      check(where, verified.result.completed === earned, "win counted against the controlled-balls rule");
      tally.verified!++;
    }
    // Tamper with matches that include the player's own deliveries (own play every 4th or 2nd over).
    if (s % 5 === 2 || s % 5 === 3)
      for (let kind = 0; kind < 8; kind++) {
        const bad = tamper(log, kind, config.xi.indexOf(config.keeper));
        if (!bad) continue;
        const parsed = sinverseCricket.logSchema.safeParse(bad);
        const result = parsed.success ? sinverseCricket.verify(seed, config, parsed.data) : { ok: false };
        if (result.ok) fail(where, `tampered log ${kind} accepted`);
        else tally.tamperedRejected!++;
      }
  }
  totals[format] = tally;
  console.log(`${format}: ${JSON.stringify(tally)}`);
}
console.log(`${failures.length} failures in ${((performance.now() - started) / 1000).toFixed(0)} s (Node ${process.version})`);
if (failures.length) throw Error(`${failures.length} stress failures (first: ${failures[0]})`);
