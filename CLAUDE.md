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

Environment names: `AUTH_SECRET`, `ADMIN_TOKEN`, `DATABASE_URL`, `DATABASE_POOL_MAX`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_REALTIME_URL`, `REALTIME_INTERNAL_URL`, `ALLOWED_ORIGINS`, `PORT`, `HOST`, `NODE_ENV`, `RECONNECT_GRACE_MS`, `ROOM_IDLE_MS`, `EMPTY_ROOM_TTL_MS`, `MATCHMAKING_WAIT_MS`, `MAX_ROOMS`, `MAX_CONNECTIONS_PER_IP`, `LOG_LEVEL`, `REWARDS_ENABLED`, `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_BRAND_TAGLINE`, `NEXT_PUBLIC_BRAND_DESCRIPTION`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_REWARD_CURRENCY_NAME`. Build/test controls include `NEXT_BUILD_TARGET`, `NODE_VERSION`, `E2E_DATABASE_URL`, `LOCAL_PG_PORT`, `CIRCLE_NODE_TOTAL` (optional local build-worker limit), and `CI`.

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

## Completion checklist

Report whether both instruction files were updated, byte-for-byte synchronization verified, tests/builds recorded, technical decisions documented, remaining issues recorded, and exact Git/branch state. Report limitations honestly and separate confirmed causes from unverified production hypotheses. Never claim production is fixed based only on local tests.
