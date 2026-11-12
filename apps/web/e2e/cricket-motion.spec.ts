import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import * as T from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RIG } from "../src/games/sinverse-cricket/animation";
import { buildAthlete } from "../src/games/sinverse-cricket/character";
import { MAX_STRIDE, MotionPlayer, prepareMotion } from "../src/games/sinverse-cricket/motion";
import { KitMaterials, RealisticBody, SQUAD, prepareSquad } from "../src/games/sinverse-cricket/realistic";

/**
 * The CC0 motion clips (Quaternius Universal Animation Library) retargeted onto
 * the realistic athletes. These check the measurements the game relies on and
 * that clip-driven bodies stay on the ground and in one piece.
 */
const read = (path: string) => {
  const buf = readFileSync(new URL(path, import.meta.url));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};
const parse = (path: string): Promise<GLTF> => {
  const loader = new GLTFLoader();
  // Ahead of the loader's own texture plugins (the WebP one needs a browser to check support).
  (loader as unknown as { pluginCallbacks: unknown[] }).pluginCallbacks.unshift(() => ({ name: "skip_textures", loadTexture: () => Promise.resolve(new T.Texture()) }));
  return new Promise((resolve, reject) => loader.parse(read(path), "", resolve, reject));
};
const motion = Promise.all([parse("../public/sinverse-cricket/motion/ual1.glb"), parse("../public/sinverse-cricket/motion/ual2.glb")]).then(([a, b]) => prepareMotion(a, b));
const leg = RIG.thigh + RIG.shin;

/** Average ground speed of the planted foot (m/s) while an athlete runs forward at `speed`. */
async function footSlip(speed: number) {
  const lib = await motion,
    [model] = prepareSquad([await parse(`../public/sinverse-cricket/athletes/${SQUAD[1]}-lo.glb`)]);
  const driver = buildAthlete("field", 5, 0, 1),
    body = new RealisticBody(model!, driver, new KitMaterials(), 0),
    player = new MotionPlayer(lib, leg, 5),
    dt = 1 / 120,
    samples: { y: number; x: number; z: number }[] = [];
  for (let i = 0; i < 480; i++) {
    driver.root.position.z += speed * dt;
    driver.root.updateMatrixWorld(true);
    const frame = player.pose(player.locomotion(dt, speed), null);
    frame.lower = frame.upper = 1;
    body.sync(frame);
    const f = body.bone("LeftFoot").getWorldPosition(new T.Vector3());
    if (i > 120) samples.push({ y: f.y, x: f.x, z: f.z });
  }
  const floor = Math.min(...samples.map((s) => s.y));
  let slip = 0,
    n = 0;
  for (let i = 1; i < samples.length; i++)
    if (samples[i]!.y < floor + 0.02 && samples[i - 1]!.y < floor + 0.02) {
      slip += Math.hypot(samples[i]!.x - samples[i - 1]!.x, samples[i]!.z - samples[i - 1]!.z) / dt;
      n++;
    }
  return { slip: n ? slip / n : NaN, stride: player.stride, planted: n };
}

