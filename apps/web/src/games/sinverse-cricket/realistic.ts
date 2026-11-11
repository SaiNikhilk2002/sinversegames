import * as T from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { TEAMS } from "@platform/engines/sinverse-cricket";
import { BAT, RIG } from "./animation";
import type { Athlete } from "./character";
import { LOWER, type Joint as MotionJoint, type MotionFrame } from "./motion";

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
 * Two levels of detail per athlete: "hi" for close players on High and Ultra,
 * "lo" (a 1,591-vertex body, thinned cloth and hair) for everyone else. Draw
 * calls are kept low: kit and shoes are one mesh with per-vertex colours, and
 * helmet, pads and gloves are one rigidly skinned mesh.
 *
 * Presentation only. Nothing here reads or writes the match.
 */

export const SQUAD = ["athlete-01", "athlete-02", "athlete-03", "athlete-04", "athlete-05", "athlete-06"] as const;
export type Detail = "hi" | "lo";
const URL_BASE = "/sinverse-cricket/athletes/";
/** Layer the hidden driver meshes are moved to; cameras only render layer 0. */
export const DRIVER_LAYER = 31;
/** Kit parts, stored per vertex in the merged kit mesh. */
const PART = { trousers: 0, shirt: 1, shoes: 2 } as const;

interface PreparedKit {
  geometry: T.BufferGeometry;
  /** The suit's own material (fold map), the base for every team's kit. */
  material: T.MeshStandardMaterial;
  bindMatrix: T.Matrix4;
  parent: string;
}
interface Prepared {
  kit: PreparedKit;
  gear: Map<string, T.BufferGeometry>;
}
const prepared = new WeakMap<GLTF, Prepared>();

const squads = new Map<Detail, Promise<GLTF[]>>();
/** Loads one level of the squad once per page. Rejects if any model is missing. */
export function loadSquad(detail: Detail): Promise<GLTF[]> {
  let squad = squads.get(detail);
  if (!squad) {
    const loader = new GLTFLoader();
    // Embedded textures become blob: URLs. three.js reads those with fetch(), which
    // the site's Content-Security-Policy limits (connect-src), but an <img> may load
    // them (img-src allows blob:). Decode through an image instead.
    loader.register((parser) => {
      (parser as unknown as { textureLoader: T.Loader }).textureLoader = new T.TextureLoader(parser.options.manager);
      return { name: "sinverse_image_textures" };
    });
    const suffix = detail === "lo" ? "-lo" : "";
    squad = Promise.all(SQUAD.map((name) => loader.loadAsync(URL_BASE + name + suffix + ".glb"))).then(prepareSquad);
    squad.catch(() => squads.delete(detail));
    squads.set(detail, squad);
  }
  return squad;
}

/** Readies loaded models for `RealisticBody`: shared textures and a one-mesh kit. */
export function prepareSquad(models: GLTF[]) {
  shareTextures(models);
  for (const m of models)
    if (!prepared.has(m)) {
      const body = bodyOf(m.scene);
      shareSkeleton(m, body);
      prepared.set(m, { kit: prepareKit(m, body), gear: new Map() });
    }
  return models;
}

function bodyOf(root: T.Object3D) {
  let body: T.SkinnedMesh | null = null;
  root.traverse((o) => {
    const m = o as T.SkinnedMesh;
    if (!body && m.isSkinnedMesh && /body/.test((m.material as T.Material).name)) body = m;
  });
  if (!body) throw new Error("athlete model has no body");
  return body as T.SkinnedMesh;
}

/**
 * Every skinned mesh gets its own skeleton, and every skeleton its own bone
 * texture on the GPU. Rewrite each mesh's joint indices into the body's joint
 * order once per model, so all of an athlete's meshes can share one skeleton.
 */
