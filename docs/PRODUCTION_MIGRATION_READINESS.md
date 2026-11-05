# Production migration readiness

Updated 2026-11-06. This records what was run and what remains. It authorizes nothing further.

## Decision and outcome

**Production was migrated on 2026-11-05 at 19:15:59 UTC, with the owner's explicit approval. All four Prisma migrations are applied.** The owner reports rotating the database password afterwards.

| Check | Result |
| --- | --- |
| Target | `br-cold-thunder-b5hsf9io`, proven by the live database before each step, over the direct URL |
| Before running | History was exactly `init`, no new objects existed, and data matched the restore point's baseline |
| `prisma migrate deploy` | Ran once, exit 0 |
| Time per migration | `sin_coins_cosmetics` 1.8 s, `cuisine_quest_campaign` 1.5 s, `player_identity` 3.5 s |
| Migration status | 4 applied, schema up to date, no difference from `schema.prisma` |
| Objects | All 7 tables, 6 indexes, 7 foreign keys, 4 checks and 4 columns present; nothing invalid; checksums match |
| Existing data | 9 players, 8 matches, 16 participants, 14 achievements, 11 stat rows and 23 ledger rows identical; 102 Sin Coins across 8 players, balances identical |

**Production API checks** used public requests and a made-up session, so they prove server responses, not a real player's journey:

| Request | Before | After |
| --- | --- | --- |
| Campaign, made-up session | 500, empty | 401 JSON |
| Realtime token, made-up session | 500, empty | 401 JSON |
| Session, made-up session | 503 | 200, no player |
| Cuisine leaderboard | 503 | 200, available |
| `/leaderboard` | "unavailable" | 200 |
| `/api/health` | database ok | database ok, realtime ok |

**Still to verify in production:**

- A real player session in a normal browser, and a real finished match that saves.
- Which commit and region Railway is running. The realtime code from before these migrations crashes `main`'s web client whatever the database state, by protocol mismatch.
- Worker and Railway logs after the migration.

The restore point is `pre-migration-20261105`. Restoring to T0 discards everything written since.

## Compatibility of `origin/main` with the migrated schema

Tested before the production run, from an exported copy of `e1888ad` with no `.env`, under Node, not the Worker runtime.

| Area | Result | Tested on |
| --- | --- | --- |
| Session, wallet, ledger, profile and realtime for all 9 existing players | Passed, same IDs and balances, read-only by hash | Rehearsal, direct and pooled |
| Campaign and token APIs, leaderboards, health, every game page | Passed | Rehearsal, direct and pooled |
| Guest plays, saves, buys and replays with no duplicate rewards | Passed | Rehearsal, direct and pooled |
| Google-style account: sessions, username, revocation, room joining | Passed | Rehearsal, direct and pooled |
| Google sign-in flow | Passed with a local test provider, not real Google | Local migrated database |
| Database outage handling | Passed | Local migrated database |
| `main`'s own game specs | 31 of 31 | Rehearsal, direct |
| Pre-migration database code | Saves results, new columns stay NULL | Local migrated database |
| Pre-migration realtime server with `main`'s web client | **Page crashes, even with no database**, so not schema related | Local |

## Rehearsal result

The rehearsal, run on `migration-rehearsal-20261105` (`br-misty-scene-b5iievr0`), created from production. The branch identity was checked against the live `neon.branch_id` before every operation, over the direct URL.

| Check | Result |
| --- | --- |
| `prisma migrate deploy` | Ran once and succeeded, exit 0 |
| Time per migration, from `_prisma_migrations` | `sin_coins_cosmetics` 1.8 s, `cuisine_quest_campaign` 1.5 s, `player_identity` 3.5 s |
| Total including tool start-up | 17.9 s, from a machine with about 248 ms round-trip to the database |
| After `prisma migrate status` | 4 applied, schema up to date |
| After `prisma migrate diff` to `schema.prisma` | No difference |
| Objects | 7 of 7 tables, 6 of 6 indexes, 7 of 7 foreign keys, 4 of 4 checks, 4 of 4 columns, all constraints validated, no invalid indexes |
| Checksums | All 4 match the migration files |
| Existing data, straight after migrating | Identical full-row hashes in all 9 tables; 102 coins across 8 players with identical per-player balances; new tables empty |
| Existing data, after all browser tests | The original rows in all 6 tables that hold data are still identical; no original player gained a username, session or identity |
| Test data | 22 email accounts, all on the reserved `example.invalid` domain, plus test guests and matches. No duplicate accounts, rewards or match entries |

