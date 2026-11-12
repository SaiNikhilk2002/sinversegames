import { expect, test } from "@playwright/test";
import { shotSchema } from "@platform/engines/sinverse-cricket";
import { CATEGORIES, SHOT_BOOK, choiceFor, deliveryRead, shotChoice, shotsIn, stepChoice, strokeOf } from "../src/games/sinverse-cricket/shots";
import { SHOTS as STROKES } from "../src/games/sinverse-cricket/batting";
import { direct } from "../src/games/sinverse-cricket/director";

/** The batting shot book: twenty choices, each a real engine input with its own stroke. */

test("every shot is a valid engine input, the press supplying only the tick", () => {
  expect(SHOT_BOOK).toHaveLength(20);
  for (const s of SHOT_BOOK) if (s.input) expect(shotSchema.safeParse({ ...s.input, face: 0, tick: 160 }).success, s.id).toBe(true);
  expect(shotChoice("leave")!.input).toBeNull();
});
test("every shot has its own stroke: no two choices share an animation", () => {
  const strokes = SHOT_BOOK.map(strokeOf);
  expect(new Set(strokes).size).toBe(SHOT_BOOK.length);
  for (const s of strokes) if (s !== "leave") expect(STROKES[s], s).toBeTruthy();
});
test("the families cover every shot, and footwork and loft are labelled from the input", () => {
  expect(CATEGORIES.flatMap((c) => shotsIn(c.id)).length).toBe(SHOT_BOOK.length);
  for (const c of CATEGORIES) expect(shotsIn(c.id).length, c.id).toBeGreaterThan(0);
  expect(shotChoice("pull")!.footwork).toBe("back");
  expect(shotChoice("cover-drive")!.footwork).toBe("front");
  expect(shotChoice("lofted-cover")!.lofted).toBe(true);
  expect(shotChoice("cover-drive")!.lofted).toBe(false);
});
test("keyboard stepping: a family key picks its first shot, then cycles through it", () => {
  const drive = shotChoice("straight-drive")!;
  const first = stepChoice(drive, "lofted");
  expect(first.id).toBe("lofted-straight");
  expect(stepChoice(first, "lofted").id).toBe("lofted-cover");
  expect(stepChoice(stepChoice(stepChoice(first, "lofted"), "lofted"), "lofted").id).toBe("lofted-straight");
});
test("the current engine input is named by the nearest shot in the book", () => {
  for (const s of SHOT_BOOK) expect(choiceFor(s.input).id).toBe(s.id);
});
test("the speed read is the measured pace in km/h and the delivery's name", () => {
  expect(deliveryRead(38.9, "inswing")).toEqual({ kmh: 140, name: "Inswinger" });
  expect(deliveryRead(22, "legbreak").name).toBe("Leg-break");
});
test("a big catch gets the catching camera, close beside the fielder; nothing else does", () => {
  const base = { camera: "broadcast" as const, frame: { tick: 260, ball: { x: 20, y: 3, z: -30 }, contact: true, mode: "struck" as const, bounce: false }, outcome: null, deadAge: -1, humanBatting: true, config: { venue: "lantern" as const }, batterX: -0.38, batterZ: 8.84, replay: false, fielder: { x: 22, z: -32 } };
  const s = direct({ ...base, cinematic: true });
  expect(s.name).toBe("catching");
  expect(Math.hypot(s.px - 22, s.pz + 32)).toBeLessThan(8);
  expect(direct({ ...base, cinematic: false }).name).not.toBe("catching");
  // A chosen fixed camera is respected.
  expect(direct({ ...base, camera: "side", cinematic: true }).name).toBe("side");
});
