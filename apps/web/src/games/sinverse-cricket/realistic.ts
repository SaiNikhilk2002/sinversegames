import * as T from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { TEAMS } from "@platform/engines/sinverse-cricket";
import { BAT, RIG } from "./animation";
import type { Athlete } from "./character";
import { LOWER, type Joint as MotionJoint, type MotionFrame } from "./motion";
import { appearanceFor, eyeMaterial, hairMaterial, kitMaterial, skinMaterial, type Appearance, type KitColours } from "./athlete-look";

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

export const SQUAD = ["athlete-01", "athlete-02", "athlete-03", "athlete-04", "athlete-05", "athlete-06", "athlete-07", "athlete-08", "athlete-09", "athlete-10"] as const;
export type Detail = "hi" | "lo";
const URL_BASE = "/sinverse-cricket/athletes/";
/** Layer the hidden driver meshes are moved to; cameras only render layer 0. */
export const DRIVER_LAYER = 31;
/** Kit parts, stored per vertex in the merged kit mesh. */
const PART = { trousers: 0, shirt: 1, shoes: 2 } as const;

interface PreparedKit {
  geometry: T.BufferGeometry;
  /** The shoes' texture, which the kit material draws on the shoes. */
  shoeMap: T.Texture | null;
  bindMatrix: T.Matrix4;
  parent: string;
}
interface Measures {
  /** Head bounds relative to the Head joint. */
  head: { min: T.Vector3; max: T.Vector3 };
  /** Shin length (knee to ankle) and six cross-sections from knee to ankle, relative to the knee. */
  shin: { length: number; slices: { minX: number; maxX: number; minZ: number; maxZ: number }[] };
  /** Thigh radius: how far the skin of the upper thigh reaches from the hip-knee line. */
  thigh: number;
}
interface Prepared {
  kit: PreparedKit;
  gear: Map<string, T.BufferGeometry>;
  measures?: Measures;
}
const prepared = new WeakMap<GLTF, Prepared>();

const models = new Map<string, Promise<GLTF>>();
let loader: GLTFLoader | null = null;
/** Loads one squad model at one level of detail, once per page. */
function loadModel(detail: Detail, index: number): Promise<GLTF> {
  const key = detail + index;
  let model = models.get(key);
  if (!model) {
    if (!loader) {
      loader = new GLTFLoader();
      // Embedded textures become blob: URLs. three.js reads those with fetch(), which
      // the site's Content-Security-Policy limits (connect-src), but an <img> may load
      // them (img-src allows blob:). Decode through an image instead.
      loader.register((parser) => {
        (parser as unknown as { textureLoader: T.Loader }).textureLoader = new T.TextureLoader(parser.options.manager);
        return { name: "sinverse_image_textures" };
      });
    }
    model = loader.loadAsync(URL_BASE + SQUAD[index] + (detail === "lo" ? "-lo" : "") + ".glb").then((m) => prepareSquad([tagModel(m, index)])[0]!);
    model.catch(() => models.delete(key));
    models.set(key, model);
  }
  return model;
}
/**
 * Loads the squad models a match needs (all of them if `need` is omitted), at one
 * level of detail. Models not asked for are left undefined, so a match downloads
 * only the people it shows. Rejects if any requested model is missing.
 */
export async function loadSquad(detail: Detail, need?: Iterable<number>): Promise<(GLTF | undefined)[]> {
  const wanted = [...new Set(need ?? SQUAD.keys())].filter((i) => i >= 0 && i < SQUAD.length);
  const loaded = await Promise.all(wanted.map((i) => loadModel(detail, i)));
  const out: (GLTF | undefined)[] = SQUAD.map(() => undefined);
  wanted.forEach((i, k) => (out[i] = loaded[k]));
  return out;
}

/** Readies loaded models for `RealisticBody`: shared textures and a one-mesh kit. */
export function prepareSquad(models: GLTF[]) {
  shareTextures(models);
  for (const m of models)
    if (!prepared.has(m)) {
      const body = bodyOf(m.scene);
      shareSkeleton(m, body);
      // The body's vertex colours are the facial hair and scalp masks, not colours.
      const g = body.geometry;
      const masks = g.getAttribute("color");
      if (masks) {
        g.setAttribute("faceMask", masks.itemSize === 4 ? masks : padTo4(masks));
        g.deleteAttribute("color");
      } else g.setAttribute("faceMask", new T.BufferAttribute(new Float32Array(g.getAttribute("position").count * 4), 4));
      prepared.set(m, { kit: prepareKit(m, body), gear: new Map() });
    }
  return models;
}
function padTo4(a: T.BufferAttribute | T.InterleavedBufferAttribute) {
  const out = new Float32Array(a.count * 4);
  for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * 4 + c] = a.getComponent(i, c);
  return new T.BufferAttribute(out, 4);
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
 * Athletes share textures that are the same image (eyes, brows, lashes, hair,
 * shoes), so each is uploaded once rather than once per model. Models load one
 * at a time, so the textures already seen are kept for the whole page.
 */
