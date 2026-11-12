import { expect, test } from "@playwright/test";
import { Delivery, FIELD_NAMES, RELEASE_TICK, SHOTS, VARIATIONS, configSchema } from "@platform/engines/sinverse-cricket";
import { bowlingStyle } from "../src/games/sinverse-cricket/animation";
import { LANES, MIN_GAP, PEOPLE, batterSpot, bowlerSpot, closestPair, huddleSpot, place, separate, umpireSpot } from "../src/games/sinverse-cricket/spacing";

/**
 * Players are solid: nobody is drawn inside anybody else. These run the same
 * placement code the renderer uses, against real simulated deliveries.
 */
const config = configSchema.parse({});
const NAMES = ["striker", "non-striker", ...Array.from({ length: 9 }, (_, n) => `fielder ${n + 1}`), "bowler", "keeper", "umpire"];

test.describe("Cricket player spacing", () => {
  test("the bowler's run-up, delivery and follow-through never pass through the non-striker or umpire", () => {
    for (const style of ["fast", "medium", "spin"] as const)
      for (const frontFootZ of [-9.3, -8.9, -8.5])
        for (let tick = 0; tick <= RELEASE_TICK + 140; tick++) {
          const bowler = bowlerSpot(tick, style, frontFootZ, { x: 0.55, z: -8.5 }, 0);
          for (const [name, other] of [["non-striker", batterSpot(false, 0, 8.8)], ["umpire", umpireSpot()]] as const)
            expect(Math.hypot(bowler.x - other.x, bowler.z - other.z), `${style} bowler to ${name} at tick ${tick}, metres`).toBeGreaterThanOrEqual(MIN_GAP);
        }
  });

  test("the two batters run in separate lanes and never brush each other", () => {
    for (let runner = 0.001; runner <= 3; runner += 0.004) {
      const a = batterSpot(true, runner, 8.8),
        b = batterSpot(false, runner, 8.8);
      expect(Math.hypot(a.x - b.x, a.z - b.z), `batters at ${runner.toFixed(3)} runs`).toBeGreaterThanOrEqual(MIN_GAP);
    }
    expect(Math.abs(LANES.strikerRunning - LANES.nonStrikerRunning)).toBeGreaterThan(1);
  });

  test("overlapping bodies are pushed apart, and a player on the ball is not moved", () => {
    const xz = new Float32Array([0, 0, 0.1, 0, 0.1, 0.05, 5, 5]),
      hold = new Uint8Array([2, 0, 0, 0]);
    separate(xz, hold, 4, MIN_GAP, 8);
    expect([xz[0], xz[1]]).toEqual([0, 0]);
    expect([xz[6], xz[7]]).toEqual([5, 5]);
    expect(closestPair(xz, 4)).toBeGreaterThan(MIN_GAP - 0.02);
    // A player on the ball gives way to a batter, and a bystander gives way to him.
    const ranked = separate(new Float32Array([0, 0, 0.2, 0, 0.4, 0]), new Uint8Array([2, 1, 0]), 3, MIN_GAP, 8);
    expect([ranked[0], ranked[1]]).toEqual([0, 0]);
    expect(closestPair(ranked, 3)).toBeGreaterThan(MIN_GAP - 0.02);
    // Exactly coincident bodies still separate, the same way every time.
    const same = () => separate(new Float32Array([2, 2, 2, 2]), new Uint8Array(2), 2);
    expect(closestPair(same(), 2)).toBeCloseTo(MIN_GAP, 5);
    expect(Array.from(same())).toEqual(Array.from(same()));
  });

  test("a wicket celebration gathers eleven players without stacking them", () => {
    const xz = new Float32Array(22);
    for (let n = 0; n < 11; n++) {
      const s = huddleSpot(n, 11, { x: 3, z: -4 });
      xz.set([s.x, s.z], n * 2);
    }
    expect(closestPair(xz, 11)).toBeGreaterThanOrEqual(MIN_GAP);
  });

  test("across real deliveries nobody is ever drawn inside another player", () => {
    const spots = new Float32Array(PEOPLE * 2),
      holds = new Uint8Array(PEOPLE);
    let frames = 0,
      worst = Infinity,
      where = "";
    const overlaps = new Map<string, number>();
    for (let seed = 1; seed <= 60; seed++) {
      const variation = VARIATIONS[seed % VARIATIONS.length]!,
        kind = SHOTS[seed % SHOTS.length]!,
        bowl = { variation, line: ((seed % 5) - 2) * 0.12, length: 2 + (seed % 7), speed: (seed % 4) / 4, release: 0 },
        shot = seed % 6 === 0 ? null : { kind, direction: ((seed * 37) % 160) - 80, power: 0.35 + ((seed * 13) % 60) / 100, foot: 0, face: 0, tick: 150 + (seed % 9) * 3 },
        d = new Delivery(seed * 977, bowl, FIELD_NAMES[seed % 3]!, config, false, shot, seed % 2 ? [] : [0, 40, 80], true);
      while (!d.outcome && d.tick < 6000) d.step();
      const wicket = !!d.outcome?.wicket,
        last = d.frames[d.frames.length - 1]!;
      // The live ball, then four seconds of aftermath (celebration or reset) on the final frame.
      const tail = Array.from({ length: 40 }, (_, k) => ({ frame: last, age: k * 0.1 }));
      for (const { frame, age } of [...d.frames.map((frame) => ({ frame, age: -1 })), ...tail]) {
        place({ tick: frame.tick, style: bowlingStyle(variation), runner: frame.runner, batterGroundZ: frame.batterGroundZ, bowlerFootZ: frame.bowlerFootZ, fielders: frame.fielders, actions: frame.actions, travel: frame.travel, huddleAge: wicket && age >= 0 ? age - 1.1 : -1, dismissedStriker: d.outcome?.dismissed === "striker", entry: -1, keepClear: true }, spots, holds);
        frames++;
        for (let a = 0; a < PEOPLE; a++)
          for (let b = a + 1; b < PEOPLE; b++) {
            const gap = Math.hypot(spots[b * 2]! - spots[a * 2]!, spots[b * 2 + 1]! - spots[a * 2 + 1]!);
            if (gap < worst) {
              worst = gap;
              where = `${NAMES[a]} and ${NAMES[b]}, seed ${seed}, tick ${frame.tick}`;
            }
            if (gap < MIN_GAP - 0.03) overlaps.set(`${NAMES[a]} / ${NAMES[b]}`, (overlaps.get(`${NAMES[a]} / ${NAMES[b]}`) ?? 0) + 1);
          }
      }
    }
    console.log(`spacing: ${frames} frames, closest ${worst.toFixed(2)} m (${where}); overlapping pairs: ${JSON.stringify([...overlaps])}`);
    expect(frames).toBeGreaterThan(5000);
    expect([...overlaps], `closest: ${where}`).toEqual([]);
  });
});
