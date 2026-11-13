# Sinverse Cricket: T20 and ODI rules validation

An independent check of the international (version 2) rules: the engine source was read rule by rule, rather than taking the existing tests on trust. Every discrepancy found was fixed and pinned with a regression test.

**Scope:**
- Rules: `packages/engines/src/sinverse-cricket/` (`physics.ts`, `domain.ts`, `rules.ts`, `match.ts`, `formats.ts`, `teams.ts`).
- The 1- and 2-over duel (version 1) is frozen by design. Its 96-match golden corpus still reproduces exactly. Where a fix below applies to version 2 only, the duel keeps its original, documented house conditions.

**Status key:**
- ✅ Correct as found.
- 🔧 Fixed in this work.
- ⚠️ Intentionally simplified, with the limitation stated.

## Batting and innings

| Rule | Status | Implementation and evidence |
|---|---|---|
| Legal deliveries make up overs of six; wides and no-balls are bowled again | ✅ | `adjudicate` marks `legal`; `scoreDelivery` counts only legal balls. Tested in `cricket-rules-v2.test.ts` ("strike changes…", "extras…") and checked per ball in the stress run |
| Strike changes on an odd number of runs completed, never on a boundary | ✅ | `completedRuns` is 0 for boundaries. Checked ball by ball in the 1,000-match stress run (`bench/cricket-stress.ts`) |
| The batters change ends after each over, so the other batter faces | ✅ | `scoreDelivery` swaps at `balls % 6 === 0` |
| A new batter comes in the batting order after a wicket | ✅ | `nextBatter`; partnerships restart. Tested |
| Caught: the new batter takes strike unless the over has ended (ICC 2022 playing conditions) | ✅ | The dismissed striker's slot takes the new batter; the end-of-over swap follows. Test: "after a caught dismissal…" |
| **Run-out: which batter is out** | 🔧 | **Was:** the batter running towards the broken wicket was always out, even before the batters had crossed. **Now (v2):** before they cross, the batter who left that wicket is out (Laws 29 and 38: the batter nearer the broken wicket). Test: "a run-out before the batters cross…", with a pinned deterministic delivery |
| **Run-out: where the new batter comes in** | 🔧 | **Was:** the new batter took the dismissed batter's slot, so after a run-out at the striker's end he could be left at the non-striker's end. **Now (v2):** the wicket broken is the striker's end, so the new batter comes in there, on strike, unless the over has ended. Test: "after a run-out the new batter comes in at the broken wicket…" |
| Dismissal eligibility: no-ball allows only run-out; free hit allows only run-out; wide allows stumped or run-out | ✅ | `adjudicate`, plus the physics guards on bowled, lbw, caught and stumped. Test: "a free hit follows a no-ball…" |
| LBW | ⚠️ | Modelled geometrically: pitched in line or on the off side, impact in line, projected to hit, no no-ball or free hit. No umpire's call or DRS |
| All out at 10 wickets | ✅ | `applyFormat` closes the innings. Checked in every simulated innings |
| Target and termination: the chase ends the moment the target is reached; a boundary off the winning ball counts in full | ✅ | `closeInnings("target")`. Checked in 1,000 stress matches (result follows the totals) |
| Final over and final ball | ✅ | The innings ends at `overs × 6` legal balls. A wide or no-ball off the "last" ball is bowled again |
| Extras: wides (all runs off a wide are wides), no-balls (1 plus runs off the bat or as byes), byes, leg-byes (only when a shot was attempted) | ✅ | `Delivery.finish` and `adjudicate`. Test: "extras: wides and no-balls are charged…" |
| **A ball both wide and a no-ball** | 🔧 | **Was:** the no-ball took precedence, but runs the batters ran off it were lost from the score, while the strike still changed. **Now (v2):** a no-ball extra plus those runs as byes (Laws 21.14 and 21.10). Test: "runs taken off a ball that is both wide and a no-ball…" |
| **Balls faced on a no-ball** | 🔧 | **Was:** a no-ball didn't count as a ball faced. **Now (v2):** it does (a wide doesn't), as scorers record it. Test: "a no-ball counts as a ball faced…" |
| Free hit: follows any no-ball, continues if the free-hit ball is a wide or no-ball | ✅ | `scoreDelivery`; tested |
| Free hit: field may not be changed unless the striker changes | ⚠️ | Not enforced; the field is a whole-field preset chosen per ball |
| Retired hurt, retired out, obstructing, hit wicket, handled ball, timed out | ⚠️ | Not modelled; no such event occurs in the physics |

## Bowling

