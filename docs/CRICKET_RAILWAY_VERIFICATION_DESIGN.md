# Cricket verification on the realtime service (Railway)

**Implemented locally:** commit `6c360b4`. It's **off until `CRICKET_VERIFIER_URL` is set** on the Worker.

**Why.**
- Replaying a T20 takes about 0.1–0.2 s of CPU, and an ODI about 0.3–0.5 s.
- Workers Free allows 10 ms per request, so on Free every T20/ODI result submission would fail with error 1102.
- The alternative is Workers Paid, at $5 a month or more.
- Railway already runs a Node process with no per-request CPU limit.

## Who does what

```mermaid
sequenceDiagram
  participant B as Browser
  participant W as Worker /api/solo/submit
  participant R as Railway POST /internal/cricket/verify
  participant T as Worker thread (replay)
  participant N as Neon
  B->>W: { run token, log } (≤ 512 KB)
  W->>W: same origin, rate limit, session, token signature, token owner = session,<br/>config and log schemas, pace pre-check, rejected-run memo
  W->>N: is this run id already saved? (primary-key read)
  W->>R: job (60 s, one use, bound to player, run, SHA-256 of token + log),<br/>run token, log
  R->>R: job signature, audience, expiry, one use; request hash;<br/>run token signature; cricket; job player = run owner; job run = run id;<br/>rejected-run memo; queue and per-player limits
  R->>T: seed, config (from the run token), raw log
  T-->>R: server-computed result, or the refusal reason
  R-->>W: 200 verdict (signed for job, run, request) / 422 reason / 503
  W->>W: verify the verdict's signature and bindings; duration ≤ real time
  W->>N: recordMatch (unchanged): match, stats, XP, achievements, ledger, one transaction
  W-->>B: result
```

| Step | Code | Where |
|---|---|---|
| Authentication and session ownership | `getSession()`; `run.sub === player.id` | Worker, unchanged |
| Run token (seed and config from `/api/solo/start`) | `verifyRunToken` | Worker, **and again on Railway** |
| Log and config schemas | `game.logSchema`, `configSchema` | Worker, **and again in the replay thread** |
| Pace pre-check (claimed time ≤ real time) | `submit/route.ts` | Worker |
| Failed-log memo | `rejectedCricketRuns` (per isolate) | Worker, **plus a service-wide memo on Railway** |
| Duplicate check before replay | `db.match.findUnique` | Worker |
| **Deterministic replay, score, result, scorecard** | `sinverseCricket.verify` | **Railway worker thread** when configured; otherwise the Worker |
| Duration check after replay | `submit/route.ts` | Worker |
| Persistence, rewards, statistics, achievements, idempotency | `recordMatch` (unique `Match.id = run id`, one transaction, player row locks) | Worker, unchanged |

**Decision: persistence stays on the Worker.**
- Railway returns only a verified result.
- Moving the write would duplicate `recordMatch`'s transaction and reward logic in a second place, and add a second database writer.
- The Worker already holds the session and the request-scoped database client.
- There's no migration.

## Protocol

**Request:** `POST {CRICKET_VERIFIER_URL}/internal/cricket/verify`

| Part | Content |
|---|---|
| `authorization: Bearer <job>` | HS256 with `AUTH_SECRET`: issuer `platform`, audience `cricket-verifier`, `purpose: "cricket-verify"`, `sub` (player), `run` (run id), `hash` (SHA-256 hex of `runToken + "\n" + body`), random `jti`, 60 s expiry |
| `x-run-token` | The run token exactly as the browser sent it (20–4,096 characters) |
| Body | The log as JSON, exactly the bytes hashed (≤ 512 KB) |

**Responses:**

| Status | Body | When |
|---|---|---|
| 200 | `{ verdict }` | Verified. The verdict is HS256: audience `cricket-verdict`, `purpose: "cricket-verdict"`, `job`, `run`, `hash`, `result`, 60 s expiry |
| 422 | `{ error }` | The log was refused (deterministic), or this run was already refused |
| 401 | — | Missing, forged, expired or reused job; or a request that doesn't match its job |
| 400 | — | Bad run-token header; run token invalid or expired; not a cricket run |
| 403 | — | The job's player or run doesn't match the run token |
| 413 | — | Body over 512 KB |
| 503 | — | Queue full, per-player limit, thread fault or timeout (retryable) |

**What the Worker does with them** (`apps/web/src/lib/server/cricket-verifier.ts`):
- **200:** checks the verdict was signed for its own job, run and request hash, and that the result has the right shape, then continues as before.
- **422:** passes the reason on (422) and remembers the run.
- **Anything else, or no answer within 30 s:** answers the player **503** "Cricket results can't be verified right now. Please try again shortly." Nothing is decided or saved, so the player can retry; T20/ODI also keep refresh recovery.

