import {
  CREASE_Z,
  RELEASE_TICK,
  SHOT_HEIGHTS,
  STEP,
  type Dismissal,
  type Fielder,
  type Outcome,
  type ShotKind,
  type Variation,
} from "@platform/engines/sinverse-cricket";

/**
 * Pure animation layer for Sinverse Cricket: which clip each actor plays and
 * what its joints do. It only reads simulation state (ticks, positions,
 * actions, outcomes) and has no Three.js or DOM dependency. Nothing here can
 * feed back into the match.
 *
 * Root-local axes: +z is the way the chest faces, +x is the actor's left, +y up.
 * A pose stores hip and spine rotations plus hand and foot targets; the rig
 * solves the limbs with two-bone IK, so contact points stay where they're put.
 */

export const RIG = {
  hipY: 0.96,
  hipJointDrop: 0.05,
  hipSide: 0.095,
  thigh: 0.41,
  shin: 0.41,
  ankle: 0.09,
  spine: 0.12,
  chest: 0.18,
  shoulderUp: 0.2,
  shoulderSide: 0.2,
  upperArm: 0.29,
  forearm: 0.26,
  /** Wrist to the centre of the closed hand. */
  hand: 0.07,
} as const;

/** Distances along the bat from the top (upper) hand towards the toe. */
export const BAT = { top: 0, bottom: 0.11, sweet: 0.62, toe: 0.86 } as const;

// Pose channels.
export const CH = {
  hipX: 0,
  hipY: 1,
  hipZ: 2,
  pitch: 3,
  yaw: 4,
  roll: 5,
  chestX: 6,
  chestY: 7,
  chestZ: 8,
  headX: 9,
  headY: 10,
  headZ: 11,
  lHandX: 12,
  lHandY: 13,
  lHandZ: 14,
  rHandX: 15,
  rHandY: 16,
  rHandZ: 17,
  lFootX: 18,
  lFootY: 19,
  lFootZ: 20,
  rFootX: 21,
  rFootY: 22,
  rFootZ: 23,
  lToe: 24,
  rToe: 25,
} as const;
export const CHANNELS = 26;
export type Pose = Float32Array;
type Patch = Partial<Record<keyof typeof CH, number>>;

const STAND: Patch = {
  hipY: RIG.hipY,
  lHandX: 0.25,
  lHandY: 0.86,
  lHandZ: 0.05,
  rHandX: -0.25,
  rHandY: 0.86,
  rHandZ: 0.05,
  lFootX: 0.11,
  lFootY: RIG.ankle,
  rFootX: -0.11,
  rFootY: RIG.ankle,
};
export function makePose(patch: Patch = {}): Pose {
  const p = new Float32Array(CHANNELS);
  for (const [k, v] of Object.entries({ ...STAND, ...patch })) p[CH[k as keyof typeof CH]] = v as number;
  return p;
}
const ease = (t: number) => t * t * (3 - 2 * t);
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export type Key = [time: number, pose: Pose];
export interface Clip {
  keys: Key[];
  loop?: number;
}
const clip = (keys: [number, Patch][], loop?: number): Clip => ({
  keys: keys.map(([t, patch]) => [t, makePose(patch)]),
  loop,
});

/** Samples a clip into `out` (smoothstep between keys, clamped or looped). */
export function sampleClip(c: Clip, time: number, out: Pose): Pose {
  const keys = c.keys;
  let t = time;
  if (c.loop) t = ((t % c.loop) + c.loop) % c.loop;
  if (t <= keys[0]![0]) out.set(keys[0]![1]);
  else if (t >= keys[keys.length - 1]![0]) out.set(keys[keys.length - 1]![1]);
  else
    for (let n = 0; n < keys.length - 1; n++) {
      const a = keys[n]!,
        b = keys[n + 1]!;
      if (t >= a[0] && t <= b[0]) {
        const u = ease((t - a[0]) / (b[0] - a[0]));
        for (let i = 0; i < CHANNELS; i++) out[i] = a[1][i]! + (b[1][i]! - a[1][i]!) * u;
        break;
      }
    }
  return out;
}
export function blendPose(a: Pose, b: Pose, w: number, out: Pose) {
  for (let i = 0; i < CHANNELS; i++) out[i] = a[i]! + (b[i]! - a[i]!) * w;
  return out;
}

const READY: Patch = {
  hipY: 0.82,
  pitch: 0.42,
  chestX: 0.18,
  headX: -0.5,
  lHandX: 0.24,
  lHandY: 0.62,
  lHandZ: 0.32,
  rHandX: -0.24,
  rHandY: 0.62,
  rHandZ: 0.32,
  lFootX: 0.2,
  rFootX: -0.2,
};
const KEEPER: Patch = {
  hipY: 0.52,
  pitch: 0.7,
  chestX: 0.2,
  headX: -0.85,
  lHandX: 0.13,
  lHandY: 0.3,
  lHandZ: 0.42,
  rHandX: -0.13,
  rHandY: 0.3,
  rHandZ: 0.42,
  lFootX: 0.25,
  lFootZ: -0.02,
  rFootX: -0.25,
  rFootZ: -0.02,
};
const STANCE: Patch = {
  hipY: 0.87,
  pitch: 0.3,
  chestX: 0.12,
  chestY: 0.22,
  headX: -0.1,
  headY: 1.0,
  lFootX: 0.24,
  lFootZ: 0.02,
  rFootX: -0.22,
  rFootZ: -0.02,
};

