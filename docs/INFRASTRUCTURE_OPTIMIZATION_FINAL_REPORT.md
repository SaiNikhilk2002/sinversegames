# Infrastructure optimisation: final report

Mission 4, 2026-11-14/15. **Everything is local:**
- nothing was pushed, merged or deployed;
- Railway wasn't restarted;
- no Cloudflare, Railway, Neon or DNS setting, secret, database or production record was touched.

Railway stays the realtime host. There's no Durable Objects migration, no D1, and no Hyperdrive or R2.

## Git

| Item | Value |
|---|---|
| Branch | `feature/unified-platform` |
| Starting commit | `700c4a2` |
| Ending commit | The documentation commit that adds this report (the branch tip; see `git log -1`) |
| Origin | 0 behind; 18 ahead of `origin/feature/unified-platform` after this mission's 6 commits (12 before it) |
| Working tree at the end | Clean. `artifacts/cricket-2` images rewritten by the browser suite were restored with `git restore` |

**Commits:**

| Commit | What |
|---|---|
| `8b864a0` | `feat(realtime)`: WebSocket per-message compression, measured |
| `6c360b4` | `feat(cricket)`: optional verification on the realtime service, for Workers Free |
| `a861588` | `perf(db)`: one database client per request on Workers |
| `316ee1f` | `feat(health)`: a database-free liveness check for uptime monitors |
| `e70baab` | `test(bumper-blitz)`: a bandwidth budget for the compressed state stream |
| (this) | `docs(infra)`: the nine documents, the updated cost model, and a note in `INFRASTRUCTURE_COST_DECISION.md` |

**Changed code files:**
- **realtime:** `src/server.ts`; new `src/cricket-verifier.ts` and `src/cricket-verify-worker.ts`; `tsup.config.ts` (a second entry); `package.json` (bench scripts); `tsconfig.json` (includes `bench`); new `bench/compression.ts`, `bench/compression-server.ts`, `bench/cricket-verify-latency.ts`.
- **shared:** new `src/identity/cricket-verify.ts`; `src/identity/index.ts`.
- **db:** `src/client.ts`.
- **web:** `src/app/api/solo/submit/route.ts`; new `src/lib/server/cricket-verifier.ts`; new `src/app/api/health/live/route.ts`; a comment in `src/app/api/health/route.ts`.

**New tests:**
- **shared:** `test/cricket-verify.test.ts`.
- **realtime:** `test/compression.test.ts`, `test/cricket-verify.test.ts`, `test/db-scope.test.ts`, `test/health.test.ts`, `test/bumper-bandwidth.test.ts`.
- **web e2e:** `e2e/health.spec.ts`, plus a test in `e2e/cricket-release.spec.ts`.

**Untouched:**
- the schema and migrations;
- the lockfile and dependencies;
- `wrangler.jsonc` (both), `railway.json`, the Dockerfile;
- game engines and rules;
- root `AGENTS.md` / `CLAUDE.md`.

## Tests (Windows 11, Node 24.14.0, pnpm 11.15.1, local loopback PostgreSQL `*_test` databases)

| Check | Result |
|---|---|
| `pnpm typecheck` | **Passed** (every package; the realtime bench files are now typechecked too) |
| `pnpm test` | **609 passed** (shared 37 = 32 + 5; engines 487; realtime 85 = 61 + 24). Includes **all 96 historical duels replaying exactly** |
| `pnpm test:db` | **66 passed** (6 files) |
| `pnpm build` | **Passed.** The realtime bundle emits `dist/cricket-verify-worker.js`; the web build lists `/api/health/live` |
| `pnpm test:e2e`, full, with `CRICKET_VERIFIER_URL=http://localhost:4200` (every cricket submission through Railway) | **196 passed, 2 failed, 10 skipped** (43.7 min) |
| Re-run of the 2 failing tests (`identity.spec.ts`, same code and environment) | **3 of 3 passed.** See below |
| Cricket specs with `CRICKET_VERIFIER_URL` **unset** (the default Worker path) | **9 passed** (`cricket-formats`, `cricket-release`) |
| Proof the built bundle verifies: realtime `dist/index.js` with `cricket-release.spec.ts` | 5 passed; Railway counters 0 → **3 verified, 1 refused, 1 run remembered** |
| Stress: `CRICKET_MATCHES=500 pnpm --filter @platform/engines stress:cricket` | **0 failures** in 732 s. 500 T20 and 500 ODI all verified; **3,200 tampered logs rejected**. Counts identical to earlier missions (deterministic) |
| Linux Cloudflare build (WSL, clean copy, no `.env`, frozen install) | **Passed.** Lockfile SHA-256 `bbf66641…cf2ce2d` (unchanged); Worker emitted; 31 MB of assets, 22 GLB models; **nothing uploaded** |

