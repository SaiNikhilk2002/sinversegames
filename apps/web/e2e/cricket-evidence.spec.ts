import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { CricketMatch, RELEASE_TICK, type BallLog, type ShotInput } from "@platform/engines/sinverse-cricket";
import { calibratedShot } from "../../../packages/engines/test/cricket-fixtures";
import { enterName } from "./helpers";

/**
 * Evidence capture, run on demand: CRICKET_EVIDENCE=1 pnpm test:e2e cricket-evidence.
 * Plays real balls through the real controls, without reduced motion, and
 * records real frames. Not part of the normal suite because of its run time.
 */
test.skip(!process.env.CRICKET_EVIDENCE, "Evidence capture only");
test.use({ trace: "off", launchOptions: { args: ["--enable-unsafe-swiftshader"] } });
const out = process.env.CRICKET_EVIDENCE_DIR ?? "../../artifacts/cricket-polish";

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
        const deadline = setTimeout(() => {
          observer.disconnect();
          reject(Error("Swing window did not arrive"));
        }, 30000);
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
type Outcome = { wicket?: string | null; boundary?: number | null; total?: number };
/** Offline search with the same engine for controls likely to give an outcome despite frame-rate jitter in the swing tick. */
function findShot(model: CricketMatch, wanted: (r: Outcome) => boolean) {
  const field = model.fieldForAI();
  const probe = model.createDelivery({ bowling: null, shot: null, runAt: [], field }, false);
  while (probe.pos.z < 8.6 && !probe.outcome && probe.tick < 400) probe.step();
  const base = Math.max(100, probe.tick - 8),
    face = Number((Math.round(Math.max(-0.6, Math.min(0.6, probe.pos.x / 0.55)) / 0.02) * 0.02).toFixed(2));
  let best: { shot: ShotInput; score: number } | null = null;
  for (const kind of ["loft", "straight", "cover", "on-drive", "cut", "pull", "sweep", "defend"] as const)
    for (const direction of [-30, 0, 30])
      for (const power of [0.75, 1]) {
        let score = 0;
        for (const shift of [-4, -2, 0, 2, 4, 6]) {
          const shot: ShotInput = { kind, direction, power, foot: 0, face, tick: base + shift };
          if (wanted(model.createDelivery({ bowling: null, shot, runAt: [], field }, false).complete())) score++;
        }
        if (score && (!best || score > best.score)) best = { score, shot: { kind, direction, power, foot: 0, face, tick: base } };
      }
  return best?.shot ?? null;
}

