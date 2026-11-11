# Sinverse Cricket — Phase 4: realistic batting animation

Branch `feature/unified-platform`. Presentation layer only: no Engine V2 work, and no change to
scoring, catch resolution, ball ownership or replay event structures. Nothing pushed, merged or deployed.

## 1. Audit of the old batting system

The old code (`animation.ts` `batPose` + `applyShotBody` in `scene.ts`) had five problems, all visible in the
"before" footage (`artifacts/cricket-batting/before/`):

| Problem | Effect on screen |
|---|---|
| Body snapped into the shot shape over 8 ticks | Whole-body "pop" at the press, no preparation |
| Bat path was a chord through three keyframes, and the bat was moved onto the ball at contact | Bat teleported to the ball; contact looked exact only because it was forced |
| Front foot moved with the hips | Visible foot sliding on every stride |
| Head fixed at 1.15 m, not tracking the ball | Statue-like head; no watching the ball onto the bat |
| One pose set for every batter | Every batter identical |

The old system also had no closeup camera, no distinct back-foot or special strokes (sweep, pull and cut shared shapes), and no
visual distinction between clean contact, edges and misses.

## 2. What was built

### Shots (15 strokes + leave)

`batting.ts` `battingShot(plan)` maps the engine's existing shot input (kind, direction, footwork) to a visual stroke.
The engine's input is unchanged; the mapping only chooses an animation:

| Engine kind | Visual stroke |
|---|---|
| `defend` | forward defence; back-foot defence when footwork < −0.05; leg glance when aimed fine (< −75°) |
| `straight` | straight drive; off drive (aim > 14°); on drive (aim < −14°) |
| `cover` | cover drive |
| `on-drive` | on drive; flick (< −40°); glance (< −75°) |
| `pull` | pull; hook when aimed ≤ −85° |
| `cut` | square cut; late cut when aimed > 100° |
| `sweep` | sweep; reverse sweep when aimed > 20° |
| `loft` | lofted drive |
| no shot | leave (bat lifted high, out of the line) |

Contact kinds drawn: clean, inside edge, outside edge, miss and beaten. They are read from the engine's own result (`edge`, the
contact point against the bat line); the animation never decides them.

### Phases of every stroke

1. **Guard and stance:** set back from the crease. Per-batter width, crouch, openness and bat tap.
2. **Trigger:** none, back-and-across, or a small forward press. Chosen per batter.
3. **Backlift:** the height and gully angle vary per batter. The batter holds a ready position (anticipation) until the shot
   is committed.
4. **Stride and weight transfer:** the front foot lands where the engine's contact is. The weight and body bend arrive
   0.06 s before contact, and planted feet never move.
5. **Downswing:** a two-segment pendulum. The arms swing about the lead shoulder, and the bat swings about the wrists.
   The arms lead and the wrists release late, so the bat accelerates *through* the ball.
6. **Contact:** the sweet spot is pinned to the engine's impact point. On an edge it is offset by 5.5 cm to the inside or
   outside, and the bat jars on the follow-through.
7. **Follow-through:** the finish is specific to each shot: high for the loft, around the body for the pull and hook,
   checked for defence, and low for the sweep. It varies per batter.

Head: a look-at that follows the bowler's hand, then the ball, then the contact point, with the eyes kept level.

### Architecture

- `src/games/sinverse-cricket/batting.ts` (new, ~600 lines) is a pure function
  `batting(input, outPose) → { bat, shot, phase }`. It has no engine imports beyond types and no randomness.
  The same input always gives the same pose, so replays are deterministic. `batterStyle(seed)` derives individuality
  from the batter's number and team.
- `scene.ts` `strikerFrame()` builds the input from the delivery feed:
  - the plan
  - the shot tick
  - the engine contact tick, or an estimate of arrival from the measured approach speed or replay frames
  - the impact point in rig space
  - the contact kind
  - the look target and the style

  The old `applyShotBody`, `batPose` and `IMPACT_TICKS` were removed.
