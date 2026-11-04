# Architecture

## Overview

```
                    ┌──────────────────────────────┐
  Browser ──HTTPS──▶│  Web app (Next.js, apps/web) │──SQL──┐
     │              │  pages · API routes · admin  │       │
     │              └──────────────┬───────────────┘       ▼
     │                 health/admin│ (Bearer ADMIN_TOKEN)  ┌────────────┐
     │                             ▼                       │ PostgreSQL │
     └──WebSocket (Socket.IO)──▶ ┌───────────────────────┐ │  (Prisma)  │
        auth: short-lived JWT    │ Realtime server       │─┘            │
                                 │ (Node, apps/realtime) │ match results└────────────┘
                                 │ rooms · engines · MM  │
                                 └───────────────────────┘
```

Two independently deployable services share TypeScript packages:

| Path | Purpose |
| --- | --- |
| `packages/shared` | Brand config, **game registry** (metadata), wire protocol (event names, envelopes, error codes, Zod payload schemas), name sanitising, JWT helpers. |
| `packages/engines` | Pure, transport-free **game engines** and the `GameEngine` contract. No I/O; randomness and time are injected. Browser-safe subpath exports (`/color-clash/client`, `/doodle-duel/client`, `/token-trail`, `/bumper-blitz`) expose views and constants without engine internals or the word bank. `/solo` (plus `/kitchen-rush`, `/cascade-solitaire`, `/mahjong-garden`) holds the deterministic single-player rules, which run both in the browser and in the score-verifying Worker. |
| `packages/db` | Prisma schema and migrations, client factory (`getDb()` returns `null` without `DATABASE_URL`), repositories, progression rules (XP, achievements, rewards). |
| `apps/web` | Next.js App Router: discovery and SEO pages, play hub, room UI, game clients, profile, leaderboard, legal pages, admin, API routes. |
| `apps/realtime` | Socket.IO server: authentication, rooms, matchmaking, rate limits, timers, persistence of results, admin/metrics HTTP. |

Why a separate realtime server: serverless platforms (such as Cloudflare Workers, where the web app runs) don't keep WebSocket connections or in-memory timers alive. The web app can be hosted anywhere, and the realtime server runs on any always-on Node host.

## Game integration contract

Every game implements two halves.

**Server: `GameEngine<State, Config, Action>`** (`packages/engines/src/core/types.ts`):

- `minPlayers` / `maxPlayers`, a Zod `configSchema` with defaults (the lobby settings), and an `actionSchema` whose `type` values are socket event names.
- `create(players, config, ctx)`, `handleAction(state, playerId, action, ctx)` and `tick(state, ctx)` with `nextDeadline(state)`. Engines own their timers *declaratively*: the room schedules one timeout for the next deadline.
- `viewFor(state, playerId)` is the **only** way state reaches a client, so private data (hands, the secret word) is excluded per viewer. `syncMessages` returns extra data for (re)joiners, such as the canvas.
- `setConnected` and `removePlayer` handle disconnects and departures. `isFinished` and `results` produce the standard `MatchResults` used for the results screen and persistence.
- Engines return `{ state, stateChanged, messages[] }`, where each message has an audience (`all` / `only` / `except`). Engines validate fully *before* mutating, so rejected actions leave state untouched.

**Client: `GameClient`** (`apps/web/src/games/types.ts`): a lazily loaded `Game` component that receives the room snapshot, the player's view and a `send()` function, plus a `Settings` component and a `summarize()` function for the lobby.

**Adding a multiplayer game:** add metadata to `GAMES` in `packages/shared/src/games/registry.ts` with `kind: "multiplayer"`, and list its id in `MULTIPLAYER_GAME_IDS`. Then:

