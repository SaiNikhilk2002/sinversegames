import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./helpers";

/**
 * Game discovery (docs/GAME_CATEGORY_DISCOVERY.md, docs/COUPLES_EXPERIENCE.md): category pages,
 * the Couples landing page, one game in several categories, filters, metadata and old routes.
 */
test("the Couples page leads with real two-player games and collections, with its own metadata", async ({ page }) => {
  const res = await page.goto("/couples");
  expect(res!.status()).toBe(200);
  await expect(page).toHaveTitle(/Fun Games for Couples/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /couples/i);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/couples$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Play together");
  const games = page.getByTestId("couples-games");
  for (const name of ["Same Wavelength", "Doodle Duel"]) await expect(games).toContainText(name);
  // Games whose mechanics don't suit two (solo games, Bumper Blitz's arena brawl) aren't listed.
  for (const name of ["Mahjong Garden", "Bumper Blitz"]) await expect(games).not.toContainText(name);
  for (const id of ["know-each-other", "draw-together", "long-distance"]) await expect(page.getByTestId(`collection-${id}`)).toBeVisible();
  await expect(page.getByTestId("couples-start")).toHaveAttribute("href", "/play/same-wavelength?preset=couples");
  await expect(page.getByTestId("category-nav").getByRole("link", { name: "Couples" })).toHaveAttribute("aria-current", "page");
});

test("one game appears in every category it suits, and leads to the same game page", async ({ page }) => {
  for (const slug of ["multiplayer", "friends", "party", "family"]) {
    const res = await page.goto(`/categories/${slug}`);
    expect(res!.status()).toBe(200);
    await expect(page.getByTestId("category-games")).toContainText("Doodle Duel");
    const links = page.getByTestId("category-games").locator('a[href="/games/doodle-duel"]');
    await expect(links).toHaveCount(1);
  }
  await page.goto("/games/doodle-duel");
  const chips = page.getByTestId("game-categories");
  for (const name of ["Multiplayer", "Couples", "Friends", "Party"]) await expect(chips.getByRole("link", { name, exact: true })).toBeVisible();
  await chips.getByRole("link", { name: "Couples", exact: true }).click();
  await expect(page).toHaveURL(/\/couples$/);
});

test("category pages: metadata, player filters, redirects and no empty pages", async ({ page }) => {
  await page.goto("/categories/single-player");
  await expect(page).toHaveTitle(/Single-Player/);
  await expect(page.getByTestId("category-games")).not.toContainText("Doodle Duel");
  await page.goto("/categories/friends?players=5%2B");
  await expect(page.getByTestId("category-games")).toContainText("Same Wavelength");
  await expect(page.getByTestId("category-games")).not.toContainText("Chef Rivals");
  await page.goto("/categories/couples");
  await expect(page).toHaveURL(/\/couples$/);
  expect((await page.goto("/categories/not-a-category"))!.status()).toBe(404);
});

test("All games: search, category navigation and the player-count filter", async ({ page }) => {
  await page.goto("/games?q=wavelength");
  await expect(page.getByText("1 game", { exact: false })).toBeVisible();
  const grid = page.getByTestId("games-grid");
  await expect(grid.locator('a[href="/games/same-wavelength"]')).toBeVisible();
  await page.goto("/games?players=1");
  await expect(grid.locator('a[href="/games/cascade-solitaire"]')).toBeVisible();
  await expect(grid.locator('a[href="/games/doodle-duel"]')).toHaveCount(0);
  await expect(page.getByTestId("category-nav")).toBeVisible();
  // Existing routes are unchanged.
  for (const path of ["/games/doodle-duel", "/games/same-wavelength", "/play/same-wavelength", "/"]) expect((await page.goto(path))!.status()).toBe(200);
  await page.goto("/");
  await expect(page.getByTestId("category-tiles")).toBeVisible();
});

test("discovery pages fit a phone screen", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
  for (const path of ["/couples", "/categories/friends", "/games", "/"]) {
    await page.goto(path);
    await expectNoHorizontalOverflow(page);
  }
  await page.close();
});
