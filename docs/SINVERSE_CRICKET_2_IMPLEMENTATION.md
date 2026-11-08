# Sinverse Cricket 2.0 implementation and validation

Completed locally 2026-11-06. Base `2bdbbd4`; clean checkout; work branch `feature/sinverse-cricket-2`. The existing PR branch and commits are preserved. Root AGENTS.md and CLAUDE.md remain byte-identical to their initial contents, as requested. No push, merge, deployment, production migration, external service provisioning or Toolyaro change was performed.

## Audit before implementation

- `/play/sinverse-cricket` uses the existing solo registry, signed run/start/submit and shared progression. Cricket is solo, server replay verified; synchronous cricket multiplayer is not implemented. Realtime room boundaries must remain untouched.
- `CricketMatch` owns seeded toss, AI, innings and input logs. `Delivery` owns 120 Hz physics, contact, field interception, catches/throws, digest and outcomes. Preserve both unchanged.
- `cricket-game.tsx` couples four shortcut keys to click-oriented selects/ranges. Live shot selection is effectively locked; mobile offers buttons rather than a direction/timing gesture. Bowling preparation freezes the bowler until the meter is committed.
- Toss is a static DOM symbol with a preselected call/decision and instant result. There is no airborne choice window, 3D coin, captain staging or separate winner decision.
- The existing character system already has a weighted skeleton, two-bone IK, planted feet, bat grip/contact alignment and style-specific delivery clips. A 15 m fast run-up compressed into 100 simulation ticks looks implausibly fast. Preserve release tick/position and stretch presentation time only.
- Camera direction, real-frame replays, quality governor, instanced crowd, resource disposal, safe areas and synthesized event audio already work. Keep them and add a pre-match director and run-up tracking.
- Wicket logic selects one looping jumping clip for most actors. Replace this with finite, grounded reactions selected by dismissal and role, plus gathering/walk-back presentation independent of physics.
- Earlier evidence and QA correctly describe stylized procedural art and software-GPU limits. Preserve historical artifacts; collect new evidence under `artifacts/cricket-2`.

## Testable milestones

1. Pure input intent mapping, configurable keyboard bindings, live direction/footwork/intent, gamepad axes, pointer-captured swipe/tap bowling and batting with cancellation.
2. Pure toss timeline with choice lock, interruption-safe clock, skip, actual seeded face/orientation, separate decision, captains and field entrance.
3. Plausible presentation duration for run-up; delivery from the existing hand/release point, live batting preparation, timing/release cues, continuous batting cadence with manual option.
4. Grounded finite dismissal/role reactions, dive recovery, teammate gathering and dismissed batter walk-back.
5. Pure cinematic camera shots, smooth active-play handover, event-only synthesized toss/release/announcement cues and connected transition graphics.
6. Stadium-led HUD and setup redesign, compact shortcuts and optional assist controls, responsive gesture surfaces, adaptive quality, browser measurements and full regressions.

## Validation contract

Use Node 24.14.0 and pnpm 11.15.1. Explicit loopback DATABASE_URL for every build/test/server. Never read or print the active .env. Add pure behavioral and real-browser tests for input conflicts, cancellation, timing, toss, transitions, reactions and replay/digest isolation. Run existing cricket and relevant platform suites, typechecks and production builds. Review actual captured browser frames. Physical GPU/device and audio-listening quality cannot be claimed from emulation.

Results below describe implemented behavior and actual checks. The remaining art, audio and physical-device limits are explicit; this is not a claim of console-level realism.

## Implemented behavior

### Inputs and continuous play

`input.ts` is a pure intent layer. Keyboard arrows change aim and front/back foot live until the shot commits. Digits 1–8 select the existing eight shot families or bowling variations. Shift selects loft, Ctrl defence, Q/E adjust power/pace, V cycles variation, R runs, P replays, C changes camera, Escape pauses. Bindings are remappable with duplicate/reserved-key rejection and persisted locally. Editable widgets, native button activation and browser shortcuts retain their own input.

