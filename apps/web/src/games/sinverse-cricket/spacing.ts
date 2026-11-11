import { CREASE_Z, RELEASE_TICK, STUMPS_Z, type Fielder } from "@platform/engines/sinverse-cricket";
import { RELEASE_ROOT, RUN_UP, clamp01, creaseZ, runUpProgress, type BowlingStyle } from "./animation";

/**
 * Where people stand and how they keep out of each other's way. Presentation
 * only: it reads simulation positions and returns display positions, and
 * nothing here is written back to the match, so outcomes and replays can't
 * change.
 *
 * Two parts:
 *  - Choreography: fixed lanes for the bowler, both batters and the umpire, set
 *    so that their paths never cross.
 *  - Separation: every body is a vertical capsule; any two that would overlap
 *    are pushed apart, and whoever is busy with the ball holds their ground.
 */

/** Capsule radius of a player, metres (about half a shoulder width plus a little air). */
export const BODY_RADIUS = 0.36;
/** Closest two body centres may get. */
export const MIN_GAP = BODY_RADIUS * 2;

/**
 * Lanes across the pitch (x, metres; the bowler delivers from +x).
 * The bowler's run-up ends at x = 0.72, so the non-striker backs up on the
 * other side of the stumps and runs wide of the striker's lane.
 */
export const LANES = {
  striker: -0.38,
  strikerRunning: -0.1,
  nonStriker: -1.0,
  nonStrikerRunning: -1.2,
  umpire: -1.05,
} as const;
/** The umpire stands behind the bowler's stumps on the far side from the run-up. */
export const UMPIRE_Z = -STUMPS_Z - 1.55;

export type Spot = { x: number; z: number };

export function batterSpot(striker: boolean, runner: number, batterGroundZ: number): Spot {
  const running = runner > 0;
  if (striker)
    return { x: running ? LANES.strikerRunning : LANES.striker, z: running ? creaseZ(1, runner) : batterGroundZ };
  // Ease out to the running lane over the first stride so the body doesn't jump sideways.
  const u = clamp01(runner * 6);
  return { x: LANES.nonStriker + (LANES.nonStrikerRunning - LANES.nonStriker) * u * u * (3 - 2 * u), z: creaseZ(-1, runner) };
}

export const umpireSpot = (): Spot => ({ x: LANES.umpire, z: UMPIRE_Z });

/** The bowler's root through the run-up, delivery stride and follow-through. */
export function bowlerSpot(tick: number, style: BowlingStyle, frontFootZ: number, sim: Spot, travel: number): Spot {
  if (tick <= RELEASE_TICK) {
    const u = runUpProgress(tick, style),
      startZ = -8.5 + RELEASE_ROOT.z - RUN_UP[style];
    return { x: 0.55 + RELEASE_ROOT.x + (1 - u) * 0.5, z: startZ + (RUN_UP[style] + (frontFootZ + CREASE_Z + 0.23)) * u };
  }
  const f = clamp01((tick - RELEASE_TICK - 6) / 60),
    follow = f * f * (3 - 2 * f) * 1.75,
    fade = 1 - clamp01(travel * 2);
  // The follow-through veers off the pitch, as a bowler must, instead of down the middle.
  return { x: sim.x + (RELEASE_ROOT.x + follow * 0.32) * fade, z: sim.z + (RELEASE_ROOT.z + follow) * fade };
}

/** Evenly spaced places around a team-mate for a wicket celebration: two rings, nobody on top of anybody. */
export function huddleSpot(slot: number, count: number, centre: Spot): Spot {
  const inner = Math.min(count, 6),
    ring = slot < inner ? 0 : 1,
    size = ring ? count - inner : inner,
    angle = ((ring ? slot - inner : slot) / Math.max(1, size)) * Math.PI * 2 + ring * 0.5,
    radius = ring ? 2.45 : 1.45;
  return { x: centre.x + Math.sin(angle) * radius, z: centre.z + Math.cos(angle) * radius };
}

