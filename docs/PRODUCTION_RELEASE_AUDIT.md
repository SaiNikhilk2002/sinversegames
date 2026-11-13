# Production release audit: Sinverse Cricket T20 and ODI

An independent check of the release candidate's exact state and contents, before any push, merge or deployment. **Nothing was pushed, merged or deployed, and nothing in production was changed.** The only contact with production was three read-only `GET` health checks.

## Starting state (verified 2026-11-13, not taken from earlier reports)

| Item | Found |
|---|---|
| Repository | `D:\dev\games`, GitHub `SaiNikhilk2002/sinversegames` |
| Branch | `feature/unified-platform` |
| HEAD at start | `91ac50a479e9d573977027c80b53263b12b1cd7e` |
| Working tree at start | Clean: no staged, unstaged or untracked files (`git status --porcelain -uall` empty) |
| Remote tracking, after a read-only `git fetch origin` | `origin/feature/unified-platform` = `0793ec8`; **0 behind, 7 ahead** |
| `origin/main` | `92e4fde`, "Merge pull request #5 from SaiNikhilk2002/feature/unified-platform". Its parents are `a2c444e` and `0793ec8` |
| `origin/main` versus `origin/feature/unified-platform` | **Identical trees** (`git diff` is empty). The release candidate is therefore exactly the branch's commits on top of `main` |
| Open pull requests | Couldn't be listed: the GitHub CLI isn't installed here, and no other authenticated tool was used. **Check before release** whether a PR from this branch is open |
| Production health, read-only `GET`, 2026-11-13 | `https://sinversegames.com/api/health` and `https://www.sinversegames.com/api/health`: 200, with `web`, `database` and `realtime` all `ok`. `https://rt.sinversegames.com/health`: 200, uptime about 23.4 hours |
| Which commit production runs | **Not verifiable from here.** The health endpoints don't report a version. Workers Builds deploys `main` (`DEPLOYMENT.md`), so production is *probably* `92e4fde`. Confirm under Workers & Pages → `sinversegames` → Deployments |

## The commit range

`origin/feature/unified-platform..HEAD`, which is the same as `origin/main..HEAD` in content. Seven commits from the earlier missions, plus this mission's.

| # | Commit | Purpose | Main files | Tests | Risk | In the release? |
|---|---|---|---|---|---|---|
| 1 | `51280d8` | Engine v2: 20 international teams, T20 and ODI, the setup screen and the scorebook | `packages/engines/src/sinverse-cricket/{formats,domain,match,physics,rules,content}.ts`; web `international-setup.tsx`, `sides.ts`, `crest.tsx`, `cricket-game.tsx`, renderer files; **shared** `packages/db/src/repositories.ts` (one line: a drawn match, or an uncounted cricket win, is neutral) | `cricket-formats`, `cricket-format-sim-t20/odi` (100 + 100 matches), `cricket-v1-golden` (96 duels), the DB test "saves an international T20…" | **High:** the largest change. It's new gameplay, but it's gated on `config.version === 2`, the duel is proven unchanged by the golden corpus, and the shared repository change is narrow | Yes |
| 2 | `70cb151` | Refresh recovery for international matches | **Shared** `solo-runner.tsx`, `solo-recovery.ts`, `solo-types.ts`, `solo-registry.tsx`; `cricket-game.tsx`; new `e2e/cricket-formats.spec.ts` | `cricket-formats.spec.ts`; Cuisine Quest's recovery specs (in the full browser run) | **Medium:** touches the recovery used by Cuisine Quest. The snapshot check is now per game, and the snapshot limit is 512 KB / 4,000 entries | Yes |
| 3 | `e35cd2d` | Name the coming bowler before an over; hide the picker between innings | `cricket-game.tsx` (3 lines) | Browser specs | Low | Yes |
| 4 | `98dca74` | Documentation | `docs/CRICKET_*` | — | None | Yes |
| 5 | `6ff4030` | Rules fixes, fairer win threshold, smarter AI, verification 40–55% cheaper | Engine `match.ts`, `physics.ts`, `rules.ts`, `teams.ts`, new `awards.ts`; `bench/`; `packages/engines/package.json` (scripts only) | `cricket-rules-v2` (13), `cricket-ai` (8), `cricket-awards` (3), golden corpus, stress run | **High:** changes the physics hot path (`Delivery.fork`). Mitigated by a fork-equals-fresh test, 1,000 stress matches each verified exactly, and the golden corpus | Yes |
| 6 | `32f8216` | Innings break, awards, XI comparison; a pace pre-check before replay | Web `match-summary.tsx`, `cricket-game.tsx`, `international-setup.tsx`, `cricket.css`; **shared** `api/solo/submit/route.ts` (cricket-only branch) | `cricket-release.spec.ts` (3) | Medium | Yes |
| 7 | `91ac50a` | Documentation | `docs/` | — | None | Yes |
| 8 | `afe2289` | Replay a submitted run's log at most once; one database client per submission (security S1) | **Shared** `api/solo/submit/route.ts` (cricket-only branch); `e2e/cricket-release.spec.ts` | New browser test "the server replays an international run's log once…"; the existing `409` assertion in `cricket.spec.ts` | Low–medium: two early returns, cricket only, behind every existing check. A failed read just continues to the existing path | Yes |
| 9 | `78ec96a` | An explicit 60 s budget for the golden-corpus test | `packages/engines/test/cricket-v1-golden.test.ts` | Itself; assertions unchanged | None (test only) | Yes |
| 10 | `4bcdecc` | The workerd benchmark and the crafted-log case | `packages/engines/bench/*`, `packages/engines/package.json` (scripts only) | — (not in any build or test run) | None: not shipped in any bundle | Yes (tooling) |
| 11 | This document's commit | The seven audit documents, plus updates to two existing ones | `docs/` | — | None | Yes |

