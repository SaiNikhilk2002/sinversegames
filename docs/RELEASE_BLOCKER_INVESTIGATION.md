# Release blocker investigation

Date: 2026-11-05, updated 2026-11-06. This records the investigation as it happened. **Update:** the migrations were later applied to production with the owner's approval, and the empty 500s cleared in public checks. See [the migration report](PRODUCTION_MIGRATION_READINESS.md). The Cloudflare build failure below is still unresolved.

For the subsequent deliberate local alignment with the confirmed `sinversegames` Worker, preservation of both production Custom Domains, and PR #4's separate failed Preview checks, see [the current Worker configuration audit](CLOUDFLARE_WORKER_CONFIGURATION_AUDIT.md). The older configuration names and build IDs below are retained as historical evidence; no remote Preview fix is claimed.

## 1. Cuisine Quest and token HTTP 500

### Finding

**Most likely cause: production's code expects migrations that its database does not have.** It affects far more than Cuisine Quest. Any request carrying a session cookie that reaches an unguarded `getSession()` call fails, including the realtime token, wallet and solo games.

**Update:** the migration history is now read. The database has only `init`, and all objects from the three later migrations are absent. A read-only counter check very likely ties this database to the production Worker. See [migration readiness](PRODUCTION_MIGRATION_READINESS.md). Worker logs have still not been read.

### Request flow

1. The browser calls `GET /api/cuisine-quest/campaign` or `POST /api/session/token` with its `pw_session` cookie.
2. The route calls `getSession()` outside any `try`.
3. `getSession()` queries the database. A guest cookie selects `Player.username` and `Player.avatarKey`. An `s1_` account cookie reads `AccountSession`. Migration `20261104030000_player_identity` adds all of these.
4. The query fails. `getSession()` catches the error, **discards it**, and throws `SessionUnavailableError`.
5. Nothing catches that in the route, so the platform returns **HTTP 500 with an empty body**.
6. The client calls `response.json()` on the empty body, and the browser reports "Unexpected end of JSON input". Cuisine Quest then displayed that message to the player.

Socket.IO polling returns 200 because it is served by the separate realtime service. Without a token, the socket's authentication still fails.

### Evidence

**Production, read-only and with no valid session.** The `s1_` cookie was a random value matching no account, which makes the server run one failed lookup and write nothing.

| Request | Result | Meaning |
| --- | --- | --- |
| `GET /api/health` | 200, `database: ok`, `realtime: ok` | Database reachable by raw `SELECT 1`; connection and credentials work |
| `GET /api/cuisine-quest/leaderboard?level=1` | 503 | The `CuisineProgress` query fails |
| `GET /leaderboard` | "unavailable" | This query also selects `username` and `avatarKey` |
| `GET /api/cuisine-quest/campaign`, no cookie | 401 JSON | Route works when no database lookup happens |
| `GET /api/session`, no cookie | 200 JSON | Same |
| `GET /api/cuisine-quest/campaign`, random `s1_` cookie | **500, 0 bytes** | Matches the browser report |
| `POST /api/session/token`, random `s1_` cookie | **500, 0 bytes** | Matches the browser report |
| `GET /api/session`, random `s1_` cookie | 503 JSON | The one caller that guards this, failing at the same lookup |

Production's Workers Build for `main` at `e1888ad`, which contains the identity code, reported success. The repository records no production migration, and its docs repeatedly say none was authorized. Neither Workers Builds nor Railway runs migrations.

**Local reproduction** with the unmodified code, on a database built with real migrations through `20261104010000`:

| Request | Result |
| --- | --- |
| Health, database part | `ok` |
| Cuisine leaderboard | 503 |
| Campaign and token, guest and `s1_` cookies | **500, 0 bytes, "Unexpected end of JSON input"** |
| Wallet and solo start, guest cookie | **500, 0 bytes** |
| `GET /api/session` | 503 JSON |

Every production response in the table above was reproduced. After the two migrations were applied, with no code change beyond the error handling below, every route returned its normal result. The real OpenNext Worker in local workerd behaved the same way, with both schema states on a local database.

### Other causes considered