**The 2 full-run failures, both in `identity.spec.ts`:**
1. **"guest links, onboards, stores pictures…".** The avatar steps passed. The Cuisine Quest leaderboard check failed because the persistent local test database's board was full of earlier runs' high-score fixture players.
2. **"collision, cancelled/hostile OAuth…".** The fixture Google callback reported "couldn't be verified" where a collision message was expected, after the long suite had run many identity flows from the same loopback address.

**Why they aren't regressions:**
- Neither involves code this mission changed. The browser suite runs the web on Node, where the request-scoped client doesn't apply, and the other changes concern cricket submission and health routes.
- Both passed when the spec was re-run alone.
- **They're order- and state-dependent in this long-lived local test database.** A fresh `*_test` database for each full run would remove that.

**The 10 skips** are the on-demand footage and evidence recorders, as before.

## A. WebSocket compression (`SOCKET_IO_COMPRESSION_BENCHMARKS.md`)

**Actual measurements:** real server in a child process, real `socket.io-client` bots, all six games, 248 clients, 30 s.

| | Off (before) | Shipped (context takeover, 1 KB threshold) |
|---|---|---|
| Bumper Blitz, per 6-player room | 250 KB/s, 2,072 B a message | **19.1 KB/s, 158 B a message (13.1× less)** |
| All games, server output | 4,425 KB/s | **381 KB/s (11.6× less)** |
| Server CPU | 23.5% of one core | 49.8% |
| Server memory (RSS) | 154 MB | 271 MB (about 0.5 MB per busy socket) |
| Delivery delay above fastest, p95 | 1 ms | 5 ms |

