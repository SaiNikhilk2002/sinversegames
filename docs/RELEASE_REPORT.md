# Release report: product expansion (Same Wavelength, discovery, Couples)

**Date:** 2026-11-15
**Status:** **pushed, not merged, not deployed.** The release stopped before the merge, because the pull request the brief names is already closed (see "Blocker").

## Summary

| Stage | Status |
|---|---|
| Pre-release audit | Done |
| Release gate | Passed |
| Push `feature/unified-platform` | **Done**: fast-forward `0793ec8..7407142`, no force |
| Update PR #5 | **Not possible**: PR #5 was already merged on 2026-11-12 |
| Merge to `main` | **Not done**: needs a new pull request (user action) |
| Cloudflare deployment | **Not deployed** |
| Railway deployment | **Not deployed** |
| Production smoke tests | **Not run** for the new release. A read-only baseline is below |
| Cricket verifier secret | **Requires user configuration** (after deployment) |

## 1. What's being released

- **Range:** `0793ec8..7407142` on `feature/unified-platform`, 23 commits, the same commits listed in `git log 0793ec8..7407142`.
- **Size:** 168 files, +13,391 / −256.
- **Contents:**
  - the T20/ODI cricket work (international teams, engine v2, rules fixes, verification cost, release audit);
  - the infrastructure optimizations:
    - WebSocket compression;
    - optional cricket verification on Railway;
    - one database client per request on Workers;
    - the `/health/live` liveness route;
    - the Bumper Blitz bandwidth budget;
  - the product expansion:
    - Same Wavelength;
    - multi-category discovery;
    - the Couples page;
    - Fun Insights;
    - share cards.
  - Documentation for all of the above.

**Where things stand:**
- **Base:** PR #5 merged the branch up to `0793ec8` (merge commit `92e4fde`, 2026-11-12).
- **Tree:** `origin/main`'s tree is identical to `0793ec8`'s, so merging this range can't conflict.
- **History:** nothing in it is published history that would need rewriting.

## 2. Pre-release audit

- **Working tree:** clean.
- **Branch state:** 23 ahead of and 0 behind `origin/feature/unified-platform` before the push. Against `origin/main`, 23 ahead and 1 "behind", which is PR #5's merge commit and changes no files.
- **Excluded files:** no `.env`, key, generated client, `.next`, `.open-next`, `.data` or log files in the diff.
- **Secrets:** a pattern scan of every added line (connection strings with passwords, provider keys, private keys, OAuth secrets) found only local test placeholders: `localhost:5433/..._test` and `127.0.0.1:1/never_used_test`.
- **Database:** no migrations and no `schema.prisma` change.
- **Infrastructure:** no changes to the lockfile or Wrangler, Docker or Railway configuration. The `package.json` changes are only new bench scripts and the `./same-wavelength` engine export.
- **Attribution:** commit authors are the repository owner, and no commit has attribution trailers.

## 3. Release gate

| Check | Result | When |
|---|---|---|
| `pnpm typecheck` | Pass | Re-run 2026-11-15 |
| `pnpm test` (Node 24.14.0) | **647 passed** (54 + 503 + 90) | Re-run 2026-11-15 |
| `pnpm test:db` | 69 passed | Implementation run |
| `pnpm build` | Pass | Implementation run |
| Full browser suite, fresh `_test` database | 205 passed, 0 failed, 10 skipped (on-demand recorders) | Implementation run |
| Linux Cloudflare/OpenNext build | Pass, lockfile unchanged | Implementation run |
| Same Wavelength load (50 rooms / 140 players) | About 10% of one core, about +94 MB RSS | Implementation run |

**Implementation-run results stand:** the code hasn't changed since they were recorded. Only `7407142`, a documentation commit, came after them.

**Node 20 note.** A first re-run by mistake used the machine's default Node 20.20.2. There, `apps/realtime/test/cricket-verify.test.ts` failed 8 of its 13 tests. Under the supported Node 24.14.0 all 90 realtime tests pass, so the failures came from the unsupported Node version and aren't a code defect. Production builds use Node 24.14.0 (see the `.node-version` files).

## 4. Security and privacy review

From the code and its tests (`SAME_WAVELENGTH_DESIGN.md`, `FUN_INSIGHTS_SYSTEM.md`):