**The seven earlier commits:** 61 files, +5,096 / −206 lines. This audit's code commits add three code files and the bench.

## What the diff does and doesn't contain

Checked over `origin/feature/unified-platform..HEAD`:

| Concern | Finding |
|---|---|
| Database schema or migration | **None.** `packages/db/prisma` is unchanged from `main`, which has the same four migrations that production already has (applied 2026-11-05, `docs/PRODUCTION_MIGRATION_READINESS.md`) |
| Destructive migration | None (no migration at all) |
| Worker configuration (`wrangler.jsonc` ×2, `open-next.config.ts`, `next.config.ts`) | Unchanged |
| Environment variables | **None added or read** by runtime code. The new `process.env` reads are bench and test controls only (`CRICKET_MATCHES`, `CRICKET_GOLDEN`, and this mission's `CRICKET_CASES_OUT` / `CRICKET_REPEAT` / `CRICKET_WORKERD_PORT`) |
| Dependencies and lockfile | **Unchanged.** `pnpm-lock.yaml` is untouched. `packages/engines/package.json` gains scripts only. The Linux frozen install confirms the lockfile hash |
| Build scripts | Unchanged, apart from the engine bench scripts, which aren't part of any build |
| Node-only APIs in runtime code | None added. No `node:` imports, `fs`, `Buffer` or child processes in `apps/web/src`, `packages/engines/src` or `packages/db/src` additions |
| External network requests | None added. No new `fetch`, URLs, sockets or beacons in runtime code |
| Secrets | None found. Added lines were scanned for connection strings, API-key shapes, private keys and inline tokens |
| Unrelated games | Only the shared solo plumbing listed above (recovery, the submit route, `recordMatch`'s neutral rule). No other game's engine, UI or tests were changed. Cuisine Quest's recovery wording and behaviour are kept, and its campaign checks are unchanged |
| Root `AGENTS.md` / `CLAUDE.md`, `apps/web/AGENTS.md` | Not modified |
| Development-only configuration | `/dev/cricket-studio` existed before and is still refused in production builds unless `CRICKET_STUDIO=1` |
| Test cricket | Not exposed. The server's config schema accepts only `t20` and `odi` (`PLAYABLE_FORMATS`), and a test asserts that `format: "test"` is refused |

## Changes made in this audit

Recorded here as they were made; results are in `CRICKET_RELEASE_DECISION.md`.

1. **`/api/solo/submit` (cricket only): two replay guards.** See `CRICKET_SECURITY_RELEASE_REVIEW.md` finding S1.
   - A run already saved is answered `409` *before* it is replayed again (one primary-key read).
   - A run whose log failed verification isn't replayed again in that isolate.
   - The route now also opens one database client per request instead of two. On Workers, each `getDb()` opens its own connection.
   - New browser regression test in `cricket-release.spec.ts`.
2. **The 96-duel golden-corpus test gets an explicit 60 s timeout,** like every other match-replaying cricket test. It takes about 2.5 s alone, but about 5.6 s when the format suites run alongside it. That exceeded vitest's 5 s default and failed `pnpm test` twice in this audit. Its assertions are unchanged.
3. **A workerd benchmark** (`packages/engines/bench/cricket-workerd.mjs` and helpers): the first measurement of verification inside the Workers runtime, run locally. The log builder is shared with the Node bench (`bench/cricket-logs.ts`), and an adversarial "no-ball flood" case is added. Also a one-character type fix in `bench/cricket-stress.ts`.
4. **Documents:** this audit, `CRICKET_CLOUDFLARE_COMPATIBILITY.md`, `CRICKET_SECURITY_RELEASE_REVIEW.md`, `CRICKET_ENVIRONMENT_CHECKLIST.md`, `CRICKET_PREVIEW_VALIDATION_PLAN.md`, `CRICKET_PRODUCTION_RELEASE_RUNBOOK.md` and `CRICKET_RELEASE_DECISION.md`. `CRICKET_PERFORMANCE_BENCHMARKS.md` is updated.
