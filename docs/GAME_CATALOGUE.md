# Expansion game catalogue

Updated 2026-11-04. Cuisine Quest is implemented locally with all seven cuisines and 28 recipes; final acceptance results are tracked in [its QA report](CUISINE_QUEST_QA_REPORT.md). The nine other entries remain designs. The original seven games are preserved; no expansion game has been deployed. Titles describe original proposed mechanics; no affiliation with another game's publisher is claimed. Add runtime registry entries only after complete gameplay gates pass.

| Game | Category | Players/session | Primary mechanic | Art and audio |
| --- | --- | --- | --- | --- |
| Cuisine Quest | Signature cooking solo | 1 / 2–5 minutes; 9-minute maximum | Hands-on preparation, heat control, technique and plated order management across cuisines | Illustrated travel kitchen; cuisine-specific materials, original instrument motifs and kitchen ambience |
| Comet Courier | Arcade/reflex solo | 1 / 2–4 minutes | Orbit a moving cargo pod, release it into gravitational lanes, catch deliveries without losing momentum | Screen-printed space-post office, amber thrusters, elastic paths; shortwave clicks/synth bass |
| Circuit Grove | Puzzle/strategy solo | 1 / 3–8 minutes | Route finite water pulses through rotatable branching pipes; keep different plants within hydration bands | Ceramic channels, moss, copper valves; water/mallet tones |
| Lantern Ascent | Skill/progression adventure solo | 1 / 5–10 minutes per chapter | Place limited rope anchors and swing a lantern carrier through wind corridors; choose safe rest ledges | Cut-paper mountain theatre, indigo and warm light; wind/flute/percussion motifs |
| Pocket Tides | Short-session casual solo | 1 / 60–120 seconds | Place driftwood gates before a tide moves shells; score balanced sets without stranding protected pools | Painted coastal tray, sea-glass tokens; pebbles/water/plucked strings |
| Flux Circuit | Competitive real-time | 2–6 / 3 minutes | Carry a charged relay through rotating gates; choose discharge timing while rivals redirect currents | Kinetic machine-track, cobalt enamel and signal orange; turbine rhythm/electrical taps |
| Signal Shuffle | Casual party | 3–8 / 5–8 minutes | A rotating conductor encodes a hidden rhythm with a restricted symbol set; simultaneous decoders predict the missing beat | Handmade radio club, paper dials and colored signal flags; player-triggered original percussion |
| Keystone Council | Turn-based board strategy | 2–4 / 10–15 minutes | Draft bridges and influence stones to connect public objectives while bidding on shared junctions | Carved stone civic model, brass markers; stone clicks/quiet strings |
| Beacon Brigade | Cooperative multiplayer | 2–4 / 6–9 minutes | Route shared power and dispatch repair drones to keep storm beacons online; roles exchange limited resources | Weather station diorama, teal lamps and storm glass; rain/radio/chord resolution |
| Arcforge Rally | Competitive skill/tournament | 2–4 / 4–6 minutes | Alternate aiming/charging ricochet shots through moving target rings; identical seeded rounds and limited ammunition | Workshop arena, polished steel and burnt orange; forge pings/charge hum |

## Cuisine Quest: implemented campaign

