import { finishCricketToss } from "./cricket-helpers";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { CricketMatch, RELEASE_TICK, type Delivery, type ShotInput } from "@platform/engines/sinverse-cricket";
import { clickAt, film, range, still } from "./cricket-film";
import { enterName } from "./helpers";

/**
 * Batting footage, run on demand:
 *   CRICKET_EVIDENCE=1 CRICKET_BATTING_PHASE=after pnpm exec playwright test e2e/cricket-batting-footage.spec.ts
 *
 * Controlled scenarios: for each ball actually bowled, the engine is asked
 * offline for a shot (kind, aim, power, footwork, bat face) that gives a wanted
 * moment (forward defence, drives, pull, sweep, loft, a miss, an edge). The bat
 * face decides where the bat meets the ball across the line, so edges and misses
 * are produced deliberately rather than by luck. Each shot is then played
 * through the real controls; its replay is filmed from the match screen at
 * 1920x1080. Matches restart until every scenario has been filmed.
 */
test.skip(!process.env.CRICKET_EVIDENCE, "Evidence capture only");
test.use({ trace: "off", launchOptions: { args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] } });
const phase = process.env.CRICKET_BATTING_PHASE ?? "after";
const sheets = `${process.env.CRICKET_BATTING_DIR ?? "../../artifacts/cricket-batting"}/${phase}`;
const videos = `${process.env.CRICKET_BATTING_VIDEO_DIR ?? "../../.data/cricket-batting"}/${phase}`;

type Scene = { name: string; kinds: ShotInput["kind"][]; feet: number[]; dirs: number[]; powers: number[]; lateral?: number; test: (d: Delivery) => boolean };
const clean = (d: Delivery) => d.hit && !d.edge && !d.outcome?.wicket;
const SCENES: Scene[] = [
  { name: "forward-defence", kinds: ["defend"], feet: [0.4, 0.25, 0], dirs: [0, 15, -15], powers: [0.4], test: clean },
  { name: "straight-drive", kinds: ["straight"], feet: [0.35, 0.15, 0], dirs: [0, 8, -8], powers: [0.85, 1], test: clean },
  { name: "cover-drive", kinds: ["cover"], feet: [0.35, 0.15, 0], dirs: [45, 60, 35], powers: [0.85, 1], test: clean },
  { name: "pull-shot", kinds: ["pull"], feet: [-0.2, 0], dirs: [-70, -50, -90], powers: [0.85, 1], test: clean },
  { name: "sweep", kinds: ["sweep"], feet: [0.45, 0.25], dirs: [-60, -40, -80], powers: [0.7, 1], test: clean },
  { name: "lofted-drive", kinds: ["loft"], feet: [0.35, 0], dirs: [0, -15, 15], powers: [1, 0.85], test: clean },
  { name: "missed-delivery", kinds: ["cover", "straight"], feet: [0.2, 0], dirs: [30, 0], powers: [0.85], lateral: 0.46, test: (d) => !d.hit && !d.pad },
  { name: "edged-delivery", kinds: ["cover", "straight", "defend"], feet: [0.2, 0], dirs: [30, 0, 15], powers: [0.85], lateral: 0.28, test: (d) => d.hit && d.edge },
];

const SURVIVE: Scene = { name: "survive", kinds: ["defend"], feet: [0.4, 0, -0.2, 0.25], dirs: [0, 15, -15, 30, -30], powers: [0.3], test: (d) => !d.outcome?.wicket };

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

/** A shot that gives `scene` on this ball, robust to a tick of swing jitter either way. */
function find(model: CricketMatch, scene: Scene) {
  const { field, at } = probe(model);
  for (const kind of scene.kinds)
    for (const foot of scene.feet)
      for (const direction of scene.dirs)
        for (const power of scene.powers)
          for (const side of scene.lateral ? [1, -1] : [0]) {
            const ball = at(foot),
              aimX = Math.sin((direction * Math.PI) / 180) * 0.45,
              rawFace = (ball.x + side * (scene.lateral ?? 0) - aimX) / 0.55,
              face = Number((Math.round(Math.max(-0.6, Math.min(0.6, rawFace)) / 0.02) * 0.02).toFixed(2));
            const shot = { kind, direction, power, foot, face, tick: ball.tick - 8 };
            const ok = [-1, 0, 1].every((shift) => {
              const d = model.createDelivery({ bowling: null, shot: { ...shot, tick: shot.tick + shift }, runAt: [], field }, true);
              d.complete();
              return scene.test(d);
            });
            if (ok) return shot as ShotInput;
          }
  return null;
}

