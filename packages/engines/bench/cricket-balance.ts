/**
 * AI balance report for international cricket (engine v2).
 *
 *   CRICKET_MATCHES=<n> pnpm --filter @platform/engines bench:balance
 *
 * Simulates whole matches (both sides played by the AI captains) for each
 * format and difficulty. The player's side always plays at the neutral county
 * level and the difficulty describes only the opposition, exactly as in a
 * simulated passage, so the columns show what each difficulty does to the
 * opposition's play. Deterministic: the same seeds give the same report.
 */
import { CricketMatch, INTERNATIONAL_TEAMS, type FormatConfig } from "../src/sinverse-cricket";

const per = Number(process.env.CRICKET_MATCHES ?? (/^\d+$/.test(process.argv[2] ?? "") ? process.argv[2] : 40));
type Row = Record<string, number>;
const mean = (rows: Row[], k: string) => rows.reduce((n, r) => n + (r[k] ?? 0), 0) / rows.length;
console.log(`${per} simulated matches per cell; the player's side (county AI) against the opposition at each difficulty`);
console.log("format | opposition | opp. runs conceded | opp. wickets taken | opp. extras | opp. batting runs | opp. batting wkts | player side wins % | ties | run rate (both) | 4s+6s per inn | run-outs per match");
for (const format of ["t20", "odi"] as const)
  for (const difficulty of ["club", "county", "elite"] as const) {
    const rows: Row[] = [];
    for (let s = 0; s < per; s++) {
      const a = (s * 3) % 20,
        b = (a + 1 + ((s * 7) % 19)) % 20,
        t = INTERNATIONAL_TEAMS[a]!;
      const config: FormatConfig = { version: 2, format, team: t.id, opponent: INTERNATIONAL_TEAMS[b]!.id, xi: [...t.xi], captain: t.captain, keeper: t.keeper, venue: s % 2 ? "tideglass" : "lantern", difficulty };
      const m = new CricketMatch(70000 + s * 13, config);
      m.toss({ k: "toss", call: m.tossFace, decision: s % 2 ? "bat" : "bowl", t: 0 });
      let time = 0;
      while (m.phase !== "finished") {
        if (m.phase === "interval") m.nextInnings();
        m.simulate({ k: "sim", seq: m.seq, balls: 600, t: (time += 1000) });
      }
      const mine = m.innings.find((i) => i.team === 0)!,
        theirs = m.innings.find((i) => i.team === 1)!;
      const extras = (i: typeof mine) => i.extras.wides + i.extras.noBalls;
      const boundaries = (i: typeof mine) => i.batsmen.reduce((n, x) => n + x.fours + x.sixes, 0);
      const runOuts = m.innings.reduce((n, i) => n + i.batsmen.filter((x) => x.dismissal?.startsWith("run out")).length, 0);
      rows.push({
        conceded: mine.runs,
        taken: mine.wickets,
        extras: extras(mine),
        batRuns: theirs.runs,
        batWkts: theirs.wickets,
        win: m.winner === 0 ? 1 : 0,
        tie: m.winner === null ? 1 : 0,
        rr: ((mine.runs + theirs.runs) * 6) / Math.max(1, mine.balls + theirs.balls),
        bnd: (boundaries(mine) + boundaries(theirs)) / 2,
        ro: runOuts,
      });
    }
    const f = (k: string, d = 1) => mean(rows, k).toFixed(d);
    console.log(`${format} | ${difficulty} | ${f("conceded")} | ${f("taken")} | ${f("extras")} | ${f("batRuns")} | ${f("batWkts")} | ${(mean(rows, "win") * 100).toFixed(0)} | ${rows.filter((r) => r.tie).length} | ${f("rr", 2)} | ${f("bnd")} | ${f("ro", 2)}`);
  }