| Rule | Status | Implementation and evidence |
|---|---|---|
| Overs per bowler: T20 4, ODI 10 | ✅ | `bowlerOptions` quota. Checked for every innings of 1,200 simulated matches (100 + 100 suite, 500 + 500 stress) |
| No bowler bowls consecutive overs | ✅ | `bowlerOptions` excludes the previous over's bowler; checked as above |
| The schedule can always be finished | ✅ | `overPlanFeasible`. The stress run asserts a legal bowler exists at every over |
| **The wicketkeeper can't bowl, so the XI needs five other bowlers** | 🔧 | **Was:** an XI whose keeper was one of its five bowlers passed validation. That left four bowlers who can't bowl 20 overs at four each, so the match would run out of legal bowlers (100 such picks across the 20 teams). **Now:** `validateSelection` refuses it with an explanation, and so do the config schema and the setup screen. Tests: "rejects an XI whose wicketkeeper is one of only five bowlers" (engine), and the XI rules browser test |
| Maidens: a complete over with no runs charged to the bowler (byes and leg-byes don't count) | ✅ | `overRuns` excludes byes and leg-byes. Test: "a maiden is…" |
| Economy: runs conceded per six legal balls | ✅ | Scorecard `Econ`. Bowler runs = total − byes − leg-byes, checked in every innings |
| Dismissal credit: bowled, lbw, caught and stumped to the bowler; run-out not | ✅ | `scoreDelivery`. The stress run checks bowler wickets = wickets − run-outs |
| Extras charged to the bowler: wides and no-balls, not byes or leg-byes | ✅ | Tested |
| Incomplete overs and innings endings | ✅ | An unfinished over counts as `O.b`; it is not a maiden |
| Legal bowling changes: the player picks the bowler only at an over's start, from legal options; never the keeper; a variation the bowler can bowl | ✅ | `bowlerForBall`, `VARIATIONS_FOR`. Tampered logs naming the keeper are rejected (stress, tamper case 6) |

## T20

| Rule | Status | Evidence |
|---|---|---|
| 20 overs a side | ✅ | `FORMATS.t20.overs`; the over limit is checked in every innings |
| Powerplay overs 1–6: at most 2 fielders outside the circle; then at most 5 | ✅ | `powerplayFor` and `fieldAllowed`. Boundary tests at overs 6 and 7 ("fielding restrictions change exactly…"). Every AI field is checked legal per ball (`cricket-ai.test.ts` and the stress run) |
| 4 overs a bowler | ✅ | As above |
| Target = first-innings runs + 1 | ✅ | `target`; the innings-break browser test checks the target shown |
| Tie | ⚠️ | No Super Over: a tie is recorded as "Match tied", which counts as neither a win nor a loss. There were 6 ties in 500 T20 stress matches |

## ODI

| Rule | Status | Evidence |
|---|---|---|
| 50 overs a side | ✅ | As T20 |
| Powerplay 1 (overs 1–10): 2 out; Powerplay 2 (11–40): 4 out; Powerplay 3 (41–50): 5 out | ✅ | Exact boundary tests at overs 10/11 and 40/41 |
| Catching-fielder minimums in Powerplay 1 | ⚠️ | Not modelled; field presets fix the catchers |
| 10 overs a bowler | ✅ | As above |
| Target and chase completion | ✅ | As T20 |
| Rain, DLS, over-rate penalties, a new ball from each end | ⚠️ | Not modelled (see `CRICKET_REMAINING_WORK.md`) |

## Test cricket clock (engine only)

| Rule | Status | Evidence |
|---|---|---|
| **The day and session once all 450 overs are bowled** | 🔧 | **Was:** reported "day 6" after a drawn match's final ball. **Now:** the last over's day and session. Test: "reports the last day, not a sixth…". This came to light once the improved AI produced matches that lasted the full five days |

## Fairness rule refined

| Rule | Status | Evidence |
|---|---|---|
| **A win counts as the player's after 30 (T20) or 60 (ODI) balls they played themselves** | 🔧 | **Was:** wides and no-balls the player bowled counted towards the threshold, so deliberate no-balls could inflate it. **Now:** only legal balls count. Extras the player bowled are reported separately (`controlledExtras`). The thresholds are unchanged. Test: "the player's deliberate no-balls…" |

## How the rules were exercised

**Unit and regression tests** (`pnpm test`):
- `cricket-rules-v2.test.ts`: 13.
- `cricket-ai.test.ts`: 8.
- `cricket-awards.test.ts`: 3.
- The existing `cricket-formats.test.ts`, 100-match T20 and ODI suites, v1 golden corpus and duel tests.

**Stress run** (`CRICKET_MATCHES=500 pnpm --filter @platform/engines stress:cricket`):
- 500 T20 and 500 ODI matches.
- Varied seeds, team pairs, difficulty, ground, toss, and the player's own play: none, every 7th, 4th or 2nd over.
- **Checked:**
  - ball by ball: runs added, strike parity, end changes, wickets, free hits, legal fields and bowlers;
  - innings by innings: arithmetic, quotas, consecutive overs, partnerships, maidens, closure;
  - results;
  - exact server verification and agreement with the browser's summary for every match;
  - the controlled-balls rule for every win.
- **Tampering:** 3,200 tampered logs were all rejected, eight kinds on 400 matches:
  1. a changed digest;
  2. a skipped sequence number;
  3. a truncated log;
  4. a duplicated entry;
  5. time running backwards;
  6. an illegal powerplay field;
  7. the keeper named as the bowler;
  8. impossible pace.

Results are in `CRICKET_RELEASE_READINESS_REPORT.md`.
