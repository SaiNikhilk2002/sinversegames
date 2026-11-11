import { expect, test } from "@playwright/test";
import { configSchema, Delivery, RELEASE_TICK, STEP, VENUES, type Frame, type ShotInput } from "@platform/engines/sinverse-cricket";
import { CATCH, KEEPER_TAKE_Z, fielderPlan, keeperPlan, newMemo, predictCrossing, reaction, variety, type BallKin, type FieldMemo } from "../src/games/sinverse-cricket/fielding";
import { MIN_GAP, PEOPLE, WALK_IN, closestPair, place, walkInOffset } from "../src/games/sinverse-cricket/spacing";

/**
 * Fielding and wicketkeeping presentation, against real simulated deliveries.
 * The engine decides every catch, pickup and collection on the tick it happens;
 * these tests check the bodies get there first: the hands were already going to
 * where the ball was taken, they move smoothly, and nobody overlaps.
 */

const config = configSchema.parse({});
const friction = VENUES[config.venue].friction;
const bowl = (n: number) => ({ variation: (["seam", "inswing", "slower", "offbreak", "legbreak"] as const)[n % 5]!, line: ((n * 37) % 9) / 10 - 0.4, length: 2.5 + ((n * 13) % 50) / 10, speed: ((n * 7) % 10) / 10, release: 0 });
const SHOTS: Omit<ShotInput, "tick">[] = [
  { kind: "loft", direction: 0, power: 1, foot: 0.35, face: 0 },
  { kind: "loft", direction: 30, power: 0.8, foot: 0.2, face: 0 },
  { kind: "cover", direction: 45, power: 0.85, foot: 0.2, face: 0 },
  { kind: "pull", direction: -70, power: 0.9, foot: -0.2, face: 0 },
  { kind: "straight", direction: 0, power: 0.7, foot: 0.3, face: 0 },
  { kind: "on-drive", direction: -30, power: 0.6, foot: 0.2, face: 0 },
  { kind: "cut", direction: 80, power: 0.9, foot: -0.1, face: 0 },
  { kind: "defend", direction: 10, power: 0.3, foot: 0.3, face: 0 },
];

const input = (b: Frame, k: number, action: Frame["actions"][number], speed: number) => ({ tick: b.tick, action, actionAge: (b.tick - since0[k]!) * STEP, dead: b.mode === "dead", deadAge: 0, outcome: null, contact: b.contact, mode: b.mode, me: { x: b.fielders[k]!.x, z: b.fielders[k]!.z, speed }, ball: kin0, friction, involved: action !== "ready" || b.travel[k]! > 0.05, rope: 0.5, length: () => 1, throwRelease: 0.6, contactTick: contact0 });
let contact0 = -1;
let since0: number[] = [];
let kin0: BallKin = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rolling: false };

/** Plays a delivery's frames through the fielding planner as the renderer does, 120 times a second. */
function replay(d: Delivery) {
  const frames = d.frames as Frame[];
  const memos: FieldMemo[] = Array.from({ length: 11 }, newMemo);
  const actions = frames[0]!.actions.slice(),
    since = new Array(11).fill(0);
  const kin: BallKin = (kin0 = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rolling: false });
  since0 = since;
  contact0 = d.contactTick;
  const takes: { kind: string; error: number; fielder: number }[] = [];
  let maxJump = 0;
  const lastGoal: ([number, number, number] | null)[] = new Array(11).fill(null);
  for (let f = 1; f < frames.length; f++) {
    const a = frames[f - 1]!,
      b = frames[f]!,
      span = (b.tick - a.tick) * STEP;
    if (span <= 0) continue;
    Object.assign(kin, { x: b.ball.x, y: b.ball.y, z: b.ball.z, vx: (b.ball.x - a.ball.x) / span, vy: (b.ball.y - a.ball.y) / span, vz: (b.ball.z - a.ball.z) / span });
    kin.rolling = b.ball.y < 0.09 && Math.abs(kin.vy) < 0.6;
    kin.bounced = b.bounce;
    for (let k = 0; k < 11; k++) {
      const action = b.actions[k]!;
      if (action !== actions[k]) {
        const memo = memos[k]!,
          took = action === "pickup" || (action === "dive" && b.mode !== "dead") ? a.ball : b.ball;
        const ground = action === "pickup" || (action === "dive" && a.ball.y < 0.45 && b.mode !== "dead");
        const goal = k === 10 && action === "catch" && !b.contact ? memo.glove : memo.goal;
        if (goal && (action === "pickup" || action === "catch" || action === "dive")) takes.push({ kind: (k === 10 && action === "catch" && !b.contact ? "keeper-" : "") + (ground ? "pickup" : action), error: Math.hypot(goal[0] - took.x, goal[1] - Math.max(0.05, took.y), goal[2] - took.z), fielder: k });
        if (process.env.DEBUG_FIELDING && goal && ground) console.log("take", k, action, "goal", goal.map((v) => v.toFixed(2)).join(","), "took", took.x.toFixed(2), took.y.toFixed(2), took.z.toFixed(2), "me", b.fielders[k]!.x.toFixed(2), b.fielders[k]!.z.toFixed(2), "style", memo.pickup);
        memo.took = [took.x, Math.max(0.05, took.y), took.z];
        actions[k] = action;
        since[k] = b.tick;
      }
      const speed = Math.hypot(b.fielders[k]!.x - a.fielders[k]!.x, b.fielders[k]!.z - a.fielders[k]!.z) / span;
      const plan =
        k === 10
          ? keeperPlan({ ...input(b, k, action, speed), wicket: null, directHit: false }, memos[k]!, 1 / 120)
          : fielderPlan(input(b, k, action, speed), memos[k]!, 1 / 120);
      const g = plan.right;
      if (g && g.w > 0.05 && action === "run") {
        const last = lastGoal[k];
        if (last) {
          // How far the visible hand moves: the goal's movement, at the hand's commitment.
          const jump = Math.hypot(g.x - last[0], g.y - last[1], g.z - last[2]) * g.w;
          if (jump > maxJump) {
            maxJump = jump;
            if (process.env.DEBUG_FIELDING) console.log("jump", jump.toFixed(2), "fielder", k, "tick", b.tick, plan.move, g.w.toFixed(2), b.ball);
          }
        }
        lastGoal[k] = [g.x, g.y, g.z];
      } else lastGoal[k] = null;
    }
  }
  return { takes, maxJump };
}

