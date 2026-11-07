# Cloudflare Workers Builds: default commands and deploy safeguards

Since build `50a10423` (a manual build of `dc4eda6`), Workers Builds has been listing `pnpm run build` and `npx wrangler preview` as the settings it used. This document describes what the repository now does with those defaults and with the approved commands.

| Path | Branches | Commands |
|---|---|---|
| Approved Preview | non-production | Build `pnpm cloudflare:build`, Preview command `pnpm cloudflare:preview:deploy` |
| Cloudflare's default Preview | non-production | Build `pnpm run build`, Preview command `npx wrangler preview`. Works too |
| Production | `main` only | Build `pnpm cloudflare:build`, deploy `pnpm cloudflare:deploy`. The defaults are refused (see below) |

## Commands

| Command | Behaviour |
|---|---|
| `pnpm run build` outside Workers Builds | Unchanged: Prisma generate, then the Next.js and realtime builds used by `pnpm start:*` and Playwright |
| `pnpm run build` in Workers Builds (`WORKERS_CI=1`) on a non-production branch | Prisma generate, then `pnpm cloudflare:build` |
| `pnpm run build` in Workers Builds on `main` | **Refused before building.** Production must use the approved commands |
| `pnpm cloudflare:build` | These steps, in order: <br>1. Build-environment check. <br>2. OpenNext build. <br>3. `populateCache local`. <br>4. `OPENNEXT_ARTIFACT_CHECK`. <br>5. `CLOUDFLARE_BUILD_RECORD`, which writes `.open-next/sinverse-build.json` and sets up the root Wrangler redirect described below |
| `npx wrangler …` from the root | Root devDependency `wrangler@4.155.0`, the same exact version as `apps/web`. There's only one copy in the lockfile |
| `pnpm cloudflare:preview:deploy` | Unchanged: artifact check, then `wrangler preview --config wrangler.jsonc` |
| `pnpm cloudflare:deploy` | `PRODUCTION_DEPLOY_CHECK`, then `opennextjs-cloudflare deploy --config wrangler.jsonc`, the same OpenNext deploy as before |
| `apps/web`: `pnpm cf:deploy` | `cf:build`, then the same guarded deploy |

`SINVERSE_BUILD_TARGET=node` or `cloudflare` forces either build path.

## Safeguards

| Guard | What it does |
|---|---|
| Realtime isolation (first step of `cf:build`) | In Workers Builds, a branch other than `main`, or an unknown branch, compiled with `NEXT_PUBLIC_REALTIME_URL` on `rt.sinversegames.com` stops before building. If the variable is unset, the build compiles `http://localhost:4200` |
| Artifact check | A missing or empty `apps/web/.open-next/worker.js`, or missing assets, fails the build. There's no custom build hook |
| Production deploy check (`pnpm cloudflare:deploy`) | Checks that both configs agree, the Worker is `sinversegames`, both Custom Domains are present, the artifact exists, and a build record exists. In Workers Builds it also refuses:<br>- any branch except `main`<br>- an artifact not recorded as a production build<br>- an artifact from a different commit<br><br>Locally it refuses a non-production Workers Builds artifact. It warns, without blocking, when the Worker was compiled without a realtime URL |
| Bare root Wrangler commands | `cf:build` writes Wrangler's generated-config redirect (`.wrangler/deploy/config.json`, gitignored) at the repository root. It points to a config whose entry file `BARE_WRANGLER_COMMAND_BLOCKED-…js` doesn't exist. A bare `wrangler deploy`, `versions upload` or `preview` from the root therefore stops when Wrangler resolves the entry, before bundling or uploading. From `apps/web`, a bare command stops because the redirect and the config aren't in the same directory. The redirect is left out only for a Workers Builds build on a known non-production branch, where Cloudflare's default `npx wrangler preview` has to work |
| Approved scripts | Every Wrangler or OpenNext call in `apps/web/package.json` passes `--config wrangler.jsonc`. Wrangler never applies a redirect when `--config` is given, so the redirect can't affect approved commands. The config spec enforces this |

## Verified from Wrangler 4.155.0 and OpenNext 1.20.14 source

- `wrangler deploy` hands over to `opennextjs-cloudflare deploy` only when `next.config.*` and `open-next.config.*` are in the directory it runs from. They're in `apps/web`, so a root `npx wrangler deploy` would be a plain deploy that skips the production check.
- For this app, `opennextjs-cloudflare deploy` runs `wrangler deploy --config wrangler.jsonc` from `apps/web`. The static-assets incremental cache makes its remote cache step a local file copy, and skew protection is off.
- `resolveWranglerConfigPath` ignores redirects when `--config` is passed. Only `deploy`, `preview`, `versions upload`, `versions deploy` and `triggers deploy` follow redirects. Commands such as `secret put` don't, so the secret workflow in `DEPLOYMENT.md` is unaffected.

## Limitations

- **A bare `wrangler deploy` on a Preview-branch build isn't blocked.** In a Workers Builds checkout for a non-production branch, the redirect has to be absent so the default `npx wrangler preview` can work, and Wrangler offers no way to block `deploy` while allowing `preview`. Workers Builds runs the deploy command only on the production branch. A Preview branch would hit this only if its Preview command were changed to `npx wrangler deploy`. Keep the Preview command as `pnpm cloudflare:preview:deploy` or the default.
- **Anyone with credentials can bypass the checks by hand.** For example, `wrangler deploy --config apps/web/wrangler.jsonc`, or deleting the redirect. These guards stop accidental and default-command deploys, not deliberate ones.
- **Runtime secrets can't be checked at build time.** The Preview's database and `AUTH_SECRET` come from Previews Base and must be Preview-only values.
