# Sinverse Cricket first vertical slice - QA

The later controls, interactive 3D toss and presentation upgrade is tracked separately in [Sinverse Cricket 2.0 implementation and validation](SINVERSE_CRICKET_2_IMPLEMENTATION.md). This report preserves the original vertical-slice evidence and results.

Started 2026-11-05 in `D:\dev\games`; initial clean branch `codex/takeover-and-reliability-audit`, HEAD `920b22d0485b40d0a1316cdf0ffd78a04b3be6ea`. No reset/checkout of historical milestones. Both root manuals are synchronized; local commits are explicitly allowed by current instructions. No push, merge, deployment, DNS/production-secret change, production migration, purchased asset or paid provisioning.

## Audit and scope

[Architecture and repository findings](SINVERSE_CRICKET_ARCHITECTURE.md) record the inspected engines, registry, sessions, wallets, profiles, rankings, realtime service, Prisma schema/migrations, deployment and test suites. Earlier milestones `14ac4ef`, `fed214f`, `53b2851`, `5304115` and `920b22d` remain intact. Fresh pre-change unit/integration baseline: **200 passed** (149 engine, 11 shared, 40 realtime/configuration/image cases). Existing game engines, clients and assertions are to be verified unchanged at final review.

This milestone targets a complete custom duel, not the whole commercial cricket vision. [Design](SINVERSE_CRICKET_GAME_DESIGN.md), [rules/limits](SINVERSE_CRICKET_RULES.md), [assets/IP](SINVERSE_CRICKET_ASSET_GUIDE.md) and [next milestones](SINVERSE_CRICKET_ROADMAP.md) describe the contract.

| Status | Coverage |
| --- | --- |
| Implemented and locally verified | Versioned one/two-over duels, toss/two innings/chase, scorebook, eight shot and bowling profiles, fixed-step ball/contact, fielder interception/throws/keeper, input verification, snapshots/replay, original procedural 3D/tactical rendering and platform result integration |
| Partially verified | Procedural character/contact animation, camera polish, mobile GPU performance, controller support and cross-browser determinism |
| Design-only / not implemented | Full T20/ODI/Test, tournaments/series/career, ranked seasons, synchronous cricket multiplayer, licensed identities, shareable persistent replay storage, professional animation/physics fidelity |
| External configuration | No new service required for local play; existing real Google/R2/deployment verification remains pending independently |

## Architecture and implementation

Domain physics/rules/AI are browser-independent TypeScript. React uses their actual state; renderer/audio/camera never award runs. The server replays bounded signed-run inputs. Real flight, ground contact, oriented bat impulse, physical interception and grounding drive outcomes. Original scene geometry, jerseys, rigs and synthesized sound are local assets. Three 0.187.0 loads only for a 3D match; fallback stays playable. This is a stylized first art/animation pass, not visual parity with a commercial console title.

Persistence reuses existing Match/PlayerGameStats, profile, achievements and leaderboard queries. Three cricket achievements are new. Ties use neutral win/loss accounting only for this game. Winning eligibility and daily ledger cap remain unchanged; duplicate UUID protection remains server-owned. No new auth, player, wallet, schema or migration.

## Validation ledger

| Check | Result |
| --- | --- |
| Baseline original unit/integration | 200 passed |
| Initial new cricket engine tests | 26 passed |
| Final full unit/integration | **235 passed**: 184 engines (149 original + 35 cricket), 11 shared, 40 realtime |
| Original + cricket real-PostgreSQL suites | **50 passed**: all 45 original plus five cricket cases |
| All five typechecks | Passed |
| Node production builds | Web and realtime passed; 43 generated static pages |
| Full original browser regressions + cricket | **38 passed in 19.1 minutes**, including all 35 originals; no skips/retries |
| Seven viewport / reduced-motion / fallback / lifecycle QA | Passed in focused and full runs |
| Linux frozen install / OpenNext / dry-run packaging | Passed, including a second build after trace pruning, 41 byte-equal cached assets and seven local workerd 200 responses |
| Bundle, simulation and rendering measurements | Passed measured draw/triangle/texture budgets and lazy loading; software GPU frame-rate targets unmet, physical GPU unverified |
| Original source/test preservation / manuals / links / diff | 245 protected files unchanged; manuals byte-identical; final staged review, whitespace/private-path and local-link checks passed |

## Retained diagnostics

The first whole-workspace typecheck found two Three typing issues: Curve override needed an explicit `override`, and its protected base constructor needed a public subclass constructor. Fixed both; the following complete five-package typecheck passed. No old assertion or test was weakened. Further intermediate attempts and final evidence will be recorded here.

