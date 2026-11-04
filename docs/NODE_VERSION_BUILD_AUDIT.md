# Node version and Cloudflare build audit - 2026-11-05

Repository: `D:\dev\games`, branch `codex/takeover-and-reliability-audit`; started clean at `53b285140edaaf5c9c1b1ceb5ef468b3ebe82faa`. No push, merge, deployment, dashboard change or database migration is authorized by this audit.

## Findings and chosen contract

The documented and previously verified Linux toolchain is Node **24.14.0** with pnpm **11.15.1**. Both existing `.node-version` files contained only `24`, allowing build-image patch/minor drift. Root `package.json` incorrectly advertised `>=20.11`, including Node 20 that the installed Wrangler 4.155.0 does not support (its installed manifest requires `>=22.0.0`). The reported Cloudflare Node **24.22.2** is a compatible Node 24 version, not evidence by itself of a build failure.

- `package.json`: change `engines.node` to `>=24.14.0 <25`; retain exact `packageManager: pnpm@11.15.1` and all scripts/dependencies.
- Root `.node-version` and `apps/web/.node-version`: exact **24.14.0**, matching the documented reproducible build baseline.
- `.nvmrc`: absent initially and left absent; existing Cloudflare-supported version files suffice.
- `pnpm-workspace.yaml`: inspected; package globs and install-script allowlist have no Node selector. Unchanged.
- `.npmrc`: inspected; only `auto-install-peers=true`, no Node override. Unchanged.
- `apps/web/wrangler.jsonc` and `open-next.config.ts`: inspected; Worker compatibility/runtime and Prisma/OpenNext build configuration are independent of build-machine Node selection. Unchanged.
- README and deployment instructions: document exact baseline, compatible range, frozen install and explicit build-variable overrides. Both root instruction manuals are updated together.

Cloudflare selects a custom build Node through a version file or `NODE_VERSION`, and pnpm through `packageManager`. The owner must remove any conflicting explicit `NODE_VERSION` override or set it to `24.14.0`; leave the repository-root build command `pnpm cloudflare:build`. No such external setting was inspected or changed. Do not add `NODE_VERSION` to Wrangler runtime `vars` as a build-version fix. See [Cloudflare's build-image reference](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/) and [pnpm engine/package-manager reference](https://pnpm.io/package_json).

## Verification

Verification uses an isolated Linux/WSL source copy without `.env`, production credentials or database access. It selects Node 24.14.0 and pnpm 11.15.1 explicitly in that shell, without changing machine-wide toolchains.

| Check | Result |
| --- | --- |
| Exact Node / pnpm versions | Passed: Linux x64 Node v24.14.0 / pnpm 11.15.1; root and web `pnpm exec node` both resolve v24.14.0 |
| `pnpm install --frozen-lockfile` | Passed in a fresh source directory, 11.8s, all six workspace projects; resolution skipped, 572 packages installed with no downloads |
| Both Prisma client generators | Passed: Prisma 7.10.1 Node and workerd clients, through install postinstall and explicit `pnpm db:generate`; no migration or database connection |
| Linux `pnpm cloudflare:build` | Passed: Next 16.4.3 / OpenNext Cloudflare 1.20.14; TypeScript passed, 40 static pages generated, `.open-next/worker.js` emitted; exit 0 |
| Lockfile SHA-256 / byte preservation | Passed before install, after install and after build; original Windows checkout also unchanged; hash below |
| Root instruction files byte-identical | Passed before and after updating both manuals |
| Final diff / working-tree review | Eight intended files only; whitespace and 20 local documentation links/anchors pass; final commit/status supplied in task response |

Original lockfile SHA-256: `3e66fb2ab0afb672ea2155faf2d36f3775d88b144f66743db1f22d33412856e4`. Raw local verification logs belong under ignored `.data/node-version/`. Existing gameplay tests and prior acceptance reports are preserved; this configuration/documentation change requires the frozen install and actual production adapter build, not a gameplay rewrite or production deployment.

The fresh checkout emitted the expected no-build-cache notice and one existing Turbopack broad dynamic file-pattern warning in the generated Prisma workerd WASM import trace (15,626 matched files, also present in prior identity build evidence). Neither is a Node engine mismatch, and neither stopped compilation or adapter bundling. No assertion, dependency, compatibility flag or warning suppression was changed to obtain the pass. This audit does not claim to fix that separate tracing/performance concern.

Reproduction in Linux: select Node 24.14.0 and pnpm 11.15.1, then run `pnpm install --frozen-lockfile`, `pnpm db:generate`, and `pnpm cloudflare:build` from the repository root. Local logs: `.data/node-version/versions.log`, `linux-install.log`, `linux-prisma-generate.log`, `linux-cloudflare-build.log`, lockfile checks and `verification.json`. Build-only public URLs and a disposable local signing placeholder were supplied; no ignored environment file, real Google/R2 settings or production database was copied. No gameplay code, schema, dependency version, original QA report, external service or machine-wide Node installation changed.
