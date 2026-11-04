# SinverseGames — overnight phase 2 report

Branch `feature/overnight-game-polish`, continuing from phase 1. `main` is untouched, nothing was deployed, and there were no database, environment or infrastructure changes.

## What is genuinely better

### Priority 1 — the website now feels like one gaming product

- **Original cover art for all seven games** (`components/covers.tsx`).
  - Each cover is built from that game's own in-game art: Kitchen Rush customers, food and grill; Solitaire cards; Mahjong tiles; Token Trail pawns and die; Bumper Blitz cars; Doodle Duel sketchbook; Color Clash cards.
  - Each carries a wordmark styled after its world.
  - They replace every thumbnail on the site and use no `<defs>`, so any number can share a page.
- **Platform mark:** a new original mark replaces the gradient play icon.
- **Homepage:**
  - A marquee spotlight that cycles through the games in each game's colours, with a cover strip to jump between them. It pauses on hover or focus and under reduced motion.
  - "Play with friends" and "Play solo" shelves, category chips with cover thumbnails, and a how-it-works section with a cover collage.
- **Game cards:** art first, with a strip in the game's colours, Play button and New/Hot tags.
- **Game detail pages:** a full-width hero band in the game's colours with a framed cover, stats, a Play button and numbered how-to-play steps.
- **Play hub** (create, join, matchmaking): themed banner; quick match shows an animated radar and queue dots.
- **Lobby:** the room code becomes a themed ticket; players slide in, and ready players glow in the game's colour.
- **Leaderboard:** themed header, a strip of game covers to switch games, a top-three podium and medal ranks.
- **Profile:** a banner made of the covers, a level badge, game rows in each game's colours, and achievement medallions with progress.
- **Site-wide:**
  - Primary buttons are solid "arcade" buttons rather than a gradient.
  - On phones, the menu slides down with a grid of games.
  - The active nav item gets an animated underline.
  - Solo result screens are themed.
  - The slow, database-backed pages have a loading screen.

### Priority 2 — finishing a multiplayer match

One shared sequence covers Color Clash, Doodle Duel, Token Trail and Bumper Blitz (`components/play/results-panel.tsx`). All data comes from the server's results.

- **Your result first:** "Victory!", "2nd place" or "Defeat", plus the winner and where you finished.
- **Celebration:**
  - A podium for the top three.
  - Scores that count up, with a tick sound for your own.
  - Game-specific stats: cards left, knockouts, falls, tokens home, captures.
  - Confetti and a fanfare when you win; a short defeat sting otherwise.
- **Rematch:** guests use it to ready up; the host's button starts the match once everyone is ready. "Back to the lobby" scrolls to the lobby. Verified end to end: the guest voted, the host's button became active, and the rematch started.
- **Connection feedback:**
  - An animated "Connection lost — reconnecting" banner, and a "Back online" flash when the connection returns.
  - Players who drop show as reconnecting in the lobby, as before.

### Priority 3 — game QA (evidence in `qa/`)

| Check | Result |
| --- | --- |
| **Kitchen Rush** | All 12 shifts open without errors. Food cooks on every station with a matching ingredient, and guests arrive. Shift 1 plays through to a saved score in the existing browser test. |
| **Token Trail** | Captures happen and are logged. **Fixed:** the captured pawn used to leave before the capturing pawn reached it; it now waits about 0.45 s. |
| **Cascade Solitaire** | **The bouncing-cards win now verified.** A solver found a winnable deal (seed 4, 336 moves). The browser forced that deal by intercepting the start request, then replayed every move through the real UI with drag-and-drop and stock clicks. |
| **Mahjong Garden** | Boards are always solvable (existing engine tests). Hints never lead to a dead end (phase-1 unit test). The browser test clears a full board using hints. |
| **Doodle Duel and Color Clash** | Full two-player matches pass in the browser tests, including drawing sync, scoring, card play and reconnecting after a reload. |
| **Bumper Blitz** | Keyboard play passes in the browser tests. Touch play was tested on a phone-sized screen with real touch events: holding the stick drove the car off the edge twice. |

**Bumper Blitz fixes from this QA:**
- **Touch controls covered the arena:** the joystick and Boost button sat on top of much of the play area on a phone. They now sit below the arena.
- **Clashing car colours:** two players with the same profile colour got identical cars. Clashing cars now get distinct colours, the same on every screen.

### Priority 4 — performance and polish

