# SinverseGames — overnight progress report

Branch `feature/overnight-game-polish`. All seven games got a dedicated visual and interaction pass. Nothing was deployed and `main` is untouched. No database migration and no production change.

## What is genuinely better

| Game | Before | Now |
| --- | --- | --- |
| **Kitchen Rush** | Rounded cards with small icons and progress bars | A sunset diner: grill, fryer, pot and chopping board drawn as real equipment; food that changes colour as it cooks; customers with eight moods |
| **Bumper Blitz** | Plain circles on a purple disc | A neon rooftop arena with bumper cars; collisions show sparks and shockwaves and shake the camera; knocked-out cars fall into the void |
| **Token Trail** | Flat coloured squares and a static die | A walnut board with felt yards; pawns hop square by square; a 3D die tumbles onto the server's roll |
| **Cascade Solitaire** | White rectangles on a gradient | Original cards on a felt table, 3D flips, a staggered deal, drag-and-drop, and a bouncing-cards win |
| **Mahjong Garden** | Tiles in a pink box | A dusk garden with bone-and-jade tiles; matched pairs fly together into petals; lanterns rise when the board is cleared |
| **Doodle Duel** | Polyline strokes in a generic panel | Smoothed strokes in a spiral sketchbook, letter tiles, a ring timer, sticky-note word choices, and confetti on correct guesses |
| **Color Clash** | A dark gradient table | A felt table lit in the active colour, a spinning direction ring, a fanned hand, and bursts for each action card |

### In more detail

**Kitchen Rush**
- **Cooking:** colours interpolate from raw to perfect to burnt; the patty flips halfway through grilling.
- **Feedback:** heat gauges, smoke, steam, grease sparks and heat shimmer; a "Perfect!" ding, a burn warning, and camera shake on mistakes.
- **Customers:** happy, neutral, impatient (tapping foot, sweating), angry (red-faced and shaking), excited when you carry their dish, celebrating when served, and storming out. They walk in and out.
- **Burgers:** they assemble layer by layer on the plate in the correct order.
- **Moments:** held food follows the mouse, food flies to where it's placed, streak banners, a level intro card, and a shift-complete screen where the stars pop in and the score counts up.

**Audio** (all synthesised in code, so there are no licence issues):
- Separate **Effects** and **Music** volumes in Settings, plus in-game mute and music buttons.
- An original swung diner music loop.
- Sizzle, fry, simmer and room ambience loops.
- One-shot sounds for kitchen, card, tabletop, garden and arena events.

**Gameplay fix:** in Mahjong, a hint can no longer lead you into a dead end. A new engine helper, `safeHint`, searches ahead before suggesting a pair. It's unit-tested on 25 boards, and the slowest hint takes 46 ms. Hints play no part in score verification, so the server is unaffected.

## What you can play right now

On your machine, run `pnpm db:local`, then `pnpm dev`, then open http://localhost:3200.
- **Single player:** Kitchen Rush, Cascade Solitaire and Mahjong Garden. The tutorial shift shows Kitchen Rush best; later shifts unlock as you earn stars.
- **Multiplayer:** Token Trail, Bumper Blitz, Doodle Duel and Color Clash. Open a private room in two browser windows.

## Evidence (`artifacts/overnight/`)

- **`before/`:** the old screens.
- **`kitchen-rush/`:** 11 screenshots (level select, intro, sizzling, flipped, ready, excited guest, served, a busy and a burning shift 12, phone) and **`kitchen-rush-level-1.webm`**, a full recorded tutorial shift (2.1 MB).
- **Bumper Blitz:** `bumper-blitz/`
- **Token Trail:** `token-trail/`
- **Cascade Solitaire:** `cascade-solitaire/`
- **Mahjong Garden:** `mahjong-garden/`
- **Doodle Duel:** `doodle-duel/`
- **Color Clash:** `color-clash/`

## Tests and build

| Check | Result |
| --- | --- |
| Typecheck | all 5 packages pass |
| Unit and integration tests | **151 passed**: engines 113 (2 new hint tests), realtime 30, shared 8 |
| Browser end-to-end tests | **17 / 17 passed** (one new: Kitchen Rush keyboard play, pausing mid-cook, reduced motion, no page errors) |
| Production build | passes (web and realtime) |

The Color Clash and Mahjong tests were also re-run several times in a row: all passed.

## Performance (measured)

**Kitchen Rush**, local production build, shift 12 with every station busy and constant tapping:

| Device | Frames per second | 95% of frames within |
| --- | --- | --- |
| Desktop | 60 | 16.7 ms |
| Phone, CPU slowed 4× | 42.5 (was 35 before optimising) | median 16.7 ms |
| Phone, CPU slowed 6× | 26 (was 22) | — |

- No long tasks on desktop. After 90 seconds the heap grew only from 6.6 to 8.9 MB, which suggests no leak.
- Slow devices switch to lite mode automatically: decorative loops off, fewer particles.

**Fixes made from these measurements:**
- **Token Trail:** a CSS filter on the board forced a full repaint every frame. The shadow is now drawn instead, and idle frame rate went from 36 to 60 fps.
- **Color Clash:** cards in the hand never settled, because one element both measured its layout and rotated. Those are now separate, and the hand settles.
- **Kitchen Rush:** plates stopped redrawing after a memoisation change. Fixed and verified on screen.

Mahjong idles at about 54 fps on the largest board.

## Commits ready for review

- **`708da41`:** Kitchen Rush rebuilt as a living diner; Bumper Blitz neon arena; audio system; visual audit and art direction docs
- **`b92a10e`:** Token Trail tabletop board, hopping pawns and 3D die
- **`728ae47`:** Solitaire card room, original cards, flips, deal and drag-and-drop
- **`810257c`:** Mahjong dusk garden and hints that never dead-end
- **`3e4ce0f`:** Doodle Duel sketchbook, smooth strokes and celebrations
- The final commit: Color Clash table and effects, plus this report

## Not done yet (planned, not implemented)

- **Platform pages (priority 3):** the homepage, thumbnails cut from each game's new art, game detail pages, the lobby and launch transitions are all unchanged.
- **Thumbnails** still use the old gradient style; they're the most visible gap now.
- **Color Clash:** no special victory or defeat sequence yet, and no reactions between players.
- **Doodle Duel:** no avatar reactions to guesses.
- **Not seen on screen:**
  - The Solitaire bouncing-cards win; no test reaches a won game quickly.
  - Bumper Blitz touch controls on a real phone.
- **Recordings:** Kitchen Rush only. Every other game has screenshots.
- **Throttled phones:** Kitchen Rush on a slowed phone is playable but not 60 fps. The next step would be moving customers to the canvas layer.
- **Production name:** the live site still says "Playwave" until the Cloudflare build variable is fixed (see the earlier note).

## Recommended next steps

1. Review this branch in a browser, starting with Kitchen Rush and the recording.
2. Merge it into `main` when you're happy. That triggers the deploy; no environment or database changes are needed.
3. Rebuild the thumbnails and homepage from the new game art.
4. Add victory and defeat moments for the multiplayer games.