- **Compressing each message on its own** (the earlier audit's assumption) measured only **2.7–3.0×**.
- Long-polling, upgrades, reconnection, acknowledgements, rooms and matchmaking all pass with compression on.

## B. Cricket verification: moved to Railway, opt-in (`CRICKET_RAILWAY_VERIFICATION_DESIGN.md`, `CRICKET_VERIFICATION_SECURITY_REVIEW.md`)

**Architecture.**
- **The Worker keeps** authentication, ownership, schemas, the pace check, the duplicate check and **all persistence** (unchanged `recordMatch`).
- **Railway replays** in a worker thread, after checking:
  - a 60 s, single-use job, signed with the shared `AUTH_SECRET` and bound to the player, run and SHA-256 of the exact token and log;
  - the run token's own signature and owner.
- **The answer** is a verdict signed for that job, run and request, which the Worker checks before saving.
- **The switch** is `CRICKET_VERIFIER_URL`. Unset (the default), nothing changes.

**Latency, measured locally:**

| Case | End-to-end |
|---|---|
| T20 | about 115 ms |
| ODI | about 260 ms |
| Crafted 510 KB flood (refused) | about 1.7 s |

The event loop stayed responsive throughout (worst delay about 11 ms). Add the Worker-to-Railway round trip (unknown). The replay thread adds about 55 MB once used.

**Security findings:**
- **No client trust was added;** scorecards and results still come only from the replay.
- **Stronger than before:**
  - failed runs are now remembered **service-wide** on Railway (one replica), not just per Worker isolate;
  - every verification is bound to its exact request.
- **Residual:**
  - Railway becomes part of the cricket save path; when it's down, players get a retryable 503 and nothing is lost;
  - the memory of refused runs and used jobs resets on a Railway restart.
- **Tests:** 5 for tokens, 13 for the endpoint, plus the cross-player browser test.

## C. Database connections (`DATABASE_CONNECTION_OPTIMIZATION.md`)

**Verified before:** on Workers, a result submission created **two** clients, so two Neon connections (session lookup plus route). Pages could create more.

**Now:** one client per request, cached on OpenNext's per-request AsyncLocalStorage store in a `WeakMap`. It's never shared across requests; a second connection opens only for truly concurrent queries.

**Tested** by reproducing OpenNext's mechanism in Node (50 concurrent requests isolated). **Not run inside real workerd:** confirm after deploy in Neon's connection monitoring.

## D. Health monitoring (`REALTIME_HEALTH_MONITORING.md`)

- `rt.sinversegames.com/health` never touches the database (now tested).
- **New `/api/health/live`:** Worker liveness with no database and no realtime call.
- **`/api/health` remains the readiness check;** poll it at most every 30 minutes.
- No external monitor was changed.

## E. Bumper Blitz (`BUMPER_BLITZ_BANDWIDTH_OPTIMIZATION.md`)

- **Measured after compression:** stripping every static field would save only about 10% more (148 → 133 B a view), at the price of a breaking protocol change.
- **No engine or protocol change.** Compression already took Bumper Blitz from 250 to 19 KB/s.
- **A deterministic test keeps the stream compressible:** under 250 B a view, at least 8× smaller than raw.

## F. Avatars (`INFRASTRUCTURE_OPTIMIZATION_PROGRESS.md`, § F)

- **Processing stays on Railway:** Sharp/libvips is Node-native.
- **Not live in production:** there's no `AVATARS` R2 binding.
- **Not enabled; no R2 added.**
- **Safest future path:** a private R2 bucket plus the binding, with normalisation kept on Railway.

## Cost before and after (model, `node docs/infrastructure-cost-model.mjs`)

Typical month (average concurrency 30% of the peak), even game mix. **Railway only;** add Workers ($0 on Free, $5 on Paid) and Neon (Free up to about 13 active hours a day; about $20–78 on Launch at scale).

| Peak concurrent players | Railway before (no compression) | **Railway after (measured compression)** | Change |
|---|---|---|---|
| 10 | $7.87 | **$5.00** (the Hobby floor) | −$2.87 |
| 100 | $62 | **$8.03** | −$54 |
| 500 | $305 | **$33** | −$272 |
| 1,000 | $609 | **$64** | −$545 |

Cost per active player-hour at 1,000 peak players: about $0.0003, against about $0.0028 before.

**Workers plan:** with `CRICKET_VERIFIER_URL` set, T20/ODI no longer needs Workers Paid. So today's total can stay at **about $5 a month** (Railway Hobby) plus the domain, **as long as the rest of the site fits Workers Free** (unverified: check Observability for `exceededCpu`) and Neon stays within Free.

**Measured vs assumed:**
- **Measured (local):** bytes per message and per game, the compression ratios, server CPU and memory per room, verification latency, and event-loop delay.
- **Assumed:** how often players play (A5: 30% of peak), inputs per second, co-op cooking action rates (their compression ratios were measured on server syncs only), and the Worker-to-Railway round trip.
- **Not measured at all:** real production usage, invoices, and Cloudflare CPU. **These are model estimates, not bills.**

## Remaining assumptions and open items

1. **The Workers Free CPU fit** for non-cricket routes is unverified. Check Observability.
2. **Request-scoped database clients** are untested inside real workerd.
3. **Railway production network egress and memory** need watching after deploy.
4. **The two order-dependent local identity tests:** use a fresh local test database per full run.
5. **The Railway region and Worker placement** (verification round trip) are unknown.

## What you need to do

See `INFRASTRUCTURE_OPTIMIZATION_DEPLOYMENT_PLAN.md`.

1. **Review, then approve the push and merge.** This ships with the earlier T20/ODI commits. Merge at a quiet time: **the Railway redeploy ends live multiplayer rooms.**
2. **After Railway is healthy, set the Worker secret `CRICKET_VERIFIER_URL=https://rt.sinversegames.com`.** Use a secret, not a plain dashboard variable, which the next deploy would erase. This is what lets T20/ODI work on Workers Free; otherwise buy Workers Paid.
3. **Run the smoke tests in the plan.** Watch Railway egress, CPU and memory, Neon CU-hours, and Observability for `/api/solo/submit`.
4. **Point uptime monitors** at `rt.sinversegames.com/health` and `/api/health/live`, and keep `/api/health` at 30 minutes or more.
