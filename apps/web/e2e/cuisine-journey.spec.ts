import { expect, test, type Page } from "@playwright/test";
import { enterName } from "./helpers";

/** Chef's Journey surfaces: rank, seals, mastery and the score story, from a real saved shift. */
const EVIDENCE = process.env.CQ_EVIDENCE_DIR;
const shot = async (page: Page, name: string) => { if (EVIDENCE) await page.screenshot({ path: `${EVIDENCE}/${name}.png`, fullPage: true }); };

async function playShift(page: Page) {
  await expect(page.getByTestId("cuisine-quest")).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByTestId("cq-tutorial-next").click();
  const until = Date.now() + 230_000;
  while (Date.now() < until && !(await page.getByTestId("solo-results").isVisible())) {
    const waiting = page.locator('.cq-ticket[data-status="waiting"]');
    if (!await waiting.count()) { await page.waitForTimeout(100); continue; }
    if (!await page.locator('.cq-ticket-selected[data-status="waiting"]').count()) await waiting.first().click();
    const guide = page.getByTestId("cq-guide");
    const action = await guide.getAttribute("data-next-action");
    if (action === "ingredient") await page.getByTestId(`cq-ingredient-${await guide.getAttribute("data-next-ingredient")}`).click();
    else if (action === "begin") await page.getByTestId("cq-begin").click();
    else if (action === "gesture") { await page.getByTestId("cq-follow-marker").click(); await page.waitForTimeout(155); }
    else if (action === "heat") await page.getByRole("button", { name: `Heat ${await guide.getAttribute("data-next-heat")}`, exact: true }).click();
    else if (action === "flip") await page.getByTestId("cq-flip").click();
    else if (action === "stir") await page.getByTestId("cq-stir").click();
    else if (action === "lift") await page.getByTestId("cq-lift").click();
    else if (action === "serve") {
      await page.getByRole("button", { name: `Finish: ${await guide.getAttribute("data-next-garnish")}`, exact: true }).click();
      await page.getByTestId("cq-serve").click();
    } else await page.waitForTimeout(100);
  }
  await expect(page.getByTestId("solo-results")).toBeVisible();
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

test.describe("Cuisine Quest: Chef's Journey", () => {
  test("a real shift earns rank, seals and mastery, shown in every place they appear", async ({ page }) => {
    test.setTimeout(420_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/play/cuisine-quest"); await enterName(page, "SealChef");

    // A new chef starts at the bottom with everything visibly still to earn.
    await expect(page.getByTestId("cq-chef-rank")).toContainText("Commis Chef");
    await expect(page.getByTestId("cq-chef-rank")).toContainText("3 more stars to Line Cook");
    await expect(page.getByTestId("cq-chef-rank")).toContainText("0/21 chef's seals");
    const challenges = page.getByTestId("cq-challenges");
    await expect(challenges.locator("li")).toHaveCount(3);
    await expect(challenges.locator('li[data-done="true"]')).toHaveCount(0);
    await expect(challenges).toContainText("within 1:50");
    await expect(page.locator(".cq-mastery")).toHaveCount(0);
    await shot(page, "01-map-new-chef-desktop");

    await page.getByTestId("start-run").click();
    await playShift(page);

    // The result explains the score, plate by plate.
    await expect(page.getByTestId("score-verified")).toContainText("saved");
    await expect(page.getByTestId("cq-verified-details")).toContainText("3/3 stars");
    const breakdown = page.getByTestId("cq-score-breakdown");
    await expect(breakdown.locator("li")).toHaveCount(4);
    const parts = await breakdown.locator("li strong").evaluateAll(cells => cells.map(cell => Number(cell.firstChild!.textContent!.replaceAll(",", ""))));
    const final = Number((await page.getByTestId("final-score").textContent())!.replaceAll(",", ""));
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(final);
    await expect(page.getByTestId("cq-plate-list").locator("li")).toHaveCount(7);
    await expect(page.getByTestId("cq-run-seals").locator("li")).toHaveCount(3);
    await expect(page.getByTestId("cq-run-seals").locator('li[data-seal="spotless"]')).toHaveAttribute("data-done", "true");
    await expect(page.getByTestId("cq-run-seals").locator('li[data-seal="swift"]')).toHaveAttribute("data-done", /true|false/);
    await shot(page, "02-result-desktop");
    const earnedSeals = await page.getByTestId("cq-run-seals").locator('li[data-done="true"]').count();
    expect(earnedSeals).toBeGreaterThanOrEqual(1);

    await page.setViewportSize({ width: 320, height: 640 });
    await noSideScroll(page);
    await shot(page, "03-result-320");
    await page.setViewportSize({ width: 1280, height: 720 });

    // The map remembers them, from the server.
    await page.getByRole("button", { name: "Campaign map", exact: true }).click();
    await expect(page.getByTestId("cq-total-stars")).toHaveText("3 / 21");
    await expect(page.getByTestId("cq-level-2")).toBeEnabled();
    await expect(page.getByTestId("cq-chef-rank")).toContainText("Line Cook");
    await expect(page.getByTestId("cq-chef-rank")).toContainText("4 more stars to Sous Chef");
    await expect(page.getByTestId("cq-chef-rank")).toContainText(`${earnedSeals}/21 chef's seals`);

    await page.getByTestId("cq-level-1").click();
    await expect(page.getByTestId("cq-challenges").locator('li[data-done="true"]')).toHaveCount(earnedSeals);
    await expect(page.locator(".cq-menu-preview .cq-mastery").first()).toBeVisible();
    await shot(page, "04-map-after-shift-desktop");

    await page.getByTestId("cq-level-2").click();
    await expect(page.getByTestId("cq-challenges").locator('li[data-done="true"]')).toHaveCount(0);

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 700 });
      await noSideScroll(page);
    }
    await page.getByTestId("cq-level-1").click();
    await shot(page, "05-map-after-shift-320");
    await page.setViewportSize({ width: 1280, height: 720 });

    // A full reload proves none of this was held in the browser.
    await page.reload();
    await expect(page.getByTestId("cq-chef-rank")).toContainText("Line Cook");
    await expect(page.getByTestId("cq-chef-rank")).toContainText(`${earnedSeals}/21 chef's seals`);

    await page.goto("/profile");
    await expect(page.getByTestId("cq-profile-rank")).toHaveText("Line Cook");
    await expect(page.getByTestId("cq-profile-progress")).toContainText("1/7 cuisines · 3/21 stars · 1 mastered");
    expect(errors).toEqual([]);
  });

  test("the campaign still works when replay goals can't be loaded", async ({ page }) => {
    await page.route("**/api/cuisine-quest/campaign", async route => {
      const response = await route.fetch(); const body = await response.json();
      await route.fulfill({ response, json: { ...body, journey: null } });
    });
    await page.goto("/play/cuisine-quest"); await enterName(page, "NoJourney");
    await expect(page.getByTestId("cq-chef-rank")).toContainText("Commis Chef");
    await expect(page.getByTestId("cq-chef-rank")).not.toContainText("seals");
    await expect(page.getByTestId("cq-challenges")).toHaveCount(0);
    await expect(page.getByTestId("start-run")).toBeEnabled();
  });

  test("a run saved before these details existed still shows a clean result", async ({ page }) => {
    await page.goto("/play/cuisine-quest"); await enterName(page, "OldRun");
    await page.route("**/api/solo/submit", route => route.fulfill({ json: { score: 9000, completed: true, saved: true, earnedCoins: 0, unlocked: [], best: null, details: { level: 1, cuisine: "indian", stars: 3, served: 7, wanted: 7, missed: 0, mistakes: 0, burnt: 0, perfect: 7, precision: 100, satisfaction: 98, durationMs: 90000, cuisinesCompleted: 1, totalStars: 3 } } }));
    await page.getByTestId("start-run").click();
    await playShift(page);
    await expect(page.getByTestId("cq-verified-details")).toContainText("3/3 stars");
    await expect(page.getByTestId("cq-score-breakdown")).toHaveCount(0);
    await expect(page.getByTestId("cq-plate-list")).toHaveCount(0);
    await expect(page.getByTestId("cq-run-seals").locator("li")).toHaveCount(3);
  });
});