**The `Player` lock:** `player_identity` could block reads and writes on `Player` for up to about 3.5 s, though the measured time includes network overhead. Requests in that window wait, and some may get a brief 503. The rehearsal had no live traffic, so it couldn't measure this directly. Choose a quiet time.

**Not tested in rehearsal:** failure partway through a migration, and concurrent traffic.

## Findings

| Question | Finding | Evidence |
| --- | --- | --- |
| Is this production's database? | **Very likely.** Not a formal proof, and only one run | Its rollback counter was flat for 25 s while idle, then rose by exactly 6 after 6 failing public production requests |
| Which migrations are applied? | Only `20261031083025_init`, finished cleanly on 2026-11-02 | `_prisma_migrations`: not rolled back, no logs, and its checksum matches the local file |
| Are any "pending" objects already there? | **None.** No partial state | Every expected table, index, column and constraint is absent, and there are no invalid indexes |
| Has the schema drifted in other ways? | **No.** The difference is exactly the objects these migrations create | `prisma migrate diff` from the live database to `schema.prisma`. It cannot see check constraints, so those were checked in the catalog |
| Do `schema.prisma` and the migrations agree? | Yes: columns, types, nullability and cascades match. Four extra check constraints exist only in SQL, which Prisma doesn't model | Read side by side |
| Can the role run the migrations? | Yes: it owns `Player` and can create in `public` | Catalog |
| Does the branch change the migrations? | No. Prisma files match `origin/main` | `git diff` |

**Current data:** 9 players, 8 matches, 16 participants, 14 achievements, 11 stat rows and 23 ledger entries totalling 102 coins. Postgres 18.6. The largest table is 16 kB, and nothing else was connected when checked.

**No player, match or ledger row has been written since 2026-11-03 08:15 UTC.** That is consistent with this outage, but low traffic could also explain it. Any results attempted during that time are not in the database and can't be recovered from here.

**Correction to earlier reports:** early local rehearsals started with `sin_coins_cosmetics` already applied, because production's state was unknown. Production is one step further back. The Neon branch rehearsal covered the real path: `init` with real rows, then all three migrations.

## Connection and environment variable

| Item | Answer |
| --- | --- |
| Variable the Prisma CLI uses | **`DATABASE_URL` only**, through `datasource.url` in `packages/db/prisma.config.ts`. `DIRECT_URL` is not read anywhere, and `schema.prisma` holds no URL |
| How it loads | `dotenv` reads the root `.env` without overriding, so a `DATABASE_URL` already in the shell wins |
| Is the pooled URL right for migrations? | **No.** Neon lists schema migrations as "Direct". Prisma says its Schema Engine "does not support connection pooling with PgBouncer" |
| Why it matters here | Neon's pooler runs in transaction mode and doesn't support session advisory locks. The installed engine (7.10.1) contains `pg_advisory_lock(72707369)`. A session lock can't be relied on through that pooler |
| Doesn't `migrate status` already work? | Yes, but that doesn't show `migrate deploy` will. Don't disable the lock with `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK` |
| Is the pooled URL right for the app? | **Yes.** The Worker and Railway keep the pooled `DATABASE_URL` unchanged |

**For this run, no code change is needed.** Set `DATABASE_URL` to the direct URL in one terminal session only. The direct host is the same host without `-pooler`, and Neon's Connect dialog shows it with pooling turned off.

**Afterwards, as a separate reviewed change:**

- Have `prisma.config.ts` read `process.env.DIRECT_URL ?? process.env.DATABASE_URL`, which is Prisma 7's documented pattern.
- Set `DIRECT_URL` only where migrations are run, never in Cloudflare or Railway.
- Point the root `.env` at the local database. While it holds this URL, `pnpm db:migrate` (`prisma migrate dev`) targets this database, and the web app in development reads and writes it.

Neon's Prisma guide warns that npm's `latest` tag now points to a Prisma 8 prerelease, where these commands changed. Use the repository's pinned 7.10.1 through `pnpm exec`, never a bare `npx prisma`.

## Rehearsal branch pre-checks

Run 2026-11-05 on `migration-rehearsal-20261105` (`br-misty-scene-b5iievr0`), read-only, with the branch ID checked first, before the migrations were applied.