| Candidate | Assessment |
| --- | --- |
| Missing or short `AUTH_SECRET` | **Does not fit this failure.** For a guest cookie it is caught and treated as no session, giving 401. The `s1_` failure happens without it. A separate token-signing failure is still possible, and would need logs after the fix |
| Wrong `DATABASE_URL` or database down | Unlikely. Production health reports the database `ok` |
| Prisma failing in general on Workers | Unlikely. Queries worked in local workerd once migrated, though production's runtime was not inspected directly |
| Prisma client initialisation | Unlikely. `/api/health` uses the same client path |
| Rate limiter | Unlikely. It is in-memory, with no database or fragile dependency |
| Response serialization | Not the source. The body is empty because the route threw before any response was built |

### Later finding: database lookup on every realtime packet

Running the games against a remote copy of production exposed a separate problem. `apps/realtime/src/server.ts` looked up the account on every socket packet, including each drawing stroke and movement input, and treated any database error as invalid. Under load that means heavy database traffic, queued game input, and players disconnected by a brief database error. A Doodle Duel guess was lost this way at about 248 ms per query. Local databases hid it.

This code is on `main`. It's fixed locally in `apps/realtime/src/account-guard.ts`: game packets no longer wait, accounts are rechecked in the background every 5 seconds, entry events still wait for a fresh answer, and only a definite "invalid" disconnects. **A revoked session can now keep sending game packets for up to about 5 seconds.** A new connection still needs a definite yes.

### What is not confirmed

- The real error text. The old code discarded it, and the Worker logs were not read.
- That real player sessions recover. Public checks with a made-up session did, after the migration.
- Worker logs: the new error lines were seen in the local Node server log, but the workerd run's captured log didn't include them, so their appearance in Cloudflare is unverified.

**One browser check, no tools needed:** while signed in with the normal cookie, open `https://sinversegames.com/api/session`. A 503 with "Player sessions are temporarily unavailable" confirms this path for real users.

### Code changes, local only

These make the failure readable. **They do not fix production on their own. The migration does.**

- **`lib/server/api-route.ts` (new):** `jsonRoute` wraps nine API routes, so a failure always reaches the client as JSON: 503 for session failures, and 500 with a safe message for anything else.
- **`lib/server/session.ts`:** logs the real failure, with Prisma's error code and model, in place of discarding it. Connection strings are removed from the message. A missing `AUTH_SECRET` is now logged too.
- **`lib/read-json.ts` (new):** `readJson` and `expectJson` tolerate empty or malformed bodies. Used by Cuisine Quest, solo games, the wallet and avatar upload.
- **`components/play/solo-runner.tsx`:** handles a 503 without a result, and a JSON error from personal bests. Both would otherwise have crashed once errors became JSON.

Effect on an unmigrated database: campaign and token go from an empty 500 to a JSON 503, and the player sees "Player sessions are temporarily unavailable. Please retry." The server log now shows `P2022 … Player`.

**Tests:** `e2e/backend-errors.spec.ts` covers empty 500s, HTML error pages, truncated JSON and empty 200s across real pages. `e2e/identity-outage.spec.ts` now breaks the real table and checks each route returns a JSON 503 with nothing about the database in the body.

Local results with these changes: 5 typechecks pass, 235 unit and integration tests, 50 PostgreSQL tests, and 74 browser tests pass with the 1 on-demand evidence test skipped. The Linux OpenNext build passes. These were not run in Cloudflare.

No wallet, campaign or player data was changed, in production or by this code.

## 2. Cloudflare Workers Build failure

### Status

**Build `1bb8002f` for `123e76c` failed, and the cause is unknown.** Its log requires a dashboard login. The fix is not confirmed.

### The Worker name discrepancy

The connected Worker is `sinversegames`, and both configs say `sinversegames-web`.

**Probably not the blocker.**

- Wrangler 4.157.0's source gives `WRANGLER_CI_OVERRIDE_NAME` priority over the config name when choosing the Preview's Worker. In the deploy path it logs a "Failed to match Worker name" warning and continues with the CI name.
- Cloudflare's [troubleshooting page](https://developers.cloudflare.com/workers/ci-cd/builds/troubleshoot/) says names "must match", but also says that on Wrangler v3 and up, Workers Builds "automatically matches the name of the connected Worker" through that variable.
- **Strongest evidence:** the production build of `e1888ad` succeeded with the same mismatch.

Caveats: the production build was on the deploy path, not the Preview path, and this assumes Workers Builds sets the variable on Preview builds, which only the log can show. A mismatch warning in the log is expected and is not by itself the failure.

**Recommendation:** don't rename anything blindly. Once the build works, align the config name with the real Worker as a separate, deliberate change, updating both configs and the docs.

### Configuration review

