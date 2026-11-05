import { seededRng } from "../core/seeded";
import { fieldPositions, VENUES } from "./content";
import {
  adjudicate,
  BALL_RADIUS,
  clamp,
  copy,
  CREASE_Z,
  distance,
  RELEASE_TICK,
  RUN_DISTANCE,
  STEP,
  STUMPS_Z,
  vec,
  type BowlingInput,
  type CricketConfig,
  type Fielder,
  type FieldName,
  type Frame,
  type Outcome,
  type ShotInput,
  type Vec,
} from "./domain";

const q = (n: number) => Math.round(n * 1e6) / 1e6;
export function boundaryCrossed(p: Vec, venue: CricketConfig["venue"]) {
  const v = VENUES[venue];
  return (p.x / v.radiusX) ** 2 + (p.z / v.radiusZ) ** 2 >= 1;
}
export function stumpIntersection(a: Vec, b: Vec, end = STUMPS_Z) {
  if ((a.z - end) * (b.z - end) > 0 || a.z === b.z) return false;
  const t = (end - a.z) / (b.z - a.z),
    x = a.x + (b.x - a.x) * t,
    y = a.y + (b.y - a.y) * t;
  return (
    Math.abs(x) <= 0.1143 + BALL_RADIUS && y >= 0 && y <= 0.7112 + BALL_RADIUS
  );
}
export function integrateBall(
  pos: Vec,
  velocity: Vec,
  spin: number,
  swing: number,
  venue: CricketConfig["venue"],
  struck: boolean,
  topspin = 0,
) {
  const ground = pos.y <= BALL_RADIUS + 0.002 && Math.abs(velocity.y) < 0.5;
  if (ground) {
    const speed = Math.hypot(velocity.x, velocity.z),
      drag = VENUES[venue].friction * 9.81 * STEP;
    const ratio = speed > 0 ? Math.max(0, speed - drag) / speed : 0;
    velocity.x *= ratio;
    velocity.z *= ratio;
    velocity.y = 0;
  } else {
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    velocity.x +=
      (swing + spin * velocity.z * 0.012 - velocity.x * speed * 0.0008) * STEP;
    velocity.y +=
      (-9.81 -
        velocity.y * speed * 0.0008 -
        topspin * Math.abs(velocity.z) * 0.035) *
      STEP;
    velocity.z += -velocity.z * speed * 0.0008 * STEP;
  }
  pos.x = q(pos.x + velocity.x * STEP);
  pos.y = q(pos.y + velocity.y * STEP);
  pos.z = q(pos.z + velocity.z * STEP);
  let bounced = false;
  if (pos.y < BALL_RADIUS) {
    pos.y = BALL_RADIUS;
    if (velocity.y < -0.5) {
      const onPitch = Math.abs(pos.x) < 1.55 && Math.abs(pos.z) < STUMPS_Z + 1;
      velocity.y =
        -velocity.y *
        (onPitch && !struck
          ? VENUES[venue].bounce * (1 + topspin * 0.04)
          : 0.32);
      velocity.x += !struck ? spin * VENUES[venue].spin * 0.35 : 0;
      velocity.z *= onPitch ? 0.94 : 0.82;
      bounced = true;
    } else velocity.y = 0;
  }
  return bounced;
}

