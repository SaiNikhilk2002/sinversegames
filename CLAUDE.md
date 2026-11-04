# SinverseGames shared engineering instructions

`AGENTS.md` and `CLAUDE.md` are one canonical instruction set, mirrored byte for byte. Read both before substantial work; preserve useful instructions, update both in the same task whenever architecture, workflow, or meaningful status changes, and compare them before completion. Instructions in `apps/web/AGENTS.md` also apply to that subtree.

## Project and structure

SinverseGames is a pnpm workspace for seven browser games. Preserve the existing implementation and architecture.

- `apps/web`: Next.js App Router, TypeScript, React, Tailwind, Cloudflare Workers via OpenNext.
- `apps/realtime`: always-on Node Socket.IO service on Railway; authoritative rooms, matchmaking, clocks, and game state.
- `packages/shared`: game registry, protocol, Zod validation, branding, identity/token helpers.
- `packages/engines`: deterministic game engines with injected time/RNG; multiplayer views redact private information; solo runs are replay-verified.
- `packages/db`: Prisma 7, Neon PostgreSQL, schema, migrations, repositories, progression.
- `docs`: architecture/quality reports and roadmap; `artifacts`: existing screenshots and recordings, which must be preserved.
- Multiplayer: Color Clash, Doodle Duel, Token Trail, Bumper Blitz. Solo: Kitchen Rush, Cascade Solitaire, Mahjong Garden.

Read `README.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`, `GAME_RULES.md`, and the relevant reports. Next.js dependencies include local guides under `apps/web/node_modules/next/dist/docs`; read relevant guides before changing web code. Root documentation is historical evidence, not authorization to deploy.

## Development and validation

Use the pinned pnpm version in `package.json` (11.15.1). Production builders use Node 24; verify local Node compatibility before interpreting tooling failures. Install with `pnpm install --frozen-lockfile`.

- `pnpm db:generate`: generate both Node and workerd Prisma clients (no database migration).
- `pnpm db:local`: embedded local PostgreSQL, default port 5433, persisted in `.data/postgres`.
- `pnpm dev`: web on 3200, realtime on 4200. `pnpm dev:web` / `pnpm dev:realtime` run each separately.
- `pnpm typecheck`; `pnpm test` (shared, engine, and real-socket integration tests).
- `pnpm build`: Prisma generation plus production web/realtime builds.
- `pnpm test:e2e`: Playwright against production builds and a local database. Inspect its environment and existing listening servers first; never permit tests to use production data.
- `pnpm cloudflare:build`: build-only OpenNext artifact. Linux/WSL is the documented supported environment; plain Windows has symlink limitations.
- Deployment commands (`cloudflare:deploy`, `cf:deploy`, Railway deploy) require explicit approval and are prohibited for this takeover.

Validate actual gameplay and recovery flows as well as types/builds. Add meaningful regression tests for behavior fixes. Respect reduced motion, keyboard/accessibility, touch controls, original game identities, and mobile layouts. Avoid unnecessary dependencies and generic visual replacements. Measure before optimizing.

## Security, reliability, and database rules

Strict TypeScript and Zod validation at HTTP/socket boundaries and inside engines. Clients submit intents, never trusted winners or scores. Preserve per-player views, signed identities, isolation, rate limits, server clocks, idempotency, and solo replay verification.

Never expose `.env`, credentials, connection strings, tokens, private hands, secret drawing words, or chat content in logs, reports, or chat. Document environment names only. Do not commit local environment files or generated clients/build output.

Environment names: `AUTH_SECRET`, `ADMIN_TOKEN`, `DATABASE_URL`, `DATABASE_POOL_MAX`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_REALTIME_URL`, `REALTIME_INTERNAL_URL`, `ALLOWED_ORIGINS`, `PORT`, `HOST`, `NODE_ENV`, `RECONNECT_GRACE_MS`, `ROOM_IDLE_MS`, `FINISHED_ROOM_TTL_MS`, `EMPTY_ROOM_TTL_MS`, `MATCHMAKING_WAIT_MS`, `MAX_ROOMS`, `MAX_CONNECTIONS_PER_IP`, `LOG_LEVEL`, `REWARDS_ENABLED`, `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_BRAND_TAGLINE`, `NEXT_PUBLIC_BRAND_DESCRIPTION`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_REWARD_CURRENCY_NAME`. Build/test controls include `NEXT_BUILD_TARGET`, `NODE_VERSION`, `E2E_DATABASE_URL`, `ECONOMY_TEST_DATABASE_URL`, `LOCAL_PG_PORT`, `CIRCLE_NODE_TOTAL` (optional local build-worker limit), and `CI`.

`AUTH_SECRET` must match across web/realtime. `NEXT_PUBLIC_*` and CSP are compiled at build time. Allow exact browser origins; apex and www are distinct, as are preview hosts. Never broadly allow preview domains. The intended public realtime hostname is `https://rt.sinversegames.com`; verify DNS/TLS and deployment configuration before changing anything.

