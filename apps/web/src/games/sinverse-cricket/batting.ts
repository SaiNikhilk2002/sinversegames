import { RELEASE_TICK, STEP, type ShotInput } from "@platform/engines/sinverse-cricket";
import { BAT, CH, RIG, clamp01, type BatPose, type Pose, type Vec3 } from "./animation";

/**
 * Batting animation (presentation only). A pure function of the match state:
 * where the ball is, the shot the engine was given (or, before a human swings,
 * the shot they have selected), and when the engine says the bat met the ball.
 * It writes a body pose and returns a bat pose; the rig then puts both hands on
 * the bat. Nothing here feeds back into the match.
 *
 * Root-local axes, as in animation.ts: +x towards the bowler, +z the way the
 * chest faces (the off side for this right-hander), +y up. The root stands on
 * the popping crease (the engine's batting line). The left foot is the front foot.
 *
 * - Stance: the batter takes guard behind the crease and strides forward to the
 *   ball, or back towards the stumps, landing where the engine makes contact.
 * - Swing: a two-segment pendulum. The arms turn about the lead shoulder, the
 *   bat a further wrist angle, both in the swing plane the shot sets. The arms
 *   pull through first and the wrists release last, so the bat is fastest at
 *   the ball, and the swing is pinned so the bat's sweet spot is exactly on
 *   the engine's contact point on the contact tick.
 * - Feet move only while lifted, so planted feet can't slide. The pelvis, not
 *   the bat, gives way if the hands would over-reach.
 */

export type BattingShot =
  | "leave"
  | "forward-defence"
  | "back-foot-defence"
  | "straight-drive"
  | "off-drive"
  | "cover-drive"
  | "on-drive"
  | "lofted-drive"
  | "pull"
  | "hook"
  | "square-cut"
  | "late-cut"
  | "sweep"
  | "reverse-sweep"
  | "flick"
  | "glance";
export type ContactKind = "pending" | "clean" | "inside-edge" | "outside-edge" | "miss" | "beaten";

/**
 * The batting shot shown for an engine shot. The engine has eight shot kinds;
 * their aim and footwork pick the cricket shot a viewer would call it. The
 * outcome is always the engine's.
 */
export function battingShot(plan: Pick<ShotInput, "kind" | "direction" | "foot"> | null): BattingShot {
  if (!plan) return "leave";
  const { kind, direction: dir, foot } = plan;
  switch (kind) {
    case "defend":
      return foot < -0.05 ? "back-foot-defence" : dir < -75 ? "glance" : "forward-defence";
    case "straight":
      return dir > 14 ? "off-drive" : dir < -14 ? "on-drive" : "straight-drive";
    case "cover":
      return "cover-drive";
    case "on-drive":
      return dir < -75 ? "glance" : dir < -40 ? "flick" : "on-drive";
    case "loft":
      return "lofted-drive";
    case "pull":
      return dir <= -85 ? "hook" : "pull";
    case "cut":
      return dir > 100 ? "late-cut" : "square-cut";
    case "sweep":
      return dir > 20 ? "reverse-sweep" : "sweep";
  }
}

/** A batter's own way of doing things. Deterministic from the player, so replays match. */
export interface BatterStyle {
  /** Stance width multiplier. */
  width: number;
  /** Knee bend in the stance (metres the hips drop). */
  crouch: number;
  /** Front foot opened towards the off side (metres). */
  open: number;
  /** How far back from the crease guard is taken (metres, added to the usual). */
  depth: number;
  /** Backlift height 0..1, and how far it points to gully rather than over the stumps 0..1. */
  lift: number;
  gully: number;
  /** 0 still, 1 back and across, 2 forward press. */
  trigger: 0 | 1 | 2;
  /** Taps the bat while waiting. */
  tap: boolean;
  /** Follow-through height multiplier. */
  finish: number;
}
export function batterStyle(seed: number): BatterStyle {
  let h = (Math.imul(seed + 1, 2654435761) ^ 0x9e3779b9) >>> 0;
  const next = () => ((h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x6d2b79f5) >>> 0), h / 4294967296);
  return {
    width: 0.9 + next() * 0.22,
    crouch: next() * 0.045,
    open: next() * 0.09 - 0.02,
    depth: next() * 0.12 - 0.06,
    lift: next(),
    gully: next(),
    trigger: Math.floor(next() * 3) as 0 | 1 | 2,
    tap: next() > 0.45,
    finish: 0.85 + next() * 0.3,
  };
}

