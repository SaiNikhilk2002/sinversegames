import { RELEASE_TICK, STEP, STUMPS_Z, type Dismissal, type Fielder, type Frame, type Outcome } from "@platform/engines/sinverse-cricket";
import { clamp01, type ClipName, type Vec3 } from "./animation";
import type { OneShot } from "./motion";

/**
 * Fielding and wicketkeeping presentation. Pure: it reads the simulation's
 * positions, actions and ball, and returns how a fielder's body should move
 * this frame. Nothing here writes to the match, so catches, pickups, throws,
 * run-outs and stumpings happen exactly where and when the engine says.
 *
 * The engine decides an event on the tick it happens (a pickup when the chaser
 * is within 1.1 m of a low ball, a catch within 0.85 m, a dive within 1.65 m).
 * A real fielder moves before that: the hands go to where the ball is going,
 * the body gets down to a ground ball, a dive launches before the ball arrives.
 * So the ball's flight is predicted forward from the current frame, and the
 * body works towards the predicted moment. If the prediction changes, the goal
 * moves smoothly with it; the actual event then lands on the actual ball.
 *
 * Every choice (pickup style, throw style, celebration) is a function of the
 * frame and the player, so a replay plays out identically.
 */

const G = 9.81;
/** Engine catch and collection windows (read, not changed): heights and reaches. */
export const CATCH = { low: 0.25, high: 2.45, reach: 0.85, dive: 1.65, dive0: 0.7, pickup: 1.1, pickupHeight: 0.42 } as const;
/** Ticks from a pickup to the throw leaving the hand (engine constant, read). */
export const THROW_AFTER = 38;
/** Ticks after contact before the engine fields at all: no catch, dive or pickup sooner (engine constant, read). */
export const FIELD_AFTER = 22;
/** Closer than this to the stumps, a fielder flicks it underarm. */
export const UNDERARM = 14;
/** Where the keeper takes the ball: the engine collects on the first tick beyond z 10.65 (a fast ball moves 0.25 m a tick). */
export const KEEPER_TAKE_Z = 10.77;
/** Seconds over which a changing read of the ball is followed. */
const GOAL_LAG = 0.03;
/** Fastest a hand on its way to the ball moves, m/s (a quick human hand). */
const HAND_SPEED = 9;

export interface BallKin {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Rolling along the turf (not in the air). */
  rolling: boolean;
  /** Has pitched since it was struck (the engine's chaser then runs at the ball itself). */
  bounced?: boolean;
}

/** Where the ball will be `t` seconds on, by the same laws the engine uses (gravity, a bounce, turf friction). */
export function ballAt(b: BallKin, t: number, friction: number, out: Vec3 = [0, 0, 0]): Vec3 {
  if (b.rolling) {
    const speed = Math.hypot(b.vx, b.vz),
      decel = friction * G,
      stop = speed / Math.max(1e-3, decel),
      tt = Math.min(t, stop),
      d = speed * tt - 0.5 * decel * tt * tt,
      k = speed > 1e-4 ? d / speed : 0;
    out[0] = b.x + b.vx * k;
    out[1] = 0.04;
    out[2] = b.z + b.vz * k;
    return out;
  }
  let y = b.y + b.vy * t - 0.5 * G * t * t;
  if (y < 0.04) {
    // One bounce off the outfield (restitution 0.32), then low.
    const land = (b.vy + Math.sqrt(Math.max(0, b.vy * b.vy + 2 * G * (b.y - 0.04)))) / G,
      after = t - land,
      up = Math.abs(b.vy - G * land) * 0.32;
    y = Math.max(0.04, 0.04 + up * after - 0.5 * G * after * after);
  }
  out[0] = b.x + b.vx * t;
  out[1] = y;
  out[2] = b.z + b.vz * t;
  return out;
}

export interface Intercept {
  /** Seconds until the engine's window is predicted to open. */
  tau: number;
  /** Where the ball will be then. */
  point: Vec3;
  /** How far the fielder will still be from it (the engine's gap). */
  gap: number;
  kind: "catch" | "dive" | "pickup";
}

/**
 * When and where this fielder is predicted to meet the ball. The fielder runs
 * as the engine's chaser does: towards where the ball is predicted to land (88%
 * of the way, re-read every step), or straight at it once it's on the ground.
 */
