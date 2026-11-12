# Sinverse Cricket: teams and formats progress

Work on `feature/unified-platform` starting from `0793ec8`, 2026-11-13. Design: `CRICKET_FORMATS_IMPLEMENTATION.md`. Evidence: `CRICKET_TEST_RESULTS.md`. Not done: `CRICKET_REMAINING_WORK.md`. Starting audit: `CRICKET_NEXT_PHASE_AUDIT.md`.

## Status by workstream

| Workstream | Status | Notes |
|---|---|---|
| A. 20 playable teams | **Done** | Any two of the 20 meet. Each plays its catalogue squad: the player's own XI, and the opposition's default XI. Kits, crests, names, bowling types and attributes are used in the match |
| Playing XI selection | **Done end to end** | Pick or drop from the 15-man squad, batting order, captain and keeper, validated in the UI, the config schema and the engine. The chosen eleven bat in that order, bowl and field; the opposition's XI can't be chosen yet |
| B. T20 | **Playable end to end** | 20 overs, 4 overs a bowler, the 6-over powerplay, extras and free hits, targets, results, full scorecard, server verification. No Super Over: a tie is a tie |
| C. ODI | **Playable end to end** | 50 overs, 10 overs a bowler, three powerplays with their own fielding limits, required rates, results, full scorecard, refresh recovery |
| D. Test cricket | **Engine implemented, not playable** | Follow-on, declarations, innings victories, wins, ties, draws on time, days and sessions, all tested. Not offered, because a five-day match needs server-side resumable matches (a migration) |
| E. Match setup | **Done** | Format (Duel, T20, ODI; Test shown as coming later), teams, XI, ground, difficulty, playing conditions summary. The duel setup is unchanged and still the default |
| F. Presentation and scorecards | **Done for T20 and ODI** | Score, overs out of the format's limit, powerplay label and balls left, run and required rates, target, batters, the coming bowler and his figures. Innings break with target and required rate; result. Scorecard with dismissal text, maidens, economy, extras, falls and partnerships |
| G. Validation | **Done** | 200 simulated matches with invariants, rule and tamper tests, a v1 golden corpus, database and browser tests (see the test results) |
| H. UI, accessibility, performance | **Done for what was built** | Keyboard selection, focus rings, phone layout without sideways scroll, the existing benchmark unchanged. No physical-device or Safari testing |
| I. Database and compatibility | **Done, no migration** | New rows carry `format` and `engine`. Old rows are read as before. A fully simulated win is stored as neither a win nor a loss |

## How the player's part stays honest

- Each match lets the player choose, at any point, between playing a delivery themselves and simulating an over or the innings.
- Simulated deliveries are replayed by the server from the seed and score normally in the match.
- The player's solo score and achievements count only what they did themselves.
- A win counts as theirs (rewards, wins) after 30 controlled balls in a T20 and 60 in an ODI.

## Commits (local, not pushed)

| Commit | What |
|---|---|
| `51280d8` | Engine v2 (teams, XI, T20, ODI, Test engine), setup, match screen, engine and database tests, audit |
| `70cb151` | Refresh recovery for international matches; browser spec |
| `e35cd2d` | Names the coming bowler before an over; hides the bowler picker between innings |
| *(this commit)* | Documentation |

Nothing was pushed, merged or deployed, and no production data or infrastructure was touched.