type Step = "front" | "back" | "sweep";
type Plane = "vertical" | "horizontal" | "low";
interface Spec {
  step: Step;
  /** Front-foot shots: how far the contact is in front of the front ankle (metres). */
  lead: number;
  /** Back-foot shots: metres the back foot goes back, and across to the off side. */
  back: number;
  across: number;
  plane: Plane;
  /** Blade tilt at impact (radians): + hands ahead of the blade, - blade ahead (lofting). */
  ahead: number;
  /** Size of the swing: 1 a full drive, about 0.35 a defensive push. */
  arc: number;
  /** Arms and wrists through the finish (degrees, through the target side). */
  followA: number;
  followB: number;
  /** Hands rise this much through the finish (metres). */
  lift: number;
  /** Share of the way from the back foot to the front foot that the weight is at impact. */
  weight: number;
  /** Body at impact: hip drop, forward bend, lean (+ away from the bowler), hip turn, chest turn on the hips. */
  hipY: number;
  pitch: number;
  roll: number;
  yaw: number;
  chest: number;
  /** Body at the finish. */
  yawF: number;
  chestF: number;
  pitchF: number;
  /** Seconds the finish is held. */
  hold: number;
  /** Wrist roll after impact (radians about the bat). */
  roll2: number;
}
const S = (s: Partial<Spec> & Pick<Spec, "step" | "plane">): Spec => ({
  lead: 0.08,
  back: 0.14,
  across: 0.12,
  ahead: 0.12,
  arc: 1,
  followA: -128,
  followB: -58,
  lift: 0.12,
  weight: 0.72,
  hipY: -0.16,
  pitch: 0.48,
  roll: -0.12,
  yaw: 0.12,
  chest: 0.05,
  yawF: 0.42,
  chestF: 0.32,
  pitchF: 0.3,
  hold: 0.5,
  roll2: 0,
  ...s,
});
export const SHOTS: Record<Exclude<BattingShot, "leave">, Spec> = {
  "forward-defence": S({ step: "front", plane: "vertical", lead: 0.0, ahead: 0.36, arc: 0.34, followA: -6, followB: -10, lift: 0, weight: 0.74, hipY: -0.19, pitch: 0.55, roll: -0.12, yaw: 0.02, chest: 0.28, yawF: 0.03, chestF: 0.28, pitchF: 0.52, hold: 0.7 }),
  "back-foot-defence": S({ step: "back", plane: "vertical", back: 0.16, across: 0.14, ahead: 0.22, arc: 0.34, followA: -6, followB: -10, lift: 0, weight: 0.25, hipY: 0.02, pitch: 0.24, roll: 0.04, yaw: 0.06, chest: 0.26, yawF: 0.06, chestF: 0.26, pitchF: 0.26, hold: 0.7 }),
  "straight-drive": S({ step: "front", plane: "vertical", lead: 0.08, yaw: 0.16, yawF: 0.4 }),
  "off-drive": S({ step: "front", plane: "vertical", lead: 0.08, yaw: -0.02, chest: 0.0, yawF: 0.22, chestF: 0.22, followA: -112, followB: -48 }),
  "cover-drive": S({ step: "front", plane: "vertical", lead: 0.06, ahead: 0.14, yaw: -0.1, chest: -0.02, pitch: 0.46, followA: -122, followB: -52, yawF: 0.24, chestF: 0.26 }),
  "on-drive": S({ step: "front", plane: "vertical", lead: 0.1, ahead: 0.1, yaw: 0.36, chest: 0.1, yawF: 0.66, chestF: 0.36 }),
  "lofted-drive": S({ step: "front", plane: "vertical", lead: 0.12, ahead: -0.24, followA: -162, followB: -90, lift: 0.28, hipY: -0.12, pitch: 0.34, roll: -0.1, yaw: 0.26, yawF: 0.56, chestF: 0.4, pitchF: 0.08, hold: 0.7 }),
  pull: S({ step: "back", plane: "horizontal", back: 0.16, across: 0.2, ahead: 0, followA: -138, followB: -40, lift: 0.1, weight: 0.32, hipY: 0.03, pitch: 0.12, roll: 0.06, yaw: 0.6, chest: 0.16, yawF: 1.15, chestF: 0.42, pitchF: 0.06, roll2: 0.5 }),
  hook: S({ step: "back", plane: "horizontal", back: 0.2, across: 0.16, ahead: -0.05, followA: -150, followB: -45, lift: 0.24, weight: 0.25, hipY: 0.04, pitch: 0.04, roll: 0.2, yaw: 0.76, chest: 0.2, yawF: 1.4, chestF: 0.5, pitchF: -0.02, roll2: 0.4 }),
  "square-cut": S({ step: "back", plane: "horizontal", back: 0.1, across: 0.3, ahead: 0.05, followA: -110, followB: -40, lift: 0.18, weight: 0.35, hipY: -0.02, pitch: 0.3, roll: 0.05, yaw: -0.16, chest: -0.05, yawF: 0.16, chestF: 0.12, pitchF: 0.24, roll2: -0.4 }),
  "late-cut": S({ step: "back", plane: "horizontal", back: 0.14, across: 0.3, ahead: 0.12, arc: 0.6, followA: -40, followB: -32, lift: 0.04, weight: 0.3, hipY: -0.04, pitch: 0.38, roll: 0.04, yaw: -0.26, chest: -0.08, yawF: -0.18, chestF: -0.04, pitchF: 0.36, hold: 0.5, roll2: -0.3 }),
  sweep: S({ step: "sweep", plane: "low", lead: 0.22, ahead: 0, followA: -130, followB: -50, lift: 0.18, weight: 0.55, hipY: -0.4, pitch: 0.56, roll: -0.05, yaw: 0.16, chest: 0.06, yawF: 0.62, chestF: 0.3, pitchF: 0.42 }),
  "reverse-sweep": S({ step: "sweep", plane: "low", lead: 0.2, ahead: 0, followA: -120, followB: -55, lift: 0.14, weight: 0.55, hipY: -0.38, pitch: 0.54, roll: -0.03, yaw: -0.04, chest: -0.16, yawF: -0.38, chestF: -0.25, pitchF: 0.4 }),
  flick: S({ step: "front", plane: "vertical", lead: 0.1, ahead: 0.16, followA: -100, followB: -85, lift: 0.1, yaw: 0.1, chest: 0.06, yawF: 0.56, chestF: 0.3, roll2: 0.6 }),
  glance: S({ step: "front", plane: "vertical", lead: 0.02, ahead: 0.26, arc: 0.5, followA: -20, followB: -36, lift: 0, hipY: -0.08, pitch: 0.42, yaw: 0.1, chest: 0.08, yawF: 0.2, chestF: 0.12, pitchF: 0.42, hold: 0.55, roll2: 0.35 }),
};

