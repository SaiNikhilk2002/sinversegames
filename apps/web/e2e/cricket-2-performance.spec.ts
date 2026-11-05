import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { enterName } from "./helpers";
import { finishCricketToss } from "./cricket-helpers";

test.use({ trace: "off", launchOptions: { args: ["--enable-unsafe-swiftshader"] } });
test("Cricket 2: measure software-GPU rendering under desktop and emulated mobile CPU profiles", async ({ browser }) => {
  test.setTimeout(180000);
  const results: unknown[] = [];
  mkdirSync("../../artifacts/cricket-2/performance", { recursive: true });
  for (const [name, width, height, graphics, cpu] of [["desktop-low", 1280, 800, "low", 1], ["desktop-medium", 1280, 800, "medium", 1], ["mobile-low-cpu4", 844, 390, "low", 4]] as const) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 900, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/play/sinverse-cricket"); await enterName(page, "Cricket measured QA"); await page.getByTestId("start-run").click();
    await page.getByLabel("Graphics", { exact: true }).selectOption(graphics);
    await finishCricketToss(page);
    const root = page.getByTestId("sinverse-cricket");
    await expect(page.getByText("3D ground ready", { exact: true })).toBeVisible();
    const cdp = await context.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    // Live approach and a real physics delivery, not the title screen.
    await page.getByTestId("cricket-primary").click();
    if (await page.getByRole("meter", { name: "Release timing" }).isVisible()) { await page.waitForTimeout(2300); await page.getByTestId("cricket-primary").click(); }
    const samples = await page.evaluate(() => new Promise<number[]>(resolve => {
      const values: number[] = []; let previous = performance.now();
      const sample = (now: number) => { values.push(now - previous); previous = now; if (values.length >= 45) resolve(values.slice(5)); else requestAnimationFrame(sample); };
      requestAnimationFrame(sample);
    }));
    samples.sort((a, b) => a - b);
    const metrics = await root.evaluate(e => ({ calls: Number((e as HTMLElement).dataset.drawCalls), triangles: Number((e as HTMLElement).dataset.triangles), textures: Number((e as HTMLElement).dataset.textures), geometries: Number((e as HTMLElement).dataset.geometries), dpr: Number((e as HTMLElement).dataset.dpr) }));
    expect(metrics.calls).toBeGreaterThan(0); expect(metrics.calls).toBeLessThan(150); expect(metrics.triangles).toBeLessThan(300000);
    results.push({ name, width, height, graphics, cpuThrottling: cpu, renderer: "Chromium SwiftShader (software GPU)", medianFrameMs: samples[20], p95FrameMs: samples[38], metrics });
    await page.screenshot({ path: `../../artifacts/cricket-2/performance/${name}.png` });
    await context.close();
  }
  writeFileSync("../../artifacts/cricket-2/performance/measurements.json", JSON.stringify({ measuredAt: new Date().toISOString(), physicalDevice: false, results }, null, 2));
});
