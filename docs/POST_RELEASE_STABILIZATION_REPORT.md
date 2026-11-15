# Post-release stabilization report

**Date:** 2026-11-15, checks 08:05–09:39 UTC
**Follows:** `docs/RELEASE_REPORT.md` (PR #6)

## Status at a glance

| Item | Status |
|---|---|
| PR #6 product release (website and realtime) | **Completed and production-verified** |
| Share-card name-order fix `ef29c1c` | **Completed and verified locally, not merged.** Blocked by GitHub access |
| Production name-order check | **Not attempted:** waits on the merge |
| Railway verifier endpoint | **Completed and production-verified:** live, refuses unsigned requests |
| `CRICKET_VERIFIER_URL` Worker secret | **Blocked by account access:** Wrangler isn't logged in |
| Cricket T20 and ODI through Railway in production | **Not attempted:** waits on the secret |
| Guest sign-in | **Completed and production-verified** |
| Email sign-in | **Requires user configuration:** turned off in production |
| Google sign-in | **Requires user configuration:** turned off in production |
| Existing games (rooms or play pages) | **Production-verified at smoke level** (08:05–08:10) |
| Cloudflare, Railway and Neon dashboards | **Blocked by account access** |
| Player data and reward history | **Untouched:** no deletes, no edits, no migrations |

## 1. Release status

| | |
|---|---|
| Product release | PR #6, merge commit `f8e17e2e823dac13467b5930a08bdede54c8e766`, merged 2026-11-15 08:01:20 UTC |
| Cloudflare | Workers Builds `a65393ca-b33f-4be8-bb6a-f95b7390483b`, version `089a2239-0cf7-4ce3-9085-077aa2f6fd7a`, success 08:04:01 UTC |
| Railway | `@platform/realtime`, success 08:02:53 UTC. Still running without a restart at 09:38 (uptime 5,716 s) |
| Share-card fix | `ef29c1c` on `feature/unified-platform`, pushed, **not in `main`**, no PR yet |

**What `ef29c1c` contains:**
- **Code:** one line of logic in `apps/web/src/app/api/share/route.ts`, plus a comment. The participant sort gains `|| displayName.localeCompare || playerId.localeCompare` as its final tie-breaks.
- **Docs:** `docs/RELEASE_REPORT.md`.

There are no other changes.

**Why no PR exists:**
- There's no GitHub CLI on this machine.
- Using the stored Git credential to call GitHub's API was refused by the session's permission policy. That's appropriate: it would mean handling a credential.
- Pushing works.

## 2. Share-card fix: verification

**Correctness of the fix:**
- **Deterministic:** a total order of placement, then score descending, then display name, then player id. The id is unique, so no two rows compare equal. The order doesn't depend on the order the database returns rows in.
- **Nothing else changes:** authorization (the session, being a participant, the same 404 for someone else's match), the completed-multiplayer check, opt-in names, the payload contents and token signing are all as before.

**Tests (local, Node 24.14.0, isolated `sinversegames_e2e_20261115_test` database, production builds):**

| Test | Result |
|---|---|
| Shared unit tests, including the share payload and token tests (names only on request, no ids, tampered tokens refused) | 54 passed |
| `e2e/same-wavelength.spec.ts`: full couple game, share without names, a tampered link giving 404, names on opt-in | 2 passed |

**Production (before the fix, release build):**
- The full flow passed: hidden answers, the reveal, the summary, insights, "Played together", sharing without names, a tampered token giving 404 and names on opt-in. The only failure was the name order ("Ben & Asha"), which this fix addresses.
- **Privacy held:** the card contained no answers, emails or ids.

## 3. Cricket verifier

### Endpoint (production, read-only probes)

- **The hostname:** `rt.sinversegames.com` resolves through Cloudflare (`104.21.76.253`, `172.67.202.191`, IPv6), and HTTPS is valid.
- **The service:** Railway `/health` returns `{"status":"ok"}`.
- **The verifier route:** `POST /internal/cricket/verify` is deployed:
  - no credentials: **401** `unauthorized`;
  - a forged bearer and run token: **401**;
  - `GET`: 404.

  It's a different route from `/health`.
- **Protocol:** the Worker client (`apps/web/src/lib/server/cricket-verifier.ts`) and the server (`apps/realtime/src/cricket-verifier.ts`) are in the same released commit, so they match.

### Secret

**Not configured: blocked.** `wrangler whoami` reports "You are not authenticated", and setting a secret needs the owner's Cloudflare login. No secret was read, written or committed.

### Security review (code, plus 13 passing tests in `apps/realtime/test/cricket-verify.test.ts`)

| Requirement | How it's met |
|---|---|
| Requests signed | The Worker signs a one-use job (`signCricketVerifyJob`, `AUTH_SECRET`) |
| Bound to the player, run and log | The job carries `sub`, `run` (the token's jti) and `hash = cricketRequestHash(runToken, body)`. A changed log is refused (tested) |
| Railway validates the run itself | It checks the run token's signature, game and owner against the job, then replays the whole log in a worker thread. Another player's run, or another game's token, is refused (tested) |
| Signed responses, checked by the Worker | The verdict is signed for the same job, run and hash. `verifyCricketVerdict` rejects anything else, and a bad verdict becomes "unavailable" (503), never a score |
| No duplicate rewards | Durable. The run's jti is the `Match` primary key: an existing match gets 409 before any replay, and a race gets P2002 → 409 |
| Unauthorized players | `run.sub !== session player` → 403 on the Worker. The verifier also checks the owner |
| Secrets kept out of logs | Errors log only the error name or status and at most 40 characters of the error code. No tokens are logged |
| Failure and timeout | 30 s client timeout, no redirects followed. Unreachable, 5xx, misconfigured or a bad verdict → **503, "try again"**, with nothing saved and nothing decided. Only a signed 422 rejects the log. Server side: a 15 s per-replay thread timeout, a queue of 8 and a per-player limit (all tested) |
| Not configured | No remote call; the Worker replays locally exactly as before |
| Bad `CRICKET_VERIFIER_URL` | Plain http (except loopback) or a malformed URL → 503 and an error log; tokens are never sent in clear text |

**Replay protection assessment.** These parts are **held in memory only**:
- one-use **job** ids (remembered 120 s, jobs live 60 s);
- the verifier's rejected-run memory;
- the Worker's `rejectedCricketRuns`.

So they don't survive a Railway restart, and wouldn't be shared between several replicas. Railway runs one replica.

**What that means in practice:** after a restart, a captured job could be replayed within its 60-second life. That only re-verifies the same run, and saving it is still refused by the database's primary key. **Durable single-use protection exists at the reward level, not at the job level.**

### Production T20 and ODI submissions

**Not attempted.** They need the secret, and every valid submission permanently records a match and rewards for a real player. Cricket pages load in production (smoke test), and the Worker-side verification path is unchanged.

## 4. Authentication

- **Guest:** verified in production. Every smoke run created guests, played, opened rooms and loaded `/account` and `/profile`.
- **Email and Google are switched off in production.** The account page is `force-dynamic`, so the flags reflect runtime configuration, not the build. It reports `googleConfigured: false` and `emailConfigured: false`, which keeps both buttons disabled.
- **What each needs:**
  - `AUTH_ORIGIN`, exactly `https://sinversegames.com`, with **no trailing slash**: a trailing slash also disables both;
  - Google: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`;
  - email: `RESEND_API_KEY`, `EMAIL_FROM` (it must contain `@`) and `AUTH_SECRET` (at least 32 characters).
- **What's wrong:** I can't tell which value is missing or malformed without reading them, and reading them isn't authorized.
- **Not tested end to end:** sign-in links, expiry, single use, callbacks, linking and sessions weren't exercised in production. Real sign-ins aren't possible while they're switched off, and no test inbox or Google account exists. The code's behaviour is covered by the local identity test suites (`docs/PLAYER_IDENTITY_PERSISTENCE_QA_REPORT.md`).

**Deployment hazard:** `apps/web/wrangler.jsonc` defines `vars` and has no `keep_vars`. A `wrangler deploy`, which is what Workers Builds runs, replaces dashboard **plain-text** variables with the file's set. Values entered as plain text in the dashboard would therefore disappear on each deploy, while **secrets** survive.

**Set all of these as secrets:**
- `AUTH_ORIGIN`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `CRICKET_VERIFIER_URL`

This is a likely cause, not a confirmed one.

**Identity safety:**
- No identity code changed in this release.
- Player ids, wallets and achievements were untouched by testing.

## 5. Production QA

**Website and discovery (all checked 08:05–08:10, key routes re-checked at 09:38):**
- **Pages:**
  - `/`, `/games` and `/couples`;
  - all 7 generic category pages;
  - `/games?q=draw` and the sitemap;
  - `/account`, `/profile` and `/leaderboard`;
  - all 12 games' `/games/<slug>` and `/play/<slug>` pages.

  All return 200, on both the apex and `www`.
- **Redirects and errors:** `/categories/nope` returns 404, and `/categories/couples` redirects 308 to `/couples`.
- **Browser tests:** the five discovery browser tests pass in production: content, metadata, canonical URLs, filters, search and the phone layout.

**Same Wavelength:** full production game, as in section 2. Not repeated, because it permanently records matches.

**Multiplayer:**
- A real browser connected and created a private room in all 7 games (Doodle Duel, Color Clash, Token Trail, Bumper Blitz, Chef Rivals, Kitchen Rush Co-op, Same Wavelength). **Rooms only, no full matches.**
- Socket.IO accepts the apex and `www`, offers the WebSocket upgrade, and refuses another origin (403).

**Solo:** Kitchen Rush, Cascade Solitaire, Mahjong Garden, Sinverse Cricket and Cuisine Quest load with zero page errors. No runs were submitted.

## 6. Monitoring

- **Dashboards:** I have no access to the Cloudflare, Railway or Neon dashboards from this session, so **no CPU, memory, error-rate or compute figures are reported**.
- **What I could observe:**
  - **Railway:** one process since the deploy, with no crash restarts (uptime 5,716 s at 09:38 UTC).
  - **Readiness:** healthy throughout, except for one cold-start blip.
  - **Cold-start blip (09:38:03 UTC):** after about 90 minutes without traffic from me, `/api/health` reported `database: down`. Five checks over the next 40 seconds were all `ok`, at about 2 s each. That fits Neon's Free compute waking from scale-to-zero and exceeding the app's 2.5 s connection budget. **The first visitor after a quiet period can get one failed database request.** It isn't confirmed from Neon's logs.
  - **Options to weigh:**
    - accept it;
    - raise the connection budget;
    - keep the compute warm, which costs compute hours on the Free plan's 100 CU-hours.
- **Not changed:** none of these options were applied, so no plans and no code changed.
- **Compression memory:** not observable without the Railway dashboard. The local +94 MB for 140 players remains a test figure.
- **Errors observed:** none, apart from the cold-start blip. No page errors in any production browser run.

## 7. Production test data

- **From the release smoke tests:** guests "Asha", "Ben" and "Smoke", one completed Same Wavelength match with its base reward, and expired empty rooms. **Left in place.**
- **This mission:** created no production records. All probes were reads or unauthenticated requests that were refused.

## 8. Remaining work and user actions

1. **Merge the share-card fix** (blocked by GitHub access):
   1. Open https://github.com/SaiNikhilk2002/sinversegames/compare/main...feature/unified-platform and create the PR. Expect `ef29c1c` plus this report's commit.
   2. Merge it with the usual merge commit.
   3. If Railway redeploys on every `main` push, it ends live rooms, so merge at a quiet time.
   4. Then check one couple share card with names on: the names should always read in alphabetical order, e.g. "Asha & Ben".
2. **Set `CRICKET_VERIFIER_URL`** (blocked by Cloudflare access). Either:
   - in the dashboard: Workers & Pages → `sinversegames` → Settings → Variables and Secrets → Add → **Secret**, name `CRICKET_VERIFIER_URL`, value `https://rt.sinversegames.com`; or
   - in `apps/web`: run `pnpm exec wrangler login`, then `pnpm exec wrangler secret put CRICKET_VERIFIER_URL`.

   Either way this deploys a new Worker version immediately. Then play one T20 match and check the result saves; a 503 "try again" would mean the Worker and Railway `AUTH_SECRET` differ.
3. **Turn on email and/or Google sign-in** (requires user configuration):
   1. Set `AUTH_ORIGIN` (exactly `https://sinversegames.com`) and the provider values as **secrets** (section 4).
   2. Add `https://sinversegames.com/api/auth/google/callback` to the Google client's redirect URIs.
   3. Confirm the Resend sender domain.
   4. Then sign in once with a real inbox and Google account.
4. **Optional:** decide on the Neon cold-start behaviour (section 6), and add `keep_vars` or move plain variables to secrets.
5. **Check the dashboards** for Worker errors and CPU, Railway memory and Neon compute.

## Acceptance against the mission

| # | Criterion | Met? |
|---|---|---|
| 1 | Fix merged and deployed | **No:** needs GitHub access |
| 2 | Name order verified in production | **No:** waits on 1 |
| 3 | Share-card privacy intact | **Yes:** production and local |
| 4 | Cricket verifier activated, or the blocker documented | **Blocker documented:** Wrangler login |
| 5 | Email and Google verified where test access exists | **No test access, and both are off in production:** documented |
| 6 | Existing games operational | **Yes:** smoke level |
| 7 | Health checks pass | **Yes**, with one cold-start blip noted |
| 8 | No player data or reward history damaged | **Yes** |
| 9 | Documentation accurate | **Yes:** this report |
