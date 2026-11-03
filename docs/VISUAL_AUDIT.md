# Visual quality audit

An honest assessment of all seven games against the studio bar in [ART_DIRECTION.md](ART_DIRECTION.md). It is based on playing each game and reading its UI code.

**Scale:** 1 = placeholder, 3 = clean but generic, 5 = polished commercial casual game.

| Game | Art identity | Motion | Feedback | Audio | Mobile | Overall | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Kitchen Rush** (before) | 2 | 1 | 2 | 1 | 3 | **1.8** | Rebuilt in this branch |
| **Kitchen Rush** (after) | 4 | 4 | 4 | 4 | 4 | **4.0** | Reference game; ready for review |
| Bumper Blitz | 1 | 2 | 1 | 1 | 3 | **1.6** | Weakest. Next in the queue |
| Token Trail | 2 | 1 | 2 | 2 | 3 | **2.0** | Queued |
| Cascade Solitaire | 2 | 2 | 2 | 2 | 3 | **2.2** | Queued |
| Doodle Duel | 2 | 2 | 2 | 2 | 3 | **2.2** | Queued |
| Mahjong Garden | 3 | 2 | 2 | 1 | 3 | **2.2** | Queued |
| Color Clash | 3 | 3 | 3 | 2 | 3 | **2.8** | Queued |

## What every game shared before this pass

- **One chrome:** every game sat inside the same dark purple panel. No game had its own world, so nothing was recognisable from a screenshot without its title.
- **Cards and pills:** UI was built from rounded rectangles, pills and gradient buttons, with game state shown as text and counters ("0 served · 4 to go", "Knocked out — respawning…").
- **Audio:** about fifteen identical sine and square beeps, shared by all games. There was no ambience, no music, and a single volume slider.
- **Motion:** mostly fade and slide-in through one helper, the same across unrelated games. Nothing communicated weight, heat, impact or emotion.

## Per game

### Kitchen Rush (before)

- A grid of rounded cards on a flat purple panel.
- A station was a coloured box with a 48 px icon and a progress bar. Cooking was a bar filling up: no grill, no heat, no smoke, no flip.
- Customers were a 64 px head with three possible mouths, shown above a progress bar. Impatience was only the bar's colour.
- Plates showed loose icons side by side, never an assembled dish.
- The 🔥 emoji was the only burning cue.
- Sounds were generic beeps, and finishing a level had no moment.

### Bumper Blitz (weakest)

- Plain circles on a purple disc with concentric rings. Pods have no vehicle shape, facing direction, suspension or exhaust.
- **Collisions:** no spark, squash or impact sound beyond one 120 Hz blip, and no screen shake.
- **Falling off:** a text overlay. There's no fall animation, splash or respawn effect.
- Power-ups and hazards are flat circles. The arena has no surroundings or crowd.
- **Fix:** move to a dedicated Canvas 2D renderer with sprites, tyre marks, dust and spark particles, impact squash, camera shake and an arena with lighting. Simulation stays on the server, and the client only interpolates and decorates.

### Token Trail

- The board is flat coloured squares in a 15×15 grid. It reads as a diagram, not an object.
- **Dice:** a static face inside a card.
- **Tokens:** they jump between squares without hopping along the path.
- **Captures:** the captured token disappears instead of being knocked home.
- **Fix:** a wooden or cloth board with depth, a pseudo-3D die (CSS 3D cube) that tumbles and settles on the face the server rolled, tokens hopping square by square, a capture knock-back arc, a shimmer on safe stars, and confetti on the home run.

### Cascade Solitaire

- Clean, but generic: white rectangles with a corner index on flat green felt, and the stock is a striped purple slab.
- Cards jump between piles. There's no dragging with a lifted shadow, no flip, and no dealing animation.
- **Fix:** proper card faces and backs, felt texture and vignette, a dealing sequence, a 3D flip with Y-rotation, drag with lift and tilt, spring settling on drop, and the classic cascading-cards finish.

### Mahjong Garden

- The tile faces are decent and the stacked depth reads. But the board sits in the same generic panel; the "garden" doesn't exist.
- Matches fade out without a lift or a pairing flourish, and there is no ambience.
- **Fix:** a garden scene (stone, water, drifting petals as ambient particles), tiles that lift on hover or selection, matched pairs that fly together and dissolve into petals, a chime palette, and a lantern-lit completion.

### Doodle Duel

- Functionally strong: it syncs drawing and guesses well. But strokes render as uniform polylines, and the room UI is generic.
- **Fix:**
  - Smoothed, pressure-like strokes with quadratic midpoint curves and line-width easing.
  - Paper texture on the canvas.
  - A countdown with a ticking clock.
  - Avatars that react to guesses.
  - A confetti burst and the word reveal on a correct guess.

### Color Clash

- The strongest existing game: original card art, and some motion on play.
- Dealing isn't animated, special cards have no effect moments, and wins and losses are text.
- **Fix:** a deal fan-out, each card flying to the pile with a spin, effect bursts per action card (skip, reverse, +2), a turn spotlight, and victory and defeat sequences.

## Platform

- **Thumbnails:** the games list uses gradient tiles with an emoji-like illustration, all in one style.
- **Fix:** each game's thumbnail should be cut from its own art (Kitchen Rush now has the art to do this) and share a common frame and type treatment.
- Profile, leaderboard, lobby and matchmaking screens are clean but generic. They come after the games, as planned.

## Order of work

1. **Kitchen Rush.** Done in this branch, for review.
2. Bumper Blitz.
3. Token Trail.
4. Cascade Solitaire.
5. Mahjong Garden.
6. Doodle Duel.
7. Color Clash.
8. Platform pages and thumbnails.

Each game is reviewed on its own before the next one starts.
