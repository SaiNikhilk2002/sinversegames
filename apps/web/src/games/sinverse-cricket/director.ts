import { RELEASE_TICK, VENUES, type CricketConfig, type Frame, type Outcome } from "@platform/engines/sinverse-cricket";

/**
 * The broadcast director: chooses a camera from what the simulation has done.
 * Pure and read-only. It produces where the camera wants to be and how quickly
 * it should get there; the scene eases towards that with frame-rate-independent
 * damping. Nothing here touches the match, and slow motion only stretches
 * presentation time (simulation ticks stay fixed).
 */

export type CameraName = "broadcast" | "batter" | "bowler" | "side" | "behind" | "keeper" | "slip" | "boundary" | "aerial" | "track" | "director";
export const CAMERA_LABELS: Record<CameraName, string> = {
  broadcast: "Broadcast",
  batter: "Batter end",
  bowler: "Bowler end",
  side: "Side on",
  behind: "Behind batter",
  keeper: "Keeper",
  slip: "Slip",
  boundary: "Boundary",
  aerial: "Aerial",
  track: "Ball tracking",
  director: "Replay director",
};

export type Shot = {
  name: string;
  px: number;
  py: number;
  pz: number;
  lx: number;
  ly: number;
  lz: number;
  fov: number;
  /** Larger reaches the target faster (1/seconds). */
  rate: number;
  lookRate: number;
};

export interface DirectorInput {
  camera: CameraName;
  frame: Pick<Frame, "tick" | "ball" | "contact" | "mode" | "bounce">;
  outcome: Outcome | null;
  deadAge: number;
  humanBatting: boolean;
  config: Pick<CricketConfig, "venue">;
  /** Where the last-moving action is, for reaction shots. */
  batterX: number;
  batterZ: number;
  replay: boolean;
  /** Actual reaction actor's presentation position, after a confirmed wicket. */
  reaction?: { x: number; y: number; z: number };
}

const shot = (name: string, p: [number, number, number], l: [number, number, number], fov = 40, rate = 4, lookRate = 7): Shot => ({ name, px: p[0], py: p[1], pz: p[2], lx: l[0], ly: l[1], lz: l[2], fov, rate, lookRate });

const FIXED: Partial<Record<CameraName, (i: DirectorInput) => Shot>> = {
  broadcast: () => shot("broadcast", [-1.2, 8.5, -33], [0, 0.9, 6], 28, 3),
  batter: () => shot("batter", [0.8, 2.75, 15.6], [0, 1.0, -4], 42),
  bowler: () => shot("bowler", [-1.4, 4.1, -23], [0, 0.7, 7], 34),
  side: () => shot("side", [31, 6.5, 2], [0, 1.1, 1], 36),
  behind: () => shot("behind", [-2.1, 2.45, 15.6], [0.25, 0.95, 3], 34),
  keeper: () => shot("keeper", [1.35, 1.8, 15], [0, 0.95, 7.5], 32),
  slip: () => shot("slip", [4.6, 1.7, 13.4], [-0.3, 0.8, 7.5], 32),
  boundary: (i) => {
    const v = VENUES[i.config.venue];
    return shot("boundary", [-v.radiusX * 0.72, 2.2, v.radiusZ * 0.55], [0, 1.1, 4], 30, 3);
  },
  aerial: () => shot("aerial", [0.1, 78, 26], [0, 0, 0], 42, 2.5),
};

function tracking(i: DirectorInput, height = 9, back = 17): Shot {
  const b = i.frame.ball,
    // Stay behind the line of the ball and over the pitch side, looking up as it climbs.
    side = b.x >= 0 ? -1 : 1;
  return shot("track", [b.x * 0.55 + side * 9, Math.max(height, b.y * 0.9 + 4), b.z * 0.55 + (b.z > 4 ? back : back * 0.55)], [b.x * 0.85, Math.max(0.8, b.y * 0.9), b.z * 0.85], 34, 3.2, 6);
}

/** How the crossing of the rope is framed for a ball in the air. */
function boundaryShot(i: DirectorInput): Shot {
  const b = i.frame.ball,
    v = VENUES[i.config.venue],
    a = Math.atan2(b.x / v.radiusX, b.z / v.radiusZ),
    // Down on the ropes, off to one side of where the ball is going.
    px = Math.sin(a + 0.55) * v.radiusX * 0.82,
    pz = Math.cos(a + 0.55) * v.radiusZ * 0.82;
  return shot("boundary-follow", [px, 2.4, pz], [Math.sin(a) * v.radiusX, Math.max(1.5, b.y), Math.cos(a) * v.radiusZ], 30, 2.2, 5);
}

/** The ellipse ratio of the ball's position: 1 is on the rope. */
export function ropeRatio(b: { x: number; z: number }, venue: CricketConfig["venue"]) {
  const v = VENUES[venue];
  return Math.hypot(b.x / v.radiusX, b.z / v.radiusZ);
}

/**
 * Presentation slow motion for a ball sailing towards the rope in the air.
 * Multiplies wall-clock time only, so the same ticks produce the same result.
 */
export function presentationRate(state: { hit: boolean; groundAfterHit: boolean; y: number; vy: number; x: number; z: number; venue: CricketConfig["venue"]; finished: boolean; reduced: boolean }) {
  if (state.reduced || state.finished || !state.hit || state.groundAfterHit) return 1;
  const ratio = ropeRatio(state, state.venue);
  if (state.y < 2.4 || ratio < 0.62) return 1;
  return Math.max(0.32, 1 - (ratio - 0.62) * 3.4);
}

