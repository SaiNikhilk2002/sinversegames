import { expect, test, type Page, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { CricketMatch, sinverseCricket } from "@platform/engines/sinverse-cricket";
import { enterName, expectNoHorizontalOverflow } from "./helpers";
import { finishCricketToss } from "./cricket-helpers";

const evidence = "../../artifacts/cricket-2";
test.use({ trace: "off", launchOptions: { args: ["--enable-unsafe-swiftshader"] } });
async function start(page: Page, tactical = true) {
  await page.goto("/play/sinverse-cricket"); await enterName(page, "Cricket 2 QA");
  await expect(page.getByTestId("start-run")).toBeVisible();
  if (!tactical) { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: `${evidence}/00-match-setup.png`, fullPage: true }); }
  const response = page.waitForResponse(r => r.url().endsWith("/api/solo/start") && r.request().method() === "POST");
  await page.getByTestId("start-run").click(); const run = await (await response).json();
  const root = page.getByTestId("sinverse-cricket"); await expect(root).toBeVisible();
  await page.getByLabel("Graphics", { exact: true }).selectOption(tactical ? "tactical" : "low");
  await root.focus(); return { root, run };
}
async function keyAt(root: Locator, code: string, target: number) {
  return root.evaluate((e, { code, target }) => new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => { observer.disconnect(); reject(Error("Input window did not arrive")); }, 20000);
    const check = () => { const at = Number((e as HTMLElement).dataset.ballTick); if (at >= target) { observer.disconnect(); clearTimeout(timer); e.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true })); resolve(at); } };
    const observer = new MutationObserver(check); observer.observe(e, { attributes: true, attributeFilter: ["data-ball-tick"] }); check();
  }), { code, target });
}

test("Cricket 2: airborne call, interruption, actual coin, captain decision and connected entry", async ({ browser }) => {
  test.setTimeout(180000); mkdirSync(evidence, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: "../../.data/cricket-2/video", size: { width: 1280, height: 800 } } });
  const page = await context.newPage(), errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const { root, run } = await start(page, false);
  await expect(page.getByText("3D ground ready", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${evidence}/01-stadium.png` });
  await expect(root).toHaveAttribute("data-ceremony", "hand", { timeout: 20000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/01-coin-in-hand.png` });
  await expect(root).toHaveAttribute("data-ceremony", "flight", { timeout: 25000 });
  await page.waitForTimeout(4200);
  await expect(root).toHaveAttribute("data-ceremony", "flight");
  await expect(root).toHaveAttribute("data-call", "");
  await page.keyboard.press("Space");
  await expect(root).toHaveAttribute("data-call", "");
  await expect(page.getByRole("button", { name: "Skip cinematic", exact: false })).toBeDisabled();
  expect(await page.locator(".cr-ceremony").textContent()).not.toContain("win the toss");
  await page.keyboard.press("Escape"); const before = await root.getAttribute("data-ceremony");
  await page.waitForTimeout(1000); expect(await root.getAttribute("data-ceremony")).toBe(before);
  await page.getByRole("button", { name: "Return to the middle", exact: true }).click();
  await page.screenshot({ path: `${evidence}/02-coin-airborne.png` });
  const model = new CricketMatch(run.seed, run.config);
  await page.keyboard.press(model.tossFace === "heads" ? "KeyH" : "KeyT");
  await expect(root).toHaveAttribute("data-call", model.tossFace);
  await page.keyboard.press(model.tossFace === "heads" ? "KeyT" : "KeyH");
  await expect(root).toHaveAttribute("data-call", model.tossFace);
  await expect(root).toHaveAttribute("data-ceremony", "reveal", { timeout: 12000 });
  await page.screenshot({ path: `${evidence}/03-coin-landed.png` });
  await expect(root).toHaveAttribute("data-ceremony", "decision");
  await page.screenshot({ path: `${evidence}/04-captains-decision.png` });
  await page.keyboard.press("KeyB");
  await expect(root).toHaveAttribute("data-phase", "ready");
  await expect(root).toHaveAttribute("data-ceremony", "done", { timeout: 15000 });
  await page.keyboard.press("Escape"); await page.getByLabel("Continuous match flow").uncheck(); await page.getByRole("button", { name: "Return to the middle" }).click();
  await page.waitForTimeout(1400); // Review the settled working view after the entrance pan.
  await page.screenshot({ path: `${evidence}/05-ready-hud.png` });
  expect(errors).toEqual([]);
  await context.close(); await page.video()!.saveAs(`${evidence}/toss-and-entry.webm`);
});

