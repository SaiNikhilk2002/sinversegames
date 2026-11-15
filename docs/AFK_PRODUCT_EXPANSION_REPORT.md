# AFK product expansion report: Same Wavelength, multi-category discovery and the Couples experience

**Dates:** 2026-11-15. **Branch:** `feature/unified-platform`.

**Everything is local.** Nothing was pushed, merged or deployed; Railway wasn't touched; no production database, migration, secret, DNS or infrastructure setting changed. Root `AGENTS.md` and `CLAUDE.md` were not modified.

## 1. What was implemented

- **Same Wavelength,** a new original social multiplayer game. It has a server-authoritative engine, a full web client, rooms, matchmaking, persistence, achievements, sharing and tests.
- **A multi-category discovery system:**
  - a reusable many-to-many model over the one canonical catalogue;
  - category landing pages, search and filters;
  - category navigation and homepage tiles;
  - category chips on game pages;
  - the sitemap.
- **A dedicated Couples landing page,** with featured games and seven curated collections.
- **Fun Insights:** a reusable rules-based engine, shown on every multiplayer result.
- **Shareable result cards:** a signed share link, a page and a preview image, with native sharing or copying.
- **Recorded Doodle Duel statistics** (correct guesses, fastest guess, fewest hints, drawings guessed) so insights rest on real events. No rule changed.
- **Generic platform improvements:**
  - engines can limit seats by settings (`maxPlayersFor`);
  - links can start a private room with a preset;
  - game result screens can receive the last game state;
  - cooperative results read "Played together", not "Defeat".

## 2. Same Wavelength (`SAME_WAVELENGTH_DESIGN.md`)

**Modes:** Couples (exactly 2), Friends (2–4) and Group (2–6). The host sets 5/8/10/12 rounds, a 20–60 s answer timer, and optional typed answers.

**Rounds:**
1. The server deals the same prompt to everyone.
2. Each player answers privately, once.
3. Answers stay hidden until everyone connected has answered, or the timer ends.
4. The reveal shows all the answers, each pair's result and a verdict ("Same brain moment!", "Different opinions, great chemistry").
5. Players tap Next, or the reveal times out.
6. After the last round: the session summary.

**Prompt kinds:** multiple choice, scenario, preference, emoji, who-is-more-likely, predict-your-partner (with second-person wording for the subject), and short typed answers. The bank has 64 curated, light-hearted prompts with topics.

**Scoring:**
- **Points per pair:** 2 for an exact match, 1 for options the prompt groups as close, 0 otherwise.
- **Typed answers** match only after simple normalisation, or when the prompt lists them as equivalent. There's no AI.
- **Every reveal can show how it scored.**

## 3. Category architecture (`GAME_CATEGORY_DISCOVERY.md`)

- **One canonical game record** in `registry.ts`, unchanged. Genres are kept.
- **Discovery categories** live in `discovery.ts`, each with:
  - an id and slug, name, description, icon and order;
  - a visibility flag;
  - landing copy and metadata;
  - an optional dedicated page.
- **Assignments:** `GAME_DISCOVERY` holds audiences, tags and availability, typed per game id, so every game must be classified. Multiplayer and Single player are derived from the game's kind.
- **Queries:** `gamesInCategory`, `visibleCategories` (only non-empty), `searchGames` (text, category, genre, player count) and `collectionsFor`.

## 4. Category assignments for all games

| Game | Categories |
|---|---|
| Same Wavelength | Multiplayer, Couples, Friends, Family, Party |
| Doodle Duel | Multiplayer, Couples, Friends, Family, Party |
| Color Clash | Multiplayer, Couples, Friends, Family, Party |
| Token Trail | Multiplayer, Friends, Family |
| Bumper Blitz | Multiplayer, Friends, Party, Competitive |
| Chef Rivals | Multiplayer, Couples, Friends, Competitive |
| Kitchen Rush Co-op | Multiplayer, Couples, Friends, Family, Party |
| Cascade Solitaire | Single player, Casual |
| Mahjong Garden | Single player, Casual |
| Kitchen Rush | Single player, Casual, Competitive |
| Cuisine Quest | Single player, Casual, Family |
| Sinverse Cricket | Single player, Competitive |

**Pages:**
- `/categories/multiplayer`, `single-player`, `friends`, `family`, `party`, `competitive` and `casual`;
- `/couples` (and `/categories/couples` redirects there);
- an unknown or empty category is a 404.

## 5. The Couples landing page and collections (`COUPLES_EXPERIENCE.md`)

- **`/couples` has:**
  - the hero "Play together. Laugh together. Discover your vibe.", with **Start a Same Wavelength room** (a private Couples-mode room via `?preset=couples`);
  - three steps (pick, send one link, play anywhere, with no sign-up);
  - five featured games, each with an honest reason it works for two;
  - seven collections: *How well do you know each other?*, *Think-alike challenges*, *Draw together*, *Friendly competition*, *Quick date-night games*, *Laugh together*, *Long-distance couple games*;
  - a "just for fun, not a compatibility test" call to action;
  - links to the other categories.
