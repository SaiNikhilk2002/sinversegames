# Sinverse Cricket T20/ODI: security release review

A release-level review of how an international match goes from the browser to a saved result, and whether a modified client can award itself anything. Done by reading the code paths end to end, then checking them with existing and new tests. The fairness policy (30 / 60 personally played legal balls) was reviewed, not changed.

**Summary:**
- **No integrity vulnerability was found:** the client can't award itself runs, wickets, results or rewards.
- **One resource issue was found and fixed locally** (S1): an expensive replay could be repeated under the same run.
- Residual risks and product limitations are listed at the end. None is a release blocker, but S2 should be watched after release.

## The path, step by step

**1. `POST /api/solo/start`** (`apps/web/src/app/api/solo/start/route.ts`):
- Same-origin check, then a rate limit (60 a minute per IP, in memory per isolate).
- A session is required: a guest JWT, or a registered account session for email or Google. Every one resolves to a permanent `Player.id`.
- The config is parsed by the engine's `configSchema`. For version 2 (`formatConfigSchema`, strict) that means:
  - the format must be `t20` or `odi` (Test cricket is refused);
  - both teams must exist and differ;
  - **the XI must be a legal pick from the player's own squad** (`validateSelection`): 11 squad players, captain and keeper in the XI, five bowlers besides the keeper, and the rest of the rules in `teams.ts`.
- **The seed comes from the server's CSPRNG.** The run is signed into an HS256 token with `sub` = player id, game, seed, config, `jti` = a random UUID (the future match id) and a 6-hour expiry.

**2. Play in the browser:**
- The browser runs the same deterministic engine from that seed.
- It records only *inputs*:
  - the toss call;
  - for each delivery the player controls: the bowling plan or shot, run calls, the field preset, the bowler at an over's start, the physics digest, and the time;
  - `sim` entries that say only "simulate N balls".
- It never sends a score, scorecard or result.
- Refresh recovery keeps the token and this input log in `sessionStorage`, keyed by player and game. Editing it is the same as editing the log, and the server checks it in full.

**3. `POST /api/solo/submit`** (`apps/web/src/app/api/solo/submit/route.ts`). Checks, in order:
1. Same origin, then a rate limit (30 a minute per IP, per isolate).
2. A session.
3. The body, streamed, is at most 512 KB.
4. The token's signature, issuer, audience and expiry.
5. **`token.sub` must equal the session's player id** (403 otherwise).
6. The game id is known.
7. The config schema again, including the XI.
8. The log schema: strict entries; at most 4,000 entries for v2 and 129 for the duel.
9. **Cricket only, before the costly replay:**
   - the log's last time can't exceed the real time since the token was issued (+10 s);
   - a run whose log already failed verification is refused (S1, new);
   - **a run that is already saved is answered `409`** (S1, new).
10. **`verify`:**
    - The log must match the config's version (a duel token can't carry a v2 log, or the reverse).
    - Times must not decrease and must stay within 6 hours.
    - **Full replay:**
      - Every player-controlled delivery is re-simulated, and its digest must match the server's own physics.
      - Every gap must be at least 0.45× that delivery's flight time.
      - The bowler must come from `bowlerOptions()`: quota, not consecutive, never the keeper, and the schedule must still be finishable.
      - The field must be legal for the powerplay.
      - The variation must be one that bowler can bowl.
      - Every `sim` entry is played by the server's own AI.
      - Any impossible state rejects the log rather than throwing.
    - The match must be finished.
    - **The score, result, `completed` and every detail come from the server's replay.**
11. The game duration can't exceed real elapsed time (+10 s).

**4. `recordMatch`** (`packages/db/src/repositories.ts`), in **one transaction**:
- The `Match` row uses `id = jti`, a primary key, so a run can be saved once.
- Participants, statistics, XP, achievements and the Sin Coins ledger are written under the player row lock.
- A drawn or tied match, or an **uncounted** international win (fewer than 30 / 60 own balls), is neutral: neither a win nor a loss.
- Coins require: completed, at least 30 seconds, score > 0, and for solo games `isWinner`, which for international cricket means an *earned* win.
- The shared 80-a-day cap applies.
- If any write fails, everything rolls back.

## Checks