function sweep(count: number) {
  const takes: { kind: string; error: number }[] = [];
  let maxJump = 0,
    deliveries = 0;
  for (let n = 0; n < count; n++) {
    const shot = { ...SHOTS[n % SHOTS.length]!, tick: RELEASE_TICK + 50 + (n % 17) };
    const d = new Delivery(1000 + n, bowl(n), (["balanced", "attack", "boundary"] as const)[n % 3]!, config, false, n % 9 === 8 ? null : shot, [], true);
    d.complete();
    const r = replay(d);
    takes.push(...r.takes);
    maxJump = Math.max(maxJump, r.maxJump);
    deliveries++;
  }
  return { takes, maxJump, deliveries };
}
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? NaN;
};

test.describe("Cricket fielding presentation", () => {
  const result = sweep(420);

  test("the hands are already going where the ball is taken, for catches, pickups and the keeper", () => {
    const by = (kind: string) => result.takes.filter((t) => t.kind === kind).map((t) => t.error);
    const report: Record<string, { n: number; median: number; p90: number }> = {};
    for (const kind of ["pickup", "catch", "dive", "keeper-catch"]) {
      const e = by(kind);
      report[kind] = { n: e.length, median: Number(quantile(e, 0.5).toFixed(3)), p90: Number(quantile(e, 0.9).toFixed(3)) };
    }
    console.log("take prediction error (m)", JSON.stringify(report));
    expect(report.pickup!.n, "real pickups in the sample").toBeGreaterThan(25);
    expect(report["keeper-catch"]!.n, "keeper takes in the sample").toBeGreaterThan(10);
    // Where the hands were going vs where the engine took the ball. The last few
    // centimetres are closed as the take happens (eased over 0.12 s).
    expect(report.pickup!.median).toBeLessThan(0.3);
    expect(report.pickup!.p90).toBeLessThan(0.6);
    expect(report["keeper-catch"]!.median).toBeLessThan(0.15);
    if (report.catch!.n >= 3) expect(report.catch!.median).toBeLessThan(0.45);
    if (report.dive!.n >= 3) expect(report.dive!.median).toBeLessThan(0.4);
  });

  test("hands on their way to the ball move at a human speed, never jumping", () => {
    // The visible hand is the goal weighted by commitment; at 120 updates a second
    // a 9 m/s hand moves 7.5 cm per update.
    expect(result.maxJump).toBeLessThan(0.09);
  });

  test("the keeper reads a ball through to the gloves: predicted line and height", () => {
    const errors: number[] = [];
    for (let n = 0; n < 60; n++) {
      const d = new Delivery(5000 + n, bowl(n), "balanced", config, false, null, [], true);
      d.complete();
      const frames = d.frames as Frame[];
      const take = frames.find((f) => f.actions[10] === "catch");
      if (!take) continue;
      // Predict from a frame a third of a second earlier, as the keeper would see it.
      const i = frames.findIndex((f) => f.tick >= take.tick - 40),
        a = frames[i - 1]!,
        b = frames[i]!,
        span = (b.tick - a.tick) * STEP;
      const kin = { x: b.ball.x, y: b.ball.y, z: b.ball.z, vx: (b.ball.x - a.ball.x) / span, vy: (b.ball.y - a.ball.y) / span, vz: (b.ball.z - a.ball.z) / span, rolling: false };
      const cross = predictCrossing(kin, KEEPER_TAKE_Z, friction);
      if (!cross) continue;
      // Compare with where the ball actually crossed the gloves' plane.
      const at = frames.find((f) => f.ball.z >= KEEPER_TAKE_Z - 0.25) ?? take;
      errors.push(Math.hypot(cross.x - at.ball.x, cross.y - at.ball.y));
    }
    expect(errors.length).toBeGreaterThan(20);
    expect(quantile(errors, 0.5)).toBeLessThan(0.12);
  });

  test("ring fielders walk in with the bowler and are exactly on their mark at release", () => {
    const deep = { x: 20, z: -25 },
      slip = { x: 1.2, z: 10.8 };
    expect(Math.hypot(walkInOffset(0, deep).x, walkInOffset(0, deep).z)).toBeCloseTo(WALK_IN, 3);
    expect(walkInOffset(RELEASE_TICK, deep)).toEqual({ x: 0, z: 0 });
    expect(walkInOffset(40, slip)).toEqual({ x: 0, z: 0 });
    // Monotonic: they only ever walk towards the batter.
    let last = Infinity;
    for (let t = 0; t <= RELEASE_TICK; t += 5) {
      const o = walkInOffset(t, deep),
        d = Math.hypot(o.x, o.z);
      expect(d).toBeLessThanOrEqual(last + 1e-9);
      last = d;
    }
  });

  test("nobody overlaps through real deliveries, walking in, taking the ball and walking back", () => {
    const spots = new Float32Array(PEOPLE * 2),
      holds = new Uint8Array(PEOPLE),
      offsets = new Float32Array(PEOPLE * 2);
    let worst = Infinity;
    for (let n = 0; n < 40; n++) {
      const d = new Delivery(9000 + n, bowl(n), "balanced", config, false, { ...SHOTS[n % SHOTS.length]!, tick: RELEASE_TICK + 55 }, [], true);
      d.complete();
      const frames = d.frames as Frame[],
        starts = frames[0]!.fielders.map((f) => ({ x: f.x, z: f.z }));
      for (const [i, f] of frames.entries()) {
        // A carry of up to 0.6 m on whoever is taking the ball.
        offsets.fill(0);
        f.actions.forEach((a, k) => {
          if (a === "pickup" || a === "catch") offsets[(k + 2) * 2] = 0.6;
        });
        const returnAge = i === frames.length - 1 ? 3 : -1;
        place({ tick: f.tick, style: "fast", runner: f.runner, batterGroundZ: f.batterGroundZ, bowlerFootZ: f.bowlerFootZ, fielders: f.fielders, actions: f.actions, travel: f.travel, huddleAge: -1, dismissedStriker: false, entry: -1, keepClear: true, starts, returnAge, offsets }, spots, holds);
        worst = Math.min(worst, closestPair(spots, PEOPLE));
      }
    }
    expect(worst).toBeGreaterThanOrEqual(MIN_GAP - 0.02);
  });

  test("reactions are in character, varied across players, and identical on replay", () => {
    const wicket = { bat: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, total: 0, legal: true, wicket: "bowled" as const, dismissed: "striker" as const, boundary: 0 as const, completedRuns: 0, timing: 0, label: "BOWLED" };
    const six = { ...wicket, wicket: null, boundary: 6 as const, bat: 6, total: 6, label: "6" };
    const seen = new Set<string>();
    for (let player = 1; player <= 11; player++) {
      const r = reaction("fielder", wicket, 0.5, player, 312, null);
      expect(r).toEqual(reaction("fielder", wicket, 0.5, player, 312, null));
      seen.add(JSON.stringify(r && { kind: r.kind, clip: r.clip }));
    }
    expect(seen.size, "team-mates don't all celebrate the same way").toBeGreaterThanOrEqual(2);
    // The batters don't celebrate a wicket; the bowler appeals an lbw before celebrating.
    expect(reaction("striker", wicket, 0.5, 1, 1, null)).toBeNull();
    expect(reaction("bowler", { ...wicket, wicket: "lbw", label: "LBW" }, 0.4, 9, 1, null)).toMatchObject({ kind: "pose", clip: "appeal" });
    // A six: the bowler is not pleased, the non-striker is.
    expect(["hands", "frustrated"]).toContain((reaction("bowler", six, 0.5, 9, 4, null) as { clip: string }).clip);
    expect(reaction("non-striker", six, 0.8, 2, 4, null)).not.toBeNull();
    // Match won: the winners celebrate, the losers don't.
    expect(["celebrate", "Yes"]).toContain((reaction("striker", six, 0.3, 1, 4, "batting-won") as { clip: string }).clip);
    expect(["downcast", "hands"]).toContain((reaction("bowler", six, 0.3, 9, 4, "batting-won") as { clip: string }).clip);
    expect(variety(3, 9, 5)).toBe(variety(3, 9, 5));
  });

  test("engine windows read by the planner match the engine's own numbers", () => {
    expect(CATCH).toMatchObject({ low: 0.25, high: 2.45, reach: 0.85, dive: 1.65, pickup: 1.1 });
  });
});