export type Contact = {
  velocity: Vec;
  quality: number;
  edge: boolean;
  timing: number;
};
/** An impulse against a moving, oriented bat face; no destination or score is supplied. */
export function batContact(
  pos: Vec,
  velocity: Vec,
  shot: ShotInput,
  tick: number,
  stamina: number,
): Contact | null {
  const phase = tick - shot.tick,
    angle = (shot.direction * Math.PI) / 180;
  if (phase < 0 || phase > 22) return null;
  const heights = {
    defend: 0.32,
    straight: 0.48,
    cover: 0.55,
    "on-drive": 0.5,
    cut: 1.12,
    pull: 1.25,
    sweep: 0.18,
    loft: 0.55,
  };
  const batX = Math.sin(angle) * 0.45 + shot.face * 0.55;
  const lateral = Math.abs(pos.x - batX),
    vertical = Math.abs(pos.y - heights[shot.kind]);
  if (lateral > 0.34 || vertical > (shot.kind === "sweep" ? 0.36 : 0.47))
    return null;
  const timing = phase - 8;
  const quality = clamp(
    (1 - Math.abs(timing) / 16) * (1 - lateral * 1.3) * (1 - vertical * 0.45),
    0.08,
    1,
  );
  const edge = lateral > 0.23 || quality < 0.28;
  let direction = angle + shot.face * 0.4;
  let loft =
    shot.kind === "loft"
      ? 0.58
      : shot.kind === "pull"
        ? 0.18
        : shot.kind === "sweep"
          ? 0.08
          : 0.035;
  if (edge) {
    direction += (pos.x > batX ? 1 : -1) * 0.9;
    loft += 0.35;
  }
  const desired = vec(
    Math.sin(direction) * Math.cos(loft),
    Math.sin(loft),
    -Math.cos(direction) * Math.cos(loft),
  );
  const incoming = Math.hypot(velocity.x, velocity.y, velocity.z);
  const normal = vec(
    desired.x - velocity.x / incoming,
    desired.y - velocity.y / incoming,
    desired.z - velocity.z / incoming,
  );
  const norm = Math.hypot(normal.x, normal.y, normal.z);
  normal.x /= norm;
  normal.y /= norm;
  normal.z /= norm;
  const vn =
    velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z;
  const batSpeed =
    shot.kind === "defend" ? 1.2 : (6 + shot.power * 12) * stamina;
  const impulse =
    (1 + (shot.kind === "defend" ? 0.12 : 0.37)) * (batSpeed - vn) * quality;
  return {
    velocity: vec(
      velocity.x + normal.x * impulse,
      velocity.y + normal.y * impulse,
      velocity.z + normal.z * impulse,
    ),
    quality,
    edge,
    timing,
  };
}

