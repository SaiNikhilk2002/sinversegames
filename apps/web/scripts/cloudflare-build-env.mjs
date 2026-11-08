// Build-environment and deployment guards for the Cloudflare Worker.
//
//   node scripts/cloudflare-build-env.mjs          first step of `cf:build`
//   node scripts/cloudflare-build-env.mjs record   last step of `cf:build`
//
// 1. Realtime isolation. NEXT_PUBLIC_REALTIME_URL is compiled into the Worker
//    (socket target and CSP connect-src). Inside Workers Builds, a build that
//    is not on the production branch and uses the production realtime URL
//    stops before anything is built. An unset URL compiles to
//    http://localhost:4200, which cannot reach production.
//
// 2. Build record. `record` writes .open-next/sinverse-build.json (branch,
//    commit, production or not). The approved production deploy
//    (`pnpm cloudflare:deploy`) requires it; see checkProductionDeploy.
//
// 3. Bare Wrangler commands. `record` also writes Wrangler's generated-config
//    redirect at the repository root (.wrangler/deploy/config.json) pointing
//    to a config whose entry file deliberately does not exist, so a bare
//    `wrangler deploy` (or `preview`, `versions upload`) from the root fails
//    before bundling or uploading. Every approved script passes --config,
//    which Wrangler never redirects. The one exception is a Workers Builds
//    build on a known non-production branch, where Cloudflare's default
//    `npx wrangler preview` must work: there the redirect is removed.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PRODUCTION_BRANCH = "main";
export const PRODUCTION_REALTIME_HOSTS = ["rt.sinversegames.com"];
export const BLOCKED_ENTRY = "BARE_WRANGLER_COMMAND_BLOCKED-use-pnpm-cloudflare-deploy-or-pnpm-cloudflare-preview-deploy.js";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(app, "../..");
export const RECORD_PATH = join(app, ".open-next", "sinverse-build.json");
const REDIRECT_DIR = join(repo, ".wrangler", "deploy");

const realtimeOf = (env) => {
  const url = env.NEXT_PUBLIC_REALTIME_URL ?? "";
  if (!url) return { host: "", label: "unset (compiles to http://localhost:4200)" };
  try {
    const host = new URL(url).hostname.toLowerCase();
    return { host, label: host };
  } catch {
    throw new Error(`NEXT_PUBLIC_REALTIME_URL is not a valid URL: "${url}"`);
  }
};

// A Workers Builds build counts as production only on the production branch.
// An unknown (empty) branch is never production and never a known Preview.
export function classify(env) {
  const ci = env.WORKERS_CI === "1";
  const branch = env.WORKERS_CI_BRANCH ?? "";
  return {
    ci,
    branch: ci ? branch : null,
    production: ci ? branch === PRODUCTION_BRANCH : null,
    knownPreview: ci && branch !== "" && branch !== PRODUCTION_BRANCH,
  };
}

export function checkBuildEnv(env) {
  const { ci, branch, production } = classify(env);
  const realtime = realtimeOf(env);
  if (ci && !production && PRODUCTION_REALTIME_HOSTS.includes(realtime.host))
    throw new Error(
      `Refusing a non-production build (branch "${branch || "unknown"}") with the production realtime URL. ` +
        "Set NEXT_PUBLIC_REALTIME_URL for non-production builds to a non-production realtime service, " +
        "or leave it unset. See docs/CLOUDFLARE_DEFAULT_BUILD.md.",
    );
  return { ci, branch, production, realtime: realtime.label };
}

export function buildRecord(env) {
  const checked = checkBuildEnv(env);
  const commit = env.WORKERS_CI_COMMIT_SHA ?? "";
  const build = env.WORKERS_CI_BUILD_UUID ?? "";
  return {
    ...checked,
    realtimeHost: realtimeOf(env).host || null,
    commit: /^[a-f0-9]{40}$/i.test(commit) ? commit : null,
    build: /^[a-f0-9-]{36}$/i.test(build) ? build : null,
  };
}

// Throws unless the approved production deploy may publish this artifact.
// Returns warnings that do not block.
export function checkProductionDeploy(env, record) {
  const { ci, branch, production } = classify(env);
  if (ci && !production)
    throw new Error(
      `Refusing a production deploy from branch "${branch || "unknown"}". Only "${PRODUCTION_BRANCH}" deploys production; ` +
        "the Preview command for other branches is pnpm cloudflare:preview:deploy.",
    );
  if (!record)
    throw new Error("No build record at apps/web/.open-next/sinverse-build.json; build with pnpm cloudflare:build first.");
  if (ci) {
    if (record.production !== true)
      throw new Error("Refusing to deploy an artifact that was not built as a production Workers Builds build.");
    if (!record.commit || record.commit !== env.WORKERS_CI_COMMIT_SHA)
      throw new Error("Refusing to deploy an artifact built from a different commit than this build.");
  } else if (record.ci && record.production !== true) {
    throw new Error("Refusing to deploy a non-production Workers Builds artifact to production; rebuild with pnpm cloudflare:build.");
  }
  const warnings = [];
  if (!record.realtimeHost)
    warnings.push("This Worker was compiled without NEXT_PUBLIC_REALTIME_URL; multiplayer will try http://localhost:4200.");
  return warnings;
}

export function readRecord(path = RECORD_PATH) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

// Files for the root redirect, or null when it must be absent.
export function redirectFiles(env) {
  if (classify(env).knownPreview) return null;
  return {
    "config.json": { configPath: "./bare-wrangler-blocked.json" },
    "bare-wrangler-blocked.json": {
      name: "sinversegames",
      main: `./${BLOCKED_ENTRY}`,
      compatibility_date: "2026-10-01",
    },
  };
}

function record(env) {
  const result = buildRecord(env);
  mkdirSync(dirname(RECORD_PATH), { recursive: true });
  writeFileSync(RECORD_PATH, JSON.stringify(result, null, 2) + "\n");
  const files = redirectFiles(env);
  if (files) {
    mkdirSync(REDIRECT_DIR, { recursive: true });
    for (const [name, body] of Object.entries(files))
      writeFileSync(join(REDIRECT_DIR, name), JSON.stringify(body, null, 2) + "\n");
  } else {
    for (const name of ["config.json", "bare-wrangler-blocked.json"]) rmSync(join(REDIRECT_DIR, name), { force: true });
  }
  console.log("CLOUDFLARE_BUILD_RECORD " + JSON.stringify({
    ...result,
    bareWranglerFromRoot: files ? "blocked" : "allowed (Workers Builds non-production branch)",
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === "record") record(process.env);
    else console.log("CLOUDFLARE_BUILD_ENV " + JSON.stringify(checkBuildEnv(process.env)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

export const redirectPath = join(REDIRECT_DIR, "config.json");
export const hasRedirect = () => existsSync(redirectPath);