Keep one Socket.IO connection per tab, bounded authentication/network waits, real transport fallback, recoverable reconnects, and explicit errors instead of infinite loading. Keep liveness separate from downstream readiness. Do not add health probes to every page request. Active rooms are in memory; restarting the service ends matches, so process restarts do not test transient socket recovery. Railway runs one replica until shared room routing/storage is deliberately designed.

Schema changes belong in committed Prisma migrations. `db:migrate` creates/applies migrations and `db:deploy` applies existing migrations: inspect and explicitly select a local target before either. Do not run production migrations, modify production data, rotate secrets, or change production environment variables during this task. Reward ledger entries remain append-only.

## Git and production boundaries

Inspect branch, staged/unstaged/untracked changes, recent commits, and remote references before working. Preserve all Claude/user changes. No reset, rebase, force-push, discard, merge to `main`, or push without explicit approval. Local commits are allowed when useful. No deployment, production DNS, billing, external configuration, production secrets, or production data changes without explicit approval. Read-only repository, PR, public endpoint, and build-log inspection is authorized by the audit.

## Current implementation and takeover status (2026-11-04)

- Initial checkout: clean `feature/overnight-game-polish` at `7ef6ee2`; local `origin/main` at `09fe2e4`. Takeover work is on `codex/takeover-and-reliability-audit`.
- Verified commits exist: `1085cf1` (website/results), `e90bd3e` (motion/capture/QA), `7ef6ee2` (test fix/report). Do not rebuild the overnight visual work.
- Both root instruction files were absent and have now been established with identical content.
- Fresh verification: 151 unit/integration tests, the complete 25-case browser suite, all five package typechecks, Node production builds, the final Linux Cloudflare build, and three additional repeated Color Clash matches have passed. The suite includes eight reliability cases and the strengthened mobile check. Detailed results are recorded in the takeover report; retain failed/intermediate attempts honestly.
- Remote `main` is `c420c21`, merging Phase 1 at `7ec6eec` via PR #1. Phase 2's three commits remain unique to the feature/takeover branch; do not assume they are merged or deployed.
- Local fixes: bounded token fetch, stale-auth cancellation, capped auth retries with terminal 401/403 handling, polling-first connection with WebSocket upgrade and alternate-transport fallback, room retry/session-expiry screens, SinverseGames brand default, root Node 24 version pin, and constrained mobile homepage columns. No game rules, migrations, or dependencies changed.
- New regressions cover rejected and immediately closed WebSocket upgrades, token 503/timeouts/401/403, room retry, and a real interrupted transport. The recorded Back online scenario checks an Offline opponent view and exact hand/room restoration. The existing Color Clash browser bot now waits for played cards to exit instead of selecting stale animated cards or counting failed clicks as successful actions.
- November 3/4 read-only production probes verified health, intended `rt` DNS/TLS, exact apex/www polling and WebSocket acceptance, rejection of an unrelated origin, and the shipped client realtime URL. Production still displayed Playwave. Authenticated production gameplay was not exercised because it would create production data.
- Preview investigation: GitHub reports a failed check for Worker `sinversegames`, while Wrangler names `sinversegames-web`. Exact historical logs/effective dashboard settings remain unavailable; name mismatch and build-context/runtime hypotheses are not confirmed causes. No dashboard settings changed. Use Node 24 for the full toolchain; the machine's default Node 20 cannot run Wrangler 4.155.0.
- Remaining work: approved production brand/reliability verification, provider build-log review, isolated preview configuration, server-side database connection/query deadlines and durable failed-result recovery, repeated SVG optimization (4,137 homepage elements/29 covers measured), artwork-based social previews/stale OG copy, Doodle reactions, and physical-device/broader recordings. Generated homepage and all seven game Open Graph PNG routes already exist and returned 200 locally.
- Next priorities: review the completed audit and validation, resolve provider logs/configuration before approving external actions, then take bounded reliability/performance/quality tasks. Do not start unrelated features or rebuild the completed overnight art.
- Detailed findings, validation, decisions, manual dashboard actions, and remaining issues belong in `docs/CODEX_TAKEOVER_REPORT.md` and `docs/RELIABILITY_INVESTIGATION.md`.

## Expansion phase (2026-11-04)

The user authorized the expansion milestones in `docs/GAME_EXPANSION_PLAN.md`; this supersedes the audit-only feature scope above. Preserve checkpoint `4129552` (all 28 takeover files). Continue on the current branch; local commits are allowed, pushes/deployments/production migrations and paid services still require approval. No delegation is requested.

Read `docs/GAME_CATALOGUE.md`, `docs/PLAYER_PROGRESSION_DESIGN.md`, `docs/SIN_COINS_ECONOMY.md`, `docs/ACCOUNT_AND_PROFILE_DESIGN.md`, and `docs/EXPANSION_QA_REPORT.md`. Ten concepts are designed but none are implemented/registered yet; Cuisine Quest has zero completed cuisine levels. Never present planned games or unconfigured account/upload features as shipped. Finish tested vertical slices and record remaining milestones.

