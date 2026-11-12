import * as T from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Real motion clips for the realistic athletes, from Quaternius's Universal
 * Animation Library (CC0 1.0; see scripts/cricket-characters/LICENSES.md).
 *
 * The clips are played on hidden copies of their own skeletons, then handed to
 * `RealisticBody.sync` as rotations relative to an aligned rest pose (limbs
 * hanging, spine upright). The athletes calibrate to the same rest, so the
 * clips transfer across different skeletons and proportions.
 *
 * Each clip is measured once at load: locomotion clips for the ground speed of
 * their stance foot, so playback can match the simulated speed and feet don't
 * slide, and the throw for the moment the hand releases the ball.
 *
 * Presentation only: nothing here reads or writes the match.
 */

const URL_BASE = "/sinverse-cricket/motion/";
export type LocoClip = "Idle_Loop" | "Walk_Loop" | "Jog_Fwd_Loop" | "Sprint_Loop";
export type OneShot =
  | "OverhandThrow"
  | "LayToIdle"
  | "Yes"
  | "Roll"
  | "Slide_Start"
  | "Slide_Loop"
  | "Slide_Exit"
  | "Jump_Start"
  | "Jump_Land"
  | "NinjaJump_Land"
  | "Idle_FoldArms_Loop"
  | "Idle_No_Loop"
  | "Idle_Talking_Loop";

/** Athlete (Mixamo) joint -> source joint, per library. Fingers keep the athlete's own curl. */
const JOINTS = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand", "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"] as const;
export type Joint = (typeof JOINTS)[number];
const UAL1: Record<Joint, string> = {
  Hips: "DEF-hips",
  Spine: "DEF-spine.001",
  Spine1: "DEF-spine.002",
  Spine2: "DEF-spine.003",
  Neck: "DEF-neck",
  Head: "DEF-head",
  LeftShoulder: "DEF-shoulder.L",
  LeftArm: "DEF-upper_arm.L",
  LeftForeArm: "DEF-forearm.L",
  LeftHand: "DEF-hand.L",
  RightShoulder: "DEF-shoulder.R",
  RightArm: "DEF-upper_arm.R",
  RightForeArm: "DEF-forearm.R",
  RightHand: "DEF-hand.R",
  LeftUpLeg: "DEF-thigh.L",
  LeftLeg: "DEF-shin.L",
  LeftFoot: "DEF-foot.L",
  LeftToeBase: "DEF-toe.L",
  RightUpLeg: "DEF-thigh.R",
  RightLeg: "DEF-shin.R",
  RightFoot: "DEF-foot.R",
  RightToeBase: "DEF-toe.R",
};
const UAL2: Record<Joint, string> = {
  Hips: "pelvis",
  Spine: "spine_01",
  Spine1: "spine_02",
  Spine2: "spine_03",
  Neck: "neck_01",
  Head: "Head",
  LeftShoulder: "clavicle_l",
  LeftArm: "upperarm_l",
  LeftForeArm: "lowerarm_l",
  LeftHand: "hand_l",
  RightShoulder: "clavicle_r",
  RightArm: "upperarm_r",
  RightForeArm: "lowerarm_r",
  RightHand: "hand_r",
  LeftUpLeg: "thigh_l",
  LeftLeg: "calf_l",
  LeftFoot: "foot_l",
  LeftToeBase: "ball_l",
  RightUpLeg: "thigh_r",
  RightLeg: "calf_r",
  RightFoot: "foot_r",
  RightToeBase: "ball_r",
};
/** The athletes' aligned rest: limbs hang straight down, the spine and neck rise. */
const DOWN = new T.Vector3(0, -1, 0),
  UP = new T.Vector3(0, 1, 0);
const ALIGN: [Joint, Joint, T.Vector3][] = [
  ["Spine", "Spine1", UP],
  ["Spine1", "Spine2", UP],
  ["Spine2", "Neck", UP],
  ["Neck", "Head", UP],
  ["LeftArm", "LeftForeArm", DOWN],
  ["LeftForeArm", "LeftHand", DOWN],
  ["RightArm", "RightForeArm", DOWN],
  ["RightForeArm", "RightHand", DOWN],
  ["LeftUpLeg", "LeftLeg", DOWN],
  ["LeftLeg", "LeftFoot", DOWN],
  ["RightUpLeg", "RightLeg", DOWN],
  ["RightLeg", "RightFoot", DOWN],
];
/** Joints the lower-body layer owns; everything else is upper body. */
export const LOWER = new Set<Joint>(["Hips", "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"]);

