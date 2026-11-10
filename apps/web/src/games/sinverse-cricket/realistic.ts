import * as T from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { TEAMS } from "@platform/engines/sinverse-cricket";
import { BAT, RIG } from "./animation";
import type { Athlete } from "./character";

/**
 * Realistic athletes. The scene keeps posing the existing procedural rig (the
 * "driver"): its IK puts hands on the bat, the bowling hand on the release
 * point and planted feet on the ground, and the tests hold it to that. This
 * module dresses the driver in a realistic body built from CC0 MakeHuman assets
 * (scripts/cricket-characters), copying the driver's motion onto a 52-bone
 * Mixamo-compatible skeleton, then pulling the real hands and feet onto the
 * driver's exact targets with a two-bone reach. The driver's own mesh is moved
 * to a hidden layer, so its bat bone, hand points and timing stay authoritative.
 *
 * Presentation only. Nothing here reads or writes the match.
 */

export const SQUAD = ["athlete-01", "athlete-02", "athlete-03", "athlete-04", "athlete-05", "athlete-06"] as const;
const URL_BASE = "/sinverse-cricket/athletes/";
/** Layer the hidden driver meshes are moved to; cameras only render layer 0. */
export const DRIVER_LAYER = 31;

let squad: Promise<GLTF[]> | null = null;
/** Loads the squad once per page. Rejects if any model is missing. */
export function loadSquad(): Promise<GLTF[]> {
  if (!squad) {
    const loader = new GLTFLoader();
    // Embedded textures become blob: URLs. three.js reads those with fetch(), which
    // the site's Content-Security-Policy limits (connect-src), but an <img> may load
    // them (img-src allows blob:). Decode through an image instead.
    loader.register((parser) => {
      (parser as unknown as { textureLoader: T.Loader }).textureLoader = new T.TextureLoader(parser.options.manager);
      return { name: "sinverse_image_textures" };
    });
    squad = Promise.all(SQUAD.map((name) => loader.loadAsync(URL_BASE + name + ".glb"))).then((models) => {
      // Cricket spikes are white: drop the leather texture from the shoes.
      for (const m of models)
        m.scene.traverse((o) => {
          const mat = (o as T.Mesh).material as T.MeshStandardMaterial | undefined;
          if (mat && /shoes/.test(mat.name)) {
            mat.map = null;
            mat.color.set("#f1f1ee");
            mat.roughness = 0.55;
            mat.needsUpdate = true;
          }
        });
      return models;
    });
    squad.catch(() => (squad = null));
  }
  return squad;
}

