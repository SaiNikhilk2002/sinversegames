# Next shipping roadmap

Updated 2026-11-05, after pushing `123e76c` to `codex/takeover-and-reliability-audit`. This is a plan. It authorizes no merge, deployment, migration or provider change, and no item below has started.

**Not release ready.** The cricket polish has only been tested with a software GPU, in emulated mobile layouts and against local services.

## Where things stand

- The branch is 6 commits ahead of `main` and 2 merge commits behind it. A local dry-run merge had no conflicts.
- `main` already contains the Cuisine Quest and Player Identity code and all four migrations, through PR #2. Whether production has applied those migrations is unknown from this repository.
- **The real Workers Build for `123e76c` failed.** The GitHub check `Workers Builds: sinversegames` reports failure for [build 1bb8002f](https://dash.cloudflare.com/21c2f668735c78d18513f64d381aa233/workers/services/view/sinversegames/production/builds/1bb8002f-c17e-48a7-aabd-3818f19b5dac). The cause is unknown, because the log needs a Cloudflare login and GitHub shows no error text. It may or may not be the same error as before, so the root `wrangler.jsonc` fix is **not confirmed**.
- The same check also failed on `4ad166b`, `920b22d` and `5304115`, so failures predate this push.
- The connected Worker is named `sinversegames`, while both Wrangler configs say `sinversegames-web`. Whether that contributes is unverified.

## Before merging the pull request

Merging to `main` may trigger a production build, so check these first:

1. In Workers & Pages, confirm the Worker's **Deploy command** is `pnpm cloudflare:deploy`, not a bare `npx wrangler deploy`. The new root `wrangler.jsonc` removes the error that used to stop a bare deploy at the root, so that command would now publish.
2. Confirm that the branch's build passes (P0.1). It currently fails.
3. Confirm the production database state (P0.4).

## P0: release readiness

| # | Item | Done when | Who |
| --- | --- | --- | --- |
| 1 | Real Cloudflare Workers Build, **currently failing** | The failure is read from the log and fixed, then a build log shows the root config loaded, no missing `previews` error, the OpenNext worker and assets uploaded, and a working Preview URL | Owner checks the dashboard |
| 2 | Google OAuth consent | Real sign-in, sign-out and account linking pass on the Preview or a staging origin, on desktop and on a phone. Only the local fixture provider has been tested | Owner sets up the client, then testing |
| 3 | Cloudflare R2 avatars | Real upload, read, replace and delete work with the bucket kept private. Only local filesystem storage has been tested | Owner creates the bucket, then testing |
| 4 | Production migrations | Written plan: which of the four migrations production has, backup and restore step, order against the code release, and rollback. Additive migrations first, reviewed by the owner | Claude drafts, owner runs |
| 5 | Cuisine Quest campaign or token HTTP 500 | Root cause found from production logs, fix tested, and the campaign plays in production. See the notes below | Needs owner's logs |
| 6 | Physical gameplay testing | A full match on a low-end and a mid-range Android phone and on a desktop GPU, using the checklist in [the QA report](SINVERSE_CRICKET_VISUAL_POLISH_QA_REPORT.md), section 12, including an iPhone if available | Owner on devices |
| 7 | Audio review | A person listens on a phone speaker, headphones and a desktop, and balance issues are logged and fixed | Owner listens |

### Cuisine Quest 500 notes

This is an unconfirmed lead, not a diagnosis. The repository has no record of the production failure. On `main`, database errors from the campaign lookups in `api/cuisine-quest/campaign` and `api/solo/start` are caught and returned as 503. A 500 therefore probably comes from code outside those guards. In `api/solo/start`, that means the session lookup, rate limit or run-token signing. Candidates to check first:

- Code on `main` reading a table or column from a migration that production has not applied, such as `20261104020000_cuisine_quest_campaign` or `20261104030000_player_identity`.
- `AUTH_SECRET` missing or wrong on the Worker, which would break token signing or sessions.

The Cloudflare Worker logs for one failing request should settle this, and the fix should wait until they do.

## P1: cricket quality

1. Profile real GPU performance. Medium and Ultra are slower than the old renderer on a software GPU, so measure on hardware, then tune them and check that Auto settles.
2. Review cut, pull and sweep in actual play. Only pose tests have covered them.
3. Review the human batter's six sequence. The retained frames show the AI batting.
4. Capture and review stumping, run-out and high-catch sequences, none of which has been seen on screen.
5. Verify keeper wide and diving takes, which currently reuse general catch clips, and isolate the gloves taking the ball.
6. Implement dedicated relay throws and boundary saves, which currently reuse throw and dive clips.
7. Improve the stylised faces and add left-handed batters and bowlers. Left-handed play may need engine and rules work, not only animation, and must not change existing outcomes.

## P2: cricket expansion

Each of these needs its own rules design and tests before implementation.

1. Practice and training modes: the smallest step, and they reuse the current engine.
2. Player statistics and records.
3. Full T20 rules: bowling quotas, powerplays and a tie procedure.
4. Tournament and series engine, with resumable server-owned state.
5. Career mode, with a versioned save format and cosmetic-only rewards.
6. ODI rules, building on T20.
7. Test cricket: a separate multi-innings engine, not an overs setting.

## P3: competitive ecosystem

These build on each other, in this order:

1. Server-authoritative multiplayer on the existing Node and Socket.IO service, with hidden future randomness and reconnection.
2. Private matches.
3. Matchmaking.
4. Ranked seasons.
5. Tournament leaderboards.

## Recommended next assignment

**P0 release readiness: first fix the failing Workers Build, then the Cuisine Quest 500 and the production migration plan.** The build blocks every Preview check, the 500 affects a game already on `main`, and the migration plan is needed before other release work is safe.

What Claude needs from the owner:

1. The error lines from the log of build `1bb8002f`, plus the dashboard's Build, Deploy and Preview commands, with secrets removed.
2. Worker logs for one failing Cuisine Quest request, with secrets removed.
3. The output of `prisma migrate status` against production, run by the owner or with explicit approval.

Deliverables: a confirmed root cause and fix, a written migration runbook, and a release checklist covering P0.2, P0.3, P0.6 and P0.7. More cricket features should wait until real-device results are in, because they may change the P1 priorities.
