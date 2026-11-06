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
