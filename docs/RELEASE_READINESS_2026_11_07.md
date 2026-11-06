# Release readiness audit — 2026-11-07

## Scope and starting state

Applied the supplied SinverseGames operating prompt to the highest-priority release checks. Started from clean `feature/sinverse-cricket-2` at **`52c0a825d25db405e732b915703b84ed3c862c48`**, matching PR #4's current remote head. Inspected recent commits, staged/unstaged state, both complete root manuals, web instructions, current Cricket 2 validation, deployment configuration, artifact helper/tests and the earlier Cloudflare audit. This is a read-only remote investigation plus local configuration tests and documentation; it does not introduce a gameplay or infrastructure change.

The supplied prompt explicitly prohibits modifying root instruction files. `AGENTS.md` and `CLAUDE.md` therefore remain unchanged and byte-identical, SHA-256 **`8546d10f083011d072c299b89dabe82585c527fb8433416933f865f2b061f4eb`** each. The frozen lockfile remains **`c1bb3ef586c5f1bdd07c85ff045fca81c5ad7a7b1a0c31f55d1cdf161a4db4bb`**. Earlier QA reports remain historical evidence; their tests are not counted as newly executed here.

## P0: Cricket 2 hosted Preview remains blocked

Read-only GitHub REST requests establish:

| Evidence | Observed result |
| --- | --- |
| [PR #4](https://github.com/SaiNikhilk2002/sinversegames/pull/4) | Open, not draft, not merged; head `52c0a825d25db405e732b915703b84ed3c862c48`, base `main`; API reports mergeable, which is not release approval |
| Latest head check, ID `128112401551` | `Workers Builds: sinversegames`, completed **failure**, at `2026-11-06T19:41:14Z` = **November 7, 01:11:14 IST** |
| Latest check's build | **[b66be585-f842-454d-b669-f67207bbb68c](https://dash.cloudflare.com/21c2f668735c78d18513f64d381aa233/workers/services/view/sinversegames/production/builds/b66be585-f842-454d-b669-f67207bbb68c)** |
| Latest check annotations | Zero; summary contains Build/Worker links, no error text or complete log |
| [Cloudflare bot comment](https://github.com/SaiNikhilk2002/sinversegames/pull/4#issuecomment-6677072264) | Its head-commit row reports a different failed build, `b7a6c63f-232a-471b-9948-63f9ad3a6476`, updated `2026-11-06T19:23:27.641Z` = November 7, 00:53:27.641 IST; deployment URL cell is empty |
| GitHub deployment records for the head | Empty list; no Preview URL obtained from these records |
| GitHub combined status | `pending` with an empty legacy-status list; this does not override the explicit failed Check Run |
| Local pinned `wrangler whoami` | Reports unauthenticated. It exits zero despite that message; zero is not proof of authenticated dashboard access |

The later Check Run and the bot's earlier row have different Build IDs. They must not be conflated or used to infer one another's logs. There is **no evidence of a successful hosted Preview** in the inspected records. The exact latest failure cause is **not established**: an installation excerpt, the prior missing-Worker error or a successful local build does not explain the newer build without its log.

Requested the non-secret existing log for build `b66be585-…`: checked-out commit, working/root directory, `Executing user build command`, `OPENNEXT_ARTIFACT_CHECK` if emitted, Preview command and final error. No retry, push, deployment, temporary account or dashboard change was triggered. Without a supplied URL and verified Preview resources, hosted desktop/mobile/toss/bowling/batting/wicket/replay/network acceptance is **not run**. Do not substitute production gameplay or invent a Preview hostname.

## Configuration and isolation review

Source settings and scripts still agree:

| Setting | Production | Branch Preview |
| --- | --- | --- |
| Worker / root | Existing `sinversegames` / `/` | Same parent Worker / `/` |
| Branch | `main` | `feature/sinverse-cricket-2` or other configured non-production branches |
| Build | `pnpm cloudflare:build` | `pnpm cloudflare:build` |
| Publishing command, only after approval | `pnpm cloudflare:deploy` | `pnpm cloudflare:preview:deploy` |
| Routes/resources | Exact `sinversegames.com` and `www.sinversegames.com` Custom Domains retained | No production domains in `previews`; explicitly isolated Preview resources required |
| Toolchain | Node 24.14.0 / pnpm 11.15.1 / Wrangler 4.155.0 | Same pinned repository tools |

The build ends with the artifact guard; the Preview publishing chain is **cache preparation → artifact guard → pinned Wrangler Preview**. Ordinary `pnpm build` is not the Cloudflare build. Both configs point to `apps/web/.open-next/worker.js` and its assets after normalization. No script/config correction is justified by the new remote evidence alone, so none was made.

Cloudflare documents that non-production builds use the Preview command instead of production deployment, and that build variables are separate from runtime settings. [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/). Preview production-setting separation does not prove that unseen Preview secrets/resource IDs point to isolated services; Previews Base secrets also require inspection. [Preview configuration](https://developers.cloudflare.com/workers/previews/configuration/).

Before any hosted test that creates data, the owner must confirm Preview-only database, realtime target, auth configuration and storage bindings; public frontend URLs/CSP must match the intended Preview services. No production credentials or real player accounts should be used for that verification. Remote resource isolation remains **unverified**.

## P1: Railway release commit verified

Read-only `railway status --json` identified the linked `@platform/realtime` service for this repository and its production environment. `railway deployment list` explicitly selected that project/service/environment. The active-deployment entry in `status` and the deployment listing agree:

| Field | Observed value |
| --- | --- |
| Service | `@platform/realtime` |
| Environment / domain | `production` / `rt.sinversegames.com` |
| Active deployment | **`93ce44d1-61f9-444e-991d-66fb4f8dec5b`** |
| Status | **`SUCCESS`** |
| Repository / branch | `SaiNikhilk2002/sinversegames` / `main` |
| Commit | **`2aeab766414668602f75a78a6cc03b2fe4c7f57c`** |
| Created | `2026-11-05T19:59:14.976Z` = November 6, 01:29:14.976 IST |

This resolves the supplied roadmap's uncertainty about Railway running the realtime fix from `2aeab76` or later. Older listed deployments are removed/skipped and are not treated as active. Replica count was not supplied in the status field inspected here; no scaling setting was changed or inferred.

Read-only public requests returned:

- `https://sinversegames.com/api/health`: **200**, `status: ok`, `database: ok`, `realtime: ok`.
- `https://rt.sinversegames.com/health`: **200**, `status: ok`.

The realtime health response has no commit identifier; provider deployment metadata supplies the commit evidence. Health only demonstrates those endpoint checks. It does not verify real player ownership, match completion, wallet/profile persistence, revocation, Resend delivery, Google consent or R2 uploads. No production session, match, reward, email or upload was created. Those acceptance items remain open.

Remote `main` is still `2aeab766…`; its separate successful Cloudflare check completed at `2026-11-05T20:08:39Z`, build `94169f8e-63d2-4d4a-ae72-f5c5b84629cd`. That production success does not make PR #4's failed Preview green. The local `main` branch is older; it was neither checked out nor reset. The public remote response and existing `origin/main` agree on the current production merge.

## Local verification and limits

| Command / check | Result in this audit |
| --- | --- |
| `pnpm cloudflare:config:check` | Passed; both source configs agree, canonical Worker/domains preserved, Preview projection has no production routes |
| `node --test apps/web/scripts/cloudflare-check.test.mjs` | **5 passed**, zero failures/skips |
| `pnpm --filter @platform/web exec playwright test --config ../../.data/operating-audit-20261107/playwright.config.ts` | **7 passed**, zero failures/skips/retries; structural assertions only, no browser or web/realtime server started |
| Read-only GitHub PR/check/annotation/comment/deployment/main queries | Passed; results and limitations above |
| Read-only Railway status/deployment metadata | Passed; active production commit verified |
| Public web/realtime health | Both 200, healthy as above |
| Root instruction/lock hashes, diff and documentation-link checks | Unchanged/passing at handoff |
| Fresh application typechecks/unit/DB/gameplay/build/packaging | **Not rerun**: no application, test, dependency or build-configuration source changes in this audit; prior dated local evidence remains separate |
| Hosted Preview deployment/gameplay/isolation | **Not verified**; latest check failed, URL/log/authenticated Cloudflare access unavailable |
| Production player/match/persistence/provider acceptance | **Not run**; requires separately authorized production-impacting verification and owner-controlled services |

Local checks used the process-local Node 24.14.0 PATH, explicit empty `DATABASE_URL`, disabled dotenv loading for Wrangler and telemetry disabled. No `.env` or production secret values were printed. Raw GitHub, Railway and test evidence remains ignored under `.data/operating-audit-20261107/`; provider status dumps are not committed. The generic web retrieval tool could not open GitHub's API URL, so direct read-only REST requests were used successfully instead. A cosmetic `NO_COLOR`/`FORCE_COLOR` test warning did not fail assertions.

## Handoff and next action

P0 remains blocked by the latest failed Cloudflare run and absent hosted URL/isolation evidence. The next action is to inspect the **existing full log for `b66be585-…`**, not assume a cache/name/path cause or trigger another deployment blindly. The owner can open **Workers & Pages → sinversegames → Builds → that Build ID** and share only the relevant non-secret lines. Dashboard settings should match the table above; their current saved values were not independently inspected.

Once the run succeeds and yields an actual Preview URL, verify resource isolation, then desktop/mobile match controls, toss, bowling, batting, wickets, replays and runtime/network failures. Recheck the exact PR head/check and complete diff before requesting any push/merge approval. A push can trigger CI/Preview publishing. Production deployment is a separate approval even after a merge.

Railway commit verification is complete; production data-writing/player/provider checks remain open. No new service or feature phase was started to bypass P0. Documentation-only local checkpoint information is supplied by the final task response. No push, merge, deployment, DNS, secret, database/schema/data, billing or external configuration change occurred.
