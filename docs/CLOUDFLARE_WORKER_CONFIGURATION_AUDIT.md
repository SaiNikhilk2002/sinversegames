# Cloudflare Worker name, routes and Preview audit — 2026-11-06

Repository `D:\dev\games`, branch `feature/sinverse-cricket-2`, clean starting HEAD `8942a015f8a7e1fed236cca546822eec59af8a61`. This task changes local source and documentation only. No upload, deployment, dashboard/DNS/secret/binding/resource change, production migration, push or merge is authorized or performed. Both root instruction files remain unchanged. No existing uncommitted work was present at the start.

The subsequent 11:03 IST failure on the reconciled commit is examined in [the follow-up below](#follow-up-the-1103-ist-preview-failure). Earlier tables record the first audit snapshot rather than the latest PR head.

## Root cause and canonical identity

The owner confirms the existing production Worker is **`sinversegames`**, with Custom Domains **`sinversegames.com`** and **`www.sinversegames.com`**. The supplied successful run reports CI overriding the local Worker name, both domains present remotely, and a warning that local configuration will override remote settings. That is sufficient to align the local declarations with the confirmed existing Worker; it does not authorize creating or renaming a remote Worker.

Git history explains the mismatch:

| Commit | What it established |
| --- | --- |
| `783b596` — 2026-10-31 | Initial Cloudflare/Railway setup introduced `apps/web/wrangler.jsonc` with `name: sinversegames-web`, no domain declarations, and documentation instructing creation of a Worker with that name |
| `bc3b8c8` | Workspace-aware root build/deploy scripts were added; the Worker name stayed unchanged |
| `920b22d` — 2026-11-05 | Added the `previews` block and branch Preview scripts; did not reconcile the production name or domains |
| `bea2ce9` — 2026-11-05 | Added root `wrangler.jsonc`, copying the same Worker settings with app-relative output paths; the stale name and absent domains were duplicated |

Thus the repository retained its original setup name while the deployed service used `sinversegames`. Pinned Wrangler 4.155.0 supports the `WRANGLER_CI_OVERRIDE_NAME` environment variable; the owner's supplied log explicitly reports a CI override. This explains why an upload can target the existing Worker despite the stale local declaration. It does not synchronize production domain declarations. Both local files now declare `sinversegames` and both exact Custom Domains, using the [documented Custom Domain syntax](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

The earlier missing `previews` block and missing `.open-next/worker.js` were separate failures. This new evidence does not prove the name mismatch caused those earlier failed checks.

## Exact configuration used by each command

All root scripts below use `pnpm --filter @platform/web`, which executes in `apps/web`. The revised scripts explicitly pass `--config wrangler.jsonc` rather than depending on discovery. Before this change, the production/build adapter commands discovered the same app config from that workspace; the Preview command already specified it explicitly. Installed OpenNext 1.20.14's `readWranglerConfig` delegates to Wrangler `unstable_readConfig`; its deploy implementation invokes `wrangler deploy` after cache preparation.

| Root command | Actual operation and configuration |
| --- | --- |
| `pnpm cloudflare:build` | App `cf:build`: OpenNext build with `apps/web/wrangler.jsonc`, then `populateCache local` with the same config. `apps/web/open-next.config.ts` selects Workers Prisma/build behavior. Emits `apps/web/.open-next/worker.js`, assets and local static cache; no upload |
| `pnpm cloudflare:deploy` | OpenNext deploy in app workspace with `apps/web/wrangler.jsonc`; then pinned Wrangler production `deploy` with that config. Publishes production if authorized and executed; **not run in this audit** |
| `pnpm cloudflare:preview:deploy` | App `cf:preview:deploy`: local cache preparation using app config, then pinned `wrangler preview --config wrangler.jsonc`. Targets a branch Preview under parent Worker `sinversegames`; **not run in this audit** |
| `pnpm cloudflare:config:check` | Local-only validation of both source configs, canonical identity, both production domains and Preview separation; no build or upload |
| `pnpm cloudflare:check` | Local cache preparation, then production packaging with the app config and hard-coded `wrangler deploy --dry-run` |
| `pnpm cloudflare:preview:check` | Local cache preparation, then packaging of a generated Preview settings projection using hard-coded `wrangler deploy --dry-run`; no Preview API call |
| Bare root `wrangler ...` | Root `wrangler.jsonc`, with entry/assets pointing into `apps/web/.open-next`; kept semantically aligned with app config. These are not the recommended CI commands |

`pnpm build` remains the normal Node build and does not emit an OpenNext Worker. The web `build` script remains `next build`, because OpenNext invokes it internally. No dependency or lockfile change is needed.

## Production routes and Preview isolation

Both source configs retain exactly:

```json
"name": "sinversegames",
"routes": [
  { "pattern": "sinversegames.com", "custom_domain": true },
  { "pattern": "www.sinversegames.com", "custom_domain": true }
]
```

These are exact-host Custom Domains, not wildcard proxy routes or redirects. No route is removed or redirected locally, and no external route/DNS change occurs during validation. This preserves the production routing contract supplied by the owner for a future approved deployment. Remote attachment after the reported upload has not been independently inspected; local packaging cannot establish it.

The real Preview command continues to use Wrangler's `preview` API and the separate `previews` block, currently only `vars.NODE_ENV=production`. That value selects optimized runtime mode, not production routing. Common code/assets and compatibility settings stay at the top level. Production domains are not placed inside `previews`: [Cloudflare states that production routes do not target Previews and production data settings are not inherited](https://developers.cloudflare.com/workers/previews/configuration/). A Preview resource can still reach production if its own resource ID/service target/secret is configured that way; remote Previews Base settings were not inspected here. No production secrets, data bindings or resources are copied or modified by this change.

Pinned Wrangler's beta `preview` command has no dry-run, and invokes authentication before building. Therefore `cloudflare:preview:check` validates a local projection of the common code/assets settings plus **only** the explicit `previews` variables/resources. It excludes top-level production variables, resources, routes and schedules; it sets `routes: []` and `workers_dev: false` only in the ignored check file. It then invokes pinned Wrangler with `deploy --dry-run`. This verifies packaging and configuration syntax, not branch Preview creation, remote Base/secrets, resource ownership or hosted runtime behavior. The real source Worker's workers.dev setting is unchanged.

The checker rejects the old Worker name, missing/changed Custom Domains and misplaced routing/identity fields inside `previews`. Tests inject production fixture secrets, storage/service bindings and schedules and verify none enter Preview packaging; a separate fixture verifies explicitly configured staging resources are retained. Current source production bindings, compatibility settings, placement, observability, storage adapter and secrets are unchanged.

## Which deployment succeeded, and why PR #4 is still red

The owner supplied these successful-run facts: production branch **`main`**, build **`pnpm cloudflare:build`**, deploy **`pnpm cloudflare:deploy`**, endpoint **`https://sinversegames.sainikhilk2002-21c.workers.dev`**, reported current version **`f1efd778-b31f-424a-81a1-8ee2ee71faf0`**, and both deploy/build commands completed successfully.

Given the supplied command and installed command implementation, that is a **production Worker deployment**, which also advertises its ordinary workers.dev endpoint. It is not a branch Preview. The endpoint alone would not prove deployment type; the production deploy command and `main` context distinguish it. An upload success line alone would not establish final deployment success, but the owner also supplied final command/build success. The version ID does not prove custom-domain routing, runtime health, or a Preview deployment.

Read-only public GitHub API inspection independently found:

| Commit / context | Check outcome | Cloudflare Build ID |
| --- | --- | --- |
| PR #4 feature commit `26f066ef03b3109c9162188fa1b6a6a3bdcca472` | Completed **failure** | [283de0f5-ad3f-4dbf-bfc4-4f11468a697c](https://dash.cloudflare.com/21c2f668735c78d18513f64d381aa233/workers/services/view/sinversegames/production/builds/283de0f5-ad3f-4dbf-bfc4-4f11468a697c) |
| PR #4 head at the first audit, `8942a015f8a7e1fed236cca546822eec59af8a61` | Completed **failure** | [aee1ccee-b353-4d94-b42d-a3ddae8e2406](https://dash.cloudflare.com/21c2f668735c78d18513f64d381aa233/workers/services/view/sinversegames/production/builds/aee1ccee-b353-4d94-b42d-a3ddae8e2406) |
| Current remote `main` merge `2aeab766414668602f75a78a6cc03b2fe4c7f57c` | Completed **success** | [94169f8e-63d2-4d4a-ae72-f5c5b84629cd](https://dash.cloudflare.com/21c2f668735c78d18513f64d381aa233/workers/services/view/sinversegames/production/builds/94169f8e-63d2-4d4a-ae72-f5c5b84629cd) |

[PR #4's Cloudflare bot comment](https://github.com/SaiNikhilk2002/sinversegames/pull/4#issuecomment-6677072264) lists both feature-commit failures under “Preview Deployments by commit”, with empty deployment-URL cells. The older `26f066e` failure completed at approximately 04:40:34 UTC on November 6, matching the supplied earlier missing-Worker-entry log at 04:40:33 UTC. That earlier log establishes its missing generated artifact; it does not establish the cause of the later head-commit failure. The head check completed at 04:59:14 UTC. The public check summaries expose Build ID/Worker links but no full log; the annotation endpoints for both failed terminal checks returned zero annotations. The dashboard URL's `/production/builds/` component also appears on the feature checks and cannot identify deployment type by itself.

The main success completed at 20:08:39 UTC on November 5. It is a separately observed successful main check; **the supplied version `f1efd778-…` has not been mapped to that Build ID**. The successful log supplied no Build ID. No authenticated Cloudflare build/version data was available, so the report does not invent that relationship or label the failed feature check a success.

GitHub is red because those particular feature-commit build checks are recorded as failed. A different main deployment/version does not retroactively update a feature-commit check. The API also exposes an older in-progress check object for the same Build ID alongside the terminal object; this is recorded as a separate reporting observation, not an asserted cause of failure. There is no evidence of a verified successful branch Preview in the inspected PR records. The later feature build's exact error requires its full existing Cloudflare log or authenticated read-only build access; no deployment rerun is requested or performed.

## Exact dashboard settings for review

No setting was changed during this audit. In the existing **sinversegames** Worker's **Settings > Build**:

| Setting | Production | Branch Preview |
| --- | --- | --- |
| Worker / connected repository | Existing `sinversegames` / `SaiNikhilk2002/sinversegames` | Same parent Worker and repository; Preview is a separate branch resource |
| Root directory | `/` (repository root) | `/` |
| Branch selection | `main` | Non-production branches, including `feature/sinverse-cricket-2` |
| Build command | `pnpm cloudflare:build` | `pnpm cloudflare:build` |
| Deploy / Preview command field | `pnpm cloudflare:deploy` | `pnpm cloudflare:preview:deploy` |
| Node / package manager | Node 24.14.0 / pnpm 11.15.1 | Same pinned versions |
| Production Custom Domains | `sinversegames.com`, `www.sinversegames.com`, retained | No production-domain routes; use an actual Preview URL returned by Cloudflare |
| Runtime settings | Preserve existing Production variables, secrets and bindings | Preview-only non-secret references in `previews`; Preview-safe secrets in Previews Base / branch Preview; isolated data resources |
| Public build-time URLs | Production site/realtime URLs | Preview site/isolated realtime URLs, compiled for that build |

Do not use `pnpm cloudflare:deploy`, `cf:deploy`, `wrangler deploy`, or `wrangler versions upload` as the Preview command. Do not set `--name sinversegames` on `wrangler preview`: there `--name` selects the Preview's name, not its parent Worker. Do not copy production bindings/secrets into the Preview Base. Actual Preview URL/resource identifiers were not supplied or verified; no hostname or staging resource is invented here.

## Local files changed

| File | Change |
| --- | --- |
| `wrangler.jsonc`, `apps/web/wrangler.jsonc` | Canonical Worker name and both existing production Custom Domains; other top-level settings and Preview block retained |
| Root/web `package.json` | Explicit app-config selection, new config/production checks, separate Preview packaging projection; publishing commands remain production vs Preview respectively |
| `apps/web/scripts/cloudflare-check.mjs` | Local validation and fixed dry-run-only production/Preview packaging helper |
| `apps/web/scripts/cloudflare-check.test.mjs` | Negative tests for wrong target/missing route, routing misplacement and production-data leakage into Preview packaging |
| `apps/web/e2e/cloudflare-config.spec.ts` | Preserve existing drift tests; add canonical name, both exact Custom Domains and separate Preview settings assertions |
| `README.md`, `DEPLOYMENT.md` | Current canonical identity, commands, route preservation and separate CI settings/check limitations |
| `docs/CLOUDFLARE_PREVIEW_QA_REPORT.md`, `docs/RELEASE_BLOCKER_INVESTIGATION.md` | Link the current audit while preserving historical evidence |
| This report | Evidence, decisions, validation and remaining authorized actions |

## Verification ledger

Validation passed in a new Linux/WSL source copy without active environment files, credentials, database contents or prior media. Explicit loopback fixture database URL, isolated configuration storage, Node 24.14.0 / pnpm 11.15.1 / Wrangler 4.155.0; no database server or migration. Tests and checks used the final configuration/helper source; the final structural Preview-routing test refinement received a separate passing web typecheck and six-case run.

| Check | Result |
| --- | --- |
| Fresh frozen install | Pass, 14 seconds; no dependency or lockfile change |
| Prisma generation | Both Node/workerd clients generated; no migration or database connection |
| Workspace types | All five package typechecks pass in Linux; final web typecheck passes again after the test refinement |
| Local normalized configuration | Pass on Windows and Linux: canonical name, both exact domains, resolved root/app paths and Preview separation |
| Configuration regressions | All six Playwright cases pass; isolated config starts no browser/web/realtime server |
| Preview isolation regressions | All four Node cases pass on Windows and Linux, including injected production-data exclusion and explicit staging-resource preservation |
| OpenNext production build | Pass: explicit app config, Next.js TypeScript, `.open-next/worker.js` generated (2,278-byte entry loader referencing the full bundle), assets and static cache prepared |
| Production packaging | `pnpm cloudflare:check` passes, pinned Wrangler 4.155.0; both domains in selected source config; 165 asset files; 23,845.83 KiB total / 6,308.80 KiB gzip; explicit dry-run exit |
| Preview projection packaging | `pnpm cloudflare:preview:check` passes, same pinned Wrangler; zero production routes/data bindings, 165 asset files; 23,845.71 KiB total / 6,308.79 KiB gzip; explicit dry-run exit |
| Cache integrity | All 42 prerender cache files byte-equal to prepared static assets |
| Preservation | Lockfile SHA-256 unchanged: `c1bb3ef586c5f1bdd07c85ff045fca81c5ad7a7b1a0c31f55d1cdf161a4db4bb`; root instruction files unchanged and byte-identical with SHA-256 `8546d10f083011d072c299b89dabe82585c527fb8433416933f865f2b061f4eb` |

Both packaging commands end with `--dry-run: exiting now`; Wrangler's “Total Upload” size label is a local bundle measurement, not evidence that an upload occurred. No application/game source changed, so the earlier full gameplay/engine/database suites were not rerun for this configuration-only task. No owned web/realtime/database listener remains on ports 3200, 4200 or 5438.

Ignored evidence under `.data/cloudflare-worker-audit/`: `github-checks.json`, empty annotation responses, `config-validation.log`, `config-validation-linux.log`, `config-tests-final.log`, `isolation-tests-linux.log`, `install.log`, `generate.log`, `typecheck.log`, `typecheck-final-web.log`, `cloudflare-build.log`, `production-packaging.log`, `preview-packaging.log`, `artifact-validation.json`, `versions.log`, `lockfile-after.log`, and the isolated runner/source-copy location. No fixture environment values or generated output are committed. The final handoff supplies the local commit hash and branch state.

Initial local checks: all **four isolation tests** and **six existing/extended configuration cases** pass. The first new config validator compared raw relative asset paths and correctly stopped; it now resolves each asset directory relative to its own config file, and root/app validation passes. No production assertion, route or test tolerance was relaxed.

## Remaining actions and approval boundary

The source changes are reviewable locally. Pushing the feature branch (which may trigger CI), changing dashboard settings/Base bindings, publishing a branch Preview, production deployment and merge remain outside this authorization. Existing full Cloudflare logs/version metadata could be inspected read-only if access is supplied; that is sufficient to determine the later feature failure without rerunning it.

A future approved Preview verification needs a real `wrangler preview` result with branch, commit, Build ID and returned Preview/deployment IDs/URLs, plus runtime checks using Preview-safe resources. A future production release must first review the full remote/local diff, including any remote-only non-secret variables and bindings not present in the supplied summary. This task aligns only the confirmed name and two domains and preserves other local settings; it cannot certify an unseen remote configuration. **The remote Preview deployment is not claimed fixed.**

## Follow-up: the 11:03 IST Preview failure

Investigation started from clean local `f0e595745c6512ee5171641555d96194216d4ff0`. The owner supplied a new failed Preview log ending at 11:03:35.396 on November 6, along with a current screenshot listing root `/`, Build command `pnpm cloudflare:build`, Production Deploy command `pnpm cloudflare:deploy` and production branch `main`. The screenshot does not show the separate Preview command or the effective settings recorded for that failed run.

### Matched run and facts

Read-only public GitHub API inspection now finds PR #4 head **`f0e595745c6512ee5171641555d96194216d4ff0`** with a failed terminal Cloudflare check. Its Details URL identifies build **[77abdaf8-0f7d-4da8-bda9-9c0a4f569776](https://dash.cloudflare.com/21c2f668735c78d18513f64d381aa233/workers/services/view/sinversegames/production/builds/77abdaf8-0f7d-4da8-bda9-9c0a4f569776)**. The check completed at 05:33:37 UTC (**11:03:37 IST**), and the Cloudflare bot records 05:33:36.673 UTC with an empty deployment-URL cell. This matches the supplied error timing. It is a newer failed run on the reconciled commit, not a replay of the old `26f066e` / `283de0f5-…` failure. No new push or build was triggered by this investigation.

That commit already contains both `name: sinversegames` declarations, both production Custom Domains and explicit app-config selection. Its root Cloudflare build script delegates to the app's OpenNext build/cache preparation. Thus an old Worker-name declaration in the PR source is not the explanation for this run's missing file. The name and domains require no further rename, redirect or DNS change.

| Supplied run evidence | What it establishes |
| --- | --- |
| `Executing user deploy command: npx wrangler preview` | The run used the default/bare Preview command, not the repository's `pnpm cloudflare:preview:deploy` script |
| Wrangler 4.158.0 downloaded | The root invocation did not resolve the app workspace's installed pinned Wrangler 4.155.0 |
| `apps/web build: Done`, then immediate build-command success | The provided tail resembles the recursive Node build; it does not show which build command actually ran or a completed OpenNext packaging/cache stage |
| Missing `apps/web/.open-next/worker.js` | The selected root config's expected Worker entry did not exist at Preview invocation; plain Next `.next` output cannot satisfy it |
| Current screenshot displays `pnpm cloudflare:build` | Current displayed configuration only; it does not prove that the same saved trigger/settings were used for the failed run |

Cloudflare documents that non-production branch builds use the **Preview command** instead of the production Deploy command, defaulting to `npx wrangler preview`. That explains the observed command even when the screenshot's production command is correct. [Build settings and Preview command](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/). The display label “Executing user deploy command” in a build log does not turn `wrangler preview` into a production deployment.

### Build-side conclusion and remaining evidence

The exact run-specific reason that the artifact was absent is **not established by this tail**. The same commit's intended Cloudflare command generated and packaged it locally in Linux. The missing file is confirmed, while the run's actual build command/settings snapshot is not. Possible explanations still requiring evidence include a different saved build command or connected build trigger at run time, a screenshot captured after settings changed, or an output/path/environment difference during that run. These are possibilities, not findings. No evidence establishes a cache problem, a missing domain, or the Worker-name mismatch as the cause.

The decisive existing log lines are: checked-out commit, repository/working directory, `Executing user build command: ...`, and any OpenNext bundle/cache output after the Next.js route table. Those lines were requested without asking for a rerun. The owner supplied an expanded route-list/Preview-error tail, which still omits the build-command header and checkout/working-directory lines. Authenticated dashboard build metadata/full logs are unavailable locally. Do not assert that the displayed Build field is wrong or was already in use based only on this excerpt.

The installed adapter always runs its bundle-generation stage after Next unless that stage fails; skipping the Next compile does not skip Worker packaging. No repository pre/post-build hook removes the Worker. Local source/config review has not reproduced a successful intended OpenNext command that leaves the entry absent.

### Local hardening

The app `cf:build` now ends with `node scripts/cloudflare-check.mjs artifacts`. This validates that the configured Worker is a nonempty regular file and the assets path is a directory, then prints `OPENNEXT_ARTIFACT_CHECK` with Worker/config/artifact paths, byte count and validated public CI commit/build IDs. It logs no environment dump or secret values. `pnpm cloudflare:artifact:check` exposes the same local check separately. A missing, empty or directory-valued Worker, or missing/file-valued assets path, fails the check. Production and Preview packaging reuse the same artifact validation.

This cannot change the dashboard's command or explain a past run without its metadata. It ensures that a future invocation of the revised `pnpm cloudflare:build` cannot exit successfully while the configured artifact is absent at build completion. If Preview later reports it missing despite the marker, compare its working directory/filesystem and intervening cleanup with the marker's absolute path. If no marker appears, first confirm the actual commit and build command. No publishing command was added to the build.

### Exact dashboard change and next Preview acceptance

For the existing `sinversegames` Worker's correct repository/build connection:

| Field | Required value / action |
| --- | --- |
| Root directory | Keep `/` |
| Build command | Keep `pnpm cloudflare:build`; verify/save it on the same connection that produced build `77abdaf8-…` |
| Production Deploy command | Keep `pnpm cloudflare:deploy` |
| **Preview command** | **Replace `npx wrangler preview` with `pnpm cloudflare:preview:deploy`** |
| Production branch | Keep `main` |
| Preview branch control | Ensure `feature/sinverse-cricket-2` is included when Preview builds are enabled |

Cloudflare says saved settings apply to the next build and retries use the settings saved at retry time. This describes future verification, not an action performed here. Changing the Preview command alone does not prove the missing-artifact cause is resolved.

After separately approved source/settings updates, accept a next PR Preview only when all of these match:

1. PR #4 check Details names the expected new commit and Build ID; the checkout is `feature/sinverse-cricket-2` on `sinversegames`.
2. The existing run log explicitly says `Executing user build command: pnpm cloudflare:build`, then shows OpenNext Worker generation and cache preparation.
3. The updated source prints `OPENNEXT_ARTIFACT_CHECK` before build success, with a positive entry byte count and matching CI commit/build IDs. On an older commit without this guard, require equivalent file-existence evidence rather than expecting a marker that did not exist yet.
4. The next stage explicitly invokes `pnpm cloudflare:preview:deploy`, uses installed Wrangler 4.155.0 and reaches a successful **Preview** deployment; no `npx` download or production deploy substitution.
5. Cloudflare returns branch Preview/deployment IDs and URL, and the check for that same commit/Build ID becomes successful. A `main` production success or plain workers.dev production endpoint is insufficient.
6. Verify that returned Preview URL with Preview-only runtime secrets/data resources and confirm the production Custom Domains/configuration have not changed. Do not create production players, matches or reward data as a Preview check.

Local results for this follow-up:

| Check | Result |
| --- | --- |
| Normalized root/app config | Pass; canonical `sinversegames`, both existing Custom Domains and separate Preview settings retained |
| Helper regressions | All five pass on Windows and Linux; new case rejects missing/empty/directory Worker entries and invalid assets paths |
| Configuration regressions | All six Playwright checks pass; no web/realtime server or browser started |
| Frozen Linux install | Pass with unchanged dependencies and lockfile; isolated source copy reused from the prior audit with the four changed package/helper files copied in |
| OpenNext build | Pass under synthetic `WORKERS_CI=1` / feature-branch context; generated Worker/assets and the final artifact guard passes |
| Independent artifact check | Pass; `OPENNEXT_ARTIFACT_CHECK` records a nonempty 2,278-byte entry loader and the expected absolute app config/assets paths |
| Production and Preview packaging | Both fixed dry-runs pass with installed Wrangler 4.155.0; prepared assets retained, Preview projection excludes production routes/data settings; explicit no-upload exits |
| Preservation | Frozen lockfile and both root instruction hashes unchanged; Worker names/domains and all application, player-data and engine source unchanged in this follow-up |

The local CI commit/build IDs were deliberately all-zero fixtures to exercise safe metadata output, not identifiers of any real Cloudflare run. This test does not reproduce the exact failed run's unknown environment or effective build settings. Evidence is retained under ignored `.data/cloudflare-preview-run/`: read-only `pr-evidence.json` / `checks.json`, `config-validation.log`, `config-tests.log`, `helper-tests.log`, `helper-tests-linux.log`, `cloudflare-build.log`, `artifact-check.log`, both packaging logs, versions and frozen-lock check. The entry loader references the full Worker bundle; its byte count is not the full payload size.

Remote Preview remains unverified. No push, upload, deployment, merge, dashboard change, production migration or production resource operation was performed. The final handoff records the local follow-up commit; the root instruction files remain unchanged and byte-identical.
