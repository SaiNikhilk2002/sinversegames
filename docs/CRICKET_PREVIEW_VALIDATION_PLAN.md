# Sinverse Cricket T20/ODI: Preview validation plan

How to check the release candidate on a real Cloudflare Worker before production, without touching production data.

**Nothing here has been run.** Creating a Preview uploads the build to Cloudflare; that is an external action that needs your approval. This plan is prepared, not executed.

## Status: Preview validation is BLOCKED until two things are confirmed

1. **Which database a Preview would use.** The repository's `previews` block (in both `wrangler.jsonc` files) sets only `NODE_ENV`. A Preview's `DATABASE_URL` and `AUTH_SECRET` therefore come from the **Previews Base** secrets, or from secrets set on that one Preview, in the Cloudflare dashboard. Those values aren't visible from here.
   - Cloudflare says Previews don't inherit production settings, and secrets must be re-entered by hand even when importing from production.
   - That makes isolation *likely by default*, but **not provable**: someone could have entered the production connection string as a Preview secret.
2. **That the Preview's `AUTH_SECRET` differs from production's.** If they matched, a session or run token minted on the Preview would be accepted by production. The cookie wouldn't carry across hosts, but the token itself would be valid.

Until you confirm both from the dashboard (Workers & Pages → `sinversegames` → Settings → **Previews Base**, Variables and Secrets), treat Preview validation as blocked. Use only Mode A below, which needs no database.

## What Cloudflare documents (read 2026-11-13)

Sources: [Previews](https://developers.cloudflare.com/workers/previews/), [Previews configuration](https://developers.cloudflare.com/workers/previews/configuration/), [Previews resources](https://developers.cloudflare.com/workers/previews/resources/), [Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [Version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/).

- **Settings:** "Previews do not inherit production settings." Vars and bindings go in the `previews` block. Secrets go in Previews Base (`wrangler preview base-config secret put NAME`) or on one Preview (`wrangler preview secret put NAME --name <preview>`). Base changes apply only to Previews created afterwards.
- **Shared resources:** a Preview bound to the same resource ID as production shares its data. Cloudflare says to point Preview bindings at staging or test resources. Service bindings from a Preview call the bound Worker's production deployment. (This app uses no service bindings; its database is reached through the `DATABASE_URL` secret, not a binding.)
- **Routes:** Previews don't take production routes or custom domains; they get their own URL.
- **Visibility:** Previews are public by default. Cloudflare Access can restrict them.
- **Not the same thing:** `wrangler versions upload` creates a version URL that uses **production's** configuration and resources. Never use it for this.
- **Not documented:** whether a Preview's CPU limit differs from production's. Assume it's the account plan's.

## Mode A: no database (safe now, after you approve the upload)

The app runs without `DATABASE_URL`: results verify but aren't saved (`saved: false`). This exercises the expensive part, server verification on real Workers, with no data written anywhere.

**Preview secrets:** only `AUTH_SECRET`, a fresh random value of at least 32 characters, never production's. Leave `DATABASE_URL`, `GOOGLE_*`, `RESEND_API_KEY`, `EMAIL_FROM`, `AUTH_ORIGIN` and `ADMIN_TOKEN` unset.

**Build variables:** `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_REALTIME_URL`, as for production. Cricket doesn't use realtime.

**Steps:**
1. **Build the candidate.** Push the release branch (approval required); Workers Builds runs `pnpm cloudflare:build`, then the Preview command `pnpm cloudflare:preview:deploy`. Or from WSL: `pnpm cloudflare:build && pnpm cloudflare:preview:deploy` (this uploads; approval required).
2. **Before playing,** open `https://<preview-url>/api/health`. Expect `database: "disabled"`. **If it says `"ok"`, the Preview has a database: stop and find out which one.**
3. **Guest:** open `/play/sinverse-cricket`, enter a display name, and expect the setup screen.
4. **T20:** pick two teams and an XI, start, win the toss, play at least one over by hand, then simulate the rest. Check the innings break, the result, the awards and "Your part". Press **Save**: expect a verified result with "couldn't be saved" (no database).
5. **ODI:** the same, simulating most overs. Then play a second ODI where you **bowl every ball of the opposition's innings** (the worst case for verification, about 600 AI-batted deliveries).
6. **Refresh recovery:** refresh during a match and resume it.
7. **CPU:** in the dashboard, Workers & Pages → `sinversegames` → Observability (`observability.enabled` is on), filter to the Preview and `POST /api/solo/submit`, and read each invocation's **CPU time** and outcome. Also look for `exceededCpu` outcomes or error 1102. Local workerd needed about 0.1–0.5 s for these requests (`CRICKET_CLOUDFLARE_COMPATIBILITY.md`); expect the same order of magnitude.
8. **Cleanup:** nothing to clean, since no data is stored. Delete the Preview from the dashboard if you like.

**What Mode A proves:** that the release runs and verifies T20/ODI on a real Worker, and what it costs in CPU there. **What it doesn't prove:** persistence, rewards, statistics, or sign-in.

## Mode B: an isolated database (needs Neon and Cloudflare changes, approval required)

To also check saving, rewards and statistics:

1. **Create an isolated database:** a Neon branch made from an empty or test parent, or a separate Neon project. **Never** branch from production data unless you accept copying player data into a test environment. Apply the existing migrations to it (`pnpm db:deploy` with that branch's **direct** URL, in a temporary terminal).
2. **Set Preview secrets:** `DATABASE_URL` set to that branch's **pooled** URL, plus a fresh `AUTH_SECRET`. Prefer setting them on the one Preview (`--name`) over Previews Base.
3. **Prove the target before playing.** `/api/health` should say `database: "ok"`. In the Neon console, confirm the Preview's connections appear on the test branch and not on production.
4. **Run Mode A's steps 3–7,** and also:
   - **Persistence:** after Save, the result shows "verified", and `/profile` lists the match.
   - **Counted win:** after a counted win (at least 30 balls played yourself in a T20, or 60 in an ODI), `/profile` shows the win.
   - **Uncounted win:** after a simulated win, the match appears but counts as neither a win nor a loss.
   - **Rewards:** Sin Coins change only for a counted win, within the daily cap.
   - **Duplicates:** in devtools, resend the submit request. Expect `409 "This game was already submitted"` (now answered before replaying).
5. **Cleanup:** delete the Neon branch or project, and remove the Preview's secrets.

## Sign-in on a Preview

Leave Google and email sign-in **off** on a Preview. Google's client allows only exact callback URLs (production's), and email links are built from `AUTH_ORIGIN`. Testing them would mean adding a Preview callback to the Google client and a Preview sending setup, which are external configuration changes. Check sign-in after release, in production, with the owner's own accounts (see the runbook).

## Restricting access

Previews are public by default. If a Preview stays up for more than a short test, put it behind Cloudflare Access (a dashboard change: approval required).
