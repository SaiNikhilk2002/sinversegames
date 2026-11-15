import type { IncomingMessage, ServerResponse } from "node:http";
import { Worker } from "node:worker_threads";
import { InvalidTokenError, cricketRequestHash, signCricketVerdict, verifyCricketVerifyJob, verifyRunToken } from "@platform/shared/identity";
import type { Logger } from "./logger";
import type { VerifyOutcome, VerifyTask } from "./cricket-verify-worker";

/**
 * POST /internal/cricket/verify: the realtime service replays cricket matches for the web app,
 * so a T20 or ODI never needs more CPU than Workers Free allows (docs/CRICKET_RAILWAY_VERIFICATION_DESIGN.md).
 *
 * The web app has already authenticated the player, checked ownership, the log's shape, its pace and
 * that the run isn't saved. This service trusts none of that by itself: it requires a one-use job
 * signed for this exact request, checks the run token's own signature and owner, replays the whole
 * log in a worker thread, and answers with a verdict signed for that job, run and request.
 */
export const MAX_LOG_BYTES = 512 * 1024;
/** One-use job ids are remembered a little longer than a job lives (60 s). */
const JOB_MEMORY_MS = 120_000;
const MAX_REMEMBERED_JOBS = 20_000;
/** Runs whose logs failed verification; their tokens can't be retried here. */
const MAX_REJECTED_RUNS = 20_000;

export interface VerifierPoolOptions {
  /** Longest one replay may take before its thread is replaced (the costliest crafted log takes a few seconds). */
  taskTimeoutMs?: number;
  /** Verifications waiting or running at once; more get 503 (the web app tells the player to retry). */
  maxQueue?: number;
  /** Memory cap for the replay thread. */
  maxOldGenerationSizeMb?: number;
}

/** One worker thread replaying matches one at a time, off the event loop that serves live rooms. */
export class VerifierPool {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly queue: { task: VerifyTask; resolve: (o: VerifyOutcome) => void }[] = [];
  private running: { task: VerifyTask; resolve: (o: VerifyOutcome) => void; timer: NodeJS.Timeout } | null = null;
  private readonly taskTimeoutMs: number;
  readonly maxQueue: number;
  private readonly maxOldGenerationSizeMb: number;
  completed = 0;
  timedOut = 0;

  constructor(opts: VerifierPoolOptions = {}) {
    this.taskTimeoutMs = opts.taskTimeoutMs ?? 15_000;
    this.maxQueue = opts.maxQueue ?? 8;
    this.maxOldGenerationSizeMb = opts.maxOldGenerationSizeMb ?? 256;
  }

  get pending() {
    return this.queue.length + (this.running ? 1 : 0);
  }

  private spawn() {
    // Built: dist/cricket-verify-worker.js beside dist/index.js. From source (tests, `pnpm dev`): the .ts file through tsx.
    const fromSource = import.meta.url.endsWith(".ts");
    const worker = new Worker(new URL(fromSource ? "./cricket-verify-worker.ts" : "./cricket-verify-worker.js", import.meta.url), {
      execArgv: fromSource ? ["--import", "tsx"] : [],
      resourceLimits: { maxOldGenerationSizeMb: this.maxOldGenerationSizeMb },
    });
    worker.unref();
    worker.on("message", (outcome: VerifyOutcome) => {
      const job = this.running;
      if (!job || job.task.id !== outcome.id) return;
      clearTimeout(job.timer);
      this.running = null;
      this.completed++;
      job.resolve(outcome);
      this.pump();
    });
    const fail = () => {
      if (this.worker === worker) this.worker = null;
      const job = this.running;
      if (job) {
        clearTimeout(job.timer);
        this.running = null;
        job.resolve({ id: job.task.id, ok: false, error: true });
      }
      this.pump();
    };
    worker.on("error", fail);
    worker.on("exit", fail);
    return worker;
  }

  private pump() {
    if (this.running || !this.queue.length) return;
    const next = this.queue.shift()!;
    this.worker ??= this.spawn();
    const worker = this.worker;
    const timer = setTimeout(() => {
      // Too slow: replace the thread; this verification fails as a fault (retryable), not as a refusal.
      this.timedOut++;
      this.worker = null;
      void worker.terminate();
    }, this.taskTimeoutMs);
    this.running = { ...next, timer };
    worker.postMessage(next.task);
  }

  /** Queues a replay. Resolves with its outcome; `null` when the queue is full. */
  verify(task: Omit<VerifyTask, "id">): Promise<VerifyOutcome> | null {
    if (this.pending >= this.maxQueue) return null;
    return new Promise((resolve) => {
      this.queue.push({ task: { ...task, id: this.nextId++ }, resolve });
      this.pump();
    });
  }

  async close() {
    const worker = this.worker;
    this.worker = null;
    for (const job of this.queue.splice(0)) job.resolve({ id: job.task.id, ok: false, error: true });
    if (worker) await worker.terminate();
  }
}