export function predictIntercept(b: BallKin, me: { x: number; z: number; speed: number }, friction: number, horizon = 1.4, from = 0): Intercept | null {
  const p: Vec3 = [0, 0, 0],
    speed = Math.max(0, me.speed),
    dt = 1 / 60;
  let fx = me.x,
    fz = me.z;
  for (let t = 0; t <= horizon + 1e-9; t += dt) {
    ballAt(b, t, friction, p);
    const gap = Math.hypot(p[0] - fx, p[2] - fz);
    // Once a struck ball has pitched there's no catch: only a pickup. Nothing at all
    // until the engine starts fielding (FIELD_AFTER ticks after contact).
    const open = t >= from - 1e-9,
      airborne = open && !b.rolling && !b.bounced && p[1] > CATCH.low && p[1] < CATCH.high;
    // The engine tries the catch the first tick the gap is inside the dive reach:
    // a dive if it's still beyond a normal reach, otherwise a catch.
    if (airborne && gap < (speed > 0.5 ? CATCH.dive : CATCH.reach)) return { tau: t, point: [...p] as Vec3, gap, kind: gap > CATCH.dive0 ? "dive" : "catch" };
    if (open && p[1] < CATCH.pickupHeight && gap < CATCH.pickup && (b.rolling || p[1] < 0.2)) return { tau: t, point: [...p] as Vec3, gap, kind: "pickup" };
    // Where the fielder runs next (the engine's chaser stands still until fielding starts).
    if (!open) continue;
    let tx = p[0],
      tz = p[2];
    if (!b.rolling && !b.bounced && p[1] > 0.06) {
      const vy = b.vy - G * t,
        air = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * G * p[1]))) / G;
      tx = p[0] + b.vx * air * 0.88;
      tz = p[2] + b.vz * air * 0.88;
    }
    const to = Math.hypot(tx - fx, tz - fz),
      step = Math.min(to, speed * dt);
    if (to > 1e-6) {
      fx += ((tx - fx) / to) * step;
      fz += ((tz - fz) / to) * step;
    }
  }
  return null;
}

/** When and where the ball reaches the keeper's plane, or null if it won't (struck, or going away). */
export function predictCrossing(b: BallKin, z: number, friction: number): { tau: number; x: number; y: number } | null {
  if (b.vz <= 0.5 || b.z >= z) return null;
  // Bounce on the pitch: restitution about 0.63 (both grounds use 0.63–0.67).
  let t = 0,
    x = b.x,
    y = b.y,
    zz = b.z,
    vy = b.vy;
  const dt = 1 / 120;
  while (zz < z && t < 2) {
    vy -= G * dt;
    x += b.vx * dt;
    y += vy * dt;
    zz += b.vz * dt;
    if (y < 0.04 && vy < 0) {
      y = 0.04;
      vy = -vy * 0.64;
    }
    t += dt;
  }
  void friction;
  return t < 2 ? { tau: t, x, y } : null;
}

export type PickupStyle = "two-hands" | "one-hand" | "slide";
export type CatchStyle = "low" | "chest" | "high" | "leap" | "dive";
export type FieldMove =
  | "idle"
  | "ready"
  | "walk-in"
  | "chase"
  | "attack-ball"
  | "pickup-two-hands"
  | "pickup-one-hand"
  | "slide-pickup"
  | "gather"
  | "throw-overarm"
  | "throw-underarm"
  | "throw-kneeling"
  | "catch-low"
  | "catch-chest"
  | "catch-high"
  | "catch-leap"
  | "dive"
  | "dive-stop"
  | "recover"
  | "drop"
  | "boundary-save"
  | "return"
  | "keeper-crouch"
  | "keeper-rise"
  | "keeper-take-low"
  | "keeper-take-high"
  | "keeper-give"
  | "keeper-stumping"
  | "keeper-await-throw"
  | "keeper-takes-throw"
  | "reaction";

export interface HandGoal {
  /** World point the palm should reach. */
  x: number;
  y: number;
  z: number;
  /** 0..1, how far towards it. */
  w: number;
}

