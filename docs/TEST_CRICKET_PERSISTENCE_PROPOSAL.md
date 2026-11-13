# Test cricket: server-side saved matches (proposal)

**Status: proposal only.** Nothing here is built, migrated or enabled. Test cricket stays unavailable to players until you approve the migration and the plan below.

**Context:**
- The Test match rules already exist in the engine and are tested: four innings, the follow-on, declarations, innings victories, ties, draws when time runs out, and days and sessions. See `CRICKET_FORMATS_IMPLEMENTATION.md`, section 8.
- What's missing is the way a match lives on the server between visits.

## 1. Why the current solo path can't carry a Test match

Today a solo run is one signed token, played in one browser tab and submitted once (`/api/solo/start` → `/api/solo/submit`). A Test match breaks four of that path's limits:

| Limit today | Where it's set | A Test match |
|---|---|---|
| The run token lasts 6 hours | `RUN_TTL_SECONDS` in `packages/shared/src/identity/tokens.ts` | Up to 450 overs, or about 2,700 deliveries. Played by hand at a T20's pace, that is about 9 hours or more. It's meant to be played over several sittings |
| The submitted body is at most 512 KB | `MAX_BODY_BYTES` in `/api/solo/submit` | A hand-played Test log is about 2,700 entries × about 200 bytes ≈ 540 KB |
| The log has at most 4,000 entries and game time of at most 6 hours | `formatLogSchema`, `FORMAT_MAX_MS` | 4,000 is enough, but 6 hours is not |
| Recovery is per browser tab | `sessionStorage` in `lib/solo-recovery.ts` | It must resume on another day, and on another device for signed-in players |
| Verification replays the whole match | `sinverseCricket.verify` | Measured locally: about 0.3 s of CPU for an ODI of about 590 deliveries. A Test of about 2,700 deliveries would be about 1.3–1.5 s in one request. See `CRICKET_PERFORMANCE_BENCHMARKS.md` |

## 2. Proposed design: verified segments with a server snapshot

The server keeps the match's verified state. The browser plays a **segment** (a session of up to about 30 overs, or until stumps, a declaration or the end of an innings) and submits only that segment's entries. The server replays them from its stored snapshot, not from the first ball. The authoritative rules don't change: the same engine, the same seed, the same digests and the same pacing checks.

### 2.1 Schema (one additive migration)

```prisma
enum CricketSavedStatus {
  ACTIVE
  FINISHED
  ABANDONED
}

/// A long-form cricket match kept on the server between visits (Test cricket).
model CricketSavedMatch {
  id             String             @id @db.Uuid          // Becomes the Match id when the match is recorded
  playerId       String             @db.VarChar(64)
  engine         Int                                       // Engine version that wrote the snapshot (2 today)
  format         String             @db.VarChar(16)       // "test"
  config         Json                                      // The validated version-2 config
  seed           BigInt                                    // Server-chosen and never accepted from the client
  status         CricketSavedStatus @default(ACTIVE)
  seq            Int                @default(0)            // Next delivery sequence the server expects
  segments       Int                @default(0)
  snapshot       Json                                      // Engine state after the last verified segment (versioned)
  logHash        String             @db.VarChar(64)       // SHA-256 chain over every accepted entry (audit and idempotency)
  lastSegment    Json?                                     // The last accepted segment, to answer a retry identically
  gameTimeMs     Int                @default(0)
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt
  lastSegmentAt  DateTime           @default(now())
  expiresAt      DateTime                                  // Abandoned after 30 days without a segment
  player         Player             @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@index([playerId, status, updatedAt(sort: Desc)])
  @@index([status, expiresAt])
}
```

**In the SQL migration:**
- A partial unique index allows at most one active Test per player: `CREATE UNIQUE INDEX ... ON "CricketSavedMatch" ("playerId") WHERE status = 'ACTIVE'`.
- `CHECK` constraints for `seq >= 0` and `segments >= 0`.

