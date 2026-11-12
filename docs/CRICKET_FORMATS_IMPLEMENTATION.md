# Sinverse Cricket: international teams and formats (implementation)

How the 20 international teams, T20, ODI and the Test cricket engine are built. For status by workstream see `CRICKET_IMPLEMENTATION_PROGRESS.md`; for test evidence see `CRICKET_TEST_RESULTS.md`.

## 1. Versions: the duel stays frozen

| | Version 1: the duel | Version 2: international |
|---|---|---|
| Config | `{ version: 1, format: "duel", overs: 1 \| 2, team: 0 \| 1, venue, difficulty }` | `{ version: 2, format: "t20" \| "odi", team, opponent, xi[11], captain, keeper, venue, difficulty }` |
| Teams | Harbour Lights, Ember Kites | Any two of the 20 catalogue teams |
| Log | `duelLogSchema`: toss and balls, at most 129 entries, 30 min | `formatLogSchema`: toss, balls (with `bowler`), `sim`, `declare`, `follow-on`; at most 4,000 entries, 6 h |
| Fields | `balanced`, `attack`, `boundary` | `attack` (2 out), `balanced` (4 out), `deep` (5 out) |
| Bowlers | The opposition's 7th and 8th players alternate | Rotation from the XI within quotas; the player picks at each over |
| Stored `details.format` | `"duel"` | `"t20"` / `"odi"`, plus `engine: 2`, `team`, `opponent` |

`configSchema` is `z.union([duelConfigSchema, formatConfigSchema])`, with the duel first, so `{}` still parses to the default duel. `logSchema` is the union of the two log shapes, and `verify` accepts only the log shape and time limit that match the config's version.

**Proof that version 1 is unchanged.** `packages/engines/test/cricket-v1-golden.test.ts` replays 96 complete duels and compares them with a corpus recorded from commit `0793ec8`, before any of this work:
- every seed, overs setting, difficulty and team;
- every ball's physics digest;
- innings totals, extras and falls;
- the result text;
- the verified summary, with a hash of the scorecard JSON.

A duel innings keeps its exact record shape: the new scorecard fields (`overBowlers`, `partnerships`, `maidens`, `closed`) appear only on version 2 innings.

## 2. Files

| File | What it holds |
|---|---|
| `packages/engines/src/sinverse-cricket/domain.ts` | Both config schemas (with catalogue validation of the XI), both log schemas, scorecard types |
| `formats.ts` | `FORMATS`: T20, ODI and Test playing conditions as data; the 30-yard circle, powerplays, field legality, days and sessions |
| `match.ts` | `CricketMatch` (both versions), `internationalSide`, bowler rotation and feasibility, the AI, simulated passages, Test cricket results, `replayMatch`, `sinverseCricket.verify` |
| `rules.ts` | The scorebook reducer: over-by-over bowlers, partnerships and maidens for version 2 |
| `physics.ts` | Unchanged physics; `Delivery` additionally accepts per-slot fielding skills (international sides only) |
| `teams.ts` | The catalogue: 20 teams, 15 fictional players each, default XI, captain, keeper, `validateSelection` |
| `apps/web/src/games/sinverse-cricket/international-setup.tsx` | Format, team, XI and settings screens |
| `crest.tsx`, `sides.ts` | Team crests; the current match's sides for the renderer's kits |
| `cricket-game.tsx` | Match screen: sides, limits, bowler picker, legal fields and variations, simulation, scorecards, recovery |

## 3. Rules as data (`FORMATS`)

| | T20 | ODI | Test (engine only) |
|---|---|---|---|
| Overs per innings | 20 | 50 | Unlimited |
| Innings per side | 1 | 1 | 2 |
| Bowler limit | 4 overs | 10 overs | None |
| Fielding restriction | Overs 1–6: at most 2 outside the circle; then 5 | 1–10: 2; 11–40: 4; 41–50: 5 | None |
| Follow-on | — | — | 200-run lead |
| Time | — | — | 5 days × 90 overs, 3 sessions a day; a draw when time runs out |
| Balls the player must control for a win to count | 30 | 60 | 120 |

**Every format:**
- No bowler bowls two overs in a row.
- Wides and no-balls are bowled again; a no-ball brings a free hit (the existing `adjudicate` conventions).
- An innings ends when all out, overs done, target reached, declared (Test) or time (Test).

**Results:**
- **Limited overs:** "won by N wickets (B balls left)", "won by N runs" or "Match tied".
- **Test:** innings victories, runs, wickets, ties and draws.

**The 30-yard circle.** It is two 27.432 m semicircles about the middle stumps, joined by straight lines. Fielders outside it: `attack` 2, `balanced` 4, `deep` 5, and the duel's `boundary` 7. That is why version 2 doesn't offer `boundary`.

## 4. Bowling: rotation, choice and feasibility

`bowlerOptions()` lists the fielding XI's bowling options for the coming over: never the keeper, never the previous over's bowler, and only bowlers with quota left. It also keeps only those that leave a schedule able to finish the innings. A multiset with no two equal neighbours exists when no bowler needs more than half the remaining slots, and the previous bowler can't open (`overPlanFeasible`). With exactly five bowlers × 4 overs in a T20, this is what stops a captain painting himself into a corner.

