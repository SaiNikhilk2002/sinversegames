# SinverseGames takeover report

Started 2026-11-03; continued 2026-11-04 (Asia/Kolkata). This report covers repository handover, local reliability fixes, read-only production/PR inspection, and validation. No production deployment or external configuration change is included.

## Actual Git state

- Initial clean checkout: `feature/overnight-game-polish`, HEAD `7ef6ee2f55a53fc156bba6be7b88ae00acf23fef`. No staged, unstaged, or untracked changes were present.
- Created `codex/takeover-and-reliability-audit` at that HEAD, preserving all Claude work. No merge, rebase, reset, discard, or push was performed.
- Reported Phase 2 commits `1085cf1`, `e90bd3e`, and `7ef6ee2` all exist, are reachable from this branch, and contain the reported platform/results, motion/capture, test/report changes.
- A read-only fetch updated stale local `origin/main` from `09fe2e4` to `c420c21cc011dc77025007c2074df3f5173447b8`; the local `main` branch was left unchanged.
- Remote main merged Phase 1 at `7ec6eec` through [PR #1](https://github.com/SaiNikhilk2002/sinversegames/pull/1), **2026-11-03 12:08:45 IST**. It does not contain the three Phase 2 commits. Before local edits, `HEAD...origin/main` had three commits unique to HEAD and one main merge commit unique to main.
- Remote branch references were checked again on November 4 and still matched the hashes above. No open takeover PR was created, because pushing was not authorized. A future PR from this branch includes the preserved Phase 2 changes as well as the takeover changes; reviewers should expect that scope.

**Final local state:** `codex/takeover-and-reliability-audit` at `7ef6ee2`, with **28 changed/new files** (11 modified tracked files and 17 new files, including 11 review artifacts), **zero staged files**, and no new local commits. All changes are left available for review. The owned web/realtime/local PostgreSQL listeners on ports 3200, 4200, and 5433 were stopped after validation. The existing engine, database/migration, realtime server, overnight report, and overnight artifact files have no working-tree changes.

## Verified handover and implementation inventory

The monorepo still uses Next.js App Router/TypeScript/Tailwind on Cloudflare OpenNext, an independent Railway Socket.IO service, shared deterministic engines, and Prisma/Neon persistence. The existing implementation was reviewed rather than rebuilt.

| Area | Present and reviewed | Validation scope |
| --- | --- | --- |
| Color Clash | Felt table/card presentation, pure shedding engine, private hand views, server scores, results/rematch | Engine/socket tests and full browser match/reload coverage; new transient-transport scenario. |
| Doodle Duel | Sketchbook/canvas client, word privacy, drawing sync, server guess scoring | Engine/socket tests and two-player draw/guess browser scenario. Avatar reactions are still absent. |
| Token Trail | Tabletop client, server RNG, turn/capture rules, corrected capturer/victim timing | 60 seeded full-game unit simulation and socket/browser race coverage. |
| Bumper Blitz | Canvas arena, server 20 Hz simulation, interpolation, touch controls below arena, distinct seat colors | Physics/input/rate-limit tests and timed-match/mobile browser scenarios. |
| Kitchen Rush | Diner art, 12 levels and station content, timestamp-based replay verification | Content/rules/replay unit tests, tutorial-to-saved-score and keyboard/pause/reduced-motion browser scenarios. All 12 shifts were not manually replayed in this takeover. |
| Cascade Solitaire | Card-room UI, original cards, move/undo/hint rules, verified solo logs | Unit tests and browser draw/move/undo/save scenario; historical win-animation screenshots preserved. |
| Mahjong Garden | Garden art, three solvable layouts, pairing/hint/undo logic | Seed/layout/solvability tests and complete hinted-board browser win. |
| Platform | Cover-driven homepage, shelves/categories, themed detail/play/lobby/leaderboard/profile, navigation/mobile menu | Route/browser checks, plus focused visual/performance inspection recorded below. |
| Multiplayer endings | ResultsPanel reads authoritative MatchResults; victory/defeat/placements, podium, score count-up, fanfare/confetti, ready votes/host restart | Existing socket match-result coverage and browser full-match results. No client-submitted winners or scores were added. |

Read `README.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`, `GAME_RULES.md`, art direction/roadmap/visual audit, both overnight reports, package scripts, engine/client registries, relevant engine/client code, socket/configuration/session/health paths, tests, and QA inventory. Both multiplayer and solo clients are already code-split by game. This is a handover/reliability audit, not a line-by-line security review of every game.

The Phase 2 evidence directory contains **34 existing files**, including before/after page captures, mobile controls, results, capture/win frames, and a Bumper Blitz recording. All existing artifacts and reports were preserved. Historical FPS claims are not treated as fresh measurements.

## Local changes

| Files | Change and purpose |
| --- | --- |
| `AGENTS.md`, `CLAUDE.md` | Establish identical shared governance; both were missing at the root. Cover architecture, commands, security, env names, migrations, production restrictions, status, decisions, and completion checks. Preserve the nested Next.js instructions. |
| `apps/web/src/lib/realtime/connection.ts` | Five-second token deadline and stale-attempt cancellation; capped authentication backoff; preserve terminal auth status; explicit initial transport fallback; ten-second connection deadline; retain singleton socket. |
| `apps/web/src/lib/realtime/use-room.ts` | Clear stale join errors on reconnect and wait for a connection before retrying a room join. |
| `apps/web/src/components/play/room-view.tsx` | Replace initial unreachable-room spinner with a useful retry/error screen. |
| `apps/web/src/app/page.tsx`, `apps/web/src/components/games/hero-spotlight.tsx`, `apps/web/e2e/platform.spec.ts` | Constrain the mobile homepage grid/spotlight and verify that the heading fits inside the viewport, including when an outer section hides overflow. |
| `apps/web/e2e/reliability.spec.ts` | Eight behavior regressions: token 503, token timeout, terminal 401, terminal 403, room retry, rejected WebSocket handshake, accepted-then-closed WebSocket upgrade, real transport interruption with hand/room restoration and visual evidence. |
| `apps/web/e2e/color-clash.spec.ts` | Repair the existing mouse-driven bot: require enabled live turn controls, wait for a played card's exit, handle Prism color selection, and return false on failed clicks. Match-completion, private-hand, score-agreement, and rematch assertions remain intact. |
| `packages/shared/src/brand.ts`, `.env.example`, `README.md` | SinverseGames default branding; remove undecided-brand guidance; clarify exact apex/www/preview origins. |
| `.node-version`, `DEPLOYMENT.md` | Pin Node 24 at the configured build root, document observed Worker-name discrepancy, and state preview isolation/approval requirements. |
| `docs/CODEX_TAKEOVER_REPORT.md`, `docs/RELIABILITY_INVESTIGATION.md` | Handover, current status, confirmed findings versus hypotheses, validation, remaining work, and dashboard actions. |

No dependency or lockfile update, migration, game-rule rewrite, production variable change, or DNS edit was required.

## Validation record

Initial verification on the unchanged source passed **151 unit/integration tests**, all five package typechecks, and both production builds. Before fixing connection behavior, all **three** new reproduction cases failed on the original production build, as expected.

The first repeated Node 24 unit run overlapped the production build and hit the existing five-second Token Trail simulation timeout (112/113 engine tests passed; shared passed; recursive run stopped before realtime). That failed attempt is retained as a failed validation attempt, not relabeled as passing. Final rerun results follow.

The first post-fix reliability run passed 6/7 cases; its fallback fixture accepted and then closed a WebSocket rather than rejecting the opening handshake. These are now two separate regressions, with polling established before attempting an upgrade so both failure modes remain playable. The first full 24-case run passed all 17 existing cases and six reliability cases; exact-hand comparison failed because the disconnected active player was correctly auto-drawn a card after ten seconds. The corrected scenario disables the normal turn timer and holds the connected opponent's turn, preserves exact hand equality, and additionally requires that the opponent sees Offline before recovery. The failed runs remain recorded locally. The final suite has 25 cases.

The next full run passed 24/25, including all eight reliability cases, but the existing Color Clash bot exhausted its match budget. The trace contained 44 two-second click timeouts: the helper treated failed clicks as successful and selected cards still animating out with an old playable attribute. The repaired helper waits for the played card to detach and checks live enabled turn controls. It retains real mouse input, the original game/match budgets, animations, and all outcome assertions; no forced clicks or reduced-motion override was added. Three subsequent independently dealt full matches passed (36.2s, 36.5s, and about 78s).

| Check | Final result |
| --- | --- |
| Node/pnpm | Node 24.14.0; pinned pnpm 11.15.1. |
| `pnpm build` | PASS: generated both Prisma clients; web and realtime production builds completed. |
| `pnpm typecheck` | PASS: all five packages on final source. |
| `pnpm test` | PASS: shared 8, engines 113, realtime 30; 151 total on the final serial run. |
| Reliability Playwright cases | PASS: all 8 reliability cases plus the strengthened mobile check (9/9 focused run). |
| Color Clash bot regression | PASS: 3/3 repeated complete matches after repairing stale animation interaction. |
| Complete existing + new browser suite | PASS: **25/25** in one complete final run (5.3 minutes), against local production builds/local PostgreSQL. |
| Linux `pnpm cloudflare:build` | PASS on final source in isolated Ubuntu WSL; normal OpenNext build generated `.open-next/worker.js`. No deployment or unsupported-version bypass. An interrupted initial dependency-download attempt was not counted as a build. |
| Documentation synchronization and `git diff --check` | PASS: identical root instruction files, no whitespace errors; original overnight artifacts preserved; owned local listeners stopped. |

Tests use explicit localhost web/realtime URLs, a test signing secret, and local PostgreSQL on port 5433. No production database or guest data is used. Browser traces may contain session tokens and are kept ignored; only reviewed local test screenshots/recordings may be retained as review evidence.

Both root instruction files have SHA-256 `14E39F05A182FAEB69FD99A1242A5E03A8C7E45FCE35ECC517DB0087CF561BC2`. The table above and local logs record the final successful checks separately from earlier failed/interrupted attempts. The final Windows typecheck also passed after the browser-bot change. The Linux build validates artifact generation; a deployed Worker runtime and authenticated production gameplay were not exercised.

## Production and Cloudflare findings

[RELIABILITY_INVESTIGATION.md](RELIABILITY_INVESTIGATION.md) contains endpoint results, timeout analysis, source evidence, reproduction details, official references, and the failed Cloudflare build link.

Production health, `rt` DNS/TLS, CSP, and exact apex/www polling acceptance passed the November 3 probes; an unrelated origin was rejected. The old hostname/CORS mismatch was not reproduced. Both public origins still rendered Playwave. The three local client failures are confirmed defects but are not proven to explain every previously reported production interruption. No fix has been deployed.

On November 4, unauthenticated WebSocket upgrades returned HTTP 101 for apex/www and rejected the unrelated origin with HTTP 400. Inspection of the public play page's 14 JavaScript chunks found the intended `https://rt.sinversegames.com` client URL and no generated Railway hostname in those chunks.

The merged PR's Cloudflare check failed for Worker `sinversegames`, whereas the checked-in name is `sinversegames-web`. Exact failure logs and effective dashboard settings were unavailable; name mismatch, workspace command selection, preview environment, and build Node version remain investigation targets rather than asserted historic causes. A root Node 24 version pin and preview isolation guidance were prepared locally.

## Quality and performance status

- A fresh desktop homepage had **4,137 elements**, **29 covers**, and **3,695 elements inside cover SVGs** (about 89% of its DOM). After adding a recently played game, the mobile page had 30 covers. Game modules are already lazy-loaded; repeated inline artwork is the measured next optimization target. Preserve the existing art and compare cached SVG/image thumbnails or shared references before changing the presentation. No new FPS claim is made from DOM counts.
- The 375px screenshot exposed hidden clipping: the homepage grid's implicit column was 608px and its copy 512px wide even though document overflow was zero. Explicitly using a single constrained column and allowing the spotlight to shrink fixes this layout; fresh measurement shows a **343px column and 343px copy**. The browser assertion now checks the heading's actual bounds.
- Open Graph routes already generate homepage and per-game PNGs. The outstanding gap is artwork-based social previews and stale OG copy (homepage lists only the first two games; solo previews use a generic multiplayer player range), not the complete absence of social images.
- Doodle avatar reactions and broader game recordings remain follow-up work. This audit adds network recovery evidence without starting a new feature phase.
- In-memory rooms intentionally do not survive process restarts. Server-side database connection/query deadlines and durable failed-result recovery remain reliability debt. Reduced-motion presentation is preserved; physical-device performance/accessibility are not certified by desktop emulation.

The additional UI audit visited 19 routes, including all seven detail pages, a live local lobby, leaderboard, profile, mobile navigation, and invalid routes. Every game Open Graph endpoint returned a PNG with HTTP 200; all three tested unknown game/play/invalid room routes returned 404. No page exceptions occurred. DOM measurements are taken after font readiness; async play/room content is explicitly awaited for screenshots, so their earlier route snapshots are not full-game DOM measurements.

Room status is precise: malformed room codes return HTTP 404; a syntactically valid but nonexistent room serves the room shell and then shows Room not found after the authenticated realtime lookup. It does not return an HTTP 404 from that initial shell request.

## New review evidence

All files below are under `artifacts/takeover-audit/`; existing overnight artifacts remain untouched.

- `home-desktop.png`, `home-mobile-menu.png`, `home-mobile-menu-before.png`, `lobby-desktop.png`, `profile-desktop.png`: current page captures plus the retained clipped mobile view for comparison.
- `connection-lost.png`, `back-online.png`, `transient-network-recovery.webm`: the passing final-source focused reconnect scenario, including an interrupted transport and exact hand restoration.
- `ui-measurements.json`: route status, title, initial DOM/cover counts, overflow, and Open Graph metadata checks.
- `public-health-and-pr-checks-2026-11-03.json`, `public-transports-2026-11-04.json`: sanitized read-only public checks and PR/check metadata. No session cookies, signing secrets, database URLs, or tokens are included.

Failed and intermediate validation logs are retained locally under ignored `.data/takeover/`. Browser traces are not published because they can contain test session tokens. The isolated Linux source/toolchain is under `/home/saini/sinversegames-audit-20261104` in Ubuntu WSL; it contains no copied `.env` or production credentials. Builds use Node 24.14.0, pnpm 11.15.1, and two build workers to limit shared-host resource pressure.

## Prioritized next work and manual actions

1. Review this branch's combined Phase 2 + takeover scope and the final validation/evidence. Pushing or opening a remote PR requires explicit approval; nothing has been pushed.
2. Open/export the linked failed Cloudflare build log and inspect effective Worker name, build root/commands, branch commands, Node version, and build versus runtime variables. This is the only way to resolve the exact historical failure with current access. Do not change production configuration merely to test a hypothesis.
3. Confirm the SinverseGames build variable for a separately approved release. Existing public health/CORS probes are already green, so preserve the current exact origins and intended realtime hostname.
4. Provision/configure isolated preview web, realtime, database, and signing secrets only after approval. A Worker version preview alone does not isolate production data access.
5. Add tested server-side database connection/query deadlines; measure repeated health/reconnect behavior under dependency faults. Consider durable result retry separately from active-room restart recovery.
6. Optimize repeated SVG thumbnails using measured data while preserving existing art; update artwork-based social previews and their solo/multiplayer wording. Add Doodle reactions and physical-device/gameplay recordings as separate bounded tasks.

## Completion checklist

- [x] `CLAUDE.md` created/updated as required.
- [x] `AGENTS.md` created/updated as required.
- [x] Shared sections synchronized and final byte comparison recorded.
- [x] Final tests/build results recorded.
- [x] Technical decisions and production limitations documented.
- [x] Remaining issues and required dashboard actions recorded.
- [x] Final Git changes and branch status recorded.