// ---------------------------------------------------------------------------
// Small vector helpers.
// ---------------------------------------------------------------------------
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const unit = (v: Vec3): Vec3 => {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const mix = (a: Vec3, b: Vec3, u: number): Vec3 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (t: number) => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 2;
/** Rotation about +y; positive turns +z towards +x (the hips' yaw channel). */
const rotY = (v: Vec3, a: number, about: Vec3 = [0, 0, 0]): Vec3 => {
  const c = Math.cos(a),
    s = Math.sin(a),
    x = v[0] - about[0],
    z = v[2] - about[2];
  return [about[0] + x * c + z * s, v[1], about[2] - x * s + z * c];
};
/** Rotates `v` about unit axis `k` by `a` (Rodrigues). */
const rotAxis = (v: Vec3, k: Vec3, a: number): Vec3 => {
  const c = Math.cos(a),
    s = Math.sin(a),
    kv = cross(k, v),
    kd = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
};
/** Euler XYZ (three.js order: Rx·Ry·Rz) applied to a vector. */
const euler = (v: Vec3, x: number, y: number, z: number): Vec3 => {
  let [a, b, c] = v;
  [a, b] = [a * Math.cos(z) - b * Math.sin(z), a * Math.sin(z) + b * Math.cos(z)];
  [a, c] = [a * Math.cos(y) + c * Math.sin(y), -a * Math.sin(y) + c * Math.cos(y)];
  [b, c] = [b * Math.cos(x) - c * Math.sin(x), b * Math.sin(x) + c * Math.cos(x)];
  return [a, b, c];
};
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// The body.
// ---------------------------------------------------------------------------

interface Body {
  hip: Vec3;
  pitch: number;
  yaw: number;
  roll: number;
  chestX: number;
  chestY: number;
  front: Vec3;
  back: Vec3;
}
/** Where the rig puts a point given in chest space, for this body (same chain as applyPose). */
function chestPoint(b: Body, local: Vec3): Vec3 {
  const sx = b.chestX * 0.5,
    sy = b.chestY * 0.5;
  const inChest = add([0, RIG.chest, 0], euler(local, sx, sy, 0));
  const inSpine = add([0, RIG.spine, 0], euler(inChest, sx, sy, 0));
  return add(b.hip, euler(inSpine, b.pitch, b.yaw, b.roll));
}
const shoulder = (b: Body, left: boolean) => chestPoint(b, [left ? RIG.shoulderSide : -RIG.shoulderSide, RIG.shoulderUp, 0]);
const headOf = (b: Body) => chestPoint(b, [0, RIG.shoulderUp + 0.2, 0.04]);

const ANKLE = RIG.ankle;
/** Comfortable reach from shoulder to the middle of the hand: a little short of straight. */
const REACH = RIG.upperArm + RIG.forearm + RIG.hand - 0.035;
/** Closest a hand comfortably comes to its own shoulder. */
const CLOSEST = 0.22;

// ---------------------------------------------------------------------------
// Inputs and the frame.
// ---------------------------------------------------------------------------

export interface BattingInput {
  /** Presentation tick (fractional between ticks in replays). */
  tick: number;
  /** The shot: the engine's, or before a human swings, the selected shot. Null: no stroke (a leave). */
  plan: Pick<ShotInput, "kind" | "direction" | "foot" | "power" | "face"> | null;
  /** Tick the swing was committed in the engine, or null if it hasn't been (yet). */
  shotTick: number | null;
  /** Actual contact tick when the bat met the ball, otherwise the expected arrival at the bat. */
  contactTick: number;
  contact: ContactKind;
  /** Contact point (or, without contact, where the bat meets the ball's line), root space. */
  impact: Vec3;
  /** Where the batter is looking, root space. */
  look: Vec3;
  style: BatterStyle;
  /** A live human hasn't swung and the ball has gone past: the bat comes up out of the way now. */
  lateLeave?: boolean;
}
export interface BattingFrame {
  bat: BatPose;
  shot: BattingShot;
  /** Name of the phase, for evidence and tests. */
  phase: "guard" | "trigger" | "backlift" | "stride" | "downswing" | "contact" | "follow" | "hold" | "relax";
}

/**
 * How far down the swing can come before the stroke is committed in the engine.
 * A batter commits late: the swing runs on anticipation and only checks if no
 * stroke is played.
 */
const HOLD_ATTACK = 0.8,
  HOLD_DEFENCE = 0.72;
/** Ticks from release for the ball to reach the bat, by bowling style, before it is measured. */
export const FLIGHT_TICKS = { fast: 60, medium: 82, spin: 100 } as const;

/** A foot step: still, then lifted over [lift, plant] on a low arc, then still again. */
function step(from: Vec3, to: Vec3, lift: number, plant: number, t: number, height = 0.07): Vec3 {
  if (t <= lift) return from;
  if (t >= plant) return to;
  const u = (t - lift) / (plant - lift),
    p = mix(from, to, smooth(u));
  p[1] = ANKLE + Math.sin(Math.PI * u) * height;
  return p;
}
function blendBat(a: BatPose, b: BatPose, u: number): BatPose {
  return { grip: mix(a.grip, b.grip, u), dir: unit(mix(a.dir, b.dir, u)), face: unit(mix(a.face, b.face, u)) };
}

/**
 * The batter this tick: writes the body into `out` and returns the bat.
 * Every channel the batter uses is written; hands are set by the rig from the bat.
 */
export function batting(i: BattingInput, out: Pose): BattingFrame {
  const st = i.style,
    shot = battingShot(i.plan),
    spec = shot === "leave" ? null : SHOTS[shot],
    E = i.contactTick,
    d = (i.tick - E) * STEP,
    r = (i.tick - RELEASE_TICK) * STEP,
    F = Math.max(0.3, (E - RELEASE_TICK) * STEP),
    dTop = -Math.min(0.26, F * 0.45),
    I = i.impact;

  // ---- guard: well behind the crease, side-on ---------------------------------------
  const centre = -0.5 - st.depth,
    w = st.width;
  let front0: Vec3 = [centre + 0.23 * w, ANKLE, 0.02 + st.open],
    back0: Vec3 = [centre - 0.23 * w, ANKLE, -0.02];
  // Trigger movement around the release.
  let triggerX = 0;
  if (st.trigger === 1) {
    back0 = step(back0, add(back0, [-0.05, 0, 0.07]), -0.24, -0.08, r, 0.03);
    front0 = step(front0, add(front0, [-0.03, 0, 0.05]), -0.12, 0.03, r, 0.025);
    triggerX = -0.02 * smooth((r + 0.2) / 0.2);
  } else if (st.trigger === 2) {
    front0 = step(front0, add(front0, [0.06, 0, 0.01]), -0.2, -0.05, r, 0.025);
    triggerX = 0.02 * smooth((r + 0.2) / 0.15);
  }
  // Where the feet finish: decided by the shot and where the engine meets the ball.
  const lineZ = (offset: number, from: number) => Math.max(from - 0.14, Math.min(from + 0.4, I[2] - offset));
  const frontLand: Vec3 = spec && spec.step !== "back" ? [Math.max(front0[0] + 0.1, Math.min(front0[0] + 0.85, I[0] - spec.lead)), ANKLE, lineZ(spec.step === "sweep" ? 0.42 : 0.3, front0[2])] : [front0[0] + 0.12, ANKLE, lineZ(0.34, front0[2])];
  const backLand: Vec3 = spec?.step === "back" ? [back0[0] - spec.back, ANKLE, back0[2] + spec.across + Math.max(-0.1, Math.min(0.2, (I[2] - 0.6) * 0.6))] : back0;
  const pullOpen = shot === "pull" || shot === "hook";
  const frontAfterBack: Vec3 = spec?.step === "back" ? (pullOpen ? add(front0, [-0.1, 0, -0.08]) : add(front0, [-spec.back * 0.5, 0, spec.across * 0.5])) : front0;

  /** The body at time `t` (seconds from contact), before any reach correction. */
  const bodyAt = (t: number): Body => {
    let front = front0,
      back = back0;
    if (spec && spec.step !== "back") {
      const lift = -Math.min(0.4, F - 0.04),
        plant = Math.min(-0.1, lift + 0.22);
      front = step(front0, frontLand, lift, plant, t, spec.step === "sweep" ? 0.05 : 0.08);
    } else if (spec) {
      const lift = -Math.min(0.36, F - 0.06),
        plant = Math.min(-0.13, lift + 0.18);
      back = step(back0, backLand, lift, plant, t, 0.06);
      front = step(front0, frontAfterBack, plant - 0.02, plant + 0.14, t, 0.04);
    } else {
      const lift = -Math.min(0.36, F - 0.06);
      front = step(front0, frontLand, lift, lift + 0.2, t, 0.05);
    }
    const between = (k: number) => back[0] + (front[0] - back[0]) * k;
    const load = smooth((r + 0.15) / Math.max(0.1, F + dTop + 0.15));
    const holdEnd = 0.32 + (spec?.hold ?? 0.6),
      relax = smooth((t - holdEnd) / 0.8);
    let hipX = between(0.5) + triggerX - 0.02 * load,
      hipY = 0.875 - st.crouch - 0.015 * smooth((r + 0.6) / 0.5),
      pitch = 0.3,
      roll = 0,
      yaw = 0,
      chestY = 0.22 + 0.08 * load;
    if (spec) {
      // Weight and bend arrive just before the ball, so the head is still at contact.
      const into = smooth((t - (dTop - 0.05)) / (-(dTop - 0.05) - 0.06)),
        hipsTurn = smooth((t + 0.16) / 0.16), // hips lead...
        chestTurn = smooth((t + 0.09) / 0.09), // ...the shoulders follow
        after = easeOut(t / 0.35);
      hipX = lerp(hipX, between(spec.weight), into);
      hipY += spec.hipY * into;
      pitch = lerp(pitch, spec.pitch, into);
      roll = spec.roll * into;
      yaw = spec.yaw * hipsTurn;
      chestY = lerp(chestY, spec.chest, chestTurn);
      if (t > 0) {
        yaw = lerp(spec.yaw, spec.yawF, after);
        chestY = lerp(spec.chest, spec.chestF, after);
        pitch = lerp(spec.pitch, spec.pitchF, after);
        hipX = lerp(hipX, between(Math.min(0.85, spec.weight + 0.12)), after);
      }
      hipY = lerp(hipY, 0.93, relax);
      pitch = lerp(pitch, 0.12, relax);
      roll = lerp(roll, 0, relax);
      chestY = lerp(chestY, 0.15, relax);
      yaw = lerp(yaw, yaw * 0.6, relax);
      hipX = lerp(hipX, between(0.5), relax);
    } else {
      const watch = smooth((t - dTop) / 0.2);
      pitch = lerp(pitch, 0.24, watch);
      hipX = lerp(hipX, between(0.55), watch);
      hipY = lerp(hipY, 0.93, relax);
    }
    return { hip: [hipX, hipY, ((front[2] + back[2]) / 2) * 0.6], pitch, yaw, roll, chestX: 0.12, chestY, front, back };
  };

  const body = bodyAt(d);
  let phase: BattingFrame["phase"] = r < -0.25 ? "guard" : r < 0.05 ? "trigger" : "backlift";
  if (spec && d > -Math.min(0.4, F - 0.04) && d < -0.1) phase = "stride";
  const holdEnd = 0.32 + (spec?.hold ?? 0.6),
    relax = smooth((d - holdEnd) / 0.8);

  // ---- the bat --------------------------------------------------------------------------
  // Stance, backlift and carry poses are relative to the hips.
  const hx: Vec3 = [body.hip[0], 0, 0];
  const stanceBat: BatPose = { grip: add([0.02, 0.94, 0.3], hx), dir: unit([-0.06, -0.96, 0.1]), face: [1, 0, 0] };
  if (st.tap && r < -0.75) stanceBat.grip[1] += 0.035 * Math.max(0, Math.sin(((i.tick * STEP * 1.2) % 1) * Math.PI * 2));
  // Top of the backlift: hands by the back hip, the bat angled up towards slip
  // (or straighter, over the stumps), the face open.
  const top: BatPose = {
    grip: add([-0.12 - 0.05 * st.lift, 1.0 + 0.14 * st.lift, 0.2], hx),
    dir: unit([-0.78, 0.4 + 0.32 * st.lift, -0.16 + 0.42 * st.gully]),
    face: unit([0.15, 0.35, 0.92]),
  };
  const carry: BatPose = { grip: add([0.08, 0.98, 0.24], hx), dir: unit([-0.12, -0.95, 0.18]), face: unit([1, 0, 0.2]) };
  const up = smooth((r + 0.18) / Math.max(0.12, F + dTop + 0.18)); // backlift, peaking at the top
  const lifted = blendBat(stanceBat, top, up);

  let bat: BatPose,
    pinned: BatPose | null = null;
  if (!spec || i.lateLeave) {
    // A leave: the bat goes up and away over the shoulder as the ball arrives, then comes down.
    const leaveBat: BatPose = { grip: add([-0.04, 1.5, 0.16], hx), dir: unit([-0.32, 0.9, -0.28]), face: unit([0.3, 0.2, 0.93]) };
    const leaving = i.lateLeave ? smooth(d / 0.14) : smooth((d - dTop) / Math.max(0.12, -dTop));
    bat = blendBat(blendBat(lifted, leaveBat, leaving), carry, relax);
    if (i.lateLeave) phase = d > holdEnd ? "relax" : "hold";
  } else {
    // Swing plane from the shot: towards the target, with the blade's angle at impact.
    const psi = (i.plan!.direction * Math.PI) / 180,
      T: Vec3 = [Math.cos(psi), 0, Math.sin(psi)];
    let D: Vec3;
    if (spec.plane === "vertical") D = unit(add([0, -Math.cos(spec.ahead), 0], T, -Math.sin(spec.ahead)));
    else {
      // A flat bat across the line, its toe out in front of the batter.
      let side = unit(cross([0, 1, 0], T));
      if (dot(side, [0.5, 0, 0.85]) < 0) side = scale(side, -1);
      D = unit(add(side, [0, -1, 0], spec.plane === "low" ? 0.55 : 0.18));
    }
    const B = unit(add(scale(T, -1), D, dot(T, D))), // in the plane, away from the target
      N = unit(cross(D, B)); // turning about +N takes the bat from D towards B
    // Pin the sweet spot on the ball; an edge puts the edge of the blade there instead.
    const outward = N[2] >= 0 ? N : scale(N, -1),
      edge = i.contact === "outside-edge" ? -0.055 : i.contact === "inside-edge" ? 0.055 : 0,
      sweet = add(I, outward, edge),
      hands = add(sweet, D, -BAT.sweet);
    // The arms turn about the lead shoulder as it is at impact.
    const atImpact = bodyAt(0),
      pivot = shoulder(atImpact, true),
      arm = sub(hands, pivot);
    // Before impact the swing lags the hips' turn; after it, it wraps round with them.
    const turn = (v: Vec3, by: number) => rotY(v, by, atImpact.hip);
    const swingAt = (alpha: number, beta: number, twist: number, by: number, raise = 0): BatPose => {
      const a = alpha * DEG,
        t = (alpha + beta) * DEG;
      const grip = add(turn(add(pivot, rotAxis(arm, N, a)), by), [0, raise, 0]);
      const dir = rotY(rotAxis(D, N, t), by);
      // The face looks along the swing; twist opens or rolls it about the bat.
      const f = rotY(rotAxis(scale(B, -1), N, t), by);
      const n = rotY(N, by);
      return { grip, dir, face: unit(add(scale(f, Math.cos(twist)), n, Math.sin(twist))) };
    };
    pinned = swingAt(0, 0, 0, 0);
    const natural = clamp01((d - dTop) / -dTop),
      hold = spec.arc < 0.5 ? HOLD_DEFENCE : HOLD_ATTACK;
    let s: number;
    if (i.shotTick === null) s = Math.min(natural, hold);
    else {
      const dS = (i.shotTick - E) * STEP,
        sS = Math.min(clamp01((dS - dTop) / -dTop), hold);
      s = d <= dS ? Math.min(natural, hold) : dS < 0 ? sS + (1 - sS) * clamp01((d - dS) / -dS) : clamp01(sS + (1 - sS) * ((d - dS) / 0.06));
    }
    // A flat bat comes down from the high backlift: less arm round the body, more wrist.
    // The top of the downswing: the bat about 45 degrees above horizontal, pointing back.
    const a0 = (spec.plane === "vertical" ? 70 : 46) * spec.arc,
      b0 = (spec.plane === "vertical" ? 62 : 95) * spec.arc,
      sA = 0.34;
    if (d <= 0 || s < 1) {
      const by = body.yaw - spec.yaw;
      if (s < sA) {
        // From the top of the backlift into the swing plane.
        bat = blendBat(lifted, swingAt(a0, b0, 0.55, by), smooth(s / sA));
        phase = s > 0 ? "downswing" : phase;
      } else {
        // The arms pull through first and the wrists release last: fastest at the ball.
        const u = (s - sA) / (1 - sA);
        bat = swingAt(a0 * (1 - u ** 1.4), b0 * (1 - u ** 2.6), 0.55 * (1 - u ** 1.6), by);
        phase = u >= 1 ? "contact" : "downswing";
      }
    } else {
      // Follow-through through the target, the hands rising and the swing turning
      // with the hips. An edge jars it short; a defensive push barely moves.
      const jar = i.contact === "inside-edge" || i.contact === "outside-edge" ? 0.55 : 1,
        f = easeOut(d / 0.24) * jar,
        twist = spec.roll2 * easeOut(d / 0.22) + (jar < 1 ? (i.contact === "outside-edge" ? 0.6 : -0.6) * Math.exp(-d / 0.08) : 0);
      // A flat bat wraps round with the hips less, or the lead arm would have to fold behind the neck.
      const wrap = spec.plane === "vertical" ? 1 : 0.5;
      bat = swingAt(spec.followA * st.finish * f, spec.followB * f, twist, (body.yaw - spec.yaw) * wrap, spec.lift * st.finish * easeOut(d / 0.36));
      phase = d < 0.3 ? "follow" : d < holdEnd ? "hold" : "relax";
    }
    bat = blendBat(bat, carry, relax);
  }

  // ---- reach ---------------------------------------------------------------------------------
  // At contact the bat is where the engine says, so the pelvis gives way: solved
  // once for the contact pose and eased in through the downswing, so the body
  // never jerks. Away from contact the bat may shift a little instead, so both
  // hands always hold it (arms can't reach behind the neck or fold into a shoulder).
  const reach = (b: Body, held: BatPose, moveBat: boolean): BatPose => {
    const lowest = Math.min(b.front[0], b.back[0]) - 0.05,
      highest = Math.max(b.front[0], b.back[0]) + 0.12;
    for (let n = 0; n < 6; n++) {
      let moved = false;
      for (const left of [true, false]) {
        const hand = left ? held.grip : add(held.grip, held.dir, BAT.bottom),
          gap = sub(hand, shoulder(b, left)),
          over = len(gap) - REACH,
          under = len(gap) - CLOSEST;
        if (over <= 0 && under >= 0) continue;
        const k = (over > 0 ? Math.min(over, 0.25) : Math.max(under, -0.25)) / Math.max(1e-3, len(gap));
        if (moveBat && !left) {
          // The bottom hand turns the handle about the top hand, as wrists do.
          const bottom = add(hand, gap, -k);
          held = { ...held, dir: unit(sub(bottom, held.grip)) };
        } else if (moveBat) held = { ...held, grip: add(held.grip, gap, -k) };
        else {
          b.hip[0] = Math.max(lowest, Math.min(highest, b.hip[0] + gap[0] * k));
          b.hip[1] = Math.max(0.45, b.hip[1] + Math.min(0, gap[1]) * k);
          b.hip[2] += gap[2] * k * 0.8;
        }
        moved = true;
      }
      if (!moved) break;
    }
    return held;
  };
  if (pinned) {
    const atContact = bodyAt(0),
      before: Vec3 = [...atContact.hip];
    reach(atContact, pinned, false);
    const shift = sub(atContact.hip, before),
      w = smooth((d - dTop) / -dTop) * (1 - relax);
    body.hip = add(body.hip, shift, w);
  }
  bat = reach(body, bat, d < -0.06 || d > 0.04);
  if (d >= -0.06 && d <= 0.04) reach(body, bat, false);

  // ---- write the body ----------------------------------------------------------------------
  out[CH.hipX] = body.hip[0];
  out[CH.hipY] = body.hip[1];
  out[CH.hipZ] = body.hip[2];
  out[CH.pitch] = body.pitch;
  out[CH.yaw] = body.yaw;
  out[CH.roll] = body.roll;
  out[CH.chestX] = body.chestX;
  out[CH.chestY] = body.chestY;
  out[CH.chestZ] = 0;
  out[CH.lFootX] = body.front[0];
  out[CH.lFootY] = body.front[1];
  out[CH.lFootZ] = body.front[2];
  out[CH.rFootX] = body.back[0];
  out[CH.rFootY] = body.back[1];
  out[CH.rFootZ] = body.back[2];
  out[CH.lToe] = 0;
  out[CH.rToe] = spec?.step === "sweep" ? -0.9 * smooth((d + 0.2) / 0.2) * (1 - relax) : 0;

  // ---- head: eyes on the ball and level ------------------------------------------------------
  const head = headOf(body),
    toLook = sub(i.look, head),
    wantYaw = Math.atan2(toLook[0], toLook[2]),
    down = Math.atan2(-toLook[1], Math.hypot(toLook[0], toLook[2]));
  out[CH.headY] = Math.max(-1.3, Math.min(1.55, wantYaw - body.yaw - body.chestY));
  out[CH.headX] = Math.max(-0.75, Math.min(0.95, down - body.pitch - body.chestX));
  out[CH.headZ] = -body.roll * 0.9;

  return { bat, shot, phase };
}

const bodyOf = (p: Pose): Body => ({ hip: [p[CH.hipX]!, p[CH.hipY]!, p[CH.hipZ]!], pitch: p[CH.pitch]!, yaw: p[CH.yaw]!, roll: p[CH.roll]!, chestX: p[CH.chestX]!, chestY: p[CH.chestY]!, front: [0, 0, 0], back: [0, 0, 0] });
/** Head and shoulder positions for a body pose, as the rig places them (root space). */
export const headPosition = (p: Pose): Vec3 => headOf(bodyOf(p));
export const shoulderPosition = (p: Pose, left: boolean): Vec3 => shoulder(bodyOf(p), left);