- **Hidden answers:** `viewFor` exposes only your own answer and whether others have answered. The socket test checks every message sent before the reveal.
- **Ownership, duplicates and deadlines:**
  - Answers are keyed by the socket's authenticated player id.
  - A non-member gets `NOT_IN_ROOM`; a second answer `INVALID_MOVE`; a stale round `STALE_STATE`.
  - Late answers are refused, and scoring and round progression happen only on the server.
- **Reconnection:** you rejoin with your own answer only.
- **Share cards:**
  - Cards are created only for a signed-in participant of a recorded, completed multiplayer match. Anyone else gets the same 404 as an unknown id.
  - The token is HS256-signed. An edited, foreign or expired token is a 404.
  - Names appear only when opted in. There are never emails, player ids, room codes, match ids or answers.
- **Typed answers:**
  - Rendered as React text, so they're escaped.
  - 40 characters at most, with control characters stripped.
  - Off in public quick match; the existing report button remains.
  - There's no word filter (a known limitation).
- **Existing data:** no migration. Game ids are unchanged, and existing records are untouched. Same Wavelength only adds normal neutral match rows and two new achievement keys.

## 5. Blocker: PR #5 is already merged

The brief asks to update PR #5 and merge it.

- **What happened to it:** PR #5 (`feature/unified-platform` → `main`) was **merged on 2026-11-12**, at `0793ec8`, as merge commit `92e4fde`.
- **No other PR:** no pull request is open.
- **Why the release stopped:** the brief says to stop rather than create a different PR when the named PR is closed.
- **No way to open one here either:** there's no GitHub CLI, and reading the stored Git credential to call the API would mean handling a credential.

**To finish the release (user action):**
1. Open a new pull request from `feature/unified-platform` into `main` (on GitHub, "Compare & pull request"). It'll show exactly these 23 commits with no conflicts.
2. Merge it with the repository's usual merge commit strategy.
3. Merging deploys:
   - **Cloudflare:** Workers Builds builds and deploys `main` with `pnpm cloudflare:deploy`.
   - **Railway:** redeploys the realtime service, which **ends any active multiplayer rooms**. Choose a quiet time.
4. **No database migration is needed.** Production already has all four migrations, and this release adds none.
5. Then run the production checks in "After the merge".

## 6. Production baseline (read-only, before any deployment)

Probed 2026-11-15:

| URL | Status | Meaning |
|---|---|---|
| `https://sinversegames.com/` | 200 | |
| `https://www.sinversegames.com/` | 200 | |
| `/couples` | 404 | Expected: not deployed |
| `/games/same-wavelength` | 404 | Expected: not deployed |
| `https://rt.sinversegames.com/health` | 200 | `{"status":"ok"}`, up about 64 hours |

**Production is healthy and still serving the previous release.** No production data was read or written.

## 7. Cricket verifier

Unchanged by this release:
- Railway cricket verification stays disabled until the **Worker secret** `CRICKET_VERIFIER_URL` is set. That's a pending user action, after Railway is confirmed healthy.
- The secret wasn't read, invented or changed.
- Until it's set, existing Worker verification applies.

## 8. After the merge (checklist)

- **Cloudflare:**
  - the Workers Build succeeds;
  - `sinversegames.com` and `www` return 200;
  - `/couples`, `/categories/friends`, `/categories/single-player` and `/games/same-wavelength` return 200;
  - `/categories/nope` returns 404;
  - existing `/games/<slug>` and `/play/<slug>` pages return 200.
- **Railway:**
  - the deployment is healthy;
  - `/health` and `/health/live` return 200;
  - a Socket.IO connection over WebSocket works from both the apex and `www`.
- **Same Wavelength:**
  - a private Couples room in two browser contexts;
  - answers hidden, then revealed;
  - the summary and insights;
  - a share link with and without names, and a tampered link giving 404.
  - Note: this creates a real production match and achievement rows for whichever players are used.
- **Existing games:** open each game page and start a solo run or room, plus guest sign-in and the profile page.
- **Monitoring:**
  - Worker errors and CPU;
  - Railway memory after compression, under real traffic;
  - Neon compute;
  - `/api/share` errors.
  - The local load test's +94 MB for 140 players isn't a production capacity figure.

## 9. Git state

- **Branch:** `feature/unified-platform` at `7407142`, equal to `origin/feature/unified-platform`.
- **`main`:** `origin/main` at `92e4fde`.
- **This report:** committed locally afterwards, not pushed, so it doesn't enter the release range unasked.

**Nothing was merged or deployed.** No Railway restart, no production migration, no secret, DNS or infrastructure change.
