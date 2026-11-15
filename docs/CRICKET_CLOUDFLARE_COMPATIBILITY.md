# Sinverse Cricket T20/ODI: Cloudflare Workers compatibility

Whether server verification of an international match fits on the production Worker, and what is and isn't known.

**Cloudflare plan: NOT VERIFIED — USER CONFIRMATION REQUIRED.**

**CPU compatibility:**
- **Verified locally in the Workers runtime (workerd):** the worst real match needs at most about 0.5 s of wall time; a crafted log about 2.3 s. That's about 60× inside Workers Paid's default 30 s CPU limit, and about 50× over Workers Free's 10 ms.
- **Not verified on Cloudflare's network.**

## The Worker, from the repository

| Item | Value | Source |
|---|---|---|
| Worker name | `sinversegames` | `apps/web/wrangler.jsonc` and the root `wrangler.jsonc`, kept identical by `e2e/cloudflare-config.spec.ts` |
| Entry point | `.open-next/worker.js` (OpenNext) | `main` |
| Adapter | `@opennextjs/cloudflare` 1.20.14; incremental cache: static assets; cache interception on | `apps/web/package.json`, `open-next.config.ts` |
| Wrangler | 4.155.0, pinned at the root and in `apps/web` | `package.json` |
| Compatibility date and flags | `2026-10-01`; `nodejs_compat`, `global_fetch_strictly_public` | `wrangler.jsonc` |
| **CPU limit** | **Not set** (no `limits` block) | `wrangler.jsonc` |
| Placement | `smart` (runs near the database) | `wrangler.jsonc` |
| Observability | Enabled | `wrangler.jsonc` |
| Routes | Custom domains `sinversegames.com`, `www.sinversegames.com` | `wrangler.jsonc` |
| Bindings | `ASSETS` only. The database is reached through the `DATABASE_URL` secret with `pg` over TCP; there's no Hyperdrive or other binding. The avatar code looks for an optional R2 binding `AVATARS`, which the config doesn't declare | `wrangler.jsonc`, `packages/db/src/client.ts`, `lib/server/avatar-storage.ts` |
| Vars | `NODE_ENV=production` (also under `previews`) | `wrangler.jsonc` |
| Deploy scripts | `cloudflare:build` → `cf:build`; `cloudflare:deploy` → `cf:production:deploy` (guarded to `main`); `cloudflare:preview:deploy` → `wrangler preview` | `package.json` files |

**This release changes none of these.**

## Is the plan known?

**No.** Nothing readable from here establishes the account's subscription:
- **No account access was used.** This audit used no Cloudflare login, token or API, and the local Wrangler bench ran without credentials.
- **`DEPLOYMENT.md` says "Workers Paid, $5/mo"** and lists "Workers Paid plan active" in the launch checklist. That is the project's intent, not evidence of the subscription.
- **The bundle-size argument no longer helps.** `DEPLOYMENT.md` reasons that the 4.7 MiB gzipped Worker needs Paid, because Free allowed 3 MiB. Cloudflare's current limits page lists **64 MiB uncompressed for both plans**, with no compressed limit. So a successful production deploy no longer proves Paid either, even indirectly.
- **No CPU setting exists in the repository.** The production Worker's CPU limit is whatever the plan's default is, or what its dashboard setting says.

**To confirm (owner):** Cloudflare dashboard → Workers & Pages → Plans, or Manage Account → Billing → Subscriptions. Then Workers & Pages → `sinversegames` → Settings: the CPU limit.

## Cloudflare's limits (official documentation, read 2026-11-13)