interface Library {
  gltf: GLTF;
  map: Record<Joint, string>;
  /** Per joint: aligned-rest world rotation in the library's root frame, inverted. */
  restInverse: Map<Joint, T.Quaternion>;
  /** Rotation that turns the library's facing into the athletes' (+Z). */
  facing: T.Quaternion;
  /** Hip-to-ankle length at rest, metres. */
  leg: number;
  clips: Map<string, T.AnimationClip>;
}

export interface ClipInfo {
  duration: number;
  /** Ground speed of the stance foot, metres per second of clip time, at the library's size. */
  speed: number;
  /** Phase (0..1) of the left foot's furthest-forward point, to line locomotion clips up. */
  phase: number;
  /** Seconds into the clip when the throwing hand lets go. */
  release: number;
}

export interface MotionLibrary {
  libraries: Library[];
  info: Map<string, ClipInfo>;
  libraryOf: Map<string, Library>;
}

const sanitize = (name: string) => T.PropertyBinding.sanitizeNodeName(name);
const IDENTITY = new T.Quaternion();
/** q raised to the power k: the same axis, k times the angle. */
function power(q: T.Quaternion, k: number) {
  return k === 1 ? q : new T.Quaternion().copy(IDENTITY).slerp(q, k);
}
const tq = new T.Quaternion(),
  tq2 = new T.Quaternion(),
  tv = new T.Vector3(),
  tv2 = new T.Vector3();

function find(root: T.Object3D, name: string) {
  const want = sanitize(name);
  let found: T.Object3D | null = null;
  root.traverse((o) => {
    if (!found && sanitize(o.name) === want) found = o;
  });
  if (!found) throw new Error(`motion library is missing joint ${name}`);
  return found as T.Object3D;
}

/** World rotation of `o` relative to `root` (root's own transform excluded). */
function rootQuat(o: T.Object3D, root: T.Object3D, out: T.Quaternion) {
  out.identity();
  for (let n: T.Object3D | null = o; n && n !== root; n = n.parent) out.premultiply(n.quaternion);
  return out;
}
function rootPos(o: T.Object3D, root: T.Object3D, out: T.Vector3) {
  root.updateMatrixWorld(true);
  out.setFromMatrixPosition(o.matrixWorld);
  return root.worldToLocal(out);
}

function prepareLibrary(gltf: GLTF, map: Record<Joint, string>): Library {
  const root = gltf.scene.clone(true);
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.updateMatrixWorld(true);
  const node = (j: Joint) => find(root, map[j]);
  // Which way does this library's character face? Toes are ahead of the ankles.
  const forward = rootPos(node("LeftToeBase"), root, new T.Vector3()).sub(rootPos(node("LeftFoot"), root, tv2));
  forward.y = 0;
  const facing = new T.Quaternion().setFromUnitVectors(forward.normalize(), new T.Vector3(0, 0, 1));
  // Align the rest pose the way the athletes align theirs.
  for (const [joint, child, dir] of ALIGN) {
    const bone = node(joint),
      from = rootPos(node(child), root, new T.Vector3()).sub(rootPos(bone, root, tv)).applyQuaternion(facing).normalize();
    const delta = tq.setFromUnitVectors(from, dir);
    // In the library's frame: undo facing, rotate, redo facing.
    const inLib = new T.Quaternion().copy(facing).invert().multiply(delta).multiply(facing);
    const world = rootQuat(bone, root, new T.Quaternion()).premultiply(inLib);
    const parent = rootQuat(bone.parent!, root, tq2);
    bone.quaternion.copy(parent.invert().multiply(world));
    root.updateMatrixWorld(true);
  }
  const restInverse = new Map<Joint, T.Quaternion>();
  for (const j of JOINTS) restInverse.set(j, rootQuat(node(j), root, new T.Quaternion()).premultiply(facing).invert());
  const leg = rootPos(node("LeftUpLeg"), root, new T.Vector3()).distanceTo(rootPos(node("LeftLeg"), root, tv)) + rootPos(node("LeftLeg"), root, new T.Vector3()).distanceTo(rootPos(node("LeftFoot"), root, tv));
  return { gltf, map, restInverse, facing, leg, clips: new Map(gltf.animations.map((c) => [c.name, c])) };
}

