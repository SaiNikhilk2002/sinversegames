import { finishCricketToss } from "./cricket-helpers";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { CricketMatch, STEP, type ShotInput } from "@platform/engines/sinverse-cricket";
import { enterName } from "./helpers";

/**
 * Fielding evidence, run on demand:
 *   CRICKET_EVIDENCE=1 pnpm exec playwright test e2e/cricket-fielding-evidence.spec.ts
 * Asks the engine for real shots whose deliveries include a pickup and a throw,
 * plays them through the real controls, then steps the replay through the
 * chase, pickup, release, flight and take, from several cameras.
 */
test.skip(!process.env.CRICKET_EVIDENCE, "Evidence capture only");
test.use({ trace: "off", launchOptions: { args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const out = process.env.CRICKET_EVIDENCE_DIR ?? "../../artifacts/cricket-motion";

async function range(page: Page, label: string, value: number) {
  await page.getByRole("slider", { name: label, exact: true }).evaluate((element, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, String(v));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
async function swingAt(root: Locator, tick: number) {
  return root.evaluate(
    (element, target) =>
      new Promise<number>((resolve, reject) => {
        const deadline = setTimeout(() => (observer.disconnect(), reject(Error("Swing window did not arrive"))), 30000);
        const check = () => {
          const at = Number((element as HTMLElement).dataset.ballTick);
          if (at >= target) {
            observer.disconnect();
            clearTimeout(deadline);
            (element.querySelector('[data-testid="cricket-primary"]') as HTMLButtonElement).click();
            resolve(at);
          }
        };
        const observer = new MutationObserver(check);
        observer.observe(element, { attributes: true, attributeFilter: ["data-ball-tick"] });
        check();
      }),
    tick,
  );
}
/** A shot, found with the same engine, whose delivery is fielded and thrown in. */
function fieldedShot(model: CricketMatch, exclude: Set<string>) {
  const field = model.fieldForAI();
  const probe = model.createDelivery({ bowling: null, shot: null, runAt: [], field }, false);
  while (probe.pos.z < 8.6 && !probe.outcome && probe.tick < 400) probe.step();
  const base = Math.max(100, probe.tick - 8),
    face = Number((Math.round(Math.max(-0.6, Math.min(0.6, probe.pos.x / 0.55)) / 0.02) * 0.02).toFixed(2));
  for (const kind of ["cover", "straight", "on-drive", "cut", "pull", "defend"] as const)
    for (const direction of [-35, 0, 35])
      for (const power of [0.6, 0.85]) {
        const key = `${kind}:${direction}`;
        if (exclude.has(key)) continue;
        // Robust to a tick or two of swing jitter: every shift must be fielded and thrown.
        const thrown = [-2, 0, 2].every((shift) => {
          const d = model.createDelivery({ bowling: null, shot: { kind, direction, power, foot: 0, face, tick: base + shift }, runAt: [], field }, true);
          d.complete();
          return d.frames.some((f) => f.mode === "throw") && !d.outcome?.boundary;
        });
        if (thrown) return { key, shot: { kind, direction, power, foot: 0, face, tick: base } as ShotInput };
      }
  return null;
}

test("capture fielding: chase, pickup, throw and take", async ({ browser }) => {
  test.setTimeout(900000);
  mkdirSync(out, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: `${out}/video`, size: { width: 1280, height: 800 } } });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/play/sinverse-cricket");
  await enterName(page, "Fielding Evidence");
  const response = page.waitForResponse((r) => r.url().endsWith("/api/solo/start") && r.request().method() === "POST");
  await page.getByTestId("start-run").click();
  const run = await (await response).json();
  const root = page.getByTestId("sinverse-cricket");
  await page.getByLabel("Graphics", { exact: true }).selectOption(process.env.CRICKET_GRAPHICS ?? "high");
  await expect(page.getByText("3D ground ready", { exact: true })).toBeVisible({ timeout: 30000 });
  const model = new CricketMatch(run.seed, run.config);
  await finishCricketToss(page, model.tossFace);
  await page.getByRole("button", { name: "Pause match", exact: true }).click();
  await page.getByLabel("Automatic event replays").uncheck();
  await page.getByRole("button", { name: "Return to the middle", exact: true }).click();
  model.toss({ k: "toss", call: model.tossFace, decision: "bat", t: 0 });
  await page.getByRole("button", { name: "More control +", exact: true }).click();
  await page.getByLabel("Relaxed presentation pace").uncheck();
  await page.waitForTimeout(2500);

  const tried = new Set<string>(),
    log: unknown[] = [];
  let captured = 0;
  for (let ball = 0; ball < 6 && captured < 2; ball++) {
    if ((await root.getAttribute("data-phase")) !== "ready" || (await root.getAttribute("data-batting")) !== "true") break;
    const found = fieldedShot(model, tried);
    if (!found) break;
    tried.add(found.key);
    const seq = Number(await root.getAttribute("data-seq"));
    await page.getByLabel("Shot", { exact: true }).selectOption(found.shot.kind);
    await range(page, "Aim", found.shot.direction);
    await range(page, "Power", found.shot.power);
    await range(page, "Bat face", found.shot.face);
    await page.getByTestId("cricket-primary").click();
    await expect(root).toHaveAttribute("data-live", "true");
    const actual = { ...found.shot, tick: await swingAt(root, found.shot.tick) };
    await expect(root).toHaveAttribute("data-seq", String(seq + 1), { timeout: 120000 });
    const move = { bowling: null, shot: actual, runAt: [], field: model.fieldForAI() };
    const delivery = model.createDelivery(move, true);
    delivery.complete();
    model.record({ k: "ball", seq: model.seq, ...move, digest: delivery.digest, t: 0 }, delivery);
    // The engine throws exactly 38 ticks after the pickup (recorded frames are sparse).
    const thrown = delivery.frames.find((f) => f.mode === "throw")?.tick,
      pickup = thrown === undefined ? undefined : thrown - 38;
    log.push({ ball: seq + 1, shot: actual, contact: delivery.contactTick, pickup, thrown, end: delivery.tick, outcome: delivery.outcome });
    if (!pickup || !thrown) continue;
    captured++;
    const slider = page.getByRole("slider", { name: "Replay position", exact: true });
    if (!(await slider.isVisible().catch(() => false))) await page.keyboard.press("KeyP");
    await expect(slider).toBeVisible({ timeout: 8000 });
    const pause = page.getByRole("button", { name: "Pause replay", exact: true });
    if (await pause.isVisible()) await pause.click({ timeout: 2000 });
    const contact = delivery.contactTick;
    const shots: [string, number, string][] = [
      ["1-chase", Math.round((contact + pickup) / 2), "track"],
      ["2-arrive", pickup - 12, "track"],
      ["3-pickup", pickup + 6, "track"],
      ["4-windup", thrown - 12, "track"],
      ["5-release", thrown, "track"],
      ["6-flight", thrown + 10, "track"],
      ["7-flight-wide", thrown + 16, "broadcast"],
      ["8-take", Math.max(thrown + 1, delivery.tick - 4), "keeper"],
    ];
    for (const [label, tick, camera] of shots) {
      await page.getByLabel("Camera", { exact: true }).selectOption(camera);
      await range(page, "Replay position", tick);
      await page.waitForTimeout(1400);
      await page.screenshot({ path: `${out}/fielding-${captured}-${label}.png` });
    }
    // And the same delivery played through at full speed, for the video.
    await page.getByLabel("Camera", { exact: true }).selectOption("track");
    await range(page, "Replay position", contact);
    await page.getByRole("button", { name: "Play replay", exact: true }).click().catch(() => {});
    await page.waitForTimeout(Math.ceil((delivery.tick - contact) * STEP * 1000 * 2.2) + 1200);
    await page.getByTestId("cricket-replay-close").click();
    await page.waitForTimeout(600);
  }
  writeFileSync(`${out}/fielding-events.json`, JSON.stringify(log, null, 2));
  expect(captured, "fielded and thrown deliveries captured").toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await context.close();
});
