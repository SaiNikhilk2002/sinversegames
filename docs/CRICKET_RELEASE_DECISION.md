# Sinverse Cricket T20/ODI: release decision

## Decision: CONDITIONAL GO

**The code is ready to release.** Every local check passes, server verification works inside the Workers runtime, and no migration, configuration or dependency change is needed.

**Two things can't be verified from here and must be confirmed first:**
1. **The Cloudflare account is on Workers Paid.** On the Free plan, every T20/ODI result submission would exceed the 10 ms CPU limit and fail.
2. **Real Worker CPU,** from a Preview (Mode A) or the first production submissions. A Preview can't be used safely until its secrets are confirmed isolated.

A local build passing isn't enough for GO, and an unverified CPU limit rules out an unconditional GO.

| Item | Status |
|---|---|
| **Release commit** | **The tip of `feature/unified-platform` after this document's commit**, "docs(cricket): production release audit…" (a document can't contain its own hash; it is given in the handoff and by `git log -1`). That commit changes documentation only. The last code commits are `afe2289` (the submit route fix), `78ec96a` (a test budget) and `4bcdecc` (the bench), and every test below ran on that code |
| **Branch** | `feature/unified-platform` |
| **Commits ahead of `origin/feature/unified-platform`** | **11**: the 7 earlier commits, `51280d8` to `91ac50a`, and this audit's 4 (0 behind). `origin/main` has the same tree as `origin/feature/unified-platform` (`0793ec8`), so these are also exactly the changes over `main` |
| **Base** | `origin/main` = `92e4fde` (merge of PR #5) |

## Tests and results (2026-11-13, Windows 11, Node 24.14.0, pnpm 11.15.1, local loopback PostgreSQL `*_test` databases)

| Check | Result |
|---|---|
| `pnpm typecheck` | **Passed** (every package) |
| `pnpm test` | **580 passed** (shared 32, engines 487, realtime 61), after adding an explicit timeout to the 96-duel golden test. Before that, two runs failed only that test, by timeout: 5.6 s against vitest's 5 s default under full parallel load. Its assertions passed in isolation (2.7 s) and with 2 workers (487/487). See `PRODUCTION_RELEASE_AUDIT.md` |
| `pnpm test:db` | **66 passed** (6 files), on `sinversegames_expansion_test` |
| `pnpm build` | **Passed** (Node production build of web and realtime) |
| `pnpm test:e2e` | **196 passed, 0 failed, 10 skipped** in one run (55.4 min; Playwright, Chromium, production builds, local `sinversegames_identity_test` with the loopback identity fixtures). This includes the 10 email and identity tests and the new replay-guard test (Mission 2: 195 passed over two runs). The suite rewrote tracked images in `artifacts/cricket-2`, which were restored with `git restore` |
| Linux Cloudflare build (WSL Ubuntu, clean copy, no `.env`) | **Passed.** Frozen install with the lockfile unchanged (SHA-256 `bbf66641…cf2ce2d`), both Prisma clients, `pnpm cloudflare:build` exit 0, Worker emitted, about 31 MB of assets, 22 GLB models, the artifact check passed. **Nothing uploaded** |
| Stress: `CRICKET_MATCHES=500 pnpm --filter @platform/engines stress:cricket` | **0 failures** in 1,035 s. 500 T20 and 500 ODI, every match verified exactly; **3,200 tampered logs rejected**. Counts identical to Mission 2's run (deterministic): T20 256 chases, 238 defences, 6 ties; ODI 257 / 242 / 1 |
| Historical duels | **All 96 replay exactly** (`cricket-v1-golden.test.ts`, within `pnpm test`) |
| Verification in workerd (local Workers runtime, Wrangler 4.155.0, no upload) | Worst real ODI **356 ms median, 505 ms max** over two runs; T20 at most 217 ms; crafted worst log **at most 2.31 s**. All 510 verifications matched Node exactly |
| Verification in Node, direct | Worst ODI 375 / 422 / 422 ms (median / p95 / max) on a loaded machine; 281 ms in Mission 2 |

**Intentionally skipped browser tests (10).** These are on-demand footage and evidence recorders, skipped unless `CRICKET_EVIDENCE` or a phase-specific variable is set:
- `cricket-batting-footage` (1);
- `cricket-benchmark` (1);
- `cricket-evidence` (1);
- `cricket-fielding-evidence` (1);
- `cricket-gameplay-footage` (2);
- `cricket-phase5-footage` (4).

**Screens:** Captured on the final build at 1,366 × 860 and 390 × 844 (Chromium, local production server):
- the team comparison, the XI and the settings;
- live play, the innings break and the finish card;
- the full scorecard and the saved scorebook.

**Zero page errors and no sideways overflow** at either width (16 images, kept locally in the session scratchpad, not committed).

## Status by area

| Area | Status |
|---|---|
| **Cloudflare plan** | **NOT VERIFIED — USER CONFIRMATION REQUIRED.** `DEPLOYMENT.md` intends Workers Paid; nothing readable here proves it (`CRICKET_CLOUDFLARE_COMPATIBILITY.md`) |
| **CPU** | **Verified in local workerd, not on Cloudflare.** At most about 0.5 s for a real match and 2.3 s for a crafted log, against Paid's 30 s default (no `limits.cpu_ms` in the repository). **Incompatible with Free (10 ms)** |
| **Security** | **No integrity vulnerability.** The client can't award itself runs, wickets, results or rewards; the XI and every rule are enforced server-side. S1 (repeatable costly replays) **fixed locally** with a regression test. S2 (crafted-log CPU cost) is **residual and bounded**: watch Observability (`CRICKET_SECURITY_RELEASE_REVIEW.md`) |
| **Authentication** | **Unchanged by the release.** Guest, email and Google sign-in, sessions and cookies (`httpOnly`, `SameSite=Lax`, `Secure` on https) pass locally against **fixtures**. Real Google consent and real email delivery in production are **not verified by this audit** |
| **Database** | **No migration.** The schema is identical to `main`'s, whose four migrations production already has. Only existing columns are written. Chef Rivals' behaviour is unchanged by the shared neutral-result line. Existing players, wallets, cosmetics, achievements and history are untouched |
| **Preview validation** | **BLOCKED** until Previews Base secrets are confirmed: no production `DATABASE_URL`, and a different `AUTH_SECRET`. Mode A (no database) is then safe and measures real CPU (`CRICKET_PREVIEW_VALIDATION_PLAN.md`) |
| **Realtime** | Not used by cricket. **Merging to `main` will restart the Railway service** (its watch patterns include `packages/**`), ending live multiplayer rooms. Release at a quiet time |
| **Test cricket** | Not exposed (the server refuses `format: "test"`); no table or migration created. Open decisions are listed below |

## Known limitations

- **No real device testing:** no physical phones or tablets, Safari/WebKit or assistive technology beyond keyboard and labels. Phone width was emulated in Chromium.
- **No real-Worker CPU measurement,** and no production or Preview run.
- **No whole match played ball by ball by a person:** about 40 minutes for a T20, 2 hours or more for an ODI.
- **Replay proves a match is possible and paced, not that a human played it.**
- **One cricket leaderboard** mixes duel and international scores at any difficulty.
- **A simulated loss counts; a simulated win doesn't.**
- **An ODI paused for more than 6 hours** can't be submitted.
- **Future v2 engine changes** will invalidate in-progress v2 matches. Freeze a v2 golden corpus first.
- **Gameplay limits** are listed in `CRICKET_REMAINING_WORK.md`: no Super Over, no DLS, balance from tuning.

## What you need to do

1. **Confirm the Workers plan is Paid,** and that the `sinversegames` Worker's CPU limit is at least the 30 s default. If it's Free, stop: T20/ODI can't be released on Free.
2. **Decide on Preview validation:**
   - either confirm the Previews Base secrets are isolated (no production `DATABASE_URL`, a different `AUTH_SECRET`) and approve a Mode A Preview;
   - or skip the Preview and rely on post-release Observability checks with a rollback ready.
3. **Record the current production Worker version ID** (Deployments) as the rollback target.
4. **Approve and perform the release** (`CRICKET_PRODUCTION_RELEASE_RUNBOOK.md`):
   - push `feature/unified-platform`;
   - open a PR to `main`;
   - merge at a quiet time.
   - Workers Builds then deploys production, and Railway restarts realtime.
5. **Run the post-release checks** in the runbook, including Observability CPU time for `POST /api/solo/submit` (expect hundreds of ms, and no `exceededCpu`).
6. **Optional:**
   - a WAF rate-limit rule on `POST /api/solo/submit` if Observability shows abuse;
   - `limits.cpu_ms` committed to `wrangler.jsonc`.
7. **Test cricket, later and separately:** approve or decline the proposal's four decisions (`TEST_CRICKET_PERSISTENCE_PROPOSAL.md` § 7):
   - the additive migration;
   - the 30-day abandonment rule;
   - guests and Test matches;
   - Worker or Railway segment verification.
