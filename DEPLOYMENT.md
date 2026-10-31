# Deployment

The platform is three pieces, deployed independently:

| Piece | Recommended host | Why | Indicative cost* |
| --- | --- | --- | --- |
| Web app (`apps/web`, Next.js) | Vercel (or any Node host) | Serverless-friendly; no long-lived connections needed | Free (Hobby) → $20/mo (Pro, required for commercial use) |
| Realtime server (`apps/realtime`) | Fly.io, Render or Railway, i.e. any always-on Node/Docker host | Needs persistent WebSockets and in-memory timers | ~$2–7/mo for one small always-on instance |
| PostgreSQL | Neon | Serverless Postgres with a pooled endpoint and a free tier | Free tier → ~$19/mo (Launch) |

\*Check current pricing with each provider; these are rough early-stage figures. Redis is **not** required for a single realtime instance (see ARCHITECTURE.md → Scaling).

Managed realtime services (Ably, Pusher, Liveblocks) were considered. They remove server ops but don't run game logic: the authoritative engine still needs a server, and per-message pricing is unattractive for drawing streams. The transport is isolated in `apps/realtime/src/server.ts` and `apps/web/src/lib/realtime/connection.ts`, so it can be replaced later.

---

## 1. Secrets

Generate two independent secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # ADMIN_TOKEN
```

Both must have **identical values** on the web app and the realtime server.

## 2. PostgreSQL (Neon)

1. Create a project at neon.tech (pick a region close to your realtime server).
2. Copy the **pooled** connection string (host contains `-pooler`, keep `?sslmode=require`) → `DATABASE_URL`.
3. Apply migrations from your machine or CI:
   ```bash
   DATABASE_URL="postgresql://…" pnpm db:deploy
   ```
   Run `pnpm db:deploy` on every release that adds migrations (`packages/db/prisma/migrations`).

## 3. Realtime server

### Fly.io (Docker)

```bash
fly launch --no-deploy --dockerfile apps/realtime/Dockerfile --name <app>-realtime
fly secrets set AUTH_SECRET=… ADMIN_TOKEN=… DATABASE_URL=… ALLOWED_ORIGINS=https://www.example.com
fly deploy --dockerfile apps/realtime/Dockerfile
```

In `fly.toml`, set `internal_port = 4200` (or set `PORT`). Use **one machine** and disable auto-stop for the realtime app, because active games live in memory:

```toml
[http_service]
  internal_port = 4200
  auto_stop_machines = "off"
  min_machines_running = 1
```

Note: the Dockerfile has not been built in this environment (Docker wasn't available). Run `docker build -f apps/realtime/Dockerfile .` once locally or in CI before the first deploy.

### Render / Railway (no Docker)

- Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @platform/db generate && pnpm --filter @platform/realtime build`
- Start command: `pnpm --filter @platform/realtime start`
- Health check path: `/health`
- Env: `AUTH_SECRET`, `ADMIN_TOKEN`, `DATABASE_URL`, `ALLOWED_ORIGINS`, `NODE_ENV=production` (`PORT` is provided by the host).

The realtime server refuses to start in production without `ALLOWED_ORIGINS`.

## 4. Web app (Vercel)

1. Import the repository; set **Root Directory** to `apps/web`. Vercel detects pnpm workspaces and Next.js.
2. Build command: `cd ../.. && pnpm --filter @platform/db generate && pnpm --filter @platform/web build` (or keep the default if the `postinstall` Prisma generate runs).
3. Environment variables:
   - `AUTH_SECRET`, `ADMIN_TOKEN`, `DATABASE_URL`
   - `NEXT_PUBLIC_SITE_URL=https://www.example.com`
   - `NEXT_PUBLIC_REALTIME_URL=https://<app>-realtime.fly.dev` (or your `rt.` domain). **Inlined at build time — redeploy after changing it.**
   - `REALTIME_INTERNAL_URL` (optional)
   - Branding: `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_SUPPORT_EMAIL`, etc.

The Content Security Policy automatically allows `NEXT_PUBLIC_REALTIME_URL` for `connect-src`.

## 5. Domains

- `www.example.com` → Vercel.
- `rt.example.com` → realtime host (CNAME, with TLS via the host). Browsers connect with `wss://`.
- Set `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_REALTIME_URL` and `ALLOWED_ORIGINS` to match exactly (no trailing slash).

## 6. Environment matrix

| Variable | Web | Realtime | Notes |
| --- | --- | --- | --- |
| `AUTH_SECRET` | ✅ | ✅ | identical, ≥32 chars |
| `ADMIN_TOKEN` | ✅ | ✅ | identical, ≥16 chars; enables admin |
| `DATABASE_URL` | ✅ | ✅ | pooled Neon URL |
| `NEXT_PUBLIC_SITE_URL` | ✅ | | build time |
| `NEXT_PUBLIC_REALTIME_URL` | ✅ | | build time |
| `REALTIME_INTERNAL_URL` | optional | | |
| `ALLOWED_ORIGINS` | | ✅ | the site origin(s) |
| `PORT` | | host-provided | default 4200 |
| tuning (`RECONNECT_GRACE_MS`, …) | | optional | see `.env.example` |

## 7. Production checklist

- [ ] Fresh `AUTH_SECRET` and `ADMIN_TOKEN`, set identically on both services, never committed.
- [ ] `pnpm db:deploy` applied to the production database.
- [ ] `ALLOWED_ORIGINS` set to the exact site origin; `NODE_ENV=production` on the realtime server.
- [ ] `https://www.example.com/api/health` returns `{"status":"ok"}` (checks the database and realtime server).
- [ ] `https://rt.example.com/health` returns `ok`; uptime monitoring points at both.
- [ ] Sign in at `/admin` with `ADMIN_TOKEN` and confirm metrics load.
- [ ] Legal pages reviewed by someone qualified for your jurisdiction; `NEXT_PUBLIC_SUPPORT_EMAIL` set to a monitored inbox.
- [ ] One realtime instance with auto-stop disabled (or shard per ARCHITECTURE.md before scaling out).
- [ ] Realtime deploys scheduled for low-traffic times (active matches end on restart; players see "The game server restarted").
- [ ] `pnpm test` and `pnpm test:e2e` green in CI.