- `character.ts`: the hand IK now solves the forearm and hand as one segment in a single exact step. The old
  iteration could flip the elbow and open grip gaps of up to 14.6 cm. This applies to all actors.
- `director.ts`: a new **Batting close-up** camera (side-on from point). The replay director now cuts from a
  delivery shot over the bowler's arm, to the close-up through contact (held 0.45 s), to ball tracking.
  Boundaries keep their existing tracking shots.
- `cricket-game.tsx`: the replay feed supplies arrival tick and pass lateral (cached per delivery).

## 3. Contact accuracy

The rig measures, at the engine's contact tick, the distance between the bat's sweet spot and the engine contact point
(`data-contact-error`), and the gap between each hand and the handle (`data-grip-error`). Values are in metres.

| Scenario (real gameplay) | Engine outcome | Contact tick | Contact error | Grip error |
|---|---|---|---|---|
| Forward defence | dot, clean | 163 | 0.000 | 0.000 |
| Straight drive | dot, clean | 208 | 0.000 | 0.000 |
| Cover drive | dot, clean | 164 | 0.000 | 0.000 |
| Lofted drive | **six**, clean | 164 | 0.000 | 0.000 |
| Sweep | dot, clean | 208 | 0.000 | 0.000 |
| Pull | dot, clean | 212 | 0.000 | 0.000 |
| Edged delivery | edge | 209 | 0.003 (edge point, 5.5 cm off the sweet spot) | 0.000 |
| Missed delivery | miss (bat 0.46 m off the line) | — | n/a | 0.000 |
| Leave | no shot | — | n/a | 0.000 |

These are produced by controlled scenarios. For each real ball bowled, the engine is searched offline for a shot that
yields the wanted outcome, robust to ±1 tick of press jitter. The shot is then played through the real UI controls, and
the engine result is checked against the scenario.

Unit-level guarantees (`e2e/cricket-batting.spec.ts`, 12 tests):
- the sweet spot is within 3 cm of impact across shots and styles
- hands stay on the handle for 400 styles
- the bat never passes through the body
- planted feet never move
- the head travels less than 16 cm
- every shot is distinct (minimum pairwise pose distance > 0.25)
- the bat path bows (> 12 cm) and accelerates into contact (> 1.2× the speed six ticks earlier)
- correct edge and late-press behaviour

**Engine invariance:** no engine file changed. Replay determinism and bowling release tests pass.
The animation reads engine results and never writes them.

## 4. Footage

At 1920×1080 the evidence is:
- a contact still
- a 0.5× close-up film
- a 1× director film

Paths:
- Contact sheets: `artifacts/cricket-batting/{before,after}/<scenario>-{closeup,director}.jpg`
- Contact stills: `artifacts/cricket-batting/{before,after}/stills/<scenario>-contact.jpg`
- Videos and every-fourth-frame stills: `.data/cricket-batting/{before,after}/` (local, untracked)
- Logs with engine outcome, contact tick and accuracy: `artifacts/cricket-batting/{before,after}/batting-log*.json`
- Recorder: `CRICKET_EVIDENCE=1 CRICKET_BATTING_PHASE=after pnpm exec playwright test e2e/cricket-batting-footage.spec.ts`
  (`CRICKET_BATTING_ONLY=pull-shot` films one scenario). On balls no scenario can use, the recorder leaves once (filmed as the leave)
  and defends after that, so the innings lasts until each wanted ball arrives. The pull was filmed in a second, pull-only run,
  because the first run's AI bowler produced no short ball before the innings ended.

Footage review of the "after" run, judged at full resolution:

| Shot | Review |
|---|---|
| Forward defence | Long stride to the pitch; bat and pad together; head over the front knee; a short checked finish |
| Drives | Backlift, then stride, then the arms leading the bat. Contact under the eyes and a high finish; the cover drive opens the shoulders |
| Lofted drive | Higher backlift, contact slightly ahead, and a full high finish |
| Pull | Weight back, the body rotating through the line, and the bat finishing around the shoulder |
| Sweep | Front knee down to the pitch, a flat bat sweeping across the line, and the head down |
| Edge | Contact on the bat's edge; the follow-through jars short |
| Miss and leave | The bat passes outside the line, or is lifted clear |

