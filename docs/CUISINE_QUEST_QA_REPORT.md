# Cuisine Quest implementation and QA

2026-11-04. Local branch `codex/takeover-and-reliability-audit`, preserved checkpoint `4cadb91d194d2674920249030baa25cfcc58e29b`. No push, merge, deployment, production migration/data/configuration change or paid service. No dependencies added.

## Acceptance status

All seven cuisine levels and 28 requested recipes are implemented and accepted locally. All 31 browser tests pass, including an actual seven-cuisine campaign in sequence, Indian replay improvement, original-award recovery and all existing 27 browser regressions. The original seven games, their engine/client implementations, tests and committed artifacts are preserved. This task implements one of the ten expansion games. Google sign-in, uploads and the other nine games remain unfinished.

## Architecture and rule contract

[Design](CUISINE_QUEST_DESIGN.md) · [complete rules](../GAME_RULES.md#cuisine-quest) · [architecture](../ARCHITECTURE.md#cuisine-quest-campaign-and-workflow-engine).

The shared deterministic engine in `packages/engines/src/cuisine-quest` defines ordered ingredient portions, 16 spatial techniques, eight cooking methods, exclusive stations/two active batches, preheating, piecewise integer heat work, flips/stirs, plating and ticket finishes. Rendering frequency cannot change replayed heat work. Strict bounded logs reject malformed/unknown fields, impossible phases, backwards times, premature finish and excess actions. Signed run identity, ownership and wall-time plausibility remain in the existing solo API. The server recomputes scores; client score fields never authorize results.

Every shift covers all four cuisine recipes. Six customers request seven plates: regular and patient guests, impatient guests from kitchen three, a two-plate large order and a special finish. First tickets are scheduled at 0/14/28/42 seconds with at most three seated; queued patience starts on seating. Remaining two guests form the final rush after the first four resolve. Regular/patient/impatient/large patience is 155/180/125/200 seconds. Restart discards a batch and records a mistake while preserving elapsed patience. Wrong ingredients, portions, gestures, delivery recipient and garnish remain recoverable. Burn counters survive restarts.

The finished score, up to 10,000, combines completion 45%, preparation/cooking precision 30%, customer satisfaction 15% and mistake-adjusted served accuracy 10%. No served food means zero. One star needs five plates and 5,200; two need six and 7,000; three need all seven, 8,500 and at least 85% precision. Unfinished services receive no stars. One saved star in every preceding level opens the next; three marks mastery, up to 21 total. Results show server score/stars, served/perfect dishes, mistakes/burns, precision/satisfaction, original actual coins, new badges and personal best. Score/star reveals do not block actions.

## Seven implementations and recipe inventory

| Kitchen | Requested dishes | Preparation and service identity | Local environment / original motif |
| --- | --- | --- | --- |
| Indian | Masala dosa, paneer tikka, butter naan, vegetable biryani | Batter mixing/spreading, tawa flip, paneer chop/marinade/grill, dough knead/stretch/oven, rice/spice layers | Copper courtyard, warm arches/tandoor, 104 BPM |
| Italian | Margherita pizza, Pasta Alfredo, bruschetta, lasagna | Dough/toppings, accurate pasta boiling/sauce, slicing, layered oven service | Sunlit brick bakehouse, 112 BPM with swing |
| Japanese | Sushi rolls, ramen, tempura, onigiri | Rice/slicing/rolling, broth, frying, shaped rice and precise plates | Shoji/lantern counter, 88 BPM sparse motif |
| Mexican | Tacos, quesadillas, burritos, nachos | Chopped fillings, tortilla grilling/folding/wrapping, layered oven assembly | Tiled garden, 118 BPM |
| Thai | Pad Thai, green curry, Tom Yum, mango sticky rice | Measured 1/2 portions, wok cadence, crushed curry paste, soup heat, steamed rice | Rain-and-teak pavilion, 98 BPM |
| Chinese | Fried rice, dumplings, chow mein, kung pao chicken | Wok sequencing/tosses, fold/seal/steam, chopping/marinating | Red-window workshop, 122 BPM |
| Mediterranean | Hummus platter, falafel, Greek salad, shakshuka | Blend, shape/fry, fresh slicing/mixing, pan finishing, deliberate plating | Olive terrace, 106 BPM |

Each kitchen has three introduction pages, full recipe guidance, progressive orders, final rush, results, replay and campaign return. Engine calibration completes every recipe with seven perfect plates, zero mistakes/burns, 100% precision, three stars and active time between 30 and 180 seconds for the fixed acceptance seed. Real UI timing/seed measurements are recorded with final evidence. The final actual browser services took 71.46-79.88 seconds of active play, all seven plates per shift. The Indian replay improved 9662 to 9970, from four mistakes to none; the other six cuisines scored 9968-9976 with 100% precision, zero burns/mistakes and 98% satisfaction. [Server-saved campaign metrics](../artifacts/cuisine-quest/campaign-runs.json). The real campaign verifies 21 stars / seven mastered, all-seven achievement, actual capped wallet balance 80 and both public ranking paths. The lost first response recovered original 47 coins, the identical retry changed no balance, and the improved replay raised it to 55. Those guided automated times are not a human difficulty guarantee. Patient queues and visible cues provide room for practice; simultaneous batches are optional strategy rather than a required speed trick.

## Persistence, economy, achievements and privacy

Additive migration `packages/db/prisma/migrations/20261104020000_cuisine_quest_campaign/migration.sql` adds CuisineProgress, a player/level key, ranking index and level/star/score checks. Both Node/workerd clients are regenerated. Applied only to explicitly selected localhost databases: a fresh isolated `sinversegames_cuisine_test` and the preexisting local developer database. Eleven legacy tables have identical before/after row counts and SHA-256 snapshots; [integrity evidence](../artifacts/cuisine-quest/migration-integrity.json). Prisma schema diff reports no drift. No destructive table/column changes or old result/balance rewrites.

The existing Player-row-locked result transaction updates match, campaign stars/bests/completion counts, stats/XP, achievements and append-only Sin Coins ledger together. Normal eligibility, rewards-disabled behavior and shared 80-positive-coins/UTC-day cap remain. Only the first successful saved completion of each cuisine gets the normal 2+10; replay can earn a new per-cuisine best bonus of 3 or newly earned badge bonus of 5. Identical replay scores do not repeat completion coins. Duplicate run UUIDs cannot repeat any effect. Concurrent distinct first completions grant base completion coins once. Failed shifts do not unlock or earn coins.

Thirteen new badges extend the existing 13: seven cuisine masteries, first perfect dish, three-star service, perfect shift, no-burn shift, seven plates within 120 active seconds, and all-seven completion. Server-derived aggregate progress evaluates the final badge. Profile passport shows seven levels, stars/bests/mastery, earned CQ badge count, perfect shifts and six recent CQ runs independently of the generic 15-run history. Existing per-game/all-time/daily ranking works; cuisine-specific rankings sort score, stars and player ID, exclude active bans and expose only public display fields.

Exact original awards are saved in private match-participant receipt metadata in that transaction. Authenticated `GET /api/solo/result?runId=<uuid>` and Cuisine Quest duplicate submit recover those awards without another write. Other players cannot read/submit the run. Public daily result details remove receipt coin/unlock metadata; wallet history remains private. No parallel account/wallet/save service is introduced.

The existing SoloRunner opts CQ into bounded tab-scoped sessionStorage recovery keyed by player/game. Refresh replays a playing checkpoint and starts paused. Pending/done results use the owner-only receipt; uncertain saves offer retry of the original signed run. Server saved/completed status controls continuation. Network/DB/storage failures are visible and never fabricate verified coins or unlocked kitchens. This does not add cross-device guest recovery or an indefinite server outbox.

## Asset, audio, controls and mobile inventory

All art is original local code-native vector work: seven layered architectural scenes, 28 dish silhouettes/toppings, ingredient families with raw/chopped states, technique-specific mixing/spreading/chopping/dough/roll/fold/shape/plating states, deterministic expressive customers and a local SVG passport cover. Food changes through preparation, quantized cooking color, ideal/overcooked/burnt treatment, steam/smoke and flip animation. Customers arrive, show patience/mood, react to errors, celebrate service and leave on expiry. No emoji food, commercial artwork or remote runtime image URL. [Source sizes](../artifacts/cuisine-quest/source-sizes.json) distinguish authored source/gzip from downloaded bundle sizes.

Seven original synthesized motifs have distinct notes/rhythm/tempo; no recorded music download. Existing sound effects cover chopping, pickup, splashes/mixing, flip, plate, serve, order arrival, mistakes and completion. Ambient room and sizzle/fry/simmer follow active cooking. Separate effects/music volume, music toggle and master mute remain. AudioContext construction failure is caught. Ambient nodes disconnect on stop; sequencer stops/disconnects both current and scheduled sources. Muting changes live buses without duplicating sequencers; settings persist. All necessary cues remain visual with audio off.

Phone gameplay keeps tickets, the active station, guide, feedback and actions inside the viewport. Recipes/pause are overlays; desktop adds recipe/station sidebars. Body scrolling is locked for cooking, gesture pads capture pointers and suppress touch scrolling, underlying footer focus is disabled, and pause/introduction focus is bounded. Visibility pause freezes logical time and requires explicit resume. Reduced motion disables decorative loops/transitions and star/flip effects. Tap and labelled keyboard alternatives use the same replay intents as spatial gestures; ingredient/plate drag remains available.

Geometric checks pass for pantry, preparation, cooking and serving at widths 320/360/375/390/430 (568px height), 768/1280 (900px height): no page horizontal overflow, station buttons within the viewport and at least 44px high. The phone flow exercises actual touches, Space, a captured mouse drag, settings/mute, paused refresh recovery and service. Final campaign plays level three onward at 390 x 812. A supplemental normal-start review checks every kitchen pantry, including later portion controls, at 320/360 x 568: all 14 layouts pass with zero page errors. It uses an already completed local campaign owner fixture and the dummy local signing key, without seeding any stars/results/rewards; [layout evidence](../artifacts/cuisine-quest/all-kitchens-narrow.json). [Desktop passport](../artifacts/cuisine-quest/passport-desktop.png), [320px passport](../artifacts/cuisine-quest/passport-320.png) and [detail page](../artifacts/cuisine-quest/detail-desktop.png) are local screenshots, not production captures.

## Validation ledger

| Gate | Outcome |
| --- | --- |
| All package unit/integration tests | 189 passed: 149 engines (36 CQ), 8 shared, 32 real-socket integration; all original 153 retained |
| Real PostgreSQL | 21 passed: original 12 plus 9 CQ progression/concurrency/receipt/rollback cases |
| Five package typechecks | Passed after final code/instrumentation corrections |
| Node production web/realtime build | Passed; includes all eight game/play/OG entries and CQ APIs |
| Linux OpenNext build | Passed after explicit Node/workerd client regeneration; build only |
| Focused phone / hostile log / unavailable audio browser checks | 2 passed on final gameplay code, before final full-suite run |
| Full browser regression and complete campaign | 31 passed in 17.0 minutes: original 27 plus 4 CQ; no skips/retries; real campaign 10.4 minutes |
| Manual synchronization / preservation / documentation links | Manuals byte-identical; 60 original engine/client/test files unchanged; all 53 checked documentation links resolve; all 84 staged paths reviewed and whitespace check passes |

Commands: `pnpm db:generate`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm build`, `pnpm test:e2e`, and Linux `pnpm cloudflare:build`. Node 24.14.0 and pnpm 11.15.1, selected per shell; machine-wide default unchanged. Database/browser URLs explicitly select the isolated local test database. Do not run DB rollback fixtures simultaneously with browser rewards because a temporary local ledger constraint intentionally tests failure. The Linux workspace uses frozen install and explicit client regeneration; no remote service/deploy command.

Retained failures and corrections:

1. First 34-case engine run: 26 passed, eight failed. Guided precision and boundary checks exposed unavoidable wrong-heat exposure before setting recipe heat. Added preheat before placing food; unchanged precision/boundary assertions then passed. Final 36 cases add station/batch competition and wrong delivery/finish recovery.
2. First 21-case DB run: 19 passed, two failed because the unattended fixture appended an earlier terminal timestamp after a 540000 wait. Fixed fixture chronology, preserved strict verifier and added unattended replay coverage; all 21 passed. Initial failure log retained locally.
3. Initial focused browser controls/audio-fallback checks passed. The first full CQ campaign reached saved 21 stars, replay improvement, profile and leaderboard assertions, then failed in context/trace finalization with unexpected file bytes/truncated ZIP. It is a failed run. The source was edited during that traced run and every-frame/snapshot recording created heavy artifacts; an exact exclusive cause is not claimed. The rerun freezes test source and retains action/network diagnostics plus explicit screenshots without frame/DOM/source capture.
4. The first attempt to scope trace configuration inside describe was rejected before tests because it forces a worker. Moved the CQ-only setting to file scope; original test configuration/assertions unchanged.
5. Audio probe subclass first failed strict TypeScript for missing override modifiers. Corrected the three overrides; final typecheck/build pass. No app assertion was removed.
6. First Linux run reused old generated Prisma types: no CuisineProgress delegate. Frozen install did not regenerate them. Explicit `pnpm db:generate` generated both clients; the unchanged application then passed OpenNext. Original failure log retained. Existing dynamic WASM tracing warnings are not claimed resolved.

Ignored raw logs are under `.data/cuisine-quest/`; screenshots/trace from intermediate runs are not a complete retained archive. The corrupt initial trace was not usable. Reviewable final evidence belongs in `artifacts/cuisine-quest/`.

## Performance evidence

Memoized scenes/food/customer art, code splitting, a 100 ms simulation paint interval and quarter-step cooking art limit repeated SVG work. Cover SVG is 2689 source bytes (1186 gzip); seven motif definitions total 1340 source bytes (600 gzip), with no recorded-audio downloads. Original asset/source weights are measured rather than assumed.

Final browser probe records game/total DOM nodes, resource count/transfer bytes, 179 animation-frame intervals, median/p95 frame time, long tasks and remote image requests. It also instruments actual WebAudio source lifetimes: no context before interaction, one context across three pause/resume cycles, zero live scheduled sources after pause, independent audible-bus restoration after mute, and background-pause cleanup. Measured at 1280 x 900 near the start of active service: **261 game nodes / 420 total**, 69 resources / 519166 transferred bytes across entry and play, 179 sampled frame intervals, **16.7 ms median / 16.8 ms p95**, zero observed long tasks and zero external image requests. These are stationary-service samples, not a worst-case stress benchmark. One AudioContext remained across three pause/resume cycles; live sources returned to zero after pauses. Muted bus gains fell below 0.001 and restored independently to approximately 0.599 effects / 0.270 music. The six active sources in the recorded running snapshot are the current room/music voices, not residual paused voices. [Raw measurements](../artifacts/cuisine-quest/rendering-and-audio.json). Local headless Chromium samples are not proof of physical midrange-phone FPS. The earlier heavy platform homepage remains a separate optimization item; this task preserves its original game art.

## Exact changed files and Git status

Exact 84-file path inventory: [changed-files.txt](../artifacts/cuisine-quest/changed-files.txt). Branch remains `codex/takeover-and-reliability-audit`; implementation starts from preserved `4cadb91`. The accepted implementation is ready for a local checkpoint; its resulting hash will be recorded in the final acceptance note. Root AGENTS.md and CLAUDE.md are updated together and compared byte-for-byte. The preservation check confirms 60 original engine/client/test files unchanged relative to that baseline. No push/deployment. Owned QA servers are stopped after verification.

## Limits and future release requirements

- Arcade workflows, stylized vector food and synthesized motifs are authored interpretations, not real cooking instructions or cultural authenticity claims. Human difficulty and art preference need broader player feedback.
- Browser acceptance uses Chromium emulated layouts, not physical devices, Safari/WebKit/Firefox, a screen-reader certification or a phone memory/FPS guarantee. Visibility handling has an explicit hidden-event automated check; actual OS background behavior still benefits from device testing.
- Replay proves the score is achievable under rules/time constraints, not that a human made the inputs. The existing 10-second timing slack and guest-identity abuse limits remain.
- Guest cookie loss loses identity access. Recovery is tab-scoped, bounded and subject to signed-run expiry; private mode/storage denial warns, and clearing tab storage removes the checkpoint. The server still lacks a durable outbox for results never committed before a restart.
- A database is required for campaign saves and later kitchens. First-kitchen practice remains available without it. A future approved release must apply the additive migration before running code that queries CuisineProgress, and review operational/provider configuration separately.
- No production endpoint gameplay tests, migration or release were performed. Nine other expansion games, Google/provider identity, avatar uploads, daily claims and broader season/global rankings remain outside this completed flagship scope.