export interface FieldPlan {
  move: FieldMove;
  /** A procedural pose blended over the base (gait or the selector's clip) by `weight`. */
  pose: { clip: ClipName; time: number; weight: number } | null;
  /** Clip regions (0 = procedural driver). Null leaves the scene's own choice. */
  motion: { lower: number; upper: number; shot: { clip: OneShot; time: number; weight: number } | null } | null;
  left: HandGoal | null;
  right: HandGoal | null;
  /** Face this world point (turning at a human rate), or null to leave facing alone. */
  face: { x: number; z: number } | null;
  /** The ball is taken in the right hand alone (the left is out for balance). */
  oneHand?: boolean;
}

/** What a fielder has committed to, kept by the renderer across frames (presentation only). */
export interface FieldMemo {
  pickup: PickupStyle | null;
  catchStyle: CatchStyle | null;
  /** Where the ball was when the engine's event happened (catch, pickup, collection). */
  took: Vec3 | null;
  /** The predicted meeting point, smoothed, so hands move rather than jump. */
  goal: Vec3 | null;
  /** Throw style for the current pickup. */
  throwStyle: "overarm" | "underarm" | "kneeling" | null;
  /** A take at full stretch (a long dive, a very high ball) goes into one hand; the other arm balances. */
  oneHand: boolean;
  /** The keeper's read of where the delivery will reach the gloves, smoothed. */
  glove: Vec3 | null;
}
export const newMemo = (): FieldMemo => ({ pickup: null, catchStyle: null, took: null, goal: null, throwStyle: null, glove: null, oneHand: false });

/**
 * Moves a smoothed point towards a new prediction over `dt` seconds
 * (exponential, frame-rate independent). `w` is how far the hands are committed
 * to it: the visible hand is about `w` of the way there, so the point may move
 * at HAND_SPEED / w, and a hand already near the ball never jumps.
 */
function ease(at: Vec3 | null, p: Vec3, dt: number, w = 0): Vec3 {
  if (!at) return [...p] as Vec3;
  const k = 1 - Math.exp(-dt / GOAL_LAG),
    d = [(p[0] - at[0]) * k, (p[1] - at[1]) * k, (p[2] - at[2]) * k],
    len = Math.hypot(d[0]!, d[1]!, d[2]!),
    max = (HAND_SPEED * dt) / Math.max(0.1, w),
    cap = len > max ? max / len : 1;
  for (let i = 0; i < 3; i++) at[i] = at[i]! + d[i]! * cap;
  return at;
}

export interface FielderInput {
  tick: number;
  action: Fielder["action"];
  /** Seconds since the engine's action for this fielder changed. */
  actionAge: number;
  dead: boolean;
  deadAge: number;
  outcome: Outcome | null;
  contact: boolean;
  mode: Frame["mode"];
  /** Display position and ground speed (m/s). */
  me: { x: number; z: number; speed: number };
  ball: BallKin;
  friction: number;
  /** On the ball: the engine has this fielder running at it, or doing something with it. */
  involved: boolean;
  /** 0 centre .. 1 on the rope, for the fielder. */
  rope: number;
  /** The engine's throw is at the striker's-end stumps. */
  stumps?: { x: number; z: number };
  /** Seconds the clip library says each one-shot lasts. */
  length: (clip: OneShot) => number;
  /** When the throwing clip's hand lets the ball go, seconds in. */
  throwRelease: number;
  /** Tick the bat (or pad, or the keeper's miss) started the fielding; -1 if not yet. */
  contactTick?: number;
}

const smooth = (t: number) => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};
const goal = (p: Vec3, w: number, dx = 0): HandGoal => ({ x: p[0] + dx, y: p[1], z: p[2], w });
/**
 * Both hands for a take at `p`: together on the ball, or (one-handed) the right
 * hand on it and the left arm out to the side of the line, for balance.
 */
function catchHands(p: Vec3, w: number, me: { x: number; z: number }, oneHand: boolean): { left: HandGoal; right: HandGoal; oneHand?: boolean } {
  if (!oneHand) return { left: goal(p, w, 0.09), right: goal(p, w) };
  const dx = p[0] - me.x,
    dz = p[2] - me.z,
    d = Math.hypot(dx, dz) || 1;
  return { left: { x: me.x + (dx / d) * 0.25 + (dz / d) * 0.65, y: Math.max(0.5, p[1] * 0.6), z: me.z + (dz / d) * 0.25 - (dx / d) * 0.65, w: w * 0.8 }, right: goal(p, w), oneHand: true };
}

