# Next shipping roadmap

Updated 2026-11-05. This is a plan. It authorizes no merge, deployment, migration or provider change.

**Not release ready. Production currently has a live outage for players with a session.**

## Exact blockers

| # | Blocker | State | Unblocks with |
| --- | --- | --- | --- |
| 1 | **Production HTTP 500s** on campaign, realtime token, wallet and solo start | Reproduced. Most likely cause: migrations missing in production. Applying them fixed it in local reproductions | Owner confirms with `prisma migrate status`, then an approved migration |
| 2 | **Workers Build failing** on the branch | Cause unknown. Fix not confirmed | The build log |
| 3 | Unknown production migration history | Not visible from here | `prisma migrate status` |
| 4 | Local fixes not yet pushed | 3 local commits ahead of origin, as instructed | Owner approval to push |

## Evidence

**Available:**

- Read-only production requests reproduce the exact failure: database health `ok`, campaign and token return HTTP 500 with 0 bytes.
- The unmodified code against a database missing the last two migrations gives the same responses.
- After applying the real migrations locally, all routes recover, and legacy rows and coin balances are unchanged by checksum.
- The real OpenNext Worker in local workerd behaves the same in both states.
- Wrangler source and Cloudflare docs on the Worker name. Production's `e1888ad` build passed with the same name mismatch.

**Still required from Cloudflare and the owner:**

1. Error lines from the log of build `1bb8002f`, and which stage failed.
2. Dashboard values: Root directory, Build, Deploy and Preview commands, production branch.
3. `prisma migrate status` output for production.
4. Worker logs for one failing request, if the status output doesn't settle it.
5. The result of opening `/api/session` in a normal browser.

## Cuisine Quest diagnosis

Session lookup reads columns and a table from `20261104030000_player_identity`. When that fails, `getSession()` throws, the route doesn't catch it, and the platform sends an empty 500. The browser then reports "Unexpected end of JSON input". This is not specific to Cuisine Quest. Full trace: [investigation](RELEASE_BLOCKER_INVESTIGATION.md).

Local code now returns JSON errors and logs the real cause, but **the migration is what fixes production**. Not yet directly confirmed in production.

## Migration readiness

Ready to rehearse, not ready to run. Migrations 2 to 4 are additive, and old code should tolerate the new schema, so the database goes first. Open questions: production's real history, whether the migration needs Neon's direct URL, and lock time on real table sizes. Full plan: [migration readiness](PRODUCTION_MIGRATION_READINESS.md).

## Recommended release sequence

1. **Owner gathers evidence:** the `/api/session` check, the build log and dashboard values, and `prisma migrate status`. All are read-only.
2. **Fix production first:** take a backup, rehearse on a Neon branch, then apply the pending migrations to production with explicit approval. This requires no code release.
3. **Verify recovery in production** using the migration report's checklist.
4. **Fix the Workers Build** based on the actual log.
5. **Push the local commits** when approved, and confirm a successful real Workers Build with a working Preview, using Preview-only secrets and a non-production database.
6. **Before merging,** confirm the dashboard Deploy command is `pnpm cloudflare:deploy`.
7. **Merge when approved,** then watch the production build and error logs.
8. **Finish release verification:** Google consent, R2, physical devices, audio.

## P0: release readiness

| # | Item | Done when |
| --- | --- | --- |
| 1 | Production migrations | Applied with a backup, and the recovery checklist passes |
| 2 | Production HTTP 500s | Campaign and token work with real cookies in production, and logs are clean |
| 3 | Real Workers Build | The log shows the root config loaded, no `previews` error, OpenNext output uploaded and a working Preview URL |
| 4 | Google OAuth consent | Real sign-in, sign-out and linking pass on desktop and a phone. Only a local fixture was tested |
| 5 | Cloudflare R2 avatars | Real upload, read, replace and delete work with a private bucket. Only local files were tested |
| 6 | Physical gameplay testing | Full matches on low-end and mid-range Android and a desktop GPU, using the [QA checklist](SINVERSE_CRICKET_VISUAL_POLISH_QA_REPORT.md), section 12 |
| 7 | Audio review | A person listens on a phone speaker, headphones and desktop |

## P1: cricket quality

1. Profile real GPU performance. Medium and Ultra are slower than the old renderer on a software GPU, so measure on hardware, tune them, and check that Auto settles.
2. Review cut, pull and sweep in actual play.
3. Review the human batter's six sequence.
4. Capture and review stumping, run-out and high-catch sequences.
5. Verify keeper wide and diving takes, and isolate the gloves taking the ball.
6. Implement dedicated relay throws and boundary saves.
7. Improve the stylised faces and add left-handed players, without changing existing outcomes.

## P2: cricket expansion

Each needs its own rules design and tests.

1. Practice and training modes: the smallest step, reusing the current engine.
2. Player statistics and records.
3. Full T20 rules: bowling quotas, powerplays and a tie procedure.
4. Tournament and series engine, with resumable server-owned state.
5. Career mode, with a versioned save format and cosmetic-only rewards.
6. ODI rules, building on T20.
7. Test cricket: a separate multi-innings engine.

## P3: competitive ecosystem

In dependency order:

1. Server-authoritative multiplayer on the existing Node and Socket.IO service.
2. Private matches.
3. Matchmaking.
4. Ranked seasons.
5. Tournament leaderboards.

## Recommended next assignment

Once the owner has the read-only evidence: **a supervised production migration with its recovery check, then the build fix from the real log.** More cricket features should wait until production is healthy and real-device results are in.
