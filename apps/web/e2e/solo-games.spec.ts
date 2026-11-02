import { expect, test, type Page } from "@playwright/test";
import { enterName, expectNoHorizontalOverflow, newPlayer } from "./helpers";

async function openSolo(page: Page, slug: string, name: string) {
  await page.goto(`/play/${slug}`);
  await enterName(page, name);
  await expect(page.getByTestId("start-run")).toBeVisible();
}

async function expectVerifiedResult(page: Page) {
  await expect(page.getByTestId("solo-results")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("score-verified")).toBeVisible();
  return Number((await page.getByTestId("final-score").textContent())!.replace(/[^\d]/g, ""));
}

test("Kitchen Rush: the tutorial level can be played to a verified, saved score", async ({ browser }) => {
  test.setTimeout(180_000);
  const { page } = await newPlayer(browser, "Chef");
  await openSolo(page, "kitchen-rush", "Chef Kim");
  await page.getByTestId("level-1").click();
  await page.getByTestId("start-run").click();
  await expect(page.getByTestId("kitchen-rush")).toBeVisible();

  // Follow the on-screen tutorial, exactly as a new player would.
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline && !(await page.getByTestId("solo-results").isVisible())) {
    const target = await page.getByTestId("kr-hint").getAttribute("data-hint-target").catch(() => null);
    if (target) await page.locator(`[data-target="${target}"]`).click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(250);
  }
  const score = await expectVerifiedResult(page);
  expect(score).toBeGreaterThan(0);
  await expect(page.getByTestId("solo-results")).toContainText("complete");
  await expect(page.getByTestId("next-run")).toContainText("Level 2");

  // The score is on the leaderboard and in the profile.
  await page.goto("/leaderboard?game=kitchen-rush&by=today");
  await expect(page.getByTestId("leaderboard-table")).toContainText("Chef Kim");
  await page.goto("/profile");
  await expect(page.getByText("Kitchen Rush").first()).toBeVisible();
  await expect(page.getByText(/Solo · Level 1/)).toBeVisible();
});

test("solo scores are computed by the server: forged logs, replays and stolen runs are rejected", async ({ browser }) => {
  const { page, context } = await newPlayer(browser, "Cheat");
  await openSolo(page, "cascade-solitaire", "Sly");
  const start = await page.request.post("/api/solo/start", { data: { gameId: "cascade-solitaire", config: { draw: 1 } }, headers: { origin: "http://localhost:3200" } });
  expect(start.ok()).toBe(true);
  const run = await start.json();

  const submit = (log: unknown, token = run.token, req = page.request, extra = {}) =>
    req.post("/api/solo/submit", { data: { token, log, ...extra }, headers: { origin: "http://localhost:3200" } });

  // A log with an impossible move is rejected outright.
  expect((await submit([{ k: "move", from: "w", to: "f0", n: 1, t: 100 }])).status()).toBe(422);
  // Claiming more game time than has passed is rejected.
  expect((await submit([{ k: "draw", t: 3_600_000 }])).status()).toBe(422);
  // A valid log is accepted once; a score sent by the client is ignored.
  const ok = await submit([{ k: "draw", t: 500 }, { k: "draw", t: 900 }], run.token, page.request, { score: 999_999 });
  expect(ok.status()).toBe(200);
  expect((await ok.json()).score).toBeLessThan(1000);
  expect((await submit([{ k: "draw", t: 500 }])).status()).toBe(409);

  // Another player can't submit this player's run.
  const other = await newPlayer(browser, "Other");
  await openSolo(other.page, "cascade-solitaire", "Ollie");
  expect((await submit([{ k: "draw", t: 500 }], run.token, other.page.request)).status()).toBe(403);
  await context.close();
});

test("Cascade Solitaire: draw, move with hints, undo and bank a verified score", async ({ browser }) => {
  const { page } = await newPlayer(browser, "Sol");
  await openSolo(page, "cascade-solitaire", "Patience");
  await page.getByRole("radio", { name: /Draw 1/ }).click();
  await page.getByTestId("start-run").click();
  await expect(page.getByTestId("cascade-solitaire")).toBeVisible();

  await page.getByTestId("stock").click();
  await expect(page.getByTestId("waste-top")).toBeVisible();
  await expect(page.getByTestId("sol-moves")).toContainText("1 moves");
  await page.getByTestId("sol-undo").click();
  await expect(page.getByTestId("sol-moves")).toContainText("0 moves");

  // Make progress: draw through the stock, playing any card that has a legal home.
  for (let i = 0; i < 40; i++) {
    const top = page.getByTestId("waste-top");
    if (await top.isVisible()) await top.click();
    await page.getByTestId("stock").click();
  }
  const moves = Number((await page.getByTestId("sol-moves").textContent())!.replace(/\D/g, ""));
  expect(moves).toBeGreaterThan(20);

  await page.getByTestId("sol-end").click();
  await expectVerifiedResult(page);
  await expect(page.getByTestId("solo-results")).toContainText("Personal best");
});

test("Mahjong Garden: clear a whole board with hints and get a verified win", async ({ browser }) => {
  test.setTimeout(150_000);
  const { page } = await newPlayer(browser, "Mj");
  await openSolo(page, "mahjong-garden", "Lotus");
  await page.getByTestId("layout-pebble").click();
  await page.getByTestId("start-run").click();
  await expect(page.getByTestId("mahjong-garden")).toBeVisible();

  // A blocked tile can't be selected.
  const blocked = page.locator('[data-testid^="tile-"][data-free="false"]').first();
  await blocked.click();
  await expect(blocked).toHaveAttribute("aria-pressed", "false");

  const tiles = page.locator('[data-testid^="tile-"]');
  for (let i = 0; i < 40 && !(await page.getByTestId("solo-results").isVisible()); i++) {
    if ((await tiles.count()) === 0) break; // cleared; the results screen follows
    if (await page.getByTestId("mj-stuck").isVisible()) {
      await page.getByTestId("mj-stuck").getByRole("button", { name: "Shuffle" }).click();
      continue;
    }
    await page.getByTestId("mj-hint").click();
    const pair = page.locator('[data-testid^="tile-"][data-hinted="true"]');
    await expect(pair).toHaveCount(2);
    await pair.nth(0).click();
    await pair.nth(1).click();
    await page.waitForTimeout(150);
  }
  const score = await expectVerifiedResult(page);
  await expect(page.getByTestId("solo-results")).toContainText("Garden cleared");
  expect(score).toBeGreaterThan(0);
});

test("single-player games fit a phone screen", async ({ browser }) => {
  const { page } = await newPlayer(browser, "Phone", { width: 375, height: 740 });
  await openSolo(page, "kitchen-rush", "Pocket");
  for (const slug of ["kitchen-rush", "cascade-solitaire", "mahjong-garden"]) {
    await page.goto(`/play/${slug}`);
    await page.getByTestId("start-run").click();
    await expect(page.getByTestId(slug)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});