/** Plays one library on a hidden copy of its skeleton. */
class Rig {
  readonly root: T.Object3D;
  readonly mixer: T.AnimationMixer;
  private actions = new Map<string, T.AnimationAction>();
  private nodes = new Map<Joint, T.Object3D>();
  constructor(readonly lib: Library) {
    this.root = lib.gltf.scene.clone(true);
    this.root.position.set(0, 0, 0);
    this.root.quaternion.identity();
    this.mixer = new T.AnimationMixer(this.root);
    for (const [name, clip] of lib.clips) {
      const action = this.mixer.clipAction(clip);
      action.play();
      action.setEffectiveWeight(0);
      this.actions.set(name, action);
    }
    for (const j of JOINTS) this.nodes.set(j, find(this.root, lib.map[j]));
  }
  /** Poses the skeleton as a weighted mix of clips at given times. Weights should sum to 1. */
  pose(mix: { clip: string; time: number; weight: number }[]) {
    for (const action of this.actions.values()) action.setEffectiveWeight(0);
    for (const m of mix) {
      const action = this.actions.get(m.clip)!;
      action.time = m.time;
      action.setEffectiveWeight(m.weight);
    }
    this.mixer.update(0);
  }
  /** Rotation of each joint relative to the aligned rest, in the athletes' frame. */
  read(out: Map<Joint, T.Quaternion>) {
    const f = this.lib.facing;
    for (const j of JOINTS) {
      const q = out.get(j) ?? new T.Quaternion();
      rootQuat(this.nodes.get(j)!, this.root, q).premultiply(f).multiply(this.lib.restInverse.get(j)!);
      out.set(j, q);
    }
  }
  /** Mid-hip height and sideways/forward sway, in the athletes' frame, at the library's size. */
  hips(out: T.Vector3) {
    rootPos(this.nodes.get("LeftUpLeg")!, this.root, out).add(rootPos(this.nodes.get("RightUpLeg")!, this.root, tv)).multiplyScalar(0.5);
    return out.applyQuaternion(this.lib.facing);
  }
  joint(j: Joint, out: T.Vector3) {
    return rootPos(this.nodes.get(j)!, this.root, out).applyQuaternion(this.lib.facing);
  }
}

/** Measures a clip: stance-foot ground speed, gait phase and the throwing hand's release. */
function measure(lib: Library, name: string): ClipInfo {
  const clip = lib.clips.get(name)!,
    rig = new Rig(lib),
    samples = 90,
    foot: T.Vector3[] = [],
    hand: T.Vector3[] = [];
  for (let i = 0; i < samples; i++) {
    rig.pose([{ clip: name, time: (i / samples) * clip.duration, weight: 1 }]);
    const hips = rig.hips(new T.Vector3());
    foot.push(rig.joint("LeftFoot", new T.Vector3()).sub(hips));
    hand.push(rig.joint("RightHand", new T.Vector3()));
  }
  const dt = clip.duration / samples;
  // Ground speed from the foot's fore-and-aft swing: over one cycle each foot
  // sweeps its full range back while planted, and the body covers two such
  // steps. (The ankle's instantaneous speed while planted overstates it: in
  // stylised clips the foot rolls and lifts through contact.)
  const zs = foot.map((f) => f.z),
    range = Math.max(...zs) - Math.min(...zs);
  let forwardMost = 0;
  for (let i = 1; i < samples; i++) if (foot[i]!.z > foot[forwardMost]!.z) forwardMost = i;
  // Release: the throwing hand's fastest forward moment.
  let release = 0,
    fastest = -Infinity;
  for (let i = 1; i < samples; i++) {
    const v = (hand[i]!.z - hand[i - 1]!.z) / dt;
    if (v > fastest) {
      fastest = v;
      release = i * dt;
    }
  }
  return { duration: clip.duration, speed: (2 * range) / clip.duration, phase: forwardMost / samples, release };
}

let loading: Promise<MotionLibrary> | null = null;
/** Loads and measures the motion clips once per page. */
export function loadMotion(): Promise<MotionLibrary> {
  if (!loading) {
    const loader = new GLTFLoader();
    loading = Promise.all([loader.loadAsync(URL_BASE + "ual1.glb"), loader.loadAsync(URL_BASE + "ual2.glb")]).then(([a, b]) => prepareMotion(a, b));
    loading.catch(() => (loading = null));
  }
  return loading;
}

