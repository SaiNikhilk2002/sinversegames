import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import * as T from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RIG } from "../src/games/sinverse-cricket/animation";
import { buildAthlete } from "../src/games/sinverse-cricket/character";
import { MotionPlayer, prepareMotion } from "../src/games/sinverse-cricket/motion";
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
  loader.register(() => ({ name: "skip_textures", loadTexture: () => Promise.resolve(new T.Texture()) }) as never);
  return new Promise((resolve, reject) => loader.parse(read(path), "", resolve, reject));
};
const motion = Promise.all([parse("../public/sinverse-cricket/motion/ual1.glb"), parse("../public/sinverse-cricket/motion/ual2.glb")]).then(([a, b]) => prepareMotion(a, b));
const leg = RIG.thigh + RIG.shin;

test.describe("Cricket motion clips", () => {
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
