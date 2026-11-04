# Cuisine Quest — implementation contract

Baseline: `4cadb91`, 2026-11-04. Work is local on `codex/takeover-and-reliability-audit`. The new flagship brief supersedes the earlier proposed dishes in GAME_CATALOGUE.md. All seven kitchens and 28 recipes are implemented and accepted locally: the complete real browser campaign and all regression/build gates pass. No release or production action was performed.

## Game and simulation

Travel the world. Master the kitchen. Seven authored kitchens, four requested recipes each, six customers and seven plates per shift. Each kitchen introduces a preparation technique and combines it with previously taught skills. The last two guests form a service rush after the teaching orders resolve. All four recipes appear in every shift; a large-order guest wants two plates. Queued customers' patience starts only when seated.

Cuisine Quest is a recipe-workflow game: ordered ingredient portions, spatial preparation gestures, temperature control, timed flips/stirs, precise plating and customer-specific finishes. Two batches can be in progress, and stations are exclusive resources. Cooking continues while another order is prepared. Wrong ingredients/gestures are recoverable with visible penalties; a spoiled batch can be restarted. Patience is generous and visible. No coin purchase affects gameplay.

The browser and Worker use the same transport-free timestamped engine. Heat work uses integer units and piecewise integration, so replay is independent of rendering frequency. Logs contain bounded intents and logical times, never a claimed score or quality. Unknown targets, impossible phase transitions, malformed logs, backwards times and premature finish are rejected. Normal mistakes are replayable game events. Completed submissions reuse signed run UUIDs and the existing result transaction.

## Campaign, rewards and recovery

An additive CuisineProgress table stores per-player/per-level best stars, score and completion/perfect counts. Server start checks earlier level completion; local storage cannot unlock a level. Progress, XP, achievements, ledger and a receipt in the match participant's JSON details commit together under the existing player lock. The first successful completion of each cuisine earns the normal completion/win coins; replays can improve records and earn eligible new PB/achievement bonuses, within the existing 80/day cap. There is no second wallet.

Authenticated receipt lookup and idempotent Cuisine Quest retry recover an uncertain commit without paying again. Tab-scoped session storage holds the signed run and bounded move log for refresh recovery, keyed by the current player. Recovered play starts paused; stored results are rechecked against the server. Pausing/backgrounding stops logical time. Storage, network and database failures remain explicit and do not fabricate verified rewards. Guest access still depends on the existing cookie; Google sign-in is outside this task.

## Art, audio and controls

Original code-native vector food, ingredients, customers and seven architectural kitchen scenes follow the established asset pipeline. Prepared dishes have authored silhouettes/toppings; raw, chopped, cooked and burnt states visibly differ. Local bundled cover art does not load remote images. Decorative art is memoized and the game is code-split; no large graphics dependency is added.

Each cuisine has a separately authored original WebAudio motif, using existing music/effects buses. Ambient room and cooking loops follow active station states, pause/visibility/mute and cleanup. Separate music/effects volume and master mute remain available. No sound starts before interaction. Text, progress windows and customer expressions communicate all audio cues visually.

Mouse/touch can tap or drag ingredients, follow preparation hotspots, adjust heat and serve plates. Keyboard equivalents use the same intents and scoring. Phone play keeps the current station and required controls inside a bounded cooking viewport, with expandable recipe/help panels rather than a long form. Reduced motion suppresses decorative loops; pause remains immediate.

## Acceptance

All 28 recipes and seven kitchens need deterministic rule/boundary/invalid-log tests. A real browser campaign must complete seven levels in sequence with saved stars, rewards, achievements/profile/leaderboard checks. Cover replay/improvement, refresh and uncertain-result recovery, pause/visibility, mute/volume, reduced motion and 320/360/375/390/430/tablet/desktop controls. Preserve all original tests and games. Run real isolated PostgreSQL integrity/concurrency checks, all five typechecks, Node builds and Linux OpenNext build. Record exact results and retained failures in CUISINE_QUEST_QA_REPORT.md; do not infer acceptance from a build alone.