- implement and register its engine in `packages/engines/src/index.ts`
- add its client to `apps/web/src/games/registry.tsx`
- add its action event names to `GAME_ACTION_EVENTS` (and a rate-limit category in `apps/realtime/src/rate-limit.ts` if it's chattier than turn-based play)

Discovery pages, SEO, the sitemap, the play hub, lobby, matchmaking, results, persistence and leaderboards then work without further changes.

**Realtime (tick) games** use the same contract. Bumper Blitz returns `nextDeadline = lastTick + 50 ms`, so the room's single timer drives a 20 Hz fixed-step simulation. `handleAction` only stores steering input (`stateChanged: false`, no broadcast). Every tick publishes positions through `viewFor`, and clients render about 100 ms behind the server clock, interpolating between snapshots. Arena input has its own rate-limit bucket (30/s, burst 45).

## Single-player games: verified runs

Single-player games (Kitchen Rush, Cascade Solitaire, Mahjong Garden) run entirely in the browser: no game server and no per-move network traffic. A browser can't be trusted to report its own score, so the score is never sent. Instead:

1. **Start:** `POST /api/solo/start` picks a random seed on the server and returns a **run token**: an HS256 JWT binding player, game, seed, config and a run id (`jti`).
2. **Play:** the browser deals from that seed with the game's deterministic rules (`packages/engines`, `@platform/engines/solo`) and records a timestamped move log.
3. **Submit:** `POST /api/solo/submit` sends the token and log. The Worker replays the log through the same rules (`SoloGameDefinition.verify`) and computes the score itself. It rejects:
   - illegal moves
   - timestamps out of order
   - logs claiming more game time than has passed since the token was issued
   - another player's token
4. **Record:** the run is stored with `recordMatch` (`solo: true`) using the run id as the match id, so each run counts **once**. A resubmission conflicts on the primary key and returns 409. Stats, XP, rewards and achievements use the same code path as multiplayer matches.

Kitchen Rush is a real-time game, so its engine is an **event simulation**. Cooking progress, burning and customer patience are all computed from timestamps (`advance(state, t)`), so a replay reproduces exactly what the player saw without frame-rate drift. Unfinished work is played out to the end of the shift on the server, so quitting early can't avoid penalties. Hands are keyed by cook id, so a co-op mode can reuse the engine.

**Limits:** replay verification proves a score was *achievable* with that deal at that pace. It can't prove a human made the moves (a bot that knows the seed could). The timing check rules out impossible speeds. For stronger guarantees, competitive modes can move to the realtime server like the multiplayer games.

`GET /api/solo/best` serves personal bests and the daily board: the best score per player since 00:00 UTC, read from existing tables with no extra writes.

**Adding a solo game:** add metadata with `kind: "solo"` and its id in `SOLO_GAME_IDS`. Implement a `SoloGameDefinition` (config schema, log schema, `verify`) and register it in `packages/engines/src/solo.ts`. Then add a `Setup` and a `Game` component to `apps/web/src/games/solo-registry.tsx`. The shared `SoloRunner` handles starting runs, submitting, results, personal bests and the daily board.

## Real-time protocol

- **Transport:** Socket.IO establishes polling, probes a WebSocket upgrade and tries an alternative opening transport when necessary. Built-in ping/pong heartbeats every 15 s with a 20 s timeout. Token fetches and transport opening have deadlines; inactive authentication failures have capped backoff while terminal 401/403 responses stop retries.
- **Authentication:** the web app holds a long-lived `session` JWT in an **httpOnly** cookie. Before each (re)connect the browser exchanges it at `POST /api/session/token` for a 15-minute `realtime` JWT, sent in the handshake. The realtime server verifies the signature, audience and expiry, and checks bans. The player id comes *only* from the token, so clients can't impersonate anyone.
- **Client → server:** `{ id, roomId?, matchId?, v?, payload }` with an acknowledgement callback returning `{ ok, data } | { ok: false, error: { code, message } }`.
  - `id`: client action id; the last 64 per player are remembered for **idempotent retries**.
  - `v`: state version; turn-based actions are rejected with `STALE_STATE` if it's stale (double-click and race protection).
  - `matchId`: server UUID for the current match. All game actions require it, including versionless drawing/arena actions. Ready/configure/kick/start validate the current room/match scope. A restart assigns a new UUID; stale session input cannot reach the new engine state.
- **Server → client:** `{ id, roomId, matchId?, seq, ts, payload }`. `seq` is per recipient connection, so the client requests `room:sync` if it detects a gap. `ts` lets clients align countdowns to the server clock. Room/game snapshots include the match UUID; a new match remounts game UI.
- **Events:** `room:create|join|leave|ready|configure|kick|sync`, `game:start`, `match:queue|cancel`, game actions (`card:play|draw|pass`, `doodle:select-word|stroke|undo|clear|guess`). Server pushes include `room:state`, `game:state`, `game:action`, `game:ended`, `game:reconnected`, `doodle:*`, `match:status`, `room:notice`, `room:closed` and `session:replaced`.
- **Isolation:** rooms deliver messages by iterating their own members, never via global broadcasts, so another room's events can't leak. An integration test asserts this.
- **Serialisation:** Node runs each handler to completion, so actions within a room are applied strictly one at a time; concurrent requests are naturally ordered.
- **Validation and limits:** envelopes and payloads are Zod-validated. Per-connection token-bucket rate limits apply per category: room ops, room creation, joins (brute-force protection), turn actions, guesses and strokes. The max message size is 32 KB, there's a per-IP connection cap, and there's an origin allow-list.

## Rooms and lifecycle

- Room codes are 6 characters from a 31-symbol unambiguous alphabet, generated with `crypto.randomInt` (~887M combinations). Invite URLs are `/room/CODE` and contain no secrets beyond the code.
- A player is in at most one room. Joining or creating another leaves the previous one, and matchmaking refuses players who are mid-game.
- **Reconnect:** a dropped socket keeps its seat for `RECONNECT_GRACE_MS` (60 s). Reconnecting with the same identity re-attaches and receives the room state, their private view and canvas sync. Opening the room in a second tab replaces the first (`session:replaced`).
- **Host:** the host configures and starts the game, and can remove players. If the host leaves, a connected player becomes host. Public rooms auto-start 5 s after everyone is ready.
- **Cleanup:** empty rooms are removed. Rooms with nobody connected are removed after `EMPTY_ROOM_TTL_MS`, and idle lobbies or finished rooms after `ROOM_IDLE_MS`.
- **Matchmaking:** a searching player first fills an open public lobby. Otherwise they wait in a per-game queue, which forms a room at the target size (4 for Color Clash, 6 for Doodle Duel), or at the minimum once the oldest entry has waited `MATCHMAKING_WAIT_MS`.

## Frontend

- Server components for discovery, SEO, profile, leaderboard and legal pages; client components for live game UI.
- **One shared socket per tab** (`lib/realtime/connection.ts`) that survives navigation. `useRoom` (`useSyncExternalStore`-style hooks) keeps the room and game state. Game UIs are code-split by `next/dynamic`.
- **Drawing performance:** strokes never touch React state. The canvas keeps strokes in refs, draws incrementally, and fully redraws only on undo, resync or resize. Pointer input is batched into chunks every 40 ms.
- **Design system:** Tailwind v4 tokens with dark and light themes, reusable primitives (button, card, badge, modal using native `<dialog>`, tooltip, toast, switch, segmented control), and original SVG art. Reduced motion follows both the OS setting and an in-app toggle. Sound effects are synthesised with WebAudio and only play after user interaction.

## Database

PostgreSQL via Prisma 7 with the `pg` driver adapter. Tables:

- `Player`: guest identity, display name, avatar colour, XP and level, ban fields; `kind` reserves room for registered accounts.
- `PlayerGameStats`: per-game aggregates; backs leaderboards.
- `Match`, `MatchParticipant`: finished matches with placements and scores.
- `PlayerAchievement`: unlocks; definitions live in code.
- `RewardLedgerEntry`: append-only ledger for the non-purchasable reward currency, with uniqueness on (player, reason, ref) for idempotency.
- `FavoriteGame`, `AbuseReport`, `ModerationAction` (audit trail).
- `CosmeticInventory`, `CosmeticEquipment`: unique per-player item ownership and one equipped item per category. A composite foreign key prevents equipping someone else's inventory.

**Sin Coins:** the append-only reward ledger remains the balance authority. `recordMatch`, purchases and equipment changes serialize against the same Player row; multi-player records lock IDs in sorted order. A server-selected stable match UUID is reused across persistence retries, so an uncertain commit cannot mint another result. Rewards require normal completion, positive score and at least 30 seconds (solo must complete); daily positive credits cap at 80/UTC day. Prices and reward rules are versioned code. Purchasing atomically checks the balance, inserts a uniquely referenced debit, and grants inventory; retries return existing ownership. No real-money flow, transfer or paid service is included. Private paginated wallet/history is `/api/wallet`; `/store` and the profile render actual earned ownership/equipment. See [the economy specification](docs/SIN_COINS_ECONOMY.md).

**Completed rooms:** `FINISHED_ROOM_TTL_MS` defaults to five minutes from completion. Readiness, sync and other activity cannot extend it; a new authorized match clears the deadline. The periodic sweep removes expired rooms, and start/join reject at the exact deadline. New matches clear ready state, scores, drawings and old action caches. The room link/membership is preserved for an accepted rematch.

**Expansion boundaries:** the ten new game concepts, persistent provider identity and secure uploads are designed in [GAME_EXPANSION_PLAN.md](docs/GAME_EXPANSION_PLAN.md); they are not implemented by these wallet/Doodle additions. Existing guest cookies still determine access to stored data. No R2/S3/OAuth provider is configured. Database connection/statement/query waits now have explicit budgets; result retry remains best-effort rather than a durable outbox.

**Not stored:** strokes, individual moves, chat, hands and secret words. These live only in the realtime server's memory. Results are written once per match in a single transaction, retried up to 3 times.

Planned extensions: daily challenges can be added as a `DailyChallenge` table plus progress rows keyed by player and day, evaluated by the same post-match hook as achievements.

## Failure handling

| Failure | Behaviour |
| --- | --- |
| Client network drop | Socket.IO reconnects with backoff, fetching a fresh token each time. The seat is held for 60 s and state is fully resynced. |
| Player gone for good | Removed after the grace period; the engine skips them, ends the turn or ends the match. |
| Missed messages | A sequence gap triggers `room:sync`. |
| Database down | Gameplay continues. Results persistence retries, then logs. Profile and leaderboard pages show a friendly message. Ban checks fail open. |
| Realtime server restart | **Active matches are lost** (state is in memory). On graceful shutdown clients receive `room:closed` (`shutdown`) and see a clear message; finished-match data already in Postgres is unaffected. Deploy during quiet periods, or see Scaling for snapshotting. |
| Engine exception | Caught per action and tick, logged and counted; the player gets `INTERNAL` and the room continues. |

## Scaling

A single small Node instance comfortably handles hundreds of concurrent rooms: rooms are small and messages are tiny. To scale out:

1. **Shard rooms by code.** Rooms are independent, so run N realtime instances and route `/room/CODE` connections to `hash(CODE) mod N` (e.g. a load balancer rule on a query parameter, or a per-instance URL encoded in the room code). Room state stays in one process.
2. **Socket.IO Redis adapter** only becomes necessary if one room's sockets must span processes. That isn't needed with sharding, so Redis isn't part of the first release.
3. **Matchmaking** across instances needs a shared queue (Redis lists).
4. **Restart resilience:** engine state is plain JSON-serialisable data, so periodic snapshots to Redis would allow resuming matches after a deploy.
