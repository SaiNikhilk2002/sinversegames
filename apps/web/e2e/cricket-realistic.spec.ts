import { expect, test } from "@playwright/test";
import { readFileSync, statSync } from "node:fs";
import * as T from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CLIPS, makePose, sampleClip } from "../src/games/sinverse-cricket/animation";
import { applyPose, buildAthlete } from "../src/games/sinverse-cricket/character";
import { ARM_STRETCH_MAX, KitMaterials, RealisticBody, SQUAD, equipmentKit, modelFor } from "../src/games/sinverse-cricket/realistic";

/**
 * The realistic athletes (CC0 MakeHuman bodies, see scripts/cricket-characters)
 * wear the procedural rig as a driver. These check the models themselves and
 * that the realistic body lands its hands and feet on the driver's targets, so
 * bat grip, release and planted feet stay as accurate as before.
 */
const file = (name: string) => new URL(`../public/sinverse-cricket/athletes/${name}.glb`, import.meta.url);
async function load(name: string): Promise<GLTF> {
  const buf = readFileSync(file(name));
  const loader = new GLTFLoader();
  // Texture images are irrelevant to joint positions, and need a browser to decode.
  loader.register(() => ({ name: "skip_textures", loadTexture: () => Promise.resolve(new T.Texture()) }) as never);
  return new Promise((resolve, reject) => loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", resolve, reject));
}
const kitOf = (g: GLTF) => {
  let kit: T.MeshStandardMaterial | null = null;
  g.scene.traverse((o) => {
    const m = (o as T.Mesh).material as T.MeshStandardMaterial | undefined;
    if (m?.name === "kit") kit = m;
  });
  return kit;
};
const at = (o: T.Object3D) => o.getWorldPosition(new T.Vector3());

test.describe("Cricket realistic athletes", () => {
  test("every squad model is a rigged, textured athlete within the download budget", async () => {
    for (const name of SQUAD) {
      expect(statSync(file(name)).size, `${name} bytes`).toBeLessThan(2.5 * 1024 * 1024);
      const g = await load(name);
      const bones = new Set<string>(),
        materials = new Set<string>();
      g.scene.traverse((o) => {
        if ((o as T.Bone).isBone) bones.add(o.name.replace(/^mixamorig:?/, ""));
        const m = (o as T.Mesh).material as T.Material | undefined;
        if (m) materials.add(m.name);
      });
      expect(bones.size, `${name} bones`).toBeGreaterThanOrEqual(52);
      for (const b of ["Hips", "Head", "LeftHand", "RightHandIndex3", "LeftFoot", "RightToeBase"]) expect(bones.has(b), `${name} has ${b}`).toBe(true);
      expect(kitOf(g), `${name} kit material`).not.toBeNull();
      expect([...materials].some((m) => /body/.test(m)), `${name} skin material`).toBe(true);
    }
  });

  test("players are spread across the squad, deterministically", () => {
    const used = new Set<number>();
    for (let team = 0; team < 2; team++) for (let n = 1; n <= 11; n++) used.add(modelFor("field", n, team));
    expect(used.size).toBeGreaterThanOrEqual(5);
    expect(modelFor("bat", 4, 1)).toBe(modelFor("bat", 4, 1));
  });

  test("the realistic body puts hands and feet on the driver's targets", async () => {
    const kits = new KitMaterials(new T.MeshStandardMaterial());
    const rows: string[] = [];
    for (const name of SQUAD) {
      const g = await load(name);
      const driver = buildAthlete("field", 7, 0, 1);
      const body = new RealisticBody(g, driver, kits, 0, () => {});
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
        rows.push(`${name} ${clip}: hands ${(hands * 100).toFixed(1)} cm, feet ${(feet * 100).toFixed(1)} cm`);
        // Planted feet must not move, whatever the pose.
        expect(feet, `${name} ${clip} feet`).toBeLessThan(0.01);
        // A full-stretch dive may run out of (lengthened) arm; everything else is exact.
        expect(hands, `${name} ${clip} hands`).toBeLessThan(clip === "dive" ? 0.12 : 0.01);
      }
    }
    console.log(rows.join("\n"));
  });

  test("the kit splits into a shirt and trousers that take team colours, with equipment on the body", async () => {
    const g = await load(SQUAD[0]);
    const kits = new KitMaterials(kitOf(g)!);
    const driver = buildAthlete("bat", 1, 0, 1);
    const equipment = equipmentKit();
    const body = new RealisticBody(g, driver, kits, 0, () => {});
    equipment.dress(body, "bat", 0, driver.bones.bat, false);
    const kitMeshes: T.SkinnedMesh[] = [];
    body.root.traverse((o) => {
      const m = o as T.SkinnedMesh;
      if (m.isSkinnedMesh && kits.all().includes(m.material as T.MeshStandardMaterial)) kitMeshes.push(m);
    });
    expect(kitMeshes).toHaveLength(2);
    // Both halves share one vertex buffer, so average the vertices each one draws.
    const top = kitMeshes.map((m) => {
      const index = m.geometry.getIndex()!,
        pos = m.geometry.getAttribute("position");
      let y = 0;
      for (let i = 0; i < index.count; i++) y += pos.getY(index.getX(i));
      return y / index.count;
    });
    expect(Math.abs(top[0]! - top[1]!), "shirt above trousers").toBeGreaterThan(0.2);
    const before = kits.get(0, "shirt");
    body.setTeam(1);
    expect(kitMeshes.some((m) => m.material === kits.get(1, "shirt"))).toBe(true);
    expect(kitMeshes.some((m) => m.material === before)).toBe(false);
    // Bat on the driver's bat bone; helmet, pads and gloves on the real body.
    expect(driver.bones.bat.children.length).toBeGreaterThanOrEqual(2);
    expect(body.equipment.length).toBeGreaterThanOrEqual(9);
    // The driver is never drawn.
    expect(driver.mesh.layers.isEnabled(0)).toBe(false);
  });
});