Problems the footage exposed and fixes made during this phase:
- **Stride overshoot.** Strides overshot contact because the stance was centred on the crease. Fixed by setting the
  stance back.
- **Bat slowing into the ball.** Fixed with accelerating swing curves.
- **Head bobbing in defence.** Fixed by settling the body early and easing the reach in.
- **Grip gaps in pull finishes.** Fixed by the IK change above.
- **Bat stalling mid-air.** Fixed with a longer anticipation hold.
- **Backlift too vertical, finishes too high.** Retuned.
- **Delivery shot blocked.** The non-striker blocked the replay delivery shot; the camera was moved.

Remaining visual notes: the fixed close-up camera is placed at point, so a fielder running to a cover-region ball can
cross it after the shot. The director has cut away by then.

## 5. Remaining procedural animation

All batting is procedural: there are no motion-capture clips. The free CC0 animation libraries the project uses contain no
cricket strokes, and nothing was purchased. The IK-driven procedural system gives exact contact alignment, which canned
clips would not. Fielding, running and bowling are unchanged from Phase 3.

## 6. Performance

Same replayed delivery. Budgets were unchanged and all passed. Results on an RTX 3050 (d3d11):

| Preset | Drawn fps | Draw CPU median (ms) | Phase 3 draw CPU (ms) |
|---|---|---|---|
| Low | 30 (capped) | 3.3 | 3.6 |
| Medium | 60 | 3.3 | 3.8 |
| High | 59.5 | 4.0 | 4.4 |
| Ultra | 60 | 4.2 | 4.7 |

Results on SwiftShader (software):

| Preset | Drawn fps | Phase 3 fps |
|---|---|---|
| Low | 27.5 | 26.1 |
| Medium | 11.0 | 9.8 |
| High | 4.6 | 5.1 |
| Ultra | 3.5 | 3.9 |

The batting solve costs well under a millisecond, and draw CPU on the GPU path went slightly down. Software results are
within run-to-run noise.

## 7. Regression

| Suite | Result |
|---|---|
| Batting rig tests (`e2e/cricket-batting.spec.ts`) | 12/12 pass |
| Animation, director, bowling release, bat contact, replay determinism (`cricket-visual.spec.ts` and the cricket specs) | pass |
| Benchmarks, GPU and SwiftShader, all four presets, unchanged budgets | pass |
| Full browser suite (one run, retries off) | 147 passed, 6 skipped (evidence-only), 1 failed |
| The one failure: `chef-multiplayer` "Chef Rivals fits a phone, and reconnecting restores the kitchen" | Unrelated to cricket (no Cuisine code changed). It timed out waiting for the kitchen guide after a reload; rerun alone 3×, it passed 3/3. A timing flake under full-suite load |
| Typecheck (all packages) | clean |
| Unit tests | engines 439, realtime 61, shared 32: all pass |
| Engine and realtime source | no changes (`git diff` on `packages/` and `apps/realtime` is empty) |

Regenerated tracked screenshots from the suite (`artifacts/cricket-2`) were backed up and restored to their committed versions.

## 8. Limitations

- **Live versus replay anticipation.** In a live human-batted ball, the press reveals the shot only about 8 ticks
  before contact. The batter holds a neutral ready position until then, and the downswing is compressed. Replays and AI
  batters know the shot and get the full preparation. The shot is never guessed ahead of the press, which would leak
  the input.
- **Extreme finishes.** Some extreme finishes (hook, reverse sweep) reach the arm-length limit of the IK, so the elbow
  straightens fully.
- **Edges and misses are inferred.** The engine reports `edge` and the contact point, but not which edge. Inside versus
  outside is inferred from the contact point against the bat line.
- **No mocap.** Movement quality is procedural; it does not match motion-captured strokes.
- **Fixed close-up camera.** Fielders can cross it after the shot.
