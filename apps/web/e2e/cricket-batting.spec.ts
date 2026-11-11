import { expect, test } from "@playwright/test";
import * as T from "three";
import { RELEASE_TICK, SHOT_HEIGHTS, STEP, type ShotInput } from "@platform/engines/sinverse-cricket";
import { BAT, CH, CLIPS, RIG, makePose, sampleClip, type Vec3 } from "../src/games/sinverse-cricket/animation";
import { SHOTS, battingShot, batterStyle, batting, type BattingInput, type BattingShot } from "../src/games/sinverse-cricket/batting";
import { batPoint, buildAthlete, handCentre, holdBat } from "../src/games/sinverse-cricket/character";

/**
 * Batting animation rules, on the real skeleton (no browser). Footage of the
 * same shots in the match is recorded by cricket-batting-footage.spec.ts.
 */

const E = RELEASE_TICK + 62;
/** One engine shot input per batting shot (kind, aim, footwork). */
const INPUTS: Record<Exclude<BattingShot, "leave">, Pick<ShotInput, "kind" | "direction" | "foot" | "power" | "face">> = {
  "forward-defence": { kind: "defend", direction: 0, foot: 0.3, power: 0.4, face: 0 },
  "back-foot-defence": { kind: "defend", direction: 0, foot: -0.2, power: 0.4, face: 0 },
  "straight-drive": { kind: "straight", direction: 0, foot: 0.3, power: 1, face: 0 },
  "off-drive": { kind: "straight", direction: 25, foot: 0.3, power: 1, face: 0 },
  "cover-drive": { kind: "cover", direction: 50, foot: 0.3, power: 1, face: 0 },
  "on-drive": { kind: "on-drive", direction: -25, foot: 0.3, power: 1, face: 0 },
  "lofted-drive": { kind: "loft", direction: 0, foot: 0.3, power: 1, face: 0 },
  pull: { kind: "pull", direction: -60, foot: -0.2, power: 1, face: 0 },
  hook: { kind: "pull", direction: -95, foot: -0.2, power: 1, face: 0 },
  "square-cut": { kind: "cut", direction: 80, foot: -0.2, power: 1, face: 0 },
  "late-cut": { kind: "cut", direction: 110, foot: -0.2, power: 0.6, face: 0 },
  sweep: { kind: "sweep", direction: -50, foot: 0.4, power: 1, face: 0 },
  "reverse-sweep": { kind: "sweep", direction: 45, foot: 0.4, power: 1, face: 0 },
  flick: { kind: "on-drive", direction: -55, foot: 0.3, power: 0.8, face: 0 },
  glance: { kind: "on-drive", direction: -90, foot: 0.2, power: 0.5, face: 0 },
};
const NAMES = Object.keys(INPUTS) as (keyof typeof INPUTS)[];
/**
 * Where the engine meets the ball for a shot, in the striker's root space. The
 * root stands on the crease (world z 8.84, x -0.38); the engine's bat line is
 * z = 8.8 - foot * 0.45 and the ball is near the stumps' line across.
 */
const impactFor = (name: keyof typeof INPUTS): Vec3 => {
  const input = INPUTS[name];
  return [0.04 + input.foot * 0.45, SHOT_HEIGHTS[input.kind], input.kind === "cut" ? 0.72 : 0.5];
};
const inputFor = (name: keyof typeof INPUTS, tick: number, extra: Partial<BattingInput> = {}): BattingInput => ({
  tick,
  plan: INPUTS[name],
  shotTick: E - 8,
  contactTick: E,
  contact: "clean",
  impact: impactFor(name),
  look: [6, 0.6, 0.3],
  style: batterStyle(7),
  ...extra,
});
function frame(input: BattingInput) {
  const pose = sampleClip(CLIPS.stance, 0, makePose());
  const result = batting(input, pose);
  return { pose, ...result };
}