| Concern | Verdict | Evidence |
|---|---|---|
| Match / run ownership | ✅ The token's `sub` must equal the session player | `submit/route.ts`; existing browser tests |
| Session ownership across guest, email and Google | ✅ All three resolve to `Player.id` through `getSession()`; the token is bound to that id. Switching accounts mid-match makes the old run "belong to another player" (403), the intended behaviour | `lib/server/session.ts`; identity browser specs (10 passed) |
| Seed handling | ✅ Server CSPRNG, signed, not client-selectable | `start/route.ts` |
| Replay integrity | ✅ Per-delivery digests over the full physics state; any change to an input changes the digest | Stress run: 400 matches × 8 tamper kinds, all rejected |
| Duplicate submission | ✅ The primary key `Match.id = jti` in a transaction. **Now answered before replaying** (S1). Concurrent duplicates: both may replay, and one commits while the other gets `409` from the unique key | DB test "rejects duplicate result IDs atomically…"; browser tests `cricket.spec.ts` (409) and `cricket-release.spec.ts` (new) |
| Duplicate reward claims | ✅ Rewards are written in the same transaction as the unique match row | As above |
| Invalid delivery logs | ✅ Strict schemas, then the replay | Stress tamper kinds 1–5, 8 |
| Illegal fields | ✅ `fieldAllowed` per powerplay | Stress tamper kind 6; `cricket-ai.test.ts` |
| Invalid bowler changes | ✅ `bowlerOptions()` at every over | Stress tamper kind 7 (the keeper as bowler); quota and consecutive-over checks in every simulated innings |
| Invalid player ids | ✅ The XI is validated against the squad at start *and* submit. The log names bowlers only by an index into the checked XI | `formatConfigSchema`; `teams.ts` tests |
| Modified scorecards or results | ✅ Never accepted from the client. The server computes them | `verify` returns `match.summary()` |
| Simulated overs and innings | ✅ The server's AI plays them; the client sends only a ball count. Simulated balls don't count towards the player's 30 / 60, and a win built on them is recorded but not counted | DB test "never counts a simulated win"; stress check of the controlled-balls rule for every win |
| Fairness policy | ✅ Unchanged: T20 30, ODI 60 **legal** balls the player controlled. Their own wides and no-balls are reported separately (`controlledExtras`) and don't count | `cricket-rules-v2.test.ts` "the player's deliberate no-balls…" |
| Refresh recovery | ✅ Tab-scoped. The snapshot carries only the token and inputs, and is validated per game. Nothing in it is trusted | `solo-recovery.ts`; `cricket-formats.spec.ts`, `cricket-release.spec.ts` (refresh at the innings break) |
| Reconnection | Not applicable: cricket is solo and doesn't use the realtime service | — |
| Abandonment | An unfinished log is refused ("Finish both innings…"), so nothing is saved. An abandoned match records neither a loss nor a win (as for every solo game) | `verify` |
| Concurrency and races | ✅ One transaction, player row lock, unique match id | `recordMatch` |
| Replay version compatibility | ✅ The duel (v1) is unchanged; its 96-match golden corpus replays exactly, so duel tokens in flight across the release still verify. v2 is new in this release, so there are no older v2 runs | `cricket-v1-golden.test.ts` |
| Test cricket | ✅ Not exposed: the server schema refuses `format: "test"` | `cricket-formats.test.ts` |

## Findings

### S1 (fixed locally): one run could force the costly replay again and again

**Before:**
- A run that was already saved was replayed in full and only then refused with `409`, when the unique key clashed.
- A run whose log failed verification was never recorded, so the same token could be resubmitted until it expired (6 hours), each time costing a full replay.
- An international replay is CPU-heavy: about 0.1–0.5 s in local workerd for a real T20 or ODI, and up to about 2.3 s for a crafted log (S2). The cost on Workers is CPU time.

**Fix** (cricket only, in `submit/route.ts`; no policy change):
- **A saved run is answered `409` before replaying.** This is one primary-key read. Waiting on the database doesn't count as Workers CPU, and if the read fails, the request continues as before.
- **A run whose log failed `verify` isn't replayed again in that isolate.** Verification is deterministic, so the same log can never pass, and a different log under the same run is tampering.
  - The pace pre-check's rejections are deliberately *not* remembered: those can legitimately pass later.
  - The memory is per isolate and bounded to 10,000 run ids, like the existing rate limits.
- **One database client per request** instead of two. On Workers, `getDb()` builds a new client with its own connection each time it is called.

**Regression test:** `cricket-release.spec.ts`, "the server replays an international run's log once…". It covers an unfinished log (422), the same run with a valid log (422, already rejected), and a saved run resubmitted (409).