export const CLIPS = {
  idle: clip([[0, { chestX: 0.01 }], [1.6, { chestX: 0.03, hipY: 0.955 }], [3.2, { chestX: 0.01 }]], 3.2),
  ready: clip([[0, READY], [0.55, { ...READY, hipY: 0.8 }], [1.1, READY]], 1.1),
  keeper: clip([[0, KEEPER]]),
  keeperRise: clip([[0, KEEPER], [0.28, { ...KEEPER, hipY: 0.82, pitch: 0.35, chestX: 0.1, headX: -0.3, lHandY: 0.95, rHandY: 0.95, lHandZ: 0.38, rHandZ: 0.38 }]]),
  pickup: clip([
    [0, { hipY: 0.78, pitch: 0.65, chestX: 0.3, headX: -0.5, rHandX: -0.18, rHandY: 0.3, rHandZ: 0.5, lHandX: 0.2, lHandY: 0.5, lHandZ: 0.3, lFootZ: 0.25, rFootZ: -0.25 }],
    [0.32, { hipY: 0.74, pitch: 0.8, chestX: 0.32, headX: -0.6, rHandX: -0.14, rHandY: 0.18, rHandZ: 0.55, lHandX: 0.18, lHandY: 0.42, lHandZ: 0.32, lFootZ: 0.3, rFootZ: -0.3 }],
  ]),
  throw: clip([
    [0, { hipY: 0.9, pitch: -0.1, yaw: -0.7, rHandX: -0.4, rHandY: 1.5, rHandZ: -0.35, lHandX: 0.3, lHandY: 1.45, lHandZ: 0.45, lFootZ: 0.35, rFootZ: -0.25 }],
    [0.12, { hipY: 0.92, pitch: 0.2, yaw: 0.2, rHandX: -0.2, rHandY: 1.75, rHandZ: 0.3, lHandX: 0.25, lHandY: 1.05, lHandZ: 0.1, lFootZ: 0.42, rFootZ: -0.28 }],
    [0.32, { hipY: 0.88, pitch: 0.55, yaw: 0.55, rHandX: 0.2, rHandY: 1.0, rHandZ: 0.5, lHandX: 0.32, lHandY: 0.95, lHandZ: -0.15, lFootZ: 0.45, rFootY: 0.2, rFootZ: 0.05 }],
    [0.75, { hipY: 0.94, pitch: 0.12 }],
  ]),
  catchHigh: clip([
    [0, { hipY: 0.98, pitch: -0.08, headX: -0.5, lHandX: 0.2, lHandY: 1.95, lHandZ: 0.32, rHandX: -0.2, rHandY: 1.95, rHandZ: 0.32 }],
    [0.25, { hipY: 0.93, pitch: 0.08, headX: -0.15, lHandX: 0.08, lHandY: 1.3, lHandZ: 0.28, rHandX: -0.08, rHandY: 1.3, rHandZ: 0.28 }],
  ]),
  catchLow: clip([
    [0, { hipY: 0.7, pitch: 0.65, chestX: 0.2, headX: -0.5, lHandX: 0.1, lHandY: 0.5, lHandZ: 0.55, rHandX: -0.1, rHandY: 0.5, rHandZ: 0.55, lFootZ: 0.3, rFootZ: -0.28 }],
    [0.3, { hipY: 0.82, pitch: 0.2, headX: -0.1, lHandX: 0.08, lHandY: 1.05, lHandZ: 0.28, rHandX: -0.08, rHandY: 1.05, rHandZ: 0.28 }],
  ]),
  dive: clip([
    [0, { hipY: 0.82, pitch: 0.6, lHandX: 0.2, lHandY: 1.0, lHandZ: 0.5, rHandX: -0.2, rHandY: 1.0, rHandZ: 0.5, lFootZ: 0.25, rFootY: 0.25, rFootZ: -0.4 }],
    [0.18, { hipY: 0.55, pitch: 1.05, chestX: -0.15, headX: -0.75, lHandX: 0.14, lHandY: 0.75, lHandZ: 1.1, rHandX: -0.14, rHandY: 0.75, rHandZ: 1.1, lFootY: 0.3, lFootZ: -0.45, rFootY: 0.45, rFootZ: -0.6 }],
    [0.42, { hipY: 0.22, pitch: 1.5, chestX: -0.2, headX: -0.95, lHandX: 0.14, lHandY: 0.25, lHandZ: 1.2, rHandX: -0.14, rHandY: 0.25, rHandZ: 1.2, lFootY: 0.16, lFootZ: -0.85, rFootY: 0.16, rFootZ: -0.92 }],
    [1.0, { hipY: 0.2, pitch: 1.5, chestX: -0.22, headX: -0.95, lHandX: 0.14, lHandY: 0.2, lHandZ: 1.1, rHandX: -0.14, rHandY: 0.2, rHandZ: 1.1, lFootY: 0.14, lFootZ: -0.85, rFootY: 0.14, rFootZ: -0.92 }],
  ]),
  drop: clip([
    [0, { hipY: 0.9, pitch: 0.3, lHandX: 0.12, lHandY: 1.0, lHandZ: 0.32, rHandX: -0.12, rHandY: 1.0, rHandZ: 0.32 }],
    [0.45, { hipY: 0.8, pitch: 0.55, headX: 0.25, lHandX: 0.14, lHandY: 1.72, lHandZ: 0.06, rHandX: -0.14, rHandY: 1.72, rHandZ: 0.06 }],
  ]),
  celebrate: clip(
    [
      [0, { hipY: 0.94, chestY: -0.2, rHandY: 1.05 }],
      [0.4, { hipY: 0.97, chestY: 0.35, yaw: 0.3, rHandX: -0.24, rHandY: 1.65, rHandZ: 0.35, lHandY: 1.15 }],
      [1.1, { hipY: 0.97, chestY: 0.2, yaw: 0.5, rHandY: 1.35, rHandZ: 0.25, lHandY: 1.0 }],
      [2.8, { yaw: 0.6, rHandY: 0.95 }],
    ],
  ),
  salute: clip([[0, { rHandY: 1.0 }], [0.45, { yaw: -0.25, chestY: -0.2, rHandX: -0.25, rHandY: 2.08, rHandZ: 0.12 }], [1.5, { yaw: -0.4, rHandY: 1.5, rHandZ: 0.25 }], [3, { yaw: -0.5 }]]),
  showCatch: clip([[0, { hipY: 0.86, lHandX: 0.08, rHandX: -0.08, lHandY: 1.05, rHandY: 1.05, lHandZ: 0.28, rHandZ: 0.28 }], [0.6, { rHandX: -0.15, rHandY: 1.85, rHandZ: 0.3, lHandY: 1.0, yaw: 0.25 }], [2, { rHandX: -0.2, rHandY: 1.55, rHandZ: 0.25, yaw: 0.4 }]]),
  directHit: clip([[0, { pitch: 0.2, rHandY: 1.1 }], [0.4, { yaw: 0.35, rHandX: -0.25, rHandY: 1.3, rHandZ: 0.65, lHandY: 1.1 }], [1.3, { yaw: 0.5, rHandX: -0.2, rHandY: 1.5, rHandZ: 0.35 }], [2.6, { yaw: 0.5 }]]),
  // Starts exactly where the dive ends (its last key), so getting up never snaps.
  recover: clip([[0, { hipY: 0.2, pitch: 1.5, chestX: -0.22, headX: -0.95, lHandX: 0.14, lHandY: 0.2, lHandZ: 1.1, rHandX: -0.14, rHandY: 0.2, rHandZ: 1.1, lFootY: 0.14, lFootZ: -0.85, rFootY: 0.14, rFootZ: -0.92 }], [0.5, { hipY: 0.55, pitch: 0.65, lHandY: 0.35, rHandY: 0.35, lHandZ: 0.4, rHandZ: 0.4, lFootZ: 0.25, rFootZ: -0.4 }], [1.2, { hipY: 0.93, pitch: 0.12 }]]),
  appeal: clip([
    [0, { hipY: 0.92, pitch: 0.2, rHandX: -0.3, rHandY: 1.2, rHandZ: 0.3 }],
    [0.22, { hipY: 0.98, pitch: -0.12, headX: -0.32, yaw: -0.25, lHandX: 0.42, lHandY: 1.5, lHandZ: 0.3, rHandX: -0.2, rHandY: 2.12, rHandZ: 0.22, lFootZ: 0.2, rFootZ: -0.2 }],
    [1.2, { hipY: 0.97, pitch: -0.08, headX: -0.28, yaw: -0.2, lHandX: 0.42, lHandY: 1.55, lHandZ: 0.28, rHandX: -0.2, rHandY: 2.1, rHandZ: 0.22, lFootZ: 0.2, rFootZ: -0.2 }],
  ]),
  frustrated: clip([
    [0, { hipY: 0.93, pitch: 0.2 }],
    [0.4, { hipY: 0.95, pitch: -0.06, headX: -0.25, lHandX: 0.12, lHandY: 1.78, lHandZ: 0.08, rHandX: -0.12, rHandY: 1.78, rHandZ: 0.08 }],
    [1.6, { hipY: 0.94, pitch: 0.12, headX: 0.2, lHandX: 0.14, lHandY: 1.74, lHandZ: 0.04, rHandX: -0.14, rHandY: 1.74, rHandZ: 0.04 }],
  ]),
  hands: clip([
    [0, {}],
    [0.5, { hipY: 0.95, pitch: 0.12, headX: 0.32, lHandX: 0.27, lHandY: 1.0, lHandZ: -0.02, rHandX: -0.27, rHandY: 1.0, rHandZ: -0.02 }],
  ]),
  beaten: clip([
    [0, { ...STANCE }],
    [0.45, { ...STANCE, hipY: 0.92, pitch: 0.12, chestX: -0.04, headX: 0.15, headY: 0.4 }],
  ]),
  downcast: clip([
    [0, {}],
    [0.6, { hipY: 0.93, pitch: 0.12, chestX: 0.18, headX: 0.55, lHandX: 0.22, lHandY: 0.8, rHandX: -0.22, rHandY: 0.8 }],
  ]),
  clap: clip(
    [
      [0, { lHandX: 0.05, lHandY: 1.3, lHandZ: 0.32, rHandX: -0.14, rHandY: 1.3, rHandZ: 0.32 }],
      [0.14, { lHandX: 0.2, lHandY: 1.32, lHandZ: 0.3, rHandX: -0.26, rHandY: 1.32, rHandZ: 0.3 }],
      [0.28, { lHandX: 0.05, lHandY: 1.3, lHandZ: 0.32, rHandX: -0.14, rHandY: 1.3, rHandZ: 0.32 }],
    ],
    0.28,
  ),
  stance: clip([[0, STANCE]]),
  // ---- fielding (posed onto the ball by fielding.ts; times are the clip's own) ----
  /** Two-handed pickup: knees bent, head over the ball, both hands down in front, the left foot leading. */
  gather: clip([[0, { hipY: 0.6, pitch: 0.95, chestX: 0.22, headX: -0.55, lHandX: 0.08, lHandY: 0.14, lHandZ: 0.6, rHandX: -0.08, rHandY: 0.14, rHandZ: 0.6, lFootX: 0.2, lFootZ: 0.34, rFootX: -0.22, rFootZ: -0.3 }]]),
  /** One-handed pickup on the run: bent at the waist, throwing hand to the ball, the other back for balance. */
  reach: clip([[0, { hipY: 0.8, pitch: 0.9, chestX: 0.18, headX: -0.5, yaw: -0.15, lHandX: 0.32, lHandY: 0.95, lHandZ: -0.1, rHandX: -0.24, rHandY: 0.16, rHandZ: 0.55 }]]),
  /** Ball at the chest: soft hands in front of the sternum. */
  catchChest: clip([[0, { hipY: 0.9, pitch: 0.12, headX: -0.25, lHandX: 0.06, lHandY: 1.18, lHandZ: 0.36, rHandX: -0.06, rHandY: 1.18, rHandZ: 0.36, lFootZ: 0.12, rFootZ: -0.14 }], [0.25, { hipY: 0.92, pitch: 0.06, headX: -0.1, lHandX: 0.06, lHandY: 1.1, lHandZ: 0.2, rHandX: -0.06, rHandY: 1.1, rHandZ: 0.2 }]]),
  /** Down on the right knee after a slide or a dive, upright from the hips, ready to throw. */
  kneel: clip([[0, { hipY: 0.5, pitch: 0.08, chestX: 0.04, lFootX: 0.16, lFootZ: 0.38, rFootX: -0.12, rFootY: 0.14, rFootZ: -0.5, lHandX: 0.26, lHandY: 0.75, lHandZ: 0.3, rHandX: -0.24, rHandY: 0.8, rHandZ: 0.1 }]]),
  /**
   * Underarm flick at the stumps from close in. Keys are seconds from the
   * release, so the hand lets go on the engine's throw tick.
   */
  underarm: clip([
    [-0.32, { hipY: 0.66, pitch: 0.8, chestX: 0.2, headX: -0.5, lHandX: 0.24, lHandY: 0.45, lHandZ: 0.42, rHandX: -0.14, rHandY: 0.24, rHandZ: 0.5, lFootX: 0.2, lFootZ: 0.3, rFootX: -0.22, rFootZ: -0.3 }],
    [-0.14, { hipY: 0.7, pitch: 0.7, chestX: 0.18, headX: -0.45, yaw: -0.25, lHandX: 0.3, lHandY: 0.62, lHandZ: 0.35, rHandX: -0.26, rHandY: 0.32, rHandZ: -0.3, lFootX: 0.2, lFootZ: 0.34, rFootX: -0.22, rFootZ: -0.3 }],
    [0, { hipY: 0.76, pitch: 0.5, chestX: 0.12, headX: -0.35, yaw: 0.15, lHandX: 0.34, lHandY: 0.7, lHandZ: 0.15, rHandX: -0.1, rHandY: 0.62, rHandZ: 0.62, lFootX: 0.2, lFootZ: 0.5, rFootX: -0.22, rFootZ: -0.28 }],
    [0.22, { hipY: 0.84, pitch: 0.32, headX: -0.25, yaw: 0.25, lHandX: 0.3, lHandY: 0.8, lHandZ: 0.05, rHandX: -0.04, rHandY: 1.12, rHandZ: 0.5, lFootX: 0.2, lFootZ: 0.5, rFootX: -0.2, rFootY: 0.12, rFootZ: -0.1 }],
    [0.8, { hipY: 0.94, pitch: 0.1, lFootZ: 0.2, rFootZ: -0.05 }],
  ]),
  /** The keeper's gloves taking a ball below the knee: still down, fingers to the turf. */
  keeperLow: clip([[0, { hipY: 0.5, pitch: 0.78, chestX: 0.22, headX: -0.8, lHandX: 0.09, lHandY: 0.2, lHandZ: 0.5, rHandX: -0.09, rHandY: 0.2, rHandZ: 0.5, lFootX: 0.27, lFootZ: -0.02, rFootX: -0.27, rFootZ: -0.02 }]]),
  /** Risen with the bounce to take it at the waist or above. */
  keeperHigh: clip([[0, { hipY: 0.8, pitch: 0.3, chestX: 0.08, headX: -0.25, lHandX: 0.08, lHandY: 1.05, lHandZ: 0.42, rHandX: -0.08, rHandY: 1.05, rHandZ: 0.42, lFootX: 0.26, rFootX: -0.26 }]]),
  /** Ball in the gloves swept onto the bails, the body following the hands forward. */
  stumping: clip([
    [0, { hipY: 0.62, pitch: 0.62, chestX: 0.2, headX: -0.7, lHandX: 0.07, lHandY: 0.5, lHandZ: 0.36, rHandX: -0.07, rHandY: 0.5, rHandZ: 0.36, lFootX: 0.27, rFootX: -0.27 }],
    [0.16, { hipY: 0.58, hipZ: 0.18, pitch: 0.9, chestX: 0.25, headX: -0.75, lHandX: 0.05, lHandY: 0.66, lHandZ: 0.95, rHandX: -0.05, rHandY: 0.66, rHandZ: 0.95, lFootX: 0.27, lFootZ: 0.25, rFootX: -0.27 }],
    [0.45, { hipY: 0.74, hipZ: 0.1, pitch: 0.5, chestX: 0.12, headX: -0.4, lHandX: 0.12, lHandY: 0.9, lHandZ: 0.7, rHandX: -0.12, rHandY: 0.9, rHandZ: 0.7, lFootX: 0.27, lFootZ: 0.25, rFootX: -0.27 }],
  ]),
  umpire: clip([[0, { hipY: 0.94, pitch: 0.2, lHandX: 0.12, lHandY: 0.95, lHandZ: -0.16, rHandX: -0.12, rHandY: 0.95, rHandZ: -0.16 }]]),
  umpireOut: clip([
    [0, { lHandX: 0.25, lHandY: 0.9 }],
    [0.3, { lHandX: 0.25, lHandY: 0.9, rHandX: -0.22, rHandY: 2.15, rHandZ: 0.14 }],
  ]),
  umpireSix: clip([
    [0, {}],
    [0.32, { lHandX: 0.24, lHandY: 2.16, lHandZ: 0.04, rHandX: -0.24, rHandY: 2.16, rHandZ: 0.04 }],
  ]),
  umpireFour: clip(
    [
      [0, { rHandX: -0.62, rHandY: 1.2, rHandZ: 0.28 }],
      [0.3, { rHandX: 0.36, rHandY: 1.2, rHandZ: 0.28 }],
      [0.6, { rHandX: -0.62, rHandY: 1.2, rHandZ: 0.28 }],
    ],
    0.6,
  ),
} satisfies Record<string, Clip>;
export type ClipName = keyof typeof CLIPS;