const reply = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
};

async function readBody(req: IncomingMessage, max: number): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const part of req as AsyncIterable<Buffer>) {
    size += part.length;
    if (size > max) return null;
    chunks.push(part);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export interface CricketVerifierOptions extends VerifierPoolOptions {
  logger?: Logger;
  now?: () => number;
  pool?: VerifierPool;
  /** Verifications one player may have waiting or running at once. */
  perPlayer?: number;
}

export function cricketVerifyHandler(secret: string, opts: CricketVerifierOptions = {}) {
  const pool = opts.pool ?? new VerifierPool(opts);
  const now = opts.now ?? Date.now;
  const usedJobs = new Map<string, number>();
  const rejectedRuns = new Set<string>();
  const inFlight = new Map<string, number>();
  const perPlayer = opts.perPlayer ?? 2;
  const counters = { verified: 0, refused: 0, rejectedRepeat: 0, unauthorized: 0, busy: 0, faults: 0 };

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    // 1. A job signed by the web app for this request: authentic, unexpired, unused.
    let job;
    try {
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      if (!token) throw Error("missing");
      job = await verifyCricketVerifyJob(token, secret);
    } catch {
      counters.unauthorized++;
      req.resume();
      return reply(res, 401, { error: "unauthorized" });
    }
    const t = now();
    for (const [jti, until] of usedJobs) if (until < t) usedJobs.delete(jti);
    if (usedJobs.has(job.jti)) {
      counters.unauthorized++;
      req.resume();
      return reply(res, 401, { error: "job_replayed" });
    }
    if (usedJobs.size >= MAX_REMEMBERED_JOBS) {
      req.resume();
      return reply(res, 503, { error: "busy" });
    }
    usedJobs.set(job.jti, t + JOB_MEMORY_MS);

    // 2. The exact request the job was issued for: the run token and the log, byte for byte.
    const runToken = req.headers["x-run-token"];
    if (typeof runToken !== "string" || runToken.length < 20 || runToken.length > 4096) {
      req.resume();
      return reply(res, 400, { error: "invalid_request" });
    }
    const body = await readBody(req, MAX_LOG_BYTES);
    if (body === null) return reply(res, 413, { error: "too_large" });
    if ((await cricketRequestHash(runToken, body)) !== job.hash) {
      counters.unauthorized++;
      return reply(res, 401, { error: "job_mismatch" });
    }

    // 3. The run itself: signed by the web app's /api/solo/start, a cricket run, the job's player and run.
    let run;
    try {
      run = await verifyRunToken(runToken, secret);
    } catch (e) {
      return reply(res, 400, { error: e instanceof InvalidTokenError && e.reason === "expired" ? "run_expired" : "invalid_run" });
    }
    if (run.gameId !== "sinverse-cricket") return reply(res, 400, { error: "not_cricket" });
    if (run.sub !== job.sub || run.jti !== job.run) return reply(res, 403, { error: "run_mismatch" });

    // 4. A run whose log already failed can't be replayed again (here, across every web isolate).
    if (rejectedRuns.has(run.jti)) {
      counters.rejectedRepeat++;
      return reply(res, 422, { error: "This game's log was already rejected" });
    }
    const mine = inFlight.get(run.sub) ?? 0;
    if (mine >= perPlayer) {
      counters.busy++;
      return reply(res, 503, { error: "busy" });
    }
    const pending = pool.verify({ seed: run.seed, config: run.config, log: body });
    if (!pending) {
      counters.busy++;
      return reply(res, 503, { error: "busy" });
    }
    inFlight.set(run.sub, mine + 1);
    let outcome: VerifyOutcome;
    try {
      outcome = await pending;
    } finally {
      const left = (inFlight.get(run.sub) ?? 1) - 1;
      if (left <= 0) inFlight.delete(run.sub);
      else inFlight.set(run.sub, left);
    }

    // 5. The answer, signed for this job, run and request.
    if (!outcome.ok) {
      if ("error" in outcome) {
        counters.faults++;
        opts.logger?.warn("cricket verification fault", { run: run.jti });
        return reply(res, 503, { error: "verification_unavailable" });
      }
      counters.refused++;
      if (rejectedRuns.size >= MAX_REJECTED_RUNS) rejectedRuns.delete(rejectedRuns.values().next().value!);
      rejectedRuns.add(run.jti);
      return reply(res, 422, { error: outcome.reason });
    }
    counters.verified++;
    const verdict = await signCricketVerdict({ job: job.jti, run: run.jti, hash: job.hash }, outcome.result, secret);
    return reply(res, 200, { verdict });
  };
  return Object.assign(handler, {
    pool,
    metrics: () => ({ ...counters, queue: pool.pending, completed: pool.completed, timedOut: pool.timedOut, rejectedRuns: rejectedRuns.size }),
    close: () => pool.close(),
  });
}
