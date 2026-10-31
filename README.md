# Playwave — multiplayer browser games platform

*"Playwave" is a placeholder brand; set `NEXT_PUBLIC_BRAND_NAME` to rename everything.*

A production-oriented platform for instant multiplayer browser games: guest play without sign-up, private rooms with invite links, public matchmaking, server-authoritative game engines, profiles, stats, achievements and leaderboards.

**Games**

- **Color Clash**: an original colour-and-action shedding card game for 2–4 players.
- **Doodle Duel**: a real-time draw-and-guess party game for 2–8 players.

Rules: [GAME_RULES.md](GAME_RULES.md) · Design: [ARCHITECTURE.md](ARCHITECTURE.md) · Hosting: [DEPLOYMENT.md](DEPLOYMENT.md)

## Architecture at a glance

```
apps/web        Next.js 16 (App Router) — pages, API routes, game UIs, admin
apps/realtime   Socket.IO server — auth, rooms, matchmaking, timers, engines, persistence
packages/shared game registry, wire protocol, validation, tokens, branding
packages/engines pure game engines (Color Clash, Doodle Duel) + GameEngine contract
packages/db     Prisma 7 schema, migrations, repositories, progression rules
```

The web app and realtime server deploy independently: the web app works on serverless hosting, and the realtime server needs an always-on Node host. All game state is owned by the server. Clients only send intents, and each player receives a view with other players' private data removed.

## Requirements

- Node.js ≥ 20.11
- pnpm 11 (`corepack enable`)
- No Docker needed: `pnpm db:local` runs an embedded PostgreSQL.

## Local development

```bash
pnpm install                 # also generates the Prisma client
cp .env.example .env         # then fill AUTH_SECRET and ADMIN_TOKEN (see the file for commands)
                             # and set DATABASE_URL=postgresql://platform:platform@localhost:5433/platform

pnpm db:local                # terminal 1: local Postgres on :5433 (data in .data/postgres)
pnpm db:deploy               # apply migrations (or `pnpm db:migrate` while developing the schema)
pnpm dev                     # terminal 2: web on http://localhost:3200, realtime on :4200
```

Open http://localhost:3200, pick a game, choose a name, create a private room, and open the invite link in a second browser (or a private window) to play.

Without `DATABASE_URL`, everything playable still works. Profiles, stats and leaderboards show "unavailable".

### Ports

The web app uses **3200** and the realtime server **4200** to avoid clashing with other local projects. Change `--port` in `apps/web/package.json`, `PORT`, and the URLs in `.env` together.

## Environment variables

Every variable is documented in [.env.example](.env.example). The ones you must supply:

| Variable | Where | What |
| --- | --- | --- |
| `AUTH_SECRET` | web + realtime | Random secret (≥32 chars) signing session and realtime tokens. Same value on both. |
| `DATABASE_URL` | web + realtime | PostgreSQL URL (local embedded DB or Neon pooled URL). |
| `ADMIN_TOKEN` | web + realtime | Enables `/admin`; same value on both. |
| `NEXT_PUBLIC_SITE_URL` | web | Public site URL. |
| `NEXT_PUBLIC_REALTIME_URL` | web | Public realtime URL (build time). |
| `ALLOWED_ORIGINS` | realtime | Site origin(s) allowed to connect. |

## Database

```bash
pnpm db:local      # embedded Postgres for development
pnpm db:migrate    # create/apply a migration after editing packages/db/prisma/schema.prisma
pnpm db:deploy     # apply committed migrations (CI / production)
pnpm db:studio     # browse data
```

## Tests

```bash
pnpm test          # unit + integration (engines, shared, realtime over real sockets)
pnpm build         # production build of web + realtime (required before e2e)
pnpm test:e2e      # Playwright, multiple browser contexts (starts both servers if not running)
```

First time only: `pnpm --filter @platform/web exec playwright install chromium`.

- **Engine unit tests** (65): deck composition, unbiased seeded shuffling, dealing, legal and illegal moves, every card effect, stacking, draw-pile exhaustion, timeouts, departures, scoring, hand privacy, and 150 random full-game simulations with card-conservation checks. Doodle: word selection, word privacy, normalisation, alternatives, typo and close detection, hints, timers, scoring, rotation, duplicate and simultaneous guesses, stroke validation and ordering, disconnects.
- **Shared tests** (8): name sanitising, token forgery, expiry and kind confusion, room codes.
- **Realtime integration tests** (23): auth and bans, identity spoofing, create/join/full/invalid rooms, host controls, kick, one-room-per-player, full Color Clash match over sockets with persistence, hand privacy on the wire, simultaneous, stale and duplicate actions, reconnect, grace expiry, session replacement, cross-room isolation, Doodle word privacy, stroke relay, canvas sync and server scoring, guess rate limiting, matchmaking, public auto-start, admin auth.
- **E2E** (8): homepage → discovery → guest entry, server-side name validation, invalid rooms, private room via invite link in a second browser, a complete 2-player Color Clash match, reconnect after reload, a complete 2-player Doodle Duel match (drawing sync verified by canvas pixels, correct-guess scoring), and no horizontal overflow on mobile.

## Build and run in production mode

```bash
pnpm build
pnpm start:realtime
pnpm start:web
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md): Vercel (web) + Fly.io/Render (realtime) + Neon (Postgres), with a production checklist.

## Project conventions

- Strict TypeScript everywhere; workspace packages ship TypeScript source (transpiled by Next.js, bundled by tsup for the realtime server).
- All input is validated with Zod at the edge (API routes and socket handlers) and again by engines.
- Engines are pure and deterministic given an injected RNG and clock, which makes them testable.
- Never log secret words, hands, tokens or chat content.
