# Sinverse Cricket T20/ODI release: environment checklist

Which settings the T20/ODI release needs, by runtime. **No values are recorded here**, only names. The values live in Cloudflare (Worker secrets and build variables), Railway and Neon, and only the owner can see or change them.

**The release adds no environment variable, no binding and no secret.** It uses the ones already required for the existing solo games:
- `AUTH_SECRET` signs and checks the run token.
- `DATABASE_URL` stores the result.
- `NEXT_PUBLIC_SITE_URL` decides whether cookies are `Secure`.

The full list below was taken from the code (`process.env` reads in `apps/web/src`, `apps/web/next.config.ts`, `apps/web/scripts`, `packages/db/src`, `packages/shared/src`, and `apps/realtime/src/config.ts`) on 2026-11-13. It was checked against `DEPLOYMENT.md` § 6.

## Web app: Cloudflare Worker runtime (secrets or vars)

Set as Worker secrets (`pnpm exec wrangler secret put NAME` in `apps/web`, or the dashboard: Workers & Pages → `sinversegames` → Settings → Variables and Secrets). Worker Previews don't inherit these; see `CRICKET_PREVIEW_VALIDATION_PLAN.md`.

| Variable | Required? | Used by | If missing |
|---|---|---|---|
| `AUTH_SECRET` | **Required** (≥ 32 characters, identical on Railway) | Guest and account sessions, **cricket run tokens** (`/api/solo/start`, `/api/solo/submit`), realtime tokens | Every session and solo route fails with a server error (`authSecret()` throws). No game can start |
| `DATABASE_URL` | **Required for persistence** (Neon **pooled** URL) | Results, stats, Sin Coins, achievements, accounts, `/api/health` | `getDb()` returns null. Cricket still verifies and shows the result, but nothing is saved (`saved: false`), and the duplicate-run check is skipped. Health reports `database: "disabled"`. Registered accounts fail closed |
| `ADMIN_TOKEN` | Optional (≥ 16 characters, identical on Railway) | `/admin` | `/admin` is unavailable |
| `AUTH_ORIGIN` | Required for Google and email sign-in | OAuth callbacks, email links | Google and email sign-in are unavailable. Guest play, including cricket, is unaffected |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional | Google sign-in | The Google button is disabled |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional | Email sign-in (codes and links) | Email sign-in says it's unavailable |
| `REALTIME_INTERNAL_URL` | Optional | Avatar processing on Railway; health check target | Avatar uploads are unavailable. Health falls back to `NEXT_PUBLIC_REALTIME_URL` |
| `NODE_ENV` | Set by `wrangler.jsonc` `vars` (`production`), also in `previews.vars` | Next.js; hides `/dev/cricket-studio` | — (already in the config) |
| `DATABASE_POOL_MAX` | Not used on Workers (one connection per client) | Node only | — |
| `REWARDS_ENABLED` | Optional | Sin Coins grants | See `packages/db` (defaults on) |
| **Binding** `ASSETS` | **Required** (in `wrangler.jsonc`) | Static assets, prerendered pages | The site doesn't load |
| **Binding** `AVATARS` (R2) | Optional, **not in `wrangler.jsonc`** | Avatar storage | Avatar uploads are unavailable (pre-existing; not cricket) |

**Must never be set in production:** `IDENTITY_TEST_MODE`, `AVATAR_LOCAL_DIR`, `EMAIL_API_URL`, `CRICKET_STUDIO`. They are local test fixtures or development tools, guarded to loopback and `*_test` databases.

## Web app: build variables (Workers Builds → Settings → Build → Variables)

`NEXT_PUBLIC_*` values are compiled into the bundle at build time, so they must be present when Workers Builds runs `pnpm cloudflare:build`.

| Variable | Required? | If missing or wrong |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | **Required** (`https://sinversegames.com`) | Canonical links break, and a non-`https` value makes session cookies non-`Secure` |
| `NEXT_PUBLIC_REALTIME_URL` | **Required** (`https://rt.sinversegames.com`) | Multiplayer can't connect; the content-security policy is built from it. Cricket is solo and doesn't use it |
| `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_BRAND_TAGLINE`, `NEXT_PUBLIC_BRAND_DESCRIPTION` | Optional | Defaults are used |
| `NODE_VERSION` | Absent, or exactly `24.14.0` | `.node-version` selects 24.14.0. A different override risks an untested toolchain |
| `WORKERS_CI*` | Set by Workers Builds itself | Read by `scripts/cloudflare-build-env.mjs` to record the build for the production deploy check |

## Realtime service: Railway

Unchanged by this release. Cricket doesn't use realtime.

| Variable | Required? | Notes |
|---|---|---|
| `AUTH_SECRET` | **Required**, identical to the Worker | |
| `DATABASE_URL` | **Required**, Neon pooled | |
| `ALLOWED_ORIGINS` | **Required** in production | Exact origins: apex and www |
| `ADMIN_TOKEN` | Optional, identical to the Worker | |
| `PORT`, `HOST`, `NODE_ENV` | Provided by Railway and the image | |
| `LOG_LEVEL`, `MATCHMAKING_WAIT_MS`, `MAX_CONNECTIONS_PER_IP`, `RECONNECT_GRACE_MS`, `ROOM_IDLE_MS`, `FINISHED_ROOM_TTL_MS`, `EMPTY_ROOM_TTL_MS`, `MAX_ROOMS` | Optional tuning | See `.env.example` |

## Database: Neon

- **Pooled** connection string: `DATABASE_URL` on the Worker and Railway.
- **Direct** connection string: only in a temporary terminal for an approved `pnpm db:deploy`.
- **The T20/ODI release needs no migration.** See `CRICKET_SECURITY_RELEASE_REVIEW.md` § Database compatibility.

## Settings the release does depend on, outside variables

| Setting | Where | Status |
|---|---|---|
| **Workers plan CPU limit** | Cloudflare account and the Worker's settings | **NOT VERIFIED.** The Free plan's 10 ms would reject T20/ODI verification. Paid's 30 s default fits. See `CRICKET_CLOUDFLARE_COMPATIBILITY.md` |
| `limits.cpu_ms` | `wrangler.jsonc` or the dashboard | Not set in the repository (Paid default: 30,000 ms). The dashboard value is unknown |
| Workers Builds production branch `main`; build command `pnpm cloudflare:build`; deploy command `pnpm cloudflare:deploy`; Preview command `pnpm cloudflare:preview:deploy` | Workers Builds settings | As documented in `DEPLOYMENT.md` § 4. The current dashboard values are not visible from here |