/** Chooses the camera for this moment. Selected views win; auto directs by event. */
export function direct(i: DirectorInput): Shot {
  const { frame, outcome, deadAge, camera } = i;
  const fixed = FIXED[camera];
  const isAuto = camera === "broadcast" || camera === "director";
  if (!isAuto) return camera === "track" ? tracking(i) : fixed!(i);

  // Track the approach, then settle behind the batter before the hand releases.
  // Selected fixed cameras remain available, including for reduced-motion play.
  if (!outcome && frame.tick > 0 && frame.tick < RELEASE_TICK - 40 && !i.replay) {
    const u = Math.max(0, frame.tick / (RELEASE_TICK - 40));
    return shot("bowler-run-up", [-3.6, 2.4 + u, -29 + u * 12], [0.65, 1.1, -23 + u * 14], 42, 4, 6);
  }

  // End-of-ball reaction shots.
  if (outcome && deadAge >= 0) {
    if (outcome.boundary === 6 || outcome.boundary === 4) {
      if (deadAge < 1.0) return boundaryShot(i);
      return shot("celebration", [i.batterX + 3.2, 1.75, i.batterZ - 4.6], [i.batterX, 1.3, i.batterZ], 30, 3, 5);
    }
    if (outcome.wicket) {
      if (i.reaction && deadAge > 1.2) {
        const p = i.reaction;
        return shot(`celebration-${outcome.wicket}`, [p.x + 3.6, 1.8, p.z + 4.2], [p.x, 1.2, p.z], 34, 2.8, 5);
      }
      if (outcome.wicket === "bowled" || outcome.wicket === "stumped") return shot("wicket-stumps", [1.9, 0.72, 13.2], [0, 0.48, 10.0], 30, 5, 8);
      if (outcome.wicket === "lbw") return shot("wicket-appeal", [-1.2, 2.2, -7], [0.2, 1.2, 8.5], 26, 3);
      if (outcome.wicket === "run-out") return shot("wicket-runout", [5.5, 1.1, 10.6], [0, 0.6, 9.4], 30, 4, 7);
      if (deadAge < 1.2) return tracking(i, 3.5, 8);
      return shot("wicket-caught", [i.batterX + 3, 1.7, i.batterZ - 3.8], [i.batterX, 1.25, i.batterZ], 32, 3);
    }
  }
  // Ball in play.
  if (frame.contact) {
    const ratio = ropeRatio(frame.ball, i.config.venue);
    if (!frame.bounce && frame.ball.y > 2.2 && ratio > 0.68) return boundaryShot(i);
    return tracking(i);
  }
  if (frame.mode === "throw") return shot("throw", [-3, 6, 21], [frame.ball.x * 0.3, 1, Math.max(4, frame.ball.z * 0.5)], 36, 3);
  if (camera === "director") return shot("replay-side", [11, 2.2, 6], [0, 1, Math.max(0, Math.min(9, frame.ball.z))], 38, 3.5);
  // Before the ball is bowled: the player's working view, settled well before release.
  if (frame.tick < RELEASE_TICK + 8 || !frame.contact) return i.humanBatting ? FIXED.batter!(i) : FIXED.bowler!(i);
  return FIXED.broadcast!(i);
}

/** How excited the crowd is, from genuine match events only. */
export function crowdEnergy(s: { outcome: Outcome | null; deadAge: number; ballRatio: number; inAir: boolean; reduced: boolean }) {
  if (s.outcome && s.deadAge >= 0) {
    const fade = Math.max(0.15, 1 - s.deadAge * 0.16);
    if (s.outcome.boundary === 6) return fade;
    if (s.outcome.wicket) return 0.85 * fade;
    if (s.outcome.boundary === 4) return 0.62 * fade;
    return 0.1;
  }
  if (s.inAir) return 0.1 + s.ballRatio * 0.42;
  return 0.07;
}

// ---------------------------------------------------------------------------
// Adaptive quality: only reacts to sustained measurements, with hysteresis.
// ---------------------------------------------------------------------------

export type GraphicsLevel = "low" | "medium" | "high" | "ultra";
const LADDER: GraphicsLevel[] = ["low", "medium", "high", "ultra"];

export class QualityGovernor {
  private samples: number[] = [];
  private slow = 0;
  private fast = 0;
  private cooldownUntil = 0;
  constructor(
    private readonly slowMs = 38,
    private readonly fastMs = 19,
    private readonly window = 90,
    private readonly slowWindows = 3,
    private readonly fastWindows = 8,
  ) {}
  /** Feeds one frame interval. Returns a new level only when a change is warranted. */
  sample(frameMs: number, nowMs: number, level: GraphicsLevel): GraphicsLevel | null {
    this.samples.push(frameMs);
    if (this.samples.length < this.window) return null;
    const sorted = [...this.samples].sort((a, b) => a - b),
      median = sorted[Math.floor(sorted.length / 2)]!;
    this.samples.length = 0;
    if (nowMs < this.cooldownUntil) return null;
    if (median > this.slowMs) {
      this.slow++;
      this.fast = 0;
    } else if (median < this.fastMs) {
      this.fast++;
      this.slow = 0;
    } else {
      this.slow = 0;
      this.fast = 0;
    }
    const at = LADDER.indexOf(level);
    if (this.slow >= this.slowWindows && at > 0) {
      this.slow = 0;
      // Going back up is much slower than coming down, so it can't oscillate.
      this.cooldownUntil = nowMs + 8000;
      this.fast = -8;
      return LADDER[at - 1]!;
    }
    if (this.fast >= this.fastWindows && at < 2) {
      this.fast = 0;
      this.cooldownUntil = nowMs + 20000;
      return LADDER[at + 1]!;
    }
    return null;
  }
}
