# Sinverse Cricket: T20 and ODI release-candidate report

**Release candidate status:** local only. Branch `feature/unified-platform`, from `98dca74`.
- **Nothing was pushed, merged or deployed.** No Preview was published.
- **Production was not changed:** no production database, migration, secret, DNS, Cloudflare, Railway, Neon or Resend setting.
- **No root instruction file was modified** (`AGENTS.md`, `CLAUDE.md`).

**Companion documents:**
- `CRICKET_RELEASE_READINESS_AUDIT.md`: findings by severity.
- `CRICKET_RULES_VALIDATION.md`: the rules, one by one.
- `CRICKET_PERFORMANCE_BENCHMARKS.md`: server CPU.
- `CRICKET_AI_OPPONENT_REPORT.md`: the AI.
- `TEST_CRICKET_PERSISTENCE_PROPOSAL.md`: Test cricket.
- `CRICKET_REMAINING_WORK.md`: what's left.

## Implemented

| Area | What changed |
|---|---|
| **Rules (v2)** | Run-outs before the batters cross dismiss the right batter. After a run-out the new batter comes in at the broken wicket, on strike. Runs off a ball both wide and a no-ball count as byes. A no-ball counts as a ball faced. An XI whose keeper is one of only five bowlers is refused, because it couldn't finish its overs. A drawn Test's clock no longer reports "day 6". The duel (v1) is unchanged |
| **Fairness** | Only legal balls the player controls count towards the 30 (T20) or 60 (ODI) balls that make a win theirs; deliberate wides and no-balls no longer count. Thresholds unchanged. Impossible pace is refused before the costly replay (cricket only) |
| **Server cost** | Verification CPU down 40–55% with identical outcomes: running plans branch from an exact checkpoint (`Delivery.fork`), each plan is simulated once, and the per-tick digest allocates nothing. Authority is unchanged: the server still replays every delivery |
| **AI** | Bowling plans by phase (swing up front, spin in the middle, yorkers and slower balls at the death). Difficulty is execution accuracy and captaincy, no longer just pace. Death-over planning for the best seamers. Smarter fields. Fewer risky runs at higher levels. Comfortable chases protect wickets. Difficulty is now monotonic (player side wins 83/50/25% in T20 sims at club/county/elite) |
| **Match setup** | A side-by-side strength comparison of the two elevens that will play, updating as the XI changes. An XI status line with bowling options besides the keeper and the role mix. The exact eleven listed (captain and keeper marked) before the start |
| **Innings break** | A card with the first-innings total, target, required rate, top score, best bowling, best stand, run rate and extras, and the fall of wickets. Continuous play no longer skips it, and it survives a refresh |
| **Result** | A top performer, chosen by a published rule (runs + 20 a wicket + 8 a catch, stumping or run-out). Each side's best batting, bowling and stand. "Your part": balls played, runs, wickets, simulated balls, and whether the win counts and why. A full-scorecard button. The same summary in the saved-result view |
| **Accessibility** | Pressing Enter on a focused button in the match no longer also fires the game's action key (a double action). The comparison rows are labelled for screen readers. The innings-break button works by keyboard |
| **Tooling** | `bench:cricket` (verification CPU), `bench:balance` (AI balance), `stress:cricket` (the 500 + 500 stress run), all through vitest, so they work on a fresh install |
| **Test cricket** | Not exposed. Persistence proposal written |

## Tested locally

All on Windows 11 with Node 24.14.0 and pnpm 11.15.1. The database was the local loopback PostgreSQL `*_test` databases.