/** Moves the memo's smoothed goal towards a new prediction (critically damped, so no jumps). */
function follow(memo: FieldMemo, p: Vec3, dt: number, w: number) {
  return (memo.goal = ease(memo.goal, p, dt, w));
}

/** The plan for a fielder with nothing to do (shared: plans are never mutated). */
const IDLE: FieldPlan = Object.freeze({ move: "idle", pose: null, motion: null, left: null, right: null, face: null }) as FieldPlan;

/** A fielder (not the keeper) for this frame; `dt` is the seconds since the last one. */
export function fielderPlan(i: FielderInput, memo: FieldMemo, dt = 1 / 60): FieldPlan {
  const none = IDLE;
  const stumps = i.stumps ?? { x: 0, z: STUMPS_Z };
  // Once the ball is dead the simulation stops ticking; the body carries on in real time.
  const age = i.actionAge + (i.dead ? Math.max(0, i.deadAge) : 0);
  // New ball, or the action is over: forget the commitments.
  if (i.tick < RELEASE_TICK) {
    memo.pickup = memo.catchStyle = memo.throwStyle = null;
    memo.took = memo.goal = null;
    memo.oneHand = false;
    return none;
  }

  // ---- a boundary save that just failed: the chaser slides at it as it crosses ----
  if (i.dead && i.outcome?.boundary === 4 && i.involved && i.action === "run") {
    const near = Math.hypot(i.ball.x - i.me.x, i.ball.z - i.me.z);
    const slide = i.length("Slide_Start"),
      exit = i.length("Slide_Exit");
    if (near < 4.5 && i.deadAge < slide + 0.5 + exit) {
      const t = i.deadAge;
      const shot =
        t < slide
          ? { clip: "Slide_Start" as const, time: t, weight: smooth(t / 0.15) }
          : t < slide + 0.5
            ? { clip: "Slide_Loop" as const, time: t - slide, weight: 1 }
            : { clip: "Slide_Exit" as const, time: t - slide - 0.5, weight: 1 - smooth((t - slide - 0.5 - exit + 0.2) / 0.2) };
      return { move: "boundary-save", pose: null, motion: { lower: 1, upper: 1, shot }, left: null, right: t < slide ? goal([i.ball.x, 0.06, i.ball.z], smooth(t / 0.3) * 0.8) : null, face: { x: i.ball.x, z: i.ball.z } };
    }
  }

  // ---- with the ball: pickup, gather and throw --------------------------------
  // The engine calls a stretch for a ground ball 0.7-1.1 m away a "dive"; it's a long reach or a slide, not a full-length dive.
  const groundDive = i.action === "dive" && !!memo.took && memo.took[1] < CATCH.pickupHeight + 0.05 && !(i.dead && i.outcome?.wicket === "caught");
  if (i.action === "pickup" || i.action === "throw" || groundDive) {
    if (groundDive && memo.pickup !== "slide") memo.pickup = "one-hand";
    const style = memo.pickup ?? "two-hands",
      to = Math.hypot(stumps.x - i.me.x, stumps.z - i.me.z),
      throwStyle = (memo.throwStyle ??= style === "slide" ? "kneeling" : to < UNDERARM ? "underarm" : "overarm");
    const sinceRelease = i.action === "throw" ? age : age - THROW_AFTER * STEP,
      took = memo.took;
    // The first moments: the hands are on the ball where it was, then bring it in.
    const holding = took && i.action === "pickup" ? 1 - smooth((age - 0.06) / 0.12) : 0;
    const right = took && holding > 0 ? goal(took, holding) : null,
      left = took && holding > 0 && style === "two-hands" ? goal(took, holding * 0.9, 0.09) : null;
    const face = { x: stumps.x, z: stumps.z };
    // Done with the ball: hand back to the renderer (reactions, walking back).
    if (i.action === "throw" && sinceRelease > (throwStyle === "underarm" ? 0.8 : i.length("OverhandThrow") - i.throwRelease)) return none;
    if (throwStyle === "underarm")
      return { move: i.action === "throw" ? "throw-underarm" : style === "one-hand" ? "pickup-one-hand" : "pickup-two-hands", pose: { clip: "underarm", time: sinceRelease, weight: 1 }, motion: { lower: 0, upper: 0, shot: null }, left, right, face };
    // Overarm (standing) or from the knee after a slide: the throwing clip, its release on the engine's tick.
    const time = i.throwRelease + sinceRelease,
      rise = smooth((age - 0.05) / 0.16),
      weight = i.action === "throw" ? 1 : rise;
    const crouch = style === "one-hand" ? "reach" : "gather";
    return {
      move: i.action === "throw" ? (throwStyle === "kneeling" ? "throw-kneeling" : "throw-overarm") : rise < 0.5 ? (style === "slide" ? "slide-pickup" : style === "one-hand" ? "pickup-one-hand" : "pickup-two-hands") : "gather",
      pose: throwStyle === "kneeling" ? { clip: "kneel", time: 0, weight: 1 } : { clip: crouch, time: 0, weight: 1 - weight },
      motion: { lower: throwStyle === "kneeling" ? 0 : weight, upper: weight, shot: { clip: "OverhandThrow", time, weight: 1 } },
      left,
      right,
      face,
    };
  }

  // ---- the catch itself and what follows ---------------------------------------
  // A finished catch hands over to the celebration; a dive to the get-up.
  if ((i.action === "catch" && age > 0.85) || (i.action === "dive" && i.dead && i.deadAge > 1.0) || (i.action === "drop" && age > 0.6)) return none;
  if (i.action === "catch" || i.action === "dive" || i.action === "drop") {
    const took = (memo.took ??= [i.ball.x, i.ball.y, i.ball.z]),
      byHeight: CatchStyle = took[1] < 0.8 ? "low" : took[1] < 1.45 ? "chest" : "high",
      // The engine's action is the truth; the memo only refines a standing catch (a leap).
      style: CatchStyle = i.action === "dive" ? "dive" : memo.catchStyle === "leap" && took[1] > 1.6 ? "leap" : byHeight;
    // Hands stay on the ball as it's taken, then give and bring it in.
    const hold = 1 - smooth((age - 0.12) / 0.2);
    // A drop: the hands were there (both, so it's clear it was a chance) and the ball goes on its way.
    if (i.action === "drop") return { move: "drop", pose: null, motion: { lower: 0, upper: 0, shot: null }, ...catchHands(took, hold, i.me, false), face: null };
    if (i.action === "dive" || style === "dive") {
      // Down and still; the get-up is the renderer's (a real clip), after the ball is dead.
      const diveStop = !i.dead;
      if (diveStop && i.mode !== "dead")
        return { move: "dive-stop", pose: { clip: "dive", time: 0.22 + age, weight: 1 }, motion: { lower: 0, upper: 0, shot: null }, ...catchHands(took, hold, i.me, memo.oneHand), face: null };
      return { move: "dive", pose: { clip: "dive", time: 0.22 + age, weight: 1 }, motion: { lower: 0, upper: 0, shot: null }, ...catchHands(took, hold, i.me, memo.oneHand), face: null };
    }
    const clip: ClipName = style === "low" ? "catchLow" : style === "chest" ? "catchChest" : "catchHigh";
    if (style === "leap") {
      const land = i.length("Jump_Land");
      return { move: "catch-leap", pose: null, motion: { lower: 1, upper: 0, shot: { clip: "Jump_Land", time: Math.min(land, age), weight: 1 - smooth((age - land + 0.3) / 0.3) } }, ...catchHands(took, hold, i.me, memo.oneHand), face: null };
    }
    return { move: style === "low" ? "catch-low" : style === "chest" ? "catch-chest" : "catch-high", pose: { clip, time: Math.min(0.3, age * 0.8), weight: 1 - smooth((age - 0.55) / 0.3) }, motion: { lower: 0, upper: 0, shot: null }, ...catchHands(took, hold, i.me, memo.oneHand), face: null };
  }

  // ---- running at the ball: anticipate the pickup or the catch ----------------
  if (i.involved && !i.dead && i.action === "run") {
    const from = i.contactTick !== undefined && i.contactTick >= 0 ? Math.max(0, (i.contactTick + FIELD_AFTER - i.tick) * STEP) : 0,
      at = predictIntercept(i.ball, i.me, i.friction, 1.4, from);
    if (!at) return { move: "chase", pose: null, motion: null, left: null, right: null, face: null };
    const committed = smooth(1 - at.tau / (at.kind === "pickup" ? 0.45 : 0.55)),
      p = follow(memo, at.point, dt, committed);
    if (at.kind === "pickup") {
      // Commit to a style once, as the ball comes into reach.
      if (!memo.pickup && at.tau < 0.5) memo.pickup = i.me.speed > 4.6 && i.rope > 0.8 ? "slide" : i.me.speed > 3.4 ? "one-hand" : "two-hands";
      const style = memo.pickup ?? "two-hands",
        w = smooth(1 - at.tau / 0.45);
      if (style === "slide") {
        // The slide's own collect (60% through) lands on the engine's pickup.
        const collect = i.length("Slide_Start") * 0.62;
        return { move: "slide-pickup", pose: null, motion: { lower: 1, upper: 1, shot: { clip: "Slide_Start", time: collect - at.tau, weight: smooth(1 - at.tau / 0.35) } }, left: null, right: goal(p, w), face: committed > 0.35 ? { x: p[0], z: p[2] } : null };
      }
      if (style === "one-hand") return { move: "pickup-one-hand", pose: { clip: "reach", time: 0, weight: w }, motion: { lower: 1, upper: 1 - w, shot: null }, left: null, right: goal(p, w), face: committed > 0.35 ? { x: p[0], z: p[2] } : null };
      return { move: at.tau < 0.45 ? "pickup-two-hands" : "attack-ball", pose: { clip: "gather", time: 0, weight: w }, motion: { lower: 1 - w, upper: 1 - w, shot: null }, left: goal(p, w * 0.95, 0.09), right: goal(p, w), face: committed > 0.35 ? { x: p[0], z: p[2] } : null };
    }
    // Airborne: hands to the predicted catch; a dive launches just before.
    const height = at.point[1];
    // The read refines until a dive or leap would have to launch (0.24 s), then it's committed.
    if (at.tau < 0.55 && (!memo.catchStyle || at.tau > 0.24)) {
      memo.catchStyle = at.kind === "dive" ? "dive" : height > 2.0 ? "leap" : height > 1.45 ? "high" : height > 0.8 ? "chest" : "low";
      memo.oneHand = (at.kind === "dive" && at.gap > 1.25) || height > 2.25;
    }
    const style = memo.catchStyle ?? (height > 1.45 ? "high" : height > 0.8 ? "chest" : "low"),
      w = smooth(1 - at.tau / 0.55);
    if (style === "dive") {
      const launch = smooth(1 - at.tau / 0.24);
      return { move: "dive", pose: { clip: "dive", time: Math.max(0, 0.22 - at.tau), weight: launch }, motion: { lower: 1 - launch, upper: 1 - w, shot: null }, ...catchHands(p, w, i.me, memo.oneHand), face: committed > 0.35 ? { x: p[0], z: p[2] } : null };
    }
    if (style === "leap") {
      // Takeoff timed so the hands are at full stretch when the ball arrives.
      const apex = i.length("Jump_Start") * 0.68;
      return { move: "catch-leap", pose: null, motion: { lower: 1, upper: 1 - w, shot: { clip: "Jump_Start", time: apex - at.tau, weight: smooth(1 - at.tau / 0.5) } }, ...catchHands(p, w, i.me, memo.oneHand), face: committed > 0.35 ? { x: p[0], z: p[2] } : null };
    }
    const clip: ClipName = style === "low" ? "catchLow" : style === "chest" ? "catchChest" : "catchHigh";
    return { move: style === "low" ? "catch-low" : style === "chest" ? "catch-chest" : "catch-high", pose: { clip, time: 0, weight: w }, motion: { lower: 1 - w * 0.8, upper: 1 - w, shot: null }, ...catchHands(p, w, i.me, memo.oneHand), face: committed > 0.35 ? { x: p[0], z: p[2] } : null };
  }
  return none;
}

