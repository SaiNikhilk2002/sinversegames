import { createHmac, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  cricketRequestHash,
  signCricketVerifyJob,
  signRunToken,
  verifyCricketVerdict,
} from "@platform/shared/identity";
import { sinverseCricket, type CricketLog } from "@platform/engines/sinverse-cricket";
import { seededRng } from "@platform/engines";
import { testConfig } from "../src/config";
import { noopPersistence } from "../src/persistence";
import { createRealtimeServer, type RealtimeServer } from "../src/server";
import type { CricketVerifierOptions } from "../src/cricket-verifier";
import { cfg, play } from "../../../packages/engines/test/cricket-format-helpers";
import { playMatch } from "../../../packages/engines/test/cricket-fixtures";

/**
 * POST /internal/cricket/verify (docs/CRICKET_RAILWAY_VERIFICATION_DESIGN.md): the realtime service
 * replays cricket for the web app, only for a one-use job signed for that exact request, and answers
 * with a verdict bound to it.
 */
const SECRET = testConfig().AUTH_SECRET;
/** A hand-built HS256 JWT, for tokens the library refuses to issue (an already expired job). */
const jwt = (payload: Record<string, unknown>, secret = SECRET) => {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = `${part({ alg: "HS256" })}.${part(payload)}`;
  return `${head}.${createHmac("sha256", secret).update(head).digest("base64url")}`;
};
const servers: RealtimeServer[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
});
async function start(cricketVerifier: CricketVerifierOptions = {}) {
  const server = createRealtimeServer({ config: testConfig(), persistence: noopPersistence, rng: seededRng(1), cricketVerifier });
  servers.push(server);
  const port = await server.listen(0, "127.0.0.1");
  return { server, url: `http://127.0.0.1:${port}` };
}

/** A run token as /api/solo/start issues it, and the match's log. */
async function run(config: Record<string, unknown>, seed: number, log: CricketLog, sub = `player-${randomUUID().slice(0, 8)}`, gameId = "sinverse-cricket") {
  const jti = randomUUID();
  const token = await signRunToken({ sub, gameId: gameId as "sinverse-cricket", seed, config, jti }, SECRET);
  return { sub, jti, token, seed, config, log, body: JSON.stringify(log) };
}
type Run = Awaited<ReturnType<typeof run>>;

/** What the web app sends: a job for this exact request, the run token, and the log. */
async function send(url: string, r: Run, opts: { body?: string; job?: string; jobFor?: { sub?: string; run?: string; hash?: string } } = {}) {
  const body = opts.body ?? r.body;
  const hash = opts.jobFor?.hash ?? (await cricketRequestHash(r.token, r.body));
  const job = opts.job ? { token: opts.job, jti: "" } : await signCricketVerifyJob({ sub: opts.jobFor?.sub ?? r.sub, run: opts.jobFor?.run ?? r.jti, hash }, SECRET);
  const res = await fetch(`${url}/internal/cricket/verify`, {
    method: "POST",
    headers: { authorization: `Bearer ${job.token}`, "x-run-token": r.token, "content-type": "application/json" },
    body,
  });
  return { res, json: (await res.json()) as { verdict?: string; error?: string }, job, hash };
}

const t20 = (() => {
  // A fully simulated T20, as the browser builds it ("Simulate innings").
  const config = cfg("t20", 0, 18);
  const m = play(310, config);
  return { config, seed: 310, log: m.inputLog as CricketLog };
})();

