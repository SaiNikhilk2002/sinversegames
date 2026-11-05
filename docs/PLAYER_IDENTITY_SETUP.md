# Player identity external setup and local commands

This document performs no dashboard action, secret creation or deployment. Production migrations were applied separately on 2026-11-05. Google, R2 and Resend still need live verification. Do not paste credentials into chat. Configure each environment through its own ignored local environment or host secret manager.

## How accounts work

There is one identity system, built in this repository. It doesn't use Better Auth or any other auth library. A player has a permanent `Player.id`, and `ExternalIdentity` connects sign-in methods to it. Google and email both create the same kind of `AccountSession`.

### Email sign-in: code or link

A player enters their email and chooses either method. Both are handled by `lib/server/email-auth.ts`, and both end in `linkEmail` (`packages/db/src/identity.ts`), so one address always opens one player, whichever method came first.

| | Code | Link |
| --- | --- | --- |
| Secret | 6 random digits | 256-bit random token, in the URL fragment |
| Stored as | HMAC with `AUTH_SECRET`, scoped to the attempt | SHA-256 hash |
| Expires | 10 minutes | 15 minutes |
| Use | Once | Once |
| Works in | Only the browser that asked for it | Any browser. A different browser must confirm first, and can't link a guest |
| Wrong guesses | 5 per code, then it's cancelled; 20 per address per hour | Not applicable |

Sending is limited to 1 email per minute per address for each method, 6 per hour per address, and 30 per hour per IP. Verifying is limited to 30 attempts per minute per IP. The reply to a send request doesn't reveal whether an address has an account.

**Why a link can ask for confirmation:** mail scanners open links, and a link sent to someone by an attacker could otherwise sign them in to the attacker's account. Opening a link in the browser that asked for it signs in straight away. Anywhere else, the page shows the masked address and asks first. Nothing is used up until then.

**Guests:** a guest who verifies a new address, in the same browser, keeps their player ID and all progress. A guest who verifies an address that already has a player switches to that player, and the guest stays separate. Nothing merges automatically. After linking, the old guest cookie stops working.

**Google and email are separate.** Google's verified email isn't stored, so the same person signing in both ways gets two players. Linking them needs its own design.

**Storage:** the address is kept in `ExternalIdentity.subject` to send sign-in email and security notices. The privacy policy says so. Pending attempts use the existing `OAuthAttempt` table with modes `emailotp` and `emaillnk`, and limits use `IdentityRateLimit`. **It needs no migration beyond those already applied to production.**

**Changing `AUTH_SECRET`** cancels any code waiting to be used, and nothing else about email accounts, because addresses aren't derived from it.

