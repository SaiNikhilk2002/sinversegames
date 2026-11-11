# Sinverse Cricket: Phase 5 (fielding, wicketkeeping, celebrations, broadcast presentation)

Branch `feature/unified-platform`. **Presentation only.** No change to the match engine (`packages/engines`), scoring, catch resolution, ball ownership, run-outs or replay events: `git diff` on `packages/` is empty. The engine decides every catch, pickup, throw, run-out and stumping on the tick it happens. This work makes the players look as if they caused it.

## 1. What was built

### Fielding (`fielding.ts`, new, pure)

**Anticipation.** A real fielder moves before the event; the engine decides it on the tick, so the ball is predicted forward from the current frame:
- **The ball:** gravity, a bounce and turf friction (the engine's own laws).
- **The fielder:** the chaser is moved the way the engine moves it. It runs toward the predicted landing point (88% of the carry), or straight at the ball once it has bounced, and only after the engine starts fielding (22 ticks after contact).
- **Pickup:** the hands, body and dive work toward the predicted pickup.
- **Catch:** the predicted window follows the engine's rules: dive reach 1.65 m, normal reach 0.85 m, and no catch once a struck ball has pitched.

Accuracy over 420 simulated deliveries: how far the hands' read was from where the engine actually took the ball (`e2e/cricket-fielding.spec.ts`):

| Take | Count | Median | 90th percentile |
|---|---|---|---|
| Ground pickups | 79 | 2.4 cm | 29 cm |
| Catches | 5 | 3.7 cm | 14 cm |
| Diving catches | 12 | 32 cm | 63 cm |
| Keeper collections | 287 | 6.4 cm | 13 cm |

The last few centimetres are closed over 0.12 s as the take happens, and hands never move faster than 9 m/s.

**Actions.** Each is chosen from the frame and the player, so replays play identically:

| Action | How it's shown |
|---|---|
| Ready stance and walk-in | Ring fielders start 1.2 m back and walk in with the bowler, landing exactly on their mark at release. Close fielders stay set |
| Anticipation | Hands and body go to the predicted take |
| Sprint, deceleration, turning | CC0 locomotion clips at the simulated speed, with turn lean and lead. The body steps into a take (display carry ≤ 0.6 m, ≤ 2.5 m/s) |
| Two-handed pickup | Knees bent, head over the ball, left foot leading |
| One-handed pickup | Running pickup, bent at the waist |
| Long stretch or slide pickup | When the engine's "dive" is a ground ball 0.7–1.1 m away |
| Low, chest and high catches | Hands to the predicted catch, giving with the ball |
| Leaping catch | CC0 `Jump_Start` timed to full stretch, then `Jump_Land` |
| Diving catch | Launch 0.24 s before the predicted catch, toward the ball. Recovery with the CC0 `LayToIdle` get-up |
| Boundary save | The chaser slides at a four as it crosses (`Slide_Start` / `Slide_Loop` / `Slide_Exit`) |
| Overarm throw | CC0 `OverhandThrow`, its release on the engine's throw tick |
| Underarm throw | Under 14 m; a procedural flick, also released on the throw tick |
| Kneeling throw | After a slide |
| Return to position | Fielders walk back to their marks once the ball is dead, facing where they're going |

**Feet.** Held poses plant their feet and take quick lifted steps (`StepFeet`) instead of sliding. This covers the keeper's shuffle, a fielder stepping into a take, and reactions. Running feet are pinned by the existing foot lock.

**Ball.** The ball is drawn into the hand from where it actually was (the engine snaps it onto the fielder), between both palms for two-handed and gloved takes.

**Spacing.** Nobody overlaps through real deliveries, walk-ins, takes and walk-backs (minimum centre gap 0.72 m, tested).

### Wicketkeeping

- **Crouch to collection.** A crouch behind the stumps, the shuffle across with planted steps, and a rise with the bounce.
- **The read.** The gloves go to the predicted line and height of the delivery: a median of 6.4 cm from the engine's take.
- **Collection styles.** Low (staying down, fingers to the turf) or high (risen), then the gloves give back toward the body.
- **Stumping.** The gloves gather, then sweep onto the bails; the bails fly when the gloves arrive (0.16 s), not before. Then the appeal and the celebration.
- **Run-out collection.** The keeper takes a throw at the stumps, or stands clear of a direct hit.
- **After the bat.** A dribbled edge, a bye or a catch behind: the keeper fields like anyone else.

### Celebrations and personality

- **Reactions** are in character for each role: bowler, keeper, the catcher, the thrower, team-mates, and both batters. They cover:
  - wickets
  - fours and sixes
  - lbw and stumping appeals
  - victory and defeat
- **Variety** comes from the player's number and the ball, so team-mates don't all do the same thing and a replay is identical.
- **CC0 clips now used:** `Yes` (fist pump and thumbs-up), `Idle_Talking_Loop` (a word in the huddle), `Idle_No_Loop` (head shake), `Idle_FoldArms_Loop`, `Jump_Start` and `Jump_Land`, `NinjaJump_Land`, and the slide clips.
- **Timing.** A player still busy with the ball (getting up after a dive) starts celebrating when they're free.
- **Restraint.** Nothing showy, and the dance clip is deliberately unused.

### Broadcast cameras (`director.ts`)

**New views:** Bowler run-up (alongside the bowler), Side-on bowling (square of the delivery stride), Fielding (beside and behind whoever is going for the ball, high enough that team-mates don't fill the frame), Stadium (slow high orbit), and a Match-result move around the players who decided it.

**Automatic director:**
- run-up camera before release
- fielding camera for a ground ball about to be fielded
- the ground from above during over and innings breaks
- the result move at the finish

**Replay director:** delivery, then the batting close-up, then the fielding, then the reaction.

**Cuts.** A change to a distant shot is now a cut, as on television, rather than a sweep across the ground. Nearby changes ease.

**Fixes from the footage:**
- **Replays now reach the dead ball.** Before, they stopped one frame short, so no replay ever showed a reaction or celebration.
- **The reaction camera finds a diving catcher.** It and the huddle used to pick the bowler.
- **The celebration camera sits higher and further back,** so arriving team-mates don't block it.

### Motion graphics (`broadcast.tsx`)

Cards appear only between deliveries, never over live play or replays: one event card and one lower third at most, and they leave on their own. Everything comes from the scorebook, or is measured from the simulated ball:

| Card | Content |
|---|---|
| Wicket | Batter, how out, runs (balls), fall of wicket |
| Four and six | The six shows how far it carried to the rope, measured from the frames |
| End of over | Every ball, the runs from the over, the score, the bowler's figures |
| New batter | Name, place in the order, team |
| Bowler into the attack | Name and figures |
| Score | The total ticks over when it changes |

The innings break and the result also show each innings' top scorer and best bowler. The existing ceremony (stadium, line-ups, captains, toss) is kept.

### Gameplay presentation fixes

- **The winning moment plays before the result card.** The card used to appear the instant the match ended and sat in the middle of the screen, over the players. It now waits 3.2 s (none with reduced motion) and is a lower third.
- **The batter acknowledges a boundary.** After holding the finish: a short fist pump for a four, the bat raised for a six.
- **End-of-over chips.** Dot balls were coloured as wickets; fixed.

- On short landscape phones the "LIVE DELIVERY" chip sat on the score panel; it now sits beside it.
- The render status sat under the collapsed controls button; it's now above it.

## 2. Evidence

### Footage

Real gameplay at 1920×1080, from controlled scenarios (`e2e/cricket-phase5-footage.spec.ts`). For each ball actually bowled, the engine is searched offline for inputs that give the wanted moment, robust to ±1 tick of jitter:
- the shot, footwork and bat face
- when to press Run

The shot is then played through the real controls, and the replay is filmed.

- **Contact sheets and full-resolution stills:** `artifacts/cricket-phase5/`
- **Videos and every-fourth-frame stills:** `.data/cricket-phase5/` (local, not committed)

The 18 required scenarios (all paths under `artifacts/cricket-phase5/` unless another folder is given):

| # | Scenario | Evidence | Verified by review |
|---|---|---|---|
| 1 | Fast bowling | `bowling/fast-seam-good-length-side.png`, `-behind.png`, `fast-inswing-yorker.png`, `slower-ball.png` | Yes |
| 2 | Spin bowling | `bowling/spin-legbreak.png`, `spin-googly.png`, `spin-offbreak-behind.png`, `-keeper.png` | Yes |
| 3 | Forward defence | `artifacts/cricket-batting/after/forward-defence-*.jpg` | Yes (Phase 4 footage) |
| 4 | Straight drive | `artifacts/cricket-batting/after/straight-drive-*.jpg` | Yes (Phase 4 footage) |
| 5 | Cover drive | `artifacts/cricket-batting/after/cover-drive-*.jpg` | Yes (Phase 4 footage) |
| 6 | Pull shot | `artifacts/cricket-batting/after/pull-shot-*.jpg` | Yes (Phase 4 footage) |
| 7 | Sweep | `artifacts/cricket-batting/after/sweep-*.jpg` | Yes (Phase 4 footage) |
| 8 | Sprinting fielder | `sprint-pickup-throw-director.jpg`, `-fielding.jpg` | Yes |
| 9 | Ground pickup | `stills/sprint-pickup-throw-moment.jpg` (crouched, both hands on the ball) | Yes |
| 10 | Overarm throw | `sprint-pickup-throw-fielding.jpg` (wind-up, release, follow-through) | Yes |
| 11 | High catch | `high-catch-fielding.jpg`, `-director.jpg`, `stills/high-catch-moment.jpg` | Yes |
| 12 | Diving catch | `diving-catch-fielding.jpg`, `-director.jpg` (dive, get-up, celebration) | Yes |
| 13 | Wicketkeeping | `keeper-take-keeper.jpg`, `-slip.jpg` | Yes |
| 14 | Stumping | `stumping-keeper.jpg`, `-director.jpg` | Yes |
| 15 | Run-out | `run-out-director.jpg`, `-keeper.jpg` | Yes |
| 16 | Wicket celebration | `diving-catch-director.jpg`, `stumping-director.jpg`, `run-out-director.jpg` (huddles) | Yes |
| 17 | Boundary celebration | `boundary-four-director.jpg` (the batter's acknowledgement), `graphics/six.jpg` | Yes |
| 18 | Match victory | `match-result.jpg`, `match-result.json`, `bowling/match-result.png` | Yes: the last wicket, the winners gathering and celebrating, and the result card |

- **Batting footage (3–7).** It was recorded in Phase 4. The batting code is unchanged since, so it wasn't re-filmed.
- **Live-play graphics.** `graphics/` holds the wicket, four, six, end-of-over, new-batter and bowler cards, captured as they appeared in live play.
- **Measurements at each take.** `phase5-log.json` and `phase5-log-sprint-pickup-throw.json` record, for each scenario:
  - the engine outcome
  - how far the hands' read was from the ball at the take, in the real renderer (1.5 cm to 12 cm on catches and keeper takes)
  - the closest two players came

**Before**, for comparison (Phase 3, `artifacts/cricket-motion/fielding-*`, `artifacts/cricket-footage/catch.png`, `run-out.png`): fielders picked up standing upright with the ball snapping to them, catches had no anticipation, and replays never showed reactions.

### Review findings fixed during this phase

Each of these was seen in the footage and fixed:

| Seen in the footage | Fix |
|---|---|
| Replays never reached the dead ball | They now end on it |
| Post-catch and post-throw poses froze | Ticks stop when the ball dies; take timing now continues in real time |
| A phantom dive at a ball the engine wouldn't let anyone catch | Fielding starts 22 ticks after contact; no catches after a bounce |
| The keeper's read polluted its own fielding | Separate glove read |
| Byes and leg byes weren't anticipated | They're now treated like fielded balls |
| A thrower stuck in the follow-through | Reactions take over from the throwing clip |
| A diving catcher who never celebrated | Reactions start when the player is free |
| The reaction camera and huddle went to the bowler on diving catches | Both now go to the catcher |
| The fielding camera was blocked or too wide | Raised, pulled back and tightened |

## 3. Performance

One real delivery replayed at 1× on each preset, 1280×800, in Chromium (`e2e/cricket-benchmark.spec.ts`). Budgets are unchanged, and the resource-budget tests are in the browser suite.

**RTX 3050 Laptop GPU (Direct3D 11), 16 logical cores:**

| Preset | Drawn fps | Frame interval median / p95 / max (ms) | Hitches > 50 ms | Draw CPU median (ms), Phase 4 → now | Draw calls | Triangles | JS heap (MB) | Preset load (s) |
|---|---|---|---|---|---|---|---|---|
| Low | 30 (capped by design) | 33.3 / 33.4 / 33.5 | 0 | 3.3 → 4.1 | 95 | 130,253 | 68.9 | 3.1 |
| Medium | 60 | 16.7 / 16.8 / 16.8 | 0 | 3.3 → 4.3 | 98 | 157,259 | 68.9 | 3.2 |
| High | 60 | 16.7 / 16.7 / 16.8 | 0 | 4.0 → 4.6 | 137 | 461,968 | 68.9 | 3.1 |
| Ultra | 59.4 | 16.7 / 16.8 / 116.7 | 1 | 4.2 → 4.8 | 154 | 575,486 | 68.9 | 3.2 |

- **Frame rates** are unchanged from Phase 4.
- **Draw CPU** rose by 0.6–1.0 ms a frame (the fielding plans and planted feet for eleven fielders), still under a third of a 60 fps frame.
- **JS heap** rose from 64.8 to 68.9 MB (the six extra clips).
- **Ultra** had one 117 ms hitch in 8 seconds.
- **First load:** start to the 3D ground took 2.0 s, and to realistic athletes with motion 2.3 s. Loading times have about 1 s resolution.

**SwiftShader (software rendering; a stand-in for a machine with no usable GPU, not a phone):**

| Preset | Drawn fps, Phase 4 → now | Frame interval p95 (ms) | Draw CPU median (ms) |
|---|---|---|---|
| Low | 27.5 → 23.1 | 83 | 7.8 |
| Medium | 11.0 → 9.1 | 200 | 8.2 |
| High | 4.6 → 4.5 | 433 | 10.1 |
| Ultra | 3.5 → 3.6 | 550 | 10.5 |

Low and Medium are 16–17% slower in software, which is the added CPU work showing where the CPU also rasterises. Auto graphics still steps down to Low there and on to Tactical 2D when Low can't hold up; that behaviour is unchanged.

No physical phone or tablet was tested, so nothing is claimed about mobile frame rates.

## 4. Tests

All run on the final code, on this machine, once (retries off).

| Check | Result |
|---|---|
| Production build (`pnpm build`: Prisma clients, Next.js, realtime) | Passed |
| Typecheck, all packages | Clean |
| Unit tests | 539 passed, 0 failed, 0 skipped: engines 446 (includes 7 new team-catalogue tests), realtime 61, shared 32 |
| Database tests (disposable local `*_test` databases) | 65 passed, 0 failed |
| Full browser suite | **166 passed, 0 failed, 9 skipped**. The 9 skipped are the on-demand evidence recorders and the benchmark, which run only with `CRICKET_EVIDENCE=1` and were run separately for this report |
| Cricket tests inside the suite | 86 passed |
| Performance and resource budget tests | Passed, with unchanged thresholds |
| Cloudflare/OpenNext build and packaging check | Passed on commit `635d4b5` in a clean Linux checkout: frozen install, config check, `cloudflare:build`, and `cloudflare:check`. Packaging was a dry run only (24.0 MB, 6.4 MB gzipped), with an invalid token and nothing uploaded |

**The cricket tests cover:**
- batting contact, bowling release, replay determinism and "presentation never changes the simulation"
- the fielding planner (7 tests)
- broadcast graphics (6 tests) and cameras (5 tests)
- responsive layouts

**The Chef Rivals reconnect test.**
- In Phase 4 it failed once under full-suite load. The cause was a race in the test: it reloaded the page before the server had acknowledged the player's action, so the restored kitchen correctly showed the step before.
- The test now waits for the acknowledgement (`data-pending="false"`) before reloading. No product code changed.
- It passed in this full-suite run.

## 5. Files changed

All under `apps/web/src/games/sinverse-cricket/` unless noted:

| File | Change |
|---|---|
| `fielding.ts` (new) | Ball and chaser prediction; fielder and keeper plans; reactions |
| `broadcast.tsx` (new) | Between-ball graphics |
| `scene.ts` | Applies the plans; display carry; planted feet; ball in the hands; reactions; camera cuts |
| `animation.ts` | New keyed poses (gather, reach, chest catch, kneel, underarm, keeper low/high, stumping) and `StepFeet` |
| `spacing.ts` | Walk-in, return to position, carries |
| `director.ts` | New cameras and automatic shots |
| `realistic.ts` | `reachHand` |
| `motion.ts` | New clip names |
| `cricket-game.tsx`, `cricket.css` | Graphics, the result card, replays reaching the dead ball, metrics for tests |
| `apps/web/public/sinverse-cricket/motion/ual1.glb`, `ual2.glb` | Six more CC0 clips (+390 KB) |
| `apps/web/e2e/` | `cricket-fielding`, `cricket-broadcast`, `cricket-cameras` and `cricket-phase5-footage` specs; benchmark loading time; the Chef Rivals test fix |
| `scripts/cricket-characters/` | Clip licences and the extraction commands |
| `docs/` | This report; the Engine V2 proposal update |

**Not changed:** `packages/engines/src/sinverse-cricket/` `physics.ts`, `match.ts`, `rules.ts`, `domain.ts` and `content.ts`, so the engine, scoring, catch resolution, ball ownership, replay event format and replay determinism are as they were. The only engine-package change on this branch after Phase 5 is the separate team catalogue (`teams.ts`), which is data the engine doesn't read (`docs/CRICKET_FORMATS_EXPANSION_PLAN.md`).

## 6. Engine boundary

Relay throws, throws to the bowler's end, real deceleration into a pickup, and boundary saves that keep the ball in all decide runs or wickets. They are engine work, documented with a compatibility and replay-determinism plan in `docs/CRICKET_ENGINE_V2_PROPOSAL.md`, and still need approval.

## 7. Limitations

- **The engine decides the take.** The chaser runs at constant speed until the pickup tick, and the ball is taken up to 1.1 m away (1.65 m for a diving catch). The body covers this with a short step and a reach, so long stretches (the pickup's 90th percentile is 29 cm of late correction) still look a little hurried. Real deceleration needs Engine V2.
- **Not possible without engine changes:**
  - **Relay throws.** Every throw goes to the keeper's end.
  - **A boundary save that keeps the ball in.** The slide at the rope is shown only when a four has already been given.
- **Rare scenarios.** Leaping catches and slide pickups depend on rare ball paths. They're covered by tests of the planner, but weren't captured in this footage run.
- **Scrubbing a paused replay.** Jumping straight onto a pickup frame can show the wind-up pose until it plays; playback is correct.
- **No fielding motion capture.** There's no cricket-specific mocap. Catches, pickups and keeping are procedural poses solved onto the ball, and the CC0 clips cover running, throwing, sliding, jumping, getting up and reactions.
- **Camera blocking.** In close-in celebrations a team-mate can still walk across the reaction camera for a moment.
- **Match-result footage.** It shows one finish, a win by runs with the last wicket bowled. A chase won with the bat was not filmed.
- **Graphics legibility.** The cards were checked at 1920×1080 and by layout rules for phones. They weren't reviewed on a physical phone.
