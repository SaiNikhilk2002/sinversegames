import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";


// Runs without a browser. Workers Builds may run `npx wrangler preview` from the
// repository root, so the root config must describe the same Worker as the app's.
const read = (path: URL) =>
  JSON.parse(
    readFileSync(path, "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/,(\s*[}\]])/g, "$1"),
  ) as Record<string, unknown> & { assets: { directory: string; binding: string }; main: string };

test.describe("Cloudflare Worker configuration", () => {
  const root = read(new URL("../../../wrangler.jsonc", import.meta.url)),
    app = read(new URL("../wrangler.jsonc", import.meta.url));

  test("the root config has the previews block Wrangler requires", () => {
    expect(root.previews).toBeTruthy();
  });
  test("the root config points at the OpenNext output inside apps/web", () => {
    expect(root.main).toBe(`apps/web/${app.main}`);
    expect(root.assets).toEqual({ ...app.assets, directory: `apps/web/${app.assets.directory}` });
  });
  test("both configs describe the same Worker", () => {
    const shared = ({ $schema: _s, main: _m, assets: _a, ...rest }: Record<string, unknown>) => rest;
    expect(shared(root)).toEqual(shared(app));
  });
  test("both configs target the confirmed existing production Worker", () => {
    expect(root.name).toBe("sinversegames");
    expect(app.name).toBe("sinversegames");
  });
  test("both production Custom Domains are retained exactly", () => {
    const routes = [
      { pattern: "sinversegames.com", custom_domain: true },
      { pattern: "www.sinversegames.com", custom_domain: true },
    ];
    expect(root.routes).toEqual(routes);
    expect(app.routes).toEqual(routes);
  });
  test("Preview settings keep production routing separate", () => {
    expect(root.previews).toHaveProperty("vars.NODE_ENV", "production");
    for (const key of ["routes", "route", "name", "main", "assets", "workers_dev", "env", "build", "triggers"])
      expect(root.previews).not.toHaveProperty(key);
    expect(app.previews).toEqual(root.previews);
  });
  test("artifact checks follow build/cache preparation and gate Preview publishing", () => {
    const scripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts as Record<"cf:build" | "cf:preview:deploy", string>;
    const build = scripts["cf:build"].split(/\s*&&\s*/);
    const preview = scripts["cf:preview:deploy"].split(/\s*&&\s*/);
    const index = (steps: string[], pattern: RegExp) => steps.findIndex((step) => pattern.test(step));
    expect(index(build, /^opennextjs-cloudflare build\b/)).toBeGreaterThanOrEqual(0);
    expect(index(build, /\bpopulateCache local\b/)).toBeGreaterThan(index(build, /^opennextjs-cloudflare build\b/));
    expect(index(build, /cloudflare-check\.mjs artifacts$/)).toBeGreaterThan(index(build, /\bpopulateCache local\b/));
    expect(index(preview, /\bpopulateCache local\b/)).toBeGreaterThanOrEqual(0);
    expect(index(preview, /cloudflare-check\.mjs artifacts$/)).toBeGreaterThan(index(preview, /\bpopulateCache local\b/));
    expect(index(preview, /^wrangler preview\b/)).toBeGreaterThan(index(preview, /cloudflare-check\.mjs artifacts$/));
    expect(preview.at(-1)).toMatch(/^wrangler preview\b/);
    for (const step of preview) expect(step).not.toMatch(/\b(?:wrangler (?:deploy|versions)|opennextjs-cloudflare deploy)\b/);
  });
});

// Workers Builds can fall back to its defaults: `pnpm run build`, then a bare
// `npx wrangler preview` (or `deploy`) from the repository root.
test.describe("Cloudflare default build commands", () => {
  const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
  const rootPkg = json("../../../package.json"),
    appPkg = json("../package.json");
  const load = (path: string) => import(new URL(path, import.meta.url).href);

  test("the root pins the same exact Wrangler as apps/web", () => {
    expect(appPkg.devDependencies.wrangler).toMatch(/^\d+\.\d+\.\d+$/);
    expect(rootPkg.devDependencies.wrangler).toBe(appPkg.devDependencies.wrangler);
  });
  test("cf:build checks the build environment before building", () => {
    expect(appPkg.scripts["cf:build"].split(/\s*&&\s*/)[0]).toBe("node scripts/cloudflare-build-env.mjs");
  });
  test("the root build is the Node build locally and the Worker build in Workers Builds", async () => {
    expect(rootPkg.scripts.build).toBe("node scripts/build.mjs");
    const { selectTarget, buildSteps } = await load("../../../scripts/build.mjs");
    expect(selectTarget({})).toBe("node");
    expect(selectTarget({ CI: "true" })).toBe("node");
    expect(selectTarget({ WORKERS_CI: "1" })).toBe("cloudflare");
    expect(selectTarget({ WORKERS_CI: "1", SINVERSE_BUILD_TARGET: "node" })).toBe("node");
    expect(selectTarget({ SINVERSE_BUILD_TARGET: "cloudflare" })).toBe("cloudflare");
    expect(() => selectTarget({ SINVERSE_BUILD_TARGET: "pages" })).toThrow();
    // Reuses the existing scripts; never calls the root `build` again.
    expect(buildSteps("cloudflare").at(-1)).toEqual(["cloudflare:build"]);
    expect(buildSteps("node").at(-1)).toEqual(["-r", "--filter", "@platform/web", "--filter", "@platform/realtime", "build"]);
    for (const target of ["node", "cloudflare"])
      for (const step of buildSteps(target)) expect(step).not.toEqual(["build"]);
  });
  test("a non-production Workers build refuses the production realtime URL", async () => {
    const { checkBuildEnv } = await load("../scripts/cloudflare-build-env.mjs");
    const prod = "https://rt.sinversegames.com";
    const ci = { WORKERS_CI: "1" };
    expect(() => checkBuildEnv({ ...ci, WORKERS_CI_BRANCH: "feature/x", NEXT_PUBLIC_REALTIME_URL: prod })).toThrow(/non-production/);
    expect(() => checkBuildEnv({ ...ci, NEXT_PUBLIC_REALTIME_URL: prod })).toThrow(/non-production/);
    expect(() => checkBuildEnv({ ...ci, WORKERS_CI_BRANCH: "feature/x", NEXT_PUBLIC_REALTIME_URL: "nope" })).toThrow(/valid URL/);
    expect(checkBuildEnv({ ...ci, WORKERS_CI_BRANCH: "main", NEXT_PUBLIC_REALTIME_URL: prod })).toMatchObject({ production: true });
    expect(checkBuildEnv({ ...ci, WORKERS_CI_BRANCH: "feature/x" })).toMatchObject({ production: false });
    expect(checkBuildEnv({ ...ci, WORKERS_CI_BRANCH: "feature/x", NEXT_PUBLIC_REALTIME_URL: "https://rt-staging.example.com" })).toMatchObject({ production: false });
    expect(checkBuildEnv({ NEXT_PUBLIC_REALTIME_URL: prod })).toMatchObject({ ci: false });
    // An unset realtime URL compiles to localhost only.
    expect(checkBuildEnv({ ...ci, WORKERS_CI_BRANCH: "feature/x" }).realtime).toMatch(/http:\/\/localhost:4200/);
    for (const file of ["../next.config.ts", "../src/lib/realtime/connection.ts"])
      expect(readFileSync(new URL(file, import.meta.url), "utf8")).toContain('NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4200"');
  });
  test("the default root build refuses the production branch inside Workers Builds", async () => {
    const { checkRootBuild } = await load("../../../scripts/build.mjs");
    expect(() => checkRootBuild({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "main" }, "cloudflare")).toThrow(/pnpm cloudflare:build/);
    expect(() => checkRootBuild({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "feature/x" }, "cloudflare")).not.toThrow();
    expect(() => checkRootBuild({}, "node")).not.toThrow();
    expect(() => checkRootBuild({}, "cloudflare")).not.toThrow();
  });
});

test.describe("Cloudflare production deploy safeguards", () => {
  const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
  const rootPkg = json("../../../package.json"),
    appPkg = json("../package.json");
  const load = (path: string) => import(new URL(path, import.meta.url).href);
  const sha = "a".repeat(40);
  const main = { WORKERS_CI: "1", WORKERS_CI_BRANCH: "main", WORKERS_CI_COMMIT_SHA: sha };
  const built = { ci: true, branch: "main", production: true, commit: sha, realtimeHost: "rt.sinversegames.com" };

  test("cloudflare:deploy runs the deploy gate before OpenNext's deploy", () => {
    expect(rootPkg.scripts["cloudflare:deploy"]).toBe("pnpm --filter @platform/web cf:production:deploy");
    expect(appPkg.scripts["cf:production:deploy"].split(/\s*&&\s*/)).toEqual([
      "node scripts/cloudflare-check.mjs deploy",
      "opennextjs-cloudflare deploy --config wrangler.jsonc",
    ]);
    expect(appPkg.scripts["cf:deploy"]).toBe("pnpm run cf:build && pnpm run cf:production:deploy");
    expect(appPkg.scripts["cf:build"].split(/\s*&&\s*/).at(-1)).toBe("node scripts/cloudflare-build-env.mjs record");
  });
  test("every approved Wrangler or OpenNext command names its config, so the root redirect never applies", () => {
    for (const [name, script] of Object.entries(appPkg.scripts as Record<string, string>))
      for (const step of script.split(/\s*&&\s*/))
        if (/^(?:wrangler|opennextjs-cloudflare) /.test(step)) expect(step, name).toMatch(/ --config wrangler\.jsonc\b/);
  });
  test("the production deploy refuses other branches, foreign artifacts and missing records", async () => {
    const { checkProductionDeploy } = await load("../scripts/cloudflare-build-env.mjs");
    expect(checkProductionDeploy(main, built)).toEqual([]);
    expect(() => checkProductionDeploy({ ...main, WORKERS_CI_BRANCH: "feature/x" }, built)).toThrow(/Only "main"/);
    expect(() => checkProductionDeploy({ ...main, WORKERS_CI_BRANCH: "" }, built)).toThrow(/Only "main"/);
    expect(() => checkProductionDeploy(main, null)).toThrow(/pnpm cloudflare:build/);
    expect(() => checkProductionDeploy(main, { ...built, production: false, branch: "feature/x" })).toThrow(/not built as a production/);
    expect(() => checkProductionDeploy(main, { ...built, commit: "b".repeat(40) })).toThrow(/different commit/);
    expect(() => checkProductionDeploy({}, { ...built, production: false })).toThrow(/non-production Workers Builds artifact/);
    // A local owner deploy of a local build is allowed; a missing realtime URL only warns.
    const local = { ci: false, branch: null, production: null, commit: null, realtimeHost: null };
    expect(checkProductionDeploy({}, local)).toEqual([expect.stringMatching(/NEXT_PUBLIC_REALTIME_URL/)]);
  });
  test("bare root Wrangler commands are blocked except on a known Workers Builds Preview branch", async () => {
    const { redirectFiles, BLOCKED_ENTRY } = await load("../scripts/cloudflare-build-env.mjs");
    expect(redirectFiles({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "feature/x" })).toBeNull();
    for (const env of [{}, main, { WORKERS_CI: "1", WORKERS_CI_BRANCH: "" }]) {
      const files = redirectFiles(env);
      expect(files["config.json"]).toEqual({ configPath: "./bare-wrangler-blocked.json" });
      expect(files["bare-wrangler-blocked.json"]).toMatchObject({ name: "sinversegames", main: `./${BLOCKED_ENTRY}` });
      expect(files["bare-wrangler-blocked.json"]).not.toHaveProperty("routes");
    }
  });
  test("Preview packaging drops production routes; production packaging keeps them", async () => {
    const { previewPackagingConfig, validateProduction } = await load("../scripts/cloudflare-check.mjs");
    const app = { ...read(new URL("../wrangler.jsonc", import.meta.url)) };
    expect(() => validateProduction(app)).not.toThrow();
    const preview = previewPackagingConfig(app);
    expect(preview).toMatchObject({ name: "sinversegames", routes: [], workers_dev: false });
    expect(JSON.stringify(preview)).not.toContain("sinversegames.com");
  });
});
