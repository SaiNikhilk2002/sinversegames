# Sinverse Cricket T20/ODI: production release runbook

Step-by-step release, verification and rollback for the T20/ODI release candidate. **None of these steps has been run.** Every step marked **(owner)** is an external action that needs your approval and your access: a push, a merge, a dashboard, a deployment or a production check.

Inputs: the release commit and test evidence in `CRICKET_RELEASE_DECISION.md`; environment names in `CRICKET_ENVIRONMENT_CHECKLIST.md`.

## How a release happens in this project (from the repository)

- **Web:** Workers Builds builds every push. Branch `main` is the production branch: build command `pnpm cloudflare:build`, deploy command `pnpm cloudflare:deploy`. Other branches run the Preview command `pnpm cloudflare:preview:deploy` (`DEPLOYMENT.md` § 4).
  - `cloudflare:deploy` refuses to run unless it is on `main` and has a production build record for the same commit.
  - So **merging to `main` deploys production.** Pushing the feature branch creates a Worker Preview, if Workers Builds is connected for that branch.
- **Realtime:** Railway builds `main` from `apps/realtime/Dockerfile`. Its `watchPatterns` include `packages/**` and `apps/realtime/**`.
  - **This release changes both**, so a merge to `main` will rebuild and **restart the realtime service** (if Railway auto-deploys).
  - Active multiplayer rooms are in memory and **end on restart** (15 s draining). Cricket itself doesn't use realtime.
- **Database:** no migration in this release. Neither Workers Builds nor Railway runs migrations.

## Pre-release (all before any push)

| # | Check | How | Who |
|---|---|---|---|
| 1 | Branch and commit | `git status` is clean; `git rev-parse HEAD` equals the release commit in `CRICKET_RELEASE_DECISION.md`; `git rev-list --left-right --count origin/main...HEAD` shows `0 N`, where N is the number of release commits | You |
| 2 | Required checks | Already run, results in the decision document: `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm build`, `pnpm test:e2e`, Linux `pnpm cloudflare:build`, `stress:cricket`. Re-run them only if anything changes | Done locally |
| 3 | **Cloudflare plan** | Cloudflare dashboard → Workers & Pages → Plans (or Billing → Subscriptions): confirm **Workers Paid** (Standard usage model). **On Free, stop: T20/ODI verification can't fit 10 ms of CPU** | **(owner)** |
| 4 | **CPU limit** | Workers & Pages → `sinversegames` → Settings → Runtime/Limits: the CPU time limit is the default (30,000 ms) or higher, and not lowered. Optionally commit `"limits": { "cpu_ms": 30000 }` in both `wrangler.jsonc` files, so the setting lives in the repository. That is a separate, reviewed change, kept in step by `cloudflare-config.spec.ts` | **(owner)** |
| 5 | Environment | Worker secrets exist: `AUTH_SECRET`, `DATABASE_URL` (pooled), plus the optional ones you use. Build variables: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_REALTIME_URL`. `NODE_VERSION` is absent or `24.14.0`. **No new variable is needed.** Check names only; never paste values into a chat or document | **(owner)** |
| 6 | Database | Nothing to apply. Optionally confirm in Neon that `_prisma_migrations` lists the same four migrations as `packages/db/prisma/migrations` (a read-only query) | **(owner)** |
| 7 | Preview (optional but recommended) | `CRICKET_PREVIEW_VALIDATION_PLAN.md`. **Mode A only** until Preview isolation is confirmed. It measures real Worker CPU for the submissions | **(owner)** |
| 8 | Sign-in | Nothing in the release touches sign-in. Note whether Google and email sign-in currently work in production, so you can tell a pre-existing problem from a regression after release | **(owner)** |
| 9 | Realtime | `https://rt.sinversegames.com/health` is 200 (it was, read-only, on 2026-11-13). Pick a quiet time, since the merge restarts realtime | **(owner)** |
| 10 | Rollback target | Before merging, note the **current production Worker version ID**: dashboard → `sinversegames` → Deployments, or `pnpm exec wrangler deployments list --config wrangler.jsonc` in `apps/web` (read-only, needs your Cloudflare login). Also note the current Railway deployment | **(owner)** |

## Release

1. **(owner) Push the branch.**
   ```sh
   git push origin feature/unified-platform
   ```
   - It fast-forwards `origin/feature/unified-platform` by the release commits. No force is needed.
   - Workers Builds may build a Preview for the branch. That's harmless while Previews have no production secrets; see the Preview plan's blocker.
