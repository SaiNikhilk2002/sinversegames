import { expect, test } from "@playwright/test";
import { createPrivateRoom, enterName, joinByInvite, newPlayer } from "./helpers";

test("verified play earns Sin Coins; a purchase and equipped profile survive reload without duplicate charges", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const { page, context } = await newPlayer(browser, "StudioChef");
  // Independent local HTTP clients: added cases must not consume the baseline
  // suite's shared localhost session quota. Production rate limits stay intact.
  await context.setExtraHTTPHeaders({ "x-forwarded-for": "192.0.2.101" });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await page.goto("/play/kitchen-rush"); await enterName(page, "StudioChef");
    await page.getByTestId("level-1").click(); await page.getByTestId("start-run").click();
    await expect(page.getByTestId("kitchen-rush")).toBeVisible();
    const until = Date.now() + 145_000;
    while (Date.now() < until && !(await page.getByTestId("solo-results").isVisible())) {
      const target = await page.getByTestId("kr-hint").getAttribute("data-hint-target").catch(() => null);
      if (target) await page.locator(`[data-target="${target}"]`).click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(250);
    }
    await expect(page.getByTestId("score-verified")).toContainText("saved");
    await expect(page.getByTestId("earned-coins")).toContainText("Sin Coins earned");
    await page.goto("/store");
    const balance = page.getByTestId("coin-balance");
    await expect(balance).not.toHaveText("—");
    const before = Number((await balance.textContent())!.replaceAll(",", ""));
    expect(before).toBeGreaterThanOrEqual(15);
    const item = page.getByTestId("item-frame-brass-orbit");
    await item.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(balance).toHaveText(String(before - 15));
    await expect(item.getByText("Owned", { exact: true })).toBeVisible();
    await item.getByRole("button", { name: "Equip", exact: true }).click();
    await expect(page.locator('[data-testid="cosmetic-avatar"][data-frame="frame-brass-orbit"]').first()).toBeVisible();
    const repeat = await page.request.post("/api/wallet", { headers: { origin: "http://localhost:3200" }, data: { action: "purchase", itemId: "frame-brass-orbit" } });
    expect(repeat.status()).toBe(200);
    expect(await repeat.json()).toMatchObject({ purchased: false, balance: before - 15 });
    await page.reload();
    await expect(balance).toHaveText(String(before - 15));
    await expect(item.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("cosmetic-studio-desktop.png"), fullPage: true });
    await page.goto("/profile");
    await expect(page.getByTestId("coin-balance")).toHaveText(String(before - 15));
    await expect(page.getByTestId("coin-history")).toContainText("Cosmetic purchase · Brass orbit");
    await expect(page.locator('[data-testid="cosmetic-avatar"][data-frame="frame-brass-orbit"]').first()).toBeVisible();
    // Strict input: no client balance, player, price or free item can be accepted.
    for (const forged of [
      { action: "purchase", itemId: "frame-jade-studio", price: 0 },
      { action: "purchase", itemId: "frame-jade-studio", balance: 999999, playerId: "someone-else" },
      { action: "equip", category: "profile-frame", itemId: "frame-ink-star" },
    ]) {
      const response = await page.request.post("/api/wallet", { headers: { origin: "http://localhost:3200" }, data: forged });
      expect(response.status()).toBe(400);
    }
    const oversized = await page.request.post("/api/wallet", { headers: { origin: "http://localhost:3200", "content-type": "application/json" }, data: "x".repeat(2048) });
    expect(oversized.status()).toBe(413);
    const crossOrigin = await page.request.post("/api/wallet", { headers: { origin: "https://untrusted.example" }, data: { action: "purchase", itemId: "frame-brass-orbit" } });
    expect(crossOrigin.status()).toBe(403);
    const anonymous = await browser.newContext();
    try {
      expect((await anonymous.request.get("http://localhost:3200/api/wallet")).status()).toBe(401);
      expect((await anonymous.request.post("http://localhost:3200/api/wallet", { headers: { origin: "http://localhost:3200" }, data: { action: "purchase", itemId: "frame-brass-orbit" } })).status()).toBe(401);
    } finally { await anonymous.close(); }
    const other = await browser.newContext();
    try {
      await other.setExtraHTTPHeaders({ "x-forwarded-for": "192.0.2.102" });
      const headers = { origin: "http://localhost:3200" };
      expect((await other.request.post("http://localhost:3200/api/session", { headers, data: { displayName: "OtherWallet" } })).status()).toBe(200);
      const history = await (await page.request.get("/api/wallet")).json();
      const cursor = history.transactions[0].id as string;
      expect((await other.request.get(`http://localhost:3200/api/wallet?cursor=${cursor}`)).status()).toBe(400);
      const empty = await (await other.request.get("http://localhost:3200/api/wallet")).json();
      expect(empty.balance).toBe(0); expect(empty.transactions).toHaveLength(0);
    } finally { await other.close(); }
    await page.reload();
    await expect(page.getByTestId("coin-balance")).toHaveText(String(before - 15));
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("wallet-profile-mobile.png"), fullPage: true });
    expect(pageErrors).toEqual([]);
  } finally { await context.close(); }
});

