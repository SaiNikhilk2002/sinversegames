import { expect, test, type Browser, type Page } from "@playwright/test";
import { createPrivateRoom, expectNoHorizontalOverflow, joinByInvite, newPlayer } from "./helpers";

async function startRoom(browser: Browser, slug: string, settings: string[], viewport?: { width: number; height: number }) {
  const a = await newPlayer(browser, "Ava", viewport);
  const b = await newPlayer(browser, "Ben");
  const code = await createPrivateRoom(a.page, slug, a.name);
  for (const label of settings) await a.page.getByRole("radio", { name: label, exact: true }).click();
  await joinByInvite(b.page, code, b.name);
  await b.page.getByRole("button", { name: "I'm ready" }).click();
  await a.page.getByRole("button", { name: "Start game" }).click();
  await expect(a.page.getByTestId(slug)).toBeVisible();
  await expect(b.page.getByTestId(slug)).toBeVisible();
  return { a, b, code };
}

/** Rolls or moves if it's this page's turn. */
async function trailStep(page: Page): Promise<boolean> {
  const roll = page.getByTestId("roll-button");
  if (await roll.isEnabled().catch(() => false)) {
    await roll.click({ timeout: 2000 }).catch(() => {});
    return true;
  }
  const token = page.locator('[data-testid^="move-token-"]').first();
  if (await token.isVisible().catch(() => false)) {
    await token.click({ timeout: 2000, force: true }).catch(() => {});
    return true;
  }
  return false;
}

test("Token Trail: two players race a full game in a private room", async ({ browser }) => {
  test.setTimeout(240_000);
  const { a, b } = await startRoom(browser, "token-trail", ["1 · Sprint", "Off"]);
  await expect(a.page.getByLabel("Token Trail board")).toBeVisible();

  const deadline = Date.now() + 220_000;
  while (Date.now() < deadline) {
    const [ra, rb] = await Promise.all([a.page.getByTestId("results").isVisible(), b.page.getByTestId("results").isVisible()]);
    if (ra && rb) break;
    const acted = (await trailStep(a.page)) || (await trailStep(b.page));
    if (!acted) await a.page.waitForTimeout(150);
  }
  await expect(a.page.getByTestId("results")).toBeVisible();
  await expect(b.page.getByTestId("results")).toBeVisible();
  await expect(a.page.getByTestId("results")).toContainText(/wins!|You win/);
});

test("Bumper Blitz: steer with the keyboard, play a timed match and see results", async ({ browser }) => {
  test.setTimeout(90_000);
  const { a, b } = await startRoom(browser, "bumper-blitz", ["30s"]);
  await expect(a.page.getByTestId("arena-countdown")).toBeVisible();
  await expect(a.page.getByTestId("arena-countdown")).toBeHidden({ timeout: 6000 });
  const before = await a.page.getByTestId("arena-timer").textContent();
  await a.page.keyboard.down("KeyW");
  await b.page.keyboard.down("KeyS");
  await a.page.waitForTimeout(1500);
  await a.page.keyboard.press("Space");
  await a.page.keyboard.up("KeyW");
  await b.page.keyboard.up("KeyS");
  expect(await a.page.getByTestId("arena-timer").textContent()).not.toBe(before);
  await expect(a.page.getByTestId("arena-scores")).toContainText("You");
  await expect(a.page.getByTestId("results")).toBeVisible({ timeout: 40_000 });
  await expect(b.page.getByTestId("results")).toBeVisible();
});

test("new multiplayer games fit a phone screen", async ({ browser }) => {
  test.setTimeout(90_000);
  const { a } = await startRoom(browser, "token-trail", [], { width: 375, height: 740 });
  await expectNoHorizontalOverflow(a.page);
  const arena = await startRoom(browser, "bumper-blitz", [], { width: 375, height: 740 });
  await expectNoHorizontalOverflow(arena.a.page);
});
