import { expect, test } from "@playwright/test";
import { CricketMatch, Delivery, configSchema, type Outcome } from "@platform/engines/sinverse-cricket";
import { TossSequence, coinPose } from "../src/games/sinverse-cricket/ceremony";
import { DEFAULT_BINDINGS, acceptsGameplayKey, finishGesture, gestureBowl, gestureShot, keyboardIntent, keyLabel, parseBindings, rebind } from "../src/games/sinverse-cricket/input";
import { CH, CLIPS, makePose, runUpProgress, sampleClip, selectBowler, selectFielder, selectKeeper } from "../src/games/sinverse-cricket/animation";
import { ceremonyCamera } from "../src/games/sinverse-cricket/ceremony-scene";

const bat = { kind: "straight" as const, direction: 0, power: 0.8, foot: 0, face: 0 };
const bowl = { variation: "seam" as const, line: 0, length: 4, speed: 0.4, release: 0 };
test("keyboard changes real intent, supports every family and clamps input", () => {
  for (let n = 1; n <= 8; n++) expect(keyboardIntent(`Digit${n}`, DEFAULT_BINDINGS, bat, bowl, true)?.bat?.kind).toBeTruthy();
  expect(keyboardIntent("ArrowRight", DEFAULT_BINDINGS, { ...bat, direction: 120 }, bowl, true)?.bat?.direction).toBe(120);
  expect(keyboardIntent("ArrowUp", DEFAULT_BINDINGS, bat, bowl, true)?.bat?.foot).toBe(0.65);
  expect(keyboardIntent("ArrowDown", DEFAULT_BINDINGS, bat, bowl, true)?.bat?.foot).toBe(-0.3);
  expect(keyboardIntent("ShiftLeft", DEFAULT_BINDINGS, bat, bowl, true)?.bat?.kind).toBe("loft");
  expect(keyboardIntent("ControlLeft", DEFAULT_BINDINGS, bat, bowl, true)?.bat?.power).toBe(0.3);
  expect(keyboardIntent("KeyV", DEFAULT_BINDINGS, bat, bowl, false)?.bowl?.variation).toBe("inswing");
  expect(keyboardIntent("ArrowUp", DEFAULT_BINDINGS, bat, bowl, false)?.bowl?.length).toBe(3.5);
});
test("binding conflicts, browser shortcuts and focused inputs do not fire gameplay", () => {
  expect(keyLabel("ArrowLeft")).toBe("Left");
  expect(rebind(DEFAULT_BINDINGS, "action", "KeyR")).toBeNull();
  expect(rebind(DEFAULT_BINDINGS, "action", "Escape")).toBeNull();
  expect(rebind(DEFAULT_BINDINGS, "action", "Digit1")).toBeNull();
  expect(parseBindings({ action: "KeyX" })).toEqual(DEFAULT_BINDINGS);
  expect(rebind(DEFAULT_BINDINGS, "action", "KeyX")?.action).toBe("KeyX");
  for (const [interactive, altKey, metaKey, ctrlKey] of [[true, false, false, false], [false, true, false, false], [false, false, true, false], [false, false, false, true]]) {
    expect(acceptsGameplayKey({ altKey: altKey!, metaKey: metaKey!, ctrlKey: ctrlKey!, code: "KeyR" }, interactive!)).toBe(false);
  }
});
test("touch direction and duration select a physical shot; cancelled/wrong/stale pointers cannot commit", () => {
  const start = { id: 7, x: 100, y: 200, at: 1000, width: 400, height: 600 };
  expect(finishGesture(null, 7, 150, 120, 1100)).toBeNull();
  expect(finishGesture(start, 8, 150, 120, 1100)).toBeNull();
  expect(finishGesture(start, 7, 150, 120, 5000)).toBeNull();
  const right = finishGesture(start, 7, 200, 100, 1300)!;
  expect(gestureShot(right, bat)).toMatchObject({ kind: "cover", direction: 45, foot: 0.55 });
  expect(gestureShot(finishGesture(start, 7, 100, 200, 1100)!, bat).kind).toBe("defend");
  expect(gestureShot(finishGesture(start, 7, 100, -50, 1200)!, bat).kind).toBe("loft");
  expect(gestureBowl(right, bowl).line).toBeGreaterThan(0);
  expect(gestureBowl(right, bowl).length).toBeLessThan(4);
});
test("toss waits in flight indefinitely; choice locks before result and survives pause", () => {
  const toss = new TossSequence();
  toss.skip();
  for (let n = 0; n < 200; n++) toss.advance(0.1, false, false);
  expect(toss.stage).toBe("flight"); expect(toss.feed("heads", 0, false).face).toBeNull();
  const age = toss.age; toss.advance(100, true, false); expect(toss.age).toBe(age);
  expect(toss.choose("tails")).toBe(true); expect(toss.choose("heads")).toBe(false);
  expect(toss.feed("heads", 0, false).face).toBeNull();
  toss.advance(2, false, false); expect(toss.stage).toBe("landing");
  expect(toss.feed("heads", 0, false).face).toBe("heads");
  toss.advance(1, false, false); expect(toss.stage).toBe("reveal");
});
test("skipping or interrupting never supplies a call or changes the seeded toss", () => {
  for (const seed of [1, 5, 18, 73, 103]) {
    const match = new CricketMatch(seed, configSchema.parse({}));
    const toss = new TossSequence(); toss.skip(); toss.skip();
    expect(toss.call).toBeNull(); expect(toss.enter()).toBe(false);
    toss.choose("heads"); toss.skip(); toss.skip(); toss.skip();
    expect(toss.stage).toBe("decision");
    const face = match.tossFace;
    expect(toss.enter()).toBe(true);
    expect(match.toss({ k: "toss", call: toss.call, decision: "bat", t: 10000 })).toBe(true);
    expect(match.tossFace).toBe(face);
    expect(match.tossWinner).toBe(face === "heads" ? 0 : 1);
  }
});
test("coin flight is outcome-independent; landed 3D orientation reveals its real upper face", () => {
  for (const result of ["heads", "tails"] as const) {
    const toss = new TossSequence(); toss.skip(); toss.choose("heads");
    const airborne = toss.feed(result, 0, false);
    expect(airborne.face).toBeNull(); expect(coinPose(airborne)).toEqual(coinPose({ ...airborne, face: null }));
    toss.skip(); toss.skip();
    const landed = coinPose(toss.feed(result, 0, false));
    expect(Math.cos(landed.rx)).toBeCloseTo(result === "heads" ? 1 : -1, 8);
    expect(landed.y).toBeLessThan(0.08);
  }
});
test("ceremony camera focuses the real coin and remains finite through transitions", () => {
  const toss = new TossSequence();
  for (let n = 0; n < 180; n++) {
    if (toss.stage === "flight" && !toss.call) toss.choose("heads");
    if (toss.stage === "decision") toss.enter();
    const f = toss.feed("tails", 0, false), cam = ceremonyCamera(f);
    if (cam) { expect(Object.values(cam).filter(v => typeof v === "number").every(Number.isFinite)).toBe(true); expect(cam.py).toBeGreaterThan(0); }
    if (f.stage === "flight") expect(cam?.ly).toBeCloseTo(coinPose(f).y);
    toss.advance(0.1, false, false);
  }
  expect(toss.stage).toBe("done");
});
const o = (wicket: Outcome["wicket"]): Outcome => ({ bat: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, total: 0, legal: true, wicket, dismissed: "striker", boundary: 0, completedRuns: 0, timing: 0, label: "W" });
test("dismissal/role reactions are finite, grounded and recover from dives", () => {
  const moment = { tick: 200, outcome: o("bowled"), deadAge: 0.5, contact: false };
  const common = { ...moment, style: "fast" as const, chasing: false, action: "ready" as const, actionAge: 0, moving: false, ballY: 1, wicket: "bowled" as const };
  const clips = new Set();
  for (const wicket of ["bowled", "caught", "lbw", "run-out", "stumped"] as const) {
    const sel = selectBowler({ ...common, outcome: o(wicket), wicket });
    expect(typeof sel).toBe("object"); if (typeof sel === "object") clips.add(sel.clip);
  }
  expect(clips.size).toBeGreaterThanOrEqual(4);
  expect(selectFielder({ ...moment, outcome: o("caught"), action: "catch", actionAge: 0.4, moving: false, speed: 0, ballY: 1.7, id: 2, chasing: true })).toMatchObject({ clip: "showCatch" });
  expect(selectKeeper({ ...common, outcome: o("run-out"), wicket: "run-out", action: "throw", ballZ: 10 })).toMatchObject({ clip: "directHit" });
  expect(selectFielder({ ...moment, action: "dive", actionAge: 1.4, moving: false, speed: 0, ballY: 0, id: 3, chasing: true })).toMatchObject({ clip: "recover" });
  expect(CLIPS.celebrate.loop).toBeUndefined();
  for (let t = 0; t < 4; t += 0.1) { const p = sampleClip(CLIPS.celebrate, t, makePose()); expect(p[CH.lFootY]).toBeCloseTo(0.09); expect(p[CH.rFootY]).toBeCloseTo(0.09); }
});
test("run-up accelerates off its mark and all styles reach the unchanged release", () => {
  for (const style of ["fast", "medium", "spin"] as const) {
    expect(runUpProgress(0, style)).toBe(0); expect(runUpProgress(100, style)).toBe(1);
    expect(runUpProgress(10, style) - runUpProgress(0, style)).toBeLessThan(runUpProgress(30, style) - runUpProgress(20, style));
  }
});
test("presentation clock, toss, camera and input previews cannot mutate a delivery digest", () => {
  const config = configSchema.parse({});
  const original = new Delivery(123, bowl, "balanced", config);
  const presented = new Delivery(123, bowl, "balanced", config);
  const toss = new TossSequence();
  while (!presented.outcome) { toss.advance(1 / 60, false, false); ceremonyCamera(toss.feed("heads", 0, false)); keyboardIntent("ArrowRight", DEFAULT_BINDINGS, bat, bowl, true); presented.step(); }
  original.complete();
  expect(presented.digest).toBe(original.digest); expect(presented.outcome).toEqual(original.outcome);
});