The playing surface captures touch pointers. Swipe direction, distance and duration map into existing direction/power/foot/shot fields. A tap defends; a fast long swipe lofts. Bowling swipes set line/length/pace and begin the approach; the next tap commits release timing. Wrong/stale pointers, cancellation, lost capture, additional touches, pause, blur and hidden tabs cancel pending gestures. Sensitivity is adjustable and assist controls provide button/range alternatives. A gamepad stick controls aim/footwork or bowling aim; the existing A/B/X/Start actions remain. Hardware gamepad use is unverified.

Batting deliveries and innings breaks progress automatically after actual outcomes and reactions, with a manual-flow option. Replays remain skippable, scrub existing frames and return to the match when finished in continuous mode. Bowling still waits for the player's preparation/release input. The setup and pause panel explain controls.

### Ceremony

`ceremony.ts` owns only a presentation timeline: establishing view, lineup, captains, coin in hand, flight, landing, reveal, decision, field entry. The airborne choice is explicitly locked. If no call is made, the coin holds altitude and keeps rotating; there is no silent default or revealed result. Pause freezes the clock. Skip advances the presentation while preserving the required choice and decision. H/T call the face, B/O choose bat/bowl, and touch buttons offer the same flow.

`ceremony-scene.ts` constructs a real 52 mm cylinder with separate original heads/tails textures, a metallic edge and rim. Its actual upper face agrees with the existing match's seeded result: +Y heads, inverted cylinder tails. Flight rotation is independent of the result; landing aligns to it only after the call. The camera moves close to the physically sized coin. Captains use fielding rigs without batting pads, acknowledge the decision and yield to players walking the last steps into their positions. The opponent's choice still comes from `CricketMatch.toss`, rather than a presentation-side random decision. The ceremony waits for its renderer to be ready.

The result is deterministic, not a cryptographic hidden-coin protocol. This remains the existing solo game, not a newly implemented authoritative multiplayer toss.

### Animation and direction

The approach plays at 0.28 times simulation speed until the unchanged release tick 100. Root motion accelerates off the mark; stride planting, style-specific gather, bowling hand alignment and follow-through use the existing rig and IK. The bowling release meter runs during the visible approach. On commit, pre-release ticks are stepped by the unchanged engine before continuing from the same visible position. The physics trajectory, release point and digest format are unchanged.

Batting preparation previews the current footwork; committed animation still follows the real shot, timing and contact point. The flight cue shows the actual ball's progress toward the crease. Grounded finite wicket reactions replace the looping jump: bowler fist reaction, catch show, acknowledgement, appeal then salute, and direct-hit reaction. Catch-show/ball attachment requires an actual confirmed catch. Teammates gather, the dismissed batter walks away, and a dive has a recovery clip. These are visual positions only; actual fielder interception and scoring remain in the engine.

The camera tracks a live run-up and settles before release. Idle play uses a working view. Selected camera preferences still win, and reduced motion uses a fixed working camera. Confirmed wickets can cut smoothly from the dismissal to the actual reaction actor. Original synthesized toss, landing, announcement-motif and release sounds use the existing mute, volume and gesture-unlock system. A musical cue is not spoken commentary.

### Presentation and resource handling

The setup has a matchday masthead, fixture preview and control primer. The match uses a floating scoreboard, brass/cream accents, compact shortcuts, intent feedback, actual-event boundary/wicket/over graphics and a larger stadium area. Kits use the original teams' brighter primary colors and dark panels; night fill/sky/key light were adjusted. Short team codes and safe-area padding keep narrow layouts readable. The tactical renderer shares the HUD rather than painting a second overlapping score.

No new rendering dependency, model, texture download or audio recording is introduced. Coin/captain resources use the existing scene traversal disposal. Auto graphics starts enabled, explicit presets disable it, and coarse-pointer displays start on Low, including landscape. Existing instanced crowds, quality limits, reduced motion and frame-independent camera damping remain.

