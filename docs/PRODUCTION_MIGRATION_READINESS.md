# Production migration readiness

Date: 2026-11-05. **No production migration has been run, and this report does not authorize one.** Everything marked "tested" ran on local `_test` databases.

## Summary

Production's code is very likely ahead of its database. Migrations `20261104020000_cuisine_quest_campaign` and `20261104030000_player_identity` appear not to be applied, which is the probable cause of the live HTTP 500 errors ([investigation](RELEASE_BLOCKER_INVESTIGATION.md)). Both are additive. Applying them is the expected fix, and it needs a backup and the owner's approval.

The actual production state is not confirmed. Only the owner can confirm it, by running `prisma migrate status`.

## Migrations

| Order | Migration | What it does | Risk |
| --- | --- | --- | --- |
| 1 | `20261031083025_init` | Original tables | Assumed applied, since production has served data |
| 2 | `20261104010000_sin_coins_cosmetics` | Adds `CosmeticInventory` and `CosmeticEquipment`, plus an index on `RewardLedgerEntry` | **Production state unknown.** Additive. A non-concurrent index blocks ledger writes while it builds |
| 3 | `20261104020000_cuisine_quest_campaign` | Adds `CuisineProgress` | Additive, new table only. Evidence suggests it is not applied |
| 4 | `20261104030000_player_identity` | Adds four nullable `Player` columns, a unique username index and a format check, plus `ExternalIdentity`, `AccountSession`, `OAuthAttempt` and `IdentityRateLimit` | Additive. Briefly locks `Player`, the most used table. Evidence suggests it is not applied |

They must run in this order, and `prisma migrate deploy` does that. The branch adds no migrations beyond those on `main`, and the visual polish changes no schema.

## Backward compatibility

- **Old code on the new schema:** expected to be safe. Nothing is renamed, dropped or rewritten, and all new `Player` columns are nullable. The new `username` check allows NULL, so existing rows pass. This is by reading the SQL; old builds were not run against the new schema.
- **New code on the old schema:** broken. That is the current production failure. Session lookup selects `username` and `avatarKey`, and reads `AccountSession`.

**So the rule is: migrate the database first, then release code.**

## Tested locally

On a local `_test` database built with the real `prisma migrate deploy` through migration 2, with seeded legacy players, a banned player, ledger entries, stats, a match, an achievement, a favourite and owned cosmetics:

| Check | Result |
| --- | --- |
| `prisma migrate status` | Correctly listed the 2 pending migrations |
| `prisma migrate deploy` | Applied both in order, in about 3.5 s total including tool start-up |
| Row counts and MD5 of existing columns in 9 legacy tables | Identical before and after |
| Coin balances | Identical |
| Routes with the fixed code | Recovered from 503 to 200 with no restart or code change |
| Same check in real workerd, OpenNext build | Same recovery; those migration files were applied directly, not through `prisma migrate deploy` |

**What this cannot show:** real data volume, real lock duration, concurrent traffic, Neon pooler behaviour, or production's actual history.

## Unknowns the owner must check first

1. **Which migrations production has.** Run `pnpm --filter @platform/db exec prisma migrate status` against production. This reads and changes nothing.
2. **Whether a `_prisma_migrations` table exists.** If production was built with `db push`, or has drifted, `migrate deploy` could fail on existing objects, and baselining would need its own plan. Do not improvise this.
3. **The correct connection string.** `DEPLOYMENT.md` shows the pooled `-pooler` URL for migrations. Prisma migrations use advisory locks and may need Neon's **direct** URL. Check Neon's current guidance and use direct if advised.
4. **Table sizes.** Check row counts for `Player` and `RewardLedgerEntry`, to estimate lock time on the index builds.

## Proposed sequence, for approval

1. Take a Neon restore point or branch, and record its name and time.
2. Rehearse on a **Neon branch** of production: run `migrate status`, then `migrate deploy`, and compare row counts and coin balances.
3. Choose a quiet period.
4. Run `prisma migrate status` on production. Stop if anything other than expected pending migrations appears.
5. Run `prisma migrate deploy` on production, using the connection decided above. The Worker needs no change, since it opens a fresh client per request.
6. Check immediately:
   - `/api/health` reports `database: ok`.
   - `/api/cuisine-quest/leaderboard?level=1` returns 200.
   - `/leaderboard` shows data.
   - A browser with an existing guest cookie loads the Cuisine Quest campaign and gets a realtime token.
   - Compare row counts and sample coin balances with step 1.
7. Restart the Railway realtime service only if it still reports database errors.
8. Watch logs for about an hour, then continue with code release.

## Rollback

There are no down migrations, and none is needed for a code rollback, because old code tolerates the additive schema.

- **If a migration fails partway:** stop. Prisma records the failure and blocks later deploys. Inspect it and use `prisma migrate resolve` deliberately. Do not rerun blindly.
- **If the schema itself must go:** restore from the Neon restore point. This discards anything written since then, so treat it as a last resort. Dropping new tables or columns by hand is possible only before they hold real data, because it would delete linked accounts, usernames, avatars and campaign progress.
- **Stopping the outage without a migration:** roll the Worker back in Cloudflare to a version from before the identity work. This is a possible stopgap, but which version is safe needs review, so it isn't recommended over the additive migration.

## After the migration

- **Guests from the outage:** while the identity migration is missing, `upsertPlayer` fails, so new guests get a valid cookie but may have no `Player` row. The failure was reproduced locally. These rows should appear on the player's next session or saved result, but this recovery path has not been tested end to end.
- **Multiplayer results:** the realtime service uses the same database and may have failed to record results during the outage. Lost results cannot be recovered from this repository.
- **Future releases:** neither Workers Builds nor Railway runs migrations automatically. Add a release checklist step, and consider a pre-deploy check that fails if migrations are pending.
