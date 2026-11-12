import { finishCricketToss } from "./cricket-helpers";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { CricketMatch } from "@platform/engines/sinverse-cricket";
import { enterName } from "./helpers";

/**
 * Per-preset performance benchmark, run on demand:
 *   CRICKET_EVIDENCE=1 pnpm exec playwright test e2e/cricket-benchmark.spec.ts
 *
 * Every preset plays the same real delivery's replay at 1x (identical content:
 * run-up, release, shot, chase), while the page records, at every real draw,
 * the interval since the last draw and the draw's CPU cost (animation, scene
 * sync and command submission). The display runs at its normal 60 Hz; the game
 * draws at most every 15 ms (30 ms on Low, by design). Uncapped vsync-off runs
 * were tried and rejected: Chromium's own pacing then hides the differences.
 * Results depend on this machine's GPU, so they are
 * recorded rather than asserted; the resource budgets live in cricket-visual.
 */
test.skip(!process.env.CRICKET_EVIDENCE, "Evidence capture only");
// CRICKET_BENCH_SOFTWARE=1 uses Chromium's software GPU (SwiftShader), a stand-in for weak hardware.
const software = !!process.env.CRICKET_BENCH_SOFTWARE;
test.use({ trace: "off", launchOptions: { args: software ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const out = process.env.CRICKET_BENCHMARK_DIR ?? "../../artifacts/cricket-benchmark";

async function range(page: Page, label: string, value: number) {
  await page.getByRole("slider", { name: label, exact: true }).evaluate((element, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, String(v));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
const stat = async (root: Locator, name: string) => Number(await root.getAttribute(`data-${name}`));

test("benchmark every graphics preset on the same replayed delivery", async ({ browser }) => {
  test.setTimeout(900000);
  mkdirSync(out, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/play/sinverse-cricket");
  await enterName(page, "Bench");
  const response = page.waitForResponse((r) => r.url().endsWith("/api/solo/start") && r.request().method() === "POST");
  const startedAt = Date.now();
  await page.getByTestId("start-run").click();
  const run = await (await response).json();
  const root = page.getByTestId("sinverse-cricket");
  await expect(page.getByText("3D ground ready", { exact: true })).toBeVisible({ timeout: 30000 });
  const groundMs = Date.now() - startedAt;
  // The athletes and motion clips arrive after the ground; metrics republish about once a second.
  await expect(root).toHaveAttribute("data-athletes", "true", { timeout: 60000 });
  const athletesMs = Date.now() - startedAt;
  await finishCricketToss(page, new CricketMatch(run.seed, run.config).tossFace);
  await page.getByRole("button", { name: "Pause match", exact: true }).click();
  await page.getByLabel("Automatic event replays").uncheck();
  await page.getByRole("button", { name: "Return to the middle", exact: true }).click();

  // One real ball: a drive, swung as the ball arrives.
  const more = page.getByRole("button", { name: "More control +", exact: true });
  if (await more.isVisible()) await more.click();
  await page.getByLabel("Shot", { exact: true }).selectOption("straight");
  await page.getByTestId("cricket-primary").click();
  await expect(root).toHaveAttribute("data-live", "true");
  await root.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        const check = () => {
          const button = element.querySelector('[data-testid="cricket-primary"]') as HTMLButtonElement | null;
          if (Number((element as HTMLElement).dataset.ballZ) > 8 && button && !button.disabled) (observer.disconnect(), button.click(), resolve());
        };
        const observer = new MutationObserver(check);
        observer.observe(element, { attributes: true, attributeFilter: ["data-ball-tick"] });
      }),
  );
  await expect(root).toHaveAttribute("data-live", "false", { timeout: 120000 });

  const results: Record<string, unknown> = {
    /** From pressing start to the 3D ground, and to the realistic athletes with their motion (default preset; includes up to ~1 s of metric publishing). */
    loading: { groundMs, athletesMs },
    machine: await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2"),
        info = gl?.getExtension("WEBGL_debug_renderer_info");
      return { renderer: info ? gl!.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown", cores: navigator.hardwareConcurrency, viewport: "1280x800" };
    }),
  };
  for (const preset of ["low", "medium", "high", "ultra"] as const) {
    const switchedAt = Date.now();
    await page.getByLabel("Graphics", { exact: true }).selectOption(preset);
    // The new scene reports its athletes as not ready, then ready (published about once a second).
    await expect(root).toHaveAttribute("data-athletes", "false", { timeout: 3000 }).catch(() => {});
    await expect(page.getByText("3D ground ready", { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(root).toHaveAttribute("data-athletes", "true", { timeout: 60000 });
    const loadMs = Date.now() - switchedAt;
    await page.waitForTimeout(2500);
    const slider = page.getByRole("slider", { name: "Replay position", exact: true });
    if (!(await slider.isVisible().catch(() => false))) await page.keyboard.press("KeyP");
    await expect(slider).toBeVisible({ timeout: 8000 });
    const pause = page.getByRole("button", { name: "Pause replay", exact: true });
    if (await pause.isVisible()) await pause.click({ timeout: 2000 });
    await page.getByLabel("Replay speed").selectOption("1");
    await page.getByLabel("Camera", { exact: true }).selectOption("broadcast");
    const end = Number(await slider.getAttribute("max"));
    // Replay the delivery from its start until at least 8 s of draws are in. Each
    // real draw records its interval (what a viewer sees) and its CPU cost.
    const gaps: number[] = [],
      costs: number[] = [];
    while (gaps.reduce((x, y) => x + y, 0) < 8000) {
      const pause = page.getByRole("button", { name: "Pause replay", exact: true });
      if (await pause.isVisible()) await pause.click({ timeout: 2000 });
      await range(page, "Replay position", 0);
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: "Play replay", exact: true }).click();
      // Off the controls, so the replay strip fades back as it does for a viewer.
      await page.mouse.move(640, 120);
      const sample = await root.evaluate(
        (element, ms) =>
          new Promise<{ gaps: number[]; costs: number[] }>((resolve) => {
            const out = { gaps: [] as number[], costs: [] as number[] },
              data = (element as HTMLElement).dataset;
            let count = data.draws,
              last = -1;
            const start = performance.now();
            const tick = (now: number) => {
              if (data.draws !== count) {
                count = data.draws;
                if (last >= 0) out.gaps.push(now - last);
                out.costs.push(Number(data.drawMs));
                last = now;
              }
              if (now - start < ms) requestAnimationFrame(tick);
              else resolve(out);
            };
            requestAnimationFrame(tick);
          }),
        (end / 120) * 1000,
      );
      gaps.push(...sample.gaps);
      costs.push(...sample.costs);
    }
    const pct = (list: number[], q: number) => {
      const sorted = [...list].sort((a, b) => a - b);
      return +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!.toFixed(2);
    };
    results[preset] = {
      loadMs,
      draws: gaps.length,
      drawnFps: +(1000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)).toFixed(1),
      intervalMedianMs: pct(gaps, 0.5),
      intervalP95Ms: pct(gaps, 0.95),
      intervalP99Ms: pct(gaps, 0.99),
      intervalMaxMs: pct(gaps, 1),
      hitchesOver50ms: gaps.filter((g) => g > 50).length,
      drawCpuMedianMs: pct(costs, 0.5),
      drawCpuP95Ms: pct(costs, 0.95),
      drawCalls: await stat(root, "draw-calls"),
      triangles: await stat(root, "triangles"),
      textures: await stat(root, "textures"),
      geometries: await stat(root, "geometries"),
      dpr: await stat(root, "dpr"),
      heapMB: await page.evaluate(() => +(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1048576).toFixed(1)),
    };
    await page.getByTestId("cricket-replay-close").click();
    await page.waitForTimeout(600);
  }
  writeFileSync(`${out}/benchmark${software ? "-software" : ""}.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  expect(errors).toEqual([]);
  await context.close();
});
