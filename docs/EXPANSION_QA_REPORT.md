# Expansion implementation and QA status

2026-11-04. Branch `codex/takeover-and-reliability-audit`. Baseline checkpoint `4129552` preserves the completed audit and Phase 1/2 changes. No push, merge, deployment, production migration/data mutation, DNS edit or paid-service provisioning is authorized.

## Status by milestone

| Milestone | Status |
| --- | --- |
| 1 Product and architecture | Design documents prepared for all ten games, economy/progression/accounts/avatars and additive migrations. |
| 2 Shared platform | Sin Coins/inventory/store implemented and database-tested. Existing guest identity, XP, history and achievements reused. Google sign-in, account linking, usernames/deletion/uploads and broader rankings remain unimplemented. |
| 3 Existing games | Doodle brush/canvas, joined player list, mobile ready actions and isolated rematch lifecycle implemented and tested. Existing seven games use the shared authoritative reward path. |
| 4 New games | 0/10 implemented; Cuisine Quest 0/7 cuisine levels. No unfinished game added to runtime catalogue. |
| 5 Platform polish | Fixed SinverseGames/Sin Coins names, actual cosmetic previews/equipment, badge distinctions, navigation, manifest and corrected social copy implemented. New-game artwork remains unimplemented with the games. |
| 6 Full QA | 153 unit/integration, 12 dedicated PostgreSQL tests and 27 browser tests passed. Five typechecks, Node build, Linux OpenNext build and supplemental UI review passed. This is acceptance of the delivered slices, not completion of the expansion phase. |

## New games and Cuisine Quest

| Game | Implementation status |
| --- | --- |
| Cuisine Quest | Design only; 0/7 cuisine levels complete. |
| Comet Courier | Design only. |
| Circuit Grove | Design only. |
| Lantern Ascent | Design only. |
| Pocket Tides | Design only. |
| Flux Circuit | Design only. |
| Signal Shuffle | Design only. |
| Keystone Council | Design only. |
| Beacon Brigade | Design only. |
| Arcforge Rally | Design only. |

Cuisine Quest's planned techniques, dishes, ingredient/station states, keyboard/touch controls, replay validation and progression are specified in [GAME_CATALOGUE.md](GAME_CATALOGUE.md). Indian, Italian, Japanese, Mexican, Thai, Chinese and Mediterranean levels are all unimplemented. The runtime registry still has exactly the original seven playable games; no incomplete shell is advertised as playable.

## Delivered product behavior

- **Sin Coins:** the existing ledger remains the balance authority. Eligible completed positive-score outcomes lasting at least 30 seconds earn 2 coins, plus 10 for a win/solo completion, 3 for beating an existing positive best, and 5 for each newly earned eligible achievement, capped at 80 positive coins per UTC day. Solo runs require completion. Aborted, abandoned, instant and nonpositive-score outcomes earn none. Disabled rewards preserve stats. Existing units/balances retain their value one-for-one. Daily challenges, cuisine milestones and seasons are not implemented.
- **Transaction integrity:** result writes lock player rows in sorted order; purchase/equip use the same lock. Stable server match UUIDs make result retries idempotent; existing unique player/reason/reference constraints and inventory ownership prevent duplicate debits/credits. Server catalogue prices, atomic debit plus inventory, ownership/category validation and deterministic private history paging are implemented. There is no real-money, transfer, redemption, randomized reward or competitive advantage.
- **Store/profile:** five real items (three frames, two nameplates) can be bought, equipped and removed. They render in the store, own profile and desktop self-navigation. Profile includes existing display name, default avatar, level/XP, game stats, wins/losses, best scores, favorites/history and 13 server-awarded achievements, plus wallet/history/inventory. Unknown wallet balance displays an em dash with retry. Uploaded avatars, unique usernames, cross-device recovery, cuisine mastery and a displayed player leaderboard rank remain unfinished. Guest-cookie limitations are stated in the UI.
- **Doodle:** clean white bitmap canvas; separate clipped brush ring with selected diameter scaled from logical to CSS coordinates; mouse/pen/touch input and timer cleanup. Preview never draws into the bitmap. The original surrounding art/audio is retained. Lobby lists actual joined users and count only. Mobile action bar respects safe areas, clears scrollable content, shows loading/disabled states and supports keyboard activation. Completed rooms have a fixed five-minute default rematch deadline, configurable with `FINISHED_ROOM_TTL_MS`; activity/readiness cannot extend it. New matches use a fresh UUID, reset readiness/engine state and remount the client; stale/unscoped inputs are rejected.
- **Achievements/rankings:** recognizable icons and milestone/skilled/mastery labels distinguish existing earned/locked badges; labels do not claim global rarity. Existing per-game all-time and daily boards remain. Tie-breaking is deterministic; daily SQL deduplicates the full UTC window before LIMIT, and expired bans no longer hide a player indefinitely. Global/weekly/monthly/season/cuisine rankings remain unimplemented.
- **Brand:** fixed SinverseGames/Sin Coins names ignore obsolete name overrides; no active product source or package name contains Playwave. Remaining mentions are historical audit/overnight reports, synchronized governance and this validation explanation. Manifest and existing favicon use the original mark. Home social image copy derives the actual seven-game count; solo social images say Single player. Local production was deliberately built with the obsolete name override to verify it cannot replace the platform name. Historical deployed bundles were not changed.
- **Reliability/accessibility:** connection/statement/query waits have explicit budgets; streamed player UI uses a constant server hydration snapshot. New wallet and nameplate colors resolve for both themes. Existing keyboard/reduced-motion controls remain. This does not implement durable result recovery across realtime restarts or distributed room hosting.

