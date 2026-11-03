import { expect, test } from "@playwright/test";
import { createPrivateRoom, enterName, joinByInvite, newPlayer } from "./helpers";

for (const failure of ["503", "timeout"] as const) {
  test(`recovers when the first token request fails with ${failure}`, async ({ page }) => {
    let requests = 0;
    await page.route("**/api/session/token", async (route) => {
      requests++;
      if (requests === 1) {
        // Leaving the request pending exercises the client's own deadline.
        if (failure === "timeout") return;
        await route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } });
        return;
      }
      await route.continue();
    });
    await page.goto("/play/color-clash");
    await enterName(page, "TokenRecovery");
    await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 15_000 });
    expect(requests).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole("button", { name: "Create private room" })).toBeEnabled();
  });
}

for (const [status, label] of [[401, "Choose your name again"], [403, "Account suspended"]] as const) {
  test(`stops automatic authentication retries after HTTP ${status}`, async ({ page }) => {
    let requests = 0;
    await page.route("**/api/session/token", async (route) => {
      requests++;
      await route.fulfill({ status, json: { error: "Authentication required" } });
    });
    await page.goto(status === 401 ? "/room/ZZZZZZ" : "/play/color-clash");
    await enterName(page, "DeniedPlayer");
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    if (status === 401) await expect(page.getByRole("link", { name: "Update profile" })).toBeVisible();
    // Longer than the initial retry delay: a terminal error must stay terminal.
    await page.waitForTimeout(1500);
    expect(requests).toBe(1);
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  });
}

test("offers a working room retry when the game server is unreachable", async ({ page }) => {
  let unavailable = true;
  await page.route("**/api/session/token", (route) => unavailable
    ? route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } })
    : route.continue());
  await page.goto("/room/ZZZZZZ");
  await enterName(page, "RoomRetry");
  await expect(page.getByRole("heading", { name: "Game server unreachable" })).toBeVisible();
  unavailable = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  // The recovered connection now reaches the room lookup instead of hanging.
  await expect(page.getByRole("heading", { name: "Room not found" })).toBeVisible();
});

test("uses polling when the network rejects WebSocket", async ({ page }) => {
  let websocketAttempts = 0;
  let pollingRequests = 0;
  await page.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const target = new URL(url.toString());
        if (target.hostname === "localhost" && target.port === "4200") {
          // Make the real server reject only WebSocket opening handshakes.
          // A Playwright WebSocketRoute.close() accepts the handshake first,
          // which exercises a dropped connection rather than initial fallback.
          target.searchParams.set("EIO", "unsupported-by-test");
        }
        super(target, protocols);
      }
    };
  });
  page.on("websocket", (socket) => {
    if (socket.url().startsWith("ws://localhost:4200/socket.io/")) websocketAttempts++;
  });
  page.on("request", (request) => {
    if (request.url().startsWith("http://localhost:4200/socket.io/") && request.url().includes("transport=polling")) pollingRequests++;
  });
  await page.goto("/play/color-clash");
  await enterName(page, "PollingPlayer");
  await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => websocketAttempts).toBeGreaterThan(0);
  expect(pollingRequests).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Create private room" }).click();
  await expect(page.getByTestId("room-code")).toBeVisible();
});

test("keeps polling usable when a WebSocket upgrade closes immediately", async ({ page }) => {
  let websocketAttempts = 0;
  await page.routeWebSocket("ws://localhost:4200/socket.io/**", (socket) => {
    websocketAttempts++;
    socket.close({ code: 1003, reason: "Upgrade closed by test gateway" });
  });
  await page.goto("/play/color-clash");
  await enterName(page, "ClosedUpgrade");
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect.poll(() => websocketAttempts).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Create private room" }).click();
  await expect(page.getByTestId("room-code")).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
});

test("restores a live match after a transient network interruption", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: testInfo.outputDir, size: { width: 1280, height: 800 } } });
  const host = { context, page: await context.newPage(), name: "NetworkHost" };
  const guest = await newPlayer(browser, "NetworkGuest");
  let interrupted = false;
  let dropConnection: (() => void) | undefined;
  await host.page.route("http://localhost:4200/socket.io/**", (route) => interrupted ? route.abort() : route.continue());
  await host.page.routeWebSocket("ws://localhost:4200/socket.io/**", (socket) => {
    if (interrupted) return socket.close();
    const upstream = socket.connectToServer();
    dropConnection = () => {
      // Close the actual transport on both sides; the game server stays running.
      upstream.close();
      socket.close();
    };
  });
  try {
    const code = await createPrivateRoom(host.page, "color-clash", host.name);
    await host.page.getByRole("radio", { name: "Off", exact: true }).click();
    await joinByInvite(guest.page, code, guest.name);
    await guest.page.getByRole("button", { name: "I'm ready" }).click();
    await host.page.getByRole("button", { name: "Start game" }).click();
    await expect(host.page.getByTestId("color-clash")).toBeVisible();
    // Hold the connected opponent's turn. A disconnected active player is
    // correctly auto-played after ten seconds, even with the turn timer off.
    if (await host.page.getByTestId("draw-button").isVisible()) {
      await host.page.getByTestId("draw-button").click();
      await expect.poll(async () => (await guest.page.getByTestId("draw-button").isVisible()) || (await host.page.getByTestId("pass-button").isVisible())).toBe(true);
      if (await host.page.getByTestId("pass-button").isVisible()) await host.page.getByTestId("pass-button").click();
    }
    await expect(guest.page.getByTestId("draw-button")).toBeVisible();
    const before = await host.page.locator('[data-testid^="hand-card-"]').evaluateAll((cards) => cards.map((card) => card.getAttribute("data-testid")).sort());
    expect(before.length).toBeGreaterThan(0);
    expect(dropConnection).toBeDefined();
    interrupted = true;
    dropConnection!();
    await expect(host.page.getByRole("alert").filter({ hasText: "Connection lost" })).toBeVisible();
    await expect(guest.page.getByTestId(/^opponent-/).filter({ visible: true })).toContainText("Offline");
    await host.page.screenshot({ path: testInfo.outputPath("connection-lost.png") });
    interrupted = false;
    await expect(host.page.getByText(/Back online/)).toBeVisible({ timeout: 15_000 });
    await host.page.screenshot({ path: testInfo.outputPath("back-online.png") });
    await expect(host.page.getByText("Connected", { exact: true })).toBeVisible();
    const after = await host.page.locator('[data-testid^="hand-card-"]').evaluateAll((cards) => cards.map((card) => card.getAttribute("data-testid")).sort());
    expect(after).toEqual(before);
    await expect(host.page).toHaveURL(new RegExp(`/room/${code}$`));
    await expect(guest.page.getByTestId(/^opponent-/).filter({ visible: true })).not.toContainText("Offline");
  } finally {
    await host.context.close();
    await guest.context.close();
    const video = await host.page.video()?.path();
    if (video) await testInfo.attach("transient-network-recovery", { path: video, contentType: "video/webm" });
  }
});