test("capture real gameplay frames", async ({ browser }) => {
  test.setTimeout(1500000);
  mkdirSync(out, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, recordVideo: { dir: `${out}/raw`, size: { width: 1024, height: 688 } } });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/play/sinverse-cricket");
  await enterName(page, "Cricket Evidence");
  const response = page.waitForResponse((r) => r.url().endsWith("/api/solo/start") && r.request().method() === "POST");
  await page.getByTestId("start-run").click();
  const run = await (await response).json();
  const root = page.getByTestId("sinverse-cricket");
  await expect(root).toBeVisible();
  const graphics = process.env.CRICKET_GRAPHICS ?? "low";
  await page.getByLabel("Graphics", { exact: true }).selectOption(graphics);
  await expect(page.getByText("3D ground ready", { exact: true })).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/01-main-stadium.png` });

  const model = new CricketMatch(run.seed, run.config);
  await page.getByLabel("Toss call").selectOption(model.tossFace);
  await page.getByRole("button", { name: "Call the toss", exact: true }).click();
  model.toss({ k: "toss", call: model.tossFace, decision: "bat", t: 0 });
  await page.getByRole("button", { name: "More control +", exact: true }).click();
  await page.getByLabel("Relaxed presentation pace").uncheck();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/02-batter-ready.png` });

  const seen: Record<string, string> = {},
    log: unknown[] = [];
  let time = 0;
  const settle = graphics === "low" ? 1500 : 2600;
  const skipReplay = async () => {
    // Slow software rendering stretches the delay before an automatic replay, so wait it out.
    await page.getByTestId("cricket-replay-close").waitFor({ timeout: 7000 }).catch(() => {});
    if ((await page.getByTestId("cricket-replay-close").count()) > 0) await page.getByTestId("cricket-replay-close").click();
  };
  // An automatic replay can open at any moment; the primary button then means "skip".
  const primaryAction = async () => {
    const primary = page.getByTestId("cricket-primary");
    for (let n = 0; n < 6; n++) {
      if (!/Skip replay/.test((await primary.textContent()) ?? "")) break;
      await primary.click();
      await page.waitForTimeout(200);
    }
    await primary.click();
  };
  const frames = async (name: string, ticks: [string, number, string][]) => {
    for (const [label, tick, camera] of ticks) {
      await page.getByLabel("Camera", { exact: true }).selectOption(camera);
      await range(page, "Replay position", tick);
      await page.waitForTimeout(settle);
      await page.screenshot({ path: `${out}/${name}-${label}.png` });
    }
  };
  const openReplay = async () => {
    const slider = page.getByRole("slider", { name: "Replay position", exact: true });
    if (!(await slider.isVisible().catch(() => false))) await page.keyboard.press("KeyP");
    await expect(slider).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: "Pause replay", exact: true }).click().catch(() => {});
    return slider;
  };

  // Batting innings: ask the engine which controls suit each wanted result, then play them for real.
  const wants: [string, (r: Outcome) => boolean][] = [
    ["six", (r) => r.boundary === 6],
    ["four", (r) => r.boundary === 4],
    ["wicket", (r) => !!r.wicket],
    ["runs", (r) => !r.boundary && !r.wicket && (r.total ?? 0) > 0],
  ];
  while ((await root.getAttribute("data-phase")) === "ready" && (await root.getAttribute("data-batting")) === "true") {
    await skipReplay();
    const seq = Number(await root.getAttribute("data-seq"));
    // A bowling-focused run still sets a target, so the second innings lasts its full over.
    const bowlingRun = process.env.CRICKET_PHASE === "bowling";
    const want = bowlingRun ? wants[0] : wants.find(([k]) => !seen[k]);
    const selected = (want && findShot(model, want[1])) ?? calibratedShot(model);
    const face = Number((Math.round(selected.face / 0.02) * 0.02).toFixed(2));
    await page.getByLabel("Shot", { exact: true }).selectOption(selected.kind);
    await range(page, "Aim", selected.direction);
    await range(page, "Power", selected.power);
    await range(page, "Bat face", face);
    await primaryAction();
    await expect(root).toHaveAttribute("data-live", "true");
    const actual = { ...selected, face, tick: await swingAt(root, selected.tick) };
    if (want?.[0] === "six" && !bowlingRun)
      await page
        .waitForFunction(() => Number((document.querySelector('[data-testid="sinverse-cricket"]') as HTMLElement).dataset.ballY) > 7, null, { timeout: 8000 })
        .then(() => page.screenshot({ path: `${out}/live-ball-climbing.png` }))
        .catch(() => {});
    await expect(root).toHaveAttribute("data-seq", String(seq + 1), { timeout: 120000 });
    const move = { bowling: null, shot: actual, runAt: [], field: model.fieldForAI() };
    const delivery = model.createDelivery(move);
    const result = delivery.complete();
    time += 5000;
    const entry: BallLog = { k: "ball", seq: model.seq, ...move, digest: delivery.digest, t: time };
    model.record(entry, delivery);
    const kind = result.wicket ? "wicket" : result.boundary === 6 ? "six" : result.boundary === 4 ? "four" : result.total ? "runs" : "dot";
    log.push({ ball: seq + 1, want: want?.[0], kind, wicket: result.wicket, shot: actual, contactTick: delivery.contactTick });
    const contact = delivery.contactTick > 0 ? delivery.contactTick : 180;
    const first = Object.keys(seen).length === 0;
    if (!seen[kind] && !bowlingRun) {
      seen[kind] = `ball ${seq + 1}`;
      await page.waitForTimeout(1100);
      await page.screenshot({ path: `${out}/result-${kind}-reaction.png` });
      await openReplay();
      await frames(`ball-${kind}`, [
        ...(first
          ? ([
              ["runup", 50, "side"],
              ["gather", RELEASE_TICK - 22, "bowler"],
              ["release", RELEASE_TICK, "side"],
              ["release-behind", RELEASE_TICK, "behind"],
            ] as [string, number, string][])
          : []),
        ["before-contact", contact - 6, "behind"],
        ["contact", contact, "slip"],
        ["contact-side", contact + 1, "side"],
        ["follow", contact + 22, "keeper"],
        ["flight", contact + 90, "track"],
        ["end", delivery.tick - 6, "broadcast"],
      ]);
      await page.getByTestId("cricket-replay-close").click();
    }
    await page.waitForTimeout(300);
    if ((await root.getAttribute("data-phase")) !== "ready") break;
  }
  await skipReplay();

  // Bowling innings through the real release control: keeper takes and fielding events.
  if ((await root.getAttribute("data-phase")) === "interval") {
    await page.screenshot({ path: `${out}/innings-interval.png` });
    await primaryAction();
    await expect(root).toHaveAttribute("data-phase", "ready");
  }
  let bowled = 0;
  while ((await root.getAttribute("data-phase")) === "ready") {
    await skipReplay();
    const seq = Number(await root.getAttribute("data-seq"));
    await primaryAction();
    await page.waitForTimeout(560);
    await primaryAction();
    await expect(root).toHaveAttribute("data-seq", String(seq + 1), { timeout: 120000 });
    bowled++;
    log.push({ bowled, said: await page.getByTestId("cricket-commentary").textContent() });
    const slider = await openReplay();
    const end = Number(await slider.getAttribute("max")),
      hit = await page.getByRole("button", { name: "Contact", exact: true }).isVisible();
    await frames(
      `bowling-${bowled}`,
      hit
        ? [
            ["contact", RELEASE_TICK + 60, "broadcast"],
            ["field", Math.max(RELEASE_TICK, end - 24), "track"],
          ]
        : [
            ["keeper-take", Math.min(end, RELEASE_TICK + 66), "keeper"],
            ["keeper-side", Math.min(end, RELEASE_TICK + 70), "side"],
          ],
    );
    await page.getByTestId("cricket-replay-close").click();
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/match-result.png` });
  await page.getByRole("button", { name: /Scorecard/ }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/scorecard.png` });
  await page.keyboard.press("Escape");
  writeFileSync(`${out}/events.json`, JSON.stringify({ seen, log, errors, graphics }, null, 2));
  const video = page.video();
  await context.close();
  if (video) renameSync(await video.path(), `${out}/gameplay-${graphics}.webm`);
  expect(errors).toEqual([]);
});