## Identity, uploads and owner configuration

Google OAuth, guest linking, persistent account recovery, usernames, self-service deletion and uploads are **design only**. No provider route, Account migration, Google environment support, upload endpoint, R2 binding or image processor is implemented. No real Google consent round-trip has been tested. Persisted guest data still requires the original signed browser cookie; it cannot be recovered after cookie loss or on another device.

[ACCOUNT_AND_PROFILE_DESIGN.md](ACCOUNT_AND_PROFILE_DESIGN.md) specifies the planned existing-session extension, collision behavior, PKCE/state/nonce/subject validation, proposed local/apex/www callbacks, Google dashboard steps, proposed server-only environment names, privacy/deletion requirements and the storage/processor decision. These are future contracts, not currently working routes. No OAuth secret or paid Images service is required for this slice. No storage or dashboard setting was provisioned.

## Migration and local data preservation

Prepared additive migration: `packages/db/prisma/migrations/20261104010000_sin_coins_cosmetics/migration.sql`. It adds CosmeticInventory, CosmeticEquipment (including a same-owner inventory foreign key), and a player/time/ID ledger history index. No reward, player, match, stats or achievement row is rewritten; no provider/upload schema is falsely included.

Applied only to explicitly selected local databases: the existing `platform` database and isolated `sinversegames_expansion_test`, both on loopback port 5433. Fresh migration deployment and Prisma schema diff passed. Before/after counts **and SHA-256 hashes** match for all nine legacy tables: 603 players, 363 stats rows, 208 matches, 365 participants, 586 achievement rows, 572 ledger rows, and three empty favorite/report/moderation tables. Hash snapshots remain in `.data/expansion/local-migration-before.json` and `local-migration-after.json`.

Both Node/workerd Prisma clients are regenerated during builds. No dependencies were added, removed or upgraded; the lockfile is unchanged. A future approved release needs the additive migration before the new web/realtime code, coordinated match-scope deployment and refresh of old browser tabs. No production migration ran.

## Validation ledger

Use Node 24.14.0 through the process PATH and pnpm 11.15.1. Database tests fail closed unless their target is loopback and its name ends in `_test`; browser servers use explicit `E2E_DATABASE_URL` pointing to the migrated isolated database, with local test credentials. Tests never use the provider database from the ignored local environment. Original tests/assertions are retained; the Doodle browser case is strengthened with same-room rematch checks.

For a clean local setup, start `pnpm db:local`, create `sinversegames_expansion_test` once using a local PostgreSQL client, and explicitly point `DATABASE_URL` to that loopback test database before `pnpm db:deploy`. Use the same target for `ECONOMY_TEST_DATABASE_URL` and `E2E_DATABASE_URL`. Do not drop/reset an existing database. `pnpm test:db` removes only its own fixture identities/results; browser-created local guests/matches may remain. Stop owned servers after validation. No dashboard action is required for these local commands.

| Check | Outcome |
| --- | --- |
| `pnpm test` | **153 passed:** 8 shared, 113 engine, 32 real-socket integration (original 151 plus two lifecycle cases). |
| `pnpm test:db` | **12 passed** against real isolated PostgreSQL. |
| `pnpm typecheck` | All five packages passed; repeated after final hydration change. |
| `pnpm build` | Passed after hydration/contrast correction, then repeated after the final solo reward-label contrast adjustment. Realtime build/typecheck and the full unit/integration suite also passed again for the final expired-invite guard; web sources were unchanged. |
| `pnpm test:e2e` | **27/27 passed** in 6.3 minutes, no retries/skips. After the final contrast-only change, both new cases passed again (56.1 seconds). Doodle evidence capture was also repeated separately. |
| Linux `pnpm cloudflare:build` | **Passed** in WSL using the final production web sources, Node 24.14.0, pnpm 11.15.1 and frozen lockfile. Worker saved under `.open-next/worker.js` in the isolated audit workspace. Build-only; no deployment. Subsequent changes affect the separate Node realtime expired-invite guard, its test, documentation and evidence capture. |
| Migration integrity/schema drift | Nine legacy table counts/hashes unchanged; fresh migration deploy and no-diff schema check passed. |
| UI/theme/mobile/performance | **32/32 layouts passed**, zero page errors, five route samples and ten successful metadata/image responses; evidence in `artifacts/expansion/`. |
| Instruction sync / whitespace / staged review | Both manuals updated and byte-identical; complete staged change reviewed, whitespace checks passed, 29 relative documentation links resolved. No environment secrets/generated clients/build output staged. |

