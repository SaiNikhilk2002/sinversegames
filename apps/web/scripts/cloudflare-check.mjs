import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { unstable_readConfig } from "wrangler";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const domains = ["sinversegames.com", "www.sinversegames.com"];

export function validateProduction(config) {
  assert.equal(config.name, "sinversegames", "Target the confirmed existing Worker");
  assert.deepEqual(config.routes, domains.map((pattern) => ({ pattern, custom_domain: true })),
    "Both existing production Custom Domains must be retained");
  assert.ok(config.previews, "An explicit previews block is required");
}

// Wrangler preview has no dry-run in pinned 4.155.0. Package a local projection
// of its common code settings + previews settings, never production data/routes.
// This validates the bundle, not Preview API behavior or remote Base settings.
export function previewPackagingConfig(config) {
  assert.ok(config.previews, "An explicit previews block is required");
  for (const key of ["routes", "route", "name", "main", "assets", "workers_dev", "env", "build", "triggers"])
    assert.ok(!(key in config.previews), `${key} does not belong in previews`);
  return {
    ...config.previews,
    name: config.name,
    main: config.main,
    assets: config.assets,
    compatibility_date: config.compatibility_date,
    compatibility_flags: config.compatibility_flags,
    placement: config.previews.placement ?? config.placement,
    observability: config.previews.observability ?? config.observability,
    routes: [],
    workers_dev: false,
  };
}

async function main(mode) {
  assert.ok(["config", "production", "preview"].includes(mode), "Use config, production or preview");
  const configPath = join(app, "wrangler.jsonc");
  const load = async (file) => {
    const config = await unstable_readConfig({ config: file });
    // Wrangler normalizes main but keeps assets.directory relative to its file.
    return { ...config, assets: { ...config.assets, directory: resolve(dirname(file), config.assets.directory) } };
  };
  const config = await load(configPath);
  const root = await load(resolve(app, "../../wrangler.jsonc"));
  for (const item of [config, root]) validateProduction(item);
  for (const key of ["name", "routes", "main", "assets", "vars", "previews", "compatibility_date", "compatibility_flags", "placement", "observability"])
    assert.ok(isDeepStrictEqual(root[key], config[key]), `Root and app ${key} must agree`);
  const preview = previewPackagingConfig(config);
  if (mode === "config") {
    console.log(JSON.stringify({ worker: config.name, productionDomains: domains, previewProductionRoutes: preview.routes, configsAgree: true }, null, 2));
    return;
  }
  assert.ok(statSync(config.main).size > 0, "Run pnpm cloudflare:build before packaging");
  assert.ok(statSync(config.assets.directory).isDirectory(), "OpenNext assets are required");
  const out = join(app, ".open-next", `${mode}-check`);
  mkdirSync(out, { recursive: true });
  let selectedConfig = configPath;
  if (mode === "preview") {
    selectedConfig = join(out, "wrangler.preview.json");
    writeFileSync(selectedConfig, JSON.stringify(preview, null, 2));
    await unstable_readConfig({ config: selectedConfig });
  }
  const require = createRequire(import.meta.url);
  const cli = join(dirname(require.resolve("wrangler/package.json")), "bin/wrangler.js");
  const result = spawnSync(process.execPath, [cli, "deploy", "--config", selectedConfig, "--dry-run", "--outdir", join(out, "bundle")], {
    cwd: app,
    stdio: "inherit",
    env: { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false", WRANGLER_SEND_METRICS: "false" },
  });
  assert.equal(result.error, undefined, "Wrangler must start successfully");
  assert.equal(result.status, 0, "Local packaging dry-run must pass");
  console.log(`${mode} packaging passed; --dry-run only; no upload performed.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv[2] ?? "config").catch((error) => { console.error(error.message); process.exitCode = 1; });