## Scope and integrity

- Engine, shared protocol, database schema/repositories, realtime service, identity, Sin Coins, achievements and progression source files are unchanged.
- Client input logs contain the original toss/ball fields only. Camera, ceremony, UI, animation and quality data are never added to a digest or submitted score.
- Original routes and formats remain; no production data or migrations were touched. Only the four existing migrations were applied to a newly created local `sinversegames_cricket2_test` cluster on loopback port 5438.
- Previous screenshots and videos remain intact. Cricket tests now write new evidence to `artifacts/cricket-2/`.

## Final validation ledger

| Check | Result |
| --- | --- |
| Frozen install, Node 24.14.0 / pnpm 11.15.1 | Pass; lockfile unchanged |
| Platform unit/integration | 263 pass: shared 32, engines 184, realtime 47 |
| Local PostgreSQL integration | 60 pass in five files, including cricket result/reward verification |
| New pure presentation/input tests | 10 pass |
| New gameplay browser cases | Five pass: 3D toss/pause/call lock/entry, keyboard match plus server verification, native touch swipe/cancel/bowling/batting, binding conflicts/persistence, synthetic standard gamepad |
| All cricket Playwright checks | All 42 distinct cases passed across the final 41-pass run and focused correction of the remaining renderer re-entry fixture; includes pure checks as well as real-browser cases |
| Strengthened live mobile/controller checks | Both pass again; wait in the actual live delivery window and assert a shot committed, rather than only checking selected intent |
| Five-package typecheck | Pass, including the final evidence-helper changes |
| Node production build | Pass on the final application source; later changes affect tests, documentation and evidence only |
| Non-cricket browser regression | All 55 cases pass in the whole-platform run |
| On-demand gameplay recording | Pass separately, 4.5 minutes; complete match, six/four/caught wicket/dot, bowling and keeper takes; zero page errors |
| Whitespace and preservation checks | Pass; protected source paths, lockfile, instruction files and earlier artifacts unchanged |

Retained diagnostics: the first realtime test attempt used the isolated database URL before its server existed, causing 30 handshake failures; the same suite passed after the cluster was started/migrated. An inferred callback return type and a CDP touch-event union type each failed TypeScript checks and were corrected. The initial graphics lifecycle check compared captain close-ups against the full XI, so lazily uploaded resources decreased (30 to 16); its setup now completes the ceremony and compares the same full-field phase, preserving the exact resource-equality and budget assertions.

The first broad browser run also found an automation race: entry can finish while a slow GPU processes a click on its skip button. The helper now waits for the real entry state to complete instead of clicking a control that may already have unmounted. No product simulation or scoring assertion was bypassed. The re-entry resource test compares a new Low renderer created after the ceremony, with the aerial camera selected before renderer creation, the same batting role and the same view history. Optional intro views and roles upload different textures lazily. Exact resource-count equality remains required; tolerances and rendering budgets were not relaxed.

Small-screen QA also found that hiding a keyboard hint changed a button's accessible name. Toss choices/decisions now have explicit stable labels independent of visible hints. The runtime now requires H/T, an explicit touch choice, or gamepad D-pad left/right; action/skip cannot silently select Heads. A/B choose bat/bowl on a standard controller. A synthetic browser gamepad fixture checks these mappings; it is not a physical controller test. Portrait chase feedback retains the actual required runs/balls when the desktop target column is hidden.

First whole-platform Playwright run: **90 passed, six cricket failures, one on-demand evidence capture skipped**, 39.6 minutes. All **55 non-cricket cases passed**, including the real seven-cuisine campaign, identity/email fixture flows, economy, multiplayer, recovery, API failures and original solo games. The six failures were the resource comparisons, transient entry-skip automation and viewport-dependent choice names described above. A first focused rerun passed 40 of 41 cases. After adding the gamepad case, the final focused suite passed **41 of 42** in 11.2 minutes, retaining the re-entry fixture discrepancy. The strengthened touch/controller cases then both passed; the corrected re-entry fixture finally passed separately in 40.6 seconds. Thus every distinct cricket case has a passing final result, but there was **no single subsequent all-platform or 42-case green run**. Original failures remain in ignored local logs under `.data/cricket-2`.