describe("cricket verification on the realtime service", () => {
  it("replays a T20 and returns exactly the web app's own result, signed for this job, run and request", async () => {
    const { url } = await start();
    const r = await run(t20.config, t20.seed, t20.log);
    const { res, json, job, hash } = await send(url, r);
    expect(res.status).toBe(200);
    const local = sinverseCricket.verify(r.seed, sinverseCricket.configSchema.parse(r.config), t20.log);
    if (!local.ok) throw Error(local.reason);
    expect(await verifyCricketVerdict(json.verdict!, SECRET, { job: job.jti, run: r.jti, hash })).toEqual(JSON.parse(JSON.stringify(local.result)));
  });

  it("replays the 1-over duel too (version 1), unchanged", async () => {
    const { url } = await start();
    const config = sinverseCricket.configSchema.parse({ overs: 1 });
    const m = playMatch(52001, true, config as never);
    const r = await run(config as Record<string, unknown>, 52001, m.inputLog as CricketLog);
    const { res, json, job, hash } = await send(url, r);
    expect(res.status).toBe(200);
    const result = (await verifyCricketVerdict(json.verdict!, SECRET, { job: job.jti, run: r.jti, hash })) as { details: { format: string } };
    expect(result.details.format).toBe("duel");
  });

  it("refuses a request without a job, with a forged job, or with an expired job", async () => {
    const { url } = await start();
    const r = await run(t20.config, t20.seed, t20.log);
    const none = await fetch(`${url}/internal/cricket/verify`, { method: "POST", headers: { "x-run-token": r.token }, body: r.body });
    expect(none.status).toBe(401);
    const forged = await signCricketVerifyJob({ sub: r.sub, run: r.jti, hash: await cricketRequestHash(r.token, r.body) }, "another-secret-another-secret-another-0");
    expect((await send(url, r, { job: forged.token })).res.status).toBe(401);
    const now = Math.floor(Date.now() / 1000);
    const fields = { purpose: "cricket-verify", run: r.jti, hash: await cricketRequestHash(r.token, r.body), sub: r.sub, iss: "platform", aud: "cricket-verifier", jti: randomUUID() };
    // The same claims, valid when fresh (proving the hand-built token is otherwise right)...
    expect((await send(url, r, { job: jwt({ ...fields, iat: now, exp: now + 60 }) })).res.status).toBe(200);
    // ...and refused once expired.
    const expired = jwt({ ...fields, jti: randomUUID(), iat: now - 120, exp: now - 60 });
    expect((await send(url, r, { job: expired })).res.status).toBe(401);
  });

  it("refuses a replayed job, even with the same request", async () => {
    const { url } = await start();
    const r = await run(t20.config, t20.seed, t20.log);
    const hash = await cricketRequestHash(r.token, r.body);
    const job = await signCricketVerifyJob({ sub: r.sub, run: r.jti, hash }, SECRET);
    expect((await send(url, r, { job: job.token })).res.status).toBe(200);
    const again = await send(url, r, { job: job.token });
    expect(again.res.status).toBe(401);
    expect(again.json.error).toBe("job_replayed");
  });

  it("refuses a log changed after the job was issued", async () => {
    const { url } = await start();
    const r = await run(t20.config, t20.seed, t20.log);
    const tampered = JSON.stringify(t20.log.slice(0, -1));
    const { res, json } = await send(url, r, { body: tampered });
    expect(res.status).toBe(401);
    expect(json.error).toBe("job_mismatch");
  });

  it("refuses another player's run, or a job for another run", async () => {
    const { url } = await start();
    const r = await run(t20.config, t20.seed, t20.log);
    expect((await send(url, r, { jobFor: { sub: "someone-else" } })).res.status).toBe(403);
    expect((await send(url, r, { jobFor: { run: randomUUID() } })).res.status).toBe(403);
  });

  it("refuses a run token for another game, or not signed by the web app", async () => {
    const { url } = await start();
    const other = await run(t20.config, t20.seed, t20.log, undefined, "cuisine-quest");
    expect((await send(url, other)).json.error).toBe("not_cricket");
    const r = await run(t20.config, t20.seed, t20.log);
    const foreign = { ...r, token: await signRunToken({ sub: r.sub, gameId: "sinverse-cricket", seed: r.seed, config: r.config, jti: r.jti }, "another-secret-another-secret-another-0") };
    expect((await send(url, foreign)).json.error).toBe("invalid_run");
  });

  it("refuses a tampered delivery by replaying it, then won't replay that run again, whatever its log", async () => {
    const { url, server } = await start();
    void server;
    // Change one delivery's digest: what a modified client would have to do to claim another outcome.
    const own = play(311, cfg("t20", 2, 5), 1);
    const log = own.inputLog as CricketLog;
    const i = log.findIndex((e) => e.k === "ball");
    const tampered = log.map((e, k) => (k === i ? { ...e, digest: "00000000" } : e)) as CricketLog;
    const bad = await run(cfg("t20", 2, 5), 311, tampered);
    const first = await send(url, bad);
    expect(first.res.status).toBe(422);
    expect(first.json.error).toMatch(/Invalid cricket action|digest/i);
    // The genuine log, under the same run (a new job), is not replayed: the run is spent.
    const genuine = { ...bad, log, body: JSON.stringify(log) };
    const second = await send(url, genuine);
    expect(second.res.status).toBe(422);
    expect(second.json.error).toBe("This game's log was already rejected");
  });

  it("refuses a body over 512 KB without replaying it", async () => {
    const { url } = await start();
    const r = await run(t20.config, t20.seed, t20.log);
    const huge = JSON.stringify([{ pad: "x".repeat(600 * 1024) }]);
    const { res } = await send(url, { ...r, body: huge });
    expect(res.status).toBe(413);
  });

  it("replays concurrent submissions correctly, and turns away more than the queue holds", async () => {
    const { url } = await start({ maxQueue: 2, perPlayer: 5 });
    const runs = await Promise.all([0, 1, 2, 3].map(() => run(t20.config, t20.seed, t20.log)));
    const results = await Promise.all(runs.map((r) => send(url, r)));
    const codes = results.map((x) => x.res.status).sort();
    expect(codes.filter((c) => c === 200).length).toBeGreaterThanOrEqual(2);
    expect(codes.every((c) => c === 200 || c === 503)).toBe(true);
    for (const [k, x] of results.entries()) if (x.res.status === 200) expect(await verifyCricketVerdict(x.json.verdict!, SECRET, { job: x.job.jti, run: runs[k]!.jti, hash: x.hash })).toMatchObject({ details: { format: "t20" } });
  });

  it("limits how many verifications one player can have at once", async () => {
    const { url } = await start({ perPlayer: 1 });
    const a = await run(t20.config, t20.seed, t20.log, "same-player");
    const b = await run(t20.config, t20.seed, t20.log, "same-player");
    const [x, y] = await Promise.all([send(url, a), send(url, b)]);
    expect([x.res.status, y.res.status].sort()).toEqual([200, 503]);
  });

  it("keeps the server responsive while an ODI is replayed in the worker thread", async () => {
    const { url } = await start();
    const config = cfg("odi", 3, 9);
    const m = play(312, config);
    const r = await run(config, 312, m.inputLog as CricketLog);
    const verifying = send(url, r);
    const delays: number[] = [];
    for (let k = 0; k < 8; k++) {
      const t = performance.now();
      expect((await fetch(`${url}/health`)).status).toBe(200);
      delays.push(performance.now() - t);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect((await verifying).res.status).toBe(200);
    // The ODI replay takes a few hundred ms of CPU; the event loop answers health checks meanwhile.
    expect(Math.max(...delays)).toBeLessThan(150);
  }, 60_000);

  it("replaces a thread that takes too long, answers 503 (retryable, not a refusal), and recovers", async () => {
    const { url } = await start({ taskTimeoutMs: 1 });
    const r = await run(t20.config, t20.seed, t20.log);
    const slow = await send(url, r);
    expect(slow.res.status).toBe(503);
    expect(slow.json.error).toBe("verification_unavailable");
    // Not remembered as rejected: a later attempt on the same run is replayed again.
    const again = await send(url, r);
    expect(again.json.error).not.toBe("This game's log was already rejected");
  });
});
