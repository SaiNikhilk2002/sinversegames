import { finishCricketToss } from "./cricket-helpers";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { CricketMatch, STEP, type Delivery, type ShotInput } from "@platform/engines/sinverse-cricket";
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

async function range(page: Page, label: string, value: number) {
  await page.getByRole("slider", { name: label, exact: true }).evaluate((element, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, String(v));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
/** Clicks a match control the moment the live ball reaches `tick`. */
function clickAt(root: Locator, testId: string, tick: number) {
  return root.evaluate(
    (element, [id, target]) =>
      new Promise<number>((resolve, reject) => {
        const deadline = setTimeout(() => (observer.disconnect(), reject(Error(`${id} window did not arrive`))), 30000);
        const check = () => {
          const at = Number((element as HTMLElement).dataset.ballTick);
          const button = element.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;
          if (at >= (target as number) && button && !button.disabled) {
            observer.disconnect();
            clearTimeout(deadline);
            button.click();
            resolve(at);
          }
        };
        const observer = new MutationObserver(check);
        observer.observe(element, { attributes: true, attributeFilter: ["data-ball-tick"] });
        check();
      }),
    [testId, tick] as const,
  );
}

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

/** Plays frames (data URLs with times in ms) into a WebM at their real timing. */
async function encode(browser: Browser, frames: { at: number; data: string }[]) {
  const page = await browser.newPage();
  const base64 = await page.evaluate(async (list) => {
    const img = new Image();
    const first = await new Promise<HTMLImageElement>((r) => ((img.onload = () => r(img)), (img.src = list[0]!.data)));
    const canvas = document.createElement("canvas");
    canvas.width = first.naturalWidth;
    canvas.height = first.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 3_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.start();
    for (let i = 0; i < list.length; i++) {
      const frame = new Image();
      await new Promise((r) => ((frame.onload = r), (frame.src = list[i]!.data)));
      ctx.drawImage(frame, 0, 0);
      const gap = i + 1 < list.length ? list[i + 1]!.at - list[i]!.at : 120;
      await new Promise((r) => setTimeout(r, gap));
    }
    await new Promise((r) => ((recorder.onstop = r), recorder.stop()));
    const blob = new Blob(chunks, { type: "video/webm" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, frames);
  await page.close();
  return Buffer.from(base64, "base64");
}

/**
 * Opens the last ball's replay and plays it at 1x from `from` (tick) to the end
 * with `camera`, saving a WebM (in .data) and an eight-frame contact sheet.
 */
async function film(page: Page, browser: Browser, name: string, camera: string, from: number) {
  const slider = page.getByRole("slider", { name: "Replay position", exact: true });
  if (!(await slider.isVisible().catch(() => false))) await page.keyboard.press("KeyP");
  await expect(slider).toBeVisible({ timeout: 8000 });
  const pause = page.getByRole("button", { name: "Pause replay", exact: true });
  if (await pause.isVisible()) await pause.click({ timeout: 2000 });
  await page.getByLabel("Replay speed").selectOption("1");
  await page.getByLabel("Camera", { exact: true }).selectOption(camera);
  const end = Number(await slider.getAttribute("max"));
  await range(page, "Replay position", from);
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Play replay", exact: true }).click();
  // Off the controls, so the replay strip fades back as it does for a viewer.
  await page.mouse.move(640, 120);
  const frames: { at: number; data: string }[] = [],
    started = Date.now(),
    length = (end - from) * STEP * 1000 + 1500;
  while (Date.now() - started < length) {
    const shot = await page.screenshot({ type: "jpeg", quality: 72 });
    frames.push({ at: Date.now() - started, data: `data:image/jpeg;base64,${shot.toString("base64")}` });
  }
  writeFileSync(`${videos}/${name}.webm`, await encode(browser, frames));
  // Full-size stills for close review (not committed).
  mkdirSync(`${videos}/${name}`, { recursive: true });
  frames.forEach((f, i) => i % 6 === 0 && writeFileSync(`${videos}/${name}/${String(i).padStart(3, "0")}-${(f.at / 1000).toFixed(2)}s.jpg`, Buffer.from(f.data.split(",")[1]!, "base64")));
  // A contact sheet of eight evenly spaced frames goes into the repository.
  const picks = Array.from({ length: 8 }, (_, i) => frames[Math.min(frames.length - 1, Math.floor((i / 7) * (frames.length - 1)))]!);
  const sheet = await browser.newPage({ viewport: { width: 1280, height: 400 } });
  await sheet.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(4,1fr)">${picks.map((f) => `<figure style="margin:0;position:relative"><img style="width:100%" src="${f.data}"><figcaption style="position:absolute;top:4px;left:6px;color:#fff;font:600 13px system-ui;text-shadow:0 1px 2px #000">${(f.at / 1000).toFixed(1)} s</figcaption></figure>`).join("")}</body>`);
  await sheet.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  await sheet.close();
  await page.getByTestId("cricket-replay-close").click();
  await page.waitForTimeout(800);
  return { frames: frames.length, fps: +(frames.length / (length / 1000)).toFixed(1) };
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