The first on-demand recording was interrupted gracefully after its helper tried to click “Pause replay” on an already finished replay. The retry disables automatic replays for capture, opens real recorded-frame replays manually and pauses only when that control exists. It passed with no page errors. Partial first-attempt frames/video were archived in ignored local storage; published evidence in the new gameplay directory belongs to the successful capture. No browser was killed by a shell timeout.

### Measured rendering and alignment

These are live-delivery Chromium **SwiftShader software-GPU** measurements, not physical hardware classes. The two desktop profiles share a 1280×800 viewport; the mobile profile uses a smaller 844×390 landscape viewport and 4× CPU throttling. Pixel area, DPR, scene and machine load affect the results. They are not a before/after benchmark, nor evidence that mobile hardware is faster.

| Profile | Median / p95 frame time | Draw calls | Triangles | Textures / geometries | DPR |
| --- | --- | --- | --- | --- | --- |
| Desktop Low | 50.0 / 66.6 ms | 45 | 44,254 | 36 / 40 | 0.75 |
| Desktop Medium | 133.3 / 150.0 ms | 44 | 83,970 | 37 / 41 | 1 |
| Mobile landscape Low, CPU 4× | 33.3 / 50.1 ms | 45 | 44,254 | 36 / 40 | 1 |

Raw data: [measurements](../artifacts/cricket-2/performance/measurements.json), with actual scene captures in that directory. The existing Low rendering budgets remain below 120 draw calls, 250,000 triangles and 45 textures. Same-phase Low→Ultra→Low checks return to the same resources, including the final 31 textures / 36 geometries lifecycle snapshot; that is a separate scene phase from the live-delivery measurements above. Renderer removal/re-entry and WebGL loss fallback also pass.

The replay pose fixture measures 0 m bat/contact alignment error, 0 m visual-hand/release error, 0.002 m grip error and 0 m planted-foot slip in its sampled cases. [Raw alignment data](../artifacts/cricket-2/visual-regression/contact-accuracy.json). The rig deliberately steers alignment to the known simulated contact/release, so these figures establish attachment consistency, not natural motion or realism. Physical-device frame rate, animation perception and input latency remain unverified.

## Evidence and visual review

All links below point to actual local browser output under the new `artifacts/cricket-2` directory. Earlier `artifacts/cricket` and `artifacts/cricket-polish` content remains intact. The [evidence index](../artifacts/cricket-2/README.md) identifies capture tests and what each artifact proves.

