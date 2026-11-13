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
import { sinverseCricket, type CricketLog, type FormatConfig } from "../src/sinverse-cricket";
import { playMatch } from "../test/cricket-fixtures";
import { MODES, benchCase, build } from "./cricket-logs";

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
  for (const mode of MODES) {
    const rows = [];
    for (let s = 0; s < per; s++) {
      const { config, seed } = benchCase(format, s);
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
