import { expect, test, type Page } from "@playwright/test";

/**
 * Every player keeps one look: the same squad model, facial hair, haircut and
 * skin tone whatever the graphics preset (detailed or light athlete), in a
 * replay, after a reload and in another match. The scene publishes each
 * player's identity and look on the game root as `data-looks`.
 */
async function startMatch(page: Page) {
  await page.goto("/play/sinverse-cricket");
  const name = page.getByLabel("Display name"),
    start = page.getByTestId("start-run");
  await expect(name.or(start)).toBeVisible({ timeout: 30000 });
  if (await name.isVisible()) {
    await name.fill("Looks QA");
    await page.getByRole("button", { name: /let's play|create profile/i }).click();
  }
  await page.getByTestId("start-run").click();
  const root = page.getByTestId("sinverse-cricket");
  await expect(root).toBeVisible();
  await root.focus();
  await page.keyboard.press("Space");
  await expect(root).toHaveAttribute("data-ceremony", "flight");
  await page.getByRole("button", { name: "Heads", exact: true }).click();
  await expect(root).toHaveAttribute("data-ceremony", "decision", { timeout: 20000 });
  const bat = page.getByRole("button", { name: "Bat first", exact: true }),
    cont = page.getByRole("button", { name: "Continue to the middle", exact: true });
  await expect(bat.or(cont)).toBeVisible();
  if (await bat.isVisible()) await bat.click();
  else await cont.click();
  await expect(root).toHaveAttribute("data-ceremony", "done", { timeout: 15000 });
  return root;
}

async function looks(page: Page) {
  const root = page.getByTestId("sinverse-cricket");
  await expect(root).toHaveAttribute("data-athletes", "true", { timeout: 90000 });
  await expect(root).not.toHaveAttribute("data-looks", "", { timeout: 5000 });
  const raw = (await root.getAttribute("data-looks"))!;
  return new Map(raw.split("|").map((e) => e.split("=") as [string, string]));
}

test("each player looks the same across presets, replays, reloads and matches", async ({ page }) => {
  test.setTimeout(300000);
  const root = await startMatch(page);
  await page.getByLabel("Graphics", { exact: true }).selectOption("high");
  const high = await looks(page);
  expect(high.size).toBe(14);
  // Different people: no two identities share a whole look.
  expect(new Set(high.values()).size).toBe(high.size);

  await page.getByLabel("Graphics", { exact: true }).selectOption("low");
  await expect(root).toHaveAttribute("data-athletes", "false", { timeout: 5000 }).catch(() => {});
  const low = await looks(page);
  expect(low).toEqual(high);

  // A delivery, then its replay: the same people.
  await root.focus();
  await page.keyboard.press("Space");
  await expect(root).toHaveAttribute("data-live", "true", { timeout: 20000 }).catch(() => {});
  await expect(root).toHaveAttribute("data-live", "false", { timeout: 120000 });
  const slider = page.getByRole("slider", { name: "Replay position", exact: true });
  if (!(await slider.isVisible().catch(() => false))) await page.keyboard.press("KeyP");
  await expect(slider).toBeVisible({ timeout: 8000 });
  expect(await looks(page)).toEqual(high);

  // Reload and play another match: everyone who plays again looks the same.
  await startMatch(page);
  const again = await looks(page);
  let shared = 0;
  for (const [who, look] of again)
    if (high.has(who)) {
      shared++;
      expect(look, who).toBe(high.get(who));
    }
  expect(shared).toBeGreaterThanOrEqual(10);
});
