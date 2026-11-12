import { finishCricketToss } from "./cricket-helpers";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { CricketMatch, RELEASE_TICK, STEP, type Delivery, type Frame, type ShotInput } from "@platform/engines/sinverse-cricket";
import { clickAt, encode, film, range, still } from "./cricket-film";
import { enterName } from "./helpers";

/**
 * Fielding, wicketkeeping, celebration and result footage, run on demand:
 *   CRICKET_EVIDENCE=1 pnpm exec playwright test e2e/cricket-phase5-footage.spec.ts
 *   (CRICKET_PHASE5_ONLY=high-catch,run-out films some scenes; CRICKET_PHASE5_VICTORY=1 adds a whole match.)
 *
 * Controlled scenarios: for each ball actually bowled, the engine is asked
 * offline for inputs (shot, footwork, bat face, when to run) that give the
 * wanted moment on that ball (a sprint and pickup and throw, a high catch, a
 * diving catch, a run-out, a stumping, a keeper's take, a four), robust to a
 * tick of jitter either way. Each is then played through the real controls and
 * its replay filmed at 1920x1080 from the match screen.
 */
test.skip(!process.env.CRICKET_EVIDENCE, "Evidence capture only");
test.use({ trace: "off", actionTimeout: 30000, launchOptions: { args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const sheets = process.env.CRICKET_PHASE5_DIR ?? "../../artifacts/cricket-phase5";
const videos = process.env.CRICKET_PHASE5_VIDEO_DIR ?? "../../.data/cricket-phase5";

type Plan = { shot: ShotInput | null; runAt: number[] };
type Scene = {
  name: string;
  kinds: ShotInput["kind"][];
  feet: number[];
  dirs: number[];
  powers: number[];
  /** Bat face offset from the ball's line (an edge or a miss), metres. */
  lateral?: number;
  /** Ticks after the swing to press Run (none: no run). */
  run?: number[];
  /** No shot at all. */
  leave?: boolean;
  test: (d: Delivery) => boolean;
  /** Cameras to film from: [camera, speed, ticks before the moment, ticks after, tail ms]. */
  cameras: [string, number, number, number, number][];
  /** The moment to centre on. */
  moment: (d: Delivery) => number;
};
const frames = (d: Delivery) => d.frames as Frame[];
const firstAction = (d: Delivery, action: Frame["actions"][number], keeper = false) => frames(d).find((f) => f.actions.some((a, k) => a === action && (keeper ? k === 10 : k < 10)));
const SCENES: Scene[] = [
  {
    name: "sprint-pickup-throw",
    kinds: ["cover", "on-drive", "straight", "cut", "pull"],
    feet: [0.2, 0],
    dirs: [55, -55, 35, -35, 75, -75],
    powers: [0.85, 1],
    test: (d) => {
      if (d.outcome?.wicket || d.outcome?.boundary) return false;
      const pick = firstAction(d, "pickup");
      if (!pick) return false;
      const k = pick.actions.findIndex((a) => a === "pickup");
      return k < 10 && pick.travel[k]! > 0.8 && frames(d).some((f) => f.actions[k] === "throw");
    },
    cameras: [
      ["director", 1, 160, 120, 600],
      ["fielding", 0.5, 120, 60, 400],
    ],
    moment: (d) => firstAction(d, "pickup")!.tick,
  },
  {
    name: "high-catch",
    kinds: ["loft", "pull", "on-drive", "cover"],
    feet: [0.35, 0, -0.2],
    dirs: [0, 20, -20, 40, -40, 60, -60],
    powers: [0.85, 1, 0.7],
    test: (d) => {
      if (d.outcome?.wicket !== "caught") return false;
      const f = firstAction(d, "catch");
      return !!f && f.ball.y > 1.45 && f.actions.findIndex((a) => a === "catch") < 9;
    },
    cameras: [
      ["director", 1, 150, 10, 5200],
      ["fielding", 0.5, 70, 10, 1600],
    ],
    moment: (d) => firstAction(d, "catch")!.tick,
  },
  {
    name: "diving-catch",
    kinds: ["loft", "cover", "cut", "pull", "on-drive", "straight"],
    feet: [0.2, 0, -0.2],
    dirs: [0, 25, -25, 45, -45, 70, -70],
    powers: [0.7, 0.85, 1],
    test: (d) => d.outcome?.wicket === "caught" && !!firstAction(d, "dive"),
    cameras: [
      ["director", 1, 150, 10, 5200],
      ["fielding", 0.5, 70, 10, 2600],
    ],
    moment: (d) => firstAction(d, "dive")!.tick,
  },
  {
    name: "dropped-catch",
    kinds: ["loft", "cover", "pull", "on-drive", "cut", "straight"],
    feet: [0.35, 0.2, 0, -0.2],
    dirs: [0, 25, -25, 45, -45, 70, -70],
    powers: [0.7, 0.85, 1],
    // The engine says the chance went down: the fielder gets there and the ball doesn't stick.
    test: (d) => !d.outcome?.wicket && !!firstAction(d, "drop"),
    cameras: [
      ["director", 1, 150, 60, 2500],
      ["fielding", 0.5, 70, 50, 1200],
    ],
    moment: (d) => firstAction(d, "drop")!.tick,
  },
  {
    name: "run-out",
    kinds: ["defend", "on-drive", "cover", "straight"],
    feet: [0.3, 0],
    dirs: [30, -30, 15, -15, 45],
    powers: [0.4, 0.6],
    run: [12, 20],
    test: (d) => d.outcome?.wicket === "run-out",
    cameras: [
      ["director", 1, 170, 10, 5000],
      ["keeper", 0.5, 70, 10, 1500],
    ],
    moment: (d) => frames(d).at(-1)!.tick,
  },
  {
    name: "stumping",
    kinds: ["straight", "cover", "loft"],
    feet: [0.45],
    dirs: [0, 20, -20],
    powers: [0.85],
    lateral: 0.46,
    test: (d) => d.outcome?.wicket === "stumped",
    cameras: [
      ["keeper", 0.5, 60, 10, 2600],
      ["director", 1, 130, 10, 4800],
    ],
    moment: (d) => frames(d).at(-1)!.tick,
  },
  {
    name: "keeper-take",
    kinds: [],
    feet: [0],
    dirs: [0],
    powers: [0],
    leave: true,
    test: (d) => !d.outcome?.wicket && !!firstAction(d, "catch", true),
    cameras: [
      ["keeper", 0.5, 50, 20, 900],
      ["slip", 0.5, 50, 20, 600],
    ],
    moment: (d) => firstAction(d, "catch", true)!.tick,
  },
  {
    name: "boundary-four",
    kinds: ["cover", "pull", "straight", "on-drive", "cut"],
    feet: [0.35, 0, -0.2],
    dirs: [40, -60, 0, -30, 80],
    powers: [1, 0.85],
    test: (d) => d.outcome?.boundary === 4 && !d.outcome.wicket,
    cameras: [["director", 1, 150, 10, 5200]],
    moment: (d) => frames(d).at(-1)!.tick,
  },
];

/** The ball this match will bowl next: when and where it reaches each footwork's bat line. */
function probe(model: CricketMatch) {
  const field = model.fieldForAI(),
    d = model.createDelivery({ bowling: null, shot: null, runAt: [], field }, false),
    path: { tick: number; x: number; z: number }[] = [];
  while (d.pos.z < 9.2 && !d.outcome && d.tick < 420) {
    d.step();
    path.push({ tick: d.tick, x: d.pos.x, z: d.pos.z });
  }
  return { field, at: (foot: number) => path.find((p) => p.z >= 8.8 - foot * 0.45) ?? path.at(-1)! };
}

/** Inputs that give `scene` on this ball, robust to a tick of jitter on the swing and the run. */
function find(model: CricketMatch, scene: Scene): Plan | null {
  const { field, at } = probe(model);
  const check = (plan: Plan) =>
    [-1, 0, 1].every((shift) => {
      const d = model.createDelivery({ bowling: null, shot: plan.shot && { ...plan.shot, tick: plan.shot.tick + shift }, runAt: plan.runAt.map((t) => t + shift), field }, true);
      d.complete();
      return scene.test(d);
    });
  if (scene.leave) return check({ shot: null, runAt: [] }) ? { shot: null, runAt: [] } : null;
  for (const kind of scene.kinds)
    for (const foot of scene.feet)
      for (const direction of scene.dirs)
        for (const power of scene.powers)
          for (const side of scene.lateral ? [1, -1] : [0])
            for (const run of scene.run ?? [null]) {
              const ball = at(foot),
                aimX = Math.sin((direction * Math.PI) / 180) * 0.45,
                rawFace = (ball.x + side * (scene.lateral ?? 0) - aimX) / 0.55,
                face = Number((Math.round(Math.max(-0.6, Math.min(0.6, rawFace)) / 0.02) * 0.02).toFixed(2));
              const shot = { kind, direction, power, foot, face, tick: ball.tick - 8 },
                plan = { shot, runAt: run === null ? [] : [shot.tick + run] };
              if (check(plan)) return plan;
            }
  return null;
}
/** A safe defensive push for a ball no scene can use, so the innings lasts. */
const SURVIVE: Scene = { name: "survive", kinds: ["defend"], feet: [0.4, 0, -0.2, 0.25], dirs: [0, 15, -15, 30, -30], powers: [0.3], test: (d) => !d.outcome?.wicket, cameras: [], moment: () => 0 };

async function startMatch(page: Page, overs: "1" | "2" = "2") {
  // Leaving a match in progress asks for confirmation; a new match should go ahead.
  if (!(page as Page & { __leaveOk?: boolean }).__leaveOk) {
    page.on("dialog", (d) => void d.accept());
    (page as Page & { __leaveOk?: boolean }).__leaveOk = true;
  }
  await page.goto("/play/sinverse-cricket", { timeout: 60000 });
  // A returning player's name is remembered: only the first visit asks for it.
  await page.getByTestId("start-run").or(page.getByLabel("Display name")).first().waitFor();
  if (await page.getByLabel("Display name").isVisible()) await enterName(page, "Batter");
  await page.getByLabel("Custom format").selectOption(overs, { timeout: 5000 }).catch(() => {});
  const response = page.waitForResponse((r) => r.url().endsWith("/api/solo/start") && r.request().method() === "POST");
  await page.getByTestId("start-run").click();
  const run = await (await response).json();
  await page.getByLabel("Graphics", { exact: true }).selectOption(process.env.CRICKET_GRAPHICS ?? "high");
  await expect(page.getByText("3D ground ready", { exact: true })).toBeVisible({ timeout: 30000 });
  const model = new CricketMatch(run.seed, run.config);
  await finishCricketToss(page, model.tossFace, "bat");
  await page.getByRole("button", { name: "Pause match", exact: true }).click();
  await page.getByLabel("Automatic event replays").uncheck();
  await page.getByRole("button", { name: "Return to the middle", exact: true }).click();
  model.toss({ k: "toss", call: model.tossFace, decision: "bat", t: 0 });
  await page.getByRole("button", { name: "More control +", exact: true }).click();
  await page.getByLabel("Relaxed presentation pace").uncheck();
  await page.waitForTimeout(2000);
  return model;
}

/** Plays one ball through the real controls with `plan` and records it in the offline model. */
async function playBall(page: Page, model: CricketMatch, plan: Plan, clock: { t: number }) {
  const root = page.getByTestId("sinverse-cricket");
  if (plan.shot) {
    await page.getByLabel("Shot", { exact: true }).selectOption(plan.shot.kind);
    await range(page, "Aim", plan.shot.direction);
    await range(page, "Power", plan.shot.power);
    await range(page, "Footwork", plan.shot.foot);
    await range(page, "Bat face", plan.shot.face);
  }
  const seq = Number(await root.getAttribute("data-seq"));
  await page.getByTestId("cricket-primary").click();
  await expect(root).toHaveAttribute("data-live", "true");
  const swung = plan.shot ? await clickAt(root, "cricket-primary", plan.shot.tick) : null;
  const ran = plan.runAt.length && swung !== null ? await clickAt(root, "cricket-run", swung + (plan.runAt[0]! - plan.shot!.tick)) : null;
  await expect(root).toHaveAttribute("data-seq", String(seq + 1), { timeout: 120000 });
  const move = { bowling: null, shot: plan.shot && swung !== null ? { ...plan.shot, tick: swung } : null, runAt: ran !== null ? [ran] : [], field: model.fieldForAI() };
  const delivery = model.createDelivery(move, true);
  delivery.complete();
  clock.t += Math.ceil(delivery.tick * (1000 / 120)) + 2000;
  model.record({ k: "ball", seq: model.seq, ...move, digest: delivery.digest, t: clock.t }, delivery);
  return delivery;
}

test("record fielding, keeping and celebration footage", async ({ browser }) => {
  test.setTimeout(3600000);
  mkdirSync(`${sheets}/stills`, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const root = page.getByTestId("sinverse-cricket"),
    only = process.env.CRICKET_PHASE5_ONLY?.split(","),
    remaining = SCENES.filter((s) => !only || only.includes(s.name)),
    log: Record<string, unknown>[] = [],
    clock = { t: 0 };
  let matches = 0,
    model = await startMatch(page);
  matches++;
  while (remaining.length && matches <= 10) {
    if ((await root.getAttribute("data-phase")) !== "ready" || (await root.getAttribute("data-batting")) !== "true") {
      model = await startMatch(page);
      matches++;
      continue;
    }
    let scene: Scene | null = null,
      plan: Plan | null = null;
    for (const s of remaining) {
      const found = find(model, s);
      if (found) {
        scene = s;
        plan = found;
        break;
      }
    }
    const d = await playBall(page, model, plan ?? find(model, SURVIVE) ?? { shot: null, runAt: [] }, clock);
    const ok = !!scene && scene.test(d);
    console.log(`match ${matches} ball ${model.seq}: want ${scene?.name ?? "-"} -> ${d.outcome?.label} filmed=${ok}`);
    if (!scene || !ok) continue;
    remaining.splice(remaining.indexOf(scene), 1);
    const moment = scene.moment(d);
    await page.waitForTimeout(1700);
    const read = async (n: string) => (await root.getAttribute(`data-${n}`)) || null;
    const entry: Record<string, unknown> = { scene: scene.name, outcome: d.outcome?.label, moment, takeError: await read("take-error"), takeMove: await read("take-move"), spacing: await read("spacing"), films: [] };
    await still(page, moment, scene.cameras[0]![0] === "director" ? "fielding" : scene.cameras[0]![0], `${sheets}/stills/${scene.name}-moment.jpg`);
    await page.getByTestId("cricket-replay-close").click();
    for (const [camera, speed, before, after, tail] of scene.cameras) {
      const r = await film(page, browser, { name: `${scene.name}-${camera}`, camera, from: Math.max(0, moment - before), to: moment + after, speed, sheets, videos, sheetType: "jpeg", tail });
      (entry.films as unknown[]).push({ camera, ...r });
    }
    log.push(entry);
    writeFileSync(`${sheets}/phase5-log${only ? `-${only.join("-")}` : ""}.json`, JSON.stringify(log, null, 2));
  }
  log.push({ missing: remaining.map((s) => s.name), matches });
  writeFileSync(`${sheets}/phase5-log${only ? `-${only.join("-")}` : ""}.json`, JSON.stringify(log, null, 2));
  expect(errors).toEqual([]);
  await context.close();
});

test("record a whole match through to the result", async ({ browser }) => {
  test.skip(!process.env.CRICKET_PHASE5_VICTORY, "Whole-match capture only on request");
  test.setTimeout(1800000);
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const root = page.getByTestId("sinverse-cricket"),
    clock = { t: 0 };
  const model = await startMatch(page, "1");
  // Bat the over: a boundary where the engine offers one, otherwise runs, otherwise survive, so there's a real chase.
  const four = SCENES.find((s) => s.name === "boundary-four")!,
    runs: Scene = { ...four, name: "runs", kinds: ["cover", "on-drive", "straight", "cut", "pull", "loft"], dirs: [40, -40, 60, -60, 0, 80], powers: [0.85, 1, 0.7], test: (d) => !d.outcome?.wicket && (d.outcome?.bat ?? 0) > 0 };
  while ((await root.getAttribute("data-phase")) === "ready" && (await root.getAttribute("data-batting")) === "true") await playBall(page, model, find(model, four) ?? find(model, runs) ?? find(model, SURVIVE) ?? { shot: null, runAt: [] }, clock);
  await page.getByRole("button", { name: "Begin the chase", exact: true }).click();
  await page.getByLabel("Camera", { exact: true }).selectOption("broadcast");
  // Bowl the chase: run in, the release fires itself on the marker.
  for (let n = 0; n < 12 && (await root.getAttribute("data-phase")) !== "finished"; n++) {
    const seq = Number(await root.getAttribute("data-seq"));
    await page.getByTestId("cricket-primary").click();
    // Release in the gold zone as a player would (the automatic release is late and oversteps).
    const meter = page.getByRole("meter", { name: "Release timing" });
    await expect.poll(async () => Number(await meter.getAttribute("aria-valuenow").catch(() => "-1")), { timeout: 10000, intervals: [30] }).toBeGreaterThanOrEqual(-0.05);
    await page.getByTestId("cricket-primary").click();
    await expect(root).toHaveAttribute("data-seq", String(seq + 1), { timeout: 120000 });
  }
  await expect(root).toHaveAttribute("data-phase", "finished", { timeout: 60000 });
  // The result as it plays out live: reactions, the result camera, the finish card.
  const frames: { at: number; data: string }[] = [],
    started = Date.now();
  while (Date.now() - started < 12000) {
    const shot = await page.screenshot({ type: "jpeg", quality: 82 });
    frames.push({ at: Date.now() - started, data: `data:image/jpeg;base64,${shot.toString("base64")}` });
  }
  mkdirSync(`${videos}/match-result`, { recursive: true });
  mkdirSync(sheets, { recursive: true });
  writeFileSync(`${videos}/match-result.webm`, await encode(browser, frames));
  frames.forEach((f, i) => i % 4 === 0 && writeFileSync(`${videos}/match-result/${String(i).padStart(3, "0")}.jpg`, Buffer.from(f.data.split(",")[1]!, "base64")));
  const picks = Array.from({ length: 8 }, (_, i) => frames[Math.min(frames.length - 1, Math.floor((i / 7) * (frames.length - 1)))]!);
  const sheet = await browser.newPage({ viewport: { width: 1920, height: 400 } });
  await sheet.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(4,1fr)">${picks.map((f) => `<figure style="margin:0;position:relative"><img style="width:100%" src="${f.data}"><figcaption style="position:absolute;top:4px;left:6px;color:#fff;font:600 19px system-ui;text-shadow:0 1px 2px #000">${(f.at / 1000).toFixed(2)} s</figcaption></figure>`).join("")}</body>`);
  await sheet.screenshot({ path: `${sheets}/match-result.jpg`, fullPage: true, type: "jpeg", quality: 80 });
  await sheet.close();
  writeFileSync(`${sheets}/match-result.json`, JSON.stringify({ result: await page.locator(".cr-match-finish h2").textContent(), frames: frames.length, seconds: 12 }, null, 2));
  expect(errors).toEqual([]);
  await context.close();
});

void RELEASE_TICK;
void STEP;

test("record the broadcast graphics as they appear in live play", async ({ browser }) => {
  test.skip(!process.env.CRICKET_PHASE5_GRAPHICS, "Graphics capture only on request");
  test.setTimeout(1800000);
  mkdirSync(`${sheets}/graphics`, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const root = page.getByTestId("sinverse-cricket"),
    clock = { t: 0 },
    seen = new Set<string>(),
    want = ["wicket", "four", "six", "over", "batter", "bowler"];
  let model = await startMatch(page);
  // Aim for a wicket, a four and a six; otherwise survive. Every card a broadcast would show turns up on its own.
  const hunt = [SCENES.find((s) => s.name === "boundary-four")!, { ...SCENES.find((s) => s.name === "boundary-four")!, name: "six", kinds: ["loft"] as ShotInput["kind"][], dirs: [0, 20, -20, 40], test: (d: Delivery) => d.outcome?.boundary === 6 }, SCENES.find((s) => s.name === "high-catch")!];
  for (let ball = 0; ball < 40 && want.some((w) => !seen.has(w)); ball++) {
    if ((await root.getAttribute("data-phase")) !== "ready" || (await root.getAttribute("data-batting")) !== "true") {
      model = await startMatch(page);
      continue;
    }
    const plan = hunt.map((s) => (seen.has(s.name === "high-catch" ? "wicket" : s.name === "boundary-four" ? "four" : s.name) ? null : find(model, s))).find(Boolean) ?? find(model, SURVIVE) ?? { shot: null, runAt: [] };
    await playBall(page, model, plan, clock);
    // Watch the cards come and go for the next eight seconds.
    const until = Date.now() + 8000;
    while (Date.now() < until) {
      for (const g of await page.getByTestId("cricket-graphic").all()) {
        const kind = (await g.getAttribute("data-graphic")) ?? "";
        if (kind && !seen.has(kind) && !(await g.evaluate((e) => e.classList.contains("is-leaving")))) {
          await page.waitForTimeout(600);
          seen.add(kind);
          await page.screenshot({ path: `${sheets}/graphics/${kind}.jpg`, type: "jpeg", quality: 88 });
        }
      }
      await page.waitForTimeout(150);
    }
  }
  writeFileSync(`${sheets}/graphics/graphics-log.json`, JSON.stringify({ seen: [...seen], missing: want.filter((w) => !seen.has(w)) }, null, 2));
  expect(errors).toEqual([]);
  await context.close();
});

test("record the batting interface on desktop and phone", async ({ browser }) => {
  test.skip(!process.env.CRICKET_PHASE6_UI, "Interface capture only on request");
  test.setTimeout(600000);
  const dir = process.env.CRICKET_UI_DIR ?? "../../artifacts/cricket-phase6/ui";
  mkdirSync(dir, { recursive: true });
  for (const [name, viewport] of [["desktop", { width: 1920, height: 1080 }], ["phone-landscape", { width: 844, height: 390 }], ["phone-portrait", { width: 390, height: 844 }]] as const) {
    const context = await browser.newContext({ viewport, hasTouch: name !== "desktop" });
    const page = await context.newPage(),
      root = page.getByTestId("sinverse-cricket"),
      clock = { t: 0 };
    const model = await startMatch(page);
    // As a player first sees it: the fine controls folded away.
    const less = page.getByRole("button", { name: /^More control [−-]$/ });
    if (await less.isVisible()) await less.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${dir}/${name}-between-balls.jpg`, type: "jpeg", quality: 88 });
    // A live ball: the shot bar while the bowler runs in.
    await page.getByTestId("cricket-primary").click();
    await expect(root).toHaveAttribute("data-live", "true");
    await expect.poll(async () => Number(await root.getAttribute("data-ball-tick")), { timeout: 20000, intervals: [50] }).toBeGreaterThan(RELEASE_TICK + 20);
    await page.screenshot({ path: `${dir}/${name}-live-delivery.jpg`, type: "jpeg", quality: 88 });
    await expect(root).toHaveAttribute("data-live", "false", { timeout: 60000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${dir}/${name}-after-ball.jpg`, type: "jpeg", quality: 88 });
    void model;
    void clock;
    await context.close();
  }
});
