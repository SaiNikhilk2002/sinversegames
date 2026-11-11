# Sinverse Cricket: Phase 6 (interactive batting, cinematic catches, presentation and performance)

Branch `feature/unified-platform`, starting from `5d4e78b`. Committed locally and **not pushed** (this phase's brief doesn't authorise a push).

**Presentation and client only.** The authoritative engine, scoring, catch resolution, ball ownership, replay format and verification are unchanged: `git diff` on `packages/engines/src/sinverse-cricket/{physics,match,rules,domain,content}.ts` is empty.

## 1. What was done

### Interactive batting: the shot selector (`shots.ts`, `ShotBar` in `cricket-game.tsx`)

**The shot book.** There are 20 shots in 7 families. The player picks one, and it's played only when they press to play it. Nothing chooses a shot for them.

| Family | Shots |
|---|---|
| Defend | Forward defence, back-foot defence, leave |
| Drives | Straight, off and on drives |
| Off side | Cover drive, cut, late cut |
| Leg side | Flick, leg glance, pull, hook |
| Lofted | Lofted straight, lofted cover, lofted on side |
| Sweeps | Sweep, reverse sweep, paddle sweep |
| Special | Slog (all-out attack) |

- **Engine inputs.** Each shot is a preset of the engine's existing shot input (kind, aim, footwork, power). The engine still decides contact, edges, carry and catches, so a lofted shot isn't a guaranteed boundary, and a mistimed one can still be caught.
- **"Leave".** A press during the ball doesn't swing. A deliberate swipe gesture still plays its shot.

**A distinct stroke for every shot.**
- Four new procedural strokes were added in `batting.ts`: lofted cover drive, lofted on drive, paddle sweep and slog. With them, all 20 choices map to 20 different animations, which a test checks.
- Every stroke keeps the Phase 4 guarantees, tested across all of them:
  - the bat's sweet spot meets the engine's contact point
  - hands stay on the handle
  - planted feet stay still
  - the head stays steady
  - shapes are distinct

**Controls.**
- **Keyboard:** 1–7 pick a family, the same key again steps through it, and Space plays. Arrows, Shift and Ctrl work as before.
- **Mouse:** a family tab, then a shot chip.
- **Touch:** 40 px targets; swipe gestures work as before.
- **Accessibility:** tabs and radios are labelled, with focus outlines.

**What it shows.** The selected shot, its footwork (front foot, back foot or stays put), ground or air, the aim, and a one-line read of the delivery it suits (for example "Short, chest high" for the pull). The read is context only, never a recommendation.

**Where it sits.** Below the field, so it never covers the ball or the batter (a browser test checks this). The fine controls (aim, power, footwork, bat face) are folded behind "More control"; they used to spill below the bar even when folded.

**Timing.** The press still sets the shot tick, and the engine measures timing as before: early, late, pure contact or an edge.
- The batting animation follows the engine's result: contact on the contact tick, an edge with a jarred finish, a miss or beaten.
- The release-to-arrival flight cue stays as the timing indicator.

### Cinematic diving catches

**When it triggers.** The scene flags a big catch when a fielder is predicted to:
- dive (full extension),
- leap, or
- take a catch near the rope (over 85% of the way out)

with their hands committed to the ball. It also stays on for 0.9 s after a caught dismissal, through the landing.

**What happens:**
- The presentation slows to 35%, easing in and out over about 0.12 s.
- The automatic and replay directors cut to a catching camera: low, about 5 m to the side, with the launch and the hands against the sky.
- Afterwards, normal speed and the reaction shots resume.

**Simulation untouched.** Slow motion stretches wall-clock time only: the game steps the same ticks, so outcomes, digests and replays are identical (the existing presentation-invariance test still passes). It's computed from the frames, so replays slow down the same way.

**Ordinary catches stay at normal speed**, and so does reduced motion.

