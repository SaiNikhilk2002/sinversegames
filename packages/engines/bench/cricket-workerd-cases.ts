/**
 * Writes the verification bench's match logs to a JSON file for the workerd harness
 * (`bench/cricket-workerd.mjs`). Same seeds, teams and modes as `cricket-verify.ts`.
 *
 *   CRICKET_MATCHES=10 CRICKET_CASES_OUT=<file> pnpm --filter @platform/engines bench:workerd:cases
 */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sinverseCricket } from "../src/sinverse-cricket";
import { MODES, benchCase, build, buildNoBallFlood } from "./cricket-logs";

const per = Number(process.env.CRICKET_MATCHES ?? 10);
const out = process.env.CRICKET_CASES_OUT ?? join(tmpdir(), "cricket-workerd-cases.json");
const cases = [];
for (const format of ["t20", "odi"] as const)
  for (const mode of MODES)
    for (let s = 0; s < per; s++) {
      const { config, seed } = benchCase(format, s);
      const built = build(seed, config, mode);
      const verified = sinverseCricket.verify(seed, config, built.log);
      if (!verified.ok) throw Error(`case ${format} ${mode} ${s} doesn't verify in Node: ${verified.reason}`);
      cases.push({ name: `${format} ${mode}`, seed, config, log: built.log, deliveries: built.balls, ok: true, score: verified.result.score });
    }
// Adversarial: a modified client's costliest log (see buildNoBallFlood), which the server must replay before rejecting.
for (const format of ["t20", "odi"] as const)
  for (let s = 0; s < Math.min(per, 5); s++) {
    const { config, seed } = benchCase(format, s);
    const built = buildNoBallFlood(seed, config);
    const cpu = process.cpuUsage();
    const verified = sinverseCricket.verify(seed, config, built.log);
    const used = process.cpuUsage(cpu);
    if (verified.ok) throw Error("a no-ball flood verified");
    console.log(`${format} no-ball flood ${s}: ${built.log.length} entries, ${built.balls} deliveries, ended ${built.phase}, claims ${(built.ms / 60000).toFixed(0)} min of play, ${(JSON.stringify(built.log).length / 1024).toFixed(0)} KB, Node CPU ${((used.user + used.system) / 1000).toFixed(0)} ms, rejected: ${verified.reason}`);
    cases.push({ name: `${format} no-ball flood`, seed, config, log: built.log, deliveries: built.balls, ok: false, score: null, reason: verified.reason });
  }
writeFileSync(out, JSON.stringify(cases));
console.log(`wrote ${cases.length} cases to ${out}`);
