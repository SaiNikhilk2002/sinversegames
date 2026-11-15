# Release report: product expansion (Same Wavelength, discovery, Couples)

**Date:** 2026-11-15
**Status:** **deployed to production and verified**, with one cosmetic share-card bug found and fixed on the branch. That fix isn't deployed yet (see section 7).

## Status at a glance

| Item | Status |
|---|---|
| Cloudflare website, `sinversegames.com` and `www` | **Deployed and verified** |
| Railway realtime, `rt.sinversegames.com` | **Deployed and verified** |
| Discovery, category and Couples pages | **Deployed and verified** |
| Same Wavelength: full Couples game, insights and sharing | **Deployed and verified** |
| Existing games: rooms or play pages | **Deployed and verified** (smoke level) |
| Guest sign-in, account and profile pages | **Deployed and verified** |
| Email and Google sign-in | **Deployed, not verified.** Exercising them needs a real inbox or Google account |
| Share-card name-order fix (`apps/web/src/app/api/share/route.ts`) | **Not deployed.** Pushed on the branch; needs a merge |
| Railway cricket verifier | **Requires user configuration:** the Worker secret `CRICKET_VERIFIER_URL` |
| CPU and memory dashboards | **Not inspected.** I don't have dashboard access (section 9) |

## 1. What was released

- **Range:** `0793ec8..ce0cba1`, 24 commits:
  - the T20/ODI cricket work;
  - the infrastructure optimizations;
  - the product expansion;
  - the documentation, and the first version of this report.
- **Size:** 168 files, +13,391 / −256 before the report.
- **Not included:** database migrations, schema changes, dependency or lockfile changes, Wrangler or Railway configuration changes.

## 2. Pull request and merge

- **PR #5:** already merged on 2026-11-12, at `0793ec8`, as merge commit `92e4fde`. It couldn't be updated.
- **PR #6:** `feature/unified-platform` → `main`, opened and **merged by the owner** at **2026-11-15 08:01:20 UTC**.
  - **Merge commit:** `f8e17e2e823dac13467b5930a08bdede54c8e766`.
  - **Contents:** the merge's tree is identical to `ce0cba1`.
- **No force-push and no rewritten history.** Both pushes were fast-forwards: `0793ec8..7407142`, then `7407142..ce0cba1`.

## 3. Deployments

| Service | Identifier | Finished (UTC) | Result |
|---|---|---|---|
| Cloudflare Workers Builds, Worker `sinversegames` | Build `a65393ca-b33f-4be8-bb6a-f95b7390483b`, version `089a2239-0cf7-4ce3-9085-077aa2f6fd7a` | 08:04:01 (started 08:01:29) | Success |
| Railway `@platform/realtime` (project "luminous-recreation") | GitHub status "Success - rt.sinversegames.com" | 08:02:53 | Success. `/health` uptime reset at about 08:02:47 |

**Database:** no migration was needed; production already has all four migrations.

**Active rooms:** the Railway restart ended any multiplayer rooms that were live at about 08:02 UTC, as expected.

## 4. Production smoke tests (2026-11-15, 08:05–08:10 UTC)

### Routes

| Route | Result |
|---|---|
| `/`, `/games`, `/couples` | 200 |
| `/categories/` multiplayer, single-player, friends, family, party, competitive and casual | 200 |
| `/categories/nope` | 404 |
| `/categories/couples` | 308 to `/couples` |
| `/games?q=draw` | 200 |
| `/sitemap.xml` | 200 |
| `www.sinversegames.com/` and `www.sinversegames.com/couples` | 200 |
| `/games/<slug>` and `/play/<slug>` for all 12 games | 200 (24 of 24) |
| `/leaderboard`, `/account`, `/profile` | 200 |
| `/api/health/live` | 200 `{"status":"ok","web":"ok"}` |
| `/api/health` | 200: web, database and realtime all `ok` |
| `rt.sinversegames.com/health` | 200 `{"status":"ok"}` |

### Realtime

- **Socket.IO polling handshake:**
  - from `https://sinversegames.com`: 200, with the exact origin echoed back and a `websocket` upgrade offered;
  - from `https://www.sinversegames.com`: the same;
  - from an unrelated origin: **403**.
- **Rooms:** a real browser connected and created a private room in **all 7 multiplayer games** (Doodle Duel, Color Clash, Token Trail, Bumper Blitz, Chef Rivals, Kitchen Rush Co-op, Same Wavelength). That's the room layer only: no match was played in those games.
- **Solo games:** Kitchen Rush, Cascade Solitaire, Mahjong Garden, Sinverse Cricket and Cuisine Quest loaded with **zero page errors**. No solo run was submitted.