**What it doesn't touch:**
- It changes no existing table.
- `Player` gains only the back-relation field in Prisma; no column is added.

### 2.2 Engine work, a prerequisite with no schema involved

- `CricketMatch.snapshot()` and `CricketMatch.restore(seed, config, snapshot)`. The snapshot holds:
  - the innings records;
  - `seq` and `lastTime`;
  - `matchBalls`;
  - the follow-on state;
  - the controlled and simulated counters;
  - `recentVariations` and `recentDirections` (the duel AI reads them);
  - the phase;
  - a schema version.
- It is validated with Zod on restore.
- **Property test:** for many seeds and split points, restore-and-continue equals the uninterrupted match, entry by entry: the same digests, the same summary.
- **Golden test:** v1 duels and v2 T20/ODI matches don't change.

### 2.3 Lifecycle

| Step | Endpoint (new) | Server checks |
|---|---|---|
| Start | `POST /api/cricket/saved` `{ config }` | Same origin, rate limit, session, ban check. The config schema accepts `format: "test"` only on this route, while the public solo config keeps refusing it. One active match per player (the partial unique index). The server picks the seed. It returns the id, the seed and the snapshot. **The seed is revealed to the owner only**, as for today's solo runs |
| Play a segment | `POST /api/cricket/saved/:id/segment` `{ fromSeq, entries[], clientHash }` | **Ownership:** `playerId` must equal the session player, or 404. Status must be ACTIVE. `fromSeq` must equal the stored `seq`; otherwise 409 with the current `seq`, so the client resyncs. At most 600 entries and 128 KB. Then restore the snapshot, replay the entries with the same `record`/`simulate`/`declare`/`followOn` code, and check pacing: segment game time ≤ real time since `lastSegmentAt` + 10 s. All of it is written in one transaction under a row lock (`SELECT ... FOR UPDATE`): the snapshot, `seq`, `logHash`, `lastSegment` and `lastSegmentAt` |
| Retry after a dropped response | the same request | If `fromSeq` + entries hash to the stored `lastSegment`, return the stored result (idempotent) |
| Resume | `GET /api/cricket/saved/active` | Returns the owner's active match: the id, the snapshot, `seq` and the day or session. The browser rebuilds the match with `restore`. This works on any device signed in to the same player |
| Finish | (the final segment) | When the engine reports `finished`, the same transaction calls `recordMatch` with `id = savedMatch.id`. That reuses the existing rewards, the 80-coin daily cap, achievements and neutral results. The status becomes FINISHED. `matchMinControlledBalls` (120) still decides whether a win counts |
| Abandon | `POST /api/cricket/saved/:id/abandon`, or lazy expiry | The status becomes ABANDONED. Nothing is recorded, so it's neither a win nor a loss, as an unsubmitted solo run is today. Expiry is applied when read; no scheduler is needed |

### 2.4 Security and ownership

- **The client still submits only intents** (moves and simulation requests), never scores or outcomes. Every delivery is replayed from the stored seed.
- **The seed is server-held:** it isn't in a client-signed token. It's revealed only to the owner, which is the same exposure as today's solo runs.
- **Strict ordering:** the `fromSeq` check plus the row lock means a segment can't be accepted twice or out of order. The hash chain detects any divergence.
- **Abuse limits:** per-route rate limits (as for `solo-submit`), bounds on segment size and entries, and the account ban check on start and on segments.
- **Guests** can resume only with the same guest cookie, the existing caveat for guests. Signed-in players resume on any device.
- **Simulated passages** stay allowed. They don't count as the player's balls, exactly as in T20 and ODI.

### 2.5 Server CPU

- A segment of at most 30 overs is about 180–200 deliveries, about 0.1 s of local Node CPU at today's rate.
- Restoring from a snapshot means the cost doesn't grow with the length of the match. That avoids replaying all 2,700 deliveries at the end.

### 2.6 Storage

