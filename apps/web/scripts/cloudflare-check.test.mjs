import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { previewPackagingConfig, validateBuildArtifacts, validateProduction } from "./cloudflare-check.mjs";

const production = () => ({
  name: "sinversegames",
  main: "/app/.open-next/worker.js",
  assets: { directory: "/app/.open-next/assets", binding: "ASSETS" },
  compatibility_date: "2026-10-01",
  compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
  routes: [
    { pattern: "sinversegames.com", custom_domain: true },
    { pattern: "www.sinversegames.com", custom_domain: true },
  ],
  vars: { DATABASE_URL: "production-fixture", AUTH_SECRET: "production-fixture" },
  r2_buckets: [{ binding: "UPLOADS", bucket_name: "production-fixture" }],
  services: [{ binding: "SERVER", service: "production-fixture" }],
  triggers: { crons: ["* * * * *"] },
  previews: { vars: { NODE_ENV: "production" } },
});

test("canonical identity and both existing Custom Domains are required", () => {
  validateProduction(production());
  assert.throws(() => validateProduction({ ...production(), name: "sinversegames-web" }));
  assert.throws(() => validateProduction({ ...production(), routes: production().routes.slice(1) }));
  assert.throws(() => validateProduction({ ...production(), routes: production().routes.map((route) => ({ ...route, custom_domain: false })) }));
});

test("Preview packaging excludes production routes, secrets, resources and schedules", () => {
  const config = previewPackagingConfig(production());
  assert.deepEqual(config.routes, []);
  assert.equal(config.workers_dev, false);
  assert.deepEqual(config.vars, { NODE_ENV: "production" });
  for (const key of ["r2_buckets", "services", "triggers", "env", "previews"])
    assert.equal(key in config, false, key);
  assert.equal(JSON.stringify(config).includes("production-fixture"), false);
});

test("only explicit Preview resources and variables enter the Preview bundle", () => {
  const source = production();
  source.previews.r2_buckets = [{ binding: "UPLOADS", bucket_name: "staging-fixture" }];
  source.previews.vars.API_ORIGIN = "https://staging.invalid";
  const config = previewPackagingConfig(source);
  assert.deepEqual(config.r2_buckets, source.previews.r2_buckets);
  assert.equal(config.vars.API_ORIGIN, "https://staging.invalid");
  assert.equal(JSON.stringify(config).includes("production-fixture"), false);
  assert.equal(source.routes.length, 2);
});

test("Preview settings cannot override identity, entry or production routing", () => {
  for (const key of ["routes", "route", "name", "main", "assets", "workers_dev", "env", "build", "triggers"]) {
    const source = production();
    source.previews[key] = [];
    assert.throws(() => previewPackagingConfig(source), new RegExp(key));
  }
});

test("build completion requires a nonempty Worker file and an assets directory", () => {
  const fixture = mkdtempSync(join(tmpdir(), "sinverse-worker-artifact-"));
  try {
    const config = { main: join(fixture, "worker.js"), assets: { directory: join(fixture, "assets") } };
    assert.throws(() => validateBuildArtifacts(config), /OpenNext Worker entry\/assets missing/);
    mkdirSync(config.assets.directory);
    writeFileSync(config.main, "");
    assert.throws(() => validateBuildArtifacts(config), /OpenNext Worker entry\/assets missing/);
    writeFileSync(config.main, "export default {};");
    assert.ok(validateBuildArtifacts(config).entryBytes > 0);
    assert.throws(() => validateBuildArtifacts({ ...config, main: config.assets.directory }), /OpenNext Worker entry\/assets missing/);
    assert.throws(() => validateBuildArtifacts({ ...config, assets: { directory: config.main } }), /OpenNext Worker entry\/assets missing/);
  } finally {
    assert.ok(resolve(fixture).startsWith(resolve(tmpdir()) + sep) && basename(fixture).startsWith("sinverse-worker-artifact-"));
    rmSync(fixture, { recursive: true });
  }
});