/** Readies loaded libraries (also used by tests, which parse the files themselves). */
export function prepareMotion(ual1: GLTF, ual2: GLTF): MotionLibrary {
  const libraries = [prepareLibrary(ual1, UAL1), prepareLibrary(ual2, UAL2)],
    info = new Map<string, ClipInfo>(),
    libraryOf = new Map<string, Library>();
  for (const lib of libraries)
    for (const name of lib.clips.keys()) {
      libraryOf.set(name, lib);
      info.set(name, measure(lib, name));
    }
  return { libraries, info, libraryOf };
}

/** Each joint's children in the athletes' skeleton (the joints the clips drive). */
const CHILDREN: Partial<Record<Joint, Joint[]>> = {
  Hips: ["Spine", "LeftUpLeg", "RightUpLeg"],
  Spine: ["Spine1"],
  Spine1: ["Spine2"],
  Spine2: ["Neck", "LeftShoulder", "RightShoulder"],
  Neck: ["Head"],
  LeftShoulder: ["LeftArm"],
  LeftArm: ["LeftForeArm"],
  LeftForeArm: ["LeftHand"],
  RightShoulder: ["RightArm"],
  RightArm: ["RightForeArm"],
  RightForeArm: ["RightHand"],
  LeftUpLeg: ["LeftLeg"],
  LeftLeg: ["LeftFoot"],
  LeftFoot: ["LeftToeBase"],
  RightUpLeg: ["RightLeg"],
  RightLeg: ["RightFoot"],
  RightFoot: ["RightToeBase"],
};
/** Turns joint `j` and everything it carries by `q` (athlete root frame). */
function turn(pose: Map<Joint, T.Quaternion>, j: Joint, q: T.Quaternion) {
  pose.get(j)?.premultiply(q);
  for (const c of CHILDREN[j] ?? []) turn(pose, c, q);
}
const X_AXIS = new T.Vector3(1, 0, 0),
  AHEAD = new T.Vector3(0, 0, 1);
/** Forward lean of a joint's bone from upright, radians (the spine and neck rise at rest). */
function lean(q: T.Quaternion) {
  const d = tv.copy(UP).applyQuaternion(q);
  return Math.atan2(d.z, d.y);
}
const deg = Math.PI / 180;
/**
 * How a trained athlete carries himself in each gait: forward lean of the lower
 * back, mid back, chest and neck (degrees from upright) and the head's downward
 * look. Standing is tall and relaxed; running leans from the ankles and hips,
 * not by curling the back, and the eyes stay on the field ahead.
 */
const CARRIAGE: Record<LocoClip, { trunk: [number, number, number]; neck: number; head: number; hold: number }> = {
  Idle_Loop: { trunk: [2, 0, -2], neck: 9, head: 3, hold: 0.9 },
  Walk_Loop: { trunk: [4, 2, 0], neck: 10, head: 4, hold: 0.5 },
  Jog_Fwd_Loop: { trunk: [8, 6, 4], neck: 10, head: 4, hold: 0.55 },
  Sprint_Loop: { trunk: [16, 12, 9], neck: 10, head: 2, hold: 0.7 },
};
/**
 * Corrects the stock clips towards a professional athlete's carriage: the
 * library's idle slumps (head forward, knees bent, hands in front of the
 * thighs) and its sprint curls the back with the head hanging. `loco` is the
 * locomotion mix being played and `weight` how much of the pose it owns.
 * Pitch only for the trunk, so each gait keeps its own sway and rhythm.
 */
