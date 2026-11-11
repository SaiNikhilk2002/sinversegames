import { RELEASE_TICK, VENUES, type CricketConfig, type Frame, type Outcome } from "@platform/engines/sinverse-cricket";

/**
 * The broadcast director: chooses a camera from what the simulation has done.
 * Pure and read-only. It produces where the camera wants to be and how quickly
 * it should get there; the scene eases towards that with frame-rate-independent
 * damping. Nothing here touches the match, and slow motion only stretches
 * presentation time (simulation ticks stay fixed).
 */

export type CameraName = "broadcast" | "batter" | "bowler" | "runup" | "bowling" | "side" | "closeup" | "behind" | "keeper" | "slip" | "fielding" | "boundary" | "aerial" | "stadium" | "track" | "director";
export const CAMERA_LABELS: Record<CameraName, string> = {
  broadcast: "Broadcast",
  batter: "Batter end",
  bowler: "Behind the bowler",
  runup: "Bowler run-up",
  bowling: "Side-on bowling",
  side: "Side on",
  closeup: "Batting close-up",
  fielding: "Fielding",
  stadium: "Stadium",
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
  /** Tick the bat met the ball (-1 if it hasn't), for holding the shot through contact. */
  contactTick?: number;
  /** Actual reaction actor's presentation position, after a confirmed wicket. */
  reaction?: { x: number; y: number; z: number };
  /** The bowler's presentation position. */
  bowler?: { x: number; z: number };
  /** The fielder going for the ball, or holding it (presentation position). */
  fielder?: { x: number; z: number };
  /** A break in play the broadcast covers: an over, the innings, the result. */
  interlude?: "over" | "innings" | "result" | null;
  /** Wall-clock seconds, for slow establishing moves. */
  time?: number;
}

const shot = (name: string, p: [number, number, number], l: [number, number, number], fov = 40, rate = 4, lookRate = 7): Shot => ({ name, px: p[0], py: p[1], pz: p[2], lx: l[0], ly: l[1], lz: l[2], fov, rate, lookRate });

const FIXED: Partial<Record<CameraName, (i: DirectorInput) => Shot>> = {
  broadcast: () => shot("broadcast", [-1.2, 8.5, -33], [0, 0.9, 6], 28, 3),
  batter: () => shot("batter", [0.8, 2.75, 15.6], [0, 1.0, -4], 42),
  bowler: () => shot("bowler", [-1.4, 4.1, -23], [0, 0.7, 7], 34),
  side: () => shot("side", [31, 6.5, 2], [0, 1.1, 1], 36),
  // Side-on from point, close: the batter's feet, hips, shoulders and bat through the shot.
  closeup: (i) => shot("closeup", [i.batterX + 4.4, 1.15, i.batterZ - 0.5], [i.batterX + 0.2, 0.92, i.batterZ - 0.45], 34),
  behind: () => shot("behind", [-2.1, 2.45, 15.6], [0.25, 0.95, 3], 34),
  keeper: () => shot("keeper", [1.35, 1.8, 15], [0, 0.95, 7.5], 32),
  slip: () => shot("slip", [4.6, 1.7, 13.4], [-0.3, 0.8, 7.5], 32),
  boundary: (i) => {
    const v = VENUES[i.config.venue];
    return shot("boundary", [-v.radiusX * 0.72, 2.2, v.radiusZ * 0.55], [0, 1.1, 4], 30, 3);
  },
  aerial: () => shot("aerial", [0.1, 78, 26], [0, 0, 0], 42, 2.5),
  // Alongside the bowler as he runs in, low, keeping the stumps and batter in the background.
  runup: (i) => {
    const b = i.bowler ?? { x: 0.9, z: -20 };
    return shot("runup", [b.x + 3.6, 1.9, b.z - 5.2], [b.x * 0.6, 1.35, b.z + 6], 38, 5, 8);
  },
  // Square of the bowler's delivery stride, at hip height: the action from front foot to follow-through.
  bowling: (i) => {
    const b = i.bowler ?? { x: 0.7, z: -9.7 },
      z = Math.min(-6, Math.max(-12, b.z));
    return shot("bowling", [10.5, 1.5, z], [0.45, 1.25, z + 0.4], 30, 4, 7);
  },
  fielding: (i) => fieldingShot(i),
  stadium: (i) => establishing(i, "stadium"),
};

/** A slow, high orbit of the whole ground: the stadium, the field, the light. */
function establishing(i: DirectorInput, name: string): Shot {
  const v = VENUES[i.config.venue],
    a = 0.6 + (i.time ?? 0) * 0.05;
  return shot(name, [Math.sin(a) * v.radiusX * 0.95, 30, Math.cos(a) * v.radiusZ * 0.95], [0, 0, 0], 44, 1.2, 1.5);
}

/**
 * Down on the field beside whoever is going for the ball, outside them so the
 * ball and the fielder are both in frame, and nobody steps between.
 */
