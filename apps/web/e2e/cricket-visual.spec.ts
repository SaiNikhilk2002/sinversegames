import { finishCricketToss } from "./cricket-helpers";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import * as T from "three";
import {
  CricketMatch,
  Delivery,
  RELEASE_TICK,
  SHOT_HEIGHTS,
  STEP,
  configSchema,
  type Outcome,
  type ShotKind,
} from "@platform/engines/sinverse-cricket";
import {
  BAT,
  BAT_HEIGHTS,
  CH,
  CLIPS,
  DELIVERY,
  FootPlanter,
  IMPACT_TICKS,
  RELEASE_ROOT,
  batPose,
  bowlingStyle,
  makePose,
  sampleClip,
  selectBowler,
  selectFielder,
  selectKeeper,
  selectStriker,
  selectUmpire,
  type MatchMoment,
} from "../src/games/sinverse-cricket/animation";
import { applyPose, batPoint, buildAthlete, handCentre, holdBat, lookFor } from "../src/games/sinverse-cricket/character";
import { QualityGovernor, crowdEnergy, direct, presentationRate, type DirectorInput } from "../src/games/sinverse-cricket/director";
import { calibratedShot } from "../../../packages/engines/test/cricket-fixtures";
import { enterName } from "./helpers";

const evidence = "../../artifacts/cricket-2/visual-regression";
const outcome = (patch: Partial<Outcome>): Outcome => ({ bat: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, total: 0, legal: true, wicket: null, dismissed: "striker", boundary: 0, completedRuns: 0, timing: 0, label: "", ...patch });
const moment = (patch: Partial<MatchMoment> = {}): MatchMoment => ({ tick: 200, outcome: null, deadAge: -1, contact: false, result: null, ...patch });

// ---------------------------------------------------------------------------
// Animation and rig (no browser: pure modules and the real skeleton)
// ---------------------------------------------------------------------------

