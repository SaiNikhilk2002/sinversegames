# Plan: isolated Preview for web and realtime

Status: **a plan for review. Nothing has been created or changed.** The owner creates the services, enters every secret and approves each dashboard change. No step here reuses or edits the production Railway service, production variables, the production database or production Cloudflare settings.

## What has to be true

1. The web Preview talks only to a non-production realtime service.
2. That realtime service accepts only the Preview web origin.
3. Both use their own database, which has no production data.
4. Both share one Preview-only `AUTH_SECRET`, different from production's.
5. A mistake fails closed: nothing in the Preview can create, read or change production players, wallets, rewards or matches.

Point 4 is the safety net. Socket tokens are signed with `AUTH_SECRET`, so if the Preview build were ever pointed at production realtime by mistake, production would reject every token.

## The constraint that decides the Cloudflare setup

`NEXT_PUBLIC_REALTIME_URL` is compiled into the web build in two places:

- The browser's socket address, in `lib/realtime/connection.ts`.
- The Content Security Policy's `connect-src`, in `next.config.ts`.

So the Preview build itself must be compiled with the non-production realtime URL. Runtime variables alone aren't enough.

**The owner needs to check one thing in the Cloudflare dashboard:** whether Workers Builds build variables can differ between production and non-production branches on the existing `sinversegames` Worker.

| Answer | Route |
|---|---|
| Yes, build variables can be set per environment or branch | **A.** Use the existing Worker's branch Previews, with non-production build variables |
| No, build variables are shared by every build | **B.** Create a separate Worker, for example `sinversegames-staging`, connected to the same repository, with its own build variables and no custom domains. Route A would compile the production realtime URL into the Preview, or the staging URL into production, so it isn't acceptable |

Route B is the clean, low-risk default if there's any doubt, because nothing about it can reach the production Worker's settings.

## Railway: a separate realtime service

| Setting | Value |
|---|---|
| Project | A separate Railway project, or at least a separate environment (for example `staging`) and service. **Never** the production service `luminous-recreation / production` |
| Source | This repository, deploy branch set to the branch under test (the Cuisine Quest branch after its rebase) |
| Build | Existing `railway.json` (Dockerfile `apps/realtime/Dockerfile`, health check `/health`, one replica) |
| Domain | A Railway-generated domain, or a staging subdomain. Never `rt.sinversegames.com` |
| Auto-deploy | Off for `main`, so production code is never deployed by this service by accident |

Realtime variables (names only; the owner sets the values):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `AUTH_SECRET` | New Preview-only secret, at least 32 characters, identical to the Preview web's |
| `ALLOWED_ORIGINS` | The exact Preview web origin(s), for example `https://<preview-host>`. No wildcards, no production origins |
| `DATABASE_URL` | Preview database, pooled URL |
| `ADMIN_TOKEN` | Optional. A new Preview-only value if admin endpoints are needed |
| `RECONNECT_GRACE_MS`, `ROOM_IDLE_MS`, `FINISHED_ROOM_TTL_MS`, `EMPTY_ROOM_TTL_MS`, `MATCHMAKING_WAIT_MS`, `MAX_ROOMS`, `MAX_CONNECTIONS_PER_IP`, `LOG_LEVEL` | Defaults are fine. Set only to test something specific |
| `PORT` | Leave to Railway |

## Database

A new Neon branch or project for the Preview, with its own role and password. It must not be a branch of production that shares a role or password. The owner already rejected two specific production branch IDs in the email tests, and the same rule applies here.

1. The owner creates the database and gives the direct URL only to the migration step.
2. Apply the four existing migrations with `pnpm db:deploy` and the **direct** URL, only after the target is confirmed not to be production. A safe check is `SELECT current_setting('neon.branch_id')`, compared against the known production IDs.
3. Web and realtime use the **pooled** URL.

## Web Preview variables

| Variable | Kind | Value |
|---|---|---|
| `NEXT_PUBLIC_REALTIME_URL` | **Build** | The staging realtime URL |
| `NEXT_PUBLIC_SITE_URL` | Build | The Preview origin |
| `AUTH_SECRET` | Runtime secret | The same Preview-only secret as staging realtime |
| `AUTH_ORIGIN` | Runtime | The Preview origin |
| `DATABASE_URL` | Runtime secret | The Preview database, pooled URL |
| `REALTIME_INTERNAL_URL` | Runtime | The staging realtime URL. Only needed for avatar processing |

These stay unset unless a test needs them, and then only with Preview-only values:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: a separate OAuth client with the Preview callback only.
- `RESEND_API_KEY`, `EMAIL_FROM`: a separate key.
- The `AVATARS` binding: a separate bucket.
- `ADMIN_TOKEN`.

Never set `IDENTITY_TEST_MODE` or `AVATAR_LOCAL_DIR` on a hosted Preview.

## Order of work, each step approved by the owner

1. **Database.** Create the Preview database and record its branch ID. Migrate it (engineering, with the owner's direct URL), then confirm it isn't a production branch.
2. **Realtime.** Create the staging Railway service with the variables above, and deploy the branch under test. Check:
   - `GET /health` returns `ok`.
   - A socket from an unlisted origin is refused.
   - A production-signed token is refused.
3. **Web.** Set the web Preview's build and runtime variables using route A or B, and build the branch.
4. **Isolation checks**, on the hosted Preview:
   - The page's CSP and socket target name the staging realtime host, not `rt.sinversegames.com`.
   - The browser network panel shows no request to production realtime.
   - A test player created on the Preview exists only in the Preview database.
5. **End-to-end**, on the hosted Preview with two separate browsers and identities:
   - A Chef Rivals match.
   - A 2-player and a 3-player co-op shift.
   - Reconnect and rematch.
   - Each result recorded once in the Preview database.
   - A rejected out-of-date protocol version.
6. **Record** build IDs, commits, URLs (without secrets) and results. Only then report hosted Preview success.

## Production release, later and separately approved

Deploy realtime first, since it only adds games and events and old web clients keep working. Then deploy web. The new modes fail with a clear error if web goes first.