| Question | Answer | Evidence |
| --- | --- | --- |
| Root config suits a root-level build? | Yes, if Root directory is `/`. Paths point at `apps/web/.open-next` | Local dry run from the root passed with Wrangler 4.157.0 |
| Preview config valid? | Yes locally. Wrangler passed its config check and reached the Previews API, stopped by a deliberately invalid token | Local run |
| Preview and production commands distinct? | In the repo, yes: `cloudflare:preview:deploy` runs `wrangler preview`, `cloudflare:deploy` runs `opennextjs-cloudflare deploy`. **The dashboard values are unverified** | Scripts, plus owner check |
| Pinned Wrangler used? | **Not by a bare `npx wrangler preview`.** The root has no Wrangler dependency, so `npx` downloads the latest (4.157.0 in your log). `pnpm cloudflare:preview:deploy` does use the pinned 4.155.0 | Log and `package.json` |
| Correct OpenNext output? | Yes. Worker and assets found, same payload size from both configs | Dry runs |
| Can the Preview command publish production? | `wrangler preview` is documented to create "a Preview without promoting it to production", and its API path is `/workers/.../previews/...`. Not verified on a real account. See the warnings below | Docs, source, local run |

**Warnings:**

- **Bare deploy now proceeds at the root.** Before the root config, a bare `npx wrangler deploy` at the root failed. It would now publish, without the cache step. Confirm the Deploy command before merging.
- **My `cf:build` change is a possible new failure point.** `populateCache local` now runs in the build. It passed locally on Linux, but that isn't the Cloudflare environment. A failure at that step would be my regression and should be checked first.
- **Previews don't inherit production settings.** Per Cloudflare's docs, Previews need their own settings, and Preview URLs are public by default. Without Preview-only secrets, a Preview may deploy and then fail at runtime, which would be a separate problem from this build error.
- **The current Preview would also need a migrated database,** or it will show the same session errors.

### Diagnostic checklist

**Do not change settings until the log has been read.** From [build 1bb8002f](https://dash.cloudflare.com/21c2f668735c78d18513f64d381aa233/workers/services/view/sinversegames/production/builds/1bb8002f-c17e-48a7-aabd-3818f19b5dac), or Workers & Pages → `sinversegames` → Deployments → Builds, collect:

1. The first `✘ [ERROR]`, with about 20 lines above it. Remove secrets.
2. Which stage failed: clone, install, build command or preview command.
3. The Wrangler version printed, and whether a `Failed to match Worker name` warning appears.
4. From Settings → Build: Root directory, Build command, Deploy command, Preview command, production branch, and whether Preview builds are enabled.
5. Whether the Worker has a Previews Base configuration, and that the build token is still valid.

Then match the error:

| What the log shows | Likely meaning | Next step |
| --- | --- | --- |
| `missing a previews block` again | Config not loaded: Root directory differs, or the command runs elsewhere | Compare Root directory with the config location |
| Install fails, lockfile or `ERR_PNPM` | Dependency or tool version problem | Check the Node and pnpm lines in the log |
| Fails in `opennextjs-cloudflare build` | Compilation problem | Read the first compile error |
| Fails in `populateCache` | **My `cf:build` change** | Revert that part, and prepare the cache in the Preview command only |
| `Missing entry-point`, or `worker.js` not found | Output not where the config expects | Compare Root directory and paths |
| `The name in your Wrangler configuration file … must match` | The name mismatch does block here | Align the name, deliberately |
| `Authentication`, `permission`, code 10000 or 9106 | Build token lacks access | Owner issues a suitable token |
| `build token … deleted or rolled` | Stale token | Owner selects a new one |
| Upload rejected for size | Worker over plan limit | Compare against the plan limit. Local total is 23.2 MB, 6.2 MB gzip |
| API error on `/previews/` | Preview feature or account state | Read the message; check Cloudflare's docs |
| Build succeeds and the check still fails | Check reporting issue | Read the Builds page |

## 3. Commands to run next

Owner, in this order. None of these changes anything:

1. Open `https://sinversegames.com/api/session` in your normal browser.
2. Copy the build log items above.
3. In a terminal with production's database URL, never pasted into chat:

   ```bash
   DATABASE_URL="<production URL>" pnpm --filter @platform/db exec prisma migrate status
   ```

The migration plan is in [PRODUCTION_MIGRATION_READINESS.md](PRODUCTION_MIGRATION_READINESS.md).
