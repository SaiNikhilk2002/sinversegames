import { expect, test, type Page } from "@playwright/test";
import { createPrivateRoom, joinByInvite, newPlayer } from "./helpers";

/** Takes one action if it's this page's turn. Returns true if it acted. */
async function botStep(page: Page): Promise<boolean> {
  if (await page.getByTestId("results").isVisible().catch(() => false)) return false;
  const picker = page.getByTestId("color-picker");
  if (await picker.isVisible().catch(() => false)) {
    await picker.getByRole("button").first().click();
    return true;
  }
  // AnimatePresence briefly keeps a played card's old playable attribute in
  // the DOM. Only act when this player's live turn controls are enabled.
  if (!(await page.locator('[data-testid="draw-button"]:enabled, [data-testid="pass-button"]:enabled').isVisible().catch(() => false))) return false;
  const playable = page.locator('[data-testid^="hand-card-"][data-playable="true"]');
  if ((await playable.count()) > 0) {
    const id = await playable.first().getAttribute("data-testid");
    const card = page.getByTestId(id!);
    const wild = (await card.getAttribute("aria-label"))?.startsWith("Prism");
    if (!(await card.click({ timeout: 2000 }).then(() => true, () => false))) return false;
    if (wild) await picker.getByRole("button").first().click();
    // Keep the mouse interaction and all gameplay assertions, but do not
    // select the same exiting card again before its animation has finished.
    await card.waitFor({ state: "detached", timeout: 5000 });
    return true;
  }
  const pass = page.getByTestId("pass-button");
  if (await pass.isVisible().catch(() => false)) {
    return pass.click({ timeout: 2000 }).then(() => true, () => false);
  }
  const draw = page.getByTestId("draw-button");
  if (await draw.isVisible().catch(() => false)) {
    return draw.click({ timeout: 2000 }).then(() => true, () => false);
  }
  return false;
}

async function startDuel(browser: Parameters<typeof newPlayer>[0]) {
  const a = await newPlayer(browser, "Ava");
  const b = await newPlayer(browser, "Ben");
  const code = await createPrivateRoom(a.page, "color-clash", a.name);
  await a.page.getByRole("radio", { name: "5 cards" }).click();
  await a.page.getByRole("radio", { name: "Off" }).click();
  await joinByInvite(b.page, code, b.name);
  await b.page.getByRole("button", { name: "I'm ready" }).click();
  await a.page.getByRole("button", { name: "Start game" }).click();
  await expect(a.page.getByTestId("color-clash")).toBeVisible();
  await expect(b.page.getByTestId("color-clash")).toBeVisible();
  return { a, b, code };
}

test("two players complete a Color Clash match", async ({ browser }) => {
  const { a, b } = await startDuel(browser);

  // Hands are private: each sees 5 of their own cards and only a count for the opponent.
  await expect(a.page.locator('[data-testid^="hand-card-"]')).toHaveCount(5);
  await expect(b.page.getByTestId(/^opponent-/).filter({ visible: true })).toContainText("5");

  const deadline = Date.now() + 100_000;
  while (Date.now() < deadline) {
    const [r1, r2] = await Promise.all([a.page.getByTestId("results").isVisible(), b.page.getByTestId("results").isVisible()]);
    if (r1 && r2) break;
    const acted = (await botStep(a.page)) || (await botStep(b.page));
    if (!acted) await a.page.waitForTimeout(100);
  }
  await expect(a.page.getByTestId("results")).toBeVisible();
  await expect(b.page.getByTestId("results")).toBeVisible();
  await expect(a.page.getByTestId("results")).toContainText(/wins!|You win/);
  // Both screens agree on the final scores.
  const scoresA = await a.page.locator('[data-testid^="score-"]').allTextContents();
  const scoresB = await b.page.locator('[data-testid^="score-"]').allTextContents();
  expect(scoresA.sort()).toEqual(scoresB.sort());
  await expect(a.page.getByRole("button", { name: "Play again" })).toBeVisible();

  await a.context.close();
  await b.context.close();
});

test("a player who reloads mid-game gets their hand back", async ({ browser }) => {
  const { a, b } = await startDuel(browser);
  const before = (await b.page.locator('[data-testid^="hand-card-"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).sort();
  await b.page.reload();
  await expect(b.page.getByTestId("color-clash")).toBeVisible();
  await expect(b.page.locator('[data-testid^="hand-card-"]')).toHaveCount(before.length);
  const after = (await b.page.locator('[data-testid^="hand-card-"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).sort();
  expect(after).toEqual(before);
  // The other player saw them come back online.
  await expect(a.page.getByTestId(/^opponent-/).filter({ visible: true })).not.toContainText("Offline");
  await a.context.close();
  await b.context.close();
});