**Configuration:**
- `CRICKET_VERIFIER_URL` must be `https:`, or `http:` on loopback (local tests). Anything else is refused as misconfigured (503), so run tokens are never sent in the clear.
- Railway needs **no new setting:** the endpoint lives on the existing service and uses the existing shared `AUTH_SECRET`.

## Railway side (`apps/realtime/src/cricket-verifier.ts`, `cricket-verify-worker.ts`)

- **One worker thread.**
  - Replays run one at a time, off the event loop that serves live rooms.
  - The thread is created on first use.
  - `dist/cricket-verify-worker.js` is a second `tsup` entry; from source (tests, `pnpm dev`) it runs the `.ts` file through `tsx`.
  - The thread's heap is capped at 256 MB.
- **Limits:**
  - a queue of 8 (waiting or running);
  - 2 per player;
  - 15 s per replay, after which the thread is replaced and the request gets 503. A fault or timeout is **not** remembered as a refusal.
- **Memory between requests:**
  - **Used job ids** for 120 s, at most 20,000 (more answers 503).
  - **Rejected run ids,** at most 20,000. Railway is one replica (`railway.json`), so this memo is service-wide, which is stronger than the Worker's per-isolate memo. It resets when the service restarts.
- **Observability:** `GET /admin/metrics` (admin token) includes `cricketVerification`: verified, refused, rejected repeats, unauthorized, busy, faults, queue, completed, timed out.
- **Logging:** never logs tokens, logs or payloads. It logs fault events with the run id only.

## Measured (local, 2026-11-14)

**Railway side:** `pnpm --filter @platform/realtime bench:verify`, 5 matches per case, one worker thread, loopback.

| Case | Body | End-to-end median / p95 / max | Event-loop delay meanwhile (max) |
|---|---|---|---|
| T20, all simulated | 0.1 KB | 114 / 576* / 576* ms | 10.8 ms |
| T20, player bowls every ball | 21.6 KB | 119 / 132 / 132 ms | 11.6 ms |
| ODI, all simulated | 0.1 KB | 255 / 278 / 278 ms | 11.2 ms |
| ODI, player bowls every ball (worst real case) | 54.5 KB | 260 / 290 / 290 ms | 11.1 ms |
| Crafted no-ball flood (refused) | 510 KB | 1,657 / 1,764 / 1,764 ms | 11.6 ms |

\* The first request after start includes creating the thread and loading the engine (cold start). Later T20 requests take about 115 ms.

**The event loop stays free.** The monitor's resolution is 10 ms, so a maximum of about 11 ms means it was effectively never blocked. A test also checks `/health` answers in under 150 ms during an ODI replay.

**Add the Worker-to-Railway round trip.** It's unknown: it depends on Railway's region and the Worker's smart placement. Expect tens of milliseconds.

**The Worker's own CPU for a remote submission** is token signing and verification, hashing, JSON and the database work: a few milliseconds, against the 0.1–0.5 s of replay it no longer does. That's **not measured on Cloudflare.** Whether a whole request stays under Free's 10 ms needs checking in Observability after release.

## Compatibility

- **Same engine version on both sides.** The same `@platform/engines` code runs on both, and Railway and the Worker deploy from the same commit.
- **Both cricket versions go through the same path:**
  - the 1- and 2-over duel (v1; its 96 recorded duels replay exactly);
  - T20 and ODI (v2).
- **Fairness, rewards and records are unchanged.** The same `verify` and the same result fields (`controlledBalls`, `uncounted`, …) feed the same `recordMatch`.
- **The fairness thresholds (30 / 60 legal balls, simulated balls excluded) are untouched.**
- **Version skew between deploys:**
  - If the Worker runs a newer engine than Railway, or the reverse, a replay can disagree and a run would be refused.
  - So deploy Railway first, then set `CRICKET_VERIFIER_URL` (`INFRASTRUCTURE_OPTIMIZATION_DEPLOYMENT_PLAN.md`).
  - Any future engine change must ship to both together.

## Decision gate: passed

| Concern | Finding |
|---|---|
| Insecure internal API? | No. Every request needs a one-use job signed with the shared secret, bound to the exact bytes. The run token is re-checked, and the answer is signed. See `CRICKET_VERIFICATION_SECURITY_REVIEW.md` |
| Duplicated persistence? | No. Persistence stays only in the Worker |
| Replay compatibility? | The same engine and `verify`. Every cricket browser test passed through the new path (final report) |
| Reward semantics? | Unchanged |
| Latency? | About 0.1–0.3 s for real matches, plus the network round trip |
| Railway reliability? | When Railway is down, cricket results answer 503 (retryable) instead of saving. Other games are unaffected. Railway restarts also end live multiplayer rooms, as they always have |

**If you'd rather not depend on Railway for cricket, leave `CRICKET_VERIFIER_URL` unset and buy Workers Paid ($5 a month).** The Worker then verifies as before.