export function carriage(pose: Map<Joint, T.Quaternion>, loco: { clip: string; weight: number }[], weight: number) {
  if (weight <= 0) return;
  let idle = 0;
  const want = { trunk: [0, 0, 0], neck: 0, head: 0, hold: 0 };
  let total = 0;
  for (const l of loco) {
    const c = CARRIAGE[l.clip as LocoClip];
    if (!c || l.weight <= 0) continue;
    total += l.weight;
    for (let i = 0; i < 3; i++) want.trunk[i]! += c.trunk[i]! * l.weight;
    want.neck += c.neck * l.weight;
    want.head += c.head * l.weight;
    want.hold += c.hold * l.weight;
    if (l.clip === "Idle_Loop") idle += l.weight;
  }
  if (total <= 0) return;
  const k = weight * (want.hold / total);
  const chain: [Joint, number][] = [
    ["Spine", want.trunk[0]! / total],
    ["Spine1", want.trunk[1]! / total],
    ["Spine2", want.trunk[2]! / total],
    ["Neck", want.neck / total],
  ];
  for (const [j, target] of chain) {
    const q = pose.get(j);
    if (!q) continue;
    turn(pose, j, tq.setFromAxisAngle(X_AXIS, -(lean(q) - target * deg) * k));
  }
  // Eyes level on the field ahead.
  const head = pose.get("Head");
  if (head) {
    const f = tv.copy(AHEAD).applyQuaternion(head),
      down = Math.atan2(-f.y, Math.hypot(f.x, f.z));
    turn(pose, "Head", tq.setFromAxisAngle(X_AXIS, -(down - (want.head / total) * deg) * k));
  }
  // Standing: arms hang relaxed at the sides, knees soft but not bent, feet under the hips.
  const s = weight * idle * 0.9;
  if (s <= 0) return;
  for (const side of ["Left", "Right"] as const) {
    const out = side === "Left" ? 1 : -1;
    // The athletes' left is +X (they face +Z).
    // Arms hang free of the sides, elbows in a relaxed 12 degree bend with the
    // forearm swinging forward, wrists straight and palms towards the thighs:
    // no twist from the aligned rest, where the palms face in. (The clip's own
    // forearm twist, made for its bent elbows, would turn the palms forward.)
    const upper = tv2.set(0.2 * out, -1, 0.07).normalize(),
      fore = new T.Vector3().copy(upper).applyAxisAngle(X_AXIS, -12 * deg),
      armQ = new T.Quaternion().setFromUnitVectors(DOWN, upper),
      foreQ = new T.Quaternion().setFromUnitVectors(DOWN, fore);
    pose.get(`${side}Arm`)?.slerp(armQ, s);
    pose.get(`${side}ForeArm`)?.slerp(foreQ, s);
    pose.get(`${side}Hand`)?.slerp(foreQ, s);
    const foot = pose.get(`${side}Foot`)!.clone(),
      toe = pose.get(`${side}ToeBase`)!.clone();
    aimBone(pose, `${side}UpLeg`, DOWN, tv2.set(0.035 * out, -1, -0.03).normalize(), s);
    const thigh = tv.copy(DOWN).applyQuaternion(pose.get(`${side}UpLeg`)!);
    aimBone(pose, `${side}Leg`, DOWN, new T.Vector3().copy(thigh).applyAxisAngle(X_AXIS, 5 * deg), s);
    // Feet keep their own placement on the turf (flat, toes as the clip turns them).
    pose.get(`${side}Foot`)!.copy(foot);
    pose.get(`${side}ToeBase`)!.copy(toe);
  }
}
/** Swings joint `j` (and what it carries) so its bone, `rest` at rest, points `to`, by share `k`. */
function aimBone(pose: Map<Joint, T.Quaternion>, j: Joint, rest: T.Vector3, to: T.Vector3, k: number) {
  const q = pose.get(j);
  if (!q) return;
  const from = new T.Vector3().copy(rest).applyQuaternion(q);
  turn(pose, j, power(new T.Quaternion().setFromUnitVectors(from, to), k).clone());
}

/** What the body should play this frame. Weights are per region, 0 = driver only. */
export interface MotionFrame {
  pose: Map<Joint, T.Quaternion>;
  /** Mid-hip position in the athlete's own frame, metres, scaled to this athlete. */
  hips: T.Vector3;
  lower: number;
  upper: number;
  /** Yaw (radians) the head and chest lead a turn by, ahead of the hips. */
  twist: number;
  /** Roll (radians) of the whole body into a curve. */
  lean: number;
}

/** Longest a stride may be stretched beyond the clip's own, before it would look like bounding. */
export const MAX_STRIDE = 1.45;

const LOCO: LocoClip[] = ["Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop"];
/** Fastest playback, in clip lengths per second, relative to normal speed. */
export const MAX_RATE = 1.7;

/**
 * One athlete's motion player: a locomotion blend (idle, walk, jog, sprint)
 * driven by ground speed, with phase kept continuous across blends, plus one
 * one-shot clip at a time (the throw, getting up, a fist pump) layered over it.
 */