// ---------------------------------------------------------------------------
// Bowling. Keys are seconds relative to the simulated release, so the arm
// comes over at the same tick the ball leaves the hand.
// ---------------------------------------------------------------------------

export type BowlingStyle = "fast" | "medium" | "spin";
export const bowlingStyle = (v: Variation | undefined): BowlingStyle =>
  v === "offbreak" || v === "legbreak" || v === "googly" || v === "topspin" ? "spin" : v === "slower" ? "medium" : "fast";
/** Metres from the release point at which each style starts its run-up. */
export const RUN_UP: Record<BowlingStyle, number> = { fast: 15, medium: 10, spin: 4.6 };
/** Root position at release relative to the simulated release point. */
export const RELEASE_ROOT = { x: 0.17, z: -1.17 };

const t = (ticks: number) => ticks * STEP;
const fastDelivery = clip([
  [t(-38), { hipY: 1.02, pitch: 0.18, lHandX: 0.22, lHandY: 1.2, lHandZ: 0.32, rHandX: -0.28, rHandY: 1.12, rHandZ: 0.22, lFootY: 0.35, lFootZ: 0.25, rFootZ: -0.2 }],
  [t(-26), { hipY: 1.24, pitch: 0.04, yaw: -0.5, lHandX: 0.2, lHandY: 1.68, lHandZ: 0.28, rHandX: -0.22, rHandY: 1.42, rHandZ: 0.16, lFootY: 0.6, lFootZ: 0.25, rFootY: 0.46, rFootZ: -0.14 }],
  [t(-14), { hipY: 0.96, hipZ: 0.1, pitch: -0.18, yaw: -1.0, chestY: -0.15, lHandX: 0.28, lHandY: 1.86, lHandZ: 0.36, rHandX: -0.34, rHandY: 1.12, rHandZ: -0.42, lFootY: 0.42, lFootZ: 0.5, rFootX: -0.12, rFootZ: -0.28 }],
  [t(-5), { hipY: 0.97, hipZ: 0.45, pitch: -0.05, yaw: -0.55, lHandX: 0.34, lHandY: 1.42, lHandZ: 0.62, rHandX: -0.38, rHandY: 1.55, rHandZ: -0.1, lFootX: 0.13, lFootZ: 0.6, rFootZ: -0.2 }],
  [t(0), { hipY: 1.0, hipZ: 0.85, pitch: 0.22, yaw: 0.12, chestX: 0.08, headX: -0.15, lHandX: 0.24, lHandY: 1.16, lHandZ: 0.78, rHandX: -0.17, rHandY: 2.08, rHandZ: 1.17, lFootX: 0.13, lFootZ: 0.6, rFootX: -0.12, rFootY: 0.2, rFootZ: 0.12 }],
  [t(10), { hipY: 0.94, hipZ: 1.0, pitch: 0.62, yaw: 0.5, chestX: 0.15, lHandX: 0.42, lHandY: 1.05, lHandZ: 0.65, rHandX: 0.2, rHandY: 0.98, rHandZ: 1.45, lFootX: 0.13, lFootZ: 0.6, rFootX: -0.1, rFootY: 0.36, rFootZ: 0.6 }],
  [t(28), { hipY: 0.92, hipZ: 0.6, pitch: 0.35, yaw: 0.25, lHandX: 0.3, lHandY: 0.95, lHandZ: 0.2, rHandX: -0.05, rHandY: 0.95, rHandZ: 0.5, lFootZ: 0.2, rFootZ: 0.38 }],
  [t(70), { hipY: 0.95, pitch: 0.08 }],
]);
const mediumDelivery = clip([
  [t(-30), { hipY: 1.0, pitch: 0.14, lHandX: 0.22, lHandY: 1.25, lHandZ: 0.3, rHandX: -0.26, rHandY: 1.2, rHandZ: 0.2, lFootY: 0.26, lFootZ: 0.2, rFootZ: -0.15 }],
  [t(-20), { hipY: 1.12, yaw: -0.4, lHandX: 0.2, lHandY: 1.7, lHandZ: 0.28, rHandX: -0.24, rHandY: 1.4, rHandZ: 0.1, lFootY: 0.42, lFootZ: 0.3, rFootY: 0.3, rFootZ: -0.12 }],
  [t(-10), { hipY: 0.98, hipZ: 0.15, pitch: -0.08, yaw: -0.85, lHandX: 0.26, lHandY: 1.82, lHandZ: 0.4, rHandX: -0.32, rHandY: 1.25, rHandZ: -0.35, lFootY: 0.3, lFootZ: 0.5, rFootZ: -0.25 }],
  [t(-4), { hipY: 0.98, hipZ: 0.5, yaw: -0.45, lHandX: 0.32, lHandY: 1.4, lHandZ: 0.62, rHandX: -0.36, rHandY: 1.62, rHandZ: 0.05, lFootX: 0.13, lFootZ: 0.6, rFootZ: -0.18 }],
  [t(0), { hipY: 1.0, hipZ: 0.85, pitch: 0.2, yaw: 0.08, headX: -0.12, lHandX: 0.24, lHandY: 1.2, lHandZ: 0.78, rHandX: -0.17, rHandY: 2.08, rHandZ: 1.17, lFootX: 0.13, lFootZ: 0.6, rFootY: 0.14, rFootZ: 0.15 }],
  [t(12), { hipY: 0.95, hipZ: 0.95, pitch: 0.48, yaw: 0.4, lHandX: 0.38, lHandY: 1.05, lHandZ: 0.6, rHandX: 0.16, rHandY: 1.02, rHandZ: 1.35, lFootX: 0.13, lFootZ: 0.6, rFootY: 0.24, rFootZ: 0.55 }],
  [t(55), { hipY: 0.95, pitch: 0.06 }],
]);
const spinDelivery = clip([
  [t(-26), { hipY: 0.98, pitch: 0.1, lHandX: 0.2, lHandY: 1.28, lHandZ: 0.3, rHandX: -0.14, rHandY: 1.26, rHandZ: 0.3, lFootY: 0.2, lFootZ: 0.2, rFootZ: -0.16 }],
  [t(-14), { hipY: 1.04, yaw: -0.85, chestY: -0.3, lHandX: 0.2, lHandY: 1.9, lHandZ: 0.34, rHandX: -0.22, rHandY: 1.38, rHandZ: 0.04, lFootY: 0.28, lFootZ: 0.46, rFootZ: -0.12 }],
  [t(-5), { hipY: 0.97, hipZ: 0.5, pitch: -0.08, yaw: -0.8, lHandX: 0.34, lHandY: 1.55, lHandZ: 0.58, rHandX: -0.34, rHandY: 1.56, rHandZ: -0.1, lFootX: 0.13, lFootZ: 0.6, rFootZ: -0.2 }],
  [t(0), { hipY: 0.98, hipZ: 0.85, pitch: 0.18, yaw: 0.05, chestY: 0.1, headX: -0.1, lHandX: 0.24, lHandY: 1.2, lHandZ: 0.8, rHandX: -0.17, rHandY: 2.08, rHandZ: 1.17, lFootX: 0.13, lFootZ: 0.6, rFootZ: -0.08 }],
  [t(14), { hipY: 0.95, hipZ: 0.9, pitch: 0.4, yaw: 0.85, chestY: 0.3, lHandX: 0.4, lHandY: 1.1, lHandZ: 0.4, rHandX: 0.32, rHandY: 1.2, rHandZ: 1.15, lFootX: 0.13, lFootZ: 0.6, rFootY: 0.2, rFootZ: 0.5 }],
  [t(50), { hipY: 0.95, pitch: 0.05 }],
]);
export const DELIVERY: Record<BowlingStyle, Clip> = { fast: fastDelivery, medium: mediumDelivery, spin: spinDelivery };
/** Seconds before release at which the run-up hands over to the delivery clip. */
export const GATHER: Record<BowlingStyle, number> = { fast: t(38), medium: t(30), spin: t(26) };

