# Next shipping roadmap

Updated 2026-11-06. This is a plan. It authorizes no merge, deployment, migration or provider change.

**Production's database is migrated and its API errors have cleared. The code on this branch is not deployed, and it is not release ready.**

## Current state

| Item | State |
| --- | --- |
| Production migrations | **Done.** All four applied, data identical. See the [report](PRODUCTION_MIGRATION_READINESS.md) |
| Production API checks | **Passed,** using public requests and a made-up session only |
| Database password | Rotated by the owner, as they reported |
| Real player session and finished match in production | **Pending** |
| Application code on this branch | **Not deployed.** Email sign-in, the realtime fix and JSON errors are not live |
| Railway realtime changes | On this branch, **not released**. The per-packet database lookup is still live |

## Exact blockers

| # | Blocker | State | Unblocks with |
| --- | --- | --- | --- |
| 1 | **Workers Build failing** on this branch | Build `1bb8002f` for `123e76c` failed. Cause unknown. **Not fixed.** This push will trigger a new build | The build log and dashboard values |
| 2 | **Linux OpenNext build not verified on the email code** | It last passed before the email work. WSL restarted during the build on the owner's laptop | A successful real Workers Build, or a repeat on a stable machine |
| 3 | **Email has no provider** | Tested only against a local stand-in for Resend. Nothing has been really delivered | A Resend account, verified domain and Worker secrets, then a real-inbox test |

## Known test results to keep in mind

- `cricket-visual.spec.ts:524` is intermittent: about 1 run in 3 counts 31 textures instead of 32 after re-entry. One fewer isn't a leak. It's an exact-count timing check, and needs its own fix.
- Against a remote database at about 248 ms per query, several game tests need longer time limits (`E2E_EXPECT_TIMEOUT=30000`), and a connection can occasionally exceed the 2.5 s limit. Tests from that run that failed once passed on repeat.
- Color Clash failed once locally while a WSL build competed for memory, then passed 3 of 3 alone.

## Evidence still required

1. Error lines from the log of the Workers Build for this branch, and which stage failed.
2. Dashboard values: Root directory, Build, Deploy and Preview commands, production branch.
3. Railway's deployed commit and region.

## Recommended release sequence

1. **Verify production as a player:** a real session, wallet and profile, and a finished match that saves.
2. **Read the Workers Build log** and fix the build from it. Don't claim it's fixed without a successful real build.
3. **Set up Resend,** using [DEPLOYMENT.md](../DEPLOYMENT.md#email-sign-in-resend).
4. **Confirm a working Preview,** with Preview-only secrets and a non-production database, and test real email: code, link and same player from both.
5. **Before merging,** confirm the dashboard Deploy command is `pnpm cloudflare:deploy`.
6. **Merge when approved,** then watch the production build and logs. Check Railway releases the realtime fix alongside it.
7. **Finish release verification:** Google consent, R2, physical devices, audio.

## P0: release readiness

| # | Item | Done when |
| --- | --- | --- |
| 1 | Production migrations | **Done** 2026-11-05 |
| 1a | Real email delivery | Code and link arrive in a real inbox and sign in to the same player |
| 2 | Production HTTP 500s | Made-up session checks pass. Still needs real cookies in production, and clean logs |
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

**Fix the Workers Build from its real log, then configure and test real email.** More cricket features should wait until the release is out and real-device results are in.
