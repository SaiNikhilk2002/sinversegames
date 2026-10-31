import { expect, type Browser, type Page } from "@playwright/test";

/** A fresh browser context = a separate guest identity. */
export async function newPlayer(browser: Browser, name: string, viewport?: { width: number; height: number }) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  const page = await context.newPage();
  return { context, page, name };
}

export async function enterName(page: Page, name: string) {
  await page.getByLabel("Display name").fill(name);
  await page.getByRole("button", { name: /let's play|create profile/i }).click();
}

/** Creates a private room from the play hub and returns its code. */
export async function createPrivateRoom(page: Page, gameSlug: string, name: string): Promise<string> {
  await page.goto(`/play/${gameSlug}`);
  await enterName(page, name);
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create private room" }).click();
  await page.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  const code = (await page.getByTestId("room-code").textContent())!.trim();
  expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  return code;
}

export async function joinByInvite(page: Page, code: string, name: string) {
  await page.goto(`/room/${code}`);
  await enterName(page, name);
  await expect(page.getByTestId("player-list")).toContainText(name);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page should not scroll horizontally").toBeLessThanOrEqual(1);
}