/** Where the bowler's root is along the run-up (0 at its mark, 1 at the delivery stride). */
export function runUpProgress(tick: number, style: BowlingStyle) {
  const end = RELEASE_TICK - GATHER[style] / STEP + 20;
  const u = clamp01(tick / end);
  // Accelerate off the mark, then carry speed into the delivery stride.
  return u * u * (2 - u);
}

// ---------------------------------------------------------------------------
// Batting lives in batting.ts. The bat is posed first and the hands are solved
// onto it, so they can't drift off the handle during a swing.
// ---------------------------------------------------------------------------

export type Vec3 = [number, number, number];
export interface BatPose {
  grip: Vec3;
  /** Unit direction from the top hand towards the toe. */
  dir: Vec3;
  /** Direction the hitting face points. */
  face: Vec3;
}
/** Same mapping the batting physics uses for where the bat meets the ball. */
export const BAT_HEIGHTS: Record<ShotKind, number> = SHOT_HEIGHTS;

// ---------------------------------------------------------------------------
// Clip selection: what the match state says each actor is doing.
// ---------------------------------------------------------------------------

export interface MatchMoment {
  tick: number;
  outcome: Outcome | null;
  /** Seconds of wall-clock since the delivery ended; negative while it's live. */
  deadAge: number;
  contact: boolean;
  /** The batting side won or lost the match on this ball. */
  result?: "batting-won" | "fielding-won" | null;
}