/** Which squad model a player wears. Deterministic and fictional, like `lookFor`. */
export function modelFor(role: Athlete["role"], number: number, team: number) {
  if (role === "umpire") return 3;
  let h = Math.imul(number + 7, 2246822519) ^ Math.imul(team + 5, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return h % SQUAD.length;
}

// Driver bone -> Mixamo bone. Unlisted Mixamo bones (Spine1, shoulders, fingers,
// toes, end bones) follow their parent rigidly from the calibrated rest.
const MAP: [keyof Athlete["bones"], string][] = [
  ["hips", "Hips"],
  ["spine", "Spine"],
  ["chest", "Spine2"],
  ["neck", "Neck"],
  ["head", "Head"],
  ["lUpper", "LeftArm"],
  ["lFore", "LeftForeArm"],
  ["lHand", "LeftHand"],
  ["rUpper", "RightArm"],
  ["rFore", "RightForeArm"],
  ["rHand", "RightHand"],
  ["lThigh", "LeftUpLeg"],
  ["lShin", "LeftLeg"],
  ["lFoot", "LeftFoot"],
  ["rThigh", "RightUpLeg"],
  ["rShin", "RightLeg"],
  ["rFoot", "RightFoot"],
];
/** Rest directions of the driver's bones (root space): limbs hang, the spine rises. */
const DOWN = new T.Vector3(0, -1, 0),
  UP = new T.Vector3(0, 1, 0);
const ALIGN: Record<string, { child: string; dir: T.Vector3 }> = {
  LeftArm: { child: "LeftForeArm", dir: DOWN },
  LeftForeArm: { child: "LeftHand", dir: DOWN },
  RightArm: { child: "RightForeArm", dir: DOWN },
  RightForeArm: { child: "RightHand", dir: DOWN },
  LeftUpLeg: { child: "LeftLeg", dir: DOWN },
  LeftLeg: { child: "LeftFoot", dir: DOWN },
  RightUpLeg: { child: "RightLeg", dir: DOWN },
  RightLeg: { child: "RightFoot", dir: DOWN },
  Spine: { child: "Spine1", dir: UP },
  Spine1: { child: "Spine2", dir: UP },
  Spine2: { child: "Neck", dir: UP },
  Neck: { child: "Head", dir: UP },
};
const LIMBS = [
  { upper: "LeftArm", lower: "LeftForeArm", end: "LeftHand", target: "lHand", hint: "lFore" },
  { upper: "RightArm", lower: "RightForeArm", end: "RightHand", target: "rHand", hint: "rFore" },
  { upper: "LeftUpLeg", lower: "LeftLeg", end: "LeftFoot", target: "lFoot", hint: "lShin" },
  { upper: "RightUpLeg", lower: "RightLeg", end: "RightFoot", target: "rFoot", hint: "rShin" },
] as const;

const short = (name: string) => name.replace(/^mixamorig:?/, "");
/** Most an arm may be lengthened to meet the driver's reach. */
export const ARM_STRETCH_MAX = 1.12;

export interface KitColours {
  shirt: string;
  trousers: string;
}
export const kitColours = (team: number): KitColours =>
  team < 0 ? { shirt: "#eeece4", trousers: "#2a2e36" } : { shirt: TEAMS[team]!.color, trousers: TEAMS[team]!.dark };

/** Shared per-scene kit materials: one shirt and one trouser material per team and the umpire. */
export class KitMaterials {
  private shirts = new Map<number, T.MeshStandardMaterial>();
  private trousers = new Map<number, T.MeshStandardMaterial>();
  constructor(private base: T.MeshStandardMaterial) {}
  get(team: number, part: "shirt" | "trousers") {
    const cache = part === "shirt" ? this.shirts : this.trousers;
    let m = cache.get(team);
    if (!m) {
      m = this.base.clone();
      m.color.set(kitColours(team)[part]).convertSRGBToLinear();
      // The fold map was authored for white cloth; a touch of lift keeps dark kits readable.
      m.roughness = 0.82;
      m.metalness = 0;
      cache.set(team, m);
    }
    return m;
  }
  all() {
    return [...this.shirts.values(), ...this.trousers.values()];
  }
}

const tq = new T.Quaternion(),
  tq2 = new T.Quaternion(),
  tv = new T.Vector3(),
  tv2 = new T.Vector3(),
  tv3 = new T.Vector3(),
  tv4 = new T.Vector3(),
  tm = new T.Matrix4();

interface Joint {
  bone: T.Bone;
  parent: Joint | null;
  /** Driver bone this joint copies, if any. */
  driver: T.Bone | null;
  /** World rotation offset: real = driver * offset (both in the actor root's frame at rest). */
  offset: T.Quaternion;
  /** Calibrated local rest rotation, for joints that just follow their parent. */
  rest: T.Quaternion;
  /** World rotation this frame. */
  world: T.Quaternion;
}

/**
 * One realistic body worn over one driver athlete. `root` is added under the
 * driver's root group, so position, facing and size are shared.
 */
export class RealisticBody {
  readonly root: T.Group;
  readonly meshes: T.SkinnedMesh[] = [];
  private joints: Joint[] = [];
  private byName = new Map<string, Joint>();
  private lengths = new Map<string, [number, number]>();
  private hips: Joint;
  private armature: T.Object3D;
  private shirt: T.SkinnedMesh | null = null;
  private trousers: T.SkinnedMesh | null = null;
  private team = NaN;
  readonly equipment: T.Mesh[] = [];

  constructor(
    source: GLTF,
    private driver: Athlete,
    private kits: KitMaterials,
    team: number,
    private makeEquipment: (body: RealisticBody) => void,
  ) {
    this.root = cloneSkinned(source.scene) as T.Group;
    this.root.name = "realistic-body";
    const hipsBone = this.findBone("Hips");
    this.armature = hipsBone.parent!;
    this.splitKit();
    this.root.traverse((o) => {
      const m = o as T.SkinnedMesh;
      if (m.isSkinnedMesh) {
        m.frustumCulled = false;
        if (!this.meshes.includes(m)) this.meshes.push(m);
      }
    });
    this.calibrate();
    this.hips = this.byName.get("Hips")!;
    // Size by leg length, so the real feet land where the driver plants them and
    // the athlete keeps natural proportions. The driver's root carries his own size.
    const [thigh, shin] = this.lengths.get("LeftUpLeg")!;
    this.root.scale.setScalar((RIG.thigh + RIG.shin) / (thigh + shin));
    driver.root.add(this.root);
    // The driver keeps animating and stays the source of truth, but is never drawn.
    driver.mesh.layers.set(DRIVER_LAYER);
    this.setTeam(team);
    makeEquipment(this);
  }

  private findBone(name: string) {
    let found: T.Bone | null = null;
    this.root.traverse((o) => {
      if (!found && (o as T.Bone).isBone && short(o.name) === name) found = o as T.Bone;
    });
    if (!found) throw new Error(`athlete model is missing bone ${name}`);
    return found as T.Bone;
  }
  bone(name: string) {
    return this.byName.get(name)!.bone;
  }

  /** The suit is one mesh; split it into shirt and trousers so each takes a team colour. */
  private splitKit() {
    let suit: T.SkinnedMesh | null = null;
    this.root.traverse((o) => {
      const m = o as T.SkinnedMesh;
      if (m.isSkinnedMesh && (m.material as T.Material).name === "kit") suit = m;
    });
    if (!suit) return;
    const mesh = suit as T.SkinnedMesh,
      g = mesh.geometry,
      pos = g.getAttribute("position"),
      index = g.getIndex()!;
    g.computeBoundingBox();
    const box = g.boundingBox!,
      mid = (box.min.y + box.max.y) / 2;
    // Shirt and trousers are separate pieces of cloth. Group triangles into
    // connected pieces and sort each whole piece by its height, so the hem stays
    // the hem instead of being cut triangle by triangle.
    const parent = new Int32Array(pos.count).map((_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
      return i;
    };
    for (let i = 0; i < index.count; i += 3) {
      const r = find(index.getX(i));
      parent[find(index.getX(i + 1))] = r;
      parent[find(index.getX(i + 2))] = find(r);
    }
    const sum = new Map<number, [number, number]>();
    for (let v = 0; v < pos.count; v++) {
      const r = find(v),
        e = sum.get(r) ?? [0, 0];
      e[0] += pos.getY(v);
      e[1]++;
      sum.set(r, e);
    }
    const top: number[] = [],
      bottom: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const [y, n] = sum.get(find(index.getX(i)))!;
      (y / n > mid ? top : bottom).push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    }
    const part = (ids: number[]) => {
      const geometry = new T.BufferGeometry();
      for (const [name, attribute] of Object.entries(g.attributes)) geometry.setAttribute(name, attribute);
      geometry.setIndex(ids);
      const m = new T.SkinnedMesh(geometry, mesh.material);
      m.name = mesh.name;
      m.bind(mesh.skeleton, mesh.bindMatrix);
      m.bindMode = mesh.bindMode;
      mesh.parent!.add(m);
      return m;
    };
    this.shirt = part(top);
    this.trousers = part(bottom);
    mesh.parent!.remove(mesh);
  }

  /**
   * Puts the real skeleton into the driver's rest pose (limbs hanging, spine
   * upright) and records, per bone, the rotation that maps driver to real.
   */
  /** Rest distance from a bone's joint to its first bone child's joint. */
  private segment(all: T.Bone[], name: string) {
    const bone = all.find((b) => short(b.name) === name)!,
      child = bone.children.find((c) => (c as T.Bone).isBone)!;
    return child.getWorldPosition(tv).distanceTo(bone.getWorldPosition(tv2));
  }
  /**
   * Converts an offset in the athlete's own rest frame (+Y up, +Z forward, +X his
   * left, metres) into `bone`'s local space, and returns the rotation that lines
   * an object's axes up with that frame. For placing equipment on the body.
   */
  restFrame(name: string, x: number, y: number, z: number) {
    const j = this.byName.get(name)!,
      inv = j.offset.clone().invert(),
      scale = 1 / (this.root.scale.x || 1);
    return { position: new T.Vector3(x, y, z).applyQuaternion(inv).multiplyScalar(scale), quaternion: inv, scale };
  }

  /** Bends every finger by `angle` radians at each knuckle (positive curls into the palm). */
  curlFingers(angle: number) {
    for (const j of this.joints) {
      const name = short(j.bone.name),
        finger = /^(Left|Right)Hand(Index|Middle|Ring|Pinky)[1-3]$/.exec(name);
      if (!finger) continue;
      // At rest the hands hang with palms facing the thighs, so curling turns
      // fingers about the forward axis, inwards for each hand.
      const side = finger[1] === "Left" ? -1 : 1,
        axis = new T.Vector3(0, 0, 1).applyQuaternion(j.offset.clone().invert()).normalize();
      j.rest.multiply(new T.Quaternion().setFromAxisAngle(axis, side * angle));
    }
  }

  /** How much the arms were lengthened to fit the driver's reach (1 = not at all). */
  armStretch = 1;

  private calibrate() {
    const all: T.Bone[] = [];
    this.root.traverse((o) => {
      if ((o as T.Bone).isBone) all.push(o as T.Bone);
    });
    const save = this.root.scale.x;
    this.root.scale.setScalar(1);
    this.root.updateMatrixWorld(true);
    for (const bone of all) {
      const rule = ALIGN[short(bone.name)];
      if (!rule) continue;
      const child = all.find((b) => b.parent === bone && short(b.name) === rule.child);
      if (!child) continue;
      bone.updateMatrixWorld(true);
      const from = child.getWorldPosition(tv).sub(bone.getWorldPosition(tv2)).normalize();
      tq.setFromUnitVectors(from, rule.dir);
      // Apply as a world-space pre-rotation, then convert back to local.
      bone.getWorldQuaternion(tq2);
      tq2.premultiply(tq);
      bone.parent!.getWorldQuaternion(tq);
      bone.quaternion.copy(tq.invert().multiply(tq2));
      bone.updateMatrixWorld(true);
    }
    // The driver's arm reach is longer than a real arm in proportion to the legs.
    // Lengthen the arms a little so batting and catching poses can be reached;
    // anything left over is closed by the reach solver.
    const leg = (name: string) => this.segment(all, name),
      legLength = leg("LeftUpLeg") + leg("LeftLeg"),
      armLength = leg("LeftArm") + leg("LeftForeArm"),
      wanted = ((RIG.upperArm + RIG.forearm) / (RIG.thigh + RIG.shin)) * legLength,
      stretch = Math.min(ARM_STRETCH_MAX, Math.max(1, wanted / armLength));
    for (const bone of all) if (/^(Left|Right)(ForeArm|Hand)$/.test(short(bone.name))) bone.position.multiplyScalar(stretch);
    this.root.updateMatrixWorld(true);
    this.armStretch = stretch;
    const driverRest = new Map<T.Bone, T.Quaternion>();
    for (const [d] of MAP) driverRest.set(this.driver.bones[d], new T.Quaternion());
    const mapped = new Map(MAP.map(([d, r]) => [r, this.driver.bones[d]]));
    const visit = (bone: T.Bone, parent: Joint | null) => {
      const world = bone.getWorldQuaternion(new T.Quaternion());
      const driver = mapped.get(short(bone.name)) ?? null;
      const joint: Joint = { bone, parent, driver, offset: world.clone(), rest: bone.quaternion.clone(), world: new T.Quaternion() };
      this.joints.push(joint);
      this.byName.set(short(bone.name), joint);
      for (const c of bone.children) if ((c as T.Bone).isBone) visit(c as T.Bone, joint);
    };
    visit(this.findBone("Hips"), null);
    for (const limb of LIMBS) {
      const u = this.byName.get(limb.upper)!.bone,
        l = this.byName.get(limb.lower)!.bone,
        e = this.byName.get(limb.end)!.bone;
      this.lengths.set(limb.upper, [l.getWorldPosition(tv).distanceTo(u.getWorldPosition(tv2)), e.getWorldPosition(tv).distanceTo(l.getWorldPosition(tv2))]);
    }
    this.root.scale.setScalar(save);
  }

  setTeam(team: number) {
    if (team === this.team) return;
    this.team = team;
    if (this.shirt) this.shirt.material = this.kits.get(team, "shirt");
    if (this.trousers) this.trousers.material = this.kits.get(team, "trousers");
  }

  setShadows(cast: boolean) {
    for (const m of this.meshes) m.castShadow = cast;
    if (this.shirt) this.shirt.castShadow = cast;
    if (this.trousers) this.trousers.castShadow = cast;
    for (const m of this.equipment) m.castShadow = cast;
  }

  /** Copies the driver's current pose. Call after the driver is posed and its matrices updated. */
  sync() {
    const d = this.driver;
    d.root.updateMatrixWorld(true);
    // Rotations in the driver root's frame: real = driver * offset.
    d.root.getWorldQuaternion(tq2).invert();
    this.armature.updateWorldMatrix(true, false);
    const armatureQ = this.armature.getWorldQuaternion(new T.Quaternion()).premultiply(tq2);
    for (const j of this.joints) {
      if (j.driver) j.world.copy(j.driver.getWorldQuaternion(tq).premultiply(tq2)).multiply(j.offset);
      else j.world.copy(j.parent ? j.parent.world : armatureQ).multiply(j.rest);
      const parentQ = j.parent ? j.parent.world : armatureQ;
      j.bone.quaternion.copy(tq.copy(parentQ).invert().multiply(j.world));
    }
    // Place the pelvis so the real hip joints sit on the driver's hip joints.
    this.root.updateMatrixWorld(true);
    const realHips = this.bone("LeftUpLeg").getWorldPosition(tv).add(this.bone("RightUpLeg").getWorldPosition(tv2)).multiplyScalar(0.5),
      driverHips = d.bones.lThigh.getWorldPosition(tv3).add(d.bones.rThigh.getWorldPosition(tv4)).multiplyScalar(0.5);
    const pelvis = this.hips.bone.getWorldPosition(new T.Vector3()).add(driverHips).sub(realHips);
    this.armature.worldToLocal(pelvis);
    this.hips.bone.position.copy(pelvis);
    this.root.updateMatrixWorld(true);
    // Hands and feet onto the driver's exact joints.
    for (const limb of LIMBS) this.reach(limb);
  }

  private reach(limb: (typeof LIMBS)[number]) {
    const upper = this.byName.get(limb.upper)!.bone,
      lower = this.byName.get(limb.lower)!.bone,
      end = this.byName.get(limb.end)!,
      scale = this.root.getWorldScale(tv4).x,
      [l1r, l2r] = this.lengths.get(limb.upper)!,
      l1 = l1r * scale,
      l2 = l2r * scale;
    const S = upper.getWorldPosition(new T.Vector3()),
      target = this.driver.bones[limb.target].getWorldPosition(new T.Vector3()),
      hint = this.driver.bones[limb.hint].getWorldPosition(new T.Vector3());
    const toT = tv.copy(target).sub(S),
      raw = toT.length(),
      dist = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, raw));
    if (raw < 1e-5) return;
    toT.divideScalar(raw);
    const pole = tv2.copy(hint).sub(S);
    pole.addScaledVector(toT, -pole.dot(toT));
    if (pole.lengthSq() < 1e-8) pole.set(0, 0, 1);
    pole.normalize();
    const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist),
      h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    const E = tv3.copy(S).addScaledVector(toT, along).addScaledVector(pole, h);
    const W = new T.Vector3().copy(S).addScaledVector(toT, dist);
    this.aim(upper, lower, E);
    this.aim(lower, end.bone, W);
    // Keep the hand/foot orientation the driver chose.
    const parentQ = lower.getWorldQuaternion(tq);
    const rootQ = this.driver.root.getWorldQuaternion(new T.Quaternion());
    const wanted = new T.Quaternion().copy(rootQ).multiply(end.world);
    end.bone.quaternion.copy(parentQ.invert().multiply(wanted));
    end.bone.updateMatrixWorld(true);
  }

  /** Rotates `bone` so that `child`'s joint lands on `point` (world). */
  private aim(bone: T.Bone, child: T.Bone, point: T.Vector3) {
    const p = bone.getWorldPosition(new T.Vector3()),
      from = child.getWorldPosition(new T.Vector3()).sub(p).normalize(),
      to = new T.Vector3().copy(point).sub(p).normalize();
    const delta = new T.Quaternion().setFromUnitVectors(from, to);
    const world = bone.getWorldQuaternion(new T.Quaternion()).premultiply(delta);
    const parentQ = bone.parent!.getWorldQuaternion(new T.Quaternion());
    bone.quaternion.copy(parentQ.invert().multiply(world));
    bone.updateMatrixWorld(true);
  }
}

