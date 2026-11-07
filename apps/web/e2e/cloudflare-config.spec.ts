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
  });
});
