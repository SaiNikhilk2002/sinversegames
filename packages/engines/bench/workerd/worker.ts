/**
 * LOCAL BENCH ONLY: run by `node bench/cricket-workerd.mjs` under `wrangler dev --local`
 * (workerd on this machine). Never deploy it; it has no configuration file to deploy with.
 *
 * POST /verify does what POST /api/solo/submit does after authentication: read the body as
 * text, JSON.parse it, the config and log schemas, then `sinverseCricket.verify`.
 * POST /parse stops after the log schema, as a baseline for HTTP and parsing.
 */
import { sinverseCricket } from "../../src/sinverse-cricket";

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method !== "POST") return new Response("POST /verify or /parse", { status: 405 });
    const started = performance.now();
    const body = JSON.parse(await req.text()) as { seed: number; config: unknown; log: unknown };
    const log = sinverseCricket.logSchema.parse(body.log);
    const config = sinverseCricket.configSchema.parse(body.config);
    if (url.pathname === "/parse") return Response.json({ ok: true, entries: log.length, inWorkerMs: performance.now() - started });
    const verified = sinverseCricket.verify(body.seed, config, log);
    return Response.json({ ok: verified.ok, score: verified.ok ? verified.result.score : null, reason: verified.ok ? null : verified.reason, inWorkerMs: performance.now() - started });
  },
};