test.describe("Cricket motion clips", () => {
  test("a planted foot stays put on the ground, from a walk up to a full 7 m/s sprint", async () => {
    for (const speed of [1.4, 3.5, 5.5, 7]) {
      const { slip, stride, planted } = await footSlip(speed);
      console.log(`${speed} m/s: planted foot moves ${slip.toFixed(2)} m/s (${((slip / speed) * 100).toFixed(0)}% of body speed), stride x${stride.toFixed(2)}, ${planted} planted samples`);
      expect(planted, `${speed} m/s has a planted phase`).toBeGreaterThan(5);
      // Foot locking: a planted foot may roll a little, but it must not skate with the body.
      expect(slip / speed, `${speed} m/s foot slip ratio`).toBeLessThan(0.1);
      expect(stride).toBeLessThanOrEqual(MAX_STRIDE + 1e-6);
    }
  });

  test("locomotion clips have plausible human ground speeds, in order", async () => {
    const lib = await motion,
      player = new MotionPlayer(lib, leg);
    const walk = player.clipSpeed("Walk_Loop"),
      jog = player.clipSpeed("Jog_Fwd_Loop"),
      sprint = player.clipSpeed("Sprint_Loop");
    console.log(`walk ${walk.toFixed(2)} m/s, jog ${jog.toFixed(2)} m/s, sprint ${sprint.toFixed(2)} m/s`);
    expect(walk).toBeGreaterThan(0.8);
    expect(walk).toBeLessThan(2.2);
    expect(jog).toBeGreaterThan(walk);
    expect(sprint).toBeGreaterThan(jog);
    expect(sprint).toBeLessThan(11);
  });

  test("the throw lets go of the ball partway through, with time to wind up first", async () => {
    const info = (await motion).info.get("OverhandThrow")!;
    console.log(`throw release at ${info.release.toFixed(2)} s of ${info.duration.toFixed(2)} s`);
    // The engine throws 38 ticks (0.32 s) after pickup; the clip must have that much wind-up.
    expect(info.release).toBeGreaterThan(0.32);
    expect(info.release).toBeLessThan(info.duration - 0.2);
  });

  test("clip-driven hands stay out of the trouser legs, at every speed", async () => {
    const lib = await motion;
    for (const index of [0, 4, 9]) {
      const [model] = prepareSquad([await parse(`../public/sinverse-cricket/athletes/${SQUAD[index]}.glb`)]);
      const driver = buildAthlete("field", 3, 0, 1),
        body = new RealisticBody(model!, driver, new KitMaterials(), 0),
        player = new MotionPlayer(lib, leg);
      driver.root.updateMatrixWorld(true);
      const thigh = body.measures().thigh;
      let deepest = 0,
        worst = Infinity;
      for (const speed of [0, 1.4, 3.5, 7])
        for (let i = 0; i < 90; i++) {
          const frame = player.pose(player.locomotion(1 / 60, speed), null);
          frame.lower = frame.upper = 1;
          body.sync(frame);
          deepest = Math.max(deepest, body.clearHands());
          for (const left of [true, false]) {
            const palm = body.palm(left, new T.Vector3());
            for (const side of ["Left", "Right"]) {
              const line = new T.Line3(body.bone(side + "UpLeg").getWorldPosition(new T.Vector3()), body.bone(side + "Leg").getWorldPosition(new T.Vector3()));
              worst = Math.min(worst, line.closestPointToPoint(palm, true, new T.Vector3()).distanceTo(palm) - thigh);
            }
          }
        }
      console.log(`${SQUAD[index]}: thigh radius ${(thigh * 100).toFixed(1)} cm; a second pass moved hands ${(deepest * 100).toFixed(2)} cm; closest palm ${(worst * 100).toFixed(1)} cm outside the skin`);
      // sync() already cleared the hands, so a second pass has nothing left to do,
      // and every palm is outside the thigh's skin by the trouser and hand allowance.
      expect(deepest).toBeLessThan(0.003);
      expect(worst).toBeGreaterThan(RealisticBody.HAND_CLEARANCE * body.root.getWorldScale(new T.Vector3()).x - 0.004);
    }
  });

  test("standing and running carry a professional athlete's posture", async () => {
    const lib = await motion,
      deg = 180 / Math.PI;
    for (const index of [0, 3, 9]) {
      const [model] = prepareSquad([await parse(`../public/sinverse-cricket/athletes/${SQUAD[index]}.glb`)]);
      const driver = buildAthlete("field", 3, 0, 1),
        body = new RealisticBody(model!, driver, new KitMaterials(), 0),
        player = new MotionPlayer(lib, leg, index);
      driver.root.updateMatrixWorld(true);
      const p = (name: string) => body.bone(name).getWorldPosition(new T.Vector3());
      /** Forward lean (degrees) of the line from joint a up to joint b. */
      const lean = (a: string, b: string) => {
        const d = p(b).sub(p(a));
        return Math.atan2(d.z, d.y) * deg;
      };
      const bend = (a: string, b: string, c: string) => p(b).sub(p(a)).angleTo(p(c).sub(p(b))) * deg;
      const worst = { trunk: 0, neck: 0, knee: 0, elbow: 0, wide: 0, narrow: Infinity, hips: 0, run: 0, runNeck: 0 };
      for (let i = 0; i < 120; i++) {
        const frame = player.pose(player.locomotion(1 / 30, 0), null);
        frame.lower = frame.upper = 1;
        body.sync(frame);
        worst.trunk = Math.max(worst.trunk, Math.abs(lean("Hips", "Neck")));
        worst.neck = Math.max(worst.neck, lean("Neck", "Head"));
        for (const s of ["Left", "Right"]) {
          worst.knee = Math.max(worst.knee, bend(`${s}UpLeg`, `${s}Leg`, `${s}Foot`));
          worst.elbow = Math.max(worst.elbow, bend(`${s}Arm`, `${s}ForeArm`, `${s}Hand`));
        }
        const width = Math.abs(p("LeftFoot").x - p("RightFoot").x);
        worst.wide = Math.max(worst.wide, width);
        worst.narrow = Math.min(worst.narrow, width);
        worst.hips = Math.max(worst.hips, Math.abs(p("LeftUpLeg").y - p("RightUpLeg").y));
      }
      // A full sprint: leaning from the hips, eyes up, not curled over.
      for (let i = 0; i < 120; i++) {
        const frame = player.pose(player.locomotion(1 / 30, 8), null);
        frame.lower = frame.upper = 1;
        body.sync(frame);
        if (i < 40) continue;
        worst.run = Math.max(worst.run, lean("Hips", "Neck"));
        worst.runNeck = Math.max(worst.runNeck, lean("Neck", "Head"));
      }
      console.log(`${SQUAD[index]} standing: trunk ${worst.trunk.toFixed(1)} deg, neck ${worst.neck.toFixed(1)}, knees ${worst.knee.toFixed(1)}, elbows ${worst.elbow.toFixed(1)}, feet ${(worst.narrow * 100).toFixed(0)}-${(worst.wide * 100).toFixed(0)} cm apart, hips level within ${(worst.hips * 100).toFixed(1)} cm; sprinting: trunk ${worst.run.toFixed(1)}, neck ${worst.runNeck.toFixed(1)}`);
      // Tall and relaxed: no slump, no forward head, knees soft but not bent,
      // hands hanging at the sides (not held in front of the thighs), feet under the hips.
      expect(worst.trunk).toBeLessThan(5);
      expect(worst.neck).toBeLessThan(16);
      expect(worst.knee).toBeLessThan(14);
      expect(worst.elbow).toBeLessThan(25);
      expect(worst.narrow).toBeGreaterThan(0.15);
      expect(worst.wide).toBeLessThan(0.36);
      expect(worst.hips).toBeLessThan(0.03);
      expect(worst.run).toBeLessThan(28);
      expect(worst.runNeck).toBeLessThan(25);
    }
  });

  test("a clip-driven athlete stays on the ground, faces forward and keeps valid joints", async () => {
    const lib = await motion,
      [model] = prepareSquad([await parse(`../public/sinverse-cricket/athletes/${SQUAD[0]}-lo.glb`)]);
    const driver = buildAthlete("field", 3, 0, 1),
      body = new RealisticBody(model!, driver, new KitMaterials(), 0),
      player = new MotionPlayer(lib, leg);
    driver.root.updateMatrixWorld(true);
    const lowest: number[] = [];
    for (const [speed, shot] of [[0, null], [1.4, null], [3.5, null], [7, null], [0, "OverhandThrow"]] as const) {
      let low = Infinity,
        high = -Infinity;
      for (let i = 0; i < 60; i++) {
        const frame = player.pose(player.locomotion(1 / 60, speed), shot ? { clip: shot, time: (i / 60) * 1.3, weight: 1 } : null);
        frame.lower = frame.upper = 1;
        body.sync(frame);
        const feet = Math.min(body.bone("LeftFoot").getWorldPosition(new T.Vector3()).y, body.bone("RightFoot").getWorldPosition(new T.Vector3()).y);
        low = Math.min(low, feet);
        high = Math.max(high, feet);
        for (const name of ["Hips", "Head", "LeftHand", "RightFoot"]) {
          const q = body.bone(name).quaternion;
          expect(Number.isFinite(q.x + q.y + q.z + q.w), `${name} rotation`).toBe(true);
        }
      }
      lowest.push(low);
      // Feet touch down near the ground: no floating, no sinking.
      expect(low, `speed ${speed} ${shot ?? ""} lowest ankle`).toBeGreaterThan(-0.05);
      expect(low, `speed ${speed} ${shot ?? ""} lowest ankle`).toBeLessThan(0.2);
      expect(high - low, "feet actually move when running").toBeGreaterThanOrEqual(speed > 1 ? 0.05 : 0);
    }
    // Running forward means the body faces +Z: the toes are ahead of the ankles.
    const toe = body.bone("LeftToeBase").getWorldPosition(new T.Vector3()),
      ankle = body.bone("LeftFoot").getWorldPosition(new T.Vector3());
    expect(toe.z).toBeGreaterThan(ankle.z);
    console.log("lowest ankle per test:", lowest.map((v) => v.toFixed(3)).join(", "));
  });
});