test("Doodle has a correctly scaled brush preview and a visible, keyboard-accessible mobile ready action", async ({ browser }, testInfo) => {
  const host = await newPlayer(browser, "BrushHost");
  const guest = await newPlayer(browser, "BrushGuest", { width: 320, height: 568 });
  await host.context.setExtraHTTPHeaders({ "x-forwarded-for": "192.0.2.103" });
  await guest.context.setExtraHTTPHeaders({ "x-forwarded-for": "192.0.2.104" });
  try {
    const code = await createPrivateRoom(host.page, "doodle-duel", host.name);
    await host.page.getByRole("radio", { name: "30s", exact: true }).click();
    await joinByInvite(guest.page, code, guest.name);
    await expect(guest.page.getByRole("heading", { name: "2 / 8 players joined" })).toBeVisible();
    await expect(guest.page.getByTestId("player-list").locator("li")).toHaveCount(2);
    for (const width of [320, 360, 375, 390, 430]) {
      await guest.page.setViewportSize({ width, height: 568 });
      await guest.page.evaluate(() => window.scrollTo(0, 0));
      const ready = guest.page.getByRole("button", { name: "I'm ready", exact: true });
      await expect(ready).toBeInViewport({ ratio: 1 });
      const bounds = (await ready.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(await guest.page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      if (width === 375) await guest.page.screenshot({ path: testInfo.outputPath("doodle-lobby-mobile.png") });
    }
    await guest.page.getByRole("button", { name: "I'm ready", exact: true }).focus();
    await guest.page.keyboard.press("Space");
    await expect(guest.page.getByRole("button", { name: "I'm not ready", exact: true })).toBeVisible();
    await host.page.getByRole("button", { name: "Start game", exact: true }).click();
    const aDraws = await Promise.race([
      host.page.getByTestId("word-options").waitFor().then(() => true), guest.page.getByTestId("word-options").waitFor().then(() => false),
    ]);
    const drawer = aDraws ? host.page : guest.page;
    await drawer.getByTestId("word-options").getByRole("button").first().click();
    const canvas = drawer.getByTestId("doodle-canvas");
    await expect(drawer.getByRole("toolbar", { name: "Drawing tools" })).toBeVisible();
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    const x = box.x + box.width / 2; const y = box.y + box.height / 2;
    await drawer.mouse.move(x, y);
    const preview = drawer.getByTestId("brush-preview");
    await expect(preview).toBeVisible();
    expect(await canvas.evaluate((el) => getComputedStyle(el).cursor)).toBe("none");
    expect(await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < data.length; i += 4) if (data[i]! < 250 || data[i + 1]! < 250 || data[i + 2]! < 250) return false;
      return true;
    })).toBe(true);
    for (const size of [3, 6, 12, 20, 32]) {
      // Dispatch click leaves the physical pointer fixed over the canvas: the
      // preview must resize on a brush change even before another pointermove.
      await drawer.getByRole("radio", { name: `Brush size ${size}`, exact: true }).dispatchEvent("click");
      await expect.poll(async () => (await preview.boundingBox())!.width).toBeCloseTo(size * box.width / 1000, 1);
      const ring = (await preview.boundingBox())!;
      expect(ring.x + ring.width / 2).toBeCloseTo(x, 1); expect(ring.y + ring.height / 2).toBeCloseTo(y, 1);
    }
    // The preview never inks the bitmap; the selected size also controls an
    // actual dot. Measure its painted diameter in logical canvas coordinates.
    await drawer.mouse.down(); await drawer.mouse.up();
    const diameter = await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement; const pixels = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let min = c.width; let max = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (pixels[(y * c.width + x) * 4]! < 100) { min = Math.min(min, x); max = Math.max(max, x); }
      return (max - min + 1) * 1000 / c.width;
    });
    expect(diameter).toBeGreaterThan(28); expect(diameter).toBeLessThan(35);
    await drawer.getByRole("button", { name: "Clear canvas", exact: true }).click();
    await canvas.dispatchEvent("pointermove", { pointerType: "pen", pointerId: 42, clientX: x, clientY: y });
    await expect(preview).toBeVisible();
    await canvas.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 43, clientX: x, clientY: y, button: 0 });
    await expect(preview).toBeVisible();
    await canvas.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 43, clientX: x, clientY: y, button: 0 });
    await expect(preview).toBeHidden();
    await drawer.getByRole("button", { name: "Clear canvas", exact: true }).click();
    await canvas.scrollIntoViewIfNeeded();
    await drawer.screenshot({ path: testInfo.outputPath("doodle-clean-canvas.png"), fullPage: true, mask: [drawer.getByTestId("secret-word")], maskColor: "#15132a" });
  } finally { await host.context.close(); await guest.context.close(); }
});