const seen = new Map<string, T.Texture>();
function shareTextures(models: GLTF[]) {
  for (const m of models)
    m.scene.traverse((o) => {
      const mat = (o as T.Mesh).material as T.MeshStandardMaterial | undefined;
      if (!mat) return;
      for (const key of ["map", "normalMap"] as const) {
        const tex = mat[key];
        if (!tex?.name || !/eye|lash|brow|shoes|short0|afro/.test(tex.name)) continue;
        // The light athletes' low-poly eyes are a few pixels across: their eye
        // colour can't be seen, so they all share one texture.
        // Keyed by size too: the detailed and light models use the same names at different resolutions.
        const width = (tex.image as { width?: number } | undefined)?.width ?? 0,
          name = (/low-poly/.test(mat.name) ? "low-poly-eye" : tex.name) + "@" + width;
        const first = seen.get(name);
        if (first && first !== tex) mat[key] = first;
        else seen.set(name, tex);
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
 * Merges the kit's shirt, trousers and shoes into one skinned geometry with a
 * `kitInfo` attribute (trim, occlusion, part), so a whole kit is one draw call
 * coloured per team in the shader. The build stores (trim, occlusion, part/2)
 * in each cloth vertex's colour. The original meshes are removed from the
 * model, so clones don't carry them.
 */
function prepareKit(model: GLTF, body: T.SkinnedMesh): PreparedKit {
  const cloth: T.SkinnedMesh[] = [];
  let shoes: T.SkinnedMesh | null = null;
  model.scene.traverse((o) => {
    const m = o as T.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const name = (m.material as T.Material).name;
    if (name === "kit") cloth.push(m);
    else if (/shoes/.test(name)) shoes = m;
  });
  if (!cloth.length) throw new Error("athlete model has no kit");
  const kit = cloth[0]!,
    // Joints in the body's order, so the kit shares the body's skeleton.
    bones = body.skeleton.bones.map((b) => b.name);
  const pieces: { mesh: T.SkinnedMesh; shoe: boolean }[] = cloth.map((mesh) => ({ mesh, shoe: false }));
  const shoeMesh = shoes as T.SkinnedMesh | null;
  if (shoeMesh) pieces.push({ mesh: shoeMesh, shoe: true });

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
    kitInfo = new Float32Array(vertices * 3),
    index = new Uint32Array(indices);
  const kitBindInverse = kit.bindMatrix.clone().invert(),
    v = new T.Vector3(),
    n = new T.Vector3();
  let vo = 0,
    io = 0;
  for (const { mesh, shoe } of pieces) {
    const g = mesh.geometry,
      pos = g.getAttribute("position"),
      nor = g.getAttribute("normal"),
      tex = g.getAttribute("uv"),
      info = g.getAttribute("color"),
      { index: si, weight: sw } = skinOf(g),
      idx = g.getIndex()!;
    // Positions into the kit's bind space; bones into the body's joint list.
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
      const k = (vo + i) * 3;
      if (shoe || !info) (kitInfo[k] = 0), (kitInfo[k + 1] = 1), (kitInfo[k + 2] = shoe ? 2 : 1);
      else (kitInfo[k] = info.getX(i)), (kitInfo[k + 1] = info.getY(i)), (kitInfo[k + 2] = Math.round(info.getZ(i) * 2));
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
  geometry.setAttribute("kitInfo", new T.BufferAttribute(kitInfo, 3));
  geometry.setIndex(new T.BufferAttribute(index, 1));
  const shoeMap = shoeMesh ? ((shoeMesh.material as T.MeshStandardMaterial).map ?? null) : null;
  return { geometry, shoeMap, bindMatrix: kit.bindMatrix.clone(), parent: kit.parent?.name ?? "" };
}

const HAIR = /short0|afro|bob0|braid|long0|ponytail/;
/** The squad index of a loaded model, from the file it came from. */
const indices = new WeakMap<GLTF, number>();
function modelIndex(model: GLTF) {
  return indices.get(model) ?? 0;
}
/** Records which squad model a loaded file is (for tests that parse files directly). */
export function tagModel(model: GLTF, index: number) {
  indices.set(model, index);
  return model;
}

/**
 * Which squad model a player wears. Deterministic and fictional, like `lookFor`.
 * Each team deals the squad models out in its own shuffled order, so teammates
 * never share a face until every model is used (the eleventh player shares one).
 */
export function modelFor(role: Athlete["role"], number: number, team: number) {
  if (role === "umpire") return 3;
  return dealt(team)[(Math.max(1, number) - 1) % SQUAD.length]!;
}
/**
 * The people a match shows: each slot's squad model, stable identity and look.
 * Within a team, a second player on the same model never gets a twin's look.
 */
export function squadPeople(entries: { role: Athlete["role"]; number: number; team: number }[]) {
  const taken = new Map<string, Appearance>();
  return entries.map(({ role, number, team }) => {
    const model = modelFor(role, number, team),
      identity = `${role}:${number}:${team}`,
      key = `${team}:${model}`,
      appearance = appearanceFor(identity, model, taken.get(key));
    if (!taken.has(key)) taken.set(key, appearance);
    return { model, identity, appearance };
  });
}
const deals = new Map<number, number[]>();
function dealt(team: number) {
  let order = deals.get(team);
  if (!order) {
    order = SQUAD.map((_, i) => i);
    let h = Math.imul(team + 5, 3266489917) >>> 0;
    for (let i = order.length - 1; i > 0; i--) {
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
      const j = h % (i + 1);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    deals.set(team, order);
  }
  return order;
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
/** Beyond this distance from the camera (metres) faces are drawn without eyes. */
export const FAR_EYES = 45;
/** Most an arm may be lengthened to meet the driver's reach. */
export const ARM_STRETCH_MAX = 1.12;

export type { KitColours };
export const kitColours = (team: number): KitColours =>
  team < 0
    ? { shirt: "#e9eef2", trousers: "#2a2e36", shoes: "#1f232b", trim: "#3b4552" }
    : { shirt: TEAMS[team]!.color, trousers: TEAMS[team]!.dark, shoes: "#f1f1ee", trim: TEAMS[team]!.accent };

/**
 * Per-scene kit materials, one per team and one for the umpire. Each colours
 * shirt, trousers, trim and shoes from the mesh's `kitInfo` attribute.
 */
export class KitMaterials {
  private cache = new Map<number, T.MeshPhysicalMaterial>();
  constructor(private shoeMap: T.Texture | null = null) {}
  /** Uses this model's shoe texture, unless one is already set. */
  adopt(shoeMap: T.Texture | null) {
    this.shoeMap ??= shoeMap;
  }
  get(team: number) {
    let m = this.cache.get(team);
    if (!m) {
      m = kitMaterial(this.shoeMap, kitColours(team));
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
  /** Per finger joint: the axis (bone space) that curls it towards the palm. */
  private curlAxes = new Map<Joint, T.Vector3>();
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

  /** How this player looks (facial hair, haircut, tone); see athlete-look.ts. */
  readonly appearance: Appearance;
  constructor(
    readonly source: GLTF,
    private driver: Athlete,
    private kits: KitMaterials,
    team: number,
    look: { identity?: string; appearance?: Appearance; antialias?: boolean; detail?: Detail } = {},
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
    // Per-player materials: skin tone, facial hair and haircut, eyes, hair colour.
    const model = modelIndex(source);
    this.appearance = look.appearance ?? appearanceFor(look.identity ?? `${driver.role}:${model}`, model);
    this.dressMaterials(look.antialias ?? true, look.detail ?? "hi");
    // One skeleton, and so one bone texture, for the whole athlete.
    for (const m of this.meshes) if (m !== this.body) (m as T.SkinnedMesh).bind(this.body.skeleton, (m as T.SkinnedMesh).bindMatrix);
    // The kit: one shared geometry on the same skeleton.
    kits.adopt(prep.kit.shoeMap);
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

  /** Swaps the model's shared materials for this player's own. */
  private dressMaterials(antialias: boolean, detail: Detail) {
    const a = this.appearance;
    for (const m of [...this.meshes]) {
      const base = m.material as T.MeshStandardMaterial,
        name = base.name;
      if (/body/.test(name)) m.material = skinMaterial(base, a, { pores: detail === "hi" });
      else if (/high-poly|low-poly/.test(name)) m.material = eyeMaterial(base);
      else if (/eyebrow/.test(name)) m.material = hairMaterial(base, a, antialias, "brow");
      else if (/eyelash/.test(name)) m.material = hairMaterial(base, a, antialias, "lash");
      else if (HAIR.test(name)) {
        if (a.haircut !== "model") {
          m.visible = false;
          this.meshes.splice(this.meshes.indexOf(m), 1);
        } else m.material = hairMaterial(base, a, antialias, "hair");
      }
    }
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
    // A relaxed hand curls more from the index to the little finger, and less at
    // the fingertip joint than the middle one; a gripping hand curls evenly.
    const grip = angle > 0.7;
    const byFinger: Record<string, number> = grip ? { Index: 1, Middle: 1, Ring: 1, Pinky: 1 } : { Index: 0.7, Middle: 0.9, Ring: 1.05, Pinky: 1.2 },
      byJoint = grip ? [1, 1, 1] : [0.75, 1.1, 0.6];
    for (const j of this.joints) {
      const finger = /^(Left|Right)Hand(Index|Middle|Ring|Pinky)([1-3])$/.exec(short(j.bone.name));
      const axis = finger && this.curlAxes.get(j);
      if (!finger || !axis) continue;
      // Each knuckle bends about the hand's own knuckle line, towards the palm.
      const a = angle * byFinger[finger[2]!]! * byJoint[Number(finger[3]) - 1]!;
      j.rest.multiply(new T.Quaternion().setFromAxisAngle(axis, a));
    }
  }

  /**
   * Adds one rigidly skinned mesh made of `pieces`, each fixed to a bone at an
   * offset in the rest frame. The geometry is cached per model and `key`, since
   * every clone of a model calibrates identically.
   */
  wearRigid(
    key: string,
    pieces: {
      bone: string;
      geometry: T.BufferGeometry;
      colour: string;
      at: [number, number, number];
      /** Part of the piece (above `from` in its own Y, fully by `to`) also follows this bone, up to `share`. */
      blend?: { bone: string; from: number; to: number; share: number };
    }[],
    material: T.Material,
  ) {
    const prep = prepared.get(this.source)!,
      skeleton = this.body.skeleton,
      joint = (name: string) => skeleton.bones.indexOf(this.bone(name));
    let geometry = prep.gear.get(key);
    if (!geometry) {
      const bindInverse = this.body.bindMatrix.clone().invert(),
        parts: T.BufferGeometry[] = [];
      for (const p of pieces) {
        const k = joint(p.bone),
          g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone(),
          localY = Float32Array.from({ length: g.getAttribute("position").count }, (_, i) => g.getAttribute("position").getY(i));
        // Bind space: back through the body's bind matrix and this bone's inverse bind.
        g.applyMatrix4(bindInverse.clone().multiply(skeleton.boneInverses[k]!.clone().invert()).multiply(this.restFrame(p.bone, ...p.at)));
        const count = g.getAttribute("position").count,
          colour = new T.Color(p.colour || "#ffffff"),
          colours = new Float32Array(count * 3),
          si = new Uint16Array(count * 4),
          sw = new Float32Array(count * 4);
        const second = p.blend ? joint(p.blend.bone) : -1;
        for (let i = 0; i < count; i++) {
          colour.toArray(colours, i * 3);
          si[i * 4] = k;
          sw[i * 4] = 1;
          if (p.blend && second >= 0) {
            const t = Math.max(0, Math.min(1, (localY[i]! - p.blend.from) / (p.blend.to - p.blend.from))),
              w = p.blend.share * t * t * (3 - 2 * t);
            si[i * 4 + 1] = second;
            sw[i * 4] = 1 - w;
            sw[i * 4 + 1] = w;
          }
        }
        // Pieces that bring their own vertex colours keep them.
        if (!p.colour && g.getAttribute("color")) colours.set(g.getAttribute("color").array as Float32Array);
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
    // Finger curl axes from each hand's own shape at rest: fingers bend about the
    // knuckle line, towards the side of the palm the thumb is on.
    for (const side of ["Left", "Right"]) {
      const at = (name: string) => this.byName.get(side + name)?.bone.getWorldPosition(new T.Vector3());
      const index = at("HandIndex1"),
        pinky = at("HandPinky1"),
        m1 = at("HandMiddle1"),
        m2 = at("HandMiddle2"),
        thumb = at("HandThumb3") ?? at("HandThumb2"),
        wrist = at("Hand");
      if (!index || !pinky || !m1 || !m2 || !thumb || !wrist) continue;
      const along = m2.clone().sub(m1).normalize(),
        across = index.clone().sub(pinky).normalize(),
        palm = new T.Vector3().crossVectors(across, along).normalize();
      if (palm.dot(thumb.clone().sub(wrist)) < 0) palm.negate();
      const world = new T.Vector3().crossVectors(along, palm).normalize();
      for (const j of this.joints)
        if (new RegExp(`^${side}Hand(Index|Middle|Ring|Pinky)[1-3]$`).test(short(j.bone.name))) this.curlAxes.set(j, world.clone().applyQuaternion(j.offset.clone().invert()).normalize());
    }
    const prep = prepared.get(this.source)!;
    prep.measures ??= this.measure();
  }

  /**
   * The body's own shape in its calibrated rest pose (root space, model units):
   * head bounds and shin cross-sections, so the helmet and pads are made to fit
   * this athlete rather than a generic size.
   */
  private measure(): Measures {
    const g = this.body.geometry,
      pos = g.getAttribute("position"),
      si = g.getAttribute("skinIndex"),
      sw = g.getAttribute("skinWeight"),
      bones = this.body.skeleton.bones,
      index = (name: string) => bones.indexOf(this.bone(name)),
      head = index("Head"),
      shin = index("LeftLeg"),
      thighBone = index("LeftUpLeg"),
      p = new T.Vector3();
    this.root.updateMatrixWorld(true);
    const weightOn = (i: number, k: number) => {
      let w = 0;
      for (let c = 0; c < 4; c++) if (si.getComponent(i, c) === k) w += sw.getComponent(i, c);
      return w;
    };
    const headBox = new T.Box3(),
      knee = this.bone("LeftLeg").getWorldPosition(new T.Vector3()),
      ankle = this.bone("LeftFoot").getWorldPosition(new T.Vector3()),
      shinLength = knee.distanceTo(ankle),
      slices = Array.from({ length: 6 }, () => ({ minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }));
    for (let i = 0; i < pos.count; i++) {
      const onHead = weightOn(i, head) > 0.5,
        onShin = weightOn(i, shin) > 0.4;
      if (!onHead && !onShin) continue;
      p.fromBufferAttribute(pos, i);
      this.body.applyBoneTransform(i, p);
      p.applyMatrix4(this.body.matrixWorld);
      if (onHead) headBox.expandByPoint(p);
      else {
        const t = (knee.y - p.y) / shinLength;
        if (t < -0.05 || t > 1.02) continue;
        const s = slices[Math.min(5, Math.max(0, Math.round(t * 5)))]!;
        const dx = p.x - knee.x,
          dz = p.z - knee.z;
        s.minX = Math.min(s.minX, dx);
        s.maxX = Math.max(s.maxX, dx);
        s.minZ = Math.min(s.minZ, dz);
        s.maxZ = Math.max(s.maxZ, dz);
      }
    }
    // Thigh radius, from the upper thigh's skin around the hip-knee line (90th percentile).
    const hip = this.bone("LeftUpLeg").getWorldPosition(new T.Vector3()),
      thighLine = new T.Line3(hip, knee),
      radii: number[] = [],
      q = new T.Vector3();
    for (let i = 0; i < pos.count; i++) {
      if (weightOn(i, thighBone) < 0.6) continue;
      p.fromBufferAttribute(pos, i);
      this.body.applyBoneTransform(i, p);
      p.applyMatrix4(this.body.matrixWorld);
      const t = thighLine.closestPointToPointParameter(p, false);
      if (t > 0.2 && t < 0.75) radii.push(thighLine.closestPointToPoint(p, true, q).distanceTo(p));
    }
    radii.sort((a, b) => a - b);
    const thigh = radii.length ? radii[Math.floor(radii.length * 0.9)]! : 0.08;
    const headBone = this.bone("Head").getWorldPosition(new T.Vector3());
    return {
      head: { min: headBox.min.clone().sub(headBone), max: headBox.max.clone().sub(headBone) },
      shin: { length: shinLength, slices: slices.map((s) => (Number.isFinite(s.minX) ? s : { minX: -0.05, maxX: 0.05, minZ: -0.06, maxZ: 0.05 })) },
      thigh,
    };
  }

  /** This model's measurements (see `measure`), scaled to the athlete as drawn. */
  measures() {
    const m = prepared.get(this.source)!.measures!,
      k = this.root.scale.x;
    return {
      head: { min: m.head.min.clone().multiplyScalar(k), max: m.head.max.clone().multiplyScalar(k) },
      shin: { length: m.shin.length * k, slices: m.shin.slices.map((s) => ({ minX: s.minX * k, maxX: s.maxX * k, minZ: s.minZ * k, maxZ: s.maxZ * k })) },
      thigh: m.thigh * k,
    };
  }

  /**
   * Gloves made from the athlete's own hands: the skin of each hand (and a cuff
   * up the wrist) copied, pushed out by `thickness` and skinned to the same
   * finger bones, so the glove bends with every finger and can never float off
   * the hand. Coloured per vertex: padded finger rolls, a leather palm, the
   * team colour on the cuff.
   */
  wearGloves(key: string, thickness: number, colours: { back: string; palm: string; cuff: string }, material: T.Material) {
    const prep = prepared.get(this.source)!;
    let geometry = prep.gear.get(key);
    if (!geometry) {
      const g = this.body.geometry,
        pos = g.getAttribute("position"),
        nor = g.getAttribute("normal"),
        si = g.getAttribute("skinIndex"),
        sw = g.getAttribute("skinWeight"),
        idx = g.getIndex()!,
        bones = this.body.skeleton.bones,
        side = bones.map((b) => (/^(mixamorig:?)?LeftHand/.test(b.name) ? 1 : /^(mixamorig:?)?RightHand/.test(b.name) ? 2 : /^(mixamorig:?)?LeftForeArm$/.test(b.name) ? 3 : /^(mixamorig:?)?RightForeArm$/.test(b.name) ? 4 : 0)),
        finger = bones.map((b) => /Hand(Index|Middle|Ring|Pinky)/.test(b.name));
      const wrists = [this.bone("LeftHand"), this.bone("RightHand")].map((b) => b.getWorldPosition(new T.Vector3()));
      const keep = new Int32Array(pos.count).fill(-1),
        p = new T.Vector3(),
        out: { i: number; hand: number; finger: number; cuff: boolean }[] = [];
      for (let i = 0; i < pos.count; i++) {
        let hand = [0, 0, 0, 0, 0],
          onFinger = 0;
        for (let c = 0; c < 4; c++) {
          const b = si.getComponent(i, c),
            w = sw.getComponent(i, c);
          hand[side[b]!]! += w;
          if (finger[b]) onFinger += w;
        }
        let which = hand[1]! > 0.5 ? 0 : hand[2]! > 0.5 ? 1 : -1,
          cuff = false;
        if (which < 0 && (hand[3]! > 0.4 || hand[4]! > 0.4)) {
          // The cuff: forearm skin within a few centimetres of the wrist.
          const s = hand[3]! > hand[4]! ? 0 : 1;
          p.fromBufferAttribute(pos, i);
          this.body.applyBoneTransform(i, p);
          p.applyMatrix4(this.body.matrixWorld).divideScalar(this.root.scale.x || 1);
          if (p.distanceTo(wrists[s]!.clone().divideScalar(this.root.scale.x || 1)) < 0.075) (which = s), (cuff = true);
        }
        if (which < 0) continue;
        keep[i] = out.length;
        out.push({ i, hand: which, finger: onFinger, cuff });
      }
      const n = out.length,
        position = new Float32Array(n * 3),
        normal = new Float32Array(n * 3),
        colour = new Float32Array(n * 3),
        skinIndex = new Uint16Array(n * 4),
        skinWeight = new Float32Array(n * 4),
        back = new T.Color(colours.back),
        palm = new T.Color(colours.palm),
        cuffC = new T.Color(colours.cuff),
        c = new T.Color(),
        v = new T.Vector3(),
        nv = new T.Vector3();
      for (const [k, o] of out.entries()) {
        v.fromBufferAttribute(pos, o.i);
        nv.fromBufferAttribute(nor, o.i).normalize();
        v.addScaledVector(nv, thickness * (o.cuff ? 1.25 : 1));
        v.toArray(position, k * 3);
        nv.toArray(normal, k * 3);
        for (let q = 0; q < 4; q++) (skinIndex[k * 4 + q] = si.getComponent(o.i, q)), (skinWeight[k * 4 + q] = sw.getComponent(o.i, q));
        // Palms face the thighs at rest: towards -X for the left hand, +X for the right.
        const palmSide = (o.hand === 0 ? -nv.x : nv.x) > 0.45;
        if (o.cuff) c.copy(cuffC);
        else if (palmSide) c.copy(palm);
        else {
          // Padded finger rolls: bands of light and shade along each finger.
          const roll = o.finger > 0.5 ? 0.9 + 0.1 * Math.cos((v.y + v.x * 0.3) * 260) : 1;
          c.copy(back).multiplyScalar(roll);
        }
        c.toArray(colour, k * 3);
      }
      const tris: number[] = [];
      for (let t = 0; t < idx.count; t += 3) {
        const a = keep[idx.getX(t)]!,
          b = keep[idx.getX(t + 1)]!,
          d = keep[idx.getX(t + 2)]!;
        if (a >= 0 && b >= 0 && d >= 0) tris.push(a, b, d);
      }
      geometry = new T.BufferGeometry();
      geometry.setAttribute("position", new T.BufferAttribute(position, 3));
      geometry.setAttribute("normal", new T.BufferAttribute(normal, 3));
      geometry.setAttribute("color", new T.BufferAttribute(colour, 3));
      geometry.setAttribute("skinIndex", new T.BufferAttribute(skinIndex, 4));
      geometry.setAttribute("skinWeight", new T.BufferAttribute(skinWeight, 4));
      geometry.setIndex(tris);
      prep.gear.set(key, geometry);
    }
    const mesh = new T.SkinnedMesh(geometry, material);
    mesh.name = "gloves";
    mesh.frustumCulled = false;
    this.body.parent!.add(mesh);
    mesh.bind(this.body.skeleton, this.body.bindMatrix);
    this.equipment.push(mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  setTeam(team: number) {
    if (team === this.team) return;
    this.team = team;
    this.kit.material = this.kits.get(team);
  }

  private eyes: T.Mesh[] | null = null;
  private far = false;
  /**
   * The very distant tier: past `FAR_EYES` metres from the camera a player's eyes,
   * brows and lashes are a fraction of a pixel, so they aren't drawn at all.
   * Hair stays, since it shapes the silhouette.
   */
  setDistance(metres: number) {
    const far = metres > FAR_EYES;
    if (far === this.far) return;
    this.far = far;
    this.eyes ??= this.meshes.filter((m) => /high-poly|low-poly|eyebrow|eyelash/.test((m.material as T.Material).name));
    for (const m of this.eyes) m.visible = !far;
  }

  /** Shadows from the body, kit and gear only: hair, eyes and brows are too small to matter. */
  setShadows(cast: boolean) {
    for (const m of this.meshes) {
      const name = (m.material as T.Material).name;
      // Gloves too: their shadow is lost inside the hand's own.
      m.castShadow = cast && m.name !== "gloves" && !/hair|short0|afro|eye|lash|brow|low-poly|high-poly/.test(name);
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
    // Clip-driven arms hang where the clip's slimmer body had its thighs: keep the
    // hands out of the trouser legs. (Driver-driven hands are left exactly where
    // the rig puts them, so bat grips and catches are unchanged.)
    // Clip-driven feet are pinned to the turf while planted.
    if (motion && lower > 0.5) this.lockFeet();
    else for (const lock of this.locks) (lock.on = false), (lock.weight = 0), (lock.low = Infinity);
    // Last, once the legs are final: twice, since clearing one thigh can nudge a hand towards the other.
    if (motion && upper >= 0.5) for (let pass = 0; pass < 2 && this.clearHands() > 0.001; pass++);
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

  /** Extra room around the thigh's skin for the loose trouser leg and the hand's own thickness (metres). */
  static readonly HAND_CLEARANCE = 0.034;
  /**
   * Moves each palm out of either thigh's trouser leg if a clip pose has put it
   * inside, bending at the clip's own elbow. Returns how far the hands moved.
   */
  clearHands() {
    const m = prepared.get(this.source)?.measures;
    if (!m) return 0;
    const scale = this.root.getWorldScale(tv3).x,
      room = (m.thigh + RealisticBody.HAND_CLEARANCE) * scale;
    let moved = 0;
    for (const left of [true, false]) {
      const palm = this.palm(left, new T.Vector3());
      for (const side of ["Left", "Right"]) {
        const hip = this.bone(side + "UpLeg").getWorldPosition(new T.Vector3()),
          knee = this.bone(side + "Leg").getWorldPosition(new T.Vector3()),
          near = new T.Line3(hip, knee).closestPointToPoint(palm, true, new T.Vector3()),
          away = palm.clone().sub(near),
          d = away.length();
        if (d >= room) continue;
        if (d < 1e-5) away.set(left ? 1 : -1, 0, 0);
        const target = near.add(away.normalize().multiplyScalar(room));
        moved = Math.max(moved, room - d);
        this.reachHand(left, target, 1);
        palm.copy(target);
      }
    }
    return moved;
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


// ---- equipment ------------------------------------------------------------------------

type V3 = [number, number, number];
/** Builds an indexed geometry from a grid of rows x cols points (row-major), optionally closing the columns. */
function gridGeometry(points: V3[], colours: V3[], rows: number, cols: number, closeCols = false) {
  const g = new T.BufferGeometry(),
    index: number[] = [];
  const span = closeCols ? cols : cols - 1;
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < span; c++) {
      const a = r * cols + c,
        b = r * cols + ((c + 1) % cols),
        d = (r + 1) * cols + c,
        e = (r + 1) * cols + ((c + 1) % cols);
      index.push(a, d, b, b, d, e);
    }
  g.setAttribute("position", new T.BufferAttribute(new Float32Array(points.flat()), 3));
  g.setAttribute("color", new T.BufferAttribute(new Float32Array(colours.flat()), 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
const rgb = (hex: string, k = 1): V3 => {
  const c = new T.Color(hex);
  return [c.r * k, c.g * k, c.b * k];
};

/**
 * A batting helmet sized to this head (bounds relative to the Head joint, rest
 * axes: +Y up, +Z forward): a rounded shell that comes down to the brow at the
 * front and over the ears and nape behind, a short peak, and a steel grille.
 */
function helmetGeometry(head: { min: T.Vector3; max: T.Vector3 }, shell: string) {
  const c = head.min.clone().add(head.max).multiplyScalar(0.5),
    size = head.max.clone().sub(head.min);
  const a = size.x / 2 + 0.024,
    b = size.y * 0.5 + 0.02,
    d = size.z / 2 + 0.018;
  // Skull centre: a little behind the face's middle (the bounds include the nose), at brow height.
  const cy = head.max.y - b + 0.012,
    cz = c.z - 0.012,
    browY = head.min.y + size.y * 0.58;
  const rows = 14,
    cols = 36,
    outer: V3[] = [],
    inner: V3[] = [],
    oc: V3[] = [],
    ic: V3[] = [];
  const shellC = rgb(shell),
    innerC = rgb("#22262c");
  const vFront = Math.acos(Math.max(-1, Math.min(1, (browY - cy) / b)));
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      const u = (k / cols) * Math.PI * 2,
        front = Math.max(0, Math.cos(u)),
        // How far down the shell comes: to the brow in front, over the ears, to the nape behind.
        vMax = vFront * front ** 1.5 + (1 - front ** 1.5) * (1.95 + 0.12 * Math.sin(u) ** 2),
        v = (r / (rows - 1)) * vMax;
      const sx = Math.sin(v) * Math.sin(u),
        sy = Math.cos(v),
        sz = Math.sin(v) * Math.cos(u);
      outer.push([sx * a, cy + sy * b, cz + sz * d]);
      inner.push([sx * (a - 0.012), cy + sy * (b - 0.012), cz + sz * (d - 0.012)]);
      oc.push(shellC);
      ic.push(innerC);
    }
  const parts = [gridGeometry(outer, oc, rows, cols, true), gridGeometry(inner, ic, rows, cols, true)];
  // Rim joining the two shells.
  const rimPts: V3[] = [],
    rimC: V3[] = [];
  for (let k = 0; k < cols; k++) rimPts.push(outer[(rows - 1) * cols + k]!), rimC.push(rgb("#16191d"));
  for (let k = 0; k < cols; k++) rimPts.push(inner[(rows - 1) * cols + k]!), rimC.push(rgb("#16191d"));
  parts.push(gridGeometry(rimPts, rimC, 2, cols, true));
  // Peak: a short curved brim over the brow.
  const peak: V3[] = [],
    pc: V3[] = [],
    pcols = 15;
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < pcols; k++) {
      const u = -1.05 + (2.1 * k) / (pcols - 1),
        v = vFront - 0.05,
        reach = [0, 0.05, 0.05][r]! * Math.cos(u * 0.8) ** 0.6,
        drop = [0, 0.012, 0.018][r]!;
      const x = Math.sin(v) * Math.sin(u) * a,
        z = Math.sin(v) * Math.cos(u) * d,
        len = Math.hypot(x, z) || 1;
      peak.push([x + (x / len) * reach, cy + Math.cos(v) * b - drop - (r === 2 ? 0.006 : 0), cz + z + (z / len) * reach]);
      pc.push(shellC);
    }
  parts.push(gridGeometry(peak, pc, 3, pcols));
  // Grille: three bars round the face below the peak, and three uprights.
  const steel = rgb("#8f979f"),
    faceZ = head.max.z + 0.03;
  const bar = (pts: T.Vector3[]) => {
    const tube = new T.TubeGeometry(new T.CatmullRomCurve3(pts), 18, 0.0042, 5, false),
      n = tube.getAttribute("position").count;
    tube.setAttribute("color", new T.BufferAttribute(new Float32Array(Array.from({ length: n }, () => steel).flat()), 3));
    tube.deleteAttribute("uv");
    return tube;
  };
  const arc = (y: number, spread: number, push: number) =>
    Array.from({ length: 9 }, (_, i) => {
      const u = -spread + (2 * spread * i) / 8;
      return new T.Vector3(Math.sin(u) * (a + 0.006), y, cz + Math.cos(u) * (faceZ - cz + push));
    });
  const bars = [browY - 0.028, browY - 0.062, browY - 0.098];
  for (const [i, y] of bars.entries()) parts.push(bar(arc(y, 1.25 - i * 0.06, 0.006 + i * 0.01)));
  for (const u of [-0.32, 0, 0.32])
    parts.push(bar([new T.Vector3(Math.sin(u) * (a + 0.006), bars[0]! + 0.004, cz + Math.cos(u) * (faceZ - cz + 0.006)), new T.Vector3(Math.sin(u) * (a + 0.006), bars[2]! - 0.004, cz + Math.cos(u) * (faceZ - cz + 0.026))]));
  return concat(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
}

/**
 * A batting or keeping pad shaped round this shin (cross-sections relative to
 * the knee, rest axes): vertical bolsters down the front, a three-roll knee,
 * side wings, a flared foot over the instep, and three dark straps behind.
 */
function padGeometry(shin: { length: number; slices: { minX: number; maxX: number; minZ: number; maxZ: number }[] }, side: 1 | -1, face: string, strap: string) {
  const rows = 24,
    cols = 19,
    pts: V3[] = [],
    cs: V3[] = [];
  // The knee roll stops a little above the joint: on a deep crouch a taller one
  // stands off the bent knee.
  const top = 0.085,
    bottom = -(shin.length + 0.035);
  const at = (y: number) => {
    const t = Math.min(1, Math.max(0, -y / shin.length)) * 5,
      i = Math.min(4, Math.floor(t)),
      f = t - i,
      s0 = shin.slices[i]!,
      s1 = shin.slices[i + 1]!,
      mix = (k: "minX" | "maxX" | "minZ" | "maxZ") => s0[k] + (s1[k] - s0[k]) * f;
    return { cx: (mix("minX") + mix("maxX")) / 2, cz: (mix("minZ") + mix("maxZ")) / 2, rx: (mix("maxX") - mix("minX")) / 2, rz: (mix("maxZ") - mix("minZ")) / 2 };
  };
  for (let r = 0; r < rows; r++) {
    const y = top + ((bottom - top) * r) / (rows - 1),
      s = at(Math.min(0, y));
    for (let k = 0; k < cols; k++) {
      // Wrap from the inside of the leg round the front to the outside.
      const u = -1.95 + (3.9 * k) / (cols - 1),
        front = Math.cos(u);
      // Clear of the loose trouser leg, which hangs wider towards the ankle.
      const down = Math.min(1, Math.max(0, -y / shin.length));
      // Round the knee the bent trouser leg bulges, so the pad stands further off there too.
      const knee = Math.max(0, Math.min(1, (y + 0.14) / 0.12));
      let rx = s.rx + 0.03 + 0.018 * down + 0.02 * knee,
        rz = s.rz + 0.03 + 0.02 * down + 0.022 * knee,
        groove = 1;
      // Bolsters: vertical ridges across the front.
      if (Math.abs(u) < 1.15) {
        // Smooth rounded bolsters (a sharp-cusped profile shows as a sawtooth edge).
        const ridge = 0.5 + 0.5 * Math.cos(u * 6.8);
        rz += 0.012 * ridge * front;
        rx += 0.006 * ridge;
        groove = 0.86 + 0.14 * ridge;
      }
      // Knee rolls above the joint, narrowing to a rounded top.
      if (y > -0.02) rz += 0.012 * Math.abs(Math.sin(((y + 0.02) / 0.105) * Math.PI * 2)) * Math.max(0, front);
      const taper = 1 - 0.28 * Math.max(0, Math.min(1, y / top)) ** 2;
      rx *= taper;
      rz *= 0.94 + 0.06 * taper;
      // Flare over the instep.
      const foot = Math.max(0, (-shin.length + 0.02 - y) / 0.06) * 0.6;
      const x = s.cx + Math.sin(u) * rx * (u * side > 0 ? 1.05 : 0.92),
        z = s.cz + Math.cos(u) * rz + foot * 0.03 * Math.max(0, front);
      pts.push([x, y, z]);
      cs.push(Math.abs(u) > 1.75 ? rgb(face, 0.82) : rgb(face, groove));
    }
  }
  // A real thickness: an inner surface 1.4 cm in, joined to the outer one by a rim
  // all round, so no edge reads as a sheet of paper.
  const inner: V3[] = pts.map(([x, y, z], i) => {
    const s = at(Math.min(0, y)),
      dx = x - s.cx,
      dz = z - s.cz,
      d = Math.hypot(dx, dz) || 1,
      k = Math.max(0, d - 0.014) / d;
    return [s.cx + dx * k, y, s.cz + dz * k];
  });
  const rimC = rgb(face, 0.8),
    rim = (idx: number[]) => gridGeometry([...idx.map((i) => pts[i]!), ...idx.map((i) => inner[i]!)], [...idx.map(() => rimC), ...idx.map(() => rimC)], 2, idx.length);
  const row = (r: number) => Array.from({ length: cols }, (_, k) => r * cols + k),
    col = (k: number) => Array.from({ length: rows }, (_, r) => r * cols + k);
  const parts = [gridGeometry(pts, cs, rows, cols), gridGeometry(inner, cs.map((c) => [c[0] * 0.85, c[1] * 0.85, c[2] * 0.85] as V3), rows, cols), rim(row(0)), rim(row(rows - 1)), rim(col(0)), rim(col(cols - 1))];
  // Straps: thin bands right round the leg, behind the pad.
  for (const f of [0.18, 0.5, 0.82]) {
    const y = -shin.length * f,
      s = at(y),
      ring: V3[] = [],
      rc: V3[] = [];
    for (const dy of [0.014, -0.014])
      for (let k = 0; k < 20; k++) {
        const u = (k / 20) * Math.PI * 2;
        ring.push([s.cx + Math.sin(u) * (s.rx + 0.006), y + dy, s.cz + Math.cos(u) * (s.rz + 0.006)]);
        rc.push(rgb(strap));
      }
    parts.push(gridGeometry(ring, rc, 2, 20, true));
  }
  return concat(parts.map((p) => p.toNonIndexed()));
}

/**
 * The bat, along the bat bone's -Y with the face on +Z (see placeBat): a gripped
 * handle, sloping shoulders, and a blade with a flat face, a raised spine on the
 * back that is thickest near the sweet spot, and a rounded toe.
 */
function batGeometry(grip: string) {
  const parts: T.BufferGeometry[] = [];
  // Handle with a ribbed rubber grip, and the splice where it meets the blade.
  const profile: T.Vector2[] = [];
  for (let i = 0; i <= 28; i++) {
    const y = 0.035 - (i / 28) * 0.335;
    const r = y > -0.24 ? 0.0172 + 0.0009 * Math.sin(y * 420) : 0.0165;
    profile.push(new T.Vector2(r, y));
  }
  const handle = new T.LatheGeometry(profile.reverse(), 12);
  {
    const n = handle.getAttribute("position").count,
      col = new Float32Array(n * 3),
      p = handle.getAttribute("position"),
      g = rgb(grip),
      wood = rgb("#cdb07a");
    for (let i = 0; i < n; i++) (p.getY(i) > -0.25 ? g : wood).forEach((v, c) => (col[i * 3 + c] = v));
    handle.setAttribute("color", new T.BufferAttribute(col, 3));
    handle.deleteAttribute("uv");
  }
  parts.push(handle.toNonIndexed());
  // Blade: lofted cross-sections from the shoulders to the toe.
  const start = 0.28,
    end = BAT.toe,
    rows = 26,
    across = 14,
    pts: V3[] = [],
    cs: V3[] = [];
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1),
      y = -(start + (end - start) * t);
    // Shoulders widen into the blade; the toe rounds off.
    const shoulder = Math.min(1, t / 0.08),
      width = 0.108 * (0.35 + 0.65 * Math.sin((shoulder * Math.PI) / 2)) * (t > 0.96 ? Math.cos(((t - 0.96) / 0.04) * 1.1) : 1);
    // Spine: thickest about two thirds down.
    const spine = 0.036 + 0.028 * Math.exp(-(((t - 0.66) / 0.3) ** 2)),
      edge = 0.022 + 0.016 * Math.min(1, t * 1.5);
    for (let k = 0; k <= across; k++) {
      // Around the section: the flat face (z near 0), then the curved back.
      const a = (k / across) * Math.PI * 2,
        x = Math.cos(a) * (width / 2);
      const s = Math.cos(a),
        back = Math.sin(a) < 0;
      const z = back ? -(edge + (spine - edge) * (1 - s * s) ** 0.9) * Math.min(1, -Math.sin(a) * 4) : Math.min(0.004, Math.sin(a) * 0.01);
      pts.push([x, y, z]);
      const grain = 0.94 + 0.06 * Math.sin(x * 900 + y * 30);
      cs.push(back ? rgb("#d9bd85", grain) : rgb("#e8d3a4", grain));
    }
  }
  parts.push(gridGeometry(pts, cs, rows, across + 1).toNonIndexed());
  return concat(parts);
}

/**
 * Equipment. The bat rides the driver's bat bone, so contact stays exact. The
 * helmet and pads are made to fit each athlete's measured head and shins and
 * are rigidly skinned to the head and shins; gloves are the athlete's own hands
 * thickened (see `wearGloves`). Shared materials, so a batter adds four draw calls.
 */
export function equipmentKit() {
  const geometries: T.BufferGeometry[] = [],
    materials: T.Material[] = [];
  const gear = new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.3, side: T.DoubleSide }),
    soft = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0, side: T.DoubleSide }),
    batMaterial = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  materials.push(gear, soft, batMaterial);
  const bats = new Map<number, T.BufferGeometry>();
  return {
    geometries,
    materials,
    dress(body: RealisticBody, role: Athlete["role"], team: number, batBone: T.Bone, cast: boolean) {
      const colours = TEAMS[team < 0 ? 0 : team]!;
      if (role === "bat") {
        let bat = bats.get(team);
        if (!bat) bats.set(team, (bat = batGeometry(colours.dark))), geometries.push(bat);
        const b = new T.Mesh(bat, batMaterial);
        b.castShadow = cast;
        batBone.add(b);
        body.equipment.push(b);
        const m = body.measures();
        body.wearRigid(`helmet:${team}`, [{ bone: "Head", geometry: helmetGeometry(m.head, colours.dark), colour: "", at: [0, 0, 0] }], gear).castShadow = cast;
      }
      if (role === "bat" || role === "keeper") {
        const m = body.measures(),
          face = role === "keeper" ? "#efede6" : "#f4f2ec";
        body.wearRigid(
          `pads:${role}`,
          [
            // The knee roll follows the thigh part of the way, as a strapped pad does when the knee bends.
            { bone: "LeftLeg", geometry: padGeometry(m.shin, 1, face, "#2b3038"), colour: "", at: [0, 0, 0], blend: { bone: "LeftUpLeg", from: -0.04, to: 0.07, share: 0.6 } },
            { bone: "RightLeg", geometry: padGeometry(m.shin, -1, face, "#2b3038"), colour: "", at: [0, 0, 0], blend: { bone: "RightUpLeg", from: -0.04, to: 0.07, share: 0.6 } },
          ],
          soft,
        ).castShadow = cast;
        body.curlFingers(0.9);
        body.wearGloves(`gloves:${role}:${team}`, role === "keeper" ? 0.011 : 0.0065, role === "keeper" ? { back: "#f2f0ea", palm: "#3a3f46", cuff: colours.dark } : { back: "#f4f2ec", palm: "#e4ded2", cuff: colours.dark }, soft).castShadow = false;
      } else body.curlFingers(role === "umpire" ? 0.18 : 0.28);
    },
  };
}
