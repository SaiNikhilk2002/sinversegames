import { expect, test, type Page } from "@playwright/test";
import { INTERNATIONAL_TEAMS } from "@platform/engines/sinverse-cricket";

/**
 * International cricket end to end, through the real UI and the real server:
 * the format and team choice, the playing XI, a T20 played partly by hand and
 * partly simulated, server verification and saving, refresh recovery of an
 * ODI, and the setup at phone width. The engine rules themselves are covered
 * by packages/engines/test/cricket-format*.test.ts.
 */
async function join(page: Page, name: string) {
  await page.goto("/play/sinverse-cricket");
  const field = page.getByLabel("Display name"),
    start = page.getByTestId("start-run");
  await expect(field.or(start)).toBeVisible({ timeout: 30000 });
  if (await field.isVisible()) {
    await field.fill(name);
    await page.getByRole("button", { name: /let's play|create profile/i }).click();
  }
  await expect(start).toBeVisible();
}
async function toMiddle(page: Page) {
  const root = page.getByTestId("sinverse-cricket");
  await expect(root).toBeVisible();
  await root.focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Heads", exact: true }).click({ timeout: 30000 });
  const bat = page.getByRole("button", { name: "Bat first", exact: true }),
    cont = page.getByRole("button", { name: "Continue to the middle", exact: true });
  await expect(bat.or(cont)).toBeVisible({ timeout: 20000 });
  if (await bat.isVisible()) await bat.click();
  else await cont.click();
  await expect(root).toHaveAttribute("data-ceremony", "done", { timeout: 20000 });
  return root;
}

test("all 20 teams are selectable, and the chosen XI is validated before a match", async ({ page }) => {
  await join(page, "Teams QA");
  await page.locator('[data-format="t20"]').click();
  const setup = page.getByTestId("international-setup");
  await expect(setup).toBeVisible();
  const cards = setup.locator(".cr-team-card");
  await expect(cards).toHaveCount(20);
  for (const t of INTERNATIONAL_TEAMS) await expect(setup.locator(`[data-team="${t.id}"]`)).toContainText(t.name);
  // Keyboard: focus a team and choose it with Enter; then the opposition.
  await setup.locator('[data-team="nepal"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("your-team")).toHaveText("Nepal");
  await setup.locator('[data-team="scotland"]').click();
  await expect(page.getByTestId("opposition-team")).toHaveText("Scotland");
  // A side can't play itself.
  await expect(setup.locator('[data-team="nepal"]')).toBeDisabled();
  await page.getByRole("button", { name: /Pick your XI/ }).click();
  const xi = setup.locator(".cr-xi").first().locator("li");
  await expect(xi).toHaveCount(11);
  // Dropping a player leaves ten: the match can't be set up until the eleven is complete.
  await xi.nth(3).getByRole("button", { name: /^Drop/ }).click();
  await expect(page.getByTestId("xi-status")).toContainText("exactly 11");
  await expect(page.getByRole("button", { name: /Match settings/ })).toBeDisabled();
  // Bringing in a reserve batter completes the eleven again.
  await setup.locator(".cr-bench li", { hasText: "Batter" }).first().getByRole("button", { name: /^Pick/ }).click();
  await expect(page.getByTestId("xi-status")).toContainText("Eleven picked");
  await page.getByRole("button", { name: "Reset to default XI" }).click();
  await expect(page.getByTestId("xi-status")).toContainText("Eleven picked");
  await page.getByRole("button", { name: /Match settings/ }).click();
  await expect(page.getByTestId("start-international")).toBeEnabled();
  await expect(setup.getByLabel("Playing conditions")).toContainText("At most 4 overs each");
  // The Test format is shown, honestly, as not playable yet.
  await expect(page.getByRole("radio", { name: /Test/ })).toBeDisabled();
});

test("a T20 between two chosen teams plays, simulates, verifies and saves with its own scorecard", async ({ page }) => {
  test.setTimeout(240_000);
  await join(page, "T20 QA");
  await page.locator('[data-format="t20"]').click();
  const setup = page.getByTestId("international-setup");
  await setup.locator('[data-team="sri-lanka"]').click();
  await setup.locator('[data-team="ireland"]').click();
  await page.getByRole("button", { name: /Pick your XI/ }).click();
  // Promote the No. 4 to open: the batting order is the player's.
  const fourth = setup.locator(".cr-xi").first().locator("li").nth(3);
  const opener = await fourth.getAttribute("data-player");
  for (let k = 0; k < 3; k++) await setup.locator(`.cr-xi li[data-player="${opener}"]`).getByRole("button", { name: /up the order/ }).click();
  await page.getByRole("button", { name: /Match settings/ }).click();
  await page.getByTestId("start-international").click();
  const root = await toMiddle(page);
  await expect(root).toHaveAttribute("data-format", "t20");
  await expect(root).toHaveAttribute("data-sides", "sri-lanka|ireland");
  // Two deliveries played by hand, then simulate.
  for (let k = 0; k < 2; k++) {
    await expect(page.getByTestId("cricket-primary")).toBeEnabled({ timeout: 30000 });
    await page.getByTestId("cricket-primary").click();
    await page.waitForTimeout(700);
    await page.getByTestId("cricket-primary").click().catch(() => {});
    await expect(root).toHaveAttribute("data-controlled", String(k + 1), { timeout: 30000 });
  }
  const save = page.getByTestId("cricket-save");
  for (let k = 0; k < 40 && !(await save.isVisible()); k++) {
    const begin = page.getByRole("button", { name: "Begin the chase" });
    if (await begin.isVisible()) await begin.click();
    const sim = page.getByTestId("cricket-sim-innings");
    if ((await sim.isVisible()) && (await sim.isEnabled())) await sim.click();
    await page.waitForTimeout(1500);
  }
  await expect(save).toBeVisible({ timeout: 30000 });
  const innings = (await root.getAttribute("data-innings"))!.split(" ");
  expect(innings).toHaveLength(2);
  for (const i of innings) expect(Number(i.split(":")[2])).toBeLessThanOrEqual(120);
  await save.click();
  await expect(page.getByTestId("score-verified")).toBeVisible({ timeout: 30000 });
  const results = page.getByTestId("solo-results");
  await expect(results).toContainText("T20 ·");
  await expect(results).toContainText("Sri Lanka");
  await expect(results).toContainText("Ireland");
  await expect(results).toContainText("you played 2 balls");
  // The player's own opener walked out first.
  const name = INTERNATIONAL_TEAMS.find((t) => t.id === "sri-lanka")!.squad.find((p) => p.id === opener)!.name;
  const slTable = results.locator(".cr-scorecards section", { hasText: "Sri Lanka" }).first();
  await expect(slTable.locator("tbody tr").first()).toContainText(name);
});

test("an unfinished ODI survives a refresh and carries on from the same ball", async ({ page }) => {
  test.setTimeout(180_000);
  await join(page, "ODI QA");
  await page.locator('[data-format="odi"]').click();
  await page.getByRole("button", { name: /Pick your XI/ }).click();
  await page.getByRole("button", { name: /Match settings/ }).click();
  await page.getByTestId("start-international").click();
  const root = await toMiddle(page);
  await expect(root).toHaveAttribute("data-format", "odi");
  for (let k = 0; k < 3; k++) {
    await page.getByTestId("cricket-sim-over").click();
    await expect(root).toHaveAttribute("data-simulated", /^[1-9]/);
    await page.waitForTimeout(600);
  }
  const before = await root.getAttribute("data-innings"),
    seq = await root.getAttribute("data-seq");
  await page.reload();
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root).toHaveAttribute("data-innings", before!);
  await expect(root).toHaveAttribute("data-seq", seq!);
  await expect(root).toHaveAttribute("data-ceremony", "done");
  await page.getByTestId("cricket-sim-over").click();
  await expect(root).not.toHaveAttribute("data-seq", seq!);
});

test("the international setup fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await join(page, "Phone QA");
  await page.locator('[data-format="t20"]').click();
  const width = () => page.evaluate(() => document.documentElement.scrollWidth);
  expect(await width()).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: /Pick your XI/ }).click();
  expect(await width()).toBeLessThanOrEqual(390);
  const row = page.locator(".cr-xi li").first();
  const box = (await row.getByRole("button", { name: /^Drop/ }).boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(36);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: /Match settings/ }).click();
  expect(await width()).toBeLessThanOrEqual(390);
  await expect(page.getByTestId("start-international")).toBeInViewport({ ratio: 0.5 }).catch(async () => {
    await page.getByTestId("start-international").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("start-international")).toBeInViewport();
  });
});
