/**
 * Deterministic international match logs, built the way a browser builds them
 * (the player's own deliveries with real digests and pacing, plus simulated
 * passages). Shared by the Node verification bench and the workerd harness, so
 * both time exactly the same submissions.
 */
import { CricketMatch, INTERNATIONAL_TEAMS, STEP, VARIATIONS_FOR, type CricketLog, type FormatBallLog, type FormatConfig } from "../src/sinverse-cricket";
import { calibratedShot } from "../test/cricket-fixtures";

export type Mode = "sim" | "mixed" | "bowl-all" | "bat-all";
export const MODES: Mode[] = ["sim", "mixed", "bowl-all", "bat-all"];
export const cfg = (format: "t20" | "odi", a: number, b: number, difficulty: FormatConfig["difficulty"]): FormatConfig => {
  const t = INTERNATIONAL_TEAMS[a]!;
  return { version: 2, format, team: t.id, opponent: INTERNATIONAL_TEAMS[b]!.id, xi: [...t.xi], captain: t.captain, keeper: t.keeper, venue: a % 2 ? "tideglass" : "lantern", difficulty };
};
/** The bench's case `s` for a format: its team pair, difficulty and seed. */
export const benchCase = (format: "t20" | "odi", s: number) => {
  const a = (s * 3) % 20,
    b = (a + 1 + ((s * 7) % 19)) % 20;
  return { config: cfg(format, a, b, s % 2 ? "elite" : "county"), seed: 41000 + s * 17 };
};

/** One full match log. `mode` decides which deliveries the player controls. */
export function build(seed: number, config: FormatConfig, mode: Mode) {
  const m = new CricketMatch(seed, config);
  m.toss({ k: "toss", call: m.tossFace, decision: mode === "bat-all" ? "bat" : mode === "bowl-all" ? "bowl" : seed % 2 ? "bat" : "bowl", t: 0 });
  let t = 0;
  while (m.phase !== "finished") {
    if (m.phase === "interval") m.nextInnings();
    const over = Math.floor(m.current.balls / 6),
      batting = m.humanBatting;
    const own = mode === "mixed" ? over % 3 === 0 : mode === "bowl-all" ? !batting : mode === "bat-all" ? batting : false;
    if (own) {
      const newOver = m.current.balls % 6 === 0 && m.current.overBowlers![over] === undefined;
      const options = batting ? [] : m.bowlerOptions();
      const slot = batting ? -1 : newOver ? options[options.length - 1]! : m.current.bowlers[m.current.overBowlers![over]!]!.slot!;
      const bowls = batting ? null : (m.sides[1 - m.current.team]!.players[slot]!.bowls ?? "medium");
      const move = {
        bowling: batting ? null : { variation: VARIATIONS_FOR[bowls!][0]!, line: 0.1, length: 4.5, speed: 0.6, release: 0 },
        shot: batting ? calibratedShot(m) : null,
        runAt: [] as number[],
        field: m.fieldForAI() as FormatBallLog["field"],
        ...(newOver && !batting ? { bowler: slot } : {}),
      };
      const d = m.createDelivery(move, false);
      d.complete();
      t += Math.ceil(d.tick * STEP * 1000) + 1000;
      if (!m.record({ k: "ball", seq: m.seq, ...move, digest: d.digest, t }, d)) throw Error("own delivery rejected");
    } else {
      t += 1500;
      // The UI's "Simulate innings" in sim mode; one over at a time otherwise.
      if (!m.simulate({ k: "sim", seq: m.seq, balls: mode === "sim" ? 600 : 6 - (m.current.balls % 6), t })) throw Error("simulation refused");
    }
  }
  return { log: m.inputLog as CricketLog, balls: m.seq, controlled: m.controlled };
}

/**
 * The costliest log a modified client could send: the player bowls the first innings and
 * oversteps on every ball. No-balls aren't legal deliveries, so the innings never reaches its
 * over limit, and each one is batted (and its runs judged) by the AI. The log stops at the
 * submit route's 512 KB body limit (or the schema's 4,000 entries), unfinished, so the server
 * replays all of it and then rejects it.
 * Its times are the least the replay allows, the most compressed timeline possible.
 */
export function buildNoBallFlood(seed: number, config: FormatConfig, entries = 4000, maxBytes = 512 * 1024 - 1024) {
  const m = new CricketMatch(seed, config);
  m.toss({ k: "toss", call: m.tossFace, decision: "bowl", t: 0 });
  let t = 0,
    bytes = JSON.stringify(m.inputLog).length + 700; // the body's token and wrapper
  while (m.phase === "ready" && m.inputLog.length < entries) {
    const over = Math.floor(m.current.balls / 6);
    const newOver = m.current.balls % 6 === 0 && m.current.overBowlers![over] === undefined;
    const slot = newOver ? m.bowlerOptions().at(-1)! : m.current.bowlers[m.current.overBowlers![over]!]!.slot!;
    const bowls = m.sides[1 - m.current.team]!.players[slot]!.bowls ?? "medium";
    const move = { bowling: { variation: VARIATIONS_FOR[bowls][0]!, line: 0.1, length: 4.5, speed: 0.6, release: 1 }, shot: null, runAt: [] as number[], field: m.fieldForAI() as FormatBallLog["field"], ...(newOver ? { bowler: slot } : {}) };
    const d = m.createDelivery(move, false);
    d.complete();
    t += Math.floor((d.tick / 120) * 1000 * 0.45) + 1;
    const entry = { k: "ball" as const, seq: m.seq, ...move, digest: d.digest, t };
    bytes += JSON.stringify(entry).length + 1;
    if (bytes > maxBytes) break;
    if (!m.record(entry, d)) throw Error("no-ball rejected");
  }
  return { log: m.inputLog as CricketLog, balls: m.seq, phase: m.phase, ms: m.inputLog.at(-1)!.t };
}