**Who chooses:**
- **The player's side:** a ball log at the start of an over may name the bowler (`bowler`, an XI slot). The engine rejects an illegal choice or one named mid-over.
- **The AI captain:** chooses the freshest strong option, preferring spin through the middle overs.

A player-bowled delivery must use a variation the bowler can bowl (`VARIATIONS_FOR`: pace bowlers seam and swing, spinners their own breaks). The UI offers only those, and the engine rejects anything else.

## 5. The AI (version 2 only)

**Batters** (`formatBattingForAI`) read only what a batter sees: the ball's line and height as it reaches them, predicted from the release, plus the match situation.
- **Shot choice:** the shot whose bat height suits the ball, a direction along its line, and the gaps in the field. Lofts aim at the gap between the boundary riders.
- **Timing:** an error set by the batter's batting attribute and the difficulty.
- **Leaving:** wide balls are left unless the batter is attacking.
- **Aggression:** varies by format and phase (T20 powerplay and death, ODI middle overs) and rises with the required rate.
- **Lofted shots:** become more frequent with aggression (cubed).
- **Running:** probed by replaying the struck ball deterministically: the safe runs are taken, and occasionally a risky extra one (always a valid call).
- **Blocking:** the physics' block carries on to the slips and keeper, so a careful batter pushes with a soft drive instead.

**Bowlers** use type-specific variations, lengths and pace from their bowling attribute and the difficulty. They occasionally overstep or stray down the leg side (a no-ball or wide), less often the better they are.

**Fielders** catch and throw with their fielding attribute; the keeper uses keeping.

**Difficulty applies only to the opposition.** When the AI plays for the player's own side (in a simulated passage) it plays at the neutral county level.

**Balance**, measured while tuning: 30 simulated matches per format at county difficulty.
- **T20:** an average innings of 142 runs for 5.8 wickets.
- **ODI:** 292 for 7.4.
- Extras run at 5 to 8 an innings, and both batting first and chasing win often (see the 100-match tests).

## 6. Simulated passages and fairness

A `{ k: "sim", seq, balls, t }` entry asks both captains (the AI) to play `balls` legal deliveries, stopping at the innings' end. The UI offers "Simulate over" and "Simulate innings". It is deterministic from the seed and sequence, so the server replays it exactly. The client never submits outcomes.

**Fairness:**
- The solo score counts only runs and wickets on deliveries the player controlled.
- A win counts as the player's (`completed`, rewards, `isWinner`) only after `minControlledBalls` of their own. Otherwise the match is stored with `details.uncounted = 1`, and `recordMatch` treats it like a tie: neither win nor loss (`packages/db/src/repositories.ts`).
- Achievement fields (`sixes`, `fours`, `wicketsTaken`) count the player's own deliveries only. Team totals are separate (`teamSixes`, `teamWickets`, `runs`).
- The existing rules still apply: a 30-second minimum, no claim of more game time than has passed, one submission per run ID, and the 80-coin daily cap.
- Every delivery the player controls still carries its physics digest and the real-time pacing check.

## 7. Persistence and compatibility

**No database migration.**
- `Match.config` stores the version 2 config; `MatchParticipant.details` stores `format`, `engine`, teams, result, `resultText`, team and controlled figures, `controlledBalls`, `simulatedBalls`, `uncounted` and the scorecard JSON.
- Old rows have `format: "duel"` and no `engine`, and are read exactly as before. The result view picks names from the catalogue when `engine === 2`, and from the duel teams otherwise.

**Refresh recovery.**
- `SoloClient.recoverable` may now be a function of the config. Cricket recovers version 2 runs only, so the duel keeps none, as before.
- The game rebuilds a resumed match with `replayMatch`, the same replay the server uses, and checkpoints after the toss, every delivery and every simulated passage.
- Snapshot validation is per game (`apps/web/src/lib/solo-recovery.ts`). Cuisine Quest keeps its level check.
- This is tab-scoped (`sessionStorage`), as for Cuisine Quest. It is not a cross-device save.

**Server verification cost.** Replaying a whole ODI took up to about 1 s of CPU in the engine tests on this machine (a T20 about 0.4 s), mostly the batting AI's running probes. The Cloudflare Workers plan's CPU limit isn't known from the repository; see `CRICKET_REMAINING_WORK.md`.

## 8. Test cricket

**Implemented in the engine** and covered by `cricket-formats.test.ts`:
- four innings, with the batting order following the follow-on;
- the follow-on: the leading side decides, the player by a `follow-on` log entry and the AI always enforcing;
- declarations: the player by a `declare` entry; the AI declares on 550 in a first innings, or with a lead of 380 (240 when fewer than 110 overs remain) in the third;
- innings victories, wins by runs or wickets, ties, and draws when 450 overs are used;
- lead and deficit targets;
- days and sessions (`dayAndSession`).

**Not offered as playable.**
- The public config schema rejects `format: "test"`, and the setup shows Test as "coming later".
- A five-day match (about 2,700 balls) exceeds the 6-hour run token, the 512 KB submit body and a single sitting.
- It needs server-side, resumable matches (a new table and a migration) and a multi-day presentation. See `CRICKET_REMAINING_WORK.md`.