From [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (updated 2026-11-13) and [Wrangler configuration: limits](https://developers.cloudflare.com/workers/wrangler/configuration/#limits) (updated 2026-11-12):

| Limit | Workers Free | Workers Paid | What it means here |
|---|---|---|---|
| **CPU time per HTTP request** | **10 ms** | **30 s by default, configurable up to 5 min** (`limits.cpu_ms` or the dashboard) | Verification is pure CPU. Over the limit: **error 1102** "Worker exceeded resource limits" and outcome `exceededCpu`. Cloudflare allows some flexibility, but consistent overruns are terminated |
| What counts as CPU | — | — | "Waiting on network requests (such as fetch() calls, KV reads, or database queries) does not count toward CPU time." Database writes, the duplicate-run read and the response cost wall time, not CPU |
| Wall-clock duration of an HTTP request | No limit | No limit | As long as the client stays connected |
| Memory | 128 MB per isolate | 128 MB per isolate | Shared by every request in the isolate |
| Subrequests | 50 per request | 10,000 per request | A submission uses one database connection; there are no subrequests |
| Request body | 100 MB (Free/Pro zones), 200 MB (Business), set by the **zone's** plan | Same | The app's own limit is 512 KB |
| Response body | No enforced limit | No enforced limit | Responses are a few KB |
| Worker size | 64 MiB uncompressed | 64 MiB uncompressed | The Linux build's Worker; see below |
| Startup time | 1 s | 1 s | Unchanged by this release |
| Static assets | 20,000 files, 25 MiB each | 100,000 files, 25 MiB each | About 31 MB of assets. The largest files in `public/` are the 1.8 MiB athlete GLB models |
| Daily requests | 100,000 (error 1027 beyond) | No limit | — |

Cloudflare documents that limits "are only enforced when deployed to Cloudflare's network, not in local development." That's why the local workerd figures below show the cost, not the limit.

## Measurements: three kinds, kept apart

**Hardware for all local figures:** Windows 11 laptop, 16 logical processors, Node 24.14.0, 2026-11-13. These are timings on this machine, not Cloudflare's servers.

### 1. Local Workers runtime (workerd), new in this audit

**Method:**
- `packages/engines/bench/cricket-workerd.mjs` starts the workspace's pinned **Wrangler 4.155.0** in local mode (`wrangler dev`). That's the real workerd runtime, on this machine, with the production compatibility date and flags, a throwaway configuration outside the repository, and no Cloudflare credentials. **Nothing is uploaded.**
- A minimal Worker (`bench/workerd/worker.ts`) does what `/api/solo/submit` does after authentication:
  - reads the body as text and `JSON.parse`s it;
  - applies the config and log schemas;
  - runs `sinverseCricket.verify`.
- Each case is posted to `/verify` (all of that) and to `/parse` (stopping after the log schema, as a baseline).
- The logs are the Node bench's: the same seeds, teams, difficulties and play patterns (`bench/cricket-logs.ts`), 10 matches per case, each timed 3 times.
- Timing is measured by the client on loopback. The Worker's own `performance.now()` (which local workerd doesn't freeze) agreed within a few ms.
- **Every verification in workerd (240 in run 1, 270 in run 2) returned exactly the score Node computed, and every crafted log was rejected in both runtimes.** Determinism holds across runtimes.

**Results:** wall ms for one verification request (single-threaded, so this approximates its CPU). Two runs on the same day: run 2 is the final tree; run 1 (earlier, 80 cases) gave each real case's maximum shown in the last column.

| Case | Deliveries (median) | Body KB (max) | Run 2 `/verify` median / p95 / max | `/parse` median | Run 1 max |
|---|---|---|---|---|---|
| T20, all simulated | 232 | 1.1 | 140 / 152 / 156 | 7 | 217 |
| T20, player every 3rd over | 196 | 15.6 | 106 / 128 / 154 | 8 | 174 |
| T20, player bowls all (worst T20) | 237 | 22.5 | 148 / 160 / 160 | 8 | 201 |
| T20, player bats all | 161 | 11.3 | 82 / 91 / 92 | 7 | 146 |
| ODI, all simulated | 603 | 1.1 | 354 / 383 / 386 | 7 | 458 |
| ODI, player every 3rd over | 393 | 29.8 | 206 / 263 / 263 | 7 | 305 |
| **ODI, player bowls all (worst real match)** | 593 | 55.5 | **356 / 399 / 405** | 9 | **505** |
| ODI, player bats all | 267 | 17.8 | 130 / 190 / 200 | 7 | 222 |
| **Crafted: no-ball flood, T20 config** (security S2; 5 logs) | 2,992 | 511.3 | **2,052 / 2,146 / 2,146** | 26 | — |
| **Crafted: no-ball flood, ODI config** (5 logs) | 2,992 | 511.3 | **2,123 / 2,311 / 2,311** | 26 | — |

The crafted log is the costliest a modified client can send:
- the player oversteps on every ball, and the AI bats each one, until the body reaches the route's 512 KB limit;
- it claims 176–195 minutes of play, which the sender must actually wait before submitting;
- the server replays it all, then rejects it as unfinished.

**Reading:**
- Parsing and schema checks cost under 10 ms for a real match's body (26 ms at 511 KB). The replay is what costs.
- Simulated innings are not cheap to verify: the server replays them. A fully simulated ODI costs about as much as the worst case.
- Same-session comparison with plain Node, run directly: ODI bowl-all 356 ms in workerd against 375 ms in Node, and the crafted log about 2.1 s against about 2.3 s.
  - The two runtimes performed about the same here.
  - The differences between runs on one day (up to about 25%) are this laptop's load. A CPU-bound process orphaned by an earlier session stayed on one core throughout; the agent wasn't permitted to stop it.

### 2. Local Node

From `CRICKET_PERFORMANCE_BENCHMARKS.md`, re-run in this audit (see that document):
- This audit, direct (`node --import <tsx loader> bench/cricket-verify.ts 10`), same session as workerd run 2: the worst ODI at **375 / 422 / 422 ms** CPU (median / p95 / max); T20 simulated 156 / 203 / 203 ms.
- Mission 2 measured 281 ms for the same case on a quieter machine. The engine is unchanged since then, and the delivery counts are identical, so the difference is load.
- The crafted log took 4.1–4.6 s of CPU under vitest's module runner, which runs about 1.8–1.9× slower than direct.

### 3. Real production or Preview

**None.** No Preview or production verification was run, because that requires an upload or real player matches. `CRICKET_PREVIEW_VALIDATION_PLAN.md` (Mode A) and runbook step 12 say how to read the real CPU time per request in Workers Observability.

## Does it fit?

| Request | Local workerd (max seen) | Workers Paid default (30 s) | Workers Free (10 ms) |
|---|---|---|---|
| T20, any real pattern | ≤ 217 ms | Fits, about 138× margin | **Doesn't fit** |
| ODI, any real pattern | ≤ 505 ms | Fits, about 59× margin | **Doesn't fit** |
| Simulated innings | Included above ("all simulated") | Fits | **Doesn't fit** |
| Crafted worst log (security S2) | ≤ 2.31 s | Fits, about 13× margin | **Doesn't fit** |
| Saving the result | Database I/O; not CPU-bound | Fits | Fits |
| Parsing and schema checks (real matches) | ≤ 10 ms | Fits | Borderline on its own |

**Caveats:**
- Cloudflare's servers aren't this laptop. CPU time on Cloudflare can be higher or lower; the margin on Paid is large enough that a several-fold difference would still fit.
- The duel was already shipped. It verifies in a few ms and may well have fit within Free's limits. **International cricket cannot run on the Free plan at all.**
- **On Free,** every T20/ODI submission would fail with error 1102, so players would finish matches whose results can never be saved.

## Node-only APIs and runtime dependencies

The release adds no `node:` imports, no filesystem access, no native modules, no long-running background work, no new network calls and no new bindings to runtime code (`PRODUCTION_RELEASE_AUDIT.md`). The engine is pure TypeScript plus `zod`, and it ran unchanged inside workerd in the benchmark above.

## Linux Cloudflare build (this audit)

Reproduced in WSL Ubuntu:
- A clean copy of the working tree (tracked plus new files, no `.env`, no `artifacts/`), in a temporary directory, not a Git worktree.
- Node 24.14.0, pnpm 11.15.1, `pnpm install --frozen-lockfile`. The lockfile is unchanged: SHA-256 `bbf66641254c2225e3005330d3acd869f90be22f5006c0bd1b5a3a3cbcf2ce2d`, as in Mission 2.
- Then `pnpm db:generate`, the engine bench, and `pnpm cloudflare:build`.
- Results are in `CRICKET_RELEASE_DECISION.md`.
- **Nothing was uploaded,** and the copy was deleted afterwards.

## Reproduce

```sh
# Node 24.14.0, from the repository root
CRICKET_MATCHES=10 CRICKET_CASES_OUT=/tmp/cases.json pnpm --filter @platform/engines bench:workerd:cases
node packages/engines/bench/cricket-workerd.mjs /tmp/cases.json   # local workerd; no login, no upload
```