test("Cricket 2: both innings by keyboard, real intents, continuous flow and server verification", async ({ page }) => {
  test.setTimeout(300000); await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const { root, run } = await start(page), model = new CricketMatch(run.seed, run.config);
  await page.keyboard.press("Space"); await expect(root).toHaveAttribute("data-ceremony", "flight");
  await page.keyboard.press(model.tossFace === "heads" ? "KeyH" : "KeyT");
  await expect(root).toHaveAttribute("data-ceremony", "decision"); await page.keyboard.press("KeyB");
  await expect(root).toHaveAttribute("data-ceremony", "done");
  // Digit3 picks the off-side family, whose first shot is the cover drive (aimed 45°); the arrow adds 10°.
  await page.keyboard.press("Digit3"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowUp");
  await expect(root).toHaveAttribute("data-intent", "cover"); await expect(root).toHaveAttribute("data-direction", "55"); await expect(root).toHaveAttribute("data-foot", "0.65");
  // Continuous flow faces the next ball without a button click.
  await expect(root).toHaveAttribute("data-live", "true", { timeout: 12000 });
  await keyAt(root, "Space", 155);
  await expect(root).toHaveAttribute("data-seq", "1", { timeout: 30000 });
  // Native focused widgets consume their own input; Space cannot start a ball in a menu.
  await page.keyboard.press("Escape");
  const tick = await root.getAttribute("data-ball-tick");
  await page.getByLabel("Continuous match flow").uncheck();
  await page.keyboard.press("Space"); expect(await root.getAttribute("data-ball-tick")).toBe(tick);
  await expect(page.getByLabel("Continuous match flow")).toBeChecked();
  await page.getByLabel("Continuous match flow").uncheck();
  await page.getByRole("button", { name: "Return to the middle", exact: true }).click();
  while ((await root.getAttribute("data-phase")) !== "finished") {
    if ((await root.getAttribute("data-phase")) === "interval") { await page.keyboard.press("Space"); await expect(root).toHaveAttribute("data-phase", "ready"); continue; }
    if (await page.getByRole("slider", { name: "Replay position", exact: true }).isVisible()) { await page.keyboard.press("Space"); continue; }
    const seq = Number(await root.getAttribute("data-seq"));
    const batting = (await root.getAttribute("data-batting")) === "true";
    await page.keyboard.press("Space");
    if (batting) await keyAt(root, "Space", 155);
    else { await expect(page.getByRole("meter", { name: "Release timing" })).toBeVisible(); await page.waitForTimeout(2500); await page.keyboard.press("Space"); }
    await expect(root).toHaveAttribute("data-seq", String(seq + 1), { timeout: 30000 });
  }
  mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: `${evidence}/06-keyboard-result.png` });
  const submit = page.waitForRequest(r => r.url().endsWith("/api/solo/submit") && r.method() === "POST");
  await page.getByTestId("cricket-save").click(); const payload = (await submit).postDataJSON();
  const verified = sinverseCricket.verify(run.seed, run.config, payload.log);
  expect(verified.ok).toBe(true); expect(payload.log[1].shot).toMatchObject({ kind: "cover", direction: 55, foot: 0.65 });
  await expect(page.getByTestId("score-verified")).toBeVisible(); expect(errors).toEqual([]);
  writeFileSync(`${evidence}/keyboard-verification.json`, JSON.stringify({ balls: payload.log.length - 1, verified: verified.ok, result: verified.ok ? verified.result : null, errors }, null, 2));
});