function fieldingShot(i: DirectorInput): Shot {
  const f = i.fielder ?? { x: i.frame.ball.x, z: i.frame.ball.z },
    b = i.frame.ball,
    out = Math.hypot(f.x, f.z) || 1,
    rx = f.x / out,
    rz = f.z / out;
  // Behind the fielder (further from the pitch), off to one side, and high enough
  // that a backing-up team-mate passing below doesn't fill the frame.
  const px = f.x + rx * 7.5 - rz * 4,
    pz = f.z + rz * 7.5 + rx * 4;
  return shot("fielding", [px, 3.1, pz], [(f.x + b.x) / 2, 0.85, (f.z + b.z) / 2], 27, 3.5, 6);
}

/** The finish: a slow move round the players who decided it. */
function resultShot(i: DirectorInput): Shot {
  const c = i.reaction ?? { x: i.batterX, y: 0, z: i.batterZ },
    a = (i.time ?? 0) * 0.12;
  return shot("result", [c.x + Math.sin(a) * 6.5, 2.1, c.z + Math.cos(a) * 6.5], [c.x, 1.25, c.z], 32, 2, 4);
}

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
    if (i.bowler) return { ...FIXED.runup!(i), name: "bowler-run-up" };
    const u = Math.max(0, frame.tick / (RELEASE_TICK - 40));
    return shot("bowler-run-up", [-3.6, 2.4 + u, -29 + u * 12], [0.65, 1.1, -23 + u * 14], 42, 4, 6);
  }

  // End-of-ball reaction shots.
  if (outcome && deadAge >= 0) {
    // The result: the deciding moment first, then a slow move round those who won it.
    if (i.interlude === "result" && deadAge > 2.4) return resultShot(i);
    // Breaks in play: the ground from above while the scoreboard has its say.
    if ((i.interlude === "over" || i.interlude === "innings") && deadAge > 2.2) return establishing(i, `interlude-${i.interlude}`);
    if (outcome.boundary === 6 || outcome.boundary === 4) {
      if (deadAge < 1.0) return boundaryShot(i);
      return shot("celebration", [i.batterX + 3.2, 1.75, i.batterZ - 4.6], [i.batterX, 1.3, i.batterZ], 30, 3, 5);
    }
    if (outcome.wicket) {
      if (i.reaction && deadAge > 1.2) {
        const p = i.reaction;
        // High enough and far enough back that team-mates arriving in the huddle don't stand in front of the player.
        return shot(`celebration-${outcome.wicket}`, [p.x + 5.2, 2.7, p.z + 6], [p.x, 1.25, p.z], 30, 2.8, 5);
      }
      if (outcome.wicket === "bowled" || outcome.wicket === "stumped") return shot("wicket-stumps", [1.9, 0.72, 13.2], [0, 0.48, 10.0], 30, 5, 8);
      if (outcome.wicket === "lbw") return shot("wicket-appeal", [-1.2, 2.2, -7], [0.2, 1.2, 8.5], 26, 3);
      if (outcome.wicket === "run-out") return shot("wicket-runout", [5.5, 1.1, 10.6], [0, 0.6, 9.4], 30, 4, 7);
      if (deadAge < 1.2) return tracking(i, 3.5, 8);
      return shot("wicket-caught", [i.batterX + 3, 1.7, i.batterZ - 3.8], [i.batterX, 1.25, i.batterZ], 32, 3);
    }
  }
  // The replay director: the delivery from behind the bowler, then a cut to
  // side-on close to the batter as the ball arrives, held through the shot.
  if (camera === "director" && i.replay) {
    const since = frame.contact && i.contactTick !== undefined && i.contactTick >= 0 ? frame.tick - i.contactTick : -1;
    // Over the bowler's arm, clear of the non-striker and umpire on the other side.
    if (!frame.contact && frame.ball.z < 1.5) return shot("replay-delivery", [1.7, 2.8, -15.5], [-0.25, 1.0, i.batterZ], 22, 60, 60);
    if (!frame.contact || since < 54) return { ...FIXED.closeup!(i), name: "replay-closeup" };
    // Then the fielding: on the ground with whoever goes for it, once it's near them.
    if (i.fielder && frame.bounce && Math.hypot(i.fielder.x - frame.ball.x, i.fielder.z - frame.ball.z) < 12 && frame.mode !== "throw") return { ...fieldingShot(i), name: "replay-fielding" };
  }
  // Ball in play.
  if (frame.contact) {
    const ratio = ropeRatio(frame.ball, i.config.venue);
    if (!frame.bounce && frame.ball.y > 2.2 && ratio > 0.68) return boundaryShot(i);
    // A ground ball about to be fielded: down beside the fielder.
    if (i.fielder && frame.bounce && frame.mode !== "throw" && Math.hypot(i.fielder.x - frame.ball.x, i.fielder.z - frame.ball.z) < 10 && Math.hypot(frame.ball.x, frame.ball.z) > 14) return fieldingShot(i);
    return tracking(i);
  }
  if (frame.mode === "throw") return shot("throw", [-3, 6, 21], [frame.ball.x * 0.3, 1, Math.max(4, frame.ball.z * 0.5)], 36, 3);
  if (camera === "director") return { ...FIXED.closeup!(i), name: "replay-closeup" };
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
