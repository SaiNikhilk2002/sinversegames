# Infrastructure optimisation: progress log

Mission 4: cost optimisation on the existing architecture. **Railway stays the realtime host;** there's no Durable Objects migration, no D1, and no Hyperdrive or R2.

## Starting state (2026-11-14)

| Item | Found |
|---|---|
| Branch | `feature/unified-platform` |
| Starting commit | `700c4a2` (docs: the infrastructure cost audit) |
| Working tree | Clean: no uncommitted or untracked files |
| Origin | `origin/feature/unified-platform` = `0793ec8`; **12 ahead, 0 behind** (after a read-only fetch). `origin/main` = `92e4fde` |
| Earlier audit documents | Read: `INFRASTRUCTURE_*`, `CLOUDFLARE_DURABLE_OBJECTS_ASSESSMENT`, `NEON_HYPERDRIVE_ASSESSMENT`, `R2_STORAGE_ASSESSMENT`, the cost model, and the cricket release documents. Their findings were re-checked against the code (below) |

## Baseline tests

Nothing but documentation changed between `17c58f4` and `700c4a2`, so the baseline is the last full run on `17c58f4` (2026-11-13; `CRICKET_RELEASE_DECISION.md`):

| Check | Result |
|---|---|
| `pnpm typecheck` | Passed |
| `pnpm test` | 580 passed (shared 32, engines 487, realtime 61) |
| `pnpm test:db` | 66 passed |
| `pnpm build` | Passed |
| `pnpm test:e2e` | 196 passed, 0 failed, 10 skipped (on-demand recorders) |
| Linux Cloudflare build | Passed |

This mission didn't re-run them at `700c4a2` before changing code. The final results are in the final report.

## Architecture re-checked (from the code)

- **Socket.IO:**
  - transports `websocket` and `polling` (polling first on the client, with `tryAllTransports`);
  - **WebSocket compression off** (`perMessageDeflate` unset: the default `false`); long-polling's HTTP compression on;
  - each member is sent to individually (no Socket.IO broadcasts);
  - Bumper Blitz broadcasts full views at 20 Hz to every player.
- **Cricket submission:** `/api/solo/submit` on the Worker does everything:
  - session, token, ownership, schemas;
  - the pace pre-check, the per-isolate failed-log memo, the duplicate primary-key check;
  - **the replay, `sinverseCricket.verify`**, which takes 0.1–0.5 s of CPU against Workers Free's 10 ms;
  - then `recordMatch` (one transaction).
- **Database:** on Workers, `getDb()` created a new Prisma client with its own connection **per call**. A result submission made two (session lookup and route).
- **Health:**
  - realtime `/health` has no database;
  - web `/api/health` runs `SELECT 1` and fetches realtime. There's no database-free web liveness route.
- **Avatars:**
  - Railway's `/internal/avatar` normalises images with Sharp/libvips (a native Node module).
  - The Worker would store them in an `AVATARS` R2 binding, **which `wrangler.jsonc` doesn't declare**, so custom avatars are unavailable in production.

## Risks identified at the start

- **A Railway redeploy ends every live room.** Every realtime change needs a quiet deployment window.
- **Replays on Railway** must not block the event loop that serves live rooms, so they go in a worker thread.
- **Moving verification** must not loosen the trust model: no client data trusted, and the verdict bound to the request.
- **Sharing a database client per request** must never cross requests, and must not deadlock inside transactions.

## Workstreams

| # | Workstream | Status | Commit | Document |
|---|---|---|---|---|
| A | WebSocket compression | **Done.** Measured 13.1× (Bumper Blitz) and 11.6× (all games) with the real server; shipped as `{ threshold: 1024 }` with context takeover | `8b864a0` | `SOCKET_IO_COMPRESSION_BENCHMARKS.md` |
| B | Cricket verification on Railway | **Done, opt-in** (`CRICKET_VERIFIER_URL`). One-use signed jobs, signed verdicts, worker thread, service-wide failed-log memo | `6c360b4` | `CRICKET_RAILWAY_VERIFICATION_DESIGN.md`, `CRICKET_VERIFICATION_SECURITY_REVIEW.md` |
| C | One database client per request | **Done.** Keyed by OpenNext's per-request AsyncLocalStorage store | `a861588` | `DATABASE_CONNECTION_OPTIMIZATION.md` |
| D | Health without database wake-ups | **Done.** `/api/health/live`; a realtime `/health` test | `316ee1f` | `REALTIME_HEALTH_MONITORING.md` |
| E | Bumper Blitz broadcasts | **Measured; no protocol change** (only about 10% left after compression). A bandwidth-budget test was added | `e70baab` | `BUMPER_BLITZ_BANDWIDTH_OPTIMIZATION.md` |
| F | Avatar processing | **No change** (below) | — | This section |
| — | Cost model | Updated with measured compression ratios, CPU and memory | documentation commit | `infrastructure-cost-model.mjs`, final report |

## F. Avatar processing: findings

- **Processing:**
  - `apps/realtime/src/avatars.ts` uses Sharp/libvips for magic-byte checks, animation refusal, decoding limits (5 MB, 4096 px), and re-encoding to 64 and 256 px WebP with metadata stripped.
  - It's reached through a 30 s single-use signed job from the web's `/api/account/avatar`.
  - It depends on Node and a native addon, so it **can't move to Workers** and should **stay on Railway**.
- **Storage:** the Worker writes to an R2 binding `AVATARS`, which isn't configured, so the feature reports "unavailable" in production. **It isn't used in production today.**
- **Not done** (per the brief): avatars weren't enabled and no R2 was added.
- **Safest future approach:**
  - keep normalisation on Railway (no new service);
  - add one private R2 bucket and the `AVATARS` binding to both `wrangler.jsonc` files: free at this scale (10 GB, 1M writes and 10M reads a month free);
  - set `REALTIME_INTERNAL_URL` on the Worker;
  - then test the full upload lifecycle on a Preview with isolated settings before production.
- **Not recommended:**
  - normalising only in the browser, which trusts the client's bytes;
  - a paid image service.