| Check | Result |
| --- | --- |
| Identity | Live branch ID matches the ID the owner confirmed in Neon, and Prisma's reported host matches the verified connection |
| Source data | Row hashes match the production baseline taken at 13:38 UTC |
| Prisma status | 4 migrations found, `init` applied, exactly the 3 expected pending |
| Migration SQL | Same as git HEAD, and `init`'s checksum matches. No destructive statements |
| Schema diff | The live schema differs from `schema.prisma` by exactly 7 tables, 6 indexes, 4 columns and 7 foreign keys, all from the pending SQL. The 4 check constraints exist only in SQL |
| Name collisions | None across tables, indexes, constraints and `Player` columns |
| Unique conflicts | None possible. `Player_username_key` covers a new all-NULL column, and the other unique index is on a new empty table |
| Data the migrations don't backfill | No `cosmetic_purchase` ledger rows and no Cuisine Quest matches, so no earlier purchases or runs need new rows |
| Activity | No other sessions, locks, advisory locks or prepared transactions |
| Other objects | No views, rules, user triggers, row-level security, partitions or publications |
| Timeouts | `lock_timeout` is 0, so a blocked migration would wait with no limit. `idle_in_transaction_session_timeout` is 5 minutes |

**Baseline:** Player 9, Match 8, MatchParticipant 16, PlayerAchievement 14, PlayerGameStats 11, RewardLedgerEntry 23, and AbuseReport, FavoriteGame and ModerationAction 0. Coins total 102 across 8 players (lowest 2, highest 28, none negative). Full-row hashes were saved outside the repository for the post-migration comparison.

**What a rehearsal cannot show:** it has no traffic, so it can't measure queueing behind the `Player` lock in production. A successful run also doesn't test failure handling.

## Migration risk

All three are additive: no `DROP`, `UPDATE`, `DELETE`, rename or backfill, and no existing row is rewritten. None of them adds a constraint that existing rows could violate.

| Migration | Creates | Locks on existing tables | Risk |
| --- | --- | --- | --- |
| `20261104010000_sin_coins_cosmetics` | `CosmeticInventory`, `CosmeticEquipment`, two primary keys, three foreign keys, and index `RewardLedgerEntry_playerId_createdAt_id_idx` | `Player`: blocks writes, not reads, while the foreign keys are added. `RewardLedgerEntry`: blocks writes, not reads, during the index build | **Low.** 23 rows |
| `20261104020000_cuisine_quest_campaign` | `CuisineProgress`, its primary key and foreign key, three range checks, one index | `Player`: blocks writes, not reads, briefly | **Low** |
| `20261104030000_player_identity` | Four nullable `Player` columns, unique `Player_username_key`, check `Player_username_format`, and `ExternalIdentity`, `AccountSession`, `OAuthAttempt`, `IdentityRateLimit` with their keys and indexes | `Player`: **blocks reads and writes** until the migration commits. No table rewrite, and every username is NULL | **Low at 9 rows.** This is the one to watch at larger scale |

**Measured duration:** see the rehearsal result above. A long-running transaction on `Player` could make the `ALTER TABLE` wait and queue other requests behind it, which is why step 7 of the runbook checks first.

**Atomicity:** each file is expected to apply as one implicit transaction, because it has no explicit `BEGIN` and is sent as a single script. This wasn't tested, so treat a failure as needing inspection.

**Order:** Prisma applies them by name, oldest first, and that order is what the rehearsal tests. No migration references another's objects, since each depends only on tables from `init`. Even so, `migrate deploy` applies all three, and skipping one would need `migrate resolve`, which shouldn't be used here.

**Line endings:** the stored checksum matches LF, and this Windows checkout has CRLF files. Your `migrate status` run still reported `init` as applied. The rehearsal will show any problem.

## Is `sin_coins_cosmetics` required?

**Yes. It is needed by the code already on `main`, not just a prerequisite in the history.**

| Code | Without the migration |
| --- | --- |
| `getWallet`, `purchaseCosmetic`, `equipCosmetic` (`packages/db/src/wallet.ts`, `/api/wallet`) | Fails on the missing tables |
| `getProfile` includes `inventory` and `equipment` (`repositories.ts`) | `/profile` loses its whole profile section, because the error becomes `null` |
| `GET /api/session` cosmetics | Silently returns no cosmetics |
| The `RewardLedgerEntry` index | Speeds up wallet history. Not functionally required |

## Application compatibility