/**
 * Pushes overlapping bodies apart in place. `xz` holds x,z pairs and `hold[n]`
 * ranks who gives way:
 *   2  fixed to a lane (both batters, the bowler in his action); never moved
 *   1  busy with the ball (chasing, gathering, catching, throwing, keeping)
 *   0  free to step aside
 * The lower rank moves the whole distance; equals share it, except two fixed
 * bodies, whose lanes are separate by design. The push is a continuous function
 * of the positions, so nobody snaps. Deterministic: same input, same output.
 */
export function separate(xz: Float32Array, hold: Uint8Array, count: number, gap = MIN_GAP, passes = 4) {
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let a = 0; a < count; a++)
      for (let b = a + 1; b < count; b++) {
        if (hold[a] === 2 && hold[b] === 2) continue;
        let dx = xz[b * 2]! - xz[a * 2]!,
          dz = xz[b * 2 + 1]! - xz[a * 2 + 1]!;
        const d2 = dx * dx + dz * dz;
        if (d2 >= gap * gap) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) {
          // Exactly coincident: pick a stable direction from the pair's indices.
          const angle = (a * 7 + b * 13) * 0.61;
          dx = Math.sin(angle);
          dz = Math.cos(angle);
          d = 1;
        }
        const push = gap - (d2 < 1e-8 ? 0 : d),
          shareA = hold[a]! > hold[b]! ? 0 : hold[a]! < hold[b]! ? 1 : 0.5,
          shareB = 1 - shareA;
        xz[a * 2] = xz[a * 2]! - (dx / d) * push * shareA;
        xz[a * 2 + 1] = xz[a * 2 + 1]! - (dz / d) * push * shareA;
        xz[b * 2] = xz[b * 2]! + (dx / d) * push * shareB;
        xz[b * 2 + 1] = xz[b * 2 + 1]! + (dz / d) * push * shareB;
        moved = true;
      }
    if (!moved) break;
  }
  return xz;
}

/** Smallest centre-to-centre distance among the first `count` bodies. */
export function closestPair(xz: Float32Array, count: number) {
  let best = Infinity;
  for (let a = 0; a < count; a++)
    for (let b = a + 1; b < count; b++) best = Math.min(best, Math.hypot(xz[b * 2]! - xz[a * 2]!, xz[b * 2 + 1]! - xz[a * 2 + 1]!));
  return best;
}

/** Cast order used by the renderer: two batters, nine fielders, bowler, keeper, umpire. */
export const PEOPLE = 14;
const STRIKER = 0,
  NON_STRIKER = 1,
  BOWLER = 11,
  KEEPER = 12,
  UMPIRE = 13;

export interface Staging {
  tick: number;
  style: BowlingStyle;
  runner: number;
  batterGroundZ: number;
  bowlerFootZ: number;
  /** The eleven fielding positions from the simulation (index 9 bowler, 10 keeper). */
  fielders: readonly Spot[];
  actions: readonly Fielder["action"][];
  travel: readonly number[];
  /** Seconds into a wicket celebration, or negative when there is none. */
  huddleAge: number;
  dismissedStriker: boolean;
  /** 0..1 through the walk-on, or negative when not walking on. */
  entry: number;
  keepClear: boolean;
  /** Where the eleven started this ball (the first frame), for walking in and walking back. */
  starts?: readonly Spot[];
  /** Seconds since a ball without a wicket ended, or negative: fielders walk back to their marks. */
  returnAge?: number;
  /** Extra display offsets (x,z pairs per person), e.g. a fielder's momentum carrying past a pickup. */
  offsets?: Float32Array;
}

/** How far ring and outfielders stand back before walking in with the bowler, metres. */
export const WALK_IN = 1.2;
/** Brisk walking pace back to a fielding position, m/s. */
export const RETURN_SPEED = 1.5;
/** Fielders this close to the striker (slips, gully, short leg) stay set instead of walking in. */
export const CLOSE_IN = 15;

/**
 * A ring fielder's walk in as the bowler runs up: from WALK_IN behind the mark,
 * arriving exactly on it at release, so nothing differs from the simulation once
 * the ball is in play.
 */
