/**
 * Cricket verification on the realtime service: end-to-end latency of POST /internal/cricket/verify
 * (job check, body, run token, worker-thread replay, signed verdict), and how much the main event
 * loop, which serves every live multiplayer room, is delayed meanwhile.
 *
 *   pnpm --filter @platform/realtime bench:verify            (BENCH_MATCHES=5 by default)
 *
 * Uses the engine bench's deterministic logs (packages/engines/bench/cricket-logs.ts), including the
 * costliest crafted log. Local loopback, so network time is near zero: add your Worker-to-Railway
 * round trip for production.
 */
import { randomUUID } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { cricketRequestHash, signCricketVerifyJob, signRunToken } from "@platform/shared/identity";
import { seededRng } from "@platform/engines";
import type { CricketLog } from "@platform/engines/sinverse-cricket";
import { testConfig } from "../src/config";
import { noopPersistence } from "../src/persistence";
import { createRealtimeServer } from "../src/server";
import { benchCase, build, buildNoBallFlood, type Mode } from "../../../packages/engines/bench/cricket-logs";

const SECRET = testConfig().AUTH_SECRET;
const per = Number(process.env.BENCH_MATCHES ?? 5);
const server = createRealtimeServer({ config: testConfig({ LOG_LEVEL: "error" }), persistence: noopPersistence, rng: seededRng(1), cricketVerifier: { maxQueue: 64, perPlayer: 64, taskTimeoutMs: 60_000 } });
const port = await server.listen(0, "127.0.0.1");
const url = `http://127.0.0.1:${port}/internal/cricket/verify`;

async function verifyOnce(seed: number, config: Record<string, unknown>, log: CricketLog) {
  const sub = `bench-${randomUUID().slice(0, 8)}`, jti = randomUUID();
  const token = await signRunToken({ sub, gameId: "sinverse-cricket", seed, config, jti }, SECRET);
  const body = JSON.stringify(log);
  const started = performance.now();
  const job = await signCricketVerifyJob({ sub, run: jti, hash: await cricketRequestHash(token, body) }, SECRET);
  const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${job.token}`, "x-run-token": token }, body });
  await res.json();
  return { ms: performance.now() - started, status: res.status, kb: body.length / 1024 };
}

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return `${s[Math.floor(s.length / 2)]!.toFixed(0)} / ${s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]!.toFixed(0)} / ${s.at(-1)!.toFixed(0)}`;
};

const loop = monitorEventLoopDelay({ resolution: 10 });
console.log(`Node ${process.version}; ${per} matches per case; one worker thread; local loopback`);
console.log("case               | body KB max | status | end-to-end ms median / p95 / max");
const cases: { name: string; make: (s: number) => { seed: number; config: Record<string, unknown>; log: CricketLog }; expect: number }[] = [];
for (const format of ["t20", "odi"] as const)
  for (const mode of ["sim", "bowl-all"] as Mode[])
    cases.push({ name: `${format} ${mode}`, expect: 200, make: (s) => { const { config, seed } = benchCase(format, s); return { seed, config, log: build(seed, config, mode).log }; } });
cases.push({ name: "crafted no-ball flood", expect: 422, make: (s) => { const { config, seed } = benchCase("odi", s); return { seed, config, log: buildNoBallFlood(seed, config).log }; } });
loop.enable();
for (const c of cases) {
  const times: number[] = [], sizes: number[] = [], statuses = new Set<number>();
  for (let s = 0; s < per; s++) {
    const m = c.make(s);
    loop.reset();
    const r = await verifyOnce(m.seed, m.config, m.log);
    times.push(r.ms);
    sizes.push(r.kb);
    statuses.add(r.status);
  }
  console.log(`${c.name.padEnd(18)} | ${Math.max(...sizes).toFixed(1).padStart(11)} | ${[...statuses].join(",").padStart(6)} | ${stats(times)}  (event-loop delay during the last one: max ${(loop.max / 1e6).toFixed(1)} ms)`);
  if (![...statuses].every((x) => x === c.expect)) console.log(`   UNEXPECTED status for ${c.name}`);
}
loop.disable();
await server.close();
process.exit(0);
