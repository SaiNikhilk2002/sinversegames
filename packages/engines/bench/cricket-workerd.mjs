/**
 * Times international cricket verification inside workerd, the Cloudflare Workers runtime,
 * running locally under the workspace's pinned Wrangler (`wrangler dev`, local mode). Nothing is
 * uploaded and no Cloudflare account is used.
 *
 *   CRICKET_MATCHES=10 CRICKET_CASES_OUT=<file> pnpm --filter @platform/engines bench:workerd:cases
 *   node packages/engines/bench/cricket-workerd.mjs <file>        (from the repository root)
 *
 * The Worker (`bench/workerd/worker.ts`) does what POST /api/solo/submit does after
 * authentication. Each case is posted to /parse (HTTP, JSON.parse and the log schema only) and to
 * /verify (the same, plus the full replay); the difference is the replay's cost in workerd.
 * Deployed Workers freeze timers between I/O (a Spectre mitigation); local workerd doesn't, so
 * `inWorkerMs` (performance.now() inside the Worker) is reported alongside the client's timings.
 *
 * These are LOCAL workerd wall-clock figures on this machine. They are not Cloudflare's billed CPU
 * time and don't prove a production limit is met.
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const file = process.argv[2];
if (!file) throw Error("usage: node cricket-workerd.mjs <cases.json>");
const cases = JSON.parse(readFileSync(file, "utf8"));
const repeat = Number(process.env.CRICKET_REPEAT ?? 3);
const port = Number(process.env.CRICKET_WORKERD_PORT ?? 8799);
const base = `http://127.0.0.1:${port}`;

const wranglerVersion = JSON.parse(readFileSync(join(root, "node_modules/wrangler/package.json"), "utf8")).version;
const bin = join(root, "node_modules/wrangler/bin/wrangler.js");
// A throwaway configuration outside the repository, so Wrangler doesn't pick up the production
// Worker's (it searches parent directories). Same compatibility date and flags as production.
const configDir = mkdtempSync(join(tmpdir(), "cricket-workerd-"));
const config = join(configDir, "wrangler.json");
writeFileSync(config, JSON.stringify({ name: "cricket-verify-bench-local", main: join(here, "workerd/worker.ts"), compatibility_date: "2026-10-01", compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"], workers_dev: false }));
const dev = spawn(
  process.execPath,
  [bin, "dev", "--config", config, "--ip", "127.0.0.1", "--port", String(port), "--show-interactive-dev-session=false", "--log-level", "warn"],
  { cwd: here, env: { ...process.env, WRANGLER_SEND_METRICS: "false", CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_ACCOUNT_ID: "" }, stdio: ["ignore", "pipe", "pipe"] },
);
let devLog = "";
dev.stdout.on("data", (d) => (devLog += d));
dev.stderr.on("data", (d) => (devLog += d));
const stop = () => {
  if (dev.exitCode !== null) return;
  if (process.platform === "win32") {
    try { execFileSync("taskkill", ["/pid", String(dev.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* already gone */ }
  } else dev.kill("SIGTERM");
};
process.on("exit", stop);

const post = async (path, body) => {
  const started = performance.now();
  const res = await fetch(base + path, { method: "POST", body, headers: { "content-type": "application/json" } });
  const json = await res.json();
  return { ms: performance.now() - started, json, status: res.status };
};

async function ready() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (dev.exitCode !== null) throw Error(`wrangler dev exited (${dev.exitCode}):\n${devLog}`);
    try {
      const r = await post("/parse", JSON.stringify({ seed: 1, config: {}, log: [{ k: "toss", call: "heads", decision: "bat", t: 0 }] }));
      if (r.status === 200) return;
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error(`wrangler dev did not start:\n${devLog}`);
}

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return { median: s[Math.floor(s.length / 2)], p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))], max: s.at(-1) };
};
const f = (n) => n.toFixed(0);

try {
  await ready();
  console.log(`workerd via wrangler ${wranglerVersion} (local), Node ${process.version} client, ${cases.length} cases, ${repeat} timed run(s) each`);
  // Warm up the isolate (first requests compile the bundle).
  for (const c of cases.slice(0, 4)) await post("/verify", JSON.stringify({ token: "x".repeat(600), seed: c.seed, config: c.config, log: c.log }));
  const groups = new Map();
  let mismatches = 0;
  for (const c of cases) {
    const body = JSON.stringify({ token: "x".repeat(600), seed: c.seed, config: c.config, log: c.log });
    const g = groups.get(c.name) ?? { verify: [], parse: [], replay: [], deliveries: [], kb: [], inWorker: [] };
    for (let r = 0; r < repeat; r++) {
      const p = await post("/parse", body);
      const v = await post("/verify", body);
      if (v.json.ok !== c.ok || (c.ok && v.json.score !== c.score)) mismatches++;
      g.verify.push(v.ms);
      g.parse.push(p.ms);
      g.replay.push(Math.max(0, v.ms - p.ms));
      g.inWorker.push(v.json.inWorkerMs);
    }
    g.deliveries.push(c.deliveries);
    g.kb.push(body.length / 1024);
    groups.set(c.name, g);
  }
  console.log("case            | deliveries (med) | body KB max | /verify ms med / p95 / max | /parse ms med | replay ms med / p95 / max | in-Worker timer max");
  for (const [name, g] of groups) {
    const v = stats(g.verify), p = stats(g.parse), r = stats(g.replay);
    console.log(`${name.padEnd(15)} | ${f(stats(g.deliveries).median).padStart(16)} | ${stats(g.kb).max.toFixed(1).padStart(11)} | ${`${f(v.median)} / ${f(v.p95)} / ${f(v.max)}`.padStart(26)} | ${f(p.median).padStart(13)} | ${`${f(r.median)} / ${f(r.p95)} / ${f(r.max)}`.padStart(25)} | ${stats(g.inWorker).max.toFixed(1)}`);
  }
  console.log(mismatches ? `MISMATCH: ${mismatches} verification(s) in workerd differed from Node` : "Every verification in workerd matched Node's result exactly (adversarial logs rejected in both).");
  if (mismatches) process.exitCode = 1;
} finally {
  stop();
}
