# Sinverse Cricket: next-phase audit (teams and formats)

Audited on 2026-11-13. Branch `feature/unified-platform`, HEAD `0793ec8` (the same commit as `origin/main`'s merge parent), with a clean working tree.

## 1. What is implemented today

| Area | Status | Evidence |
|---|---|---|
| Match format | **One format only: the "duel"**, 1 or 2 overs per innings, two innings | `configSchema` in `packages/engines/src/sinverse-cricket/domain.ts`: `version: 1`, `format: "duel"`, `overs: 1 \| 2` |
| Teams in play | **Two fictional sides**, Harbour Lights and Ember Kites, 11 names each | `TEAMS` in `content.ts`; `config.team` is `0 \| 1` |
| 20 international teams | **Data only.** 20 teams × 15 fictional players with roles, attributes, kits, emblems, a default XI, captain and keeper, plus `validateSelection` | `teams.ts`. Imported only by `packages/engines/test/cricket-teams.test.ts`. The web app, engine and setup never read it |
| Team or XI selection UI | **None.** The setup screen picks one of the two duel sides | `CricketSetup` in `apps/web/src/games/sinverse-cricket/cricket-game.tsx` |
| T20, ODI, Test, T10, The Hundred | **Not implemented.** Planned in `docs/CRICKET_FORMATS_EXPANSION_PLAN.md` (phases F2 to F8) | No rules, config or UI exist |
| Bowling changes | Fixed: the opposition's 7th and 8th players bowl alternate overs | `openInnings` uses `players.slice(6, 8)`; `scoreDelivery` uses `bowlers[floor(balls / 6)]` |
| Extras, free hit, run-outs, catches, stumpings, LBW | Implemented, as house playing conditions | `adjudicate` in `domain.ts`; `physics.ts` |
| Scorecard | Batting and bowling figures, extras, fall of wickets, current partnership | `Innings` in `domain.ts`; `Scorecards` in `cricket-game.tsx` |
| Presentation | 3D broadcast renderer, realistic athletes, replays, ceremonies | `apps/web/src/games/sinverse-cricket/` |

## 2. How a match flows today

1. **Setup.** The browser chooses a config (`CricketSetup`).
2. **Start.** `POST /api/solo/start` validates the config with the game's `configSchema`, picks a seed on the server and signs both into a run token (`signRunToken`, 6-hour TTL).
3. **Play.** `CricketGame` builds a `CricketMatch(seed, config)`.
   - Every delivery is simulated by `Delivery` (120 Hz physics) from the inputs.
   - The client logs `{ k: "ball", seq, bowling, shot, runAt, field, digest, t }` per ball. The AI's side of each ball is derived from the seed, so it isn't logged.
4. **Submit.** `POST /api/solo/submit` replays the log with `sinverseCricket.verify`, which recomputes every digest and the summary.
   - It rejects any log that disagrees, anything faster than real time, and duplicates (the run ID is the match's primary key).
   - Body limit: 512 KB.
5. **Persist.** `recordMatch` (`packages/db/src/repositories.ts`) writes `Match` (config JSON) and `MatchParticipant` (details JSON), updates `PlayerGameStats`, XP and achievements, and grants Sin Coins from the append-only ledger.
   - Coins need a completed result, at least 30 s, a positive score and, for solo games, a win.
   - Ties are neutral.
6. **Replay.** Highlights are re-simulated on the client from the same deliveries.

**Persistence needs no migration for new formats.**
- `Match.config` and `MatchParticipant.details` are JSON, and `details.format` already exists (`"duel"`).
- New formats can be recorded with explicit `format` and engine-version metadata.
- Old rows keep `version: 1` / `format: "duel"` and are interpreted exactly as before.

## 3. Limits that matter for long formats

| Limit | Value | Effect |
|---|---|---|
| Log entries | 129 (`logSchema.max`), `seq` ≤ 127 | A T20 (240+ balls) or ODI (600+) doesn't fit: v2 needs its own log schema |
| Game time | 30 min (`checkTimeline(…, 1800000)`, `t` ≤ 1,800,000) | Too short for T20/ODI played ball by ball: v2 needs a longer bound |
| Pacing | Each ball must take ≥45% of its simulated time in real time | Keeps a person playing every delivery in real time. Long formats need an honest way to move past overs: simulated passages that the server replays |
| Run token | 6 h | Enough for a T20, and an ODI with simulated passages. Not enough for a 5-day Test in one sitting |
| Submit body | 512 KB | About 260 bytes per logged ball: an ODI fits, a full Test played ball by ball does not |
| Recovery | Cricket isn't `recoverable` | Refresh recovery (tab-scoped `sessionStorage`) must be enabled for long formats |
| Server CPU | Verification replays every ball's physics | Scales with balls; measured in the engine tests. The Cloudflare Workers CPU plan isn't known from the repository |

## 4. Technical risks

1. **Changing v1 behaviour.** Any edit to `Delivery`, `adjudicate`, `scoreDelivery` or the AI could silently change old duel digests and stored scores.
   - Mitigation: a golden corpus recorded before any change (`packages/engines/test/cricket-v1-golden.test.ts`, 96 complete duels with every ball digest and summary).
   - All new rules apply only to `version: 2` configs.
2. **Reward farming through simulated passages.** A simulated match could be won without playing.
   - Mitigation: only balls the player actually controls count towards the solo score, and a win counts only after a minimum number of controlled balls.
   - Existing rules still apply: a 30-second minimum, real-time duration checks and the 80-coin daily cap.
3. **Fielding restrictions.** Two of the existing named fields put more fielders outside the 30-yard circle than real limits allow (`balanced` 5, `boundary` 7). v2 uses its own field sets and checks the limit per over; v1 is unchanged.
4. **Renderer assumptions.** Kit colours and names come from the two duel teams in `scene.ts`, `realistic.ts`, `character.ts`, `tactical.ts` and `stadium.ts`. They need a per-match source.
5. **Test cricket in one sitting.** Five days of play (about 2,700 balls) exceeds the run token, the submit body and practical play time.
   - A playable Test needs server-side, resumable matches: a new table and a migration, which needs approval.
   - Only the engine rules can be built safely now.

## 5. Compatibility requirements

- `version: 1` configs, logs, digests and summaries are frozen (golden corpus).
- Stored records: `details.format` is `"duel"` on all existing rows. New rows carry `format` and `engine`.
- No database schema change for T20 and ODI. Achievements keyed on `details.sixes`, `details.wicketsTaken` and `isWinner` keep working.
- Identities, wallets, cosmetics, progression and other games are untouched.

## 6. Baseline

All on `0793ec8`:

| Check | Result |
|---|---|
| `pnpm --filter @platform/engines test` | 12 files, 446 tests passed (4.3 s) |
| `pnpm typecheck` | Passed (all packages) |
| Full regression on 2026-11-12, same commit (`docs/SINVERSE_CRICKET_CHARACTER_REALISM_REPORT.md`, section 14) | 539 unit and integration, 65 PostgreSQL, 188 browser passed (0 failed, 10 recorder skips), production and Linux OpenNext builds passed |
| New v1 golden corpus | 96 duels recorded and reproduced |