**A dropped catch shows the drop.** Slow motion begins before the engine decides. If the engine says the catch failed, the hands go to the ball and the ball deflects away (the engine's "drop"); the animation never shows a catch the engine didn't give.

**Evidence:** `artifacts/cricket-phase6/diving-catch-director.jpg`, `-fielding.jpg`, `high-catch-*.jpg`, with video in `.data/cricket-phase6/`. The director sheet shows the catching camera through the launch, full horizontal extension and take, in slow motion, then the landing, get-up and celebration.

### Bowling and ball presentation

- **Speed gun.** After each ball, the live chip shows the measured release speed (km/h, from the recorded frames just after release) and the delivery's name (Inswinger, Leg-break and so on). Both are known once it's been bowled, so nothing hidden is revealed before the batter plays.
- **Seam and spin.** Pace comes out with backspin and an upright seam, spin rotates about the line of flight, and the ball tumbles off the bat. Previously every ball spun identically. This is visual only; the trajectory is still the engine's, and swing and turn are the engine's own movement.

### UI clean-up

- **The batting intent box** no longer repeats the shot (the bar shows it); it keeps the timing cue.
- **The fine controls** stay folded until asked for, instead of spilling below the bar.
- **Evidence.** `artifacts/cricket-phase6/ui/` shows desktop (1920×1080) and phone (390×844 portrait, 844×390 landscape), each between balls, during a live delivery and after the ball. For before, compare `artifacts/cricket-phase5/graphics/*.jpg` and `artifacts/cricket-2/regression/*.png`, which have no shot bar, plus the shot select and sliders.

### Performance

- **The cause.** The fielding planner built an input object, two closures and a plan for each of 11 fielders, every frame. Now:
  - only fielders on the ball (and the keeper) are planned
  - the closures are made once
  - idle fielders share one frozen plan
- **The result:** the Ultra hitch is gone, and software-rendering speed is back to Phase 4 levels. See section 3.

## 2. Evidence index

| Item | Path |
|---|---|
| Diving and high catches, slow motion and catching camera | `artifacts/cricket-phase6/*.jpg`, `artifacts/cricket-phase6/stills/` |
| Batting interface, desktop and phones | `artifacts/cricket-phase6/ui/` |
| Earlier fielding, keeping, bowling and celebrations (unchanged code paths) | `artifacts/cricket-phase5/` |
| Batting strokes (Phase 4; the new strokes are covered by rig tests) | `artifacts/cricket-batting/after/` |
| Benchmarks | `artifacts/cricket-benchmark/benchmark.json`, `benchmark-software.json` |

## 3. Performance

Same replayed delivery, 1280×800 (`e2e/cricket-benchmark.spec.ts`). Budgets are unchanged.

**RTX 3050 Laptop GPU (Direct3D 11):**

| Preset | fps | Frame interval p95 / max (ms) | Hitches > 50 ms | Draw CPU median, Phase 5 → Phase 6 (ms) |
|---|---|---|---|---|
| Low | 30 (capped) | 33.4 / 33.5 | 0 | 4.1 → 4.0 |
| Medium | 60 | 16.8 / 16.8 | 0 | 4.3 → 3.9 |
| High | 60 | 16.7 / 16.8 | 0 | 4.6 → 4.6 |
| Ultra | 60 | 16.7 / **16.8** (was 116.7) | **0** (was 1) | 4.8 → 4.9 |

**SwiftShader (software rendering; a stand-in for a machine with no usable GPU):**

| Preset | fps, Phase 4 → Phase 5 → Phase 6 | Draw CPU median, Phase 5 → Phase 6 (ms) |
|---|---|---|
| Low | 27.5 → 23.1 → **27.7** | 7.8 → 7.1 |
| Medium | 11.0 → 9.1 → **10.3** | 8.2 → 7.4 |
| High | 4.6 → 4.5 → 5.1 | 10.1 → 9.2 |
| Ultra | 3.5 → 3.6 → 4.3 | 10.5 → 9.2 |

- **JS heap.** It read 92.9 MB in the GPU run against 57.5 MB in the software run, from one sample each. Garbage-collection timing makes single readings unreliable, so no conclusion is drawn.
- **Resource budgets.** The existing tests (repeated matches, presets and re-entry staying bounded) pass in the browser suite.
- **No phone was tested.**

## 4. Tests

REGRESSION

## 5. Deliberately not done, and why

| Asked for | Status |
|---|---|
| New faces, hair, facial hair, clothing folds, per-player proportions | **Not done.** The athletes are built offline from MakeHuman CC0 assets with Blender (`scripts/cricket-characters`). Changing faces and bodies means rebuilding and re-validating the 12 model files and their rigs, a separate asset pass. Players already differ by model (six athletes, two detail levels), batting style and movement cadence |
| Motion matching | Not introduced. The existing state-driven blend (clips by speed, plus a planned pose and IK) covers the movements without a new framework |
| Backward tracking catches, running boundary catches, one-handed catches as separate animations | Partly covered: catches are posed onto the ball whatever the direction, and leaps and dives go toward it. No dedicated backward or one-handed take clips; the free CC0 libraries have none |
| Boundary saves that keep the ball in, relay throws, real deceleration | Engine work (scoring and run-outs), proposed in `docs/CRICKET_ENGINE_V2_PROPOSAL.md`; still awaiting approval |
| Red and pink balls, formats | Need the formats work (engine version 2), awaiting approval (`docs/CRICKET_FORMATS_EXPANSION_PLAN.md`) |
| Stadium geometry, grass, ambient occlusion, crowd | Not changed this phase. The existing presets render at 60 fps; new effects weren't added without a measured visible benefit |
| Training-mode pitch maps and swing lines | Not done; they need a training mode, which doesn't exist yet |
| New audio | Not changed (the existing crowd swells already follow real events) |

**Engine changes deliberately excluded.** The engine exposes the shot kind, aim, footwork, power, bat face and press tick, which was enough for all 20 shots. No engine change was needed.

## 6. Known defects and limitations

- **Shots by name.** The slog, lofted on side and lofted straight are separate presets of the engine's single "loft" kind with different aims. Their results differ by aim and power only, as the engine allows.
- **Slow motion can start for a catch that is then dropped.** It's triggered by the prediction, before the engine decides. The drop is shown honestly, but the slow motion has already begun.
- **The phone-portrait shot bar** takes about 120 px under the field, so the field is shorter on narrow phones.
- **Dropped and boundary catches weren't filmed** in this phase.
- **Carried over from Phase 5:** relay throws, boundary saves and hurried long stretches (engine-bound).

## 7. Files changed

| File | Change |
|---|---|
| `apps/web/src/games/sinverse-cricket/shots.ts` (new) | Shot book, families, keyboard stepping, delivery read |
| `batting.ts` | Lofted cover, lofted on, paddle sweep and slog strokes; their mapping |
| `cricket-game.tsx` | Shot bar; Leave; family keys; slow-motion pace; speed read; decluttered intent box |
| `cricket.css` | Shot bar; folded fine controls; speed read |
| `scene.ts` | Big-catch detection and `cinematic()`; seam rotation; per-frame allocation cuts |
| `director.ts` | Catching camera |
| `fielding.ts` | Shared idle plan |
| `tactical.ts` | `cinematic()` |
| `apps/web/e2e/` | `cricket-shots.spec.ts` (7 tests); `cricket-shotbar.spec.ts` (browser); the new strokes in `cricket-batting.spec.ts`; the UI capture in `cricket-phase5-footage.spec.ts`; the benchmark expands controls before choosing a shot |
| `docs/SINVERSE_CRICKET_PHASE6_REPORT.md` | This report |