**Emails:** code, link, welcome and two security notices (a new browser signing in, other browsers signed out), in `packages/shared/src/identity/email-templates.ts`. Codes, tokens and links must never be logged. Resend setup is in [DEPLOYMENT.md](../DEPLOYMENT.md#email-sign-in-resend).

**Local tests:** `e2e/email-provider.ts` is a stand-in for Resend's API on 127.0.0.1:4401. The app's real sending code runs against it, but nothing is delivered, so it doesn't prove real delivery. Set `RESEND_API_KEY=local-email-fixture`, `EMAIL_FROM` and `EMAIL_API_URL=http://127.0.0.1:4401/emails`.

**Operations:** periodically remove expired `IdentityRateLimit` rows. Sending deletes expired attempts as it goes.

## Google Cloud Console

1. Use separate development/preview/production projects or clients. Configure Google Auth Platform Branding and Audience: SinverseGames, your monitored support address, home page, privacy/terms URLs and authorized domain `sinversegames.com`. Keep test apps restricted to test users until reviewed. Complete the provider's required production verification before public release.
2. Create an OAuth client of type **Web application**. This implementation uses server redirects, not Google Identity Services JavaScript; authorized JavaScript origins are not used by it. If the console requires an origin or GIS is added later, use only the exact intended origins below.
3. Development callback: `http://localhost:3200/api/auth/google/callback`; origin `http://localhost:3200`. Production callback: `https://sinversegames.com/api/auth/google/callback`; origin `https://sinversegames.com`. No wildcards. Preview needs its own exact callback, secrets and isolated database.
4. Set server-only `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_ORIGIN` and the existing `AUTH_SECRET` on the web service. AUTH_ORIGIN is the exact scheme/host/port, without a trailing slash. The callback is derived from it; no GOOGLE_REDIRECT_URI variable is read. Minimal scopes are `openid email`; verified email is checked but neither stored nor used as the player key.
5. Choose one canonical authentication origin. For apex configuration, use the account page at `https://sinversegames.com/account`; the www account page's attempt gets an explicit canonical-origin instruction. Cookies are host-only, so www and apex are separate browser sessions. Do not silently forward a linking callback across hosts and lose its guest cookie. Supporting independent www sign-in requires a deliberate separate deployment/origin contract, not a wildcard forwarded-host redirect.

See [Google's production policy](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance) and [web-server setup](https://developers.google.com/identity/protocols/oauth2/web-server).

## Private R2 bucket and Worker

1. Create an isolated private avatar bucket per environment when approved. Keep public r2.dev access off. The server proxy and same-origin image route mean no browser-to-bucket CORS policy is needed. Do not grant broad public write/read CORS or put an R2 API secret in frontend variables.
2. Add the selected bucket binding to the Worker configuration as shown below. This is a configuration template only; the repository does not create a paid service or choose a real bucket on the owner's behalf.

```jsonc
"r2_buckets": [
  { "binding": "AVATARS", "bucket_name": "<your-private-environment-avatar-bucket>" }
]
```

3. Apply the committed additive identity migration through the approved release process before code expects its columns/tables. Keep AUTH_SECRET identical across web and realtime. Set web REALTIME_INTERNAL_URL to the actual reachable realtime service; use HTTPS in production. The existing service now requires the Sharp/libvips native runtime dependency; its Dockerfile includes frozen production dependencies. No Cloudflare Images subscription is needed.
4. Verify a real upload stores only two normalized WebPs, picture reads are same-origin, replacement/removal cleans old objects, failed decoding creates no objects, and storage denial leaves the prior picture intact. Local filesystem tests do not prove these R2 permissions/binding operations.
5. Plan orphan cleanup by comparing bucket prefixes to Player.avatarKey. Do not expire every live avatar with an indiscriminate bucket lifecycle rule. Periodically remove expired IdentityRateLimit rows and OAuthAttempt rows using their expiry columns, and expired AccountSession rows. These contain no provider access tokens. Retention/scheduling is an owner operational task, not a provisioned cron in this milestone.

## Local development

Use Node 24.14.0 and pinned pnpm 11.15.1. Start only this project's services (3200/4200/5433); leave Toolyaro's ports alone.

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:local
# Select an explicitly local DATABASE_URL in your ignored environment first:
pnpm db:deploy
pnpm dev
```

For real local Google, set AUTH_ORIGIN=http://localhost:3200 and your development Web client credentials in the ignored environment. Without them, Google buttons are disabled with an explanation; guest play remains optional. A database is required for linking/registered sessions. R2 must be configured in a local Worker preview for genuine storage testing; the production Node app does not silently write uploads to disk.

## Deterministic local tests

Create/migrate an isolated loopback database with a name ending `_test`. For the identity browser file, set both DATABASE_URL and E2E_DATABASE_URL to that target, AUTH_ORIGIN=http://localhost:3200, IDENTITY_TEST_MODE=1, a local AVATAR_LOCAL_DIR, and the explicit fixture client ID/secret from the test fixture (`local-fixture-client` / `local-fixture-secret`). Use a fresh local-only AUTH_SECRET at least 32 characters for both services. Those fixture values do not authenticate to Google or grant external access. The test process starts the controlled OIDC fixture on 127.0.0.1:4400; never point its settings at a provider database. Do not run database rollback tests concurrently with browser rewards.

```powershell
pnpm typecheck
pnpm test
pnpm test:db
pnpm build
pnpm --filter @platform/web test:e2e e2e/identity.spec.ts
pnpm test:e2e
# In Linux/WSL with Node 24, frozen dependencies, and regenerated clients:
pnpm cloudflare:build
```

The full browser suite includes original gameplay and the complete Cuisine Quest campaign. It requires the explicit identity fixture environment, not real provider credentials. Real Google consent, cross-device production cookies, R2 permissions, Railway reachability and deployed revocation remain separate post-configuration verification.