The PostgreSQL cases cover legacy value preservation, eligibility/UTC daily cap, duplicate submissions, concurrent XP/plays/personal-best updates, replay after a previously committed match, failure after debit with complete rollback, concurrent overspending, duplicate same-item purchases, equip ownership/category isolation, 45-row deterministic pagination, disabled rewards, and a 505-result leaderboard that would exceed the previous pre-dedup cap. Final review also added an expiry assertion: attempting to join an expired invite preserves a third player's current room and seat. Expiry is checked before removing the existing membership.

New browser checks cover real replay-verified Kitchen Rush earnings, purchase/equip/reload/history, duplicate purchase without a second charge, forged player/balance/price fields, unowned equipment, oversized input, cross-origin/missing-session rejection, another authenticated player's history cursor, mobile ready visibility at 320/360/375/390/430 widths at 568px height, keyboard activation, all five brush diameters/alignment, blank canvas/painted dot measurement, pen/touch events and profile hydration errors. The original Doodle browser case additionally rematches the same players in the same room and verifies clean bitmap, zero scores, cleared guesses and hidden prior results. Existing solo replay-forgery, seven-game, recovery, keyboard and reduced-motion checks are retained.

Supplemental reduced-motion Chromium review checks store/profile in both themes at widths 320, 360, 375, 390, 430, 768, 1024 and 1280, with no horizontal/header overflow. A simulated wallet 503 shows unknown balance and a working retry affordance. Manifest, original favicon, home social image and all seven game social images return 200. Screenshots include studio/profile, narrow lobby, clean Doodle canvas and current branding; drawing-word text is masked in the Doodle evidence.

Measured unthrottled local homepage sample: 4,142 elements (previous 4,137), unchanged 29 covers/3,695 cover SVG elements, DOMContentLoaded about 142ms and load about 419ms, with two observed 61ms long tasks. Store sample has 250 elements and no game-cover SVGs. These samples are diagnostics, not a speedup claim, full accessibility certification, low-end-phone FPS result or production benchmark. The previous repeated-SVG optimization remains open. Physical devices, Safari/Firefox, broad screen-reader/audio validation and the unimplemented account/new-game flows are not claimed tested.

### Retained failed and intermediate attempts

1. The initial unit/integration attempt passed the original 151 but the two new lifecycle fixtures failed: test stroke IDs contained a hyphen, rejected by the existing protocol. Corrected only those fixture IDs; focused lifecycle and full 153-case runs then passed. Assertions were not weakened.
2. An Open Graph prerender failed because a multi-child Satori div lacked display styling. Replaced that count/copy with a single string expression; Node production build passed. Original failure remains in `.data/expansion/build-og-prerender-failure.log`.
3. Supplemental production UI review reproduced nine profile hydration errors. The player store's mutable server snapshot could change while streamed components hydrated. A constant initial server snapshot and a browser page-error assertion were added. The subsequent review passed all 32 layouts with zero page errors; failed JSON/logs remain under `.data/expansion/`.
4. First full browser run: **26 passed, one failed** at guest name entry with HTTP 429, while added checks and supplemental UI clients shared the original session quota. New expansion contexts now use separate documentation-range client IPs for local HTTP testing; supplemental review runs separately. The original 20/minute production limit and original assertions remain unchanged. Failure log, context and trace are preserved under `.data/expansion/e2e-shared-rate-limit-failure*`.

PowerShell may decorate native stderr progress messages as NativeCommandError even when the process succeeds; success is determined from the actual process exit code and test/build summary, not from the formatting of stderr. Intermediate runs are not relabeled as final passes.

## Manual actions

No immediate dashboard change is needed for local development. Historical Cloudflare failure still needs its original log. Google and avatar setup/design prerequisites are in [ACCOUNT_AND_PROFILE_DESIGN.md](ACCOUNT_AND_PROFILE_DESIGN.md); these integrations are not implemented or production-ready in this slice. Production migrations/releases remain separately approved actions.

## Continuation

