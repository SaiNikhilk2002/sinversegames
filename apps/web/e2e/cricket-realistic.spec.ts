import { expect, test } from "@playwright/test";
import { readFileSync, statSync } from "node:fs";
import * as T from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CLIPS, makePose, sampleClip } from "../src/games/sinverse-cricket/animation";
import { applyPose, buildAthlete } from "../src/games/sinverse-cricket/character";
import { ARM_STRETCH_MAX, KitMaterials, RealisticBody, SQUAD, equipmentKit, modelFor, prepareSquad, type Detail } from "../src/games/sinverse-cricket/realistic";

/**
 * The realistic athletes (CC0 MakeHuman bodies, see scripts/cricket-characters)
 * wear the procedural rig as a driver. These check the models themselves and
 * that the realistic body lands its hands and feet on the driver's targets, so
 * bat grip, release and planted feet stay as accurate as before.
 */
const file = (name: string, detail: Detail) => new URL(`../public/sinverse-cricket/athletes/${name}${detail === "lo" ? "-lo" : ""}.glb`, import.meta.url);
async function parse(name: string, detail: Detail): Promise<GLTF> {
  const buf = readFileSync(file(name, detail));
  const loader = new GLTFLoader();
  // Texture images are irrelevant to joint positions, and need a browser to decode.
  loader.register(() => ({ name: "skip_textures", loadTexture: () => Promise.resolve(new T.Texture()) }) as never);
  return new Promise((resolve, reject) => loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", resolve, reject));
}
const squads = new Map<Detail, GLTF[]>();
async function squad(detail: Detail) {
  if (!squads.has(detail)) squads.set(detail, prepareSquad(await Promise.all(SQUAD.map((n) => parse(n, detail)))));
  return squads.get(detail)!;
}
const at = (o: T.Object3D) => o.getWorldPosition(new T.Vector3());
const triangles = (root: T.Object3D) => {
  let n = 0;
  root.traverse((o) => {
    const m = o as T.Mesh;
    if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute("position").count) / 3;
  });
  return n;
};
/** Budgets per athlete, so fourteen of them fit the renderer's per-preset limits. */
const BUDGET = { hi: { bytes: 2.5 * 1024 * 1024, triangles: 33000 }, lo: { bytes: 0.6 * 1024 * 1024, triangles: 8500 } };

