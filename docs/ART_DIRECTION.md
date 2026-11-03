# SinverseGames art direction

## Studio principles

1. **Every game is its own place.** A game is a world with a material, a light source and a palette, not a widget inside the site's chrome. The site frame is quiet so the games can be loud.
2. **State is shown, not written.** A burning patty smokes; an impatient guest taps their foot. Text is the back-up channel for accessibility, not the main one.
3. **Every action has an answer.** Each interaction gets a visual response (squash, lift, burst), a sound and, where it matters, a camera reaction, within one frame of input.
4. **Original, consistent art.** All art is hand-built vector (SVG) or procedural (Canvas). No emoji in game art, no stock illustration, and no unedited generated imagery. Each game keeps one outline weight and one shading model.
5. **Motion has weight.** Things land, bounce, settle and overshoot. Easing is per action:
   - springs for objects;
   - ease-out for UI entering;
   - ease-in for things leaving;
   - linear only for meters.
6. **Performance is part of quality.** The target is 60 fps on mid-range phones, with a lite mode that keeps all feedback but drops decorative loops on weak devices. Reduced-motion keeps every state change readable.

## Platform frame

- **Site chrome:** neutral dark ink (`#0b0a18`) with one brand accent. Typography is Outfit for display and Inter for UI.
- **Game surfaces:** each game owns its frame: border colour, corner radius and HUD material. The site doesn't impose its card style inside a game.
- **Thumbnails:** cut from each game's own art and framed identically, with the game's palette edge to edge. A game should be identifiable from the thumbnail alone.

## Per-game identity

| Game | World | Material and shading | Palette anchor | Signature motion | Sound palette |
| --- | --- | --- | --- | --- | --- |
| Kitchen Rush | Retro sunset diner | Thick ink outline (`#3a1d12`, 2.2–2.4 px), flat fill + one shadow + one highlight | Tomato `#e0533c`, teal `#2e8c8a`, cream `#fffaf0` | Squash-and-stretch, springy layers, rising smoke | Sizzle, fry, bells, cash register, swung diner loop |
| Bumper Blitz | Night-time neon arena on a rooftop | Glossy toy vehicles, rim light, additive glow | Hot pink, electric blue, asphalt | Drift, tyre marks, impact squash, shake | Engine hum, rubber thuds, crowd |
| Token Trail | Tabletop under a warm lamp | Painted wood, felt, soft contact shadows | Walnut, four saturated token colours | Tumbling die, hop-hop tokens, knock-back arcs | Wood clacks, dice rattle |
| Cascade Solitaire | Card-room felt | Paper cards with subtle grain, real drop shadows | Deep green felt, ivory, crimson | Deal fan, 3D flip, lift-and-tilt drag | Card slides, soft snaps |
| Mahjong Garden | Quiet stone garden at dusk | Bone-and-jade tiles with bevels, painted backdrop | Jade, ink, blossom pink | Tile lift, paired flight, petal dissolve | Chimes, water, wind |
| Doodle Duel | Sketchbook on a desk | Paper texture, marker strokes | Paper white, marker primaries | Live ink, reveal wipe, reaction pops | Marker squeaks, page flips |
| Color Clash | Glossy game table | Bold card art, specular sheen | The four card colours on dark wood | Card fly-and-spin, effect bursts | Card snaps, punchy stingers |

## Animation system

Per-game technology choices. Nothing new is installed unless a game needs it.

| Layer | Technology | Used for |
| --- | --- | --- |
| Characters, equipment, one-shot reactions | CSS keyframes on SVG groups (transform and opacity only) | Blinking, breathing, foot-tap, flipping, chopping, walking in and out |
| Object motion between places | `motion` (already a dependency) | Flights, spring-in layers, banners, overlays |
| Particles | Hand-written Canvas 2D layer (`kitchen-rush/fx.ts`): one canvas, one rAF loop that sleeps when idle, DOM-anchored emitters | Smoke, steam, sparks, crumbs, coins, confetti |
| Camera | Web Animations API on the scene element | Shake on mistakes, intro dolly |
| Fast real-time scenes | Canvas 2D (planned for Bumper Blitz) | Sprites, trails, lighting |

**Libraries considered and rejected:**
- **PixiJS or Phaser** (~400–1000 KB): would replace React rendering for little gain in tap-based games. They may be reconsidered for Bumper Blitz only if Canvas 2D can't hold 60 fps.
- **Lottie and Rive:** need an authoring pipeline and runtime for assets we can draw directly.

**Rules every game follows:**
- **Presentation never drives game state.** Animations read the engine state and never write it. In multiplayer games the server stays authoritative and clients only interpolate.
- **Interruptible.** One-shot animations are keyed to the state that triggers them, so a new state restarts or replaces them cleanly. Pausing stops the clock, particles and audio together.
- **Graceful fallback.** A frame-time sampler switches to lite mode when frames keep running over 28 ms. Reduced motion (OS setting or the in-app toggle) removes animated movement but keeps colour, icon and text cues.

## Audio system

`apps/web/src/lib/sound.ts`, Web Audio only, so every sound is synthesised and original.

- **Buses:** master, then **effects** (following *Effects volume*) and **music** (following *Music volume* and the *Music* switch). Both are adjustable live in Settings and from in-game buttons.
- **One-shots:** filtered-noise bursts and tone stacks.
- **Loops:** noise textures whose loudness the game sets every frame (sizzle, fry, simmer, room tone).
- **Music:** a small step sequencer plays original loops.
- Nothing plays before the first interaction, as browsers require. Music stops on pause, quit and shift end.

## Asset licensing

All art and audio in this repository are original works created for SinverseGames: hand-written SVG, Canvas drawing code and synthesised audio. No third-party images, fonts beyond the two Google Fonts already in use (Outfit and Inter, both under the SIL Open Font License), sound files or generated imagery are included.