| Code | Database now (init only) | After all three |
| --- | --- | --- |
| **Worker on `main`** | Broken for anyone with a session cookie. Guest lookup needs `username` and `avatarKey`, account lookup needs `AccountSession`. Prisma's `upsert` returns every column, so `upsertPlayer` fails too | Expected to work, with no redeploy |
| **Realtime with `main` code** | `recordMatch` uses the same `upsert`, so saving results is expected to fail | Expected to work |
| **This branch** | Same failure, but as readable JSON errors | Tested locally from the state one migration further along |
| **Older deployed code** | Works for what it knew | Expected to be safe. New columns are nullable and Prisma lists columns explicitly |

Which build Railway is running is not known here, and neither is the Worker's runtime log. The expected recovery on `main`'s exact code is by reasoning. Earlier local recovery tests used this branch's code.

## Runbook

The owner runs these. Everything from step 8 on needs explicit approval at that moment.

This is the procedure used on 5 November 2026 through scripted equivalents. Keep it for future migrations, using new branch names.

### Prepare

1. **Check the plan and branch.** In Neon, confirm the project and plan, and that the production branch is a **root branch**, since only root branches support instant restore. The maximum restore window is 6 hours on Free, 7 days on Launch and 30 days on Scale.
2. **Optional cross-check:** compare the endpoint ID in Railway's `DATABASE_URL` with the one in your `.env`, without pasting either anywhere.
3. **Save the fingerprint.** Run this in Neon's SQL Editor on the production branch, and save the output:

   ```sql
   SELECT 'Player' AS t, count(*)::int AS n, NULL::bigint AS total, md5(string_agg(id || '|' || "createdAt", ',' ORDER BY id)) AS h FROM "Player"
   UNION ALL SELECT 'RewardLedgerEntry', count(*)::int, sum(amount)::bigint, md5(string_agg(id || '|' || "playerId" || '|' || amount || '|' || reason, ',' ORDER BY id)) FROM "RewardLedgerEntry"
   UNION ALL SELECT 'Match', count(*)::int, NULL, md5(string_agg(id::text, ',' ORDER BY id)) FROM "Match"
   UNION ALL SELECT 'MatchParticipant', count(*)::int, NULL, md5(string_agg(id::text, ',' ORDER BY id)) FROM "MatchParticipant"
   UNION ALL SELECT 'PlayerAchievement', count(*)::int, NULL, md5(string_agg("playerId" || '|' || "achievementKey", ',' ORDER BY "playerId", "achievementKey")) FROM "PlayerAchievement"
   UNION ALL SELECT 'PlayerGameStats', count(*)::int, NULL, md5(string_agg("playerId" || '|' || "gameId", ',' ORDER BY "playerId", "gameId")) FROM "PlayerGameStats"
   ORDER BY 1;
   ```

   Expected at 13:38 UTC: Match 8, MatchParticipant 16, Player 9, PlayerAchievement 14, PlayerGameStats 11, RewardLedgerEntry 23 with total 102. Higher numbers just mean new activity.

### Rehearse on a Neon branch

4. **Create two branches** from production, using **Current data**:
   - `pre-migration-20261105`: keep this as the restore point, and don't connect anything to it.
   - `migration-rehearsal-20261105`: use this one for the rehearsal.

5. **In a new PowerShell window, from the repository root,** enter the rehearsal branch's **direct** URL. `Read-Host` keeps it out of your shell history:

   ```powershell
   $env:DATABASE_URL = Read-Host "Direct URL"
   if ($env:DATABASE_URL -like "*-pooler*") { throw "This is the pooled URL. Stop." }
   pnpm --filter @platform/db exec prisma migrate status
   ```

   Confirm the printed host is the **rehearsal** branch, with 3 pending. Then run:

   ```powershell
   Measure-Command { pnpm --filter @platform/db exec prisma migrate deploy | Out-Default }
   pnpm --filter @platform/db exec prisma migrate status
   pnpm --filter @platform/db exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
   Remove-Item Env:DATABASE_URL
   ```

   Record the time taken. `status` should report the schema up to date, and `diff` should report no difference. Any difference means stop and review.

