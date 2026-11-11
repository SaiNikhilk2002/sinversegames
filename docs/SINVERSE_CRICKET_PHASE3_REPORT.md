# Sinverse Cricket Phase 3: realism report

All Phase 3 work is presentation only: `apps/web/src/games/sinverse-cricket/` and on-demand evidence specs. The engine (`packages/engines/src/sinverse-cricket/`), scores, digests and replays are unchanged. Engine changes are set out in `CRICKET_ENGINE_V2_PROPOSAL.md`, which is awaiting approval and is not implemented. All assets are free CC0 assets (see `scripts/cricket-characters/LICENSES.md`).

## Delivered

| Area | What changed | Commit |
|---|---|---|
| Running and throwing | CC0 Quaternius UAL clips retargeted onto the realistic athletes. Locomotion blends walk, jog and sprint at the engine's speed. Throws are timed to the engine's release tick. The ball is drawn in the hand while held. | d16c597 |
| Foot slip | Foot locking with recent-low contact detection. Planted-foot speed relative to body speed fell from 58% (walk) to 0, 1, 5 and 1% at 1.4, 3.5, 5.5 and 7 m/s. | e16ace9 |
| Stride and turns | Strides lengthen past the cadence cap. Head and chest lead into turns, and the body leans with turn rate. | e16ace9 |
| Variety | Deterministic per-player cadence, arm carriage and idle phase | e16ace9 |
| Get-up and celebration | LayToIdle after a dive. Yes (thumbs-up) for the non-striker after a boundary. | e16ace9 |
| Replay strip | Fades back (to 14% opacity, after 1.6 s) while a replay plays, so close cameras show the stride and stumps. Hover or keyboard focus (`:focus-visible`) restores it; a mouse click on Play doesn't hold it open. Touch screens and reduced motion keep it fully shown. `cricket.spec.ts` checks both branches. | this change |
| Benchmark | `data-draws` and `data-draw-ms` on the match root, plus `e2e/cricket-benchmark.spec.ts` | this change |

## Real gameplay footage

`e2e/cricket-gameplay-footage.spec.ts` runs on demand (`CRICKET_EVIDENCE=1`). It plays real balls through the real controls, then records each replay at 1x from the actual match screen. Contact sheets are in `artifacts/cricket-footage/`; WebM files and full-size stills are written to the git-ignored `.data/cricket-footage/`.

| Scenario | Evidence |
|---|---|
| Straight drive and running between wickets | `drive-and-run` |
| Cover drive, pickup and overarm throw | `cover-drive-fielded-and-thrown` |
| Pull | `pull-shot` |
| Catch | `catch` |
| Run-out | `run-out` |
| Boundary and non-striker celebration | `boundary` |
| Fast bowling: seam on a good length (behind and side-on cameras) | `fast-seam-good-length-*` |
| Fast bowling: inswinging yorker (batter camera) | `fast-inswing-yorker` |
| Spin: off-break (behind and keeper cameras) | `spin-offbreak-*` |
| Spin: leg-break and googly (behind and bowler-end cameras) | `spin-legbreak`, `spin-googly` |
| Slower ball (broadcast camera) | `slower-ball` |
| Keeper standing up to spin | `spin-offbreak-keeper` |
| Match result after a full chase | `match-result.png` |

The bowling test bowls six deliveries with the Variation, Line and Length controls, then bats out the chase. Each run gets a new seed, so outcomes differ between runs. In the committed run, the leg-break bowled the batter, the googly and the slower ball were caught, and the match was tied (`bowling-log.json`).

The batting test asks the engine for a shot that gives each scenario. If no shot gives it with the run's seed, that scenario is logged as not found rather than faked. The latest run (`footage-log-run2.json`) found no catch or boundary. Their contact sheets come from the earlier run, which `footage-log.json` documents.

Not yet captured as a dedicated clip: a diving catch, a sprint isolated from other action, and a wicket celebration distinct from the boundary acknowledgement. Diving catches depend on the engine's fixed catch reach, so finding one on demand is part of the engine v2 work.

## Performance benchmarks

`e2e/cricket-benchmark.spec.ts` runs on demand. Every preset plays the same real delivery's replay at 1x at 1280x800, sampling at least 8 s of draws:
- **Draw interval** is what a viewer sees.
- **Draw CPU time** covers animation, scene sync and command submission. GPU time is not included.

The game draws at most every 15 ms, or every 30 ms on Low, by design. Numbers vary by machine and run; they are recorded, not asserted. Resource budgets are asserted separately in `cricket-visual.spec.ts`, and are unchanged.

**RTX 3050 laptop GPU (Direct3D 11), 60 Hz** (`artifacts/cricket-benchmark/benchmark.json`):

| Preset | Drawn fps | Interval median / p99 / max (ms) | Draw CPU median / p95 (ms) | Draw calls | Triangles |
|---|---|---|---|---|---|
| Low | 30 (cap) | 33.3 / 33.4 / 33.5 | 3.6 / 4.2 | 94 | 130k |
| Medium | 60 | 16.7 / 16.8 / 16.8 | 3.8 / 4.2 | 89 | 157k |
| High | 60 | 16.7 / 16.8 / 16.8 | 4.4 / 4.9 | 131 | 462k |
| Ultra | 60 | 16.7 / 16.8 / 16.8 | 4.7 / 5.2 | 149 | 575k |

Every preset holds the display rate with no draw over 50 ms.

**SwiftShader software GPU**, a stand-in for weak hardware (`CRICKET_BENCH_SOFTWARE=1`, `benchmark-software.json`):

| Preset | Drawn fps | Interval median / p95 (ms) | Draws over 50 ms |
|---|---|---|---|
| Low | 26.1 | 33.3 / 66.7 | 19 |
| Medium | 9.8 | 83.4 / 216.6 | 70 |
| High | 5.1 | 183.4 / 433.3 | 33 |
| Ultra | 3.9 | 233.3 / 533.4 | 27 |

On software rendering, fill rate dominates. Low renders at a device pixel ratio of 0.75, so it has about 56% of Medium's pixels. Auto graphics, the default, steps down to Low on such hardware. CPU cost per draw is 6.4 to 8.8 ms here, so the CPU isn't the limit.

A vsync-off run was tried and rejected. With vsync off, every preset drew at about 43 fps with identical intervals, because Chromium's own frame pacing interacted with the game's draw cap and hid the differences between presets.

No physical phone, tablet or console has been measured.

## Limits

- Everything is presentation only. Fielder acceleration, interception paths, ball ownership, throw-end choice and catch geometry are engine behaviour and wait on the engine v2 approval.
- The batting animation library is still the procedural rig's shots. There are no new CC0 batting clips, because the free libraries have no cricket strokes.
- Footage is captured on the real GPU at about 20 frames per second (the screenshot rate) and replayed at real timing. It is not a 60 fps screen recording.
