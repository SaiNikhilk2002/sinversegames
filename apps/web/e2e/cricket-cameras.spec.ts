import { expect, test } from "@playwright/test";
import { RELEASE_TICK, VENUES, type Outcome } from "@platform/engines/sinverse-cricket";
import { CAMERA_LABELS, direct, type CameraName, type DirectorInput } from "../src/games/sinverse-cricket/director";

/** The broadcast cameras: every view is framed sensibly, and the director picks by what's happening. */

const base = (o: Partial<DirectorInput> = {}): DirectorInput => ({
  camera: "broadcast",
  frame: { tick: 30, ball: { x: 0.55, y: 2.08, z: -8.5 }, contact: false, mode: "delivery", bounce: false },
  outcome: null,
  deadAge: -1,
  humanBatting: true,
  config: { venue: "lantern" },
  batterX: -0.38,
  batterZ: 8.84,
  replay: false,
  bowler: { x: 1.1, z: -18 },
  ...o,
});
const outcome = (o: Partial<Outcome>): Outcome => ({ bat: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, total: 0, legal: true, wicket: null, dismissed: "striker", boundary: 0, completedRuns: 0, timing: 0, label: "0", ...o });

test("every selectable camera is inside the ground, above the turf, with a sensible lens", () => {
  const v = VENUES.lantern;
  for (const camera of Object.keys(CAMERA_LABELS) as CameraName[]) {
    for (const frame of [base().frame, { tick: 260, ball: { x: 14, y: 0.04, z: -22 }, contact: true, mode: "struck" as const, bounce: true }]) {
      const s = direct(base({ camera, frame, fielder: { x: 16, z: -24 } }));
      expect(s.fov, camera).toBeGreaterThanOrEqual(20);
      expect(s.fov, camera).toBeLessThanOrEqual(55);
      expect(s.py, camera).toBeGreaterThan(0.3);
      if (s.py < 30) expect(Math.hypot(s.px / v.radiusX, s.pz / v.radiusZ), camera).toBeLessThan(1.05);
    }
  }
});
test("the run-up camera runs alongside the bowler", () => {
  const near = direct(base({ bowler: { x: 1.1, z: -20 } })),
    later = direct(base({ bowler: { x: 0.9, z: -12 } }));
  expect(near.name).toBe("bowler-run-up");
  expect(later.pz - near.pz).toBeCloseTo(8, 5);
});
test("a ground ball about to be fielded is shown from beside the fielder, with the ball in frame", () => {
  const s = direct(base({ frame: { tick: 300, ball: { x: 20, y: 0.04, z: -25 }, contact: true, mode: "struck", bounce: true }, fielder: { x: 22, z: -28 } }));
  expect(s.name).toBe("fielding");
  // Looks between the fielder and the ball, from outside them.
  expect(s.lx).toBeCloseTo(21, 5);
  expect(Math.hypot(s.px, s.pz)).toBeGreaterThan(Math.hypot(22, -28));
});
test("breaks in play and the result have their own shots, after the moment itself", () => {
  const over = { outcome: outcome({}), frame: { ...base().frame, mode: "dead" as const } };
  expect(direct(base({ ...over, deadAge: 1, interlude: "over" })).name).not.toMatch(/^interlude/);
  expect(direct(base({ ...over, deadAge: 3, interlude: "over", time: 5 })).name).toBe("interlude-over");
  expect(direct(base({ ...over, deadAge: 3, interlude: "result", time: 5 })).name).toBe("result");
});
test("the replay director cuts to the fielding once the ball is near the fielder", () => {
  const s = direct(base({ camera: "director", replay: true, contactTick: 200, frame: { tick: 320, ball: { x: 18, y: 0.04, z: -20 }, contact: true, mode: "struck", bounce: true }, fielder: { x: 22, z: -24 } }));
  expect(s.name).toBe("replay-fielding");
  void RELEASE_TICK;
});
