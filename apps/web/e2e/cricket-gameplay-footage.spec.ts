import { finishCricketToss } from "./cricket-helpers";
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { CricketMatch, STEP, type Delivery, type ShotInput } from "@platform/engines/sinverse-cricket";
import type { Browser, Page } from "@playwright/test";
import { clickAt, film as filmReplay, range } from "./cricket-film";
import { enterName } from "./helpers";

/**
 * Gameplay footage, run on demand:
 *   CRICKET_EVIDENCE=1 pnpm exec playwright test e2e/cricket-gameplay-footage.spec.ts
 *
 * Asks the engine, offline, for real shots that give each wanted moment (a
 * drive with runs, a pull, a catch, a run-out...), plays each through the real
 * controls, then plays its replay at 1x and records the actual match screen.
 * Playwright's own video recorder doesn't capture the match canvas, so frames
 * are screenshots, assembled into WebM in the browser with MediaRecorder at
 * their real timing. Contact sheets go in the repo; videos go in .data.
 */
test.skip(!process.env.CRICKET_EVIDENCE, "Evidence capture only");
test.use({ trace: "off", launchOptions: { args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const out = process.env.CRICKET_FOOTAGE_DIR ?? "../../artifacts/cricket-footage";
const videos = process.env.CRICKET_VIDEO_DIR ?? "../../.data/cricket-footage";

/** Films the last ball's replay at 1x from `from` with `camera` (contact sheet + WebM). */
const film = (page: Page, browser: Browser, name: string, camera: string, from: number) => filmReplay(page, browser, { name, camera, from, sheets: out, videos });

type Want = { name: string; kinds?: ShotInput["kind"][]; runs?: number[]; test: (d: Delivery) => boolean };
const WANTS: Want[] = [
  { name: "drive-and-run", kinds: ["straight", "on-drive", "cover"], runs: [10, 18, 26, 34], test: (d) => !d.outcome?.wicket && !d.outcome?.boundary && (d.outcome?.completedRuns ?? 0) > 0 },
  { name: "cover-drive-fielded-and-thrown", kinds: ["cover"], test: (d) => !d.outcome?.boundary && d.frames.some((f) => f.mode === "throw") },
  { name: "pull-shot", kinds: ["pull"], test: (d) => !d.outcome?.wicket },
  { name: "catch", test: (d) => d.outcome?.wicket === "caught" },
  { name: "run-out", runs: [6, 12, 18, 26, 34, 44], test: (d) => d.outcome?.wicket === "run-out" },
  { name: "boundary", test: (d) => d.outcome?.boundary === 4 || d.outcome?.boundary === 6 },
];

/** A shot (and run call) that gives `want`, robust to a tick or two of swing jitter. */
function find(model: CricketMatch, want: Want) {
  const field = model.fieldForAI();
  const probe = model.createDelivery({ bowling: null, shot: null, runAt: [], field }, false);
  while (probe.pos.z < 8.6 && !probe.outcome && probe.tick < 400) probe.step();
  const base = Math.max(100, probe.tick - 8),
    face = Number((Math.round(Math.max(-0.6, Math.min(0.6, probe.pos.x / 0.55)) / 0.02) * 0.02).toFixed(2));
  for (const kind of want.kinds ?? (["straight", "cover", "on-drive", "cut", "pull", "loft", "sweep", "defend"] as const))
    for (const direction of [0, -35, 35, -60, 60])
      for (const power of [0.55, 0.8, 1]) {
        const shot = { kind, direction, power, foot: 0, face, tick: base };
        for (const after of want.runs ?? [null]) {
          const ok = [-1, 0, 1].every((shift) => {
            const s = { ...shot, tick: base + shift },
              first = model.createDelivery({ bowling: null, shot: s, runAt: [], field }, true);
            first.complete();
            if (!first.contactTick) return false;
            const d = model.createDelivery({ bowling: null, shot: s, runAt: after === null ? [] : [first.contactTick + after], field }, true);
            d.complete();
            return want.test(d);
          });
          if (ok) return { shot: shot as ShotInput, after };
        }
      }
  return null;
}

test("record real gameplay footage of the match screen", async ({ browser }) => {
  test.setTimeout(1800000);
  mkdirSync(out, { recursive: true });
  mkdirSync(videos, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/play/sinverse-cricket");
  await enterName(page, "Footage");
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

  const log: unknown[] = [];
  let clock = 0;
  for (const want of WANTS) {
    if ((await root.getAttribute("data-phase")) !== "ready" || (await root.getAttribute("data-batting")) !== "true") break;
    const found = find(model, want);
    if (!found) {
      log.push({ want: want.name, found: false });
      continue;
    }
    const { shot, after } = found;
    const seq = Number(await root.getAttribute("data-seq"));
    await page.getByLabel("Shot", { exact: true }).selectOption(shot.kind);
    await range(page, "Aim", shot.direction);
    await range(page, "Power", shot.power);
    await range(page, "Bat face", shot.face);
    await page.getByTestId("cricket-primary").click();
    await expect(root).toHaveAttribute("data-live", "true");
    const swung = clickAt(root, "cricket-primary", shot.tick);
    const actualTick = await swung;
    let runTick: number | null = null;
    if (after !== null) {
      // Call the run at the same moment the engine search did.
      const field = model.fieldForAI();
      const probe = model.createDelivery({ bowling: null, shot: { ...shot, tick: actualTick }, runAt: [], field }, true);
      probe.complete();
      runTick = await clickAt(root, "cricket-run", probe.contactTick + after).catch(() => null);
    }
    await expect(root).toHaveAttribute("data-seq", String(seq + 1), { timeout: 120000 });
    const move = { bowling: null, shot: { ...shot, tick: actualTick }, runAt: runTick ? [runTick] : [], field: model.fieldForAI() };
    const delivery = model.createDelivery(move, true);
    delivery.complete();
    // The model only plans later shots; each clip's real result is checked by the
    // match screen's own replay below, and logged against what was wanted.
    clock += Math.ceil(delivery.tick * STEP * 1000) + 2000;
    const recorded = model.record({ k: "ball", seq: model.seq, ...move, digest: delivery.digest, t: clock }, delivery);
    log.push({ want: want.name, found: true, recorded, outcome: delivery.outcome?.label, wicket: delivery.outcome?.wicket, runs: delivery.outcome?.completedRuns, matched: want.test(delivery) });

    // The replay, at 1x, from just before release to the end, recorded frame by frame.
    log.push({ want: want.name, ...(await film(page, browser, want.name, process.env.CRICKET_CAMERA ?? "broadcast", 60)) });
  }
  writeFileSync(`${out}/footage-log.json`, JSON.stringify(log, null, 2));
  expect(errors).toEqual([]);
  await context.close();
});

type Bowl = { name: string; variation: string; line: number; length: number; cameras: string[] };
const BOWLS: Bowl[] = [
  { name: "fast-seam-good-length", variation: "seam", line: 0.1, length: 4.5, cameras: ["behind", "side"] },
  { name: "fast-inswing-yorker", variation: "inswing", line: 0.2, length: 1, cameras: ["batter"] },
  { name: "spin-offbreak", variation: "offbreak", line: 0.3, length: 4, cameras: ["behind", "keeper"] },
  { name: "spin-legbreak", variation: "legbreak", line: -0.2, length: 4, cameras: ["behind"] },
  { name: "spin-googly", variation: "googly", line: 0, length: 3.5, cameras: ["bowler"] },
  { name: "slower-ball", variation: "slower", line: 0, length: 5, cameras: ["broadcast"] },
];

test("record real bowling footage and the match result", async ({ browser }) => {
  test.setTimeout(1800000);
  mkdirSync(out, { recursive: true });
  mkdirSync(videos, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/play/sinverse-cricket");
  await enterName(page, "Footage");
  const response = page.waitForResponse((r) => r.url().endsWith("/api/solo/start") && r.request().method() === "POST");
  await page.getByTestId("start-run").click();
  const run = await (await response).json();
  const root = page.getByTestId("sinverse-cricket");
  await page.getByLabel("Graphics", { exact: true }).selectOption(process.env.CRICKET_GRAPHICS ?? "high");
  await expect(page.getByText("3D ground ready", { exact: true })).toBeVisible({ timeout: 30000 });
  const model = new CricketMatch(run.seed, run.config);
  await finishCricketToss(page, model.tossFace, "bowl");
  await page.getByRole("button", { name: "Pause match", exact: true }).click();
  await page.getByLabel("Automatic event replays").uncheck();
  await page.getByRole("button", { name: "Return to the middle", exact: true }).click();
  await page.waitForTimeout(2500);

  const log: unknown[] = [];
  for (const bowl of BOWLS) {
    if ((await root.getAttribute("data-phase")) !== "ready" || (await root.getAttribute("data-batting")) !== "false") break;
    const seq = Number(await root.getAttribute("data-seq"));
    await page.getByLabel("Variation", { exact: true }).selectOption(bowl.variation);
    await range(page, "Line", bowl.line);
    await range(page, "Length", bowl.length);
    // Arm, then release on the beat (the release meter centres 2.5 s after arming).
    await page.getByTestId("cricket-primary").click();
    await page.waitForTimeout(2500);
    await page.getByTestId("cricket-primary").click();
    await expect(root).toHaveAttribute("data-seq", String(seq + 1), { timeout: 120000 });
    const entry: Record<string, unknown> = { bowl: bowl.name, release: Number(await root.getAttribute("data-release")), commentary: await page.getByTestId("cricket-commentary").textContent() };
    for (const camera of bowl.cameras) entry[camera] = await film(page, browser, bowl.cameras.length > 1 ? `${bowl.name}-${camera}` : bowl.name, camera, 0);
    log.push(entry);
  }

  writeFileSync(`${out}/bowling-log.json`, JSON.stringify(log, null, 2));
  // The chase: bat out the innings with real swings, then the result screen.
  const chase = page.getByRole("button", { name: "Begin the chase", exact: true }).first();
  await expect(chase).toBeVisible({ timeout: 30000 });
  await chase.click();
  await expect(root).toHaveAttribute("data-batting", "true", { timeout: 15000 });
  await expect(root).toHaveAttribute("data-phase", "ready");
  for (let ball = 0; ball < 12 && (await root.getAttribute("data-phase")) === "ready"; ball++) {
    const seq = Number(await root.getAttribute("data-seq"));
    await page.getByLabel("Shot", { exact: true }).selectOption(ball % 2 ? "cover" : "straight");
    await page.getByTestId("cricket-primary").click();
    await expect(root).toHaveAttribute("data-live", "true");
    await clickAt(root, "cricket-primary", 150).catch(() => null);
    await expect(root).not.toHaveAttribute("data-seq", String(seq), { timeout: 120000 });
    await page.waitForTimeout(1500);
  }
  await expect(root).toHaveAttribute("data-phase", "finished", { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/match-result.png` });
  log.push({ result: await page.locator(".cr-match-finish h2").textContent() });
  writeFileSync(`${out}/bowling-log.json`, JSON.stringify(log, null, 2));
  expect(errors).toEqual([]);
  await context.close();
});