function shareSkeleton(model: GLTF, body: T.SkinnedMesh) {
  const order = body.skeleton.bones.map((b) => b.name);
  model.scene.traverse((o) => {
    const m = o as T.SkinnedMesh;
    if (!m.isSkinnedMesh || m === body) return;
    const name = (m.material as T.Material).name;
    if (name === "kit" || /shoes/.test(name)) return;
    remapJoints(m, body, order);
  });
}
function remapJoints(m: T.SkinnedMesh, body: T.SkinnedMesh, order: string[]) {
  const g = m.geometry;
  if (g.userData.sharedSkeleton) return;
  const remap = m.skeleton.bones.map((b, k) => {
    const at = order.indexOf(b.name);
    if (at < 0) throw new Error("athlete joint " + b.name + " is not in the body skeleton");
    if (!nearly(m.skeleton.boneInverses[k]!, body.skeleton.boneInverses[at]!)) throw new Error("athlete joint " + b.name + " has a different bind pose in " + m.name);
    return at;
  });
  const si = g.getAttribute("skinIndex"),
    out = new Uint16Array(si.count * 4);
  for (let i = 0; i < si.count; i++) for (let c = 0; c < 4; c++) out[i * 4 + c] = remap[si.getComponent(i, c)] ?? 0;
  g.setAttribute("skinIndex", new T.BufferAttribute(out, 4));
  g.userData.sharedSkeleton = true;
}
const nearly = (a: T.Matrix4, b: T.Matrix4) => a.elements.every((v, i) => Math.abs(v - b.elements[i]!) < 1e-4);

/**
 * Athletes share textures that are the same image (eyes, lashes, the kit's fold
 * map), so each is uploaded once rather than once per model.
 */
function shareTextures(models: GLTF[]) {
  const seen = new Map<string, T.Texture>();
  for (const m of models)
    m.scene.traverse((o) => {
      const mat = (o as T.Mesh).material as T.MeshStandardMaterial | undefined;
      if (!mat) return;
      for (const key of ["map", "normalMap"] as const) {
        const tex = mat[key];
        if (!tex?.name || !/eye|lash|casualsuit/.test(tex.name)) continue;
        const first = seen.get(tex.name);
        if (first && first !== tex) mat[key] = first;
        else seen.set(tex.name, tex);
      }
    });
}

/** Skin weights and indices as plain arrays, whatever the glTF stored them as. */
function skinOf(g: T.BufferGeometry) {
  const i = g.getAttribute("skinIndex"),
    w = g.getAttribute("skinWeight");
  return { index: i, weight: w };
}

/**
 * Merges the suit and the shoes into one skinned geometry with a `kitPart`
 * attribute, so a whole kit is one draw call coloured per team in the shader.
 * The original meshes are removed from the model, so clones don't carry them.
 */
function prepareKit(model: GLTF, body: T.SkinnedMesh): PreparedKit {
  let suit: T.SkinnedMesh | null = null,
    shoes: T.SkinnedMesh | null = null;
  model.scene.traverse((o) => {
    const m = o as T.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const name = (m.material as T.Material).name;
    if (name === "kit") suit = m;
    else if (/shoes/.test(name)) shoes = m;
  });
  if (!suit) throw new Error("athlete model has no kit");
  const kit = suit as T.SkinnedMesh,
    // Joints in the body's order, so the kit shares the body's skeleton.
    bones = body.skeleton.bones.map((b) => b.name);
  const pieces: { mesh: T.SkinnedMesh; part: (vertex: number) => number }[] = [{ mesh: kit, part: suitParts(kit.geometry) }];
  if (shoes) pieces.push({ mesh: shoes, part: () => PART.shoes });

  let vertices = 0,
    indices = 0;
  for (const p of pieces) {
    vertices += p.mesh.geometry.getAttribute("position").count;
    indices += p.mesh.geometry.getIndex()!.count;
  }
  const position = new Float32Array(vertices * 3),
    normal = new Float32Array(vertices * 3),
    uv = new Float32Array(vertices * 2),
    skinIndex = new Uint16Array(vertices * 4),
    skinWeight = new Float32Array(vertices * 4),
    kitPart = new Float32Array(vertices),
    index = new Uint32Array(indices);
  const kitBindInverse = kit.bindMatrix.clone().invert(),
    v = new T.Vector3(),
    n = new T.Vector3();
  let vo = 0,
    io = 0;
  for (const { mesh, part } of pieces) {
    const g = mesh.geometry,
      pos = g.getAttribute("position"),
      nor = g.getAttribute("normal"),
      tex = g.getAttribute("uv"),
      { index: si, weight: sw } = skinOf(g),
      idx = g.getIndex()!;
    // Positions into the suit's bind space; bones into the suit's joint list.
    const toKit = kitBindInverse.clone().multiply(mesh.bindMatrix),
      normalMatrix = new T.Matrix3().getNormalMatrix(toKit);
    const remap = mesh.skeleton.bones.map((b) => {
      const at = bones.indexOf(b.name);
      if (at < 0) throw new Error("kit joint " + b.name + " is not in the body skeleton");
      return at;
    });
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(toKit).toArray(position, (vo + i) * 3);
      if (nor) n.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize().toArray(normal, (vo + i) * 3);
      if (tex) {
        uv[(vo + i) * 2] = tex.getX(i);
        uv[(vo + i) * 2 + 1] = tex.getY(i);
      }
      for (let c = 0; c < 4; c++) {
        skinIndex[(vo + i) * 4 + c] = remap[si.getComponent(i, c)] ?? 0;
        skinWeight[(vo + i) * 4 + c] = sw.getComponent(i, c);
      }
      kitPart[vo + i] = part(i);
    }
    for (let i = 0; i < idx.count; i++) index[io + i] = idx.getX(i) + vo;
    vo += pos.count;
    io += idx.count;
    mesh.parent!.remove(mesh);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new T.BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new T.BufferAttribute(uv, 2));
  geometry.setAttribute("skinIndex", new T.BufferAttribute(skinIndex, 4));
  geometry.setAttribute("skinWeight", new T.BufferAttribute(skinWeight, 4));
  geometry.setAttribute("kitPart", new T.BufferAttribute(kitPart, 1));
  geometry.setIndex(new T.BufferAttribute(index, 1));
  return { geometry, material: kit.material as T.MeshStandardMaterial, bindMatrix: kit.bindMatrix.clone(), parent: kit.parent?.name ?? "" };
}