No real Google/R2 or synchronous multiplayer verification is claimed. Physical-device/browser/accessibility coverage must be reported by what actually ran. Screenshots/clips must show browser gameplay, not promotional art posed as play. Final task response supplies exact local commit and tree status.

## Implemented systems and precise limits

| Area | Behavior and verification | Remaining limits |
| --- | --- | --- |
| Formats/rules | Explicit version-1 custom duel; eleven-player sides; seeded toss/captain decision; assigned pair/bowlers; two innings, target/result/tie; legal balls, extras/free hits, scorebook/partnership/fall | Full T20/ODI/Test rejected by configuration, no relabeled formats. No powerplays, Super Over, follow-on, declaration, draw clock, rain/DLS or comprehensive law certification |
| Batting | Defensive, straight, cover, on drive, cut, pull, sweep, loft; direction/power/timing/face/footwork change actual impulse/contact, edges/misses and runs | Not every requested shot, animated bat-mesh collision, per-player confidence/personality or production animation |
| Bowling | Seam, in/out swing, slower, off/leg break, googly, top-spinner; line/length/pace, error/fatigue, release/landing foot | Specialist styles/variations and advanced bowling plans remain future work |
| Fielding/keeper | Delayed primary/backup assignment, acceleration/skill, catch/drop, pickup/throw/direct-hit run-out, keeper take/stumping, swept stumps and narrow projected LBW | Geometric interception proxies, no complete glove collisions, fielder steering, relays or overthrows |
| AI | Recent-direction/variation memory, situational fields, batting gaps/required rate, observable-release flight estimate and difficulty execution noise | Bounded policy, no professional tactical-depth claim; no later human swing input is read |
| Physics | 120 Hz steps, quantized positions, gravity/drag, swing/spin/dip, restitution/friction/roll, oriented bat impulse, swept stump intersection and ellipse boundary | Plausible tunable model, not scientific accuracy. Versioned house rules explicitly document simplifications |
| Rendering/animation/cameras | Lazy Three.js, original day/night grounds, shaped articulated players/equipment/jerseys, procedural poses/leg phase/hand grip, instanced crowd, six cameras, actual ball tracking/bails/trail | Stylized first art pass; angular faces, limited dives/celebrations, approximate grip/reach, clipping/foot sliding and scrubbed body-facing need production polish. No console-quality claim |
| Replay | Last six real deliveries, bounded ball/field/action/runner/grounding snapshots, speed/scrub/manual cameras, skippable event replays | Unit exact-frame/live-input equality and browser score/sequence immutability; no persistent replay sharing or arbitrary-runtime determinism guarantee |
| Audio/controls | Original synthesized impacts/steps/crowd/motif; shared master/effects/music with independent crowd; text reactions; touch, keyboard, pause/hidden-tab and reduced motion; controller polling | No broadcast recordings. Hardware gamepad, physical audio output and assistive-technology audit remain unverified |
| Progression | Existing signed solo runs, server replay, Match/PlayerGameStats/history/profile/leaderboards, three achievements, XP and shared ledger | No separate identity/wallet/schema/migration. No cricket cosmetic store, tournament/series/career tables, ranked seasons or synchronous multiplayer |

Only successful eligible duels earn existing solo completion coins, subject to the shared 80-positive-coin UTC-day cap. Ties count as played, with neither win nor loss. The initial normalized solo score board mixes difficulties; it is not a ranked esports ladder. Signed replay cannot prove human input or prevent every bot.

## Database, browser and preservation evidence

QA uses a fresh owned PostgreSQL cluster on **5437**, database `sinversegames_cricket_test`, with explicit loopback-only fixture environment. Only the existing four migrations were applied there. Existing developer/production databases were untouched. Rollback suites ran before browser rewards. Five new PostgreSQL cases simulate genuine match inputs, pass them through the verifier, then test existing history/scorebook/XP/achievements/rankings, concurrent duplicate-ID rejection, tie/loss accounting, daily cap and full transaction rollback on injected ledger failure. No fabricated match result seeds wallet acceptance.

