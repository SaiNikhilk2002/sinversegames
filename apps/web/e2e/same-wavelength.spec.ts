import { expect, test, type Browser, type Page } from "@playwright/test";
import { enterName, expectNoHorizontalOverflow, joinByInvite, newPlayer } from "./helpers";

/**
 * Same Wavelength in real browsers (docs/SAME_WAVELENGTH_DESIGN.md): a Couples room from a preset
 * link, a second player joining by invite from another browser context, secret answers, the
 * reveal, the end-of-game wavelength, Fun Insights and a share link.
 */
async function couplesRoom(browser: Browser, viewport?: { width: number; height: number }) {
  const a = await newPlayer(browser, "Asha", viewport);
  const b = await newPlayer(browser, "Ben", viewport);
  await a.page.goto("/play/same-wavelength?preset=couples");
  await enterName(a.page, a.name);
  await expect(a.page.getByText("Connected", { exact: true })).toBeVisible();
  await a.page.getByRole("button", { name: "Create private room" }).click();
  await a.page.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  const code = (await a.page.getByTestId("room-code").textContent())!.trim();
  // The preset made it a Couples room with typed answers.
  await expect(a.page.getByRole("radio", { name: "Couples · 2", exact: true })).toHaveAttribute("aria-checked", "true");
  await a.page.getByRole("radio", { name: "5", exact: true }).click();
  await joinByInvite(b.page, code, b.name);
  await b.page.getByRole("button", { name: "I'm ready" }).click();
  await a.page.getByRole("button", { name: "Start game" }).click();
  await expect(a.page.getByTestId("same-wavelength")).toBeVisible();
  await expect(b.page.getByTestId("same-wavelength")).toBeVisible();
  return { a, b, code };
}

/** Answers the current prompt: option `k`, or a typed word. */
async function answer(page: Page, k: number, word = "pizza") {
  const text = page.getByTestId("wave-text");
  const options = page.locator('[data-testid^="wave-option-"]');
  await expect(text.or(options.first())).toBeVisible({ timeout: 10_000 });
  if (await text.isVisible()) {
    await text.fill(word);
    await page.getByRole("button", { name: "Lock in" }).click();
  } else await options.nth(k % (await options.count())).click();
  // The last player to answer goes straight to the reveal.
  await expect(page.getByTestId("wave-locked").or(page.getByTestId("wave-reveal"))).toBeVisible();
}

test("Same Wavelength: a couple answers in secret, reveals together, sees their wavelength and shares it", async ({ browser }) => {
  test.setTimeout(180_000);
  const { a, b } = await couplesRoom(browser);
  for (let round = 1; round <= 5; round++) {
    await expect(a.page.getByTestId("same-wavelength")).toHaveAttribute("data-phase", "answering", { timeout: 15_000 });
    await expect(a.page.getByTestId("same-wavelength")).toHaveAttribute("data-round", String(round));
    await answer(a.page, 0);
    // Ben sees that Asha has answered, never what: no reveal until both are in.
    await expect(b.page.locator('[data-testid^="answered-"][data-answered="true"]')).toHaveCount(1);
    await expect(b.page.getByTestId("wave-reveal")).toHaveCount(0);
    await expect(b.page.getByTestId("wave-locked")).toHaveCount(0);
    await answer(b.page, round % 2 ? 0 : 1);
    for (const p of [a.page, b.page]) await expect(p.getByTestId("wave-reveal")).toBeVisible();
    await expect(a.page.locator('[data-testid^="wave-answer-"]')).toHaveCount(2);
    await expect(a.page.getByTestId("wave-verdict")).not.toBeEmpty();
    await a.page.getByTestId("wave-next").click();
    await b.page.getByTestId("wave-next").click();
  }
  for (const p of [a.page, b.page]) {
    await expect(p.getByTestId("wave-summary")).toBeVisible({ timeout: 15_000 });
    await expect(p.getByTestId("wave-match-pct")).toHaveText(/^\d+%$/);
    await expect(p.getByTestId("results")).toBeVisible();
    await expect(p.getByTestId("fun-insights")).toBeVisible();
  }
  await expect(a.page.getByTestId("wave-summary")).toContainText("not how compatible");
  // Cooperative: a shared result, never a "defeat".
  await expect(a.page.getByTestId("results")).toContainText("Played together");
  await expect(a.page.getByTestId("results")).not.toContainText("Defeat");
  // Share without names, then with.
  await a.page.getByTestId("share-button").click();
  const link = a.page.getByTestId("share-link");
  await expect(link).toBeVisible({ timeout: 15_000 });
  const href = (await link.getAttribute("href"))!;
  expect(href).toMatch(/\/share\/[\w-]+\.[\w-]+\.[\w-]+$/);
  const viewer = await browser.newPage();
  await viewer.goto(href);
  await expect(viewer.getByTestId("share-card")).toBeVisible();
  await expect(viewer.getByTestId("share-headline")).toHaveText(/\d+% on the same wavelength/);
  await expect(viewer.getByTestId("share-card")).not.toContainText("Asha");
  await expect(viewer.getByTestId("share-card")).not.toContainText("Ben");
  await expect(viewer.getByTestId("share-play")).toHaveAttribute("href", "/play/same-wavelength?preset=couples");
  // Edited links are refused.
  const tampered = await viewer.goto(href.replace(/\.[\w-]+$/, ".AAAA"));
  expect(tampered!.status()).toBe(404);
  await a.page.getByTestId("share-names").check();
  await a.page.getByTestId("share-button").click();
  await expect(a.page.getByTestId("share-link")).toBeVisible({ timeout: 15_000 });
  await viewer.goto((await a.page.getByTestId("share-link").getAttribute("href"))!);
  await expect(viewer.getByTestId("share-card")).toContainText("Asha & Ben");
  await viewer.close();
});

test("Same Wavelength fits a phone screen: answering, reveal and results", async ({ browser }) => {
  test.setTimeout(150_000);
  const phone = { width: 390, height: 844 };
  const { a, b } = await couplesRoom(browser, phone);
  await expect(a.page.getByTestId("same-wavelength")).toHaveAttribute("data-phase", "answering", { timeout: 15_000 });
  await expectNoHorizontalOverflow(a.page);
  for (let round = 1; round <= 5; round++) {
    await expect(a.page.getByTestId("same-wavelength")).toHaveAttribute("data-round", String(round), { timeout: 15_000 });
    await answer(a.page, 1);
    await answer(b.page, 1);
    await expect(a.page.getByTestId("wave-reveal")).toBeVisible();
    if (round === 1) await expectNoHorizontalOverflow(a.page);
    await a.page.getByTestId("wave-next").click();
    await b.page.getByTestId("wave-next").click();
  }
  await expect(a.page.getByTestId("wave-summary")).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalOverflow(a.page);
  await expectNoHorizontalOverflow(b.page);
});