- Snapshot: an estimated 20–60 KB, mostly the four innings scorecards.
- `lastSegment`: up to 128 KB, cleared when a match finishes.
- At most one active match per player, so storage is bounded per player.
- Finished matches keep the snapshot until an optional clean-up. Alternatively, null the snapshot on FINISHED: the result then lives in `Match`/`MatchParticipant`, as for every other game.

### 2.7 Presentation (no schema involved)

- Day and session in the scoreboard (`dayAndSession` exists).
- Lunch, tea and stumps cards between segments.
- Declare and follow-on decisions in the UI (the engine actions exist).
- A "Continue your Test" entry on the cricket page.
- The innings-break card already supports multiple innings in data. It needs copy for the third and fourth innings (lead or deficit).

## 3. Compatibility

- **Existing data:** `Match`, `MatchParticipant`, the ledger, stats and achievements are untouched. Duel, T20 and ODI keep the one-shot solo path.
- **Old clients:** not affected. The new endpoints are new routes, and `format: "test"` remains invalid on `/api/solo/start`.
- **Engine versions:** a snapshot records `engine`. A future engine version must either restore old snapshots or refuse them, with an "abandon and restart" message. Never silently replay old logs with new rules.

## 4. Migration and rollback

**Migration:**
- One additive migration: a new enum, a new table, indexes, the partial unique index and the checks.
- Order: apply the migration to the database first (Neon's direct URL, by the owner), then deploy code that reads the table.
- The feature stays behind `TEST_CRICKET_ENABLED`, off by default, so the migration can ship ahead of the feature.

**Rollback:**
- **Code:** set `TEST_CRICKET_ENABLED` off. Routes return 404 and the UI hides Test. Active matches stay stored.
- **Schema:** dropping `CricketSavedMatch` and the enum loses only in-progress Tests. Finished ones are already in `Match`. Nothing else references the table.
- Rehearse both against the local `*_test` database, with row counts and hashes of the existing tables before and after, as the earlier migrations were.

## 5. Test strategy

| Layer | Tests |
|---|---|
| Engine | Snapshot round trip at every innings boundary and many random split points (property test). Golden v1 and v2 unchanged. Test-specific rules (already tested). Segment boundaries at stumps, declarations, follow-on decisions |
| Database (`pnpm test:db`, local `*_test`) | One active match per player. Concurrent segments with the same `fromSeq`: one wins, the other gets 409. Idempotent retry. Finish records exactly one `Match` with the saved id. Abandon records nothing. Cascade on player deletion. Rewards and the daily cap through `recordMatch` |
| API | Ownership (another player gets 404). Tampered segments (digest, seq, pacing, oversize) rejected without a state change. Expired matches |
| Browser | Play a session, reload, resume. Resume in a second browser context signed in to the same player. Declare, enforce the follow-on, finish. Phone width |
| Load | Segment verification CPU at 30, 60 and 90 overs per segment, on the deployed Worker before enabling |

## 6. Estimate

| Work | Size |
|---|---|
| Engine snapshot and restore, with property and golden tests | 1.5–2 days |
| Migration and repository functions, with database tests | 1–1.5 days |
| Four API routes, with ownership, idempotency and limits | 1.5 days |
| UI: resume entry, day and session, breaks, declare and follow-on controls | 2–3 days |
| Browser tests, phone checks, Worker CPU check | 1–1.5 days |
| **Total** | **About 7–10 working days**, plus your review of the migration |

## 7. What needs your approval

1. The additive migration in section 2.1, and the policy of applying it to production before the code that uses it.
2. The 30-day abandonment window, and whether abandoned or unfinished Tests should ever count as anything. The proposal says they never do.
3. Whether guests may start a Test, given that guest-cookie loss loses the match. Alternative: Test cricket for signed-in players only.
4. Whether to verify segments on the Worker or on the Railway realtime service. See `CRICKET_PERFORMANCE_BENCHMARKS.md`. Segment verification is small enough for the Worker if the plan allows about 0.1–0.2 s of CPU per request.