[Implementation contract](CUISINE_QUEST_DESIGN.md) · [Rules and all recipes](../GAME_RULES.md#cuisine-quest) · [QA and limitations](CUISINE_QUEST_QA_REPORT.md). The complete flagship brief replaces the earlier two-dish-per-cuisine concept. There are seven full kitchens and four authored recipes each, with original local scenes, dish/preparation art and separate music motifs.

| Kitchen | Recipes | Distinct technique/combined challenge |
| --- | --- | --- |
| Indian | Masala dosa, paneer tikka, butter naan, vegetable biryani | Batter, spiral spreading/tawa flip, paneer marinade/grill, dough stretch/bake, layered rice |
| Italian | Margherita pizza, Pasta Alfredo, bruschetta, lasagna | Knead/stretch/toppings, boiling/sauce, slicing, oven layers |
| Japanese | Sushi rolls, ramen, tempura, onigiri | Slicing/rolling, rice/broth, frying, shaping and precise plating |
| Mexican | Tacos, quesadillas, burritos, nachos | Fillings, tortilla grilling, folding/wrapping, layered assembly |
| Thai | Pad Thai, green curry, Tom Yum, mango sticky rice | Measured portions, wok stirring, curry paste, soup heat and steaming |
| Chinese | Fried rice, dumplings, chow mein, kung pao chicken | Wok sequencing, fold/seal/steam, chopping and marinating |
| Mediterranean | Hummus platter, falafel, Greek salad, shakshuka | Blend/shape/fry, fresh mixing, pan finishing and multi-station service |

Every shift teaches techniques through visible recipes and preparation paths, combines four introductory orders, then finishes with a two-guest rush. Six customers request seven plates, including a two-plate large order and a special garnish. Two batches and exclusive stations make switching/prioritizing meaningful. Correct ingredient portions, geometry, integrated heat, flips/stirs and plate finishes determine precision. Tap, captured pointer gestures, native ingredient/plate drag and keyboard controls share deterministic intents. Queue patience begins only on seating; pause/backgrounding stop logical time.

A saved one-star completion opens the next kitchen; three stars marks mastery, up to 21 total. Server progress is authoritative. First successful completion per cuisine earns normal eligible completion coins; replay only earns eligible new record/achievement bonuses. One shared ledger and 80/UTC-day cap remain. Campaign stars, match/XP, achievements, ledger and private result receipts commit atomically. Duplicate saves return original awards; refresh resumes a replayed checkpoint paused. Cuisine-specific rankings and profile passport/history read saved outcomes. Daily challenges and purchasable kitchen themes remain future designs.

Food/cuisine names describe broad culinary inspirations, not complete real recipes or cultural authenticity claims. All scene, food and synthesized music assets are original and local. No commercial artwork or external runtime image URL is used.

## Other solo game rules and verification

- **Comet Courier:** start in a practice ring; drag/arrow-turn to select a release vector and press/release to launch. Catch three deliveries to introduce moving recipients, later gates and fuel decisions. Finish after three route sectors or cargo loss. Score delivered cargo, conserved fuel and clean catches; collisions cost cargo. Fixed-step injected-clock simulation and signed input replay enforce acceleration/collision rules. Daily seed and course medals support replay; pause excludes paused wall time from the log.
- **Circuit Grove:** rotate one channel per action before opening a reservoir; simulation consumes finite water and tracks soil saturation. Each chapter introduces splitters, absorbent soil, timed valves, then asymmetric plant needs. Win by meeting all plant bands without overflow; undo is allowed before running a pulse. Score unused water and moves with disclosed hint penalties. Generated puzzles retain a known valid solution; engine tests cover conservation, reachability and forged/extra pulses.
- **Lantern Ascent:** three rest ledges form a chapter. Players spend/recover anchors, aim a rope, swing with bounded force and release onto safe ground; wind is seeded. Teach stationary anchors, then wind and moving ledges. Checkpoints retain chapter progress, not impossible mid-swing snapshots. Finish at the summit or after exhausting rescue tokens. Validate motion/collisions/anchor budget by replay. Score safe rescues, efficient route and recovered lanterns; time is a small disclosed bonus, never a purchase pressure.
- **Pocket Tides:** preview incoming tide, place/rotate at most two gates, then release the tide to move shells into scoring pools. Three rounds per session; chain bonuses require alternating shell families without disturbing protected tide life. Later bands add branching currents and limited gate swaps. Deterministic board replay verifies inventory, collisions and scoring; no reward for immediately abandoning a board.

All solo clients require a tutorial, ready/start, pausable play, results/personal best/replay, keyboard/touch equivalents, sound/mute, distinct covers and loading/error states. Integration uses the existing signed run + replay-verification path with bounded logs and one UUID per run.

## Multiplayer rules and lifecycle

- **Flux Circuit:** client sends direction, dash intent and discharge intent; the server runs a 20 Hz fixed-step simulation. Possession, gate rotation, delivery value and stun recovery are server-owned. Rotate gate patterns over three one-minute heats; skill comes from taking efficient circuits and timed releases, not ping-dependent button races. A dropped carrier drifts safely/loses possession after a disclosed grace, preserving the seat. Equal scores tie on completed gates, then fewer faults, then shared placement. No hidden random loot.
- **Signal Shuffle:** each round a conductor privately receives a seeded rhythm and limited tiles. They place three encoded clues; everyone else submits one locked answer before reveal. Points combine decoding and how consistently a conductor communicates; no public chat text enters scoring. A disconnected conductor is skipped after a bounded timer; all participants see readiness, round deadlines and final scores. Device latency does not decide submission order bonuses.
- **Keystone Council:** deterministic map, three actions per turn: draft, place, bid. Bridges have limited length and junctions limited capacity. Public objectives plus private server-redacted goals create competing route choices. All bids resolve together, ties use rotating initiative. Disconnected players take a conservative pass after timeout. End after six rounds or a completed public network; server checks paths and resources and determines winners.
- **Beacon Brigade:** server owns power flow, storm damage, drone travel and shared repair inventory. Each role has one readable specialty, but no single role can win alone. Hold all main beacons through three storm waves; difficulty adds line overload and split priorities. Disconnected roles enter a limited hold mode and can reconnect; losing quorum ends with a clear aborted outcome. Cooperative victory gives the same base outcome reward per eligible participant; no farmable teammate transfers.
- **Arcforge Rally:** each round starts from the same seeded arena for every player. Aim/charge is clamped and simulated server-side; shot intent contains a vector and release, not hit targets or score. Moving target phase is determined by server time with a wide enough aiming window for ordinary network delay. Five rounds, three shots each; later rounds add reflectors and narrower paths. Ties use precision, then fewer shots; persistent ties share place. Tournament hooks are design only until anti-abuse and season identity exist.

All use existing matchmaker/private rooms/readiness and a fresh server match UUID, restricted input envelope, reconnect/sync, finish/rematch and expiry. Tests must play a complete multi-player match and assert invalid intents, hidden data, duplicate/stale session input, results agreement and mobile controls. None of these designs is registered at runtime yet.


## Additional implemented sports slice: Sinverse Cricket

Sinverse Cricket is a ninth live development game outside the original ten-concept expansion selection above. It implements custom solo one/two-over duels, original procedural 3D and tactical presentation, two innings, batting/bowling, fielding, scorecards and real-event replay. [Design](SINVERSE_CRICKET_GAME_DESIGN.md) ? [Rules](SINVERSE_CRICKET_RULES.md) ? [QA](SINVERSE_CRICKET_QA_REPORT.md). Full formats, tournaments, career and multiplayer remain future phases.