/**
 * Equipment the procedural body used to carry in its own mesh: the bat on the
 * driver's bat bone (so contact stays exact), plus helmet, pads and gloves on
 * the real skeleton. Shared geometry, one material per kind.
 */
export function equipmentKit() {
  const geometries: T.BufferGeometry[] = [],
    materials: T.Material[] = [];
  const keep = <G extends T.BufferGeometry>(g: G) => (geometries.push(g), g);
  const mat = (o: T.MeshStandardMaterialParameters) => {
    const m = new T.MeshStandardMaterial(o);
    materials.push(m);
    return m;
  };
  const willow = mat({ color: "#d8bf8a", roughness: 0.62 }),
    grip = mat({ color: "#1d2430", roughness: 0.9 }),
    padding = mat({ color: "#f3f1ea", roughness: 0.85 }),
    glove = mat({ color: "#f1efe8", roughness: 0.8 }),
    helmets = [0, 1].map((t) => mat({ color: TEAMS[t]!.dark, roughness: 0.35, metalness: 0.1 })),
    grille = mat({ color: "#9aa3ad", roughness: 0.4, metalness: 0.8 });
  // Bat: handle from the top hand towards the blade, then the blade to the toe,
  // along the bat bone's -Y with the face on +Z (see placeBat).
  const handle = keep(new T.CylinderGeometry(0.017, 0.017, BAT.sweet - 0.34 + 0.08, 10)).translate(0, -(BAT.sweet - 0.34) / 2 + 0.04, 0);
  const blade = keep(new T.BoxGeometry(0.106, BAT.toe - 0.3, 0.04, 1, 4, 1));
  {
    // Shape the back of the blade: thick in the middle, thin at the edges and toe.
    const p = blade.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / 0.053,
        y = p.getY(i) / ((BAT.toe - 0.3) / 2),
        z = p.getZ(i);
      if (z < 0) p.setZ(i, z * (0.55 + 0.45 * (1 - x * x)) * (0.75 + 0.25 * (1 - Math.abs(y + 0.3))));
    }
    blade.translate(0, -0.3 - (BAT.toe - 0.3) / 2, 0);
    blade.computeVertexNormals();
  }
  const shell = keep(new T.SphereGeometry(0.135, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)).scale(1, 1.05, 1.12);
  const peak = keep(new T.BoxGeometry(0.2, 0.012, 0.07)).translate(0, 0.035, 0.14);
  const bars = keep(new T.TorusGeometry(0.11, 0.006, 6, 16, Math.PI)).rotateX(Math.PI / 2).rotateZ(Math.PI).translate(0, -0.03, 0.035);
  const pad = keep(new T.CapsuleGeometry(0.068, 0.36, 4, 10)).scale(1.05, 1, 0.7);
  const gloveG = keep(new T.CapsuleGeometry(0.045, 0.06, 4, 8)).scale(1, 1, 0.75);

  return {
    geometries,
    materials,
    dress(body: RealisticBody, role: Athlete["role"], team: number, batBone: T.Bone, cast: boolean) {
      const mesh = (g: T.BufferGeometry, m: T.Material) => {
        const e = new T.Mesh(g, m);
        e.castShadow = cast;
        body.equipment.push(e);
        return e;
      };
      /** Attaches equipment to a real bone, positioned in the athlete's rest frame. */
      const wear = (bone: string, g: T.BufferGeometry, m: T.Material, x: number, y: number, z: number) => {
        const f = body.restFrame(bone, x, y, z),
          e = mesh(g, m);
        e.position.copy(f.position);
        e.quaternion.copy(f.quaternion);
        e.scale.setScalar(f.scale);
        body.bone(bone).add(e);
        return e;
      };
      if (role === "bat") {
        // The bat rides the driver's bat bone, so contact and grip stay exact.
        batBone.add(mesh(handle, grip), mesh(blade, willow));
        const helmet = helmets[team < 0 ? 0 : team]!;
        wear("Head", shell, helmet, 0, 0.085, 0.0);
        wear("Head", peak, helmet, 0, 0.085, 0.0);
        wear("Head", bars, grille, 0, 0.085, 0.0);
      }
      if (role === "bat" || role === "keeper") {
        for (const side of ["Left", "Right"]) {
          // Down the shin from the knee, and a little in front of it.
          wear(side + "Leg", pad, padding, 0, -0.2, 0.045);
          wear(side + "Hand", gloveG, glove, 0, -0.055, 0);
        }
        body.curlFingers(0.9);
      } else body.curlFingers(role === "umpire" ? 0.25 : 0.4);
    },
  };
}