export class Delivery {
  tick = 0;
  pos = vec(0.55, 2.08, -8.5);
  velocity = vec();
  readonly fielders: Fielder[];
  readonly frames: Frame[] = [];
  shot: ShotInput | null;
  runAt: number[];
  outcome: Outcome | null = null;
  hit = false;
  pad = false;
  bounced = false;
  groundAfterHit = false;
  edge = false;
  contactTick = -1;
  contactQuality = 0;
  timing = 0;
  noBall = false;
  wide = false;
  autoRun = false;
  mode: Frame["mode"] = "delivery";
  runs = 0;
  runProgress = 0;
  running = false;
  runner = 0;
  chaser = -1;
  backup = -1;
  throwAt = -1;
  throwEnd = -1;
  throwTarget = vec();
  throwDirect = false;
  invalidInput = false;
  digestNumber = 2166136261;
  readonly rng;
  readonly spin: number;
  readonly swing: number;
  readonly frontFootZ: number;
  batterGroundZ = CREASE_Z;
  private requestIndex = 0;
  private collected = false;
  private passed = false;
  private missedKeeper = false;
  private pitchX = 0;
  constructor(
    readonly seed: number,
    readonly bowling: BowlingInput,
    readonly field: FieldName,
    readonly config: CricketConfig,
    readonly freeHit = false,
    shot: ShotInput | null = null,
    runAt: number[] = [],
    readonly capture = true,
    readonly fatigue = 1,
  ) {
    this.rng = seededRng(seed);
    this.shot = shot;
    this.runAt = [...runAt];
    const precision = this.config.difficulty === "elite" ? 0.035 : 0.075;
    const error =
      (this.rng.int(2001) / 1000 - 1) * precision + bowling.release * 0.25;
    this.spin =
      bowling.variation === "offbreak" || bowling.variation === "googly"
        ? -3.1
        : bowling.variation === "legbreak"
          ? 3.1
          : bowling.variation === "topspin"
            ? 0.3
            : 0;
    this.swing =
      (bowling.variation === "inswing"
        ? -1.7
        : bowling.variation === "outswing"
          ? 1.7
          : 0.15) * VENUES[config.venue].swing;
    const spinner = ["offbreak", "legbreak", "googly", "topspin"].includes(
      bowling.variation,
    );
    const speed =
      (spinner
        ? 18 + bowling.speed * 5
        : bowling.variation === "slower"
          ? 24 + bowling.speed * 3
          : 31 + bowling.speed * 8) *
      (0.9 + fatigue * 0.1);
    const targetZ = STUMPS_Z - bowling.length,
      flight = (targetZ - this.pos.z) / speed;
    this.velocity = vec(
      (bowling.line + error - this.pos.x) / flight - this.swing * flight * 0.5,
      (4.905 * flight ** 2 - this.pos.y) / flight,
      speed,
    );
    this.frontFootZ = -CREASE_Z - 0.23 + Math.max(0, bowling.release) * 0.26;
    this.noBall = this.frontFootZ > -CREASE_Z;
    this.fielders = [
      ...fieldPositions(field),
      vec(0.55, 0, -8.5),
      vec(0, 0, 11.5),
    ].map((pos, id) => ({
      id,
      pos,
      start: copy(pos),
      speed: id === 10 ? 4.8 : 6.6 + (id % 3) * 0.3,
      skill: 0.78 + (id % 4) * 0.04,
      action: "ready",
      travel: 0,
    }));
    this.snapshot();
  }
  get digest() {
    return (this.digestNumber >>> 0).toString(16).padStart(8, "0");
  }
  swingBat(shot: Omit<ShotInput, "tick">) {
    if (this.shot || this.outcome || this.tick < RELEASE_TICK || this.passed)
      return false;
    this.shot = { ...shot, tick: this.tick };
    return true;
  }
  requestRun() {
    if (
      this.outcome ||
      this.running ||
      this.runAt.at(-1) === this.tick ||
      this.runAt.length >= 3 ||
      (!this.hit && !this.passed)
    )
      return false;
    this.runAt.push(this.tick);
    return true;
  }
  private snapshot() {
    if (this.capture && this.frames.length < 565)
      this.frames.push({
        tick: this.tick,
        ball: copy(this.pos),
        fielders: this.fielders.map((f) => copy(f.pos)),
        travel: this.fielders.map((f) => f.travel),
        bowlerFootZ: this.frontFootZ,
        batterGroundZ: this.batterGroundZ,
        actions: this.fielders.map((f) => f.action),
        runner: this.runner,
        contact: this.hit,
        bounce: this.groundAfterHit,
        mode: this.mode,
      });
  }
  private finish(
    wicket: Outcome["wicket"] = null,
    boundary: 0 | 4 | 6 = 0,
    dismissed: Outcome["dismissed"] = "striker",
  ) {
    if (this.outcome) return;
    const credited = boundary || this.runs;
    const bat = this.hit ? credited : 0;
    this.outcome = adjudicate(
      {
        bat,
        wides: this.wide && !this.noBall ? 1 + credited : 0,
        noBalls: this.noBall ? 1 : 0,
        byes: !this.hit && !this.pad && !this.wide ? credited : 0,
        legByes: this.pad && !!this.shot ? credited : 0,
        wicket,
        dismissed,
        boundary,
        completedRuns: boundary ? 0 : this.runs,
        timing: this.contactQuality,
      },
      this.freeHit,
    );
    this.mode = "dead";
    this.snapshot();
  }
  private moveFielder(f: Fielder, target: Vec, acceleration = 1) {
    const dx = target.x - f.pos.x,
      dz = target.z - f.pos.z,
      length = Math.hypot(dx, dz);
    if (length < 0.04) return;
    f.travel += STEP;
    const step = Math.min(
      length,
      f.speed * Math.min(1, f.travel * 3) * STEP * acceleration,
    );
    f.pos.x = q(f.pos.x + (dx / length) * step);
    f.pos.z = q(f.pos.z + (dz / length) * step);
    f.action = "run";
  }
  private assignFielders() {
    const airtime =
      this.velocity.y > 0
        ? (this.velocity.y +
            Math.sqrt(this.velocity.y ** 2 + 19.62 * this.pos.y)) /
          9.81
        : 0;
    const landing = vec(
      this.pos.x + this.velocity.x * airtime * 0.88,
      0,
      this.pos.z + this.velocity.z * airtime * 0.88,
    );
    const target = this.groundAfterHit ? this.pos : landing;
    const ranked = this.fielders
      .map((f) => ({ id: f.id, time: distance(f.pos, target) / f.speed }))
      .sort((a, b) => a.time - b.time || a.id - b.id);
    this.chaser = ranked[0]!.id;
    this.backup = ranked[1]!.id;
  }
  private fieldBall() {
    if (this.mode === "throw") return;
    if (this.hit && this.chaser < 0) this.assignFielders();
    if (!this.hit && !this.pad && !this.missedKeeper) {
      const keeper = this.fielders[10]!;
      if (this.pos.z > 6) this.moveFielder(keeper, vec(this.pos.x, 0, 11.5));
      if (
        this.pos.z > 10.65 &&
        Math.abs(this.pos.x - keeper.pos.x) < 0.7 &&
        this.pos.y < 2.4
      ) {
        keeper.action = "catch";
        const charged = this.batterGroundZ < CREASE_Z - 0.05;
        this.finish(
          charged && !this.running && !this.noBall && !this.freeHit
            ? "stumped"
            : null,
        );
        return;
      }
      if (this.pos.z > 13) {
        this.missedKeeper = true;
        this.contactTick = this.tick;
        this.assignFielders();
      } else return;
    }
    if (this.tick < this.contactTick + 22) return;
    const chaser = this.fielders[this.chaser >= 0 ? this.chaser : 10]!;
    if (this.throwAt < 0) {
      const landingTime = Math.max(
        0,
        (this.velocity.y +
          Math.sqrt(Math.max(0, this.velocity.y ** 2 + 19.62 * this.pos.y))) /
          9.81,
      );
      const target =
        this.groundAfterHit || this.pad
          ? this.pos
          : vec(
              this.pos.x + this.velocity.x * landingTime * 0.88,
              0,
              this.pos.z + this.velocity.z * landingTime * 0.88,
            );
      this.moveFielder(chaser, target);
      if (this.backup >= 0) {
        const backup = this.fielders[this.backup]!;
        this.moveFielder(backup, vec(target.x * 0.75, 0, target.z * 0.75), 0.8);
      }
      const gap = Math.hypot(
        chaser.pos.x - this.pos.x,
        chaser.pos.z - this.pos.z,
      );
      const diving = gap > 0.7 && gap < 1.65 && chaser.travel > 0.2;
      if (
        this.hit &&
        !this.groundAfterHit &&
        this.pos.y > 0.25 &&
        this.pos.y < 2.45 &&
        gap < (diving ? 1.65 : 0.85)
      ) {
        if (
          this.rng.int(1000) < chaser.skill * (diving ? 800 : 970) &&
          !this.noBall &&
          !this.freeHit
        ) {
          chaser.action = diving ? "dive" : "catch";
          this.finish("caught");
          return;
        }
        chaser.action = "drop";
        this.velocity.y = -1;
        this.velocity.x *= 0.55;
        this.velocity.z *= 0.55;
        this.groundAfterHit = true;
      }
      if (this.pos.y < 0.42 && gap < 1.1) {
        chaser.action = diving ? "dive" : "pickup";
        this.collected = true;
        this.throwAt = this.tick + 38;
        this.pos = vec(chaser.pos.x, 0.3, chaser.pos.z);
        this.velocity = vec();
      }
    } else {
      this.pos = vec(
        chaser.pos.x,
        0.4 + (this.tick >= this.throwAt - 10 ? 0.5 : 0),
        chaser.pos.z,
      );
      if (this.tick >= this.throwAt) {
        chaser.action = "throw";
        this.mode = "throw";
        const error =
          (this.rng.int(2001) / 1000 - 1) * (1 - chaser.skill) * 1.7;
        this.throwTarget = vec(error, 0.35, STUMPS_Z);
        const flight =
          distance(this.pos, this.throwTarget) / (23 + chaser.skill * 6);
        this.throwDirect = Math.abs(error) < 0.15;
        this.throwEnd = this.tick + Math.ceil(flight / STEP);
        this.velocity = vec(
          (this.throwTarget.x - this.pos.x) / flight,
          (this.throwTarget.y - this.pos.y + 4.905 * flight ** 2) / flight,
          (this.throwTarget.z - this.pos.z) / flight,
        );
      }
    }
  }
  step() {
    if (this.outcome) return;
    this.tick++;
    if (this.tick >= RELEASE_TICK) {
      const activeShot =
        this.shot && this.tick > this.shot.tick ? this.shot : null;
      const advance = Math.max(0, (activeShot?.foot ?? 0) - 0.35);
      const recovery = Math.max(
        0,
        (this.tick - (activeShot?.tick ?? this.tick) - 30) * STEP * 2.8,
      );
      this.batterGroundZ = CREASE_Z - Math.max(0, advance - recovery);
      const prev = copy(this.pos);
      if (!this.collected || this.mode === "throw") {
        const bounced = integrateBall(
          this.pos,
          this.velocity,
          this.mode === "delivery" ? this.spin : 0,
          this.mode === "delivery" ? this.swing : 0,
          this.config.venue,
          this.hit || this.mode === "throw",
          this.mode === "delivery" && this.bowling.variation === "topspin"
            ? 2.5
            : 0,
        );
        if (bounced && !this.bounced) this.pitchX = this.pos.x;
        this.bounced ||= bounced;
        if (this.hit && bounced) this.groundAfterHit = true;
      }
      if (
        this.autoRun &&
        this.hit &&
        this.tick === this.contactTick + 65 &&
        this.pos.y < 2.2 &&
        Math.hypot(this.pos.x, this.pos.z - 8.8) > 12 &&
        Math.min(...this.fielders.map((f) => distance(f.pos, this.pos))) > 8
      )
        this.requestRun();
      while (
        this.requestIndex < this.runAt.length &&
        this.runAt[this.requestIndex]! < this.tick
      ) {
        if (
          (!this.hit && !this.passed) ||
          this.runAt[this.requestIndex]! < this.contactTick
        )
          this.invalidInput = true;
        else if (!this.running) {
          this.running = true;
          this.runProgress = 0;
        } else this.invalidInput = true;
        this.requestIndex++;
      }
      if (this.running) {
        this.runProgress += 6.4 * STEP;
        if (this.runProgress >= RUN_DISTANCE) {
          this.runs++;
          this.running = false;
          this.runProgress = 0;
        }
      }
      this.runner =
        this.runs + (this.running ? this.runProgress / RUN_DISTANCE : 0);
      if (this.mode === "throw") {
        if (this.tick >= this.throwEnd) {
          const nonStrikerAtEnd = Math.floor(this.runner) % 2 === 0;
          const distanceFromGround = RUN_DISTANCE - this.runProgress;
          if (this.throwDirect && this.running && distanceFromGround > 0.5)
            this.finish(
              "run-out",
              0,
              nonStrikerAtEnd ? "non-striker" : "striker",
            );
          else if (this.tick >= this.throwEnd + (this.throwDirect ? 0 : 55))
            this.finish();
        }
      } else {
        const batZ = 8.8 - (activeShot?.foot ?? 0) * 0.45;
        if (
          !this.hit &&
          !this.pad &&
          this.pos.z >= batZ - 0.22 &&
          this.pos.z <= batZ + 0.22 &&
          activeShot
        ) {
          const contact = batContact(
            this.pos,
            this.velocity,
            activeShot,
            this.tick,
            this.fatigue,
          );
          if (contact) {
            this.noBall ||= !this.bounced && this.pos.y > 1.05;
            this.hit = true;
            this.edge = contact.edge;
            this.contactTick = this.tick;
            this.contactQuality = contact.quality;
            this.timing = contact.timing;
            this.velocity = contact.velocity;
            this.mode = "struck";
          }
        }
        if (!this.passed && this.pos.z >= 8.8) {
          this.passed = true;
          this.noBall ||= !this.bounced && this.pos.y > 1.05;
          this.wide =
            !this.hit &&
            !this.pad &&
            (Math.abs(this.pos.x) > 0.9 || this.pos.y > 2.3);
        }
        if (
          !this.hit &&
          !this.pad &&
          activeShot &&
          this.pos.z >= 9.05 &&
          this.pos.z < 9.4 &&
          Math.abs(this.pos.x) < 0.16 &&
          this.pos.y < 0.8
        ) {
          const projectedX =
            this.pos.x +
            (this.velocity.x * (STUMPS_Z - this.pos.z)) /
              Math.max(1, this.velocity.z);
          const flightTime =
            (STUMPS_Z - this.pos.z) / Math.max(1, this.velocity.z);
          const projectedY =
            this.pos.y + this.velocity.y * flightTime - 4.905 * flightTime ** 2;
          if (
            !this.noBall &&
            !this.freeHit &&
            this.bounced &&
            this.pitchX >= -0.1143 &&
            Math.abs(projectedX) < 0.1143 &&
            projectedY > 0 &&
            projectedY < 0.7112
          )
            this.finish("lbw");
          else {
            this.pad = true;
            this.contactTick = this.tick;
            this.chaser = 10;
            this.velocity = vec(this.velocity.x * 0.2 + 1, 0.5, -2);
          }
        }
        if (
          !this.outcome &&
          stumpIntersection(prev, this.pos) &&
          !this.noBall &&
          !this.freeHit
        )
          this.finish("bowled");
        if (!this.outcome && boundaryCrossed(this.pos, this.config.venue))
          this.finish(null, this.hit && !this.groundAfterHit ? 6 : 4);
        if (!this.outcome) this.fieldBall();
      }
    }
    for (const value of [
      this.tick,
      this.pos.x * 1000,
      this.pos.y * 1000,
      this.pos.z * 1000,
      this.runs,
      this.hit ? 1 : 0,
    ])
      this.digestNumber =
        Math.imul(this.digestNumber ^ Math.round(value), 16777619) >>> 0;
    if (this.tick % 3 === 0) this.snapshot();
    if (this.tick >= 1680 && !this.outcome) this.finish();
  }
  complete() {
    while (!this.outcome) this.step();
    return this.outcome!;
  }
}
