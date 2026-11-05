import { expect, test, type Page } from "@playwright/test";
import { expectJson, readJson } from "../src/lib/read-json";
import { enterName } from "./helpers";

// A broken backend must produce a readable message, never a parser error on screen.
const PARSER_ERROR = /Unexpected (end|token)|JSON/i;
const BROKEN_BODIES: [string, { status: number; body: string; contentType?: string }][] = [
  ["an empty 500", { status: 500, body: "" }],
  ["an HTML error page", { status: 500, body: "<!doctype html><h1>Error</h1>", contentType: "text/html" }],
  ["truncated JSON", { status: 200, body: '{"available":tr', contentType: "application/json" }],
  ["an empty 200", { status: 200, body: "" }],
];

test.describe("reading unreliable API responses", () => {
  const respond = (body: string, status = 200) => new Response(status === 204 ? null : body, { status });

  test("readJson never throws, and returns only objects", async () => {
    expect(await readJson(respond(""))).toEqual({});
    expect(await readJson(respond("<html>"))).toEqual({});
    expect(await readJson(respond('{"a":'))).toEqual({});
    expect(await readJson(respond("[1,2]"))).toEqual({});
    expect(await readJson(respond("null"))).toEqual({});
    expect(await readJson(respond("7"))).toEqual({});
    expect(await readJson(respond('{"a":1}'))).toEqual({ a: 1 });
  });
  test("expectJson gives the server's message, or the fallback, and never a parser error", async () => {
    await expect(expectJson(respond("", 500), "Fallback.")).rejects.toThrow("Fallback.");
    await expect(expectJson(respond("<html>", 502), "Fallback.")).rejects.toThrow("Fallback.");
    await expect(expectJson(respond("", 200), "Fallback.")).rejects.toThrow("Fallback.");
    await expect(expectJson(respond('{"error":"Sessions are down."}', 503), "Fallback.")).rejects.toThrow("Sessions are down.");
    await expect(expectJson(respond('{"error":42}', 503), "Fallback.")).rejects.toThrow("Fallback.");
    expect(await expectJson(respond('{"a":1}'), "Fallback.")).toEqual({ a: 1 });
  });
});

async function enter(page: Page, path: string, errors: string[]) {
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(path);
  await enterName(page, "Backend Errors");
}

test.describe("broken backend responses in the real pages", () => {
  for (const [name, fulfil] of BROKEN_BODIES) {
    test(`Cuisine Quest campaign survives ${name} and can retry`, async ({ page }) => {
      const errors: string[] = [];
      let broken = true;
      await page.route("**/api/cuisine-quest/campaign", (route) => (broken ? route.fulfill(fulfil) : route.continue()));
      await enter(page, "/play/cuisine-quest", errors);
      const alert = page.getByTestId("cq-campaign").getByRole("alert");
      await expect(alert).toContainText("Campaign saving is unavailable.");
      await expect(alert).not.toContainText(PARSER_ERROR);
      // The real backend comes back: Retry recovers without a reload.
      broken = false;
      await page.getByRole("button", { name: "Retry campaign", exact: true }).click();
      await expect(alert).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }

  test("starting a solo game shows a readable message when the backend answers with nothing", async ({ page }) => {
    const errors: string[] = [];
    await page.route("**/api/solo/start", (route) => route.fulfill({ status: 500, body: "" }));
    await enter(page, "/play/cascade-solitaire", errors);
    await page.getByTestId("start-run").click();
    await expect(page.getByText("Couldn't start the game", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(PARSER_ERROR)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("the setup page survives a JSON error from personal bests", async ({ page }) => {
    const errors: string[] = [];
    await page.route("**/api/solo/best**", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Player sessions are temporarily unavailable. Please retry."}' }),
    );
    await enter(page, "/play/cascade-solitaire", errors);
    await expect(page.getByTestId("start-run")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("the wallet shows a readable message when the backend answers with nothing", async ({ page }) => {
    const errors: string[] = [];
    await page.route("**/api/wallet**", (route) => route.fulfill({ status: 500, body: "" }));
    await enter(page, "/play/cascade-solitaire", errors);
    await page.goto("/profile");
    await expect(page.getByText("Your wallet is unavailable.", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(PARSER_ERROR)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("a failed realtime token does not crash a page, and is requested again", async ({ page }) => {
    const errors: string[] = [];
    let requests = 0;
    await page.route("**/api/session/token", (route) => {
      requests++;
      return route.fulfill({ status: 500, body: "" });
    });
    await enter(page, "/play/color-clash", errors);
    await expect.poll(() => requests, { timeout: 20000 }).toBeGreaterThanOrEqual(2);
    await expect(page.getByText("Connected", { exact: true })).toHaveCount(0);
    await expect(page.getByText(PARSER_ERROR)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