test.describe("Cricket batting animation", () => {
  test("every engine shot input maps to a distinct batting shot, and none is lost", () => {
    const seen = new Set(NAMES.map((n) => battingShot(INPUTS[n])));
    expect(seen.size).toBe(NAMES.length);
    for (const n of NAMES) expect(battingShot(INPUTS[n])).toBe(n);
    expect(battingShot(null)).toBe("leave");
  });

  test("hands stay on the handle through every shot, from guard to relax", () => {
    const a = buildAthlete("bat", 1, 0, 2),
      hand = new T.Vector3(),
      handle = new T.Vector3();
    let worst = 0;
    for (const n of NAMES)
      for (let tick = RELEASE_TICK - 60; tick < E + 200; tick += 3) {
        // Across forty batters' own stances and backlifts.
        const f = frame(inputFor(n, tick, { style: batterStyle(tick * 7 + n.length) }));
        holdBat(a, f.pose, f.bat);
        a.root.updateMatrixWorld(true);
        handCentre(a, true, hand);
        worst = Math.max(worst, hand.distanceTo(batPoint(a, BAT.top, handle)));
        handCentre(a, false, hand);
        worst = Math.max(worst, hand.distanceTo(batPoint(a, BAT.bottom, handle)));
      }
    expect(worst, "worst hand-to-handle gap, metres").toBeLessThan(0.03);
  });

  test("on the contact tick the rig's sweet spot is on the engine's contact point", () => {
    const a = buildAthlete("bat", 1, 0, 2),
      sweet = new T.Vector3();
    for (const n of NAMES) {
      const input = inputFor(n, E),
        pure = frame(input);
      // The bat pose itself is exact...
      const p = pure.bat.grip.map((g, k) => g + pure.bat.dir[k]! * BAT.sweet);
      expect(Math.hypot(p[0]! - input.impact[0], p[1]! - input.impact[1], p[2]! - input.impact[2]), `${n} pose`).toBeLessThan(1e-6);
      // ...and survives the arms' reach on the real skeleton.
      holdBat(a, pure.pose, pure.bat);
      a.root.updateMatrixWorld(true);
      batPoint(a, BAT.sweet, sweet);
      // Root-space points are in model units; the athlete's root scales them.
      expect(sweet.distanceTo(new T.Vector3(...input.impact).multiplyScalar(a.root.scale.x)), `${n} on the rig, metres`).toBeLessThan(0.03);
    }
  });

  test("the bat stays clear of the body at impact", () => {
    const a = buildAthlete("bat", 1, 0, 2),
      spine = new T.Vector3(),
      point = new T.Vector3();
    for (const n of NAMES) {
      const f = frame(inputFor(n, E));
      holdBat(a, f.pose, f.bat);
      a.root.updateMatrixWorld(true);
      a.bones.spine.getWorldPosition(spine);
      batPoint(a, BAT.sweet, point);
      expect(Math.hypot(point.x - spine.x, point.z - spine.z), `${n} sweet spot from the spine`).toBeGreaterThan(0.2);
    }
  });

  test("an edge meets the ball on the blade's edge; the timing of contact is the engine's", () => {
    for (const contact of ["inside-edge", "outside-edge"] as const) {
      const input = inputFor("cover-drive", E, { contact }),
        f = frame(input),
        p = f.bat.grip.map((g, k) => g + f.bat.dir[k]! * BAT.sweet);
      const gap = Math.hypot(p[0]! - input.impact[0], p[1]! - input.impact[1], p[2]! - input.impact[2]);
      expect(gap, contact).toBeGreaterThan(0.05);
      expect(gap, contact).toBeLessThan(0.06);
    }
    // A late press still reaches the ball on the contact tick.
    for (const late of [1, 3, 8, 16]) {
      const f = frame(inputFor("straight-drive", E, { shotTick: E - late }));
      const p = f.bat.grip.map((g, k) => g + f.bat.dir[k]! * BAT.sweet),
        I = impactFor("straight-drive");
      expect(Math.hypot(p[0]! - I[0], p[1]! - I[1], p[2]! - I[2]), `pressed ${late} ticks before`).toBeLessThan(1e-6);
    }
  });

  test("planted feet never move: a foot only travels while it is off the ground", () => {
    for (const n of [...NAMES, null] as const) {
      let prev: ReturnType<typeof frame> | null = null;
      for (let tick = RELEASE_TICK - 50; tick < E + 220; tick += 0.5) {
        const f = n ? frame(inputFor(n, tick)) : frame(inputFor("straight-drive", tick, { plan: null, shotTick: null }));
        if (prev)
          for (const [x, y, z] of [
            [CH.lFootX, CH.lFootY, CH.lFootZ],
            [CH.rFootX, CH.rFootY, CH.rFootZ],
          ] as const) {
            const grounded = Math.abs(f.pose[y]! - RIG.ankle) < 1e-9 && Math.abs(prev.pose[y]! - RIG.ankle) < 1e-9;
            if (grounded) expect(Math.hypot(f.pose[x]! - prev.pose[x]!, f.pose[z]! - prev.pose[z]!), `${n ?? "leave"} at ${tick}`).toBeLessThan(1e-6);
          }
        prev = f;
      }
    }
  });

  test("shots look different: body and bat at impact and at the finish", () => {
    const feature = (n: keyof typeof INPUTS) => {
      const at = frame(inputFor(n, E)),
        fin = frame(inputFor(n, E + 40));
      const pick = (f: ReturnType<typeof frame>) => [f.pose[CH.hipX]!, f.pose[CH.hipY]!, f.pose[CH.pitch]!, f.pose[CH.yaw]!, f.pose[CH.chestY]!, f.pose[CH.lFootX]!, f.pose[CH.lFootZ]!, f.pose[CH.rFootX]!, f.pose[CH.rFootZ]!, ...f.bat.dir, ...f.bat.grip];
      return [...pick(at), ...pick(fin)];
    };
    const features = NAMES.map((n) => [n, feature(n)] as const);
    let closest = Infinity,
      pair = "";
    for (let i = 0; i < features.length; i++)
      for (let j = i + 1; j < features.length; j++) {
        const d = Math.hypot(...features[i]![1].map((v, k) => v - features[j]![1][k]!));
        if (d < closest) ((closest = d), (pair = `${features[i]![0]} / ${features[j]![0]}`));
      }
    expect(closest, `most similar pair: ${pair}`).toBeGreaterThan(0.25);
  });

  test("the bat travels an arc and accelerates into the ball", () => {
    for (const n of ["straight-drive", "cover-drive", "pull", "lofted-drive", "sweep"] as const) {
      const at = (tick: number) => {
        const f = frame(inputFor(n, tick));
        return f.bat.grip.map((g, k) => g + f.bat.dir[k]! * BAT.sweet) as Vec3;
      };
      const top = at(E - 30),
        hit = at(E);
      let bow = 0;
      for (let tick = E - 30; tick <= E; tick++) {
        const p = at(tick),
          chord = hit.map((v, k) => v - top[k]!),
          rel = p.map((v, k) => v - top[k]!),
          len = Math.hypot(...chord),
          along = (rel[0]! * chord[0]! + rel[1]! * chord[1]! + rel[2]! * chord[2]!) / len;
        bow = Math.max(bow, Math.sqrt(Math.max(0, rel[0]! ** 2 + rel[1]! ** 2 + rel[2]! ** 2 - along ** 2)));
      }
      expect(bow, `${n}: sweet spot path bows away from the straight line, metres`).toBeGreaterThan(0.12);
      const speed = (tick: number) => Math.hypot(...at(tick).map((v, k) => v - at(tick - 1)[k]!)) / STEP;
      expect(speed(E), `${n}: faster at contact than early in the downswing`).toBeGreaterThan(speed(E - 6) * 1.2);
    }
  });

  test("the head stays steady through the stroke and the eyes stay level", () => {
    const a = buildAthlete("bat", 1, 0, 2),
      head = new T.Vector3();
    for (const n of ["forward-defence", "straight-drive", "cover-drive", "pull", "sweep"] as const) {
      const positions: T.Vector3[] = [];
      for (let tick = E - 10; tick <= E + 2; tick += 2) {
        const f = frame(inputFor(n, tick));
        holdBat(a, f.pose, f.bat);
        a.root.updateMatrixWorld(true);
        positions.push(a.bones.head.getWorldPosition(head).clone());
        expect(Math.abs(f.pose[CH.headZ]! + f.pose[CH.roll]!), `${n} head roll cancels body lean`).toBeLessThan(0.08);
      }
      const travel = positions[0]!.distanceTo(positions.at(-1)!);
      expect(travel, `${n}: head travel over the last 10 ticks before contact, metres`).toBeLessThan(0.16);
    }
  });

  test("an uncommitted swing waits; a leave lifts the bat out of the way", () => {
    const waiting = frame(inputFor("straight-drive", E + 4, { shotTick: null }));
    const struck = frame(inputFor("straight-drive", E + 4));
    expect(waiting.phase).not.toBe("follow");
    expect(struck.phase).toBe("follow");
    const leave = frame(inputFor("straight-drive", E, { plan: null, shotTick: null }));
    expect(leave.shot).toBe("leave");
    expect(leave.bat.dir[1], "bat pointing up, out of the line").toBeGreaterThan(0.5);
    expect(leave.bat.grip[1], "hands high").toBeGreaterThan(1.3);
  });

  test("batters have their own deterministic styles", () => {
    expect(batterStyle(12)).toEqual(batterStyle(12));
    const styles = Array.from({ length: 11 }, (_, n) => batterStyle(n * 31));
    expect(new Set(styles.map((s) => s.trigger)).size).toBeGreaterThan(1);
    expect(new Set(styles.map((s) => s.tap)).size).toBe(2);
    expect(Math.max(...styles.map((s) => s.lift)) - Math.min(...styles.map((s) => s.lift))).toBeGreaterThan(0.4);
    // Different batters stand differently but meet the ball at the same point.
    const one = frame(inputFor("straight-drive", RELEASE_TICK - 40, { style: styles[0]! })),
      two = frame(inputFor("straight-drive", RELEASE_TICK - 40, { style: styles[5]! }));
    expect(Math.abs(one.pose[CH.lFootX]! - two.pose[CH.lFootX]!) + Math.abs(one.pose[CH.hipY]! - two.pose[CH.hipY]!)).toBeGreaterThan(0.01);
    for (const style of styles) {
      const f = frame(inputFor("cover-drive", E, { style }));
      const p = f.bat.grip.map((g, k) => g + f.bat.dir[k]! * BAT.sweet),
        I = impactFor("cover-drive");
      expect(Math.hypot(p[0]! - I[0], p[1]! - I[1], p[2]! - I[2])).toBeLessThan(1e-6);
    }
  });

  test("every shot spec is complete", () => {
    for (const n of NAMES) expect(SHOTS[n], n).toBeTruthy();
  });
});
