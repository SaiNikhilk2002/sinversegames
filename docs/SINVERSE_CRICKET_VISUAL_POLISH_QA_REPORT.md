# Sinverse Cricket visual polish: QA report

Date: 2026-11-05. All browser evidence is real gameplay in headless Chromium using SwiftShader, a software GPU. **No physical phone, tablet or hardware GPU was tested.** Frame rates here are not hardware frame rates, and no 60 FPS or console-quality claim is made.

Status labels used throughout:

- **Verified**: implemented and verified by a test or by reviewing a real captured frame.
- **Not physically verified**: implemented and exercised in the browser, but needs a person, real speakers or a real device to judge.
- **Partial**: some of the request is done, and the gap is named.
- **Not implemented**: not done.

## 1. Initial Git state

Branch `codex/takeover-and-reliability-audit`, HEAD `4ad166b`, in sync with origin and clean. `AGENTS.md` and `CLAUDE.md` were byte-identical.

## 2. Codex work inspected

Codex's playable cricket vertical slice (`c01a8b4`), Player Identity (`fed214f`, `53b2851`) and the first Cloudflare Preview change (`920b22d`) were inspected and preserved. Identity was already accepted, so it was not re-implemented. The simulation, rules, scoring, server verification, rewards and platform integration stayed in place. `scene.ts` was rewritten behind its existing driver interface, so `tactical.ts` needed no change.

## 3. Visual benchmark

The benchmark was general broadcast cricket presentation: readable players, a full stadium, television camera angles and event replays. No game's assets, likenesses or layouts were copied. The result is **stylised procedural art with a coherent rig**. It is clearly better than the baseline, but it is not photoreal and not console quality. Faces are simple, there is no cloth simulation or motion capture, and hands are mitten-like.

## 4. Character quality

| Item | Status |
| --- | --- |
| One skinned mesh per player, with weighted rings, proportions and shoes | Verified, frames and unit tests |
| Helmet, cap, sun hat, hair, beard, pads, gloves, bat | Verified in frames |
| Names and numbers on shirts, fictional kit only | Verified in frames |
| Hash-based variety in skin, hair and build | Verified by unit test |
| No real likeness, official kit or logo | Verified by review of the generated content; legal clearance is not implied |
| Detailed faces, fingers, cloth | Not implemented |

## 5. Rig and animation

Two-bone IK drives hands and feet from pose channels. Clips crossfade over 0.16 s. All selection logic is pure and unit tested.

Measured on a real ball in the real renderer by scrubbing the replay to the exact ticks ([data](../artifacts/cricket-polish/contact-accuracy.json)):

| Measure | Result | Test limit |
| --- | --- | --- |
| Bat sweet spot to ball at contact | 0.000 m | under 0.10 m |
| Bowling hand to simulated release point | 0.000 m | under 0.12 m |
| Hands to bat handle | 0.001 m | under 0.05 m |
| Planted bowler foot slip | 0.000 m | under 0.02 m |

The zeros partly reflect design: the rig is steered onto the simulated point near those moments, by moving the hips for contact and the body for release. They show agreement with the simulation, not that the motion looks natural. Two real defects were found this way and fixed: slow frame rates moved the visual contact point, and the original test passed vacuously on blank metrics. It now fails if a metric is missing.

## 6. Batting and bowling

- **Verified in frames:** ready stance, backlift, lofted drive contact and follow-through; run-up, gather and delivery with the hand at the release point.
- **Verified by unit test:** stance, guard, shot-specific impact and follow-through for all eight shot kinds, leave, beaten, front and back foot, and the order of bound, back foot, front foot and release for fast, medium and spin.
- **Not physically verified:** whether each shot looks right at full speed. Most frames reviewed were lofted shots. Cut, pull and sweep were tested by pose, and were not each reviewed on screen.
- **Verified:** release stays aligned to the unchanged `RELEASE_TICK` of 100.
- **Partial:** left-handed batters and bowlers are not modelled.

## 7. Fielding and keeping

- **Verified in real frames:** set fielders, keeper stance and position, fielders moving to the ball and diving, bowled, caught and LBW results, and player reactions.
- **Implemented, not seen in a reviewed frame:** high catches, stumping and run-out reactions, chosen from the simulated fielder action. The retained frames also do not isolate the moment the keeper's gloves take the ball.
- **Partial:** keeper wide and diving takes, relay throws and boundary saves reuse the general catch, throw and dive clips. They have no dedicated animation.