export type Selection = { clip: ClipName; time: number };

export function selectStriker(m: MatchMoment & { running: boolean; shot: { tick: number } | null; edge: boolean; dismissedStriker: boolean }): Selection | "gait" | "bat" {
  if (m.running) return "gait";
  if (m.outcome && m.deadAge >= 0) {
    if (m.outcome.wicket && m.dismissedStriker) return { clip: "downcast", time: m.deadAge };
    if (m.result === "batting-won") return { clip: "celebrate", time: m.deadAge };
    if (m.outcome.boundary && m.deadAge > 0.35) return "bat";
  }
  if (!m.contact && m.shot && m.tick - m.shot.tick > 34) return { clip: "beaten", time: (m.tick - m.shot.tick - 34) * STEP };
  return "bat";
}

export function selectNonStriker(m: MatchMoment & { running: boolean; dismissedNonStriker: boolean }): Selection | "gait" {
  if (m.running) return "gait";
  if (m.outcome && m.deadAge >= 0) {
    if (m.outcome.wicket) return { clip: m.dismissedNonStriker ? "downcast" : "frustrated", time: m.deadAge };
    if (m.result === "batting-won" || m.outcome.boundary === 6) return { clip: m.result === "batting-won" ? "celebrate" : "clap", time: m.deadAge };
    if (m.outcome.boundary === 4) return { clip: "clap", time: m.deadAge };
  }
  return { clip: "idle", time: m.tick * STEP };
}

