# Player identity external setup and local commands

No dashboard action, production migration, secret creation or deployment was performed. Do not paste credentials into chat. Configure each environment through its own ignored local environment or host secret manager.

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