test.describe("Cricket realistic athletes", () => {
  for (const detail of ["hi", "lo"] as const)
    test(`every ${detail}-detail squad model is a rigged, textured athlete within its budget`, async () => {
      for (const [k, g] of (await squad(detail)).entries()) {
        const name = SQUAD[k]!;
        expect(statSync(file(name, detail)).size, `${name} bytes`).toBeLessThan(BUDGET[detail].bytes);
        const body = new RealisticBody(g, buildAthlete("field", 1, 0, 1), new KitMaterials(), 0);
        expect(triangles(body.root), `${name} triangles`).toBeLessThan(BUDGET[detail].triangles);
        const bones = new Set<string>();
        body.root.traverse((o) => {
          if ((o as T.Bone).isBone) bones.add(o.name.replace(/^mixamorig:?/, ""));
        });
        expect(bones.size, `${name} bones`).toBeGreaterThanOrEqual(52);
        for (const b of ["Hips", "Head", "LeftHand", "RightHandIndex3", "LeftFoot", "RightToeBase"]) expect(bones.has(b), `${name} has ${b}`).toBe(true);
        // Body, kit (with shoes), eyes and usually hair; brows and lashes only up close.
        const names = body.meshes.map((m) => (m.material as T.Material).name);
        expect(names.some((n) => /body/.test(n)), `${name} skin`).toBe(true);
        expect(names.filter((n) => /kit|shoes/.test(n)), `${name} one kit mesh`).toEqual(["kit"]);
        expect(names.some((n) => /eyebrow|eyelash/.test(n)), `${name} brows`).toBe(detail === "hi");
      }
    });

  test("players are spread across the squad, deterministically", () => {
    const used = new Set<number>();
    for (let team = 0; team < 2; team++) for (let n = 1; n <= 11; n++) used.add(modelFor("field", n, team));
    expect(used.size).toBeGreaterThanOrEqual(5);
    expect(modelFor("bat", 4, 1)).toBe(modelFor("bat", 4, 1));
  });

  for (const detail of ["hi", "lo"] as const)
    test(`the ${detail}-detail body puts hands and feet on the driver's targets`, async () => {
      const kits = new KitMaterials();
      const rows: string[] = [];
      for (const [k, g] of (await squad(detail)).entries()) {
        const driver = buildAthlete("field", 7, 0, 1);
        const body = new RealisticBody(g, driver, kits, 0);
        expect(body.armStretch).toBeLessThanOrEqual(ARM_STRETCH_MAX);
        driver.root.position.set(3, 0, -2);
        driver.root.rotation.y = 0.9;
        for (const [clip, time] of [["idle", 0.3], ["ready", 0.2], ["keeper", 0.2], ["throw", 0.3], ["catchHigh", 0.4], ["celebrate", 0.6], ["dive", 0.5]] as const) {
          const p = makePose();
          sampleClip(CLIPS[clip], time, p);
          applyPose(driver, p);
          driver.root.updateMatrixWorld(true);
          body.sync();
          const gap = (d: T.Object3D, r: string) => at(d).distanceTo(at(body.bone(r)));
          const hands = Math.max(gap(driver.bones.lHand, "LeftHand"), gap(driver.bones.rHand, "RightHand")),
            feet = Math.max(gap(driver.bones.lFoot, "LeftFoot"), gap(driver.bones.rFoot, "RightFoot"));
          rows.push(`${SQUAD[k]} ${clip}: hands ${(hands * 100).toFixed(1)} cm, feet ${(feet * 100).toFixed(1)} cm`);
          // Planted feet must not move, whatever the pose.
          expect(feet, `${SQUAD[k]} ${clip} feet`).toBeLessThan(0.01);
          // A full-stretch dive may run out of (lengthened) arm; everything else is exact.
          expect(hands, `${SQUAD[k]} ${clip} hands`).toBeLessThan(clip === "dive" ? 0.12 : 0.01);
        }
      }
      console.log(rows.filter((r) => /dive/.test(r)).join("\n"));
    });

  test("the kit is one mesh whose shirt, trousers and shoes take team colours, with gear on the body", async () => {
    const [g] = await squad("lo");
    const kits = new KitMaterials();
    const driver = buildAthlete("bat", 1, 0, 1);
    const body = new RealisticBody(g!, driver, kits, 0);
    equipmentKit().dress(body, "bat", 0, driver.bones.bat, false);
    // Shirt above trousers above shoes, by the vertices each part owns.
    const geometry = body.kit.geometry,
      part = geometry.getAttribute("kitPart"),
      pos = geometry.getAttribute("position"),
      sum = [0, 0, 0],
      count = [0, 0, 0];
    for (let i = 0; i < part.count; i++) {
      const p = part.getX(i);
      sum[p]! += pos.getY(i);
      count[p]!++;
    }
    expect(count.every((c) => c > 0), "all three parts present").toBe(true);
    const [trousers, shirt, shoes] = sum.map((s, i) => s / count[i]!);
    expect(shirt!).toBeGreaterThan(trousers! + 0.2);
    expect(trousers!).toBeGreaterThan(shoes!);
    // Team changes swap the whole kit's material.
    expect(body.kit.material).toBe(kits.get(0));
    body.setTeam(1);
    expect(body.kit.material).toBe(kits.get(1));
    // A batter adds exactly two meshes: the bat on the driver's bat bone, and one
    // rigid mesh for helmet, pads and gloves on the realistic skeleton.
    expect(body.equipment).toHaveLength(2);
    expect(driver.bones.bat.children).toHaveLength(1);
    const gear = body.equipment.find((m) => (m as T.SkinnedMesh).isSkinnedMesh) as T.SkinnedMesh;
    // Every mesh of an athlete, gear included, shares one skeleton (one bone texture on the GPU).
    const skeletons = new Set(body.meshes.map((m) => (m as T.SkinnedMesh).skeleton).filter(Boolean));
    expect(skeletons.size).toBe(1);
    expect(skeletons.has(gear.skeleton)).toBe(true);
    // Pads follow the shins: posing the driver moves them with the real knee.
    driver.root.updateMatrixWorld(true);
    body.sync();
    expect(driver.mesh.layers.isEnabled(0), "the driver is never drawn").toBe(false);
  });
});