test("Cricket 2: native mobile swipes, cancellation, safe landscape and bowling gestures", async ({ browser }) => {
  test.setTimeout(150000);
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  const page = await context.newPage(), errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const { root, run } = await start(page), model = new CricketMatch(run.seed, run.config);
  await finishCricketToss(page, model.tossFace, "bowl", false);
  const cdp = await context.newCDPSession(page);
  const field = page.locator(".cr-field"), rect = (await field.boundingBox())!;
  const x = rect.x + rect.width * 0.6, y = rect.y + rect.height * 0.6;
  const touch = async (type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", points: { x: number; y: number }[]) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(p => ({ ...p, id: 1 })) });
  await touch("touchStart", [{ x, y }]); await touch("touchMove", [{ x: x + 35, y: y - 25 }]); await touch("touchCancel", []);
  await expect(page.getByRole("meter", { name: "Release timing" })).toHaveCount(0);
  await touch("touchStart", [{ x, y }]); await touch("touchMove", [{ x: x + 35, y: y - 25 }]); await touch("touchEnd", []);
  await expect(page.getByRole("meter", { name: "Release timing" })).toBeVisible();
  await page.waitForTimeout(2200); await page.touchscreen.tap(x, y);
  await expect(root).toHaveAttribute("data-seq", "1", { timeout: 30000 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${evidence}/07-mobile-landscape.png` });
  await page.keyboard.press("Escape"); await page.getByLabel("Continuous match flow").uncheck(); await page.getByRole("button", { name: "Return to the middle" }).click();
  // Complete the bowling innings; second-innings batting must use the same native touch surface.
  for (let n = 1; n < 6; n++) {
    await page.touchscreen.tap(x, y); await page.waitForTimeout(2400); await page.touchscreen.tap(x, y);
    await expect(root).toHaveAttribute("data-seq", String(n + 1), { timeout: 30000 });
  }
  await page.touchscreen.tap(x, y); await expect(root).toHaveAttribute("data-batting", "true");
  await page.touchscreen.tap(x, y); await expect(root).toHaveAttribute("data-live", "true");
  await page.waitForFunction(() => {
    const e = document.querySelector<HTMLElement>('[data-testid="sinverse-cricket"]');
    return e?.dataset.live === "true" && Number(e.dataset.ballTick) > 105;
  }, null, { polling: "raf", timeout: 12000 });
  await touch("touchStart", [{ x, y }]); await touch("touchMove", [{ x: x + 60, y: y - 65 }]); await touch("touchEnd", []);
  await expect(root).toHaveAttribute("data-intent", /cover|loft/);
  await expect(page.getByTestId("cricket-primary")).toContainText("Shot committed");
  await page.screenshot({ path: `${evidence}/08-mobile-batting.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("cricket-mobile-target")).toBeVisible();
  await expect(page.getByTestId("cricket-mobile-target")).toHaveText(/\d+ from \d+ balls/);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${evidence}/09-mobile-portrait-chase.png` });
  expect(errors).toEqual([]); await context.close();
});

test("Cricket 2: remapping persists, duplicate bindings fail and Escape cancels", async ({ page }) => {
  await start(page); await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Controls & rules", exact: true }).click();
  await page.getByRole("button", { name: "action Space", exact: true }).click(); await page.keyboard.press("KeyR");
  await expect(page.getByText("That key is reserved or already assigned. Choose another key.")).toBeVisible();
  await page.keyboard.press("KeyX"); await expect(page.getByRole("button", { name: "action X", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "run R", exact: true }).click(); await page.keyboard.press("Escape");
  await expect(page.getByText("Remapping cancelled.")).toBeVisible();
  await page.keyboard.press("Escape"); await page.keyboard.press("KeyX");
  await expect(page.getByTestId("sinverse-cricket")).toHaveAttribute("data-ceremony", "flight");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("sinverse-cricket")).toHaveAttribute("data-call", "");
  await page.reload();
  // Preference storage is the only persistence here; signed runs/identities never enter it.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sinverse-cricket-controls-v2")!).action)).toBe("KeyX");
});

test("Cricket 2: standard gamepad intents require a call and drive a real delivery", async ({ page }) => {
  await page.addInitScript(() => {
    const pad = { buttons: Array.from({ length: 16 }, () => ({ pressed: false })), axes: [0, 0], mapping: "standard" };
    Object.defineProperty(window, "__cricketQaPad", { value: pad });
    Object.defineProperty(navigator, "getGamepads", { value: () => [pad] });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { root, run } = await start(page), model = new CricketMatch(run.seed, run.config);
  const press = async (index: number) => {
    await page.evaluate(i => { (window as unknown as { __cricketQaPad: { buttons: { pressed: boolean }[] } }).__cricketQaPad.buttons[i]!.pressed = true; }, index);
    await page.waitForTimeout(120);
    await page.evaluate(i => { (window as unknown as { __cricketQaPad: { buttons: { pressed: boolean }[] } }).__cricketQaPad.buttons[i]!.pressed = false; }, index);
    await page.waitForTimeout(120);
  };
  await press(0); await expect(root).toHaveAttribute("data-ceremony", "flight");
  await press(0); await expect(root).toHaveAttribute("data-call", "");
  await press(model.tossFace === "heads" ? 14 : 15);
  await expect(root).toHaveAttribute("data-call", model.tossFace);
  await expect(root).toHaveAttribute("data-ceremony", "decision");
  await press(0); await expect(root).toHaveAttribute("data-ceremony", "done");
  await page.evaluate(() => { (window as unknown as { __cricketQaPad: { axes: number[] } }).__cricketQaPad.axes = [0.5, -0.7]; });
  await expect(root).toHaveAttribute("data-direction", "55"); await expect(root).toHaveAttribute("data-foot", "0.65");
  await press(0); await expect(root).toHaveAttribute("data-live", "true");
  await page.waitForFunction(() => {
    const e = document.querySelector<HTMLElement>('[data-testid="sinverse-cricket"]');
    return e?.dataset.live === "true" && Number(e.dataset.ballTick) > 120;
  }, null, { polling: "raf", timeout: 12000 });
  await press(0);
  await expect(page.getByTestId("cricket-primary")).toContainText("Shot committed");
  await expect(root).toHaveAttribute("data-seq", "1", { timeout: 30000 });
  await expect(page.getByTestId("cricket-commentary")).not.toContainText("integrity check");
});