## 8. Stadium

- **Verified in frames:** pitch with wear and footmarks, mown outfield, rope, boards, stands with roofs, floodlights, sightscreens, scoreboard showing the live score, pavilion, tunnels, and two distinct grounds (Lantern Oval, Tideglass Park with sea).
- **Verified:** day, evening and night lighting; crowd reaction is driven only by real events (unit test).
- **Verified in the Low tier:** crowd is about 500 instanced figures over a painted stand, moved in a vertex shader.
- **Limit:** seen closely, the crowd is low-poly shapes, and the seat texture can shimmer at distance.
- **Not implemented:** dedicated walkways. The stands have tier bands and tunnel mouths only.

## 9. Camera

Eleven camera views: broadcast, batter end, bowler end, side, behind batter, keeper, slip, boundary, aerial, ball tracking, and a replay director. Damped motion is frame-rate independent.

- **Verified by unit test:** tracks a struck ball, hands over to the rope, a six ends on the rope and then the batter, each dismissal gets its own shot only after the engine confirms it, a chosen camera is respected, and the camera stays over the ground.
- **Verified in the browser:** every camera renders, and switching it does not change the match.
- **Limit:** following a very high six, a fixed broadcast view can spend moments looking mostly at sky and roof.

## 10. Audio

Added original synthesised edge, block, glove, pickup, board, crowd swell, groan and appeal sounds, on top of bat, stumps and footsteps. Crowd level follows real events. Existing volume settings and the gesture unlock for autoplay rules still apply.

**Not physically verified:** the event wiring runs without error, but nobody has listened to these sounds on speakers, so quality and balance are unjudged. Umpire voice is not implemented. No recordings were used.

## 11. Performance

Measured on the same PC, the same day, in the same production mode, at 1280 × 900 with SwiftShader, before the toss ([after](../artifacts/cricket-polish/render-performance.json), [before](../artifacts/cricket-polish/baseline-same-day.json)):

| Quality | Draw calls before → after | Triangles before → after | Median frame interval before → after |
| --- | ---: | ---: | ---: |
| Low | 434 → 45 | 29,894 → 44,254 | 133.3 → **83.3 ms** (better) |
| Medium | 434 → 45 | 40,894 → 84,018 | 166.6 → **200.0 ms** (20% worse) |
| High | 460 → 57 | 60,094 → 137,118 | 300.0 → **266.7 ms** (better) |
| Ultra | 460 → 66 | 82,094 → 228,678 | 316.7 → **400.0 ms** (26% worse) |

- The figures in the older visual review (66.6, 83.3, 133.4 and 150 ms) came from different machine conditions, so they are not directly comparable. The original was re-measured for that reason. Before the re-measurement, the new renderer appeared 2 to 3 times slower.
- **Medium and Ultra are slower than before on a software GPU**, while drawing much richer scenes. All these frame rates, roughly 2.5 to 12 FPS, are far below playable targets, on any quality. Real GPUs should behave very differently, but that remains unmeasured.
- Script time is about 3 ms a frame, down from 5 to 8 ms. Almost all the remaining cost is pixel fill in the software rasteriser. Grass, sky and horizon were the largest measured items.
- Changes driven by those measurements: Lambert shading on stadium surfaces below Ultra, sky drawn last so hidden pixels are skipped, reduced anisotropy, a rendered-width cap for each quality, plain PCF shadows below Ultra, and fewer shadow receivers.
- The renderer chunk grew from 577,750 to 637,245 bytes (161,522 gzip). It still loads only when a 3D match opens.
- **Memory:** a 14-minute session with 4 matches and 38 balls, with video and screenshots, held renderer private memory at about 204 to 211 MB and JS heap at about 13 to 17 MB, with no crash ([log](../artifacts/cricket-polish/memory-14min-sustained.log)). This shows no leak in that window, not that no leak exists. Earlier runs reporting "page crashed" coincided with my own shell timeout of about 9.5 minutes, and the crash did not recur without it. That cause is very likely, not proven.

## 12. Mobile

Measured in Chromium device emulation ([data](../artifacts/cricket-polish/render-performance.json), [screens](../artifacts/cricket-polish/mobile/)):

