import { expect, test, type Page } from "@playwright/test";
import { internationalTeam, xiProfile } from "@platform/engines/sinverse-cricket";

/**
 * Release-candidate checks for international cricket, through the real UI and
 * server (see docs/CRICKET_RELEASE_READINESS_REPORT.md): the XI rules the
 * engine enforces, the two elevens' comparison, the innings break (also across
 * a refresh), the result's awards and the player's own part, the saved
 * scorebook, and gameplay at phone width.
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
async function simulateUntil(page: Page, done: () => Promise<boolean>) {
  for (let k = 0; k < 40 && !(await done()); k++) {
    const sim = page.getByTestId("cricket-sim-innings");
    if ((await sim.isVisible()) && (await sim.isEnabled())) await sim.click();
    await page.waitForTimeout(700);
  }
}
const width = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

test("the XI the engine will accept: a bowling keeper is refused, and the comparison follows the chosen eleven", async ({ page }) => {
  await join(page, "XI rules QA");
  await page.locator('[data-format="t20"]').click();
  const setup = page.getByTestId("international-setup");
  await setup.locator('[data-team="pakistan"]').click();
  await setup.locator('[data-team="england"]').click();
  const comparison = page.getByTestId("team-comparison");
  await expect(comparison).toContainText("Pakistan · your XI");
  await expect(comparison).toContainText("England");
  const pakistan = internationalTeam("pakistan")!;
  const bowling = comparison.getByRole("img", { name: /^bowling:/ });
  await expect(bowling).toHaveAttribute("aria-label", `bowling: Pakistan ${xiProfile(pakistan, pakistan).bowling}, England ${internationalTeam("england")!.ratings.bowling}`);
  await page.getByRole("button", { name: /Pick your XI/ }).click();
  // Make a bowler the wicketkeeper: four bowlers can't bowl 20 overs at four each.
  const rows = setup.locator(".cr-xi").first().locator("li");
  const bowler = rows.filter({ hasText: /Pace bowler|Spin bowler/ }).first(),
    id = (await bowler.getAttribute("data-player"))!;
  await bowler.getByRole("button", { name: /wicketkeeper/ }).click();
  await expect(page.getByTestId("xi-status")).toContainText("The wicketkeeper can't bowl");
  await expect(page.getByRole("button", { name: /Match settings/ })).toBeDisabled();
  // The comparison is of the eleven as picked: the keeper no longer counts as a bowler.
  await expect(bowling).toHaveAttribute("aria-label", new RegExp(`^bowling: Pakistan ${xiProfile(pakistan, { xi: pakistan.xi, keeper: id }).bowling},`));
  await page.getByRole("button", { name: "Reset to default XI" }).click();
  await expect(page.getByTestId("xi-status")).toContainText("5 bowling options besides the keeper");
  await expect(bowling).toHaveAttribute("aria-label", new RegExp(`^bowling: Pakistan ${pakistan.ratings.bowling},`));
  // The last step lists exactly the eleven that will play, captain and keeper marked.
  await page.getByRole("button", { name: /Match settings/ }).click();
  const summary = page.getByTestId("your-xi-summary");
  await expect(summary.locator("li")).toHaveCount(11);
  await expect(summary).toContainText("(c)");
  await expect(summary).toContainText("†");
  await expect(page.getByTestId("start-international")).toBeEnabled();
});

test("a T20 through the innings break (and a refresh at it), the result's awards and the saved scorebook", async ({ page }) => {
  test.setTimeout(300_000);
  await join(page, "Break QA");
  await page.locator('[data-format="t20"]').click();
  const setup = page.getByTestId("international-setup");
  await setup.locator('[data-team="west-indies"]').click();
  await setup.locator('[data-team="afghanistan"]').click();
  await page.getByRole("button", { name: /Pick your XI/ }).click();
  await page.getByRole("button", { name: /Match settings/ }).click();
  await page.getByTestId("start-international").click();
  const root = await toMiddle(page);
  const brk = page.getByTestId("cricket-innings-break");
  await simulateUntil(page, () => brk.isVisible());
  await expect(brk).toBeVisible();
  // The break waits for the player, and its target is the first innings plus one.
  const first = (await root.getAttribute("data-innings"))!.split(" ")[0]!;
  const runs = Number(first.split(":")[1]!.split("/")[0]);
  await expect(page.getByTestId("cricket-target")).toContainText(`need ${runs + 1} from 120 balls`);
  await expect(brk).toContainText("Top score");
  await expect(brk).toContainText("Best bowling");
  await expect(brk).toContainText("Fall of wickets");
  await page.waitForTimeout(4000);
  await expect(brk).toBeVisible();
  // A refresh at the break comes back to the same break.
  await page.reload();
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(brk).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("cricket-target")).toContainText(`need ${runs + 1}`);
  // Keyboard: the break's button takes focus and Enter starts the chase.
  await page.getByTestId("cricket-begin-chase").focus();
  await page.keyboard.press("Enter");
  await expect(brk).toBeHidden();
  const finish = page.getByTestId("cricket-finish");
  await simulateUntil(page, () => finish.isVisible());
  await expect(finish).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("cricket-top-performer")).toContainText("Runs, plus 20 a wicket");
  // Nearly every ball was simulated (continuous play may have started a delivery the player faced), far short of
  // the 30 balls a win needs, so whatever the result it can't count as the player's.
  const own = Number(await root.getAttribute("data-controlled-balls"));
  expect(own).toBeLessThan(30);
  await expect(page.getByTestId("cricket-your-part")).toContainText(`You played ${own} ball${own === 1 ? "" : "s"} yourself`);
  await expect(page.getByTestId("cricket-your-part")).toContainText(/neither a win nor a loss|Only the balls you played/);
  await page.getByTestId("cricket-full-scorecard").click();
  await expect(page.locator(".cr-scorecards section")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await page.getByTestId("cricket-save").click();
  await expect(page.getByTestId("score-verified")).toBeVisible({ timeout: 60000 });
  const results = page.getByTestId("solo-results");
  await expect(results.getByTestId("cricket-awards")).toBeVisible();
  await expect(results).toContainText("The server replayed every delivery");
});

test("international gameplay fits a phone screen: the live match, the innings break and the result", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await join(page, "Phone match QA");
  await page.locator('[data-format="t20"]').click();
  await page.getByRole("button", { name: /Pick your XI/ }).click();
  await page.getByRole("button", { name: /Match settings/ }).click();
  await page.getByTestId("start-international").click();
  await toMiddle(page);
  expect(await width(page)).toBeLessThanOrEqual(390);
  await expect(page.getByTestId("cricket-sim-over")).toBeInViewport();
  await page.getByTestId("cricket-sim-over").click();
  expect(await width(page)).toBeLessThanOrEqual(390);
  const brk = page.getByTestId("cricket-innings-break");
  await simulateUntil(page, () => brk.isVisible());
  const box = (await brk.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await expect(page.getByTestId("cricket-begin-chase")).toBeInViewport();
  await page.getByTestId("cricket-begin-chase").click();
  const finish = page.getByTestId("cricket-finish");
  await simulateUntil(page, () => finish.isVisible());
  const card = (await finish.boundingBox())!;
  expect(card.x + card.width).toBeLessThanOrEqual(390);
  expect(await width(page)).toBeLessThanOrEqual(390);
  // The card scrolls within itself, so its save button can always be reached.
  await page.getByTestId("cricket-save").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("cricket-save")).toBeInViewport();
});
