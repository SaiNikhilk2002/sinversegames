# Cloudflare Worker Preview failure and local QA - 2026-11-05

Repository `D:\dev\games`, branch `codex/takeover-and-reliability-audit`; initially clean at `5304115893ec762f365070f4216c6356f0ddf583`. No production/Preview publishing, DNS or secret changes, database migrations, push, merge or unrelated application changes.

## Cause and workflow decision

The user-provided log completes Next.js and Cloudflare/OpenNext compilation, then runs `npx wrangler preview` with Wrangler 4.157.0 and rejects the absent `previews` block. No repository script invoked that command. The checked-in production command is `pnpm cloudflare:deploy`; the prior `cf:preview` is a local OpenNext dev server, not the dashboard branch deployment. The failing command therefore comes from Workers Builds' external Preview command setting.

[Cloudflare's branch-build documentation](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/) says new Workers default to Worker Previews and switched Workers must keep that workflow. This explains the observed command but does not prove whether this Worker was new, switched, or manually configured. No authenticated dashboard inspection or change was performed. Retain the observed Worker Previews workflow rather than assuming a legacy version-upload setup. [Workflow comparison](https://developers.cloudflare.com/workers/previews/compare-workflows/) distinguishes branch Previews from production-resource version URLs.

The installed pinned Wrangler **4.155.0** already implements the open-beta `preview` command and its `previews` schema. No upgrade/download to the log's unpinned 4.157.0 is necessary. Root Node pins remain 24.14.0, pnpm remains 11.15.1, and dependency versions/lockfile remain unchanged.

## Implementation and dashboard settings

- `apps/web/wrangler.jsonc`: add `previews.vars.NODE_ENV = "production"` for optimized branch runtime mode. Existing top-level Worker settings are unchanged. Assets, entry point and compatibility settings remain common; Preview-only secrets/data bindings are not copied from production.
- Root and web `package.json`: add Preview deployment/check scripts while retaining both existing production deploy scripts and the existing local preview script exactly.
- The publishing script first runs OpenNext `populateCache local`, then pinned `wrangler preview --config wrangler.jsonc` from the web workspace. The current cache adapter copies generated prerender cache into local assets; no remote cache/bucket write is needed. This prevents a superficially successful upload missing the prerender cache.
- The local check prepares the same assets and runs fixed `wrangler deploy --dry-run`. The beta `preview` command has no dry-run option in pinned 4.155.0. Package the identical common Worker/assets settings locally and validate the Preview block separately; never invoke an actual Preview upload to claim a local test.
- README/deployment instructions and both root manuals document the distinction and verification.

| Dashboard field | Correct value |
| --- | --- |
| Existing Worker | Must match configured `sinversegames-web`; reconcile any historical name discrepancy before changing an external Worker |
| Repository root | `/` (empty root-directory field) |
| Build command | `pnpm cloudflare:build` |
| Preview command | `pnpm cloudflare:preview:deploy` |
| Production deploy command | `pnpm cloudflare:deploy` (unchanged) |
| Node / pnpm | Node 24.14.0; pnpm 11.15.1 from packageManager; conflicting NODE_VERSION override absent/aligned |

Preview runtime settings go in the `previews` block and Preview-only secrets in Previews Base/branch settings. Set an isolated database/realtime service, matching signing secret, appropriate build-time public URLs and exact realtime origins. Configure Google/R2 only with Preview-safe settings if those features are enabled. No live Preview data or provider credentials were supplied. The dashboard still needs the owner to replace the reported unpinned command with the repository script after these local changes are available remotely. No dashboard change was made by this task.

## Verification ledger

Verification uses an isolated Linux/WSL source copy without ignored environment files or production credentials. Node 24.14.0 / pnpm 11.15.1 / installed Wrangler 4.155.0 are selected explicitly.

| Check | Result |
| --- | --- |
| Frozen install / unchanged lockfile | Passed in a fresh Linux directory, 11.5s with pnpm 11.15.1; exact lockfile hash unchanged after all checks |
| Both Prisma clients | Passed: Node and workerd 7.10.1, generated only; no database connection or migration |
| Five workspace typechecks | All five passed (`pnpm typecheck`) |
| Node production web/realtime build | Passed (`pnpm build`), including Next production TypeScript and native-module-compatible realtime bundle |
| Linux OpenNext production build | Passed (`pnpm cloudflare:build`): Next 16.4.3 / OpenNext 1.20.14, 40 generated static pages and `.open-next/worker.js` emitted |
| Preview configuration / production-setting preservation | Pinned Wrangler 4.155.0 parses and accepts `previews.vars`; exact parsed top-level production settings and both production scripts match baseline; existing local preview script also unchanged |
| Static prerender cache / dry-run Worker packaging | Passed (`pnpm cloudflare:preview:check`): all 38 cache files byte-equal in assets; 148 asset files read; Worker JS, source map, WASM/font modules emitted; total 23,138.54 KiB / gzip 6,139.27 KiB; explicit dry-run exit |
| Local workerd smoke test / HTTP responses | Passed with local-only bindings: `/`, `/account`, `/privacy`, `/cuisine-quest/cover.svg`, `/api/session` all 200 with expected content; anonymous session is null; owned server stopped |
| Both instruction files / diff review | Byte-identical manuals; eight intended files; whitespace and 22 local Markdown links/anchors pass |

The local dry-run and local runtime smoke check do not validate remote Preview creation, dashboard Base settings, account permissions, real Google/R2 or production health. Actual remote publishing remains unrun. Raw local logs live in ignored `.data/cloudflare-preview/`. Final task response supplies the local commit and working-tree status.

The frozen lockfile SHA-256 remains `3e66fb2ab0afb672ea2155faf2d36f3775d88b144f66743db1f22d33412856e4` in both the Linux copy and original checkout. Full generated configuration/bundles are ignored. Build logs retain the previously recorded broad Prisma/WASM tracing warning and fresh-checkout cache notice; no suppression or dependency change was made. Wrangler reports a newer available version but the executed CLI remains pinned 4.155.0. There were no failed product assertions or weakened tests in this run.

Local evidence: `versions.log`, `install.log`, `generate.log`, `typecheck.log`, `node-build.log`, `cloudflare-build.log`, `preview-help.log`, `config-validation.json`, `preview-packaging.log`, `asset-validation.json`, `runtime-validation.json` and `workerd.log` under `.data/cloudflare-preview/`. The source copy contains no `.env` or production credentials; Cloudflare credential environment variables were cleared and configuration storage isolated. Smoke testing made no database writes and the actual branch Preview command was never executed.

Owner action after a separately authorized push: set the existing Worker's Preview command to `pnpm cloudflare:preview:deploy`, retain build/production commands from the table, and review Preview-only Base secrets/resources and compiled public URLs before enabling runtime flows. A future authorized remote Preview run is required to verify account permissions, Base settings and the hosted URL. No production route/DNS/secret or database migration is part of this fix.
