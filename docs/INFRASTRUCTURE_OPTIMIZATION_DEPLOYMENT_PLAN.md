# Infrastructure optimisation: deployment plan

**Nothing here has been run.** Every step marked **(owner)** needs your approval and access. No push, merge, deploy, Railway restart or setting change happened.

**What ships.**
- **Release commit:** the tip of `feature/unified-platform` after the documentation commit (see `INFRASTRUCTURE_OPTIMIZATION_FINAL_REPORT.md`).
- **The four changes:**

  | Commit | Change |
  |---|---|
  | `8b864a0` | WebSocket compression |
  | `6c360b4` | Optional cricket verification on Railway |
  | `a861588` | One database client per request |
  | `316ee1f` | Health liveness route |

- **Also in that merge:** these sit on top of the T20/ODI release candidate from the earlier missions. Merging the branch ships those too (`CRICKET_PRODUCTION_RELEASE_RUNBOOK.md`).

## How this repository deploys

- **The merge deploys both services.** Merging to `main` deploys the web Worker (Workers Builds: `pnpm cloudflare:build`, then `pnpm cloudflare:deploy`) **and** Railway realtime. Railway's `watchPatterns` cover `apps/realtime/**` and `packages/**`, both changed here.
- **The two deploys are near-simultaneous and not ordered.** The plan below is therefore built so that **either order is safe.**
- **No database migration.**

## Required settings (names only)

| Name | Where | Required? | Purpose |
|---|---|---|---|
| `CRICKET_VERIFIER_URL` (**new**) | Web Worker, **as a secret** (`pnpm exec wrangler secret put CRICKET_VERIFIER_URL` in `apps/web`), value `https://rt.sinversegames.com` | **Only to use Railway verification** (needed for T20/ODI on Workers Free). Unset: the Worker verifies itself, which on Free can't handle T20/ODI | Where `/api/solo/submit` sends cricket replays |
| `AUTH_SECRET` | Worker and Railway (existing) | Yes, identical on both (already required) | Signs jobs and verdicts, as it already signs avatar jobs and realtime tokens |

**Why a secret and not a plain variable:** `wrangler deploy` replaces the Worker's plain variables with those in `wrangler.jsonc`, which has no `keep_vars`. A plain variable added in the dashboard would be **removed by the next deploy**; secrets persist. Alternatively, add it to `vars` in **both** `wrangler.jsonc` files: a reviewed code change, kept in step by `cloudflare-config.spec.ts`.

**Nothing new on Railway.**

## A. Realtime: compression, the verification endpoint, health

| | |
|---|---|
| Change | Realtime code only. Clients need nothing: browsers negotiate compression, and the endpoint is internal |
| Impact | **The Railway redeploy restarts the service.** Every live multiplayer room ends (rooms are in memory; players see the room closed; 15 s draining). Solo games aren't affected; a cricket submission during the restart gets 503 and can be retried |
| Downtime | Railway builds the new image, then swaps once `/health` passes: seconds to a minute of no realtime connections. **Choose a quiet time** |
| Memory | Compression adds about 0.5 MB per busy socket (about 270 MB at 248 clients measured). The verification thread adds about 55 MB once first used (measured locally from source; the built bundle should be similar or smaller) |

**Smoke tests (owner, after deploy):**
1. `GET https://rt.sinversegames.com/health` → 200 `{ status, uptimeSeconds }`.
2. **Compression negotiated:** in browser devtools → Network → the `rt` WebSocket → Headers, the response shows `Sec-WebSocket-Extensions: permessage-deflate`.
3. Play a Bumper Blitz room with two browsers. In the WebSocket frames view, frames are now about 150 bytes instead of about 2 KB.
4. **Long-polling still works:** play a quick room on a network that blocks WebSockets, or check that the first requests are `transport=polling` before the upgrade, as today.
5. One round each of Token Trail, Color Clash, Doodle Duel and Kitchen Rush Co-op.
6. `GET /admin/metrics` with `ADMIN_TOKEN`: `cricketVerification` counters are present.
7. Railway → Metrics: **network egress drops** about 10× for the same activity, while CPU and memory rise modestly.

**Rollback:** set `WS_COMPRESSION` to `false` (`apps/realtime/src/server.ts`) and redeploy. Or redeploy the previous Railway deployment from Railway's dashboard. Either one restarts rooms again. No data is involved.

## B. Cricket verification on Railway (optional; needed for T20/ODI on Workers Free)

**Order (safe either way):**
1. **(owner)** After merge, wait until Railway is healthy **with the new code**: `cricketVerification` appears in `/admin/metrics`.
2. **(owner)** Set the Worker secret `CRICKET_VERIFIER_URL=https://rt.sinversegames.com`. This takes effect for new requests.
   - Setting it *before* the merge is also safe: today's production code ignores the name.
   - But between a web deploy and Railway's, cricket submissions would get a retryable 503.
   - Either way, no wrong result can be saved.
3. **(owner) Smoke tests:**
   - play a 1-over duel and Save → verified and saved;
   - play a T20, at least 30 balls yourself, then simulate and Save → verified and saved (it can't on Workers Free without this);
   - `/admin/metrics` → `cricketVerification.verified` increased;
   - Workers Observability for `POST /api/solo/submit`: no `exceededCpu`, and CPU per request now a few ms.

**Expected latency:** about 0.1–0.3 s plus the Worker-to-Railway round trip.

**Rollback:** delete the secret (`pnpm exec wrangler secret delete CRICKET_VERIFIER_URL`). The Worker verifies itself again, which on Workers Free means T20/ODI can't be verified, so buy Workers Paid then.

**Database compatibility:** unchanged. Results are saved by the same Worker code into the same tables.

## C. One database client per request (web)

| | |
|---|---|
| Change | `packages/db/src/client.ts`: on Workers, one Prisma client per request instead of per call. It deploys with the web Worker; Railway (Node) behaviour is unchanged |
| Impact | Fewer Neon connections per request. No user-visible change. No downtime |
| Smoke tests | Sign in (guest, email, Google); the profile page; a wallet purchase or equip; a solo result saves; `/leaderboard`. Workers Observability: no new errors. Neon monitoring: connections per request fall |
| Rollback | Revert `a861588` and redeploy the web (a Workers Deployments rollback also works; it's code only) |

## D. Monitoring (owner, optional)

Point uptime monitors at:
- `https://rt.sinversegames.com/health`;
- `https://sinversegames.com/api/health/live`.

Use `/api/health` at most every 30 minutes (`REALTIME_HEALTH_MONITORING.md`). No monitor was changed by this work.

## Order summary

1. **(owner)** Approve, push `feature/unified-platform`, open a PR to `main`, and merge at a quiet time. Railway restarts; the Worker deploys.
2. **(owner)** Smoke tests A and C.
3. **(owner)** Set `CRICKET_VERIFIER_URL` as a Worker secret (B), then smoke-test B.
4. **(owner)** Update monitors (D).
5. Watch for a week: Railway egress, CPU and memory; Neon CU-hours; Observability for `/api/solo/submit`; `/admin/metrics`.