| Viewport | Horizontal overflow | Primary button (top to bottom) |
| --- | ---: | --- |
| 320 × 640 | 0 | 556 to 598 |
| 360 × 780 | 0 | 699 to 741 |
| 390 × 844 | 0 | 763 to 805 |
| 430 × 932 | 0 | 851 to 893 |
| 844 × 390 landscape | 0 | 327 to 373, previously cut off at 429, now fixed |
| 768 × 1024 tablet | 0 | 932 to 978 |
| 1280 × 800 | 0 | 708 to 754 |

Screens under 640 px wide default to Low. The tactical 2D view remains the fallback, and its score no longer sits under the camera selector. No explicit safe-area padding was added: the game relies on the browser keeping the page inside the safe area, which needs checking on a notched phone.

**No physical devices were tested.** Before relying on this, try on real hardware:

1. Low-end Android, mid-range Android, a recent iPhone, an iPad, and one desktop with integrated graphics.
2. Note FPS in the footer at Low and Medium during live play, and whether Auto steps down and stays stable.
3. Play a full match in portrait and landscape: check thumb reach, the notch and home-bar safe areas, and that no control is hidden.
4. Check swing timing feel, since touch latency is unmeasured.
5. Lock the phone and switch apps mid-ball: the match should pause and resume correctly, including after a lost WebGL context.
6. Play for 15 minutes and note heat, battery drain and any browser reload.
7. Listen on the speaker and on headphones: check balance, and that nothing plays before the first tap.

## 13. Quality preset results

Low, Medium, High and Ultra are explicit configurations, with an optional Auto mode that uses hysteresis. Auto is **unit tested only**: it was not observed settling during real play. Switching Low, Medium, High, Ultra and back to Low returned to identical texture (31) and geometry (36) counts ([data](../artifacts/cricket-polish/quality-resources.json)). Comparison images: [quality folder](../artifacts/cricket-polish/quality/).

## 14. Exact test counts

| Suite | Result |
| --- | --- |
| Typechecks | 5 of 5 packages pass |
| Unit and integration | 235 pass (shared 11, engines 184, realtime 40) |
| PostgreSQL, local `_test` databases | 50 pass in 4 files |
| Browser, full suite on the production build | **64 pass, 1 skipped, 0 fail**, 21.9 minutes |

The skipped test is the on-demand evidence capture, which passed separately twice. New browser tests: 23 cricket-visual and 3 Cloudflare config. Other browser files, all passing: cricket 3, Cuisine Quest 4, Color Clash 2, Doodle Duel 1, expansion 2, identity 3, identity outage 1, multiplayer 3, platform 5, reliability 8, solo games 6. No test was weakened. Identity browser tests used the documented local fixture provider, not real Google sign-in.

Gameplay regression coverage: identical digest and outcome with frame capture, slow motion and varied frame rates; an independent engine model agrees with the on-screen score across Low, Ultra, Tactical and Medium; replay, scrub, camera change, pause and skip do not alter match state; nothing loads from other hosts.

## 15. Production build

`pnpm build` on Node 24.14.0 passes.

## 16. OpenNext packaging and the Cloudflare bug

**Cause.** The first fix put `previews` in `apps/web/wrangler.jsonc`, but the dashboard's `npx wrangler preview` runs at the repository root, where no config existed. Wrangler 4.157.0's source raises this error only when the loaded config has no `previews` key.

**Fix.** A root `wrangler.jsonc` describes the same Worker, `cf:build` also prepares the prerender cache, and a test keeps the configs in step.

| Check, isolated Linux copy, no env files, Node 24.14.0, pnpm 11.15.1, frozen lockfile | Result |
| --- | --- |
| `pnpm cloudflare:build` | Pass, worker emitted, 41 prerender cache files |
| `pnpm cloudflare:preview:check`, pinned Wrangler 4.155.0, dry run | Pass, 23,213 KiB, 6,163 KiB gzip |
| `wrangler@4.157.0 deploy --dry-run` from the root | Pass, same payload |
| `wrangler@4.157.0 preview` from the root with a deliberately invalid token | Passes the config check and reaches the Previews API, which rejects the token |

**Not proven on Cloudflare.** No valid credential was used, nothing was published, and the exact original message could not be reproduced locally, because without the config the invalid token fails at an earlier API call. The fix is confirmed only by a real Workers Build after a push. Also still unverified: the name of the Worker connected in the dashboard, and Preview-only secrets.

