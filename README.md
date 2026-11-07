# SinverseGames — browser games platform

*The platform name is fixed as SinverseGames, including when an older build environment supplies a different name.*

A production-oriented platform for instant multiplayer browser games: guest play without sign-up, private rooms with invite links, public matchmaking, server-authoritative game engines, profiles, stats, achievements and leaderboards.

**Games**

Multiplayer (realtime rooms, private invites, matchmaking):

- **Color Clash**: an original colour-and-action shedding card game for 2–4 players.
- **Doodle Duel**: a real-time draw-and-guess party game for 2–8 players.
- **Token Trail**: a race-home dice board game for 2–4 players.
- **Bumper Blitz**: a real-time bumper-pod arena brawler for 2–6 players.

Single player (server-verified scores, daily leaderboards):

- **Cuisine Quest**: seven illustrated world kitchens, 28 recipes, spatial preparation, heat control, a saved 21-star campaign and per-cuisine rankings.
- **Kitchen Rush**: a time-management cooking game with 12 levels and a tutorial.
- **Cascade Solitaire**: Klondike-rules patience with undo, hints and draw 1/3.
- **Mahjong Garden**: tile matching on three always-solvable layouts.
- **Sinverse Cricket**: original 3D one/two-over duels with batting, bowling, two innings, scorecards and real-event replay; a playable tactical fallback supports unavailable WebGL2. [Design and scope](docs/SINVERSE_CRICKET_GAME_DESIGN.md) ? [QA](docs/SINVERSE_CRICKET_QA_REPORT.md).

Earn **Sin Coins** from eligible server-verified play and spend them on profile frames and nameplates in the cosmetic studio at `/store`. Wallet history and owned styles persist in PostgreSQL; guest access still depends on this browser's cookie. Optional Google linking/sign-in, username onboarding, revocable account sessions and normalized avatar upload are now implemented; real Google/R2 use awaits owner configuration. Nine further expansion games remain unimplemented. Cuisine Quest is the first implemented expansion game; see [its design](docs/CUISINE_QUEST_DESIGN.md) and [current validation](docs/CUISINE_QUEST_QA_REPORT.md). See [the expansion plan](docs/GAME_EXPANSION_PLAN.md) and [current QA/status](docs/EXPANSION_QA_REPORT.md).

The plan for the first 50 games, with a status tracker: [docs/GAME_ROADMAP.md](docs/GAME_ROADMAP.md).

Rules: [GAME_RULES.md](GAME_RULES.md) · Design: [ARCHITECTURE.md](ARCHITECTURE.md) · Hosting: [DEPLOYMENT.md](DEPLOYMENT.md)

See [account authentication](docs/AUTHENTICATION.md), [external setup/local commands](docs/PLAYER_IDENTITY_SETUP.md), and [identity QA](docs/PLAYER_IDENTITY_PERSISTENCE_QA_REPORT.md). Linking preserves the same Player ID and all wallet/campaign records.

## Architecture at a glance

```
apps/web        Next.js 16 (App Router) — pages, API routes, game UIs, admin
apps/realtime   Socket.IO server — auth, rooms, matchmaking, timers, engines, persistence
packages/shared game registry, wire protocol, validation, tokens, branding
packages/engines pure game engines (multiplayer GameEngine + replay-verified solo games)
packages/db     Prisma 7 schema, migrations, repositories, progression rules
```

The web app and realtime server deploy independently: the web app works on serverless hosting, and the realtime server needs an always-on Node host. All game state is owned by the server. Clients only send intents, and each player receives a view with other players' private data removed.

## Requirements

- Node.js **24.14.0** for reproducible local/Cloudflare builds (both `.node-version` files); supported range is `>=24.14.0 <25`.
- pnpm **11.15.1** (`corepack enable`; pinned by `packageManager`). Keep the committed lockfile and install with `pnpm install --frozen-lockfile`.
- No Docker needed: `pnpm db:local` runs an embedded PostgreSQL.

## Local development

```bash
pnpm install --frozen-lockfile # also generates both Prisma clients
cp .env.example .env         # then fill AUTH_SECRET and ADMIN_TOKEN (see the file for commands)
                             # and set DATABASE_URL=postgresql://platform:platform@localhost:5433/platform

pnpm db:local                # terminal 1: local Postgres on :5433 (data in .data/postgres)
pnpm db:deploy               # apply migrations (or `pnpm db:migrate` while developing the schema)
pnpm dev                     # terminal 2: web on http://localhost:3200, realtime on :4200
```

Open http://localhost:3200, pick a game, choose a name, create a private room, and open the invite link in a second browser (or a private window) to play.