Implement Google identity/profile recovery before promising cross-device persistence. Complete secure avatar processing after the external service choice is approved. Implement Cuisine Quest as the first new complete game; remaining concepts stay planned. Daily claims, seasons, expanded cosmetics/renderers, rankings, session-break controls and broader device/audio/performance work are still open. See [GAME_EXPANSION_PLAN.md](GAME_EXPANSION_PLAN.md) and [GAME_CATALOGUE.md](GAME_CATALOGUE.md).

## Git and exact changed files

The expansion stays on `codex/takeover-and-reliability-audit`, preserving checkpoint `412955267ce388349e908838a3dcaf8ff033c965` and all earlier Claude/Codex work. The final local commit and working-tree state are supplied in the task response. No push, remote merge or production action was performed. The exact inventory below covers this delivered slice. Owned web/realtime/PostgreSQL servers are stopped; ignored local data and diagnostic logs remain for review.

### Exact expansion file inventory

72 files relative to preserved checkpoint `4129552`, including this report and local browser evidence. Ignored test logs/traces/builds/database files are excluded.

- `.env.example`
- `AGENTS.md`
- `ARCHITECTURE.md`
- `CLAUDE.md`
- `DEPLOYMENT.md`
- `GAME_RULES.md`
- `README.md`
- `apps/realtime/package.json`
- `apps/realtime/src/config.ts`
- `apps/realtime/src/persistence.ts`
- `apps/realtime/src/rooms/room-manager.ts`
- `apps/realtime/src/rooms/room.ts`
- `apps/realtime/src/server.ts`
- `apps/realtime/test-db/economy.db.ts`
- `apps/realtime/test/helpers.ts`
- `apps/realtime/test/rematch.test.ts`
- `apps/realtime/tsconfig.json`
- `apps/realtime/vitest.db.config.ts`
- `apps/web/e2e/doodle-duel.spec.ts`
- `apps/web/e2e/expansion.spec.ts`
- `apps/web/src/app/api/session/route.ts`
- `apps/web/src/app/api/solo/submit/route.ts`
- `apps/web/src/app/api/wallet/route.ts`
- `apps/web/src/app/games/[slug]/opengraph-image.tsx`
- `apps/web/src/app/manifest.ts`
- `apps/web/src/app/opengraph-image.tsx`
- `apps/web/src/app/privacy/page.tsx`
- `apps/web/src/app/profile/page.tsx`
- `apps/web/src/app/store/page.tsx`
- `apps/web/src/app/terms/page.tsx`
- `apps/web/src/components/layout/site-footer.tsx`
- `apps/web/src/components/layout/site-header.tsx`
- `apps/web/src/components/play/lobby.tsx`
- `apps/web/src/components/play/room-view.tsx`
- `apps/web/src/components/play/solo-runner.tsx`
- `apps/web/src/components/profile/achievement-emblem.tsx`
- `apps/web/src/components/profile/cosmetic-avatar.tsx`
- `apps/web/src/components/profile/wallet-panel.tsx`
- `apps/web/src/components/ui/primitives.tsx`
- `apps/web/src/games/doodle-duel/doodle-duel-game.tsx`
- `apps/web/src/games/doodle-duel/drawing-canvas.tsx`
- `apps/web/src/lib/player.ts`
- `apps/web/src/lib/realtime/connection.ts`
- `apps/web/src/lib/realtime/use-room.ts`
- `artifacts/expansion/cosmetic-studio-desktop.png`
- `artifacts/expansion/doodle-clean-canvas.png`
- `artifacts/expansion/doodle-lobby-mobile.png`
- `artifacts/expansion/home-desktop.png`
- `artifacts/expansion/opengraph-home.png`
- `artifacts/expansion/studio-mobile-dark.png`
- `artifacts/expansion/studio-mobile-light.png`
- `artifacts/expansion/ui-measurements.json`
- `artifacts/expansion/validation-summary.json`
- `artifacts/expansion/wallet-profile-mobile.png`
- `docs/ACCOUNT_AND_PROFILE_DESIGN.md`
- `docs/EXPANSION_QA_REPORT.md`
- `docs/GAME_CATALOGUE.md`
- `docs/GAME_EXPANSION_PLAN.md`
- `docs/GAME_ROADMAP.md`
- `docs/PLAYER_PROGRESSION_DESIGN.md`
- `docs/SIN_COINS_ECONOMY.md`
- `package.json`
- `packages/db/prisma/migrations/20261104010000_sin_coins_cosmetics/migration.sql`
- `packages/db/prisma/schema.prisma`
- `packages/db/src/client.ts`
- `packages/db/src/index.ts`
- `packages/db/src/repositories.ts`
- `packages/db/src/wallet.ts`
- `packages/shared/src/brand.ts`
- `packages/shared/src/cosmetics.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/realtime/protocol.ts`