The first full browser duel passed through real controls and the existing signed API: both innings, a genuinely simulated six, pause, read-only replay, server verification/save, duplicate 409 and profile history. The test bot calibrates input intent only; it never stubs the submit response. [Full-regression six evidence](../artifacts/cricket/duel-regression-evidence.json), [that actual six-containing duel clip](../artifacts/cricket/duel-six-regression.webm), [final focused-duel evidence](../artifacts/cricket/duel-evidence.json), [actual gameplay clip](../artifacts/cricket/duel-desktop.webm), [live batting](../artifacts/cricket/batting-live.png), [replay](../artifacts/cricket/replay-side.png), [interval](../artifacts/cricket/innings-interval.png), [match finish](../artifacts/cricket/match-finish.png), [verified scorebook](../artifacts/cricket/verified-scorebook.png). Artifacts omit signed run tokens/session cookies.

[Responsive evidence](../artifacts/cricket/responsive-evidence.json) covers 320/360/390/430/768/1280/1920 widths with zero horizontal overflow, touch context, reduced motion and short 320 × 640 controls. [320 toss](../artifacts/cricket/toss-320.png), [320 controls](../artifacts/cricket/controls-320.png), [430 tactical gameplay](../artifacts/cricket/tactical-430.png). Lifecycle checks freeze the tick on pause, preserve score/sequence through replay, constrain keyboard focus, restore setup focus/scroll on leave, render on re-entry and switch to tactical play after context loss. Missing-WebGL2 acceptance plays a delivery; promotional art never substitutes for simulation. This is headless Chromium, not physical-phone/Safari coverage.

[Detailed visual review](SINVERSE_CRICKET_VISUAL_REVIEW.md) records the quality ladder and remaining art limits. Visual review finds readable dark/mint/gold hierarchy, original kit/stadium identity, visible crease/ball and concise real-event replay. Initial medium cost of 763 draw calls prompted removal of medium real shadows/extra spotlights and addition of cheap contact shadows. The character/camera limitations above remain visible and require the next art pass. Older prototype lobby/toss/delivery captures are retained and are not the final gameplay acceptance captures linked above.

[Preservation manifest](../artifacts/cricket/preservation.json) checks 245 unique tracked files against initial Git blobs: 24 original engine, 26 original client, 29 original test/helper, 153 original artifact, six schema/migration and seven deployment/toolchain files. Zero differences; text uses Git clean filters, binary evidence no newline conversion. Shared registration/audio/result integrations are intentional changes. No original assertion was weakened or skipped.

## Performance, assets and packaging

[Domain measurements](../artifacts/cricket/domain-performance.json): 100 complete seeded duels, 1,215 delivery samples, zero 1,680-tick safety-cap hits; maximum 506 frames and 315,089 serialized snapshot bytes per delivery. Six times that maximum is 1,890,534 JSON bytes, not total JS/GPU heap. Node v24.14.0 server replay median **2.69 ms**, p95 **7.33 ms**, max **15.40 ms** on this machine, not a remote Worker CPU guarantee.

Separate minified Three renderer chunk: **577,750 bytes**, **144,358 gzip bytes** in the Node production build. The renderer chunk was absent from initial-route resource requests. Initial software-GPU ladder measurements found 434 calls Low/Medium and 596 High/Ultra, above the 500-call High budget; limiting detailed shadow casting to torso/trouser silhouettes addresses that overrun. Final repeat: 434 calls Low/Medium, **460 High/Ultra**, within the 500-call budget; 29,894/40,894/60,094/82,094 triangles and 20/20/22/22 textures. Returning to Low restored 434 calls, 434 geometries and 20 textures; no page errors and the canvas was removed on leave. Final median intervals were 66.6/83.3/133.4/150 ms (Low repeat 50 ms). [Raw render evidence](../artifacts/cricket/render-performance.json) and [High capture](../artifacts/cricket/high-stadium.png). Initial median frame intervals were 50/66.7/116.7/133.4 ms: software rendering misses the hardware targets and is not a 30/60 fps claim. Low/medium/high/ultra cap DPR 1/1.25/1.5/2, crowd 450/1000/1900/3000, real shadows off/off/1024/2048. Snapshot/trail bounds and renderer/audio cleanup are explicit. Headless software WebGL does not establish physical-device 30/60 fps.