const reactionFor = (o: Outcome, near: boolean, keeperOrBowler: boolean): ClipName | null => {
  if (o.wicket) {
    if (keeperOrBowler && (o.wicket === "lbw" || o.wicket === "stumped")) return "appeal";
    if (o.wicket === "run-out") return keeperOrBowler || near ? "directHit" : "clap";
    if (o.wicket === "caught") return keeperOrBowler ? "salute" : "clap";
    return keeperOrBowler ? "celebrate" : "clap";
  }
  if (o.boundary === 6) return keeperOrBowler ? "frustrated" : near ? "hands" : "hands";
  if (o.boundary === 4) return keeperOrBowler ? "hands" : near ? "frustrated" : "hands";
  return null;
};

export function selectFielder(m: MatchMoment & { action: Fielder["action"]; actionAge: number; moving: boolean; speed: number; ballY: number; id: number; chasing: boolean }): Selection | "gait" {
  if (m.action === "dive" && m.actionAge > 1) return { clip: "recover", time: m.actionAge - 1 };
  if (m.outcome && m.deadAge >= 0) {
    const reaction = m.outcome.wicket === "caught" && m.action === "catch" ? "showCatch" : reactionFor(m.outcome, m.chasing, false);
    if (reaction && (m.action !== "dive" || m.deadAge > 0.9)) return { clip: reaction, time: m.deadAge + (reaction === "celebrate" ? m.id * 0.07 : 0) };
  }
  if (m.action === "dive") return { clip: "dive", time: m.actionAge };
  if (m.action === "catch") return { clip: m.ballY > 1.25 ? "catchHigh" : "catchLow", time: m.actionAge };
  if (m.action === "pickup") return { clip: "pickup", time: m.actionAge };
  if (m.action === "throw") return { clip: "throw", time: m.actionAge };
  if (m.action === "drop") return { clip: "drop", time: m.actionAge };
  if (m.moving) return "gait";
  return { clip: m.tick >= RELEASE_TICK - 40 ? "ready" : "idle", time: m.tick * STEP + m.id * 0.3 };
}

