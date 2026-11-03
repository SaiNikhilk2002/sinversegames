import { expect, test } from "@playwright/test";
import { createPrivateRoom, enterName, expectNoHorizontalOverflow, joinByInvite, newPlayer } from "./helpers";

test("homepage → game detail → guest entry → play hub", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pick a game");
  await expect(page.getByRole("link", { name: /Color Clash/ }).first()).toBeVisible();
  await page.getByRole("link", { name: "Browse games" }).first().click();
  await expect(page).toHaveURL(/\/games$/);

  await page.getByRole("searchbox").fill("drawing");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("1 game")).toBeVisible();
  await page.getByRole("link", { name: /Doodle Duel/ }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Doodle Duel" })).toBeVisible();
  await page.getByRole("link", { name: "Play now" }).click();

  await enterName(page, "Explorer");
  await expect(page.getByRole("button", { name: "Create private room" })).toBeEnabled();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
});

test("names are validated server-side", async ({ page }) => {
  await page.goto("/play/color-clash");
  await page.getByLabel("Display name").fill("<>");
  await page.getByRole("button", { name: /let's play/i }).click();
  await expect(page.getByText(/Name must be 2–20/)).toBeVisible();
});

test("invalid and unknown rooms show helpful errors", async ({ page }) => {
  await page.goto("/play/color-clash");
  await enterName(page, "Lost");
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await page.goto("/room/ZZZZZZ");
  await expect(page.getByRole("heading", { name: "Room not found" })).toBeVisible();
  const res = await page.goto("/room/bad");
  expect(res?.status()).toBe(404);
});

test("private room: invite link joins a second browser, ready-up and lobby controls", async ({ browser }) => {
  const host = await newPlayer(browser, "Hosty");
  const guest = await newPlayer(browser, "Guesty");
  const code = await createPrivateRoom(host.page, "color-clash", host.name);
  await joinByInvite(guest.page, code, guest.name);

  await expect(host.page.getByTestId("player-list")).toContainText("Guesty");
  await expect(host.page.getByRole("button", { name: "Start game" })).toBeDisabled();
  await guest.page.getByRole("button", { name: "I'm ready" }).click();
  await expect(host.page.getByRole("button", { name: "Start game" })).toBeEnabled();

  // Only the host sees editable settings.
  await expect(guest.page.getByRole("radiogroup", { name: "Starting hand" })).toHaveCount(0);
  await host.page.getByRole("radio", { name: "5 cards" }).click();
  await expect(guest.page.getByText("5 cards each")).toBeVisible();
  // Changing settings resets readiness.
  await expect(guest.page.getByRole("button", { name: "I'm ready" })).toBeVisible();

  await host.context.close();
  await guest.context.close();
});

test("mobile layouts have no horizontal overflow", async ({ browser }) => {
  const mobile = { width: 375, height: 812 };
  const a = await newPlayer(browser, "MobileA", mobile);
  for (const path of ["/", "/games", "/games/color-clash", "/games/doodle-duel", "/leaderboard", "/privacy"]) {
    await a.page.goto(path);
    await expectNoHorizontalOverflow(a.page);
  }
  const code = await createPrivateRoom(a.page, "color-clash", a.name);
  await expectNoHorizontalOverflow(a.page);

  const b = await newPlayer(browser, "MobileB", mobile);
  await joinByInvite(b.page, code, b.name);
  await b.page.getByRole("button", { name: "I'm ready" }).click();
  await a.page.getByRole("button", { name: "Start game" }).click();
  await expect(a.page.getByTestId("hand")).toBeVisible();
  await expectNoHorizontalOverflow(a.page);
  await expectNoHorizontalOverflow(b.page);
  // The hand scrolls horizontally inside its own container on phones.
  const handScrolls = await a.page.getByTestId("hand").evaluate((el) => getComputedStyle(el).overflowX);
  expect(handScrolls).toBe("auto");
  await a.context.close();
  await b.context.close();
});