test.describe("Cricket animation system", () => {
  const SHOTS: ShotKind[] = ["defend", "straight", "cover", "on-drive", "cut", "pull", "sweep", "loft"];

  test("the rig's batting heights are the physics' batting heights", () => {
    expect(BAT_HEIGHTS).toEqual(SHOT_HEIGHTS);
  });

  test("hands stay on the handle through every shot, start to finish", () => {
    const a = buildAthlete("bat", 1, 0, 2);
    const hand = new T.Vector3(),
      handle = new T.Vector3();
    let worst = 0;
    for (const kind of SHOTS) {
      for (const tick of [100, 120, 150, 160, 164, 168, 172, 180, 195, 220, 300]) {
        const shot = { kind, tick: 160 };
        const bat = batPose({ tick, shot: tick >= 160 ? shot : null, contactTick: -1, impact: [0.12, BAT_HEIGHTS[kind], 0.42] });
        const pose = sampleClip(CLIPS.stance, 0, makePose());
        holdBat(a, pose, bat);
        a.root.updateMatrixWorld(true);
        handCentre(a, true, hand);
        batPoint(a, BAT.top, handle);
        worst = Math.max(worst, hand.distanceTo(handle));
        handCentre(a, false, hand);
        batPoint(a, BAT.bottom, handle);
        worst = Math.max(worst, hand.distanceTo(handle));
      }
    }
    expect(worst, "worst hand-to-handle gap, metres").toBeLessThan(0.03);
  });

  test("the bat stays clear of the body at impact", () => {
    const a = buildAthlete("bat", 1, 0, 2);
    const spine = new T.Vector3(),
      point = new T.Vector3();
    for (const kind of SHOTS) {
      const bat = batPose({ tick: 168, shot: { kind, tick: 160 }, contactTick: 168, impact: [0.12, BAT_HEIGHTS[kind], 0.45] });
      const pose = sampleClip(CLIPS.stance, 0, makePose());
      holdBat(a, pose, bat);
      a.root.updateMatrixWorld(true);
      a.bones.spine.getWorldPosition(spine);
      batPoint(a, BAT.sweet, point);
      expect(Math.hypot(point.x - spine.x, point.z - spine.z), `${kind} sweet spot from the spine`).toBeGreaterThan(0.2);
    }
  });

  test("the bowling hand reaches the simulated release point at the release tick, for every action", () => {
    const a = buildAthlete("bowl", 10, 1, 2);
    for (const style of ["fast", "medium", "spin"] as const) {
      const pose = sampleClip(DELIVERY[style], 0, makePose());
      a.root.position.set(0.55 + RELEASE_ROOT.x, 0, -8.5 + RELEASE_ROOT.z);
      a.root.rotation.y = 0;
      a.root.scale.setScalar(1);
      applyPose(a, pose);
      a.root.updateMatrixWorld(true);
      const hand = handCentre(a, false, new T.Vector3());
      expect(hand.distanceTo(new T.Vector3(0.55, 2.08, -8.5)), `${style} release gap, metres`).toBeLessThan(0.05);
    }
    expect(bowlingStyle("googly")).toBe("spin");
    expect(bowlingStyle("slower")).toBe("medium");
    expect(bowlingStyle("seam")).toBe("fast");
  });

  test("feet stay planted while the body runs over them", () => {
    const planter = new FootPlanter();
    let x = 0,
      slip = 0,
      prev = [NaN, NaN],
      swings = 0,
      wasSwinging = [false, false];
    planter.reset(0, 0, Math.PI / 2);
    for (let n = 0; n < 240; n++) {
      x += 6 * STEP;
      planter.update(x, 0, Math.PI / 2, 6);
      planter.feet.forEach((f, k) => {
        if (!f.swinging && !wasSwinging[k] && Number.isFinite(prev[k]!)) slip = Math.max(slip, Math.abs(f.x - prev[k]!));
        if (f.swinging && !wasSwinging[k]) swings++;
        prev[k] = f.x;
        wasSwinging[k] = f.swinging;
      });
    }
    expect(slip, "planted foot movement, metres").toBeLessThan(1e-6);
    expect(swings).toBeGreaterThan(4);
  });

  test("players are visibly different people, none built on a real likeness", () => {
    const looks = Array.from({ length: 22 }, (_, n) => lookFor("field", n + 1, n % 2));
    expect(new Set(looks.map((l) => l.skin)).size).toBeGreaterThan(3);
    expect(new Set(looks.map((l) => l.hair)).size).toBeGreaterThan(2);
    expect(new Set(looks.map((l) => l.scale.toFixed(2))).size).toBeGreaterThan(3);
    expect(new Set(looks.map((l) => l.headwear)).size).toBeGreaterThan(1);
    expect(lookFor("bat", 1, 0).headwear).toBe("helmet");
  });

  test("reactions match the real event", () => {
    const six = outcome({ boundary: 6, bat: 6 }),
      bowled = outcome({ wicket: "bowled" }),
      lbw = outcome({ wicket: "lbw" });
    const dead = (o: Outcome) => moment({ outcome: o, deadAge: 0.5 });
    const fielder = { action: "ready" as const, actionAge: 0, moving: false, speed: 0, ballY: 0, id: 3, chasing: false };
    const bowler = { style: "fast" as const, chasing: false, action: "ready" as const, actionAge: 0, moving: false, ballY: 0 };
    const keeper = { action: "ready" as const, actionAge: 0, moving: false, ballZ: 12, ballY: 1 };

    expect(selectFielder({ ...dead(bowled), ...fielder })).toMatchObject({ clip: "clap" });
    expect(selectFielder({ ...dead(six), ...fielder })).toMatchObject({ clip: "hands" });
    expect(selectBowler({ ...dead(lbw), ...bowler, wicket: "lbw" })).toMatchObject({ clip: "appeal" });
    expect(selectBowler({ ...dead(six), ...bowler, wicket: null })).toMatchObject({ clip: "frustrated" });
    expect(selectKeeper({ ...dead(outcome({ wicket: "stumped" })), ...keeper, wicket: "stumped" })).toMatchObject({ clip: "salute" });
    expect(selectUmpire(dead(six))).toMatchObject({ clip: "umpireSix" });
    expect(selectUmpire(dead(bowled))).toMatchObject({ clip: "umpireOut" });
    expect(selectUmpire(dead(outcome({ boundary: 4 })))).toMatchObject({ clip: "umpireFour" });
    // Nothing reacts until the rules engine has actually ended the ball.
    expect(selectUmpire(moment())).toMatchObject({ clip: "umpire" });
    expect(selectFielder({ ...moment(), ...fielder })).toMatchObject({ clip: "ready" });
  });

  test("a batter who misses is beaten, and one who hits is not", () => {
    const base = { running: false, edge: false, dismissedStriker: false };
    expect(selectStriker({ ...moment({ tick: 210, contact: false }), ...base, shot: { tick: 160 } })).toMatchObject({ clip: "beaten" });
    expect(selectStriker({ ...moment({ tick: 210, contact: true }), ...base, shot: { tick: 160 } })).toBe("bat");
    expect(selectStriker({ ...moment({ tick: 165 }), ...base, shot: { tick: 160 } })).toBe("bat");
    expect(selectStriker({ ...moment(), ...base, running: true, shot: null })).toBe("gait");
  });

  test("delivery stages run in order: bound, back foot, front foot, release", () => {
    const fast = DELIVERY.fast;
    const at = (ticks: number) => sampleClip(fast, ticks * STEP, makePose());
    expect(at(-26)[CH.hipY]!, "airborne in the bound").toBeGreaterThan(at(-38)[CH.hipY]!);
    expect(at(0)[CH.rHandY]!, "arm comes over the top at release").toBeGreaterThan(at(-14)[CH.rHandY]!);
    expect(at(10)[CH.rHandY]!, "arm comes down in the follow-through").toBeLessThan(at(0)[CH.rHandY]!);
    expect(at(10)[CH.pitch]!, "body drives forward").toBeGreaterThan(at(0)[CH.pitch]!);
    expect(IMPACT_TICKS).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Camera director
// ---------------------------------------------------------------------------

test.describe("Cricket camera director", () => {
  const base: DirectorInput = {
    camera: "broadcast",
    frame: { tick: 50, ball: { x: 0.55, y: 2.08, z: -8.5 }, contact: false, mode: "delivery", bounce: false },
    outcome: null,
    deadAge: -1,
    humanBatting: true,
    config: { venue: "lantern" },
    batterX: -0.38,
    batterZ: 8.84,
    replay: false,
  };
  const inAir = { tick: 300, ball: { x: 20, y: 15, z: -40 }, contact: true, mode: "struck" as const, bounce: false };

  test("frames the player's working view before the ball is bowled", () => {
    expect(direct(base).name).toBe("bowler-run-up");
    const settled = { ...base, frame: { ...base.frame, tick: 85 } };
    expect(direct(settled).name).toBe("batter");
    expect(direct({ ...settled, humanBatting: false }).name).toBe("bowler");
  });
  test("tracks a struck ball, and hands over to the rope for one going all the way", () => {
    expect(direct({ ...base, frame: { ...inAir, ball: { x: 5, y: 8, z: -6 } } }).name).toBe("track");
    expect(direct({ ...base, frame: inAir }).name).toBe("boundary-follow");
  });
  test("a six ends on the rope, then on the batter", () => {
    const end = { ...base, frame: { ...inAir, mode: "dead" as const }, outcome: outcome({ boundary: 6 }) };
    expect(direct({ ...end, deadAge: 0.3 }).name).toBe("boundary-follow");
    expect(direct({ ...end, deadAge: 1.6 }).name).toBe("celebration");
  });
  test("each dismissal gets its own shot, only once the rules engine confirms it", () => {
    const name = (wicket: Outcome["wicket"]) => direct({ ...base, frame: { ...base.frame, mode: "dead" }, outcome: outcome({ wicket }), deadAge: 1.5 }).name;
    expect(name("bowled")).toBe("wicket-stumps");
    expect(name("stumped")).toBe("wicket-stumps");
    expect(name("lbw")).toBe("wicket-appeal");
    expect(name("run-out")).toBe("wicket-runout");
    expect(name("caught")).toBe("wicket-caught");
    expect(direct({ ...base, outcome: outcome({ wicket: "bowled" }), deadAge: -1 }).name).toBe("batter");
  });
  test("a chosen camera is respected and stays over the ground", () => {
    for (const camera of ["batter", "bowler", "side", "behind", "keeper", "slip", "boundary", "aerial", "track"] as const) {
      const s = direct({ ...base, camera, frame: inAir });
      expect(s.py, camera).toBeGreaterThan(0.3);
    }
    expect(direct({ ...base, camera: "side", frame: inAir }).name).toBe("side");
  });
  test("crowd energy comes only from real events", () => {
    const e = (o: Outcome | null, deadAge = 0.1) => crowdEnergy({ outcome: o, deadAge, ballRatio: 0, inAir: false, reduced: false });
    expect(e(outcome({ boundary: 6 }))).toBeGreaterThan(e(outcome({ boundary: 4 })));
    expect(e(outcome({ wicket: "bowled" }))).toBeGreaterThan(e(outcome({ boundary: 4 })));
    expect(e(null, -1)).toBeLessThan(0.1);
    expect(e(outcome({ bat: 1 }))).toBeLessThan(0.2);
  });
  test("quality only changes on sustained measurements, and doesn't oscillate", () => {
    const g = new QualityGovernor(38, 19, 10, 3, 8);
    let now = 0,
      level: "low" | "medium" | "high" | "ultra" = "high",
      changes = 0;
    const feed = (ms: number, frames: number) => {
      for (let n = 0; n < frames; n++) {
        now += ms;
        const next = g.sample(ms, now, level);
        if (next) {
          level = next;
          changes++;
        }
      }
    };
    feed(60, 20); // Two slow windows: not sustained yet.
    expect(changes).toBe(0);
    feed(16, 1);
    feed(16, 9); // A good window clears the streak.
    feed(60, 20);
    expect(changes).toBe(0);
    feed(60, 10);
    expect(level).toBe("medium");
    feed(16, 70); // Fast again, but climbing back takes much longer than dropping.
    expect(level).toBe("medium");
  });
});

// ---------------------------------------------------------------------------
// Presentation can't change the match
// ---------------------------------------------------------------------------

test.describe("Cricket presentation never changes the simulation", () => {
  const config = configSchema.parse({});
  const bowl = { variation: "seam", line: 0, length: 4, speed: 0.2, release: 0 } as const;
  const run = (capture: boolean, rates: number[]) => {
    const shot = { kind: "loft" as const, direction: 0, power: 1, foot: 0, face: 0, tick: 165 };
    const d = new Delivery(1234, bowl, "balanced", config, false, shot, [], capture);
    let acc = 0,
      n = 0;
    // Steps are driven by wall time scaled by any presentation rate, as the game loop does.
    while (!d.outcome && n < 40000) {
      acc += (1 / 60) * rates[n++ % rates.length]!;
      while (acc >= STEP && !d.outcome) {
        d.step();
        acc -= STEP;
      }
    }
    return { digest: d.digest, outcome: d.outcome, tick: d.tick, ball: { ...d.pos } };
  };

  test("recording frames, slow motion and frame rate give identical results", () => {
    const reference = run(false, [1]);
    expect(run(true, [1])).toEqual(reference);
    expect(run(true, [0.32])).toEqual(reference);
    expect(run(true, [1, 0.5, 0.2, 0.9])).toEqual(reference);
  });
  test("slow motion is only for a ball in the air near the rope, and never under reduced motion", () => {
    const flying = { hit: true, groundAfterHit: false, y: 12, vy: -2, x: 30, z: -48, venue: "lantern" as const, finished: false, reduced: false };
    expect(presentationRate(flying)).toBeLessThan(0.7);
    expect(presentationRate({ ...flying, reduced: true })).toBe(1);
    expect(presentationRate({ ...flying, groundAfterHit: true })).toBe(1);
    expect(presentationRate({ ...flying, y: 1 })).toBe(1);
    expect(presentationRate({ ...flying, x: 2, z: 2 })).toBe(1);
    expect(presentationRate({ ...flying, hit: false })).toBe(1);
  });
  test("the release tick is unchanged", () => expect(RELEASE_TICK).toBe(100));
});

// ---------------------------------------------------------------------------
// Real browser: play real balls, capture real frames
// ---------------------------------------------------------------------------

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
        }, 20000);
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
async function start(page: Page) {
  await page.goto("/play/sinverse-cricket");
  await enterName(page, "Cricket Visual QA");
  const response = page.waitForResponse((r) => r.url().endsWith("/api/solo/start") && r.request().method() === "POST");
  await page.getByTestId("start-run").click();
  const run = await (await response).json();
  await expect(page.getByTestId("sinverse-cricket")).toBeVisible();
  return run;
}
const stat = async (root: Locator, key: string) => {
  const value = await root.getAttribute(`data-${key}`);
  return value ? Number(value) : NaN;
};

test("Cricket: a real ball's bat contact, release and grip are accurate in the actual renderer", async ({ browser }) => {
  test.setTimeout(300000);
  mkdirSync(evidence, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: "reduce" });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const run = await start(page),
    root = page.getByTestId("sinverse-cricket");
  await page.getByLabel("Graphics", { exact: true }).selectOption("low");
  await expect(root).toHaveAttribute("data-draw-calls", /\d+/, { timeout: 20000 });
  const model = new CricketMatch(run.seed, run.config);
  await finishCricketToss(page, model.tossFace);
  model.toss({ k: "toss", call: model.tossFace, decision: "bat", t: 0 });
  await page.getByRole("button", { name: "More control +", exact: true }).click();
  await page.getByLabel("Relaxed presentation pace").uncheck();
  // Real deliveries through the real controls, until the bat actually meets one.
  expect(await root.getAttribute("data-batting")).toBe("true");
  let time = 0,
    connected = false;
  for (let ball = 0; ball < 6 && !connected; ball++) {
    const seq = Number(await root.getAttribute("data-seq"));
    const selected = calibratedShot(model),
      face = Number((Math.round(selected.face / 0.02) * 0.02).toFixed(2));
    await page.getByLabel("Shot", { exact: true }).selectOption(selected.kind);
    await range(page, "Aim", 0);
    await range(page, "Power", 1);
    await range(page, "Bat face", face);
    await page.getByTestId("cricket-primary").click();
    await expect(root).toHaveAttribute("data-live", "true");
    const tick = await swingAt(root, selected.tick);
    await expect(root).toHaveAttribute("data-seq", String(seq + 1), { timeout: 60000 });
    const move = { bowling: null, shot: { ...selected, face, direction: 0, power: 1, foot: 0, tick }, runAt: [], field: model.fieldForAI() };
    const delivery = model.createDelivery(move);
    delivery.complete();
    time += 5000;
    model.record({ k: "ball", seq: model.seq, ...move, digest: delivery.digest, t: time }, delivery);
    connected = delivery.hit;
    if ((await root.getAttribute("data-phase")) !== "ready") break;
  }
  expect(connected, "one of six calibrated shots connected").toBe(true);
  await page.waitForTimeout(500);
  const slip = await stat(root, "foot-slip");
  // Scrub the replay to the exact ticks, so frame rate cannot decide what is measured.
  await page.keyboard.press("KeyP");
  await expect(page.getByRole("slider", { name: "Replay position", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause replay", exact: true }).click();
  await range(page, "Replay position", 0);
  await page.waitForTimeout(600);
  await range(page, "Replay position", RELEASE_TICK);
  await page.waitForTimeout(800);
  const release = await stat(root, "release-error");
  await page.getByRole("button", { name: "Contact", exact: true }).click();
  await page.waitForTimeout(1500);
  const measures = { contact: await stat(root, "contact-error"), release, grip: await stat(root, "grip-error"), slip };
  writeFileSync(`${evidence}/contact-accuracy.json`, JSON.stringify(measures, null, 2));
  expect(measures.release, "release hand vs simulated release point, metres").toBeLessThan(0.12);
  expect(measures.grip, "hands vs handle, metres").toBeLessThan(0.05);
  expect(measures.contact, "bat sweet spot vs ball at contact, metres").toBeLessThan(0.1);
  expect(measures.slip, "planted bowler foot, metres").toBeLessThan(0.02);
  expect(errors).toEqual([]);
  await context.close();
});

test("Cricket: quality presets, lighting and repeated re-entry keep resources bounded", async ({ browser }) => {
  test.setTimeout(240000);
  mkdirSync(evidence, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  const root = page.getByTestId("sinverse-cricket"),
    measured: Record<string, unknown> = {};
  // Compare the same fully visible playing field. Three uploads visible resources lazily;
  // captain/coin close-ups intentionally upload fewer meshes than the full XI.
  await finishCricketToss(page);
  const settle = async () => {
    await expect(page.getByText("3D ground ready", { exact: true })).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(3200);
  };
  for (const q of ["low", "medium", "high", "ultra", "low"] as const) {
    await page.getByLabel("Graphics", { exact: true }).selectOption(q);
    await settle();
    const m = { calls: await stat(root, "draw-calls"), triangles: await stat(root, "triangles"), textures: await stat(root, "textures"), geometries: await stat(root, "geometries"), dpr: await stat(root, "dpr") };
    measured[`${q}-${Object.keys(measured).length}`] = m;
    expect(m.calls, `${q} draw calls`).toBeLessThan(120);
    expect(m.triangles, `${q} triangles`).toBeLessThan(250000);
    expect(m.textures, `${q} textures`).toBeLessThan(45);
  }
  // Ending on Low after Ultra must return to the first Low's resource counts.
  const values = Object.values(measured) as { textures: number; geometries: number }[];
  expect(values.at(-1)!.textures).toBe(values[0]!.textures);
  expect(values.at(-1)!.geometries).toBe(values[0]!.geometries);
  for (const lighting of ["day", "evening", "night"] as const) {
    await page.getByLabel("Lighting", { exact: true }).selectOption(lighting);
    await settle();
    await page.screenshot({ path: `${evidence}/lighting-${lighting}.png` });
  }
  // Only ever one canvas, and it survives repeated switching.
  await expect(page.getByTestId("cricket-canvas")).toHaveCount(1);
  writeFileSync(`${evidence}/quality-resources.json`, JSON.stringify(measured, null, 2));
  expect(errors).toEqual([]);
  await context.close();
});

test("Cricket: graphics, cameras, replay and pause never change what the engine scores", async ({ browser }) => {
  test.setTimeout(420000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: "reduce" });
  const page = await context.newPage(),
    errors: string[] = [],
    outside: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!new URL(r.url()).hostname.match(/^(localhost|127\.0\.0\.1)$/) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) outside.push(r.url());
  });
  const run = await start(page),
    root = page.getByTestId("sinverse-cricket"),
    primary = page.getByTestId("cricket-primary"),
    score = page.getByTestId("cricket-score");
  const model = new CricketMatch(run.seed, run.config);
  await finishCricketToss(page, model.tossFace);
  model.toss({ k: "toss", call: model.tossFace, decision: "bat", t: 0 });
  await page.getByRole("button", { name: "More control +", exact: true }).click();
  await page.getByLabel("Relaxed presentation pace").uncheck();
  let time = 0;
  // Each ball is rendered differently, or not in 3D at all. The independent model must still agree.
  for (const [graphics, camera] of [["low", "broadcast"], ["ultra", "aerial"], ["tactical", null], ["medium", "track"]] as const) {
    if ((await root.getAttribute("data-phase")) !== "ready" || (await root.getAttribute("data-batting")) !== "true") break;
    await page.getByLabel("Graphics", { exact: true }).selectOption(graphics);
    if (camera) await page.getByLabel("Camera", { exact: true }).selectOption(camera);
    const seq = Number(await root.getAttribute("data-seq")),
      selected = calibratedShot(model),
      face = Number((Math.round(selected.face / 0.02) * 0.02).toFixed(2));
    await page.getByLabel("Shot", { exact: true }).selectOption(selected.kind);
    await range(page, "Aim", 0);
    await range(page, "Power", 1);
    await range(page, "Bat face", face);
    await primary.click();
    await expect(root).toHaveAttribute("data-live", "true");
    const tick = await swingAt(root, selected.tick);
    await expect(root).toHaveAttribute("data-seq", String(seq + 1), { timeout: 90000 });
    const move = { bowling: null, shot: { ...selected, face, direction: 0, power: 1, foot: 0, tick }, runAt: [], field: model.fieldForAI() };
    const delivery = model.createDelivery(move);
    delivery.complete();
    time += 5000;
    model.record({ k: "ball", seq: model.seq, ...move, digest: delivery.digest, t: time }, delivery);
    await expect(score, `score after a ball on ${graphics}`).toContainText(String(model.current.runs));
    const before = { score: await score.textContent(), seq: await root.getAttribute("data-seq"), phase: await root.getAttribute("data-phase"), said: await page.getByTestId("cricket-commentary").textContent() };

    // Reduced motion never opens a replay by itself.
    await page.waitForTimeout(600);
    await expect(page.getByTestId("cricket-replay-close")).toHaveCount(0);
    // Replay, scrub, change camera and quality, pause, skip: nothing moves in the match.
    await page.keyboard.press("KeyP");
    await expect(primary).toHaveText(/Skip replay/);
    await page.getByRole("button", { name: "Pause replay", exact: true }).click();
    await range(page, "Replay position", RELEASE_TICK + 20);
    await page.getByRole("button", { name: "End", exact: true }).click();
    if (graphics !== "tactical") await page.getByLabel("Camera", { exact: true }).selectOption("side");
    await page.getByRole("button", { name: "Pause match", exact: true }).click();
    await page.keyboard.press("Escape");
    await primary.click(); // Skips the replay: it must not bowl the next ball.
    await expect(page.getByTestId("cricket-replay-close")).toHaveCount(0);
    expect(await root.getAttribute("data-live")).toBe("false");
    expect({ score: await score.textContent(), seq: await root.getAttribute("data-seq"), phase: await root.getAttribute("data-phase"), said: await page.getByTestId("cricket-commentary").textContent() }).toEqual(before);
  }
  expect(outside, "the game loads nothing from other hosts").toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});

test("Cricket: leaving the match removes the canvas and the next match starts clean", async ({ browser }) => {
  test.setTimeout(180000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: "reduce" });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const firstRun = await start(page);
  const root = page.getByTestId("sinverse-cricket");
  // Begin each GPU renderer from the same history and fixed view. Resources
  // uploaded by an optional sky/coin intro otherwise vary with loading speed.
  await page.getByLabel("Camera", { exact: true }).selectOption("aerial");
  await page.getByLabel("Graphics", { exact: true }).selectOption("tactical");
  await finishCricketToss(page, new CricketMatch(firstRun.seed, firstRun.config).tossFace);
  await expect(root).toHaveAttribute("data-batting", "true");
  await page.getByLabel("Graphics", { exact: true }).selectOption("low");
  await expect(root).toHaveAttribute("data-draw-calls", /\d+/, { timeout: 20000 });
  await page.waitForTimeout(1600);
  const first = { textures: await stat(root, "textures"), geometries: await stat(root, "geometries") };
  for (let n = 0; n < 2; n++) {
    await page.getByRole("button", { name: "Pause match", exact: true }).click();
    await page.getByRole("button", { name: "Leave match", exact: true }).click();
    await expect(page.getByTestId("cricket-canvas")).toHaveCount(0);
    const response = page.waitForResponse(r => r.url().endsWith("/api/solo/start") && r.request().method() === "POST");
    await page.getByTestId("start-run").click();
    const nextRun = await (await response).json();
    await expect(root).toBeVisible();
    await page.getByLabel("Camera", { exact: true }).selectOption("aerial");
    await page.getByLabel("Graphics", { exact: true }).selectOption("tactical");
    await finishCricketToss(page, new CricketMatch(nextRun.seed, nextRun.config).tossFace);
    await expect(root).toHaveAttribute("data-batting", "true");
    await page.getByLabel("Graphics", { exact: true }).selectOption("low");
    await expect(root).toHaveAttribute("data-draw-calls", /\d+/, { timeout: 20000 });
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("cricket-canvas")).toHaveCount(1);
    expect(await stat(root, "textures"), "textures after re-entry").toBe(first.textures);
    expect(await stat(root, "geometries"), "geometries after re-entry").toBe(first.geometries);
  }
  expect(errors).toEqual([]);
  await context.close();
});