Active slices: extend the existing append-only ledger to Sin Coins, atomic inventory purchases and owned cosmetic equipment; integrate all seven existing games through server-validated result persistence; complete Doodle circular brush/clean canvas, mobile ready, joined users only, fresh UUID/session isolation and completed-room expiry. Serialize player economy/stat writes in sorted row-lock order, keep stable match UUIDs across retries, and apply the eligibility/cap rules in the economy design. No browser-provided balance, reward or price is trusted. Preserve legacy balances one-for-one. Prepare additive migrations and apply only to verified local databases.

Google OAuth, linking, usernames, deletion and uploads are designed but not implemented. Retain the existing signed guest session framework; guests cannot recover across devices until provider sign-in ships. No R2/S3 integration exists; a paid image service is not authorized. Keep all optional challenges/rewards ethical and nonmonetary: no transfers, redemption, loot boxes or competitive cosmetic advantages. Update both instruction files with meaningful status and validate their exact synchronization.


Expansion implementation decisions and commands:
- Sin Coins and SinverseGames are fixed names; old public brand/currency name overrides are ignored. Five actual cosmetics (three frames, two nameplates) render on profiles, self navigation and store previews, with readable colors for both themes. No inert future inventory item is sold.
- Additive migration `20261104010000_sin_coins_cosmetics` adds inventory/equipment and a history index; legacy balances/rows are preserved. Currency is the ledger sum. Every result/purchase/equip writer locks the same Player row; multiple players are locked in sorted order. Eligibility: completed, positive-score, >=30 seconds; solo must be completed. Base 2, victory 10, PB 3, eligible achievement 5; all positive rewards capped at 80/UTC day. Only new achievements on eligible outcomes earn; capped awards do not carry forward. No transfer/redemption/real-money flow.
- `pnpm test:db` runs dedicated real-PostgreSQL tests via `apps/realtime/vitest.db.config.ts`. It accepts only localhost databases ending in `_test`, default `sinversegames_expansion_test` on port 5433. Set `E2E_DATABASE_URL` explicitly to that migrated local target for browser tests. Never run against provider database URLs. `ECONOMY_TEST_DATABASE_URL` optionally selects an isolated local test database. Existing local migrations were validated with unchanged hashes for nine legacy tables; no production migration ran.
- `FINISHED_ROOM_TTL_MS` defaults to 300000, minimum 15000. Completed-room readiness/sync cannot extend this deadline; a real start clears it. The 15-second sweep cleans expired rooms; starting/joining at the deadline is rejected immediately. Rejected expired invites preserve the player's current room/seat.
- Each room match has a fresh server UUID. The same UUID persists every retry; game input plus ready/configure/kick use the current match scope, and remounting game clients clears prior drawing/round state. Missing/stale game scope is rejected; old browser tabs require refresh on a coordinated future release. No old unscoped-game-input compatibility bypass.
- Doodle uses a plain bitmap canvas and separate clipped circular pointer overlay. Preview diameter is selected logical brush size scaled by actual CSS canvas width; the bitmap never includes the cursor. Mouse/pen/touch share pointer input, with captured pointer IDs and timer cleanup. Lobby lists joined users only and has a fixed safe-area mobile action bar while lobby/results are shown, with bottom content clearance.
- All-time ranking ties finish with player ID; daily ranking deduplicates the full UTC window before LIMIT and allows expired bans. Weekly/monthly/global/season/cuisine boards remain unimplemented. Distinct badge icons and milestone/skill/mastery labels are presentation, not estimated global rarity.
- Database connection establishment, statements and client queries have explicit budgets (2.5s/5s/6s). This bounds dependency waits; it does not add durable result retry across server restarts. The current moderation lookup remains fail-open during a database outage as before.
- Player-store hydration uses a constant server snapshot, then the live client state. Do not return mutable client state as the server snapshot: streamed profile components can hydrate after the header's session fetch. Browser checks must catch page errors as well as visible behavior. New wallet accents use theme-specific readable text colors; nameplate colors also resolve for both themes.
- Validation and incomplete milestone status are maintained in `docs/EXPANSION_QA_REPORT.md`; preserve failed/intermediate attempts. Google OAuth, linking, username, deletion, image upload, daily claims and all ten new games remain unfinished. No external credentials or paid image service are required for this delivered slice.
- Delivered-slice acceptance: 153 unit/integration tests (all original 151 retained), 12 real PostgreSQL tests, all 27 browser tests (original 25 retained and Doodle rematch strengthened), all five typechecks including database tests, Node production build and Linux OpenNext build pass. Final contrast changes also have a focused two-case browser pass. Supplemental review passes 32 phone/tablet/desktop theme layouts with zero page errors and ten metadata/image responses. Local homepage remains heavy (4,142 DOM elements, 29 covers); no physical-device or production performance claim. Reviewable screenshots/measurements and validation summary are under `artifacts/expansion/`. This is not completion of the ten-game/account expansion phase.

## Completion checklist

Report whether both instruction files were updated, byte-for-byte synchronization verified, tests/builds recorded, technical decisions documented, remaining issues recorded, and exact Git/branch state. Report limitations honestly and separate confirmed causes from unverified production hypotheses. Never claim production is fixed based only on local tests.