export function selectKeeper(m: MatchMoment & { action: Fielder["action"]; actionAge: number; moving: boolean; ballZ: number; ballY: number; wicket: Dismissal | null }): Selection | "gait" {
  if (m.outcome && m.deadAge >= 0) {
    if (m.wicket) return { clip: m.wicket === "lbw" && m.deadAge < 0.9 ? "appeal" : m.wicket === "caught" ? m.action === "catch" ? "showCatch" : "clap" : m.wicket === "run-out" ? m.action === "throw" ? "directHit" : "clap" : "salute", time: m.deadAge };
    if (m.outcome.boundary) return { clip: "hands", time: m.deadAge };
    return { clip: "keeperRise", time: 1 };
  }
  if (m.action === "pickup") return { clip: "pickup", time: m.actionAge };
  if (m.action === "throw") return { clip: "throw", time: m.actionAge };
  if (m.action === "dive") return { clip: "dive", time: m.actionAge };
  if (m.tick >= RELEASE_TICK && m.ballZ > 3.5 && !m.contact) return { clip: "keeperRise", time: (m.ballZ - 3.5) * 0.06 };
  if (m.contact && m.moving) return "gait";
  return { clip: "keeper", time: 0 };
}

export function selectBowler(m: MatchMoment & { style: BowlingStyle; chasing: boolean; action: Fielder["action"]; actionAge: number; moving: boolean; ballY: number; wicket: Dismissal | null }): Selection | "gait" | "delivery" {
  if (m.outcome && m.deadAge >= 0) {
    const reaction = m.outcome.wicket === "lbw" && m.deadAge > 0.9 ? "salute" : m.wicket === "caught" && m.action === "catch" ? "showCatch" : m.wicket === "run-out" && m.action !== "throw" ? "clap" : reactionFor(m.outcome, false, true);
    if (reaction) return { clip: reaction, time: m.deadAge };
  }
  const gather = RELEASE_TICK - GATHER[m.style] / STEP;
  if (m.tick < gather) return "gait";
  if (m.tick < RELEASE_TICK + 70 && !m.chasing) return "delivery";
  return selectFielder({ ...m, id: 9, chasing: m.chasing, speed: 0 });
}

export function selectUmpire(m: MatchMoment): Selection {
  if (m.outcome && m.deadAge >= 0.2) {
    const time = m.deadAge - 0.2;
    if (m.outcome.wicket) return { clip: "umpireOut", time };
    if (m.outcome.boundary === 6) return { clip: "umpireSix", time };
    if (m.outcome.boundary === 4) return { clip: "umpireFour", time };
  }
  return { clip: m.tick >= RELEASE_TICK - 40 ? "umpire" : "idle", time: m.tick * STEP };
}

// ---------------------------------------------------------------------------
// Foot locking: a planted foot stays exactly where it landed until it's its
// turn to swing, so feet don't slide over the ground.
// ---------------------------------------------------------------------------

export class FootPlanter {
  feet: { x: number; z: number; fromX: number; fromZ: number; toX: number; toZ: number; y: number; swinging: boolean }[] = [0, 1].map(() => ({ x: 0, z: 0, fromX: 0, fromZ: 0, toX: 0, toZ: 0, y: 0, swinging: false }));
  private distance = 0;
  private lastX = NaN;
  private lastZ = NaN;
  phase = 0;
  /** Counts teleports, which legitimately move a planted foot. */
  resets = 0;