6. **Verify on the rehearsal branch:** run the fingerprint and the catalog check below. Fingerprints must be **identical** to the production values taken when the branch was created. If you can, run the app locally against this branch, and load the campaign, wallet and a realtime token with a test cookie. Don't delete the branch until the production run is finished.

   ```sql
   SELECT
     (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied,
     (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('CosmeticInventory','CosmeticEquipment','CuisineProgress','ExternalIdentity','AccountSession','OAuthAttempt','IdentityRateLimit')) AS new_tables,
     (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Player' AND column_name IN ('username','usernameChangedAt','avatarKey','onboardingAt')) AS new_columns,
     (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('RewardLedgerEntry_playerId_createdAt_id_idx','CuisineProgress_level_bestScore_playerId_idx','Player_username_key','ExternalIdentity_playerId_provider_key','AccountSession_playerId_expiresAt_idx','OAuthAttempt_expiresAt_idx')) AS new_indexes,
     (SELECT count(*) FROM pg_constraint WHERE conname IN ('CuisineProgress_level_check','CuisineProgress_stars_check','CuisineProgress_score_check','Player_username_format')) AS new_checks,
     (SELECT count(*) FROM pg_index WHERE NOT indisvalid) AS invalid_indexes;
   ```

   Expected: `applied` 4, `new_tables` 7, `new_columns` 4, `new_indexes` 6, `new_checks` 4, `invalid_indexes` 0.

**Stop here if anything differs.** Production stays exactly as it is.

### Production, only with explicit approval

7. **Final checks.** Save the fingerprint again and write down the UTC time as T0. Check there's no long transaction:

   ```sql
   SELECT state, count(*), max(now() - xact_start) AS oldest FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() GROUP BY state;
   ```

8. **Apply,** in a new PowerShell window using production's **direct** URL:

   ```powershell
   $env:DATABASE_URL = Read-Host "Direct URL"
   if ($env:DATABASE_URL -like "*-pooler*") { throw "This is the pooled URL. Stop." }
   pnpm --filter @platform/db exec prisma migrate status
   ```

   **Stop unless** the host is production and the pending list is exactly these three. Then run these one at a time:

   ```powershell
   pnpm --filter @platform/db exec prisma migrate deploy
   pnpm --filter @platform/db exec prisma migrate status
   Remove-Item Env:DATABASE_URL
   ```

   If it hasn't finished well beyond the rehearsal time, check `pg_stat_activity` before interrupting anything.

9. **Verify straight away:**
   - The catalog check gives the same expected values.
   - Fingerprint: `Player` and ledger counts are equal or higher, and any change is explained by new activity after T0. Old ledger rows never change.
   - `/api/health` reports `database: ok`.
   - `/api/cuisine-quest/leaderboard?level=1` returns 200.
   - `/leaderboard` shows data.
   - `/api/session` returns 200 in your normal browser.
   - Cuisine Quest loads, and multiplayer connects and gets a token.
   - The wallet and `/profile` load.
   - Finish one real multiplayer match and confirm it is saved.

10. **Watch for an hour.** Watch the Worker and Railway logs. Restart Railway only if it keeps reporting database errors after the migration. Then delete the rehearsal branch, and keep `pre-migration-20261105` until you are confident, usually a few days.

## Recovery

| Situation | Action |
| --- | --- |
| Rehearsal fails | Production is untouched. Investigate, delete the branch and retry |
| Production fails partway | **Stop. Do not rerun.** Save the output and run `migrate status`. The failed migration blocks later deploys. Compare with the expected objects, then decide on `migrate resolve` deliberately. Do not use `db push` or `migrate dev` |
| Migration is fine, app is still failing | **Don't touch the schema.** Read the logs: a different error means a different cause, such as a token-signing or secret problem |
| Schema must be undone | Use Neon **Backup & Restore → Restore from history** on the production branch, at T0. It replaces data and schema, **discards everything written after T0**, interrupts connections briefly, keeps the connection string and automatically saves the old state as `{branch}_old_{timestamp}`. Check the point with Time Travel Assist first |
| Code rollback | No schema change needed, since older code tolerates these additions |

There are no down migrations. Dropping the new objects by hand would delete linked accounts, usernames and campaign progress once those exist, so restoring is the safer route.

## After the migration

- **Guests from the outage:** new guests got a valid cookie, but may have no `Player` row. These rows should appear on their next session or saved result, though this path hasn't been tested end to end.
- **Other fixes:** this doesn't fix the Cloudflare branch build, and the error-handling commits stay unpushed until approved.
- **Future releases:** neither Workers Builds nor Railway runs migrations, so add a release step, and consider a check that fails when migrations are pending.

## Sources

- [Neon: Prisma guide](https://neon.com/docs/guides/prisma)
- [Neon: connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Neon: branch restore](https://neon.com/docs/introduction/branch-restore)
- [Neon: history window](https://neon.com/docs/postgres/backup-restore/history-window)
- [Prisma: PgBouncer](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer)
- [Prisma: config reference](https://www.prisma.io/docs/orm/reference/prisma-config-reference)