- **Deliberately excluded:** Bumper Blitz and solo games.

## 6. Fun Insights (`FUN_INSIGHTS_SYSTEM.md`)

- **How it works:** a rules-based, deterministic engine. Each rule needs specific recorded facts.
- **Scope:** game-specific rules (Same Wavelength, Doodle Duel), generic multiplayer rules, and pair or group wording.
- **Where it shows:** on every completed multiplayer result, and on share cards.
- **Examples:**
  - "Same brain energy: you matched 86% of the time!"
  - "You disagree on food but agree on travel. Interesting combination!"
  - "A drawing was recognised in just 7 seconds!"
  - "Someone got it with zero letter hints. Telepathy?"
  - "Only 20 points in it. The rematch is probably necessary."
- **No claims:** compatibility, personality or research language is excluded, and a test scans for it.
- **Nothing sent anywhere:** no LLM or external service.

## 7. Shareable results

**Share result** posts a match id. The server:
- verifies the caller played that **recorded**, completed multiplayer match;
- builds the card (game, headline, numbers, up to two insights, names **only if opted in**);
- signs it (HS256, 400 days).

`/share/<token>` renders the card with a Play call to action; edited links are a 404. `/share/<token>/opengraph-image` is the card as a PNG, for link previews and **Save image**. Delivery uses the native share sheet, or copies the link. A card never contains answers, emails, ids or room codes.

## 8. Database changes

**None to the schema: no migration.**
- Game ids aren't constrained in the database.
- A fresh local database built from the existing four migrations was used for the browser suite.

**Code changes only:**
- `recordMatch` records a `result: "shared"` entry as neutral (neither a win nor a loss);
- two achievements (`same-brain`, `tuned-in`) are added as string keys.

Existing players, wallets, cosmetics, achievements, history, statistics and ids are untouched; the new game only adds rows of existing kinds.

## 9. Security measures

- **Server-authoritative:** rooms, rounds, prompts, deadlines and scoring.
- **Secrecy:** answers stay hidden in per-player views until the reveal, tested over the socket.
- **Answers:** one answer per player, and stale rounds and non-members are refused.
- **Validation:** strict Zod validation of every action; typed text is bounded and has control characters stripped.
- **Rate limits:** the existing action bucket for `wave:*`, plus share-link creation limited to 20 a minute.
- **Seats:** limited by mode at join, configure, public rooms and matchmaking.
- **Invitations:** the existing random room codes and rate-limited joins.
- **Sharing:**
  - a session is required, and the match must have been the caller's;
  - not-yours and unknown matches get the same 404;
  - links are signed and tamper-proof;
  - cards hold no private data, and share pages are `noindex`.
- **Typed answers:** off by default, and therefore off in quick match with strangers.
- **Storage:** results store aggregates only; answers are never stored.
- **Identity:** guest, email and Google identities and sessions are unchanged.

## 10. Performance

- **Same Wavelength under load** (`pnpm --filter @platform/realtime bench:wavelength`; the real server in a child process with production compression; local Windows laptop, Node 24.14.0):
  - **40 Couples rooms and 10 Group rooms, 140 players, full 12-round games for 30 s;**
  - **CPU:** about **10% of one core**;
  - **memory:** RSS **107 → 201 MB** (+94 MB);
  - **traffic:** about **1 KB/s and 6 messages/s per room** (Bumper Blitz: about 19 KB/s).
- **Discovery pages:** static data, with no database queries. `/couples` is prerendered; covers are inline SVG; no engines load.
- **Bundles:** the Same Wavelength client is code-split like the other games.
- **Linux OpenNext assets:** 31 → 33 MB, against Cloudflare's 25 MiB per-file limit (the largest file is unchanged at 1.8 MiB).

## 11. Tests: passed and failed

All on Windows 11, Node 24.14.0, pnpm 11.15.1, with local loopback PostgreSQL `*_test` databases.

| Check | Result |
|---|---|
| `pnpm typecheck` | **Passed** (every package) |
| `pnpm test` | **647 passed** (shared 54, was 37; engines 503, was 487; realtime 90, was 85) |
| `pnpm test:db` | **69 passed** (was 66) |
| `pnpm build` | **Passed** (new routes: `/couples` static; `/categories/[slug]`, `/api/share`, `/share/[token]` and its image dynamic) |
| `pnpm test:e2e` on a **fresh** migrated `sinversegames_e2e_20261115_test` database | **205 passed, 0 failed, 10 skipped** (42.3 min). Was 198 non-skipped; +7 new |
| Linux Cloudflare/OpenNext build (WSL, clean copy, frozen install) | **Passed.** Lockfile SHA-256 `bbf66641…cf2ce2d` unchanged; Worker emitted; 33 MB assets; nothing uploaded |
| Realtime load | `bench:wavelength` (above). Compression and verification benches unchanged |

