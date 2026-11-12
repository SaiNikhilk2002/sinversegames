# Sinverse Cricket: teams and formats test results

All runs on 2026-11-13, on this machine (Windows 11, RTX 3050 Laptop GPU, Node 24.14.0, pnpm 11.15.1), against a local loopback PostgreSQL `*_test` database. Nothing ran against production.

## Final regression (code at `e35cd2d`)

| Command | Result |
|---|---|
| `pnpm typecheck` | Passed (every package) |
| `pnpm test` | **556 passed**: shared 32, engines 463, realtime 61 |
| `pnpm test:db` | **66 passed** in 6 files |
| `pnpm build` | Passed |
| `pnpm test:e2e` (every spec, every game) | **192 passed, 0 failed, 10 skipped**, in 40.7 min. The skips are the on-demand footage and evidence recorders |
| Linux `pnpm cloudflare:build` (WSL, clean copy, no `.env`, nothing uploaded) | Passed: Worker emitted, 31 MB of static assets including all 20 athlete models |
| Character benchmarks, GPU and software (`CRICKET_EVIDENCE=1 … cricket-benchmark.spec.ts`) | Completed |

The browser suite rewrites the tracked Phase 6 images in `artifacts/cricket-2`; they were restored with `git restore`.

## Baseline for comparison (HEAD `0793ec8`, before this work)

- **Unit and integration:** 539 passed (engines 446).
- **Database:** 65 passed.
- **Browser:** 188 passed, 0 failed, 10 skipped (the 2026-11-12 run on the same commit).
- **Engines on 2026-11-13:** 446 passed.
- **Typecheck:** passed.

**Every new test is an addition:**
- **Engines:** 17, taking the suite from 446 to 463.
- **Database:** 1, from 65 to 66.
- **Browser:** 4, from 188 to 192.

No existing test was removed, skipped or weakened. Some existing duel tests gained type assertions (`as DuelConfig`), because the config type is now a union; their assertions are unchanged.

## New tests

**Engines** (`packages/engines/test/`)

| File | Tests | What they prove |
|---|---|---|
| `cricket-v1-golden.test.ts` | 1 | 96 complete duels reproduce a corpus recorded before any change (commit `0793ec8`): every ball's digest, innings totals, extras, falls, the result and the verified summary. Version 1 is unchanged |
| `cricket-formats.test.ts` | 14 | All 20 teams play on both sides with their default XI, captain and keeper. A custom XI bats in the chosen order, and only those eleven appear. Illegal selections and settings are rejected by the schema and by verification. T20 and ODI conditions; fielding restrictions on the player's field; legal bowler choice (keeper, consecutive overs, mid-over naming, the wrong variation for the bowler's type). Mixed play (the player's own deliveries and simulated overs) verifies exactly. A simulated win doesn't count as the player's and earns no achievement fields. Tampered, reordered, duplicated, truncated, wrong-seed and wrong-version logs are rejected. Determinism. Test cricket: four innings, follow-on, declarations, innings victories, draws on time |
| `cricket-format-sim-t20.test.ts`, `cricket-format-sim-odi.test.ts` | 1 each | **100 deterministic simulated matches per format** (200 in all), varied by seed, team pair, difficulty, ground and toss. They check scorecard invariants for every innings (below), that the result follows the totals, that chasing and defending both win more than 10 times, and exact server verification for every 10th match |

**The invariants:**
- runs equal the batters' runs plus extras, and equal the bowlers' runs plus byes and leg-byes;
- the bowlers' balls add up to the innings' balls;
- at most 10 wickets, with the falls and dismissals matching the wickets;
- the over limit and each bowler's quota are respected, with no bowler bowling consecutive overs;
- partnerships add up to the total, with one more partnership than wickets until all out;
- every innings records why it closed.

**Database** (`apps/realtime/test-db/cricket.db.ts`)

| Test | What it proves |
|---|---|
| Saves an international T20 | The stored config keeps `version: 2`, format and teams. Details keep the scorecard. A fully simulated win is stored as neither a win nor a loss, earns no coins, and unlocks neither the six nor the wicket achievement |

**Browser** (`apps/web/e2e/cricket-formats.spec.ts`), against the production build and local servers:

| Test | What it proves |
|---|---|
| Teams and XI | All 20 teams are listed by name and selectable, including by keyboard (Enter). A side can't play itself. Dropping a player blocks the match until the eleven is complete. Reset to the default XI. The playing conditions are shown. Test cricket is shown as not playable |
| A T20 played, simulated, verified and saved | Sri Lanka v Ireland with the player's own batting order. Two deliveries by hand, the rest simulated. Each innings is at most 120 balls. The server verifies and saves. The result shows the format, both teams and "you played 2 balls", and the player's chosen opener is first in the scorecard |
| ODI resumed after a refresh | After three simulated overs and a reload, the same innings and sequence come back and play carries on |
| Phone width (390 px) | Setup, XI editor and match settings never scroll sideways; the XI buttons are at least 36 px wide |

## Simulated balance (during tuning)

From 30 matches per format at county difficulty (exploratory runs, not part of the suite):

| Format | Average innings | Wickets | Results |
|---|---|---|---|
| T20 | 142 runs (89 to 187) | 5.8 | Wins batting first and chasing, and a tie |
| ODI | 292 runs (170 to 352) | 7.4 | Wins batting first and chasing |

Server verification of a whole match took up to about 0.4 s of CPU for a T20 and about 1 s for an ODI (engine tests, this machine).

## Benchmarks (the existing duel benchmark; it doesn't play a T20 or ODI)

`0793ec8` → this work:

| Preset | RTX 3050 fps | p95 interval (ms) | Draw CPU median (ms) | Triangles | Software fps |
|---|---|---|---|---|---|
| Low | 30 → 30 | 33.4 → 33.4 | 4.1 → 4.2 | 137,046 → 137,224 | 21.9 → 24.8 |
| Medium | 60 → 60 | 16.7 → 16.8 | 4.2 → 4.2 | 163,874 → 164,224 | 8.6 → 9.2 |
| High | 60 → 59.9 | 16.7 → 16.7 | 4.7 → 4.7 | 503,109 → 502,591 | 4.0 → 4.2 |
| Ultra | 60 → 60 | 16.7 → 16.7 | 5.1 → 4.9 | 616,032 → 615,688 | 3.1 → 3.6 |

- Textures are unchanged (42 / 54), and there were no GPU hitches over 50 ms.
- The duel renders as before.
- In an international match on the dev server, the in-game counter read 60 fps on High at 1366 × 860 and 30 fps on Low at phone size. That is the game's own counter on the development server, not a benchmark run.

## Not tested

- Physical phones and tablets, Safari, and assistive technology beyond keyboard selection.
- A real Cloudflare Worker's CPU limit for an ODI verification.
- Matches played entirely ball by ball by a person (about 40 minutes for a T20, two hours or more for an ODI). The browser tests play some deliveries by hand and simulate the rest.
- Reconnection mid-request: a solo match runs in the browser and submits once. Refresh recovery is tested. A dropped connection during submission uses the existing retry path, which this work didn't change.