### Same Wavelength and discovery (existing browser tests, pointed at production)

6 of 7 tests passed.

- **Discovery, 5 of 5:**
  - the Couples page's content, metadata and canonical;
  - one game in every category it suits;
  - category metadata, filters, the redirect and the 404;
  - `/games` search and the player filter;
  - phone width.
- **Same Wavelength:**
  - **What worked:** a complete 5-round Couples game between two separate guest browser contexts:
    - a preset link and an invitation;
    - answers hidden until both had answered;
    - the reveal and the verdict;
    - the summary (70%) with its "not how compatible" note;
    - Fun Insights;
    - "Played together" (never "Defeat");
    - a share card without names;
    - the play link;
    - a **tampered token giving 404**;
    - a share card with names on opt-in.
  - **The one failure:** the last assertion expected "Asha & Ben", and production rendered "**Ben & Asha**". That's a real bug, cosmetic and not a privacy issue: see section 7.

## 5. Authentication and persistence

- **Guest sign-in:** works. Every smoke run created a guest and played or opened rooms with it.
- **Account and profile pages:** load.
- **Same Wavelength match persistence:** works. The match was recorded as completed, otherwise the share endpoint (which requires a recorded, completed match in which the caller played) would have refused it.
- **Email and Google sign-in:** not exercised. That needs a real inbox or Google account, and both use unchanged code from earlier releases.
- **Wallets, achievements and history:** existing data is untouched; no migration and no data change.

**Records my tests created in production:**
- the guest players "Asha", "Ben" and "Smoke";
- one completed Same Wavelength match, with its neutral result and base rewards;
- empty private rooms, which expire on their own.

These aren't deleted: the reward ledger is append-only, and deleting production rows isn't authorized.

## 6. Cricket verifier

- **Status:** **requires user configuration.** Railway cricket verification stays off until the Worker secret `CRICKET_VERIFIER_URL` is set.
- **Untouched:** I didn't read, invent or change the secret.
- **Until it's set:** cricket runs are verified in the Worker as before. No cricket run was submitted during the smoke tests.

## 7. Bug found: share-card name order (fixed on the branch, not deployed)

- **The bug:** for a cooperative result, every participant has placement 1 and the same score. `POST /api/share` sorted by placement and score only, so names came out in the database's row order, which Neon doesn't keep stable. The same match could be shared as "Ben & Asha" one time and "Asha & Ben" the next. Local PostgreSQL returned insertion order, which is why local tests passed.
- **The fix:** a final tie-break by display name, then player id. The existing browser test, unchanged, pins it.
- **Release:** committed and pushed to `feature/unified-platform`.
  - It needs a merge to deploy. The change is web-only.
  - If Railway rebuilds on every `main` push, merging restarts the realtime service and ends live rooms again, so merge at a quiet time.
  - There's no rush: no data is exposed.

## 8. Errors and limitations observed

- **Production errors:** none observed. No page errors in any smoke run, and readiness was healthy throughout.
- **Smoke depth:** smoke tests prove routes, sign-in, room creation, and one full Same Wavelength game with sharing. They don't play full matches of the other multiplayer games or submit solo runs.
- **Still untested:** real phones, Safari and assistive technology.

## 9. Monitoring

- **Dashboards:** I have no access to the Cloudflare, Railway or Neon dashboards from this session, so their CPU, memory, error and compute figures **weren't inspected**. None are invented here.
- **What I could observe:**
  - realtime uptime ran continuously from the deploy (468 s at 08:10:35 UTC), so there was no crash loop;
  - the `/api/health` readiness check showed the database and realtime as `ok`.
- **For the owner to watch over the next few days:**
  - Railway memory with WebSocket compression under real traffic; the local +94 MB for 140 players isn't a production capacity figure;
  - Worker errors and CPU;
  - Neon compute hours;
  - `/api/share` 4xx and 5xx rates.

## 10. Pending user actions

1. **Merge the share-card fix** (a new PR from `feature/unified-platform`) at a quiet time.
2. **Set the Worker secret `CRICKET_VERIFIER_URL`** if you want Railway cricket verification. Railway is healthy.
3. **Optionally, check email and Google sign-in** with a real account.
4. **Check the Cloudflare, Railway and Neon dashboards** for the items in section 9.