2. **(owner) Open a pull request** `feature/unified-platform` → `main`.
   - A PR isn't technically required, but it's how `main` has been updated so far (PR #5).
   - It gives you one reviewable diff, which should equal `origin/main..<release commit>`.
   - Wait for the Workers Builds check on the PR.
3. **(owner) Merge** at a quiet time: the merge commit lands on `main`. This **deploys production** and, through Railway's watch patterns, **restarts realtime**.
4. **(owner) Watch the builds:**
   - **Workers Builds:** the build log shows `pnpm cloudflare:build` passing on Node 24.14.0, then `pnpm cloudflare:deploy` (with its production check).
   - **Railway:** the new deployment reaches healthy; its health check is `/health`.
5. **DNS:** nothing changes. `sinversegames.com` and `www` stay on the Worker's custom domains declared in `wrangler.jsonc`, and `rt` stays on Railway.

## Post-release verification (owner, in production, with your own accounts)

Use your own existing accounts. Every match you play creates real records, which is expected for a real player but shouldn't be repeated needlessly.

| # | Check | Expect |
|---|---|---|
| 1 | `GET https://sinversegames.com/api/health` (and `www`) | 200, with `web`, `database` and `realtime` all `ok` |
| 2 | `GET https://rt.sinversegames.com/health` | 200 (uptime resets after the restart) |
| 3 | Guest | In a private window, `/play/sinverse-cricket` → enter a name → the setup appears |
| 4 | Email and Google sign-in | Your account signs in as before, and `/account` shows the same player, coins and cosmetics |
| 5 | Team selection | All 20 teams selectable; Pick your XI; a bowling keeper is refused with the explanation |
| 6 | T20 | Play at least 30 balls yourself (bat or bowl), simulate the rest, and Save. The result is verified and saved; `/profile` shows the match and a counted win or loss |
| 7 | ODI | A shorter check: play a few overs, simulate, and Save. Verified and saved. A simulated win shows as not counted |
| 8 | Scorecard | The full scorecard and the saved scorebook show both innings, fall of wickets and bowling figures |
| 9 | Rewards and statistics | Sin Coins change only after a counted win, within the daily cap; cricket statistics and the leaderboard update |
| 10 | Duel | A 1-over duel still plays and saves |
| 11 | Other games | One quick round of any other solo game, and one multiplayer room (realtime was restarted) |
| 12 | **CPU and errors** | Dashboard → `sinversegames` → Observability, last hour: `POST /api/solo/submit` CPU time per request (expect hundreds of ms for T20/ODI, far below the limit). **No `exceededCpu` outcomes or 1102 errors.** No rise in 5xx |
| 13 | Refresh recovery | Refresh during a T20, then resume |

## Rollback

**When to roll back:**
- `exceededCpu` / error 1102 on submissions;
- verified results failing to save;
- sign-in or wallet regressions;
- 5xx errors on pages that worked before;
- a broken duel or other game.

A cosmetic issue in the new screens is not a reason; fix it forward.

**How (owner):**
1. **Web Worker:**
   - Dashboard → Workers & Pages → `sinversegames` → Deployments → choose the version noted in pre-release step 10 → **Rollback**.
   - Or `pnpm exec wrangler rollback <version-id> --config wrangler.jsonc` in `apps/web` (`wrangler rollback` exists in the pinned 4.155.0).
   - A rollback restores the code. Secrets and variables aren't versioned with it, and this release changed none.
   - **The version ID isn't known from here.** Record it before merging.
2. **Realtime:** Railway → the service → Deployments → redeploy the previous deployment.
   - This release changes no realtime behaviour: only a test file and the shared engine and repository packages it bundles.
   - So rolling realtime back is needed only if realtime itself misbehaves. A rollback restarts it again.
3. **Git:** to keep `main` truthful after a rollback, revert the merge in a new commit (`git revert -m 1 <merge commit>`). That's a normal, non-destructive revert, never a reset or force-push, and needs your approval.

**Data compatibility on rollback:**
- No schema change, so the old code reads every row the new code wrote.
- International match results saved by the new code stay in match history. The old code shows them in the profile like any cricket match, with `config.version = 2`, and keeps their stats.
- Coins earned stay in the append-only ledger, which is correct, since they were earned under the rules then in force.
- **In-progress international matches are lost** on rollback: the old code has no T20/ODI, so their run tokens can't be submitted. Unfinished matches in a refreshed tab will fail to resume.
- No cleanup is needed.

**After rollback:**
- Health checks 1–2.
- A duel plays and saves.
- Sign-in works.
- Observability shows errors back to the earlier baseline.
