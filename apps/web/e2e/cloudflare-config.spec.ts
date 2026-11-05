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
});