/**
 * Shirt or trousers for each suit vertex. They are separate pieces of cloth:
 * group vertices into connected pieces and sort each whole piece by height, so
 * the hem stays the hem.
 */
function suitParts(g: T.BufferGeometry) {
  const pos = g.getAttribute("position"),
    index = g.getIndex()!;
  g.computeBoundingBox();
  const mid = (g.boundingBox!.min.y + g.boundingBox!.max.y) / 2;
  const parent = new Int32Array(pos.count).map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  for (let i = 0; i < index.count; i += 3) {
    const r = find(index.getX(i));
    parent[find(index.getX(i + 1))] = r;
    parent[find(index.getX(i + 2))] = r;
  }
  const sum = new Map<number, [number, number]>();
  for (let v = 0; v < pos.count; v++) {
    const r = find(v),
      e = sum.get(r) ?? [0, 0];
    e[0] += pos.getY(v);
    e[1]++;
    sum.set(r, e);
  }
  return (vertex: number) => {
    const [y, count] = sum.get(find(vertex))!;
    return y / count > mid ? PART.shirt : PART.trousers;
  };
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
const FORWARD = new T.Vector3(0, 0, 1);
/** Share of a turn's yaw each joint turns by (absolute, not cumulative): the head leads, the chest follows, the hips last. */
const TURN_LEAD: Partial<Record<string, number>> = { Spine1: 0.15, Spine2: 0.3, Neck: 0.45, Head: 0.6 };
/** Most an arm may be lengthened to meet the driver's reach. */
export const ARM_STRETCH_MAX = 1.12;

export interface KitColours {
  shirt: string;
  trousers: string;
  shoes: string;
}
export const kitColours = (team: number): KitColours =>
  team < 0
    ? { shirt: "#eeece4", trousers: "#2a2e36", shoes: "#1f232b" }
    : { shirt: TEAMS[team]!.color, trousers: TEAMS[team]!.dark, shoes: "#f1f1ee" };

/**
 * Per-scene kit materials, one per team and one for the umpire. Each colours
 * shirt, trousers and shoes from the mesh's `kitPart` attribute; the fold map
 * shades the cloth, and the shoes are plain.
 */
export class KitMaterials {
  private cache = new Map<number, T.MeshStandardMaterial>();
  /** `base` defaults to the first model's own suit material. */
  constructor(private base: T.MeshStandardMaterial | null = null) {}
  /** Uses this model's suit material as the base, unless one is already set. */
  adopt(base: T.MeshStandardMaterial) {
    this.base ??= base;
  }
  get(team: number) {
    let m = this.cache.get(team);
    if (!m) {
      if (!this.base) throw new Error("kit materials need a base material");
      m = this.base.clone();
      m.name = "kit";
      m.color.set("#ffffff");
      m.roughness = 0.82;
      m.metalness = 0;
      const c = kitColours(team),
        colour = (hex: string) => new T.Color(hex);
      const uniforms = { kitShirt: { value: colour(c.shirt) }, kitTrousers: { value: colour(c.trousers) }, kitShoes: { value: colour(c.shoes) } };
      m.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nattribute float kitPart;\nvarying float vKitPart;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvKitPart = kitPart;");
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying float vKitPart;\nuniform vec3 kitShirt;\nuniform vec3 kitTrousers;\nuniform vec3 kitShoes;")
          .replace(
            "#include <map_fragment>",
            `diffuseColor.rgb *= vKitPart < 0.5 ? kitTrousers : (vKitPart < 1.5 ? kitShirt : kitShoes);
#ifdef USE_MAP
	if (vKitPart < 1.5) diffuseColor *= texture2D(map, vMapUv);
#endif`,
          );
      };
      m.customProgramCacheKey = () => "sinverse-kit";
      this.cache.set(team, m);
    }
    return m;
  }
  all() {
    return [...this.cache.values()];
  }
}