Measured on a local production build:

| Page | Layout shift | Largest paint | Frames per second | DOM size | Transfer size |
| --- | --- | --- | --- | --- | --- |
| Homepage, desktop | 0 | 880 ms | 60 | 4,142 elements | 463 KB (271 KB JS) |
| Homepage, phone | 0 | 764 ms | 60 | — | — |
| Games list | 0 | 1,444 ms | 60 | 1,356 elements | — |
| Kitchen Rush detail | 0 | 536 ms | 60 | — | — |

Heaps after garbage collection were 4.6–5.7 MB on every page.

- **Reduced motion:**
  - The in-app toggle and the OS setting now apply to every animation driven by the `motion` library, not only CSS ones. The library previously ignored both.
  - Verified: under reduced motion the homepage spotlight doesn't advance.
- **Fixed during this work:**
  - The game colour table had been exported from a client module, which crashed the new homepage (server pages received a reference instead of the data).
  - A site-wide loading screen made unknown rooms and games return HTTP 200 instead of 404. Loading screens now appear only on the leaderboard and profile pages.
  - The Token Trail browser test could stall when one player's results appeared a moment before the other's.

## Evidence (`artifacts/overnight-phase-2/`)

- **`platform/` (before and after):**
  - **Before**, from the live site: `before-home.png`, `before-games.png`, `before-detail.png`, `before-leaderboard.png`.
  - **After**, local: home (screen and full page), games list, detail pages for three games, play hub, matchmaking, lobby, leaderboard, profile, phone home, phone menu.
- **`multiplayer/`:**
  - `results-a.png` (Defeat, desktop) and `results-b-phone.png` (Victory, phone).
  - `rematch-ready.png`.
  - Bumper Blitz on a phone: the controls before and after the move (`bb-phone-touch.png`, `bb-phone-controls-below.png`) and `bb-phone-after-touch.png`.
  - **`match-complete-bumper-blitz.webm`:** a full match, the results sequence and the rematch starting (1.7 MB).
- **`qa/`:**
  - Solitaire: `solitaire-midgame.png` and the win cascade at three moments.
  - `kitchen-rush-shift-12-all-stations.png`.
  - Token Trail: the capture and after it.
  - `reconnecting.png`.

## Tests and build

| Check | Result |
| --- | --- |
| Typecheck | all 5 packages pass |
| Unit and integration tests | **151 passed** (engines 113, realtime 30, shared 8) |
| Browser end-to-end tests | **17 / 17 passed** on a local production build |
| Production build | passes (web and realtime) |

The Token Trail browser test then passed 4 of 4 times in a row.

Test changes, none of which weaken an assertion:
- The homepage heading text was updated to the new copy.
- The room-error test waits for the player to be connected before navigating, removing a race.
- The Token Trail step helper checks that the Roll button exists before asking whether it's enabled.

## Commits this phase

- **`1085cf1`:** platform covers, homepage, themed pages, match-complete sequence, Bumper Blitz touch layout and colours
- **`e90bd3e`:** reduced motion for all animations; Token Trail capture timing; QA evidence
- **Final commit:** Token Trail test fix and this report

## Not done or not verified (honest list)

- **"Back online" flash:** seen only in code, not on screen. Restarting the local game server ends its rooms, since rooms live in memory, so the page correctly shows "room closed" rather than reconnecting. Offline emulation doesn't close an open socket, so a short network drop couldn't be simulated. The "Connection lost" banner itself was verified.
- **Doodle Duel avatar reactions** were not added.
- **Homepage DOM** is heavy (about 4,100 elements, from roughly 30 inline SVG covers). It still renders at 60 fps with no layout shift. Rendering the hidden spotlight thumbnails lazily would reduce it.
- **Covers** are drawn in code. There are no bitmap exports for social sharing (Open Graph images).
- **Site name:** the live site still says "Playwave" until the Cloudflare build variable is fixed.
- **Recordings:** phase 2 has one match recording; everything else is screenshots.

## Next steps

1. Review the branch locally:
   1. `pnpm db:local`
   2. `pnpm dev`
   3. Open http://localhost:3200: homepage first, then play a multiplayer match in two windows to see the results sequence.
2. Merge into `main` when you're happy. That triggers the deploy; no environment or database changes are needed.
3. Optional follow-ups: Open Graph images exported from the covers, lazy spotlight thumbnails, and Doodle Duel reactions.
