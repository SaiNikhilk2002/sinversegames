import { expect, test } from "@playwright/test";
import { readFileSync, statSync } from "node:fs";
import * as T from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CLIPS, makePose, sampleClip } from "../src/games/sinverse-cricket/animation";
import { applyPose, buildAthlete } from "../src/games/sinverse-cricket/character";
import { appearanceFor } from "../src/games/sinverse-cricket/athlete-look";
import { ARM_STRETCH_MAX, FAR_EYES, KitMaterials, RealisticBody, SQUAD, equipmentKit, modelFor, prepareSquad, squadPeople, type Detail } from "../src/games/sinverse-cricket/realistic";

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
  // Ahead of the loader's own texture plugins (the WebP one needs a browser to check support).
  (loader as unknown as { pluginCallbacks: unknown[] }).pluginCallbacks.unshift(() => ({ name: "skip_textures", loadTexture: () => Promise.resolve(new T.Texture()) }));
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
/**
 * Budgets per athlete. The detailed athletes (on High and Ultra, the nine people
 * nearest the camera) carry a subdivided shirt with a collar, high-detail eyes and
 * fitted gear; the light ones are everyone else and every player on Low and Medium.
 */
const BUDGET = { hi: { bytes: 2.5 * 1024 * 1024, triangles: 35000 }, lo: { bytes: 0.6 * 1024 * 1024, triangles: 8500 } };

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

  for (const detail of ["hi", "lo"] as const)
    test(`the ${detail} kit is one mesh: shirt, trousers and shoes in team colours, with a trimmed collar and cuffs`, async () => {
      const [g] = await squad(detail);
      const kits = new KitMaterials();
      const driver = buildAthlete("bat", 1, 0, 1);
      const body = new RealisticBody(g!, driver, kits, 0);
      equipmentKit().dress(body, "bat", 0, driver.bones.bat, false);
      // Shirt above trousers above shoes, by the vertices each part owns.
      const geometry = body.kit.geometry,
        info = geometry.getAttribute("kitInfo"),
        pos = geometry.getAttribute("position"),
        sum = [0, 0, 0],
        count = [0, 0, 0];
      let trimTop = -Infinity,
        trimmed = 0;
      for (let i = 0; i < info.count; i++) {
        const p = info.getZ(i);
        sum[p]! += pos.getY(i);
        count[p]!++;
        if (p === 1 && info.getX(i) > 0.5) (trimmed++, (trimTop = Math.max(trimTop, pos.getY(i))));
        // Occlusion is baked into every cloth vertex, never fully black.
        expect(info.getY(i)).toBeGreaterThan(0.2);
      }
      expect(count.every((c) => c > 0), "all three parts present").toBe(true);
      const [trousers, shirt, shoes] = sum.map((s, i) => s / count[i]!);
      expect(shirt!).toBeGreaterThan(trousers! + 0.2);
      expect(trousers!).toBeGreaterThan(shoes!);
      // The collar stand is shirt-coloured; the edge of its fold-over leaf is trim,
      // just below the top of the stand (within 4 cm), and far above the cuffs.
      expect(trimmed).toBeGreaterThan(20);
      const shirtTop = Math.max(...Array.from({ length: info.count }, (_, i) => (info.getZ(i) === 1 ? pos.getY(i) : -Infinity)));
      expect(shirtTop - trimTop).toBeGreaterThanOrEqual(0);
      expect(shirtTop - trimTop).toBeLessThan(0.04);
      // Team changes swap the whole kit's material.
      expect(body.kit.material).toBe(kits.get(0));
      body.setTeam(1);
      expect(body.kit.material).toBe(kits.get(1));
      // A batter adds four meshes: the bat on the driver's bat bone, the helmet and
      // the pads rigidly on the head and shins, and gloves skinned to the hands.
      expect(body.equipment).toHaveLength(4);
      expect(driver.bones.bat.children).toHaveLength(1);
      // Every mesh of an athlete, gear included, shares one skeleton (one bone texture on the GPU).
      const skeletons = new Set(body.meshes.map((m) => (m as T.SkinnedMesh).skeleton).filter(Boolean));
      expect(skeletons.size).toBe(1);
      driver.root.updateMatrixWorld(true);
      body.sync();
      expect(driver.mesh.layers.isEnabled(0), "the driver is never drawn").toBe(false);
    });

  for (const detail of ["hi", "lo"] as const)
    test(`every ${detail} shirt is one piece of cloth: no scraps left by the sleeve cuts`, async () => {
      for (const name of SQUAD) {
        const g = await parse(name, detail);
        const shirt = g.scene.getObjectByName("kit-shirt") as T.Mesh | undefined;
        expect(shirt, `${name} shirt`).toBeTruthy();
        // Pieces of the surface, welding the vertices glTF splits along seams.
        const pos = shirt!.geometry.getAttribute("position"),
          index = shirt!.geometry.index!,
          key = new Map<string, number>(),
          weld: number[] = [];
        for (let i = 0; i < pos.count; i++) {
          const k = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => Math.round(v * 1e4)).join();
          if (!key.has(k)) key.set(k, key.size);
          weld.push(key.get(k)!);
        }
        const up = Array.from({ length: key.size }, (_, i) => i),
          root = (i: number): number => (up[i] === i ? i : (up[i] = root(up[i]!)));
        for (let t = 0; t < index.count; t += 3) {
          const a = root(weld[index.getX(t)]!);
          for (const v of [index.getX(t + 1), index.getX(t + 2)]) up[root(weld[v]!)] = a;
        }
        const pieces = new Set(weld.map((w) => root(w)));
        expect(pieces.size, `${name} ${detail} shirt pieces`).toBe(1);
      }
    });

  test("a bending back curves through the spine, and the collarbones rise with the arms", async () => {
    const [g] = await squad("hi"),
      a = buildAthlete("field", 1, 0, 1),
      body = new RealisticBody(g!, a, new KitMaterials(), 0),
      pose = makePose();
    const local = () => Object.fromEntries(["Spine1", "Spine2", "LeftShoulder", "RightShoulder"].map((n) => [n, body.bone(n).quaternion.clone()]));
    const posed = (clip: keyof typeof CLIPS, time: number) => {
      sampleClip(CLIPS[clip], time, pose);
      applyPose(a, pose);
      a.root.updateMatrixWorld(true);
      body.sync();
      return local();
    };
    const rest = posed("idle", 0);
    for (const [clip, time] of [["dive", 0.18], ["catchHigh", 0], ["appeal", 0.22], ["throw", 0.3]] as const) {
      const now = posed(clip, time);
      const lower = now.Spine1!.angleTo(rest.Spine1!),
        upper = now.Spine2!.angleTo(rest.Spine2!),
        collar = Math.max(now.LeftShoulder!.angleTo(rest.LeftShoulder!), now.RightShoulder!.angleTo(rest.RightShoulder!));
      console.log(`${clip}: lower chest bends ${((lower * 180) / Math.PI).toFixed(1)} deg, upper ${((upper * 180) / Math.PI).toFixed(1)} deg, collarbone ${((collar * 180) / Math.PI).toFixed(1)} deg`);
      // The bend is shared, not folded at a single vertebra.
      if (lower + upper > 0.1) expect(lower / (lower + upper)).toBeGreaterThan(0.25);
      if (clip === "catchHigh") expect(collar).toBeGreaterThan(0.05);
    }
  });

  test("the helmet is made to fit each head, and gloves are each athlete's own hands", async () => {
    for (const [k, g] of (await squad("hi")).entries()) {
      const driver = buildAthlete("bat", 1, 0, 1),
        body = new RealisticBody(g, driver, new KitMaterials(), 0);
      equipmentKit().dress(body, "bat", 0, driver.bones.bat, false);
      const m = body.measures(),
        [, helmet, , gloves] = body.equipment as T.SkinnedMesh[];
      // The head this helmet was made for is a real head size, measured from the skin.
      expect(helmet!.geometry.getAttribute("position").count).toBeGreaterThan(1000);
      const head = m.head,
        width = head.max.x - head.min.x;
      expect(width, `${SQUAD[k]} head width`).toBeGreaterThan(0.13);
      expect(width, `${SQUAD[k]} head width`).toBeLessThan(0.24);
      // Gloves use only hand, finger and wrist bones, so they can never come off the hands.
      const names = gloves!.skeleton.bones.map((b) => b.name);
      const si = gloves!.geometry.getAttribute("skinIndex"),
        sw = gloves!.geometry.getAttribute("skinWeight");
      for (let i = 0; i < si.count; i += 7)
        for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > 0.05) expect(names[si.getComponent(i, c)], `${SQUAD[k]} glove bone`).toMatch(/Hand|ForeArm/);
    }
  });

  test("the kit stays on the body in extreme poses: no cloth floats away from the skin", async () => {
    const [g] = await squad("hi");
    for (const [clip, time] of [["dive", 0.18], ["throw", 0.12], ["catchHigh", 0], ["stance", 0], ["celebrate", 0.6]] as const) {
      const driver = buildAthlete("field", 3, 0, 1),
        body = new RealisticBody(g!, driver, new KitMaterials(), 0);
      const p = makePose();
      sampleClip(CLIPS[clip], time, p);
      applyPose(driver, p);
      driver.root.updateMatrixWorld(true);
      body.sync();
      body.root.updateMatrixWorld(true);
      // Bone segments of the posed skeleton: cloth must stay within a body's width of one.
      const segments: [T.Vector3, T.Vector3][] = [];
      body.root.traverse((o) => {
        const bone = o as T.Bone;
        if (bone.isBone && (bone.parent as T.Bone)?.isBone && !/Hand.|Toe|End|Head_|eye/i.test(bone.name)) segments.push([bone.parent!.getWorldPosition(new T.Vector3()), bone.getWorldPosition(new T.Vector3())]);
      });
      const kp = body.kit.geometry.getAttribute("position"),
        part = body.kit.geometry.getAttribute("kitInfo"),
        line = new T.Line3(),
        q = new T.Vector3();
      let worst = 0;
      for (let i = 0; i < kp.count; i += 5) {
        if (part.getZ(i) === 2) continue;
        const v = body.kit.applyBoneTransform(i, new T.Vector3().fromBufferAttribute(kp, i)).applyMatrix4(body.kit.matrixWorld);
        let near = Infinity;
        for (const [a, c] of segments) near = Math.min(near, line.set(a, c).closestPointToPoint(v, true, q).distanceTo(v));
        worst = Math.max(worst, near);
      }
      const scale = body.root.getWorldScale(new T.Vector3()).x;
      console.log(`${clip}: furthest cloth from a bone ${(worst / scale * 100).toFixed(1)} cm over ${segments.length} bones`);
      expect(worst / scale, `${clip}: cloth to bone`).toBeLessThan(0.24);
    }
  });

  test("each player's look is deterministic, and two teams of 11 look like 22 different people", () => {
    const roster = [0, 1].flatMap((team) => Array.from({ length: 11 }, (_, i) => ({ role: "field" as const, number: i + 1, team })));
    const people = squadPeople(roster);
    expect(squadPeople(roster)).toEqual(people);
    expect(appearanceFor("field:4:1", 3)).toEqual(appearanceFor("field:4:1", 3));
    for (const team of [0, 1]) {
      const mine = people.filter((_, i) => roster[i]!.team === team);
      // Every squad model is used before any repeats (the eleventh shares one)...
      expect(new Set(mine.map((p) => p.model)).size).toBe(10);
      // ...and the two players who share a model don't look like twins.
      const looks = mine.map((p) => `${p.model}|${p.appearance.facialHair}|${p.appearance.haircut}`);
      expect(new Set(looks).size).toBe(11);
    }
    for (const p of people)
      for (const c of p.appearance.skinTint) {
        expect(c).toBeGreaterThan(0.8);
        expect(c).toBeLessThan(1.2);
      }
  });

  test("far players skip their eyes, and get them back as the camera comes close", async () => {
    const [g] = await squad("hi");
    const body = new RealisticBody(g!, buildAthlete("field", 2, 0, 1), new KitMaterials(), 0);
    const eyes = body.meshes.filter((m) => /high-poly|eyebrow|eyelash/.test((m.material as T.Material).name));
    expect(eyes.length).toBeGreaterThanOrEqual(3);
    body.setDistance(FAR_EYES + 10);
    expect(eyes.every((m) => !m.visible)).toBe(true);
    body.setDistance(8);
    expect(eyes.every((m) => m.visible)).toBe(true);
  });

  test("the hi bodies carry facial hair and scalp masks for the skin shader", async () => {
    for (const [k, g] of (await squad("hi")).entries()) {
      const body = new RealisticBody(g, buildAthlete("field", 1, 0, 1), new KitMaterials(), 0);
      const skin = body.meshes.find((m) => /body/.test((m.material as T.Material).name))!,
        mask = skin.geometry.getAttribute("faceMask");
      expect(mask, `${SQUAD[k]} mask`).toBeTruthy();
      const max = [0, 0, 0, 0];
      for (let i = 0; i < mask.count; i++) for (let c = 0; c < 4; c++) max[c] = Math.max(max[c]!, mask.getComponent(i, c));
      expect(max[0], `${SQUAD[k]} beard`).toBeGreaterThan(0.9);
      expect(max[1], `${SQUAD[k]} moustache`).toBeGreaterThan(0.5);
      expect(max[2], `${SQUAD[k]} scalp`).toBeGreaterThan(0.9);
    }
  });
});
