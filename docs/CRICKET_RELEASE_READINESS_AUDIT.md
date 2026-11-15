# Sinverse Cricket: release-readiness audit

The starting audit for the T20 and ODI release candidate, recorded before changes and updated with what was done about each finding. The final evidence is in `CRICKET_RELEASE_READINESS_REPORT.md`.

## Starting state (verified, 2026-11-13)

**Git:**
- Branch `feature/unified-platform`, HEAD `98dca74`, working tree clean.
- 4 commits ahead and 0 behind `origin/feature/unified-platform`: `51280d8`, `70cb151`, `e35cd2d`, `98dca74`, as reported.
- No uncommitted or user-owned work was present.

**Baseline tests (before any change):**
- `pnpm typecheck` passed.
- `pnpm test`: 556 passed (shared 32, engines 463, realtime 61).
- That run used the shell's default Node 20.20.2. Every later run used the pinned Node 24.14.0.

## Lifecycle traced

1. **Setup:**
   - `InternationalSetup` builds a version-2 config: format, team, opponent, XI, captain, keeper, venue, difficulty.
   - `formatConfigSchema` validates it, including `validateSelection` against the catalogue.
2. **Start:**
   - `POST /api/solo/start` checks origin, rate limit and session, then re-parses the config with the same schema.
   - The server picks the seed and signs `{player, game, seed, config, runId}` into a 6-hour run token.
3. **Toss and match:**
   - The browser runs the same `CricketMatch`.
   - Each delivery the player controls is logged as an intent (bowling or shot inputs, run calls, field, the bowler at an over's start) with the physics digest and game time.
   - Simulated passages are logged as `{k:"sim", seq, balls, t}` only, never outcomes.
4. **Recovery:** after the toss, every delivery and every simulated passage, the log is checkpointed to `sessionStorage` (per tab), and `replayMatch` rebuilds it after a reload.
5. **Submit:**
   - `POST /api/solo/submit` checks origin, rate limit, session, a body of at most 512 KB, the token signature and expiry, and that the token belongs to this player.
   - It re-parses config and log, then `verify` runs: the log shape for this version, the timeline, then a full replay from the signed seed.
   - Both browser and server compute the summary from the replay.
   - Game time is checked against real time since the token was issued.
6. **Persist:**
   - `recordMatch` runs one transaction under the player's row lock: `Match` (id = run id, so a second submit conflicts), participant details, stats, XP, achievements, and Sin Coins with the 80-coin daily cap.
   - A win the player didn't play enough of (`uncounted: 1`) counts as neither a win nor a loss.
7. **Result:** the in-game finish card, then the solo runner's result view parses `details.scorecard`.

## Server/client boundaries

| Boundary | Trusted from the client | Verified by the server |
|---|---|---|
| Config | Only through the signed token issued at start | Schema with catalogue validation at start, at submit and in the engine |
| Seed | Never | Server-generated and signed |
| Deliveries | Inputs and digest | Full physics replay; digest and pacing per delivery |
| Simulated passages | `balls` count and time | Replayed by the server's AI from the seed |
| Score, result, achievements | Never | Computed from the replay |
| Ownership | — | `run.sub === session player` |
| Duplicates | — | Run id is the `Match` id (unique) |

## Findings (by severity) and what was done

| # | Severity | Finding | Done |
|---|---|---|---|
| 1 | **High** | An XI whose keeper was one of its five bowlers passed validation; four bowlers can't legally bowl 20 or 50 overs. The rotation would run out of legal bowlers, and the AI's fallback could break the quota | Fixed in `validateSelection` (refused, with an explanation). Engine and browser tests |
| 2 | **High** | AI difficulty was partly inverted: "elite" bowling raised only pace, which in this physics is easier to score from. In T20, elite bowling conceded *more* than club (154 against 135 runs an innings, 30-match sample) | AI bowling rebuilt around plans and accuracy (`CRICKET_AI_OPPONENT_REPORT.md`). Difficulty is now monotonic in every measure; tests added |
| 3 | Medium | Run-outs: before the batters crossed, the wrong batter was out; afterwards the new batter could be left at the wrong end | Fixed (v2) and pinned |
| 4 | Medium | Runs off a ball both wide and a no-ball were lost from the score | Fixed (v2) and pinned |
| 5 | Medium | The fairness threshold counted wides and no-balls the player bowled, so deliberate extras could inflate it | Only legal balls count now. Extras are reported separately |
| 6 | Medium | Server verification CPU: up to about 0.5 s locally for an ODI, with the batting AI re-simulating every running option from release | About 45% less (`CRICKET_PERFORMANCE_BENCHMARKS.md`). The Cloudflare plan limit is still unknown |
| 7 | Medium | Impossible-pace logs were refused only after the full replay | Refused before the replay, for cricket only |
| 8 | Low | A no-ball didn't count as a ball faced | Fixed (v2) |
| 9 | Low | A drawn Test reported "day 6" | Fixed |
| 10 | Low | The innings break was a single line that continuous play skipped automatically; the result showed only standouts; the setup gave no strength comparison of the elevens actually picked | International innings-break card, which waits for the player; result awards and "your part"; team and XI comparison; XI summary before the start |
| 11 | Low | Pressing Enter on a focused button inside the match also fired the game's action key (a second action) | Enter on a button is no longer a gameplay key, as Space already wasn't |
| 12 | Info | Abandoning a losing solo match records nothing, so it isn't a loss. Shared by every solo game | Documented; not changed. It's the platform's solo model |
| 13 | Info | Dropped connection at submit: the existing retry path; duplicates conflict on the run id | Unchanged; documented |

## Not changed, deliberately

- **The duel (version 1):**
  - its physics, scoring and AI are frozen;
  - every fix is gated to version 2;
  - 96 recorded duels still reproduce exactly.
- **The fairness thresholds:** 30 and 60 balls.
- **Database:** no migration.
- **Other games:** the solo routes' behaviour for other games is unchanged; the new timing pre-check applies to cricket only.