const tq = new T.Quaternion(),
  tq2 = new T.Quaternion(),
  tv = new T.Vector3(),
  tv2 = new T.Vector3(),
  tv3 = new T.Vector3(),
  tv4 = new T.Vector3();

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
  /** Every mesh drawn for this player (body, kit, hair, eyes, gear). */
  readonly meshes: T.Mesh[] = [];
  readonly kit: T.SkinnedMesh;
  private body: T.SkinnedMesh;
  private joints: Joint[] = [];
  private byName = new Map<string, Joint>();
  private lengths = new Map<string, [number, number]>();
  private hips: Joint;
  private armature: T.Object3D;
  private team = NaN;
  readonly equipment: T.Mesh[] = [];
  /** How much the arms were lengthened to fit the driver's reach (1 = not at all). */
  armStretch = 1;
  /** Ankle joint height when standing, in model units (before the root's scale). */
  private ankleHeight = 0.08;
  /** Per foot: whether it is pinned, where, and how strongly (eased). */
  private locks = [0, 1].map(() => ({ on: false, at: new T.Vector3(), weight: 0, lastY: Infinity, low: Infinity }));

  constructor(
    readonly source: GLTF,
    private driver: Athlete,
    private kits: KitMaterials,
    team: number,
  ) {
    const prep = prepared.get(source);
    if (!prep) throw new Error("athlete model was not loaded through loadSquad");
    this.root = cloneSkinned(source.scene) as T.Group;
    this.root.name = "realistic-body";
    const hipsBone = this.findBone("Hips");
    this.armature = hipsBone.parent!;
    let body: T.SkinnedMesh | null = null;
    this.root.traverse((o) => {
      const m = o as T.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.frustumCulled = false;
      this.meshes.push(m);
      if (/body/.test((m.material as T.Material).name)) body = m;
    });
    if (!body) throw new Error("athlete model has no body");
    this.body = body;
    // One skeleton, and so one bone texture, for the whole athlete.
    for (const m of this.meshes) if (m !== this.body) (m as T.SkinnedMesh).bind(this.body.skeleton, (m as T.SkinnedMesh).bindMatrix);
    // The kit: one shared geometry on the same skeleton.
    kits.adopt(prep.kit.material);
    this.kit = new T.SkinnedMesh(prep.kit.geometry, kits.get(team < 0 ? -1 : team));
    this.kit.name = "kit";
    this.kit.frustumCulled = false;
    (this.findObject(prep.kit.parent) ?? this.body.parent!).add(this.kit);
    this.kit.bind(this.body.skeleton, prep.kit.bindMatrix);
    this.meshes.push(this.kit);
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
  }

  private findObject(name: string) {
    if (!name) return null;
    let found: T.Object3D | null = null;
    this.root.traverse((o) => {
      if (!found && o.name === name) found = o;
    });
    return found as T.Object3D | null;
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

  /** Rest distance from a bone's joint to its first bone child's joint. */
  private segment(all: T.Bone[], name: string) {
    const bone = all.find((b) => short(b.name) === name)!,
      child = bone.children.find((c) => (c as T.Bone).isBone)!;
    return child.getWorldPosition(tv).distanceTo(bone.getWorldPosition(tv2));
  }

  /**
   * The transform, in `bone`'s local space, of something placed at an offset in
   * the athlete's own rest frame (+Y up, +Z forward, +X his left, metres) with
   * its axes lined up with that frame. For putting equipment on the body.
   */
  restFrame(name: string, x: number, y: number, z: number) {
    const j = this.byName.get(name)!,
      inv = j.offset.clone().invert(),
      scale = 1 / (this.root.scale.x || 1);
    return new T.Matrix4().compose(new T.Vector3(x, y, z).applyQuaternion(inv).multiplyScalar(scale), inv, new T.Vector3(scale, scale, scale));
  }

  /** Bends every finger by `angle` radians at each knuckle (positive curls into the palm). */
  curlFingers(angle: number) {
    for (const j of this.joints) {
      const finger = /^(Left|Right)Hand(Index|Middle|Ring|Pinky)[1-3]$/.exec(short(j.bone.name));
      if (!finger) continue;
      // At rest the hands hang with palms facing the thighs, so curling turns
      // fingers about the forward axis, inwards for each hand.
      const side = finger[1] === "Left" ? -1 : 1,
        axis = new T.Vector3(0, 0, 1).applyQuaternion(j.offset.clone().invert()).normalize();
      j.rest.multiply(new T.Quaternion().setFromAxisAngle(axis, side * angle));
    }
  }

  /**
   * Adds one rigidly skinned mesh made of `pieces`, each fixed to a bone at an
   * offset in the rest frame. The geometry is cached per model and `key`, since
   * every clone of a model calibrates identically.
   */
  wearRigid(key: string, pieces: { bone: string; geometry: T.BufferGeometry; colour: string; at: [number, number, number] }[], material: T.Material) {
    const prep = prepared.get(this.source)!,
      skeleton = this.body.skeleton,
      joint = (name: string) => skeleton.bones.indexOf(this.bone(name));
    let geometry = prep.gear.get(key);
    if (!geometry) {
      const bindInverse = this.body.bindMatrix.clone().invert(),
        parts: T.BufferGeometry[] = [];
      for (const p of pieces) {
        const k = joint(p.bone),
          g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone();
        // Bind space: back through the body's bind matrix and this bone's inverse bind.
        g.applyMatrix4(bindInverse.clone().multiply(skeleton.boneInverses[k]!.clone().invert()).multiply(this.restFrame(p.bone, ...p.at)));
        const count = g.getAttribute("position").count,
          colour = new T.Color(p.colour),
          colours = new Float32Array(count * 3),
          si = new Uint16Array(count * 4),
          sw = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) {
          colour.toArray(colours, i * 3);
          si[i * 4] = k;
          sw[i * 4] = 1;
        }
        g.setAttribute("color", new T.BufferAttribute(colours, 3));
        g.setAttribute("skinIndex", new T.BufferAttribute(si, 4));
        g.setAttribute("skinWeight", new T.BufferAttribute(sw, 4));
        g.deleteAttribute("uv");
        parts.push(g);
      }
      geometry = concat(parts);
      prep.gear.set(key, geometry);
    }
    const mesh = new T.SkinnedMesh(geometry, material);
    mesh.frustumCulled = false;
    this.body.parent!.add(mesh);
    mesh.bind(skeleton, this.body.bindMatrix);
    this.equipment.push(mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  private calibrate() {
    const all: T.Bone[] = [];
    this.root.traverse((o) => {
      if ((o as T.Bone).isBone) all.push(o as T.Bone);
    });
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
    const seg = (name: string) => this.segment(all, name),
      legLength = seg("LeftUpLeg") + seg("LeftLeg"),
      armLength = seg("LeftArm") + seg("LeftForeArm"),
      wanted = ((RIG.upperArm + RIG.forearm) / (RIG.thigh + RIG.shin)) * legLength,
      stretch = Math.min(ARM_STRETCH_MAX, Math.max(1, wanted / armLength));
    for (const bone of all) if (/^(Left|Right)(ForeArm|Hand)$/.test(short(bone.name))) bone.position.multiplyScalar(stretch);
    this.root.updateMatrixWorld(true);
    this.armStretch = stretch;
    const mapped = new Map(MAP.map(([d, r]) => [r, this.driver.bones[d]]));
    const visit = (bone: T.Bone, parent: Joint | null) => {
      const world = bone.getWorldQuaternion(new T.Quaternion());
      const joint: Joint = { bone, parent, driver: mapped.get(short(bone.name)) ?? null, offset: world.clone(), rest: bone.quaternion.clone(), world: new T.Quaternion() };
      this.joints.push(joint);
      this.byName.set(short(bone.name), joint);
      for (const c of bone.children) if ((c as T.Bone).isBone) visit(c as T.Bone, joint);
    };
    visit(this.findBone("Hips"), null);
    this.ankleHeight = this.findBone("LeftFoot").getWorldPosition(new T.Vector3()).y - this.root.getWorldPosition(new T.Vector3()).y;
    for (const limb of LIMBS) {
      const u = this.byName.get(limb.upper)!.bone,
        l = this.byName.get(limb.lower)!.bone,
        e = this.byName.get(limb.end)!.bone;
      this.lengths.set(limb.upper, [l.getWorldPosition(tv).distanceTo(u.getWorldPosition(tv2)), e.getWorldPosition(tv).distanceTo(l.getWorldPosition(tv2))]);
    }
  }

  setTeam(team: number) {
    if (team === this.team) return;
    this.team = team;
    this.kit.material = this.kits.get(team);
  }

  /** Shadows from the body, kit and gear only: hair, eyes and brows are too small to matter. */
  setShadows(cast: boolean) {
    for (const m of this.meshes) {
      const name = (m.material as T.Material).name;
      m.castShadow = cast && !/hair|short0|afro|eye|lash|low-poly/.test(name);
    }
  }

  /**
   * Copies the driver's current pose. Call after the driver is posed and its
   * matrices updated. With a motion frame, the lower body (hips and legs) and the
   * upper body (spine, arms, head) blend towards the motion clip by their region
   * weights; a region mostly on the clip keeps the clip's hands or feet instead
   * of reaching for the driver's.
   */
  sync(motion?: MotionFrame | null) {
    const d = this.driver,
      lower = motion ? motion.lower : 0,
      upper = motion ? motion.upper : 0;
    d.root.updateMatrixWorld(true);
    // Rotations in the driver root's frame: real = driver * offset.
    d.root.getWorldQuaternion(tq2).invert();
    this.armature.updateWorldMatrix(true, false);
    const armatureQ = this.armature.getWorldQuaternion(new T.Quaternion()).premultiply(tq2);
    const twist = motion?.twist ?? 0,
      lean = motion?.lean ?? 0;
    for (const j of this.joints) {
      if (j.driver) j.world.copy(j.driver.getWorldQuaternion(tq).premultiply(tq2)).multiply(j.offset);
      else j.world.copy(j.parent ? j.parent.world : armatureQ).multiply(j.rest);
      const name = short(j.bone.name) as MotionJoint;
      if (motion && (lower > 0 || upper > 0)) {
        const clip = motion.pose.get(name);
        const w = LOWER.has(name) ? lower : upper;
        if (clip && w > 0) j.world.slerp(tq.copy(clip).multiply(j.offset), w);
      }
      // Into a turn the body leans, and the head and chest lead the hips.
      if (name === "Hips" && lean) j.world.premultiply(tq.setFromAxisAngle(FORWARD, lean));
      const lead = twist ? TURN_LEAD[name] : undefined;
      if (lead) j.world.premultiply(tq.setFromAxisAngle(UP, twist * lead));
      const parentQ = j.parent ? j.parent.world : armatureQ;
      j.bone.quaternion.copy(tq.copy(parentQ).invert().multiply(j.world));
    }
    // Place the pelvis so the real hip joints sit on the driver's hip joints, or
    // where the clip puts them (its stride, bob and sway) as the lower body blends in.
    this.root.updateMatrixWorld(true);
    const realHips = this.bone("LeftUpLeg").getWorldPosition(tv).add(this.bone("RightUpLeg").getWorldPosition(tv2)).multiplyScalar(0.5),
      driverHips = d.bones.lThigh.getWorldPosition(tv3).add(d.bones.rThigh.getWorldPosition(tv4)).multiplyScalar(0.5);
    if (motion && lower > 0) driverHips.lerp(d.root.localToWorld(new T.Vector3().copy(motion.hips)), lower);
    const pelvis = this.hips.bone.getWorldPosition(new T.Vector3()).add(driverHips).sub(realHips);
    this.armature.worldToLocal(pelvis);
    this.hips.bone.position.copy(pelvis);
    this.root.updateMatrixWorld(true);
    // A clip-driven stride never puts a foot through the turf: lift the pelvis if
    // the lower ankle is below its standing height. (Flight phases are left alone.)
    if (motion && lower > 0.5) {
      const lowest = Math.min(this.bone("LeftFoot").getWorldPosition(tv).y, this.bone("RightFoot").getWorldPosition(tv2).y),
        floor = this.ankleHeight * this.root.getWorldScale(tv3).y;
      if (lowest < floor) {
        const lift = this.armature.worldToLocal(tv4.set(0, floor - lowest, 0).add(this.armature.getWorldPosition(new T.Vector3()))).sub(this.armature.worldToLocal(this.armature.getWorldPosition(new T.Vector3())));
        this.hips.bone.position.add(lift);
        this.root.updateMatrixWorld(true);
      }
    }
    // Hands and feet onto the driver's exact joints, unless the clip owns them.
    for (const limb of LIMBS) if ((limb.end.endsWith("Hand") ? upper : lower) < 0.5) this.reach(limb);
    // Clip-driven feet are pinned to the turf while planted.
    if (motion && lower > 0.5) this.lockFeet();
    else for (const lock of this.locks) (lock.on = false), (lock.weight = 0), (lock.low = Infinity);
  }

  /**
   * Foot locking. A foot that touches down is pinned where it landed and the leg
   * solves to it while the body moves over it, so planted feet never skate,
   * whatever the speed. It lets go as the foot lifts, or before the leg would
   * overstretch, easing out over a few frames so nothing pops.
   */
  private lockFeet() {
    const scale = this.root.getWorldScale(tv3).y;
    for (const [k, limb] of LIMBS.slice(2).entries()) {
      const lock = this.locks[k]!,
        foot = this.bone(limb.end).getWorldPosition(new T.Vector3()),
        hip = this.bone(limb.upper).getWorldPosition(new T.Vector3()),
        [l1, l2] = this.lengths.get(limb.upper)!,
        reach = (l1 + l2) * scale * 0.995,
        falling = foot.y <= lock.lastY + 1e-4;
      lock.lastY = foot.y;
      // Contact is judged against this foot's own recent lowest point (clips plant
      // the ankle at different heights), which creeps up slowly so it can follow.
      lock.low = Math.min(lock.low + 0.0015 * scale, foot.y);
      const floor = lock.low;
      if (!lock.on && foot.y < floor + 0.02 * scale && falling) {
        lock.on = true;
        lock.at.set(foot.x, 0, foot.z);
      } else if (lock.on && (foot.y > floor + 0.06 * scale || hip.distanceTo(tv.set(lock.at.x, foot.y, lock.at.z)) > reach)) lock.on = false;
      lock.weight += ((lock.on ? 1 : 0) - lock.weight) * 0.45;
      if (lock.weight < 0.01) continue;
      const target = new T.Vector3(lock.at.x, foot.y, lock.at.z).lerp(foot, 1 - lock.weight);
      // The clip's own knee is the bend direction, so the knee keeps facing forward.
      this.reachTo(limb, target, this.bone(limb.lower).getWorldPosition(new T.Vector3()));
    }
  }

  /** World position of the middle of a hand's palm, where a held ball sits. */
  palm(left: boolean, out: T.Vector3) {
    const side = left ? "Left" : "Right",
      hand = this.bone(side + "Hand").getWorldPosition(out),
      knuckle = this.byName.get(side + "HandMiddle1")?.bone.getWorldPosition(tv) ?? hand;
    return hand.lerp(knuckle, 0.75);
  }

  /**
   * After `sync`: moves a hand so its palm goes `weight` of the way to a world
   * point, bending at the clip's own elbow. Lets a clip-driven body (a running
   * catch, a sliding stop) still put its hand on the ball.
   */
  reachHand(left: boolean, target: T.Vector3, weight: number) {
    if (weight <= 0.001) return;
    const limb = LIMBS[left ? 0 : 1],
      wrist = this.bone(limb.end).getWorldPosition(new T.Vector3()),
      palm = this.palm(left, new T.Vector3());
    // The wrist goes where it must for the palm (its current offset kept) to land on the point.
    const goal = new T.Vector3().copy(target).sub(palm).multiplyScalar(weight).add(wrist);
    this.reachTo(limb, goal, this.bone(limb.lower).getWorldPosition(new T.Vector3()));
  }

  private reach(limb: (typeof LIMBS)[number]) {
    this.reachTo(limb, this.driver.bones[limb.target].getWorldPosition(new T.Vector3()), this.driver.bones[limb.hint].getWorldPosition(new T.Vector3()));
  }

  /** Two-bone reach of `limb`'s end joint to `target` (world), bending towards `hint`. */
  private reachTo(limb: (typeof LIMBS)[number], target: T.Vector3, hint: T.Vector3) {
    const upper = this.byName.get(limb.upper)!.bone,
      lower = this.byName.get(limb.lower)!.bone,
      end = this.byName.get(limb.end)!,
      scale = this.root.getWorldScale(tv4).x,
      [l1r, l2r] = this.lengths.get(limb.upper)!,
      l1 = l1r * scale,
      l2 = l2r * scale;
    const S = upper.getWorldPosition(new T.Vector3());
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

/** Concatenates non-indexed geometries that share the same attributes. */
function concat(parts: T.BufferGeometry[]) {
  const out = new T.BufferGeometry(),
    names = Object.keys(parts[0]!.attributes);
  for (const name of names) {
    const first = parts[0]!.getAttribute(name),
      total = parts.reduce((n, g) => n + g.getAttribute(name).array.length, 0),
      Ctor = first.array.constructor as new (n: number) => Float32Array | Uint16Array,
      array = new Ctor(total);
    let at = 0;
    for (const g of parts) {
      array.set(g.getAttribute(name).array as ArrayLike<number>, at);
      at += g.getAttribute(name).array.length;
    }
    out.setAttribute(name, new T.BufferAttribute(array, first.itemSize, first.normalized));
  }
  return out;
}

/**
 * Equipment the procedural body used to carry in its own mesh. The bat rides
 * the driver's bat bone, so contact stays exact; helmet, pads and gloves become
 * one rigidly skinned mesh on the realistic skeleton. Shared geometry and
 * materials, so a batter adds two draw calls.
 */
export function equipmentKit() {
  const geometries: T.BufferGeometry[] = [],
    materials: T.Material[] = [];
  const keep = <G extends T.BufferGeometry>(g: G) => (geometries.push(g), g);
  const gear = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 }),
    batMaterial = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 });
  materials.push(gear, batMaterial);
  const coloured = (g: T.BufferGeometry, hex: string) => {
    const flat = g.index ? g.toNonIndexed() : g,
      c = new T.Color(hex),
      count = flat.getAttribute("position").count,
      colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) c.toArray(colours, i * 3);
    flat.setAttribute("color", new T.BufferAttribute(colours, 3));
    flat.deleteAttribute("uv");
    return flat;
  };
  // Bat: handle from the top hand towards the blade, then the blade to the toe,
  // along the bat bone's -Y with the face on +Z (see placeBat).
  const handle = new T.CylinderGeometry(0.017, 0.017, BAT.sweet - 0.34 + 0.08, 10).translate(0, -(BAT.sweet - 0.34) / 2 + 0.04, 0);
  const blade = new T.BoxGeometry(0.106, BAT.toe - 0.3, 0.04, 1, 4, 1);
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
  const bat = keep(concat([coloured(handle, "#1d2430"), coloured(blade, "#d8bf8a")]));
  const shell = keep(new T.SphereGeometry(0.135, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 1.05, 1.12));
  const peak = keep(new T.BoxGeometry(0.2, 0.012, 0.07).translate(0, 0.035, 0.14));
  const bars = keep(new T.TorusGeometry(0.11, 0.006, 6, 16, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI).translate(0, -0.03, 0.035));
  const pad = keep(new T.CapsuleGeometry(0.068, 0.36, 4, 10).scale(1.05, 1, 0.7));
  const glove = keep(new T.CapsuleGeometry(0.045, 0.06, 4, 8).scale(1, 1, 0.75));

  return {
    geometries,
    materials,
    dress(body: RealisticBody, role: Athlete["role"], team: number, batBone: T.Bone, cast: boolean) {
      const pieces: Parameters<RealisticBody["wearRigid"]>[1] = [];
      if (role === "bat") {
        const b = new T.Mesh(bat, batMaterial);
        b.castShadow = cast;
        batBone.add(b);
        body.equipment.push(b);
        const helmet = TEAMS[team < 0 ? 0 : team]!.dark;
        pieces.push(
          { bone: "Head", geometry: shell, colour: helmet, at: [0, 0.085, 0] },
          { bone: "Head", geometry: peak, colour: helmet, at: [0, 0.085, 0] },
          { bone: "Head", geometry: bars, colour: "#9aa3ad", at: [0, 0.085, 0] },
        );
      }
      if (role === "bat" || role === "keeper") {
        for (const side of ["Left", "Right"]) {
          // Down the shin from the knee and a little in front of it; gloves over the hands.
          pieces.push({ bone: side + "Leg", geometry: pad, colour: "#f3f1ea", at: [0, -0.2, 0.045] });
          pieces.push({ bone: side + "Hand", geometry: glove, colour: "#f1efe8", at: [0, -0.055, 0] });
        }
        body.curlFingers(0.9);
      } else body.curlFingers(role === "umpire" ? 0.25 : 0.4);
      if (pieces.length) body.wearRigid(`${role}:${team}`, pieces, gear).castShadow = cast;
    },
  };
}