| Command | Result |
|---|---|
| `pnpm typecheck` | **Passed** (every package) |
| `pnpm test` | **580 passed, 0 failed**: shared 32, engines 487 (was 463; +24 new), realtime 61 |
| `pnpm test:db` | **66 passed**, in 6 files |
| `pnpm build` | **Passed** |
| `CRICKET_MATCHES=500 pnpm --filter @platform/engines stress:cricket` | **0 failures in 355 s.** 500 T20 and 500 ODI matches, all verified exactly by the server with summaries identical to the browser's. 3,200 tampered logs rejected (8 kinds on 400 matches). T20 results: 256 chases, 238 defences, 6 ties; 17,554 own balls, 88,009 simulated. ODI results: 257 chases, 242 defences, 1 tie; 34,775 own balls, 193,345 simulated |
| Baseline before any change | `pnpm typecheck` passed; `pnpm test` 556 passed (that run used the shell's Node 20.20.2) |

**New tests (none removed, skipped or weakened):**
- **Engines:** `cricket-rules-v2.test.ts` (13), `cricket-ai.test.ts` (8), `cricket-awards.test.ts` (3).
- **Browser:** `cricket-release.spec.ts` (3).
- **One existing assertion made exact, not looser.** `cricket-formats.spec.ts` asserted "you played 2 balls" after two hand-played deliveries. Since only legal balls count now, a random AI wide among them would have made it flaky. It now asserts that 1–2 legal balls were counted and that the result text shows exactly that number (`data-controlled-balls`).

## Browser tested

`pnpm test:e2e` (Playwright, Chromium, production builds, local database):

**First run:**
- `E2E_DATABASE_URL` set to the local `sinversegames_expansion_test`, but without the identity fixture environment.
- **185 passed, 8 failed, 2 did not run, 10 skipped,** in 57.9 min.
- All 10 failed and not-run tests were the email-auth and identity specs. They need the local identity fixture environment (`IDENTITY_TEST_MODE`, a loopback email capture, generated local secrets, the identity `*_test` database), which the previous milestone's run used and this run didn't set.

**Re-run of those two specs** (`email-auth.spec.ts`, `identity.spec.ts`) with that environment: **10 passed** in 4.1 min.

**Combined: 195 passed, 0 failed, 10 skipped.**
- Before this milestone: 192 passed.
- The skips are the on-demand footage and evidence recorders, as before.
- Every cricket spec, including the 3 new ones, passed in the full run.

The suite rewrites tracked images in `artifacts/cricket-2`; they were restored with `git restore`.

**Screens reviewed** at 1366 × 860 and 390 × 844 (Chromium, GPU; screenshots kept locally, not committed):
- the setup's team step with the comparison;
- the XI step, valid and with a bowling keeper refused;
- the match settings;
- live play;
- the innings break;
- the finish card;
- the full scorecard;
- the saved scorebook.

No page errors, and no sideways scroll at either width.

## Benchmarked

**Server verification**, local Node, single thread (method in `CRICKET_PERFORMANCE_BENCHMARKS.md`):

| Case | Run directly | Under vitest |
|---|---|---|
| ODI, player bowls all (worst case) | 547 → **281** ms CPU median (max 626 → 328) | 985 → 531 ms |
| ODI, all simulated | 500 → **281** ms | 907 → 500 ms |
| T20, all simulated | 203 → **109** ms | 406 → 188 ms |

Payload is at most about 55 KB for an ODI, against a 512 KB limit.

**AI balance:** 40 simulated matches per cell; see `CRICKET_AI_OPPONENT_REPORT.md`.

**Rendering:** not re-benchmarked. The 3D renderer, characters and scene are unchanged in this milestone; the new UI is DOM overlays only. The previous figures stand (`CRICKET_TEST_RESULTS.md`).

## Linux Cloudflare build

`pnpm cloudflare:build` in WSL, in a clean copy of the working tree with no `.env`:
- Node 24.14.0, pnpm 11.15.1.
- `pnpm install --frozen-lockfile`; lockfile unchanged (SHA-256 `bbf66641…`).
- Both Prisma clients generated.

**Result:**
- OpenNext build **passed**; Worker emitted; 31 MB of static assets; nothing uploaded.
- The first run showed that the new bench scripts needed `tsx`, which a fresh install of `packages/engines` doesn't link. They were moved to vitest, and the re-run confirms them (see below).

**Re-run on the final tree, same setup:**
- Frozen install with the lockfile unchanged.
- `pnpm --filter @platform/engines bench:cricket` ran to completion through vitest (58 s).
- `cloudflare:build` **passed**: Worker emitted, 31 MB of assets including 22 GLB models.

## Not tested

- **Real devices:** physical phones and tablets, and Safari or WebKit. Phone width was emulated in Chromium.
- **Assistive technology** beyond keyboard operation and accessible names.
- **A real Cloudflare Worker's CPU** for verification, and the account's plan limit.
- **A whole match played ball by ball by a person:** about 40 minutes for a T20, two hours or more for an ODI. Browser tests play some balls by hand and simulate the rest; the stress run plays the player's inputs programmatically.
- **Dropped connection during submission:** the existing retry and duplicate path is unchanged and wasn't re-tested beyond the existing suite.

## Requires external infrastructure

- Measuring verification CPU on the deployed Worker (a Preview or production), and confirming the Workers plan's CPU limit.
- Any release: push, Workers Build, deployment.

## Requires your approval

1. **Push and release** of these local commits. No migration is needed for T20 and ODI.
2. **Cloudflare CPU:** confirm the plan (Paid's default is 30 s per request). If it's tight, choose one of the options in `CRICKET_PERFORMANCE_BENCHMARKS.md`. Verifying on the Railway realtime service needs a new internal endpoint and a realtime deployment.
3. **Test cricket:** the additive migration and the four policy questions in `TEST_CRICKET_PERSISTENCE_PROPOSAL.md`, section 7.

## Git

- **Start:** `98dca74` on `feature/unified-platform`. Clean; 4 ahead and 0 behind `origin/feature/unified-platform`.
- **Commits created in this milestone (local):**
  - `6ff4030`: engine rules, fairness, AI, verification cost, tests and bench scripts.
  - `32f8216`: web innings break, awards, setup comparison, the submit pace pre-check, browser tests.
  - The documentation commit that adds this report.
- **Changed files:**
  - Engine: `packages/engines/src/sinverse-cricket/{match,physics,rules,teams,index}.ts` and new `awards.ts`; `packages/engines/package.json` (scripts only); new `bench/` (7 files); new tests `cricket-rules-v2`, `cricket-ai` and `cricket-awards`.
  - Web: `apps/web/src/games/sinverse-cricket/{cricket-game,international-setup}.tsx`, `cricket.css`, new `match-summary.tsx`; `apps/web/src/app/api/solo/submit/route.ts`; `apps/web/e2e/cricket-formats.spec.ts` and new `cricket-release.spec.ts`.
  - Docs: seven listed above (six new or replaced, plus the progress log).
- **Not touched:** other games' code, the database schema and migrations, `pnpm-lock.yaml`, environment files, Cloudflare and Wrangler configuration, root `AGENTS.md` and `CLAUDE.md`, and `apps/web/AGENTS.md`.
