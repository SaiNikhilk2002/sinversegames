/**
 * Server verification benchmark for international cricket (engine v2).
 *
 *   CRICKET_MATCHES=<n> pnpm --filter @platform/engines bench:cricket
 *
 * Builds deterministic match logs the way a browser would (the player's own
 * deliveries plus simulated passages), then times `sinverseCricket.verify`,
 * which is exactly what POST /api/solo/submit runs. Reports CPU time (user +
 * system, from process.cpuUsage), wall time, heap growth and the JSON size of
 * the submitted body. These are local Node numbers, not Cloudflare Worker CPU.
 */
import { CricketMatch, INTERNATIONAL_TEAMS, STEP, VARIATIONS_FOR, sinverseCricket, type CricketLog, type FormatBallLog, type FormatConfig } from "../src/sinverse-cricket";
import { calibratedShot, playMatch } from "../test/cricket-fixtures";

type Mode = "sim" | "mixed" | "bowl-all" | "bat-all";
const cfg = (format: "t20" | "odi", a: number, b: number, difficulty: FormatConfig["difficulty"]): FormatConfig => {
  const t = INTERNATIONAL_TEAMS[a]!;
  return { version: 2, format, team: t.id, opponent: INTERNATIONAL_TEAMS[b]!.id, xi: [...t.xi], captain: t.captain, keeper: t.keeper, venue: a % 2 ? "tideglass" : "lantern", difficulty };
};

/** One full match log. `mode` decides which deliveries the player controls. */
function build(seed: number, config: FormatConfig, mode: Mode) {
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

function measure(seed: number, config: FormatConfig, log: CricketLog) {
  const body = JSON.stringify({ token: "x".repeat(600), log });
  (globalThis as { gc?: () => void }).gc?.();
  const heap = process.memoryUsage().heapUsed,
    cpu = process.cpuUsage(),
    wall = performance.now();
  // The submit route parses the body, then the log schema, then verifies.
  const parsed = sinverseCricket.logSchema.parse(JSON.parse(body).log);
  const verified = sinverseCricket.verify(seed, sinverseCricket.configSchema.parse(config), parsed);
  const used = process.cpuUsage(cpu);
  if (!verified.ok) throw Error(`verification failed: ${verified.reason}`);
  return { cpu: (used.user + used.system) / 1000, wall: performance.now() - wall, heap: (process.memoryUsage().heapUsed - heap) / 1048576, bytes: body.length };
}

const per = Number(process.env.CRICKET_MATCHES ?? (/^\d+$/.test(process.argv[2] ?? "") ? process.argv[2] : 10));
const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return { median: s[Math.floor(s.length / 2)]!, p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]!, max: s.at(-1)! };
};
const fmt = (n: number, d = 0) => n.toFixed(d);
console.log(`Node ${process.version}, ${per} matches per case, county/elite difficulty alternating`);
// The shipped 1- and 2-over duel, for reference.
for (const overs of [1, 2] as const) {
  const rows = [];
  for (let s = 0; s < per; s++) {
    const config = sinverseCricket.configSchema.parse({ overs, difficulty: s % 2 ? "elite" : "county" }),
      m = playMatch(52000 + s, true, config as never);
    rows.push({ ...measure(52000 + s, config as never, m.inputLog as CricketLog), balls: m.seq });
  }
  const cpu = stats(rows.map((r) => r.cpu));
  console.log(`duel ${overs} over${overs === 2 ? "s" : ""}: ${fmt(stats(rows.map((r) => r.balls)).median)} deliveries, CPU ms median ${fmt(cpu.median, 1)} / max ${fmt(cpu.max, 1)}, body KB median ${fmt(stats(rows.map((r) => r.bytes / 1024)).median, 1)}`);
}
console.log("case            | deliveries (med) | own (med) | CPU ms med / p95 / max | wall ms med / max | body KB med / max | heap MB max");
for (const format of ["t20", "odi"] as const)
  for (const mode of ["sim", "mixed", "bowl-all", "bat-all"] as Mode[]) {
    const rows = [];
    for (let s = 0; s < per; s++) {
      const a = (s * 3) % 20,
        b = (a + 1 + ((s * 7) % 19)) % 20,
        config = cfg(format, a, b, s % 2 ? "elite" : "county"),
        seed = 41000 + s * 17;
      const built = build(seed, config, mode);
      rows.push({ ...measure(seed, config, built.log), balls: built.balls, own: built.controlled });
    }
    const cpu = stats(rows.map((r) => r.cpu)),
      wall = stats(rows.map((r) => r.wall)),
      kb = stats(rows.map((r) => r.bytes / 1024));
    console.log(
      `${`${format} ${mode}`.padEnd(15)} | ${fmt(stats(rows.map((r) => r.balls)).median).padStart(16)} | ${fmt(stats(rows.map((r) => r.own)).median).padStart(9)} | ${`${fmt(cpu.median)} / ${fmt(cpu.p95)} / ${fmt(cpu.max)}`.padStart(22)} | ${`${fmt(wall.median)} / ${fmt(wall.max)}`.padStart(17)} | ${`${fmt(kb.median, 1)} / ${fmt(kb.max, 1)}`.padStart(17)} | ${fmt(Math.max(...rows.map((r) => r.heap)), 1)}`,
    );
  }