export function walkInOffset(tick: number, spot: Spot): Spot {
  const dx = spot.x - LANES.striker,
    dz = spot.z - CREASE_Z,
    d = Math.hypot(dx, dz);
  if (d < CLOSE_IN || tick >= RELEASE_TICK) return { x: 0, z: 0 };
  const u = clamp01((tick - 25) / (RELEASE_TICK - 25)),
    back = WALK_IN * (1 - u * u * (3 - 2 * u));
  return { x: (dx / d) * back, z: (dz / d) * back };
}

/**
 * Fills `spots` (x,z pairs) and `holds` with where all fourteen people are
 * shown this frame. This is the single source of on-field positions for the
 * renderer, and the tests run it against real simulated deliveries.
 */
export function place(s: Staging, spots: Float32Array, holds: Uint8Array) {
  const huddle = s.huddleAge > 0,
    anchor = huddle ? (s.fielders.find((_, k) => s.actions[k] === "catch" || s.actions[k] === "dive" || s.actions[k] === "throw") ?? s.fielders[9]!) : null;
  for (let n = 0; n < PEOPLE; n++) {
    let spot: Spot,
      hold = 2;
    if (n === STRIKER || n === NON_STRIKER) spot = batterSpot(n === STRIKER, s.runner, s.batterGroundZ);
    else if (n === UMPIRE) {
      spot = umpireSpot();
      hold = 0;
    } else {
      const f = s.fielders[n - 2]!,
        action = s.actions[n - 2] ?? "ready",
        travel = s.travel[n - 2] ?? 0;
      spot = n === BOWLER ? bowlerSpot(s.tick, s.style, s.bowlerFootZ, f, travel) : { x: f.x, z: f.z };
      if (n !== BOWLER && n !== KEEPER) {
        const start = s.starts?.[n - 2];
        if (s.tick < RELEASE_TICK && s.tick >= 0) {
          const w = walkInOffset(s.tick, spot);
          spot = { x: spot.x + w.x, z: spot.z + w.z };
        } else if (start && (s.returnAge ?? -1) > 0) {
          // Back to the walk-in mark at a walk once the ball is dead.
          const w = walkInOffset(1, start),
            to = { x: start.x + w.x, z: start.z + w.z },
            far = Math.hypot(to.x - spot.x, to.z - spot.z),
            reach = Math.min(1, ((s.returnAge ?? 0) * RETURN_SPEED) / Math.max(1e-3, far));
          spot = { x: spot.x + (to.x - spot.x) * reach, z: spot.z + (to.z - spot.z) * reach };
        }
      }
      // The bowler owns his lane through the action; anyone on the ball outranks a bystander.
      hold = n === BOWLER && s.tick <= RELEASE_TICK + 70 ? 2 : n === BOWLER || n === KEEPER || action !== "ready" || travel > 0.02 ? 1 : 0;
      if (anchor && f !== anchor && action !== "dive") {
        const to = huddleSpot(n - 2, 11, anchor),
          reach = Math.min(1, (s.huddleAge * 3) / Math.max(1, Math.hypot(to.x - spot.x, to.z - spot.z)));
        spot = { x: spot.x + (to.x - spot.x) * reach, z: spot.z + (to.z - spot.z) * reach };
        hold = 0;
      }
    }
    if (huddle && n === (s.dismissedStriker ? STRIKER : NON_STRIKER)) {
      const u = clamp01(s.huddleAge / 3.2);
      spot = { x: spot.x + u * 4, z: spot.z + u * 2.8 };
    }
    if (s.entry >= 0) spot = { x: spot.x + (n % 2 ? -1.4 : 1.4) * (1 - s.entry), z: spot.z - 2.2 * (1 - s.entry) };
    if (s.offsets) spot = { x: spot.x + s.offsets[n * 2]!, z: spot.z + s.offsets[n * 2 + 1]! };
    spots[n * 2] = spot.x;
    spots[n * 2 + 1] = spot.z;
    holds[n] = hold;
  }
  if (s.keepClear) separate(spots, holds, PEOPLE);
}