// ---------------------------------------------------------------------------
// Wicketkeeping
// ---------------------------------------------------------------------------

export interface KeeperInput extends FielderInput {
  wicket: Dismissal | null;
  /** A throw is coming in that will hit the stumps directly (the keeper stays out of its way). */
  directHit: boolean;
}

/** Seconds into a stumping when the gloves break the wicket (bails fly then). */
export const STUMPING_HIT = 0.16;

export function keeperPlan(i: KeeperInput, memo: FieldMemo, dt = 1 / 60): FieldPlan {
  const age = i.actionAge + (i.dead ? Math.max(0, i.deadAge) : 0);
  const plan = (move: FieldMove, pose: FieldPlan["pose"], left: HandGoal | null = null, right: HandGoal | null = null): FieldPlan => ({ move, pose, motion: { lower: 0, upper: 0, shot: null }, left, right, face: null });
  if (i.tick < RELEASE_TICK) {
    memo.took = memo.goal = memo.glove = null;
    memo.catchStyle = memo.pickup = memo.throwStyle = null;
    return plan("keeper-crouch", { clip: "keeper", time: 0, weight: 1 });
  }
  // Off the bat, the pad or past the gloves, the keeper fields like anyone else: a dribbled edge, a bye, a catch behind.
  const through = !i.contact && i.ball.vz > 1 && i.ball.z < KEEPER_TAKE_Z + 0.4;
  if (!through && (i.action === "run" || i.action === "pickup" || i.action === "throw" || i.action === "dive" || i.action === "drop" || (i.action === "catch" && i.wicket === "caught"))) {
    // The gloves were already on the delivery's line: carry on from there.
    if (!memo.goal && memo.glove) memo.goal = [...memo.glove] as Vec3;
    return fielderPlan(i, memo, dt);
  }
  // Taken: the ball goes into the gloves where it was, the gloves give back towards the body.
  if (i.action === "catch" && i.dead && (i.wicket === "stumped" ? i.deadAge > 0.9 : age > 0.8)) return { move: "keeper-rise", pose: null, motion: null, left: null, right: null, face: null };
  if (i.action === "catch") {
    const took = (memo.took ??= [i.ball.x, i.ball.y, i.ball.z]),
      low = took[1] < 0.55;
    if (i.wicket === "stumped" && i.dead) {
      const a = i.deadAge,
        bails: Vec3 = [0, 0.66, STUMPS_Z],
        sweep = smooth(a / STUMPING_HIT),
        at: Vec3 = [took[0] + (bails[0] - took[0]) * sweep, took[1] + (bails[1] - took[1]) * sweep, took[2] + (bails[2] - took[2]) * sweep],
        hands = 1 - smooth((a - 0.35) / 0.25);
      return plan("keeper-stumping", { clip: "stumping", time: a, weight: 1 - smooth((a - 0.6) / 0.3) }, goal(at, hands, 0.08), goal(at, hands, -0.01));
    }
    const give = smooth(age / 0.18),
      back: Vec3 = [took[0] * 0.7, took[1] + 0.12 * give, took[2] + 0.22 * give],
      hold = 1 - smooth((age - 0.35) / 0.3);
    return plan("keeper-give", { clip: low ? "keeperLow" : "keeperHigh", time: 0, weight: 1 - smooth((age - 0.4) / 0.4) }, goal(back, hold, 0.08), goal(back, hold, -0.01));
  }
  // The ball coming through: rise with the bounce and take it on the predicted line.
  if (!i.contact && !i.dead) {
    const cross = predictCrossing(i.ball, KEEPER_TAKE_Z, i.friction);
    if (!cross) return plan("keeper-crouch", { clip: "keeper", time: 0, weight: 1 });
    const w = smooth(1 - cross.tau / 0.5),
      p = (memo.glove = ease(memo.glove, [cross.x, cross.y, KEEPER_TAKE_Z], dt, w)),
      high = clamp01((p[1] - 0.35) / 0.65);
    return plan(high > 0.5 ? "keeper-take-high" : w > 0.05 ? "keeper-take-low" : "keeper-crouch", { clip: high > 0.5 ? "keeperHigh" : "keeperLow", time: 0, weight: w * (0.5 + 0.5 * Math.max(high, 1 - high)) }, goal(p, w, 0.08), goal(p, w, -0.01));
  }
  // A throw coming in: up to the stumps, gloves ready; out of the way of a direct hit.
  if (i.mode === "throw" && !i.dead) {
    const near = Math.hypot(i.ball.x - i.me.x, i.ball.z - i.me.z);
    if (i.directHit) return { ...plan("keeper-await-throw", { clip: "keeperRise", time: 1, weight: 1 }), motion: null };
    const w = smooth((9 - near) / 6),
      p: Vec3 = [i.ball.x, Math.max(0.3, i.ball.y), i.ball.z];
    return { ...plan("keeper-takes-throw", { clip: "keeperHigh", time: 0, weight: w }, goal(p, w, 0.08), goal(p, w, -0.01)), motion: null };
  }
  return { move: "keeper-rise", pose: null, motion: null, left: null, right: null, face: null };
}

