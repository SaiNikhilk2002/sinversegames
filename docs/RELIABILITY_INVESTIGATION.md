# SinverseGames reliability investigation

Audit started 2026-11-03; continued 2026-11-04 (Asia/Kolkata). All implementation changes are local. No deployment, DNS, secret, production data, merge, or push operations were performed.

## Confirmed production observations

Read-only HTTPS probes on November 3 returned:

| Probe | Observed result | What it establishes |
| --- | --- | --- |
| `https://sinversegames.com/` | HTTP 200; title starts with Playwave | Branding is still wrong on the served production response. |
| `https://www.sinversegames.com/` | HTTP 200; same title; no redirect to apex | Both browser origins are in active use. |
| Both site CSP headers | `connect-src` permits `https://rt.sinversegames.com` and `wss://rt.sinversegames.com` | The served policy now uses the intended realtime hostname. |
| `https://sinversegames.com/api/health` | HTTP 200; web, database, and realtime all `ok` | Dependencies answered this probe; this is not an uptime guarantee. |
| `https://rt.sinversegames.com/health` | HTTP 200; `status: ok` | Public DNS, TLS, routing, and realtime liveness worked from the audit host. |
| Engine.IO polling handshake with apex Origin | HTTP 200; matching `Access-Control-Allow-Origin` | Apex is currently accepted. |
| Same handshake with www Origin | HTTP 200; matching `Access-Control-Allow-Origin` | www is currently accepted. |
| Same handshake with `https://untrusted.example` | HTTP 403; no allow-origin header | An unrelated origin is rejected. |

The old apex/www mismatch and generated Railway hostname must not be reported as current confirmed causes. The checks above are unauthenticated transport/health checks, not a production match. No production guest/session or gameplay data was created. Dashboard environment values, the deployed commit, provider restarts, and a real user's intermittent failure were not available from these probes.

Additional read-only checks on **November 4** confirmed actual WebSocket upgrades: apex and www each received HTTP **101**, while `https://untrusted.example` was rejected with HTTP **400**. The 14 JavaScript chunks referenced by the public Color Clash play page were also inspected: the connection chunk contains `https://rt.sinversegames.com` and no generated Railway hostname was found in those chunks. This verifies the shipped client URL as well as the earlier CSP observation. The evidence is retained in `artifacts/takeover-audit/public-transports-2026-11-04.json`.

The source uses an exact origin allow-list for both CORS and Engine.IO `allowRequest`, trims configuration separators/trailing slashes, rejects an empty production allow-list, and requires a signed token even for non-browser clients without Origin. No wildcard or automatic trust of sibling domains was added.

## Reproduced local defects and fixes

Three new browser tests failed against the original production build at `7ef6ee2` before the fix: token HTTP 503, a hanging token request, and a closed WebSocket transport. Each failed to reach Connected within 15 seconds. The original failures are recorded here and in the tool output; they are not counted as a passing validation run. Later cases distinguish a rejected opening handshake from an accepted-then-closed connection.