async function startMatch(page: Page) {
  await page.goto("/play/sinverse-cricket");
  await enterName(page, "Batter");
  await page.getByLabel("Custom format").selectOption("2").catch(() => {});
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

test("record controlled batting footage", async ({ browser }) => {
  test.setTimeout(3600000);
  mkdirSync(`${sheets}/stills`, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const root = page.getByTestId("sinverse-cricket"),
    only = process.env.CRICKET_BATTING_ONLY?.split(","),
    remaining = SCENES.filter((s) => !only || only.includes(s.name)),
    log: Record<string, unknown>[] = [];
  let clock = 0,
    matches = 0,
    left = !!only && !only.includes("leave");
  let model = await startMatch(page);
  matches++;
  while (remaining.length && matches <= 8) {
    if ((await root.getAttribute("data-phase")) !== "ready" || (await root.getAttribute("data-batting")) !== "true") {
      console.log(`restart: phase=${await root.getAttribute("data-phase")} batting=${await root.getAttribute("data-batting")}`);
      model = await startMatch(page);
      matches++;
      continue;
    }
    let scene: Scene | null = null,
      shot: ShotInput | null = null;
    // The first scenario, in order, that this ball can give.
    for (const s of remaining) {
      const found = find(model, s);
      if (found) {
        scene = s;
        shot = found;
        break;
      }
    }
    // A ball no scenario can use is defended (not left), so the innings lasts long enough to see a wanted ball.
    if (!shot && left) shot = find(model, SURVIVE);
    const seq = Number(await root.getAttribute("data-seq"));
    if (shot) {
      await page.getByLabel("Shot", { exact: true }).selectOption(shot.kind);
      await range(page, "Aim", shot.direction);
      await range(page, "Power", shot.power);
      await range(page, "Footwork", shot.foot);
      await range(page, "Bat face", shot.face);
    }
    await page.getByTestId("cricket-primary").click();
    await expect(root).toHaveAttribute("data-live", "true");
    const actual = shot ? await clickAt(root, "cricket-primary", shot.tick) : null;
    await expect(root).toHaveAttribute("data-seq", String(seq + 1), { timeout: 120000 });
    const move = { bowling: null, shot: shot && actual !== null ? { ...shot, tick: actual } : null, runAt: [], field: model.fieldForAI() };
    const delivery = model.createDelivery(move, true);
    delivery.complete();
    clock += Math.ceil(delivery.tick * (1000 / 120)) + 2000;
    model.record({ k: "ball", seq: model.seq, ...move, digest: delivery.digest, t: clock }, delivery);
    const name = scene && scene.test(delivery) ? scene.name : !shot && !left ? "leave" : null;
    log.push({ match: matches, want: scene?.name ?? "leave", shot: move.shot, outcome: delivery.outcome?.label, hit: delivery.hit, edge: delivery.edge, contactTick: delivery.contactTick, filmed: name });
    console.log(`match ${matches} ball ${seq}: want ${scene?.name ?? "-"} -> ${delivery.outcome?.label} hit=${delivery.hit} edge=${delivery.edge} filmed=${name}`);
    if (!name) continue;
    if (name === "leave") left = true;
    else remaining.splice(remaining.indexOf(scene!), 1);

    // Contact (or where it would have been): a full-resolution still and the rig's measured accuracy.
    const contact = delivery.hit ? delivery.contactTick : (move.shot?.tick ?? RELEASE_TICK + 60) + 8;
    await still(page, contact, "closeup", `${sheets}/stills/${name}-contact.jpg`);
    // The match root republishes its rig measurements every 1.5 s.
    await page.waitForTimeout(1700);
    const read = async (name: string) => {
      const v = await root.getAttribute(`data-${name}`);
      return v ? Number(v) : null;
    };
    const accuracy = { contactError: delivery.hit ? await read("contact-error") : null, gripError: await read("grip-error") };
    await page.getByTestId("cricket-replay-close").click();
    const closeup = await film(page, browser, { name: `${name}-closeup`, camera: "closeup", from: RELEASE_TICK - 30, to: contact + 110, speed: 0.5, sheets, videos, sheetType: "jpeg" });
    const director = await film(page, browser, { name: `${name}-director`, camera: process.env.CRICKET_BATTING_DIRECTOR ?? "director", from: RELEASE_TICK - 50, to: contact + 220, speed: 1, sheets, videos, sheetType: "jpeg" });
    log.push({ filmed: name, contact, ...accuracy, closeup, director });
    writeFileSync(`${sheets}/${only ? `batting-log-${only.join("-")}` : "batting-log"}.json`, JSON.stringify(log, null, 2));
  }
  log.push({ missing: remaining.map((s) => s.name), matches });
  writeFileSync(`${sheets}/${only ? `batting-log-${only.join("-")}` : "batting-log"}.json`, JSON.stringify(log, null, 2));
  expect(errors).toEqual([]);
  await context.close();
});