| Review | Evidence and observed result |
| --- | --- |
| Setup and identity | [Match setup](../artifacts/cricket-2/00-match-setup.png): new fixture/matchday layout and short input primer |
| 3D toss | [Coin in hand](../artifacts/cricket-2/01-coin-in-hand.png), [airborne](../artifacts/cricket-2/02-coin-airborne.png), [landed](../artifacts/cricket-2/03-coin-landed.png), [captain decision](../artifacts/cricket-2/04-captains-decision.png): real cylinder, separate faces, close framing and explicit choice/decision |
| Ceremony movement | [Toss and field entry video](../artifacts/cricket-2/toss-and-entry.webm): 29.32 seconds, 1280×800; actual browser capture, not a promotional render |
| Working HUD | [Ready HUD](../artifacts/cricket-2/05-ready-hud.png): working camera settled with batter and keeper visible; floating score and compact controls |
| Bowling and contact | [Run-up](../artifacts/cricket-2/gameplay/ball-six-runup.png), [release](../artifacts/cricket-2/gameplay/ball-six-release.png), [actual contact](../artifacts/cricket-2/gameplay/ball-four-contact.png): real replay frames and cameras; ball/contact remain engine-driven |
| Boundary and wicket | [Six flight](../artifacts/cricket-2/gameplay/ball-six-flight.png), [caught reaction](../artifacts/cricket-2/gameplay/result-wicket-reaction.png): actual events and grounded role-based presentation; characters remain visibly stylized |
| Keeper/fielding | [Keeper take](../artifacts/cricket-2/gameplay/bowling-2-keeper-take.png), [fielding](../artifacts/cricket-2/gameplay/bowling-1-field.png): actual delivery replay; no claim of authored motion capture |
| Mobile | [Landscape](../artifacts/cricket-2/07-mobile-landscape.png), [batting](../artifacts/cricket-2/08-mobile-batting.png), [portrait chase](../artifacts/cricket-2/09-mobile-portrait-chase.png): touch controls and required runs/balls fit; these input captures use the tactical renderer |
| Full match | [Gameplay video](../artifacts/cricket-2/gameplay/gameplay-low.webm): 262.2 seconds, 1024×688, desktop Low 3D; actual six, caught wickets, dot and four, second-innings bowling, replay scrubbing and conclusion |
| Actual outcomes | [Capture event log](../artifacts/cricket-2/gameplay/events.json): independent engine agrees with every captured batting input/digest; target outcome searches do not force the result. A requested single/run did not occur and is not claimed as evidence |
| Result integrity | [Keyboard verification](../artifacts/cricket-2/keyboard-verification.json), [scorecard](../artifacts/cricket-2/gameplay/scorecard.png): separate keyboard-only match accepted by server replay; reward eligibility is still enforced by the unchanged server/database tests |

Videos were decoded locally in Chromium and sampled visually, alongside the actual screenshots above. They are browser video captures without recorded game audio. The coin is readable at macro distance, kits have clearer team color separation, pitch/player positions remain coherent and mobile chase information is visible. Mitten hands, simple faces, procedural poses and limited close-up character detail remain obvious. The capture opens optional assist controls to set reproducible shot parameters; normal minimal-HUD screenshots show the default compact state. Seven responsive widths (320, 360, 390, 430, 768, 1280, 1920) report zero horizontal overflow; short portrait and touch landscape checks also pass. This does not replace physical phone or accessibility review.

## Commands and reproducibility

Every command used Node 24.14.0 / pnpm 11.15.1 and explicit isolated loopback database environment. Required fixture variables include `DATABASE_URL`, `E2E_DATABASE_URL`, `ECONOMY_TEST_DATABASE_URL`, `AUTH_SECRET`, `AUTH_ORIGIN`, `ALLOWED_ORIGINS`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_REALTIME_URL`, `REALTIME_INTERNAL_URL`, `IDENTITY_TEST_MODE`, `AVATAR_LOCAL_DIR`, local Google fixture configuration and the loopback `EMAIL_API_URL`/email fixture configuration. No real Google or email service was exercised. The test-owned database/listeners must be running before executing suites.

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:db
pnpm build
pnpm test:e2e
pnpm --filter @platform/web exec playwright test e2e/cricket-2-unit.spec.ts e2e/cricket-2.spec.ts e2e/cricket-2-performance.spec.ts e2e/cricket.spec.ts e2e/cricket-visual.spec.ts
pnpm --filter @platform/web exec playwright test e2e/cricket-2.spec.ts e2e/cricket-visual.spec.ts --grep "native mobile swipes|standard gamepad|leaving the match"
pnpm --filter @platform/web exec playwright test e2e/cricket-visual.spec.ts --grep "leaving the match"
```

On-demand real-game footage: set `CRICKET_EVIDENCE=1` and run `pnpm --filter @platform/web exec playwright test e2e/cricket-evidence.spec.ts`. Its default output is now `artifacts/cricket-2/gameplay`; previous milestone artifacts are preserved. `CRICKET_GRAPHICS` and `CRICKET_PHASE` remain supported. No external assets or service are needed for cricket.