export class MotionPlayer {
  private rigs: Rig[];
  private phase = 0;
  private idleTime = 0;
  private locoWeights = [1, 0, 0, 0];
  private poseA = new Map<Joint, T.Quaternion>();
  private poseB = new Map<Joint, T.Quaternion>();
  readonly frame: MotionFrame = { pose: new Map(), hips: new T.Vector3(), lower: 0, upper: 0, twist: 0, lean: 0 };
  /** Stride length relative to the clip's, set by `locomotion` so feet keep pace with the ground. */
  stride = 1;
  /** This player's own cadence and arm carriage: small, fixed, deterministic differences. */
  private cadence: number;
  private armSwing: number;
  constructor(
    private lib: MotionLibrary,
    /** This athlete's hip-to-ankle length, metres. */
    private leg: number,
    /** Any integer identifying the player; the same one always moves the same way. */
    variant = 0,
  ) {
    this.rigs = lib.libraries.map((l) => new Rig(l));
    let h = Math.imul(variant + 11, 2654435761) >>> 0;
    const next = () => ((h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0), (h >>> 8) / 16777216);
    this.cadence = 0.94 + next() * 0.12;
    this.armSwing = 0.85 + next() * 0.3;
    this.idleTime = next() * 3;
  }
  /** Seconds per cycle of the current moving blend. */
  private cycle() {
    let t = 0,
      w = 0;
    for (let i = 1; i < 4; i++) {
      t += this.locoWeights[i]! * this.lib.info.get(LOCO[i]!)!.duration;
      w += this.locoWeights[i]!;
    }
    return w > 0 ? t / w : 1;
  }
  private scale(lib: Library) {
    return this.leg / lib.leg;
  }
  /** Ground speed (m/s) each locomotion clip shows when played at normal rate on this athlete. */
  clipSpeed(clip: LocoClip) {
    const lib = this.lib.libraryOf.get(clip)!;
    return this.lib.info.get(clip)!.speed * this.scale(lib);
  }

  /**
   * Advances and poses the locomotion blend for ground speed `speed` (m/s).
   * Playback rate follows the speed so the stance foot keeps pace with the ground.
   */
  locomotion(dt: number, speed: number) {
    const walk = this.clipSpeed("Walk_Loop"),
      jog = this.clipSpeed("Jog_Fwd_Loop"),
      sprint = this.clipSpeed("Sprint_Loop");
    const target = [0, 0, 0, 0];
    if (speed < walk * 0.35) target[0] = 1;
    else if (speed < walk) {
      const u = (speed - walk * 0.35) / (walk * 0.65);
      target[0] = 1 - u;
      target[1] = u;
    } else if (speed < jog) {
      const u = (speed - walk) / (jog - walk);
      target[1] = 1 - u;
      target[2] = u;
    } else {
      const u = Math.min(1, (speed - jog) / Math.max(0.01, sprint - jog));
      target[2] = 1 - u;
      target[3] = u;
    }
    // Ease the weights so a change of pace is a few strides, not a cut.
    const k = Math.min(1, dt * 6);
    let total = 0;
    for (let i = 0; i < 4; i++) {
      this.locoWeights[i]! += (target[i]! - this.locoWeights[i]!) * k;
      total += this.locoWeights[i]!;
    }
    for (let i = 0; i < 4; i++) this.locoWeights[i]! /= total || 1;
    // One shared gait phase: cycles per second from the moving clips' weights.
    let rate = 0,
      moving = 0;
    for (let i = 1; i < 4; i++) {
      const clip = LOCO[i]!,
        info = this.lib.info.get(clip)!,
        w = this.locoWeights[i]!;
      if (w <= 0) continue;
      rate += (w * (speed / Math.max(0.05, this.clipSpeed(clip)))) / info.duration;
      moving += w;
    }
    // Feet stay planted by matching ground speed with cadence and stride together:
    // cadence rises up to a human sprint's (capped, and a little different per
    // player), and the stride lengthens for the rest, up to MAX_STRIDE.
    if (moving > 0) {
      const wanted = rate / moving,
        applied = Math.min(wanted, (MAX_RATE * this.cadence) / this.cycle());
      this.phase = (this.phase + dt * applied) % 1;
      const stride = Math.min(MAX_STRIDE, Math.max(1, wanted / Math.max(1e-6, applied)));
      this.stride += (stride - this.stride) * Math.min(1, dt * 8);
    } else this.stride += (1 - this.stride) * Math.min(1, dt * 8);
    this.idleTime += dt;
    return LOCO.map((clip, i) => {
      const info = this.lib.info.get(clip)!;
      const time = i === 0 ? this.idleTime % info.duration : (((this.phase + info.phase) % 1) * info.duration);
      return { clip, time, weight: this.locoWeights[i]! };
    });
  }

