# Cloudflare Workers Builds: default commands

The repository works whether Workers Builds runs our commands or falls back to its defaults. Since build `50a10423` (a manual build of `dc4eda6`), the build page has listed `pnpm run build` and `npx wrangler preview` as the settings it used.

## What each command does

| Command | Where it runs | Result |
|---|---|---|
| `pnpm run build` | Workers Builds (`WORKERS_CI=1`) | Prisma generate, then `pnpm cloudflare:build`: the build-environment check, the OpenNext build, `populateCache local`, and `OPENNEXT_ARTIFACT_CHECK` |
| `pnpm run build` | Anywhere else | Unchanged: Prisma generate, then the Next.js and realtime builds that `pnpm start:*` and Playwright use |
| `npx wrangler preview` | Repository root | Root devDependency `wrangler@4.155.0`, the same pinned version as `apps/web`. Uses the root `wrangler.jsonc`, which matches the app config and has the `previews` block. Wrangler Previews never attach production routes |
| `pnpm cloudflare:build` | Any | Same as the Workers Builds row of `pnpm run build`, without Prisma generate |
| `pnpm cloudflare:preview:deploy` | Any | Unchanged: rechecks the artifact, then runs the pinned `wrangler preview` |
| `pnpm cloudflare:deploy` | Production | Unchanged |

`SINVERSE_BUILD_TARGET=node` or `cloudflare` forces either build path.

## Safeguards

- **Missing Worker.** A missing or empty `apps/web/.open-next/worker.js` still fails the build at `OPENNEXT_ARTIFACT_CHECK`, before any deploy command runs. If a build is skipped, Wrangler stops because `main` doesn't exist. There's no custom build hook.
- **Production realtime.** In Workers Builds, a branch other than `main` that is compiled with `NEXT_PUBLIC_REALTIME_URL` on `rt.sinversegames.com` stops before building. An empty branch name counts as non-production. If the variable is unset, the build compiles `http://localhost:4200`, which can't reach production.
- **Unchecked at build time.** The Preview's database and `AUTH_SECRET` are runtime secrets from Previews Base. A build can't inspect them, so they must be Preview-only values (see `PREVIEW_REALTIME_ISOLATION_PLAN.md`, on the Cuisine Quest branch).

## Dashboard settings that work

| Setting | Works with |
|---|---|
| Build command | `pnpm cloudflare:build`, `pnpm run build`, or empty if Cloudflare then uses its default |
| Preview command | `pnpm cloudflare:preview:deploy` or the default `npx wrangler preview` |
| Production deploy command | `pnpm cloudflare:deploy`, unchanged |
| Root directory | `/` |

## How to confirm a hosted build used this

1. The build log shows `ROOT_BUILD_TARGET cloudflare (Workers Builds detected)`, or the `cloudflare:build` lines if the custom command ran.
2. `CLOUDFLARE_BUILD_ENV` shows the branch, `"production":false`, and the realtime host.
3. OpenNext prints its bundle steps.
4. `OPENNEXT_ARTIFACT_CHECK` shows a non-zero `entryBytes`, and its `ciCommit` and `ciBuild` match the build.
5. The deploy step reports Wrangler `4.155.0` with no package download.