  reset(x: number, z: number, facing: number) {
    this.resets++;
    const sx = Math.cos(facing),
      sz = -Math.sin(facing);
    this.feet.forEach((f, n) => {
      const side = (n === 0 ? 1 : -1) * 0.11;
      f.x = f.fromX = f.toX = x + sx * side;
      f.z = f.fromZ = f.toZ = z + sz * side;
      f.y = 0;
      f.swinging = false;
    });
    this.distance = 0;
    this.lastX = x;
    this.lastZ = z;
  }
  /** Advances with the root; `speed` in metres per second only sets the stride. */
  update(x: number, z: number, facing: number, speed: number) {
    if (!Number.isFinite(this.lastX) || Math.hypot(x - this.lastX, z - this.lastZ) > 2.5) this.reset(x, z, facing);
    const moved = Math.hypot(x - this.lastX, z - this.lastZ);
    this.lastX = x;
    this.lastZ = z;
    this.distance += moved;
    const stride = Math.max(0.55, Math.min(2.3, 0.62 + speed * 0.21));
    this.phase += moved / stride;
    const fx = Math.sin(facing),
      fz = Math.cos(facing),
      sx = Math.cos(facing),
      sz = -Math.sin(facing);
    this.feet.forEach((f, n) => {
      const local = (this.phase + n * 0.5) % 1,
        swinging = local < 0.5;
      if (swinging && !f.swinging) {
        f.fromX = f.x;
        f.fromZ = f.z;
      }
      if (swinging) {
        const side = (n === 0 ? 1 : -1) * 0.1,
          u = local / 0.5;
        // Aim where the body will be when this foot lands, so it lands under the hips.
        f.toX = x + fx * stride * 0.25 * (1 + (1 - u)) + sx * side;
        f.toZ = z + fz * stride * 0.25 * (1 + (1 - u)) + sz * side;
        f.x = f.fromX + (f.toX - f.fromX) * ease(u);
        f.z = f.fromZ + (f.toZ - f.fromZ) * ease(u);
        f.y = Math.sin(u * Math.PI) * Math.min(0.34, 0.1 + speed * 0.04);
      } else f.y = 0;
      f.swinging = swinging;
    });
  }
}

/**
 * Planted feet for posed (not running) actors: the keeper shuffling across, a
 * fielder stepping into a take. Each foot stays where it is on the turf until
 * the pose wants it more than STEP_REACH away, then takes a quick lifted step;
 * only one foot steps at a time. So a body that moves under a held pose steps
 * rather than slides.
 */
export const STEP_REACH = 0.17;
export class StepFeet {
  feet = [0, 1].map(() => ({ x: NaN, z: NaN, fromX: 0, fromZ: 0, toX: 0, toZ: 0, t: 1, lift: 0 }));
  reset() {
    for (const f of this.feet) f.x = NaN;
  }
  /** Takes where the pose wants each foot (world x,z) and leaves where it actually is in `feet`. */
  update(lx: number, lz: number, rx: number, rz: number, dt: number) {
    const want = [
      [lx, lz],
      [rx, rz],
    ] as const;
    for (const [k, f] of this.feet.entries()) {
      const [wx, wz] = want[k]!;
      if (!Number.isFinite(f.x) || Math.hypot(wx - f.x, wz - f.z) > 1.2) {
        f.x = f.toX = wx;
        f.z = f.toZ = wz;
        f.t = 1;
        f.lift = 0;
      }
    }
    for (const [k, f] of this.feet.entries()) {
      const [wx, wz] = want[k]!,
        other = this.feet[1 - k]!;
      if (f.t >= 1 && other.t >= 1 && Math.hypot(wx - f.x, wz - f.z) > STEP_REACH) {
        f.fromX = f.x;
        f.fromZ = f.z;
        f.t = 0;
      }
      if (f.t < 1) {
        // A step takes about a tenth of a second and lands where the pose now wants it.
        f.t = Math.min(1, f.t + dt / 0.11);
        f.toX = wx;
        f.toZ = wz;
        const u = ease(f.t);
        f.x = f.fromX + (f.toX - f.fromX) * u;
        f.z = f.fromZ + (f.toZ - f.fromZ) * u;
        f.lift = Math.sin(f.t * Math.PI) * 0.07;
      } else f.lift = 0;
    }
  }
}

/** Writes running body language (lean, bob, counter-swinging arms) into a pose. */
export function applyGait(p: Pose, phase: number, speed: number) {
  const pace = clamp01(speed / 7),
    a = phase * Math.PI * 2;
  p[CH.hipY] = RIG.hipY - 0.06 * pace + Math.abs(Math.sin(a)) * (0.015 + 0.03 * pace);
  p[CH.pitch] = 0.05 + 0.3 * pace;
  p[CH.chestX] = 0.03 + 0.06 * pace;
  p[CH.headX] = -0.15 * pace;
  p[CH.yaw] = Math.cos(a) * 0.12 * pace;
  p[CH.chestY] = -Math.cos(a) * 0.22 * pace;
  const swing = 0.14 + 0.28 * pace,
    height = 0.92 + 0.14 * pace;
  p[CH.lHandX] = 0.25 - 0.05 * pace;
  p[CH.lHandY] = height + Math.max(0, Math.cos(a)) * 0.22 * pace;
  p[CH.lHandZ] = 0.08 + Math.cos(a) * swing;
  p[CH.rHandX] = -0.25 + 0.05 * pace;
  p[CH.rHandY] = height + Math.max(0, -Math.cos(a)) * 0.22 * pace;
  p[CH.rHandZ] = 0.08 - Math.cos(a) * swing;
  return p;
}

/** Non-striker's distance along the pitch for a given run progress (shared by both batters). */
export function runProgress(runner: number) {
  const run = ((runner % 2) + 2) % 2;
  return run <= 1 ? run : 2 - run;
}
export const creaseZ = (end: 1 | -1, runner: number) => end * CREASE_Z * (1 - runProgress(runner) * 2);

/** Clip selection result for a dismissal, exposed for tests of event-specific reactions. */
export const reactionClip = reactionFor;