### S2 (residual, watch after release): the costliest log a modified client can send

A modified client can build a log that the server must replay in full before rejecting it:
- The player bowls the first innings and **oversteps on every ball**.
- No-balls aren't legal deliveries, so the innings never reaches its over limit, and the AI bats every one.
- The log is filled up to the 512 KB body limit.

The new bench builds exactly this (`buildNoBallFlood` in `packages/engines/bench/cricket-logs.ts`).

**Measured:** 2,992 deliveries in a 511 KB body, **2.05–2.31 s** in local workerd (`CRICKET_CLOUDFLARE_COMPATIBILITY.md`). That's about 5.5× the worst real ODI (about 0.4 s), but about 13× inside Workers Paid's 30 s default. On the Free plan it would fail like any T20/ODI submission.

**What bounds it:**
- The log's times must respect each ball's flight time, so a full-size crafted log claims 176–195 minutes of play, and the pace pre-check makes the sender **wait that long in real time** before submitting.
- After S1, each run can force that replay **once per isolate**.
- 30 submissions a minute per IP per isolate.
- A token costs a session and a start request (60 a minute per IP per isolate).

**Residual:** many runs prepared in parallel, then submitted together, can still cost CPU. That's inherent to authoritative replay, and the cost is CPU billing, not data integrity.

**Options, if Observability shows abuse:**
- (a) A Cloudflare WAF rate-limiting rule on `POST /api/solo/submit` (dashboard, approval required). It's global rather than per isolate.
- (b) Cap no-balls and wides per innings in the rules. That's a rules change, so it's for you to decide.
- (c) Verify on Railway (`CRICKET_PERFORMANCE_BENCHMARKS.md` option B).

## Residual risks and limitations (not blockers)

1. **Tool-assisted play.**
   - The browser knows the seed and has the engine, as the replay design requires. So a program could search for good inputs offline and submit them at a plausible pace.
   - Replay proves the match is *possible* and *paced like real time*, not that a human played it. This is the documented limit of every replay-verified solo game here.
2. **One leaderboard per game.**
   - Duel and international scores, at any difficulty, share Sinverse Cricket's statistics and leaderboards.
   - The player chooses the difficulty, and club opposition is easier. Scores aren't weighted by difficulty or format.
   - This is a product decision, not a security issue, but players can compare unlike matches.
3. **A simulated loss counts as a loss; a simulated win doesn't count.** This is consistent with "only wins you played count", but asymmetric.
4. **The run token lasts 6 hours,** and the log's game time is capped at 6 hours. An ODI left paused for longer can't be submitted.
5. **Rate limits are per isolate, in memory** (pre-existing). They damp abuse rather than enforcing a global limit.
6. **Future v2 engine changes.**
   - Any change to v2 physics, rules or AI invalidates v2 matches in progress when it deploys, and logs saved by an older version can't be re-verified by a newer one.
   - Before the next change to the v2 engine, freeze a v2 golden corpus, as was done for v1.

## Database compatibility (no migration)

- **Schema:** `packages/db/prisma` is unchanged from `main`. Production has all four migrations (applied 2026-11-05, `docs/PRODUCTION_MIGRATION_READINESS.md`).
- **What's written:** existing columns only.
  - `Match.config` (JSON) holds the v2 config.
  - `Match.id` is a UUID: the run's `jti`, which is always a server-generated UUID.
  - `MatchParticipant.details` (JSON) holds the summary, including the scorecard as a JSON string. Measured over the bench's 80 real matches: scorecard 4.7–6.3 KB, whole details at most 7.8 KB, for T20 and ODI alike (the scorecard lists batters and bowlers, so it doesn't grow with overs).
  - `PlayerGameStats`, `PlayerAchievement` and the ledger are written as before.
- **Shared change:** in `recordMatch`, "draw" or `uncounted` is neutral for `sinverse-cricket` and `chef-rivals`. Chef Rivals only ever reports "tie", so its behaviour is unchanged.
- **Tested** on real local PostgreSQL by `pnpm test:db`, including the international T20 case.
- **Existing records:**
  - Guest and registered players, Sin Coins, cosmetics, achievements and match history aren't migrated, rewritten or reset.
  - The new code only adds rows of existing kinds.
  - Old duel rows still display.
  - After a rollback, v2 rows display through the profile's generic solo summary (checked against `main`'s `profile/page.tsx`).
