# Sinverse Cricket engine v2: fielding kinematics and ball ownership (proposal)

**Status: awaiting the owner's approval. Nothing here is implemented.** The presentation work so far changed only rendering and animation (`apps/web/src/games/sinverse-cricket/`). The engine (`packages/engines/src/sinverse-cricket/`), scores, digests and replays are unchanged.

## Why the engine is involved

Several things that look wrong on screen are decided by the engine, not the renderer. The renderer can disguise them, but it can't fix them without drawing players somewhere other than where the engine says they are. That would break replays and the ball's contact with players.

| What you see | Current engine behaviour (`physics.ts`) | Why rendering can't fix it |
|---|---|---|
| Fielders reach full speed almost at once, and stop dead | `moveFielder`: speed `f.speed × min(1, travel × 3)`, a ramp of about 0.33 s, then constant; it stops exactly at the target | Display positions must equal engine positions where the ball is collected |
| No slowing for turns | Movement is a straight line toward a moving target | The same |
| The ball snaps to the fielder on pickup | On collection, `pos = (chaser.x, 0.3, chaser.z)`; while held, `pos.y` is 0.4, then 0.9 for the last 10 ticks | The renderer now draws the ball in the hand, but the engine's ball still teleports, and replays and the camera follow the engine |
| Throws always go to one end | `throwTarget = (error, 0.35, STUMPS_Z)`, always the keeper's end | Choosing the end the batter is running to is a decision with scoring consequences |
| Pickup to throw is always 0.32 s | `throwAt = tick + 38` | A throw's timing affects run-outs |
| The receiver doesn't take the throw | After `throwEnd` the delivery finishes, or a direct hit gives a run-out; nobody gathers the ball | Ownership at the stumps affects run-outs |
| Catches are decided at a fixed reach | `gap < 0.85` (1.65 diving), probability from `skill` | Catch geometry decides wickets |

## Proposed behaviour (engine v2)

1. **Fielder kinematics.** Per fielder: acceleration (about 6 m/s²), deceleration (about 8 m/s²) and top speed (the current `speed`, from 6.6 to 7.2 m/s). Turning is limited by speed, with a curvature limit of about `a_lat / v²`, so a fielder slows to change direction sharply. Fielders run to a predicted interception point, not the ball's current or landing position.
2. **Pickup and release timing from the stance.** On collection the ball stays where it was gathered, not at the body's centre, and moves with the hand anchor the engine defines, such as an offset from the fielder's position and facing. The throw timing depends on whether the fielder was moving or set, from about 0.30 to 0.55 s, so a wind-up can be shown honestly.
3. **Throw target choice.** The fielder throws to the end the running batter is heading for, or to the keeper when no run is on. The trajectory uses a speed derived from skill and distance, as now.
4. **Receiver and ownership.** The keeper, or the bowler at the bowler's end, moves to take the throw. The ball becomes theirs on arrival. A run-out needs a take plus a break, or a direct hit as now. The ball has an owner state (`free`, `held:fielder`, `in-flight`) in the frame, so the renderer never guesses.
5. **Catch geometry.** Catch reach depends on the ball's height and the catcher's movement, with the dive window kept. The probabilities keep today's averages, so the game's difficulty doesn't shift.

## Replays and compatibility

- **Versioned engine.** `CricketConfig` gets an `engineVersion` field. Matches without it are v1 and replay with today's code, kept as a frozen `physics-v1.ts`, so every stored match, digest and leaderboard score still verifies. New matches record `engineVersion: 2`.
- **Server verification.** `packages/engines` `solo.ts` and the solo submit route pick the physics by `engineVersion`. Submitted v2 runs are re-simulated with v2 only.
- **Frames.** v2 adds owner and hand-anchor fields to `Frame`. The v1 renderer path ignores missing fields, so old replays render as today.
- **Determinism.** All new behaviour is integer-tick, seeded and free of floating-point order dependence beyond what v1 already has. New golden-digest tests pin a set of v2 deliveries, as the Cuisine Quest golden replays do.

## Testing

- **v1 regression.** Every existing engine test (439), database test (65) and Cricket browser test (56) must pass unchanged against v1.
- **Golden v1 corpus.** Record the digests of a few hundred v1 deliveries before the change. They must be identical after it.
- **v2 property tests:**
  - fielders never exceed their top speed or acceleration;
  - the turning radius respects the curvature limit;
  - the ball is always owned or in flight;
  - throws go to a running end;
  - run-outs need a take or a hit.
- **v2 balance.** Over 10,000 simulated deliveries per field setting, the run, wicket and boundary rates stay within ±5% of v1, so leaderboards stay comparable.
- **Rendering.** The renderer's ball presentation layer uses the v2 owner field directly. The existing bat contact, release and grip accuracy tests are extended to v2.

## Effort and risk

- **Effort.** About 2 to 3 focused days: the engine, versioning, server verification, tests and the renderer hook-up.
- **Risk.** Moderate, mainly game balance. It's contained by the versioning, because v1 matches can't change.
- **Approval needed for:** the `engineVersion` field; the v1 freeze; new frame fields; and changing new matches' outcomes and difficulty curve.