1. **Missing reliable transport fallback.** Listing `websocket` followed by `polling` did not enable trying the second transport after initial failure. The installed Engine.IO client gates that behavior on `tryAllTransports`, which defaults to false. The client now establishes polling first and probes a WebSocket upgrade, enables trying the alternative transport after an opening error, and sets a ten-second transport opening timeout. Starting with polling also handles a gateway that accepts WebSockets and immediately closes them: a failed upgrade probe leaves polling usable. Separate browser tests require room creation after an opening-handshake rejection and after an accepted-then-closed upgrade. [Socket.IO client options](https://socket.io/docs/v4/client-options/).
2. **Unbounded token fetch.** The asynchronous Socket.IO auth callback could remain pending indefinitely. It now aborts the token request after five seconds, including response-body reading. A superseded authentication attempt is aborted/ignored so an older response cannot overwrite a newer attempt.
3. **Transient token failure could stop reconnection permanently.** The old callback supplied an empty token after a failed HTTP request. Server middleware then rejected authentication, which Socket.IO does not automatically retry. The shared client now schedules a single retry for inactive sockets with exponential delay capped at five seconds; the transport manager retains responsibility for active transport retries. Successful connection resets the delay. Explicit HTTP 401/403 and server BANNED responses stop automatic authentication attempts. [Socket.IO client connection errors](https://socket.io/docs/v4/client-api/).
4. **Room entry could show an endless spinner, and retry could race an offline socket.** An initial offline/reconnecting room now offers a clear error, Try again, and Browse games. Expired sessions offer a profile update instead of waiting indefinitely. Retry reconnects before emitting a join. A new connection clears a previous join error and rejoins the room with sequence tracking reset.
5. **Brand fallback was still Playwave.** The shared default, example environment, and README now use SinverseGames. Existing explicit build variables still override that fallback, and previously deployed bundles remain unchanged. The production build setting must be inspected before a separately approved release.

The connection remains a single shared Socket.IO instance per browser tab. No game rules, score trust, winner selection, persistence schema, protocol validation, or production allow-list behavior was changed.

The transport-order decision follows Socket.IO's default polling/upgrade lifecycle: it costs an initial HTTP handshake before a successful WebSocket upgrade, but preserves play when a gateway closes an upgrade. The dedicated regressions distinguish a rejected opening handshake from an accepted connection that immediately closes; one fixture is not used as a substitute for the other.

## Reconnect evidence

The new browser scenario starts a two-player Color Clash match with the timer off and the connected opponent's turn held, closes both sides of the host's proxied WebSocket, rejects transport attempts during the interruption, and then restores connectivity without restarting the server. It requires the Connection lost banner, an Offline opponent view, the Back online banner, the same room URL and exact hand card IDs after recovery, and a connected opponent view again. Holding the opponent's turn is necessary: a disconnected active player is legitimately auto-played after ten seconds, even with the normal turn timer off. Screenshots and a recording are produced under Playwright's ignored test output. Final results and retained evidence are listed in the takeover report.

This tests an interrupted transport while browser online state remains true, rather than merely toggling browser offline emulation. It does not test an actual mobile carrier handover or infrastructure process restart. Rooms remain in memory, and a server restart intentionally closes them.

## Liveness, readiness, and timeout review

- Railway checks `/health`, a cheap process-liveness endpoint that does not depend on PostgreSQL. `/` has the same liveness response. One replica is configured; horizontally scaling the service without room routing would be unsafe.
- Authenticated `/admin/metrics` reports database readiness. There is no separate public realtime readiness route. Do not silently turn Railway liveness into a downstream database probe.
- Worker `/api/health` is dependency readiness: it probes the database and realtime in parallel and returns 503 on degradation. Realtime fetch has a 2.5-second deadline. It is force-dynamic and not called by every page request.
- **Remaining timeout debt:** the health route's Prisma query, realtime moderation lookup, and admin database readiness probe have no explicit application deadline. The pg pool has a small pool and idle timeout but no explicit connection-establishment timeout. A stalled database can therefore delay these paths. The client auth deadline bounds the browser wait but does not cancel a database operation already running on the server. Add and test server-side connection/query budgets in a separate focused change, including persistence/transaction behavior.
- Socket acknowledgements are already bounded to eight seconds; reconnect seat grace defaults to 60 seconds. Database result persistence retries three times, but remains best-effort after exhaustion; durable outbox/restart recovery is not implemented.

## Cloudflare preview investigation

[PR #1](https://github.com/SaiNikhilk2002/sinversegames/pull/1) was merged at **2026-11-03 12:08:45 IST**, with head `7ec6eec`. Its **Workers Builds: sinversegames** check completed with failure. Build ID: `007fc998-c24b-44b7-abd1-4ccacad6d48e`. GitHub's check summary contains a dashboard link and Worker name, with no error log or explanatory annotations exposed in that summary.

[Open the failed Cloudflare build](https://dash.cloudflare.com/21c2f668735c78d18513f64d381aa233/workers/services/view/sinversegames/production/builds/007fc998-c24b-44b7-abd1-4ccacad6d48e).

Confirmed local configuration facts:

- Check/linked Worker: `sinversegames`; checked-in Wrangler name: `sinversegames-web`. This discrepancy needs reconciliation against the failed log and effective build configuration. A Worker-name mismatch is a documented failure condition, but a CLI/environment override could change the effective name, so the historic cause is still **unverified**. [Cloudflare build troubleshooting](https://developers.cloudflare.com/workers/ci-cd/builds/troubleshoot/).
- The workspace-aware commands are `pnpm cloudflare:build` and `pnpm cloudflare:deploy` from the repository root. The Wrangler configuration and OpenNext entry point are under `apps/web`; a default bare root Wrangler invocation can choose the wrong context.
- Wrangler 4.155.0 refused the local Node 20.20.2 runtime; it ran on Node 24.14.0. A root `.node-version` now pins 24, matching the app and Railway image. This fixes version selection for a repository-root build, but does not prove the historical build used the wrong Node. [Cloudflare build-image version files](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/).
- OpenNext selects a generated workerd Prisma client through `NEXT_BUILD_TARGET`, adds pg-cloudflare tracing, and serves its prerendered cache from static assets. No new R2/KV requirement was introduced.
- No preview environment/configuration, isolated preview service bindings, or GitHub workflow is checked in. Actual dashboard branch commands, build variables, secrets, and preview bindings could not be inspected with the available authenticated tooling. No local Wrangler login was found in the conventional configuration paths, and standard Cloudflare API credential environment variables were unset; no credential values were printed.
- Production/preview `NEXT_PUBLIC_*` and the CSP are compiled at build time. A runtime-only variable change cannot replace values in an already built browser bundle. Preview signing secrets and databases must be isolated before any preview is published.

The final-source Linux/OpenNext build passed in isolated Ubuntu WSL using Node 24.14.0 and pnpm 11.15.1. It generated `.open-next/worker.js` without an unsupported-version override or publishing anything. An earlier dependency-install attempt was interrupted after download errors and was not counted as a completed build. The subsequent completed builds and the 25/25 browser run are recorded in the takeover report. A successful local build cannot replace the missing historical provider log; the generated Worker was not deployed or exercised against production data.

## Required dashboard follow-up (no changes performed)

1. Read/export the linked failed build log and its effective root, commands, Node/pnpm versions, Worker name, and branch settings. Confirm whether it was the branch preview upload or production deploy stage that failed.
2. Resolve the Worker-name discrepancy after reviewing the intended existing Worker. Keep production and non-production branch commands distinct.
3. Inspect build-time `NEXT_PUBLIC_BRAND_NAME`; compile SinverseGames in the next approved release. Confirm `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_REALTIME_URL`, and runtime health/admin target agree with the intended hosts.
4. Before publishing a preview, supply isolated web/realtime/database targets and matching preview-only signing secrets. Do not copy production database or signing secrets into a public preview.
5. After explicit release approval, run a two-browser apex/www smoke test and monitor rejected connections, restarts, and reconnects during real transient network changes. Today's passing probes do not establish a permanent production fix.