Local logs include `unit-platform.log`, `database.log`, `build-release.log`, `typecheck-evidence-final.log`, `browser-full.log`, `browser-cricket-final.log`, `browser-acceptance.log`, `browser-reentry-input-final.log`, `browser-reentry-controlled.log`, `evidence-final.log` and `evidence-controlled-replay.log` under ignored `.data/cricket-2`. Fixture environment values, database files and raw/interrupted capture output are intentionally not committed.

## Source checkpoints and preservation

- Base and original PR branch `codex/takeover-and-reliability-audit`: `2bdbbd49124aac4a7ff86f621ecb582d1e66c866`, unchanged.
- Local `main`: `09fe2e4a667ec59289bf303446f24aac96ab1c6b`, unchanged. Remote state was not refreshed or changed during this work.
- Application and acceptance-test implementation: `29e11f269511e207f2e5d4c0a15c4dd716fe018f` (`feat(cricket): add skill controls and cinematic match presentation`).
- Evidence automation correction: `190f65a0b923a5468b747eeaedef59463119c38d` (`test(cricket): make recorded replay capture deterministic`).
- This report, evidence and the two historical-report cross-links follow in a separate documentation/media commit. Its hash is reported in the final handoff; a commit cannot include its own hash.

Root `AGENTS.md` and `CLAUDE.md` were deliberately **not updated**, following the user's explicit preservation instruction. They remain byte-identical to each other and their original SHA-256 `8546d10f083011d072c299b89dabe82585c527fb8433416933f865f2b061f4eb`. `apps/web/AGENTS.md` is also unchanged. Preservation checks compare the full branch diff against the base, including engine/shared/database/realtime source, lockfile, routes and previous artifacts. All implementation is local on `feature/sinverse-cricket-2`; nothing was pushed, merged or deployed, and no production data or Toolyaro files were touched.

After verification, the test-owned web/realtime servers and isolated PostgreSQL process were stopped. Ports 3200, 4200 and 5438 have no remaining listeners. The local test database, fixture scripts and diagnostic logs remain in ignored storage for reproducibility; no environment file, credentials or database contents are included in the commits.

## Known limits and next work

This is an implemented controls/ceremony/presentation upgrade to a stylized procedural cricket duel. It does not satisfy every aspect of the long-term premium-simulation brief:

- Character faces, mitten hands and clothing remain simple; no scanned characters, motion capture, cloth or professional character-animation assets were available or added. Foot planting and IK are real, but they do not establish console realism.
- The simulation still has eight shot kinds. A dedicated hook and a separate late-defence clip are absent; a late defensive input uses the existing timing/contact rules. Left-handed simulation and per-player bowling actions/body-specific physics are not added.
- Wicket reactions differ by confirmed dismissal and role. A persistent personality/pressure model and a separate final-wicket choreography are not implemented.
- The camera uses geometric framing and standard lighting. Post-processing depth of field and motion blur are not implemented; there is no claim otherwise.
- Coin motion/landing is a deterministic presentation animation of the seeded toss, not a general rigid-body coin simulation.
- Synthesized sound is event-wired, but speaker/headphone balance has not been reviewed by listening. No spoken commentary or umpire voice is included.
- Browser/device emulation and software-GPU measurements cannot verify physical low-end/mid-range GPUs, real Android/iOS input latency, Safari, controller hardware or assistive technology. No 60 FPS claim is made.
- Full T20/ODI/Test, career/tournament systems and synchronous cricket multiplayer remain outside the existing duel implementation.

Recommended next milestone: physical-device playtesting and measured input/camera tuning, followed by original authored batting/bowling/fielding animation and left-handed simulation with explicit engine versioning/regressions. Preserve the server replay contract when expanding shot kinds or handedness.