## 17. Screenshots and clips

| Required | File, under `artifacts/cricket-polish/` |
| --- | --- |
| Main stadium | `gameplay/01-main-stadium.png` |
| Batter ready | `gameplay/02-batter-ready.png` |
| Bowler run-up, gather | `gameplay/ball-four-runup.png`, `ball-four-gather.png` |
| Delivery release | `gameplay/ball-four-release.png`, `ball-four-release-behind.png` |
| Bat contact | `gameplay/ball-four-contact.png`, `ball-four-contact-side.png` |
| Actual six | `bowling/bowling-1-contact.png`, `bowling-1-field.png`, and in `gameplay-bowling.webm` |
| Actual four | `gameplay/ball-four-*.png` |
| Wickets | `gameplay/ball-wicket-*.png` (caught); bowling innings also had bowled and LBW |
| Keeper, stance and position; the take itself is not isolated | `bowling/bowling-6-keeper-take.png`, `bowling-6-keeper-side.png` |
| Fielder catch or stop | `gameplay/ball-wicket-end.png`, `bowling/bowling-*-field.png` |
| Replay | Any `ball-*` frame shows the controls |
| Scorecard, result | `bowling/scorecard.png`, `bowling/match-result.png` |
| Mobile tactical | `mobile/390x844-tactical-live.png` |
| Quality, lighting, venue, cameras | `quality/` |
| Gameplay clips, no audio | `gameplay-batting.webm`, `gameplay-bowling.webm` |

Clips show software-GPU frame rates, not the intended experience.

## 18. Before and after

Before: [`artifacts/cricket/`](../artifacts/cricket/) (for example `high-stadium.png`, `batting-live.png`, `replay-side.png`). After: `artifacts/cricket-polish/`. Numbers are in section 11. The biggest visible gains are the players, the bat being held and actually meeting the ball, and a full stadium. The clearest loss is Medium and Ultra speed on a software GPU.

## 19. Physical device verification

None. No phone, tablet or hardware GPU was tested, and nobody has listened to the audio.

## 20. Limitations

- Stylised art with simple faces, no motion capture or cloth; left-handed players are not modelled.
- Low frame rates on software GPUs on every setting, and Medium and Ultra are slower there than the baseline.
- Stumping, run-out, high catch, relay and boundary-save visuals were not seen in a captured frame.
- The retained six frames are from the AI batting in the same renderer. The human batter's six in the bowling-focused run appears only in `gameplay-bowling.webm`; frames of an earlier human six came from a superseded build and were replaced.
- Most contact frames are lofted shots.
- Evidence adds about 67 MB to the repository's local history.
- Requested but not implemented: umpire voice, dedicated walkways, dedicated keeper wide and diving, relay and boundary-save clips, and a separate celebration camera beyond the director's reaction shots.

## 21. Exact changed files

Implementation and fix commits:

- `apps/web/src/games/sinverse-cricket/animation.ts`, `character.ts`, `director.ts`, `stadium.ts` (new)
- `apps/web/src/games/sinverse-cricket/scene.ts`, `cricket-game.tsx`, `cricket.css`
- `apps/web/src/lib/sound.ts`
- `packages/engines/src/sinverse-cricket/physics.ts`: exports `SHOT_HEIGHTS`, and adds a presentation-only `contactPoint`, outside the digest
- `apps/web/e2e/cricket-visual.spec.ts`, `cricket-evidence.spec.ts`, `cloudflare-config.spec.ts` (new)
- `wrangler.jsonc` (new), `apps/web/package.json`
- `artifacts/cricket-polish/` (new)

Documentation commit: this report, the other cricket docs, `DEPLOYMENT.md`, `docs/CLOUDFLARE_PREVIEW_QA_REPORT.md`, `AGENTS.md`, `CLAUDE.md`.

Toolyaro, production data, DNS and secrets were not touched. The lockfile is unchanged.

## 22. Git

Branch `codex/takeover-and-reliability-audit`, starting from `4ad166b`.

- `c4bf3c1` feat: raise Sinverse Cricket visual fidelity without changing play
- `bea2ce9` fix: make bare wrangler preview work from the repository root
- A following local commit records this documentation.

Nothing was pushed, merged or deployed.