Without `DATABASE_URL`, the original seven games and Sinverse Cricket remain playable, and Cuisine Quest offers first-kitchen practice. Saving and later campaign kitchens require the database; profiles, stats and leaderboards show "unavailable".

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
pnpm test:db       # real economy/campaign/concurrency tests; requires migrated localhost *_test DB
```

First time only: `pnpm --filter @platform/web exec playwright install chromium`.

- **Engine unit tests** (149). New games:
  - **Cuisine Quest:** all 28 recipes in seven complete replay-verified shifts; heat/doneness boundaries, preparation geometry, portions, shared stations/two batches, wrong guest/finish, patience, stars and unlocks.
  - **Token Trail:** base exits, exact finish, captures and safe stars, three sixes, auto-move, timeouts, departures, and 60 random full games.
  - **Bumper Blitz:** countdown, steering and speed caps, input-only actions, collisions and hit credit, knockouts, self-falls, power-ups, the time limit, catch-up limits.
  - **Solitaire:** the deal, move legality, scoring and undo, replay verification, forged and out-of-order logs.
  - **Mahjong:** layouts, pairing, freeness, guaranteed solvability over 40 seeds, dead-end detection, replay verification and forged matches.
  - **Kitchen Rush:** level content consistency, cooking and burning, serving and tips, wrong dishes and walkouts, illegal combinations, seating, and replay equality with the live game.

  Original games (65): deck composition, unbiased seeded shuffling, dealing, legal and illegal moves, every card effect, stacking, draw-pile exhaustion, timeouts, departures, scoring, hand privacy, and 150 random full-game simulations with card-conservation checks. Doodle: word selection, word privacy, normalisation, alternatives, typo and close detection, hints, timers, scoring, rotation, duplicate and simultaneous guesses, stroke validation and ordering, disconnects.
- **Shared tests** (11): public username/avatar contract, plus name sanitising, token forgery, expiry and kind confusion, room codes.
- **Realtime/processing/configuration tests** (40). New games:
  - **Token Trail:** a full race over sockets with server-rolled dice, out-of-turn, stale and forged moves, auto-play while disconnected, and restore on reconnect.
  - **Bumper Blitz:** a server-side simulation driven by input, tick rate, malformed input, input-flood rate limiting, and a timed finish with persistence.
  - Rooms can only be created for multiplayer games.

  Original games (23): auth and bans, identity spoofing, create/join/full/invalid rooms, host controls, kick, one-room-per-player, full Color Clash match over sockets with persistence, hand privacy on the wire, simultaneous, stale and duplicate actions, reconnect, grace expiry, session replacement, cross-room isolation, Doodle word privacy, stroke relay, canvas sync and server scoring, guess rate limiting, matchmaking, public auto-start, admin auth.
- **E2E** (35). Identity and new games:
  - **Identity:** controlled OIDC linking/recovery in independent contexts, unchanged wallet/campaign/cosmetics, username onboarding, real local image lifecycle, session/socket revocation, hostile OAuth and cookie preservation during a database failure. Real Google/R2 configuration remains pending.
  - **Cuisine Quest:** a complete real seven-cuisine campaign, score improvement, server-owned stars/coins/achievements/profile/rankings, lost-response receipt recovery, touch/keyboard/drag, seven viewport sizes, pause/refresh/audio/reduced motion and hostile logs.
  - **Kitchen Rush:** the tutorial level played to a verified, saved score that shows on the leaderboard and profile.
  - **Anti-cheat:** forged logs, impossible timing, replayed runs, stolen runs and client-sent scores are all rejected.
  - **Solitaire:** draw, undo and play, then bank the score.
  - **Mahjong:** clear a full board with hints, blocked tiles refused.
  - **Token Trail:** a complete 2-player race.
  - **Bumper Blitz:** a timed 2-player match with keyboard steering.
  - **Phone layouts** for all five games.

  Original games (8): homepage → discovery → guest entry, server-side name validation, invalid rooms, private room via invite link in a second browser, a complete 2-player Color Clash match, reconnect after reload, a complete 2-player Doodle Duel match (drawing sync verified by canvas pixels, correct-guess scoring), and no horizontal overflow on mobile.

Counts describe the current suites; the older takeover/expansion reports retain their historical counts. Full command results and limitations are recorded in [Cuisine Quest QA](docs/CUISINE_QUEST_QA_REPORT.md).

## Build and run in production mode

```bash
pnpm build
pnpm start:realtime
pnpm start:web
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md): Cloudflare Workers (web, via OpenNext) + Railway (realtime) + Neon (Postgres), with a launch checklist.

```bash
pnpm --filter @platform/web cf:preview   # web app in the real Workers runtime (Linux/WSL only)
pnpm cloudflare:build                   # build Worker without publishing
pnpm cloudflare:config:check            # validate canonical Worker, both domains and Preview separation
pnpm cloudflare:artifact:check          # require Worker file/assets; print safe CI/artifact identifiers
pnpm cloudflare:check                   # production Worker/assets packaging; fixed --dry-run
pnpm cloudflare:preview:check           # route-free Preview settings projection; fixed --dry-run
```

Inside Workers Builds (`WORKERS_CI=1`), the root `pnpm build` builds the OpenNext Worker instead of the Node build. The root also pins Wrangler 4.155.0, so Cloudflare's default `pnpm run build` and `npx wrangler preview` work too. See [default build commands](docs/CLOUDFLARE_DEFAULT_BUILD.md).

Workers Builds Preview command: `pnpm cloudflare:preview:deploy` (publishes a branch Preview; not a local check). Production keeps `pnpm cloudflare:deploy`. See [preview configuration and verification](docs/CLOUDFLARE_PREVIEW_QA_REPORT.md); the open-beta Wrangler Preview command requires the checked-in `previews` block and Preview-only runtime secrets.

The confirmed existing production Worker is `sinversegames`, serving `sinversegames.com` and `www.sinversegames.com`. Both Wrangler configurations declare that name and those Custom Domains. [Worker configuration audit](docs/CLOUDFLARE_WORKER_CONFIGURATION_AUDIT.md) separates production deployment, branch Preview, local packaging and per-commit GitHub checks. No production routes or resources are copied into the Preview packaging projection.

## Project conventions

- Strict TypeScript everywhere; workspace packages ship TypeScript source (transpiled by Next.js, bundled by tsup for the realtime server).
- All input is validated with Zod at the edge (API routes and socket handlers) and again by engines.
- Engines are pure and deterministic given an injected RNG and clock, which makes them testable.
- Never log secret words, hands, tokens or chat content.