Three 0.187.0 is the only new direct runtime dependency; matching types/type-support dependencies are dev-only. Lock diff: **53 additions, zero deletions**, with no old dependency version changed. New frozen SHA-256: `c1bb3ef586c5f1bdd07c85ff045fca81c5ad7a7b1a0c31f55d1cdf161a4db4bb`. The lock was intentionally extended for this renderer; frozen verification preserves that new hash. Fresh Linux install passed in 1m 46.5s with Node 24.14.0/pnpm 11.15.1, both Prisma generators and five typechecks. Final OpenNext build and dry-run passed: 23,212.16 KiB total / **6,162.21 KiB gzip**, within the repository's documented 10 MiB paid-plan budget; no plan was inspected, purchased or changed. The first successful package was 6,552.93 KiB gzip because broad tracing copied unused Three examples/decoders. A Cloudflare-only `outputFileTracingExcludes` removes that package from server traces while preserving the 577,750-byte browser asset. Final inspection found no Three renderer in server-functions and no Draco/Basis decoder WASM in the dry-run. All 41 static cache files match byte-for-byte; all seven local workerd route/asset/session checks returned 200, including `/play/sinverse-cricket`. The owned Linux server stopped and the new lock hash remained unchanged. [Packaging evidence](../artifacts/cricket/linux-packaging.json). Existing Prisma/WASM broad tracing and fresh-cache notices remain recorded; a supplemental WSL invocation printed a systemd user-session warning but exited successfully. No CLI version, binding, preview/production script or remote dashboard change.

All default teams/22 names/kits/grounds/art/audio are original code-native work; Three's MIT notice is retained. Licensing metadata requires explicit grant/provenance/scope/expiry and falls back to originals, but cannot certify a rights claim. No official mark/kit, real-player likeness or broadcast asset is included. [Asset guide](SINVERSE_CRICKET_ASSET_GUIDE.md) distinguishes sporting rules/facts, trademarks, publicity/personality rights and copyrighted artwork/broadcasts, and identifies professional review for future licensed assets and final commercial naming. This is not legal certification.

## Further retained diagnostics and next phases

A browser-test helper typecheck caught an unannotated canvas `this`, fixed before subsequent production/typecheck passes. Live-input review caught future footwork/run requests applying one tick too early during replay; both now take effect on the next tick, with exact live/recorded equality tests. Repeated run taps during a run are ignored. First responsive browser acceptance caught focus returning to the document body; fixed to focus the restored Start button, and the unchanged assertion passed in 12.0 seconds. A supplemental metric script used the filtered package CWD for output; corrected to its artifact URL and reran successfully. Logs remain in ignored `.data/cricket/`, including failed attempts; no failure is relabeled a pass.

Not implemented: full professional formats/laws, every requested shot/variation, XI editing, production character animation, tournament/series/career persistence, cricket cosmetic sales, replay sharing, ranked seasons/matchmaking or authoritative synchronous cricket multiplayer. No inactive mode screens pretend to implement them. Existing real Google/R2 and remote deployment verification remain external and unclaimed. Next bounded work: independent cricket rules/statistics review; rig/contact/locomotion and physical-device performance; then versioned full limited-overs play/recovery. Tournament/career/Test/multiplayer remain separately gated in [roadmap](SINVERSE_CRICKET_ROADMAP.md).

## Git completion record

Initial branch/HEAD are recorded above. Changes are local cricket engine/client/assets/tests/evidence plus shared registration, full-width setup, audio master/crowd, achievements and neutral tie accounting, with synchronized manuals/docs. No schema, Worker binding, deployment-script or remote dashboard change. The only build-configuration change is the Cloudflare-only Three server-trace exclusion. The final render-only shadow adjustment passed another complete Node production build, all three focused cricket browser cases (2.4 minutes), all five Linux typechecks, OpenNext/dry-run/local Worker checks, and quality-ladder profiling. The earlier full 38-case browser run includes unchanged original game code and assertions; it is reported separately from this focused repeat. All owned web/realtime/provider/PostgreSQL/local Worker servers are stopped. Implementation checkpoint: **`c01a8b4c46bf50f222a9ae8e228b8b03f8e9282c`** (`feat: add verified Sinverse Cricket duel vertical slice`), 68 intended files. Immediately after that commit the working tree was clean on `codex/takeover-and-reliability-audit`. The acceptance documentation is committed separately; its final hash is supplied by the task response. No push/merge/deploy occurred. Final review checks passed: synchronized working/index manual bytes, all seven cricket documents' local links, no private paths/conflict markers/whitespace errors, preserved milestone ancestry and protected-source/artifact hashes.

## Visual polish milestone (2026-11-05)

See the [visual polish QA report](SINVERSE_CRICKET_VISUAL_POLISH_QA_REPORT.md). Final state: 5 typechecks, 235 unit and integration tests, 50 PostgreSQL tests, and 64 browser tests pass with 1 on-demand evidence test skipped. The Linux OpenNext build and dry-run packaging pass. Gameplay is unchanged: the simulation gains only a presentation-only `contactPoint`, outside the digest. No physical device was tested.