  /**
   * Poses `loco` (from `locomotion`) and, at `shotWeight`, the one-shot `shot`
   * at `shotTime`, and fills `frame`. Region weights are set by the caller.
   */
  pose(loco: { clip: string; time: number; weight: number }[] | null, shot: { clip: OneShot; time: number; weight: number } | null) {
    const out = this.frame;
    let have = false;
    if (loco) {
      const rig = this.rigOf(loco[0]!.clip);
      rig.pose(loco);
      rig.read(this.poseA);
      rig.hips(out.hips).multiplyScalar(this.scale(rig.lib));
      have = true;
    }
    if (shot && shot.weight > 0) {
      const rig = this.rigOf(shot.clip),
        info = this.lib.info.get(shot.clip)!;
      rig.pose([{ clip: shot.clip, time: Math.min(info.duration, Math.max(0, shot.time)), weight: 1 }]);
      rig.read(this.poseB);
      const hips = rig.hips(tv).multiplyScalar(this.scale(rig.lib));
      if (!have) {
        for (const [j, q] of this.poseB) (this.poseA.get(j) ?? this.poseA.set(j, new T.Quaternion()).get(j)!).copy(q);
        out.hips.copy(hips);
      } else {
        for (const [j, q] of this.poseB) this.poseA.get(j)!.slerp(q, shot.weight);
        out.hips.lerp(hips, shot.weight);
      }
      have = true;
    }
    if (have) {
      this.lengthen(this.poseA, loco ? this.stride : 1, loco && !shot ? this.armSwing : 1);
      if (loco) carriage(this.poseA, loco, shot ? 1 - shot.weight : 1);
      for (const [j, q] of this.poseA) (out.pose.get(j) ?? out.pose.set(j, new T.Quaternion()).get(j)!).copy(q);
    }
    return out;
  }

  /**
   * Scales leg swing (relative to the hips and knees) by `stride`, and arm swing
   * (relative to the chest) by `arms`, keeping each foot and hand's own angle
   * to its limb. A longer stride over the same cadence covers more ground.
   */
  private lengthen(pose: Map<Joint, T.Quaternion>, stride: number, arms: number) {
    if (Math.abs(stride - 1) < 1e-3 && Math.abs(arms - 1) < 1e-3) return;
    const knee = 1 + (stride - 1) * 0.6;
    for (const side of ["Left", "Right"] as const) {
      const hips = pose.get("Hips")!,
        up = pose.get(`${side}UpLeg`)!,
        leg = pose.get(`${side}Leg`)!,
        foot = pose.get(`${side}Foot`)!,
        toe = pose.get(`${side}ToeBase`)!;
      const legRel = tq.copy(up).invert().multiply(leg),
        footRel = new T.Quaternion().copy(leg).invert().multiply(foot),
        toeRel = new T.Quaternion().copy(foot).invert().multiply(toe);
      const upRel = new T.Quaternion().copy(hips).invert().multiply(up);
      up.copy(hips).multiply(power(upRel, stride));
      leg.copy(up).multiply(power(legRel, knee));
      foot.copy(leg).multiply(footRel);
      toe.copy(foot).multiply(toeRel);
      if (Math.abs(arms - 1) > 1e-3) {
        const chest = pose.get("Spine2")!,
          arm = pose.get(`${side}Arm`)!,
          fore = pose.get(`${side}ForeArm`)!,
          hand = pose.get(`${side}Hand`)!;
        const foreRel = new T.Quaternion().copy(arm).invert().multiply(fore),
          handRel = new T.Quaternion().copy(fore).invert().multiply(hand);
        arm.copy(chest).multiply(power(new T.Quaternion().copy(chest).invert().multiply(arm), arms));
        fore.copy(arm).multiply(foreRel);
        hand.copy(fore).multiply(handRel);
      }
    }
  }
  private rigOf(clip: string) {
    const lib = this.lib.libraryOf.get(clip)!;
    return this.rigs[this.lib.libraries.indexOf(lib)]!;
  }
}