**New tests:**

| Area | Tests |
|---|---|
| Engine | 16 |
| Sockets | 5 |
| Database | 3 |
| Discovery | 9 |
| Insights | 5 |
| Share cards | 4 |
| Browser | 2 Same Wavelength + 5 discovery |

- **Existing suites:** the existing Doodle Duel tests pass unchanged after the statistics change, and none were removed, skipped or weakened.
- **The 10 skips** are the on-demand footage and evidence recorders.
- **Last mission's 2 order-dependent identity failures:**
  - **Cause:** leftover fixture data in a long-lived local test database.
  - **Fix:** the full suite now runs on a fresh, freshly migrated database, and it passed.

## 12. Browser testing

**Chromium, desktop and phone widths:**
- **The full Couples game in two browser contexts:**
  - the preset link and the invite join;
  - secrecy checked in the UI;
  - the reveal over five rounds;
  - the summary and "Played together";
  - insights;
  - share links without and with names;
  - a tampered link giving 404.
- **Phone layout** (390 px) of answering, the reveal and the results.
- **Discovery:** the Couples page, category pages, Doodle Duel in four categories, filters, the redirect and the 404, existing routes, homepage tiles, and 360 px layouts.

**Visual review** (screenshots kept locally) of the Couples page, the friends category, all games, the home page, a game page, answering, the reveal, results and the share card. Zero page errors.

**This review found and fixed one real bug:** the shared results panel had called a cooperative result "Defeat".

**Not tested:** physical phones, Safari or WebKit, or assistive technology beyond keyboard and labels.

## 13. Known issues

- **Shared picks and funny disagreements show only in the tab that saw the game end.** After a refresh, the summary shows aggregates, because answers aren't stored, by design.
- **Typed-answer matching is simple by design.** Synonyms match only if a prompt lists them.
- **Public quick match** pairs 2 players in Friends mode. Groups and Couples use private rooms.
- **No word filter on typed answers.** They're off in quick match, and the existing report button applies.
- **Share links last 400 days and can't be revoked individually** (rotating `AUTH_SECRET` would invalidate them all).

## 14. Remaining work

- **Dedicated landing pages** for Friends, Family and Party, using the same `landing` and `href` structure.
- **More Same Wavelength prompts and packs** (seasonal, family).
- **A Same Wavelength leaderboard view** of match % (the generic game leaderboards already record it).
- **Doodle-style insights for more games:** they'd first need to record more facts in their results.
- **Share cards for solo games** (not built: the share route accepts multiplayer matches only).

## 15. Files changed (`554c47e..HEAD`)

55 files: 28 added, 27 modified; +3,441 / −41.

**New:**
- **Engine:** `packages/engines/src/same-wavelength/{engine,prompts,scoring,index}.ts`
- **Shared:** `packages/shared/src/{games/discovery,insights,share-card,identity/share}.ts`
- **Web:**
  - `apps/web/src/games/same-wavelength/*`
  - `apps/web/src/app/{couples,categories/[slug],share/[token],api/share}/…`
  - `apps/web/src/components/{games/category-nav,play/share-result,share/share-card}.tsx`
- **Tests:** shared, engine, realtime, database and browser test files
- **Bench:** `apps/realtime/bench/same-wavelength-load.ts`
- **Docs:** five documents

**Modified:**
- the registry and protocol;
- the engine index, types and Doodle Duel engine;
- realtime rooms, manager, matchmaker and rate limits;
- the database repositories and progression;
- the web games and play pages, homepage, sitemap, header, covers and theme, client registry and types, play hub, room view and results panel.

## 16. Commits created

| Commit | What |
|---|---|
| `e412e90` | `feat(same-wavelength)`: engine, discovery model and Fun Insights in the shared packages |
| `f92db8b` | `feat(web)`: Same Wavelength client, category pages, Couples page and shareable results |
| `d683a05` | `fix(web)`: cooperative results read "Played together"; browser tests |
| `4416773` | `test(same-wavelength)`: real-database tests and the load benchmark |
| (this) | `docs`: the five product documents |

## 17. Git

- **Branch:** `feature/unified-platform`.
- **Before this mission:** HEAD `554c47e`, 18 ahead and 0 behind `origin/feature/unified-platform`.
- **Now:** 23 ahead, 0 behind, including this document's commit.
- **Working tree:** clean. Browser-suite artifact images were restored with `git restore`.

## 18. Confirmation

- **No push, merge, deployment, Railway restart, production migration or production data change.**
- No Cloudflare, Railway, Neon, DNS or monitoring setting was touched, and no secret was read or changed.
- No other repository, worktree or the Toolyaro project was touched.
- **Releasing this** follows the existing runbook: a push and merge to `main` deploys the web Worker and restarts Railway (ending live rooms). No migration is needed.
