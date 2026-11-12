# SinverseGames: one repository, one platform

On 2026-11-10 the separate Cricket Universe and Cuisine Quest worktrees were folded back into this repository. `D:\dev\games` is the only development home. This page describes what the platform consists of and where each part lives.

## Structure

| Path | What it is |
|---|---|
| `apps/web` | The one Next.js app. It serves every game page, every API route, sign-in and the wallet. It's built for Node, and for the Cloudflare Worker `sinversegames` through OpenNext |
| `apps/realtime` | The one realtime server, using Socket.IO. It runs multiplayer rooms for every game, including Chef Rivals and Kitchen Rush co-op. In production it runs on Railway |
| `packages/engines` | Deterministic game engines: Sinverse Cricket, Cuisine Quest, the kitchen simulation and the other games |
| `packages/shared` | The game registry, realtime protocol, identity tokens and brand |
| `packages/db` | The one Prisma schema and migration history. It holds players, identities, Sin Coins, cosmetics, matches, achievements and Cuisine Quest progress |
| `scripts/` | The root build selector (`build.mjs`) and the cricket athlete pipeline (`cricket-characters/`) |
| `apps/web/public/sinverse-cricket/athletes` | Realistic cricketer models (CC0), loaded by the Cricket 3D renderer |
| `docs/` | Plans, audits and release records. Older records name the worktrees where the work happened. They describe history, and nothing reads those paths |

## What was consolidated

| From | Branch | Brought in |
|---|---|---|
| `D:\dev\games-cuisine-quest` | `feature/cuisine-quest-showdown` | 10 commits, applied as-is with no conflicts:<br>- Chef's Journey rank, seals and recipe mastery<br>- Chef Rivals head-to-head duel<br>- Kitchen Rush 2–4 player co-op<br>- Shared motion tokens<br>- Golden replay tests<br>- Fixes and release report |
| `D:\dev\games-cricket-universe` | `feature/sinverse-cricket-universe` | 2 documentation commits (the Cricket Universe audit, architecture, roadmap and risk register), plus the uncommitted player spacing and collision fix, committed here |

They needed no new service, database, migration, Worker or deployment. Chef Rivals and Kitchen Rush co-op are new room types in the existing realtime matchmaker and game registry, and use the existing database tables.

The original branches are kept.

## One of each

| Concern | Single implementation |
|---|---|
| Identity, sessions, guest, email and Google sign-in | `apps/web/src/lib/server/session.ts` and `account.ts`, with `packages/shared/src/identity` |
| Wallet, Sin Coins, cosmetics, achievements, match history | `packages/db`, one schema |
| Realtime | `apps/realtime`, one service |
| Web deployment | One Worker (`sinversegames`), configured by `wrangler.jsonc` and `apps/web/wrangler.jsonc` |
| Realtime deployment | `railway.json` and `apps/realtime/Dockerfile` |