// ---------------------------------------------------------------------------
// Celebrations and reactions
// ---------------------------------------------------------------------------

/** A small deterministic hash of the player and ball: the same moment always plays the same way. */
export function variety(player: number, seed: number, n: number) {
  let h = Math.imul(player * 2654435761 + seed * 40503 + 17, 2246822519) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2654435761) >>> 0;
  return (h >>> 8) % n;
}

export type Reaction =
  | { kind: "pose"; clip: ClipName; time: number }
  | { kind: "clip"; clip: OneShot; time: number; loop?: boolean; upper?: boolean };

export type ReactionRole = "bowler" | "keeper" | "fielder" | "taker" | "thrower" | "striker" | "non-striker";

/**
 * How a player reacts at the end of a ball. Controlled variety: each player
 * has a few in-character options for each moment, chosen by number and ball,
 * never the same canned move from everyone, and nothing showy.
 */
export function reaction(role: ReactionRole, o: Outcome, age: number, player: number, seed: number, result: "batting-won" | "fielding-won" | null): Reaction | null {
  const pick = (n: number) => variety(player, seed, n);
  const batting = role === "striker" || role === "non-striker";
  if (result) {
    const won = (result === "batting-won") === batting;
    if (won) return pick(3) === 0 ? { kind: "clip", clip: "Yes", time: age, upper: true } : { kind: "pose", clip: "celebrate", time: age + pick(4) * 0.1 };
    return age < 2.5 ? { kind: "pose", clip: pick(2) ? "downcast" : "hands", time: age } : { kind: "clip", clip: "Idle_No_Loop", time: age - 2.5, loop: true, upper: true };
  }
  if (o.wicket) {
    if (batting) return null;
    if (role === "taker") return age < 0.9 ? { kind: "pose", clip: "showCatch", time: age } : pick(2) ? { kind: "clip", clip: "Yes", time: age - 0.9, upper: true } : { kind: "pose", clip: "celebrate", time: age - 0.9 };
    if (role === "thrower") return { kind: "pose", clip: "directHit", time: age };
    if (role === "bowler" || role === "keeper") {
      if ((o.wicket === "lbw" || o.wicket === "stumped") && age < 1.1) return { kind: "pose", clip: "appeal", time: age };
      const t = age - (o.wicket === "lbw" || o.wicket === "stumped" ? 1.1 : 0);
      return [{ kind: "pose", clip: "celebrate", time: t }, { kind: "clip", clip: "Yes", time: t, upper: true }, { kind: "pose", clip: "salute", time: t }][pick(3)] as Reaction;
    }
    // Team-mates: a clap, a fist pump, arms up, then a word in the huddle.
    if (age > 3.2) return { kind: "clip", clip: "Idle_Talking_Loop", time: age - 3.2 + pick(5) * 0.4, loop: true, upper: true };
    return [{ kind: "pose", clip: "clap", time: age }, { kind: "clip", clip: "Yes", time: age, upper: true }, { kind: "pose", clip: "celebrate", time: age + 0.2 }][pick(3)] as Reaction;
  }
  if (o.boundary) {
    if (role === "non-striker") return o.boundary === 6 && pick(2) ? { kind: "pose", clip: "clap", time: age } : { kind: "clip", clip: "Yes", time: age - 0.4, upper: true };
    // The batter holds the finish, then acknowledges it: the bat up for a six, a brief fist pump for a four.
    if (role === "striker") return age < 0.9 ? null : o.boundary === 6 ? { kind: "pose", clip: "celebrate", time: age - 0.9 } : { kind: "clip", clip: "Yes", time: age - 0.9, upper: true };
    if (role === "bowler") return age < 1.6 ? { kind: "pose", clip: pick(2) ? "hands" : "frustrated", time: age } : { kind: "clip", clip: pick(2) ? "Idle_No_Loop" : "Idle_FoldArms_Loop", time: age - 1.6, loop: true, upper: true };
    if (role === "keeper") return { kind: "pose", clip: "hands", time: age };
    return age < 1.4 ? { kind: "pose", clip: "hands", time: age } : pick(3) === 0 ? { kind: "clip", clip: "Idle_FoldArms_Loop", time: age - 1.4, loop: true, upper: true } : null;
  }
  return null;
}
