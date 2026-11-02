import { describe, expect, it } from "vitest";
import { seededRng, type PlayerRef } from "../src";
import {
  ARENA_RADIUS,
  bumperBlitzConfigSchema,
  bumperBlitzEngine as engine,
  POD_RADIUS,
  step,
  TICK_MS,
  type BBState,
} from "../src/bumper-blitz/engine";

const players = (n: number): PlayerRef[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: "#fff" }));
const rng = seededRng(7);

function newGame(n = 2, config = {}): BBState {
  return engine.create(players(n), bumperBlitzConfigSchema.parse({ powerups: false, hazards: false, ...config }), { now: 0, rng }).state;
}

/** Runs the simulation from `from` until `until`, one fixed step at a time. */
function run(s: BBState, until: number) {
  const events = [];
  while (s.lastTickAt + TICK_MS <= until && s.status !== "finished") events.push(...step(s, s.lastTickAt + TICK_MS, rng));
  return events;
}

describe("Bumper Blitz simulation", () => {
  it("holds everyone still during the countdown", () => {
    const s = newGame();
    engine.handleAction(s, "p0", { type: "arena:input", x: 1, y: 0, boost: false }, { now: 0, rng });
    const x = s.pods[0]!.x;
    run(s, s.playAt - TICK_MS);
    expect(s.status).toBe("countdown");
    expect(s.pods[0]!.x).toBe(x);
  });

  it("steers pods with input and caps their speed", () => {
    const s = newGame();
    s.pods[0]!.x = 0;
    s.pods[0]!.y = 0;
    engine.handleAction(s, "p0", { type: "arena:input", x: 1, y: 0, boost: false }, { now: 0, rng });
    run(s, s.playAt + 600);
    expect(s.pods[0]!.x).toBeGreaterThan(80);
    expect(Math.hypot(s.pods[0]!.vx, s.pods[0]!.vy)).toBeLessThan(1000);
  });

  it("treats input as steering only: it never broadcasts or moves pods directly", () => {
    const s = newGame();
    const r = engine.handleAction(s, "p0", { type: "arena:input", x: 1, y: 1, boost: true }, { now: 0, rng });
    expect(r).toMatchObject({ ok: true, stateChanged: false, messages: [] });
    expect(engine.actionSchema.safeParse({ type: "arena:input", x: 5, y: 0 }).success).toBe(false);
  });

  it("collides pods elastically and records who hit whom", () => {
    const s = newGame();
    s.status = "playing";
    s.playAt = 0;
    Object.assign(s.pods[0]!, { x: -40, y: 0, vx: 400, vy: 0 });
    Object.assign(s.pods[1]!, { x: 40, y: 0, vx: -100, vy: 0 });
    run(s, 300);
    expect(s.pods[1]!.vx).toBeGreaterThan(0);
    expect(s.pods[1]!.lastHitBy?.id).toBe("p0");
  });

  it("knocks out pods that leave the ring and credits the last hitter", () => {
    const s = newGame();
    s.status = "playing";
    s.playAt = 0;
    Object.assign(s.pods[1]!, { x: ARENA_RADIUS - POD_RADIUS, y: 0, vx: 600, vy: 0, lastHitBy: { id: "p0", at: 0 } });
    Object.assign(s.pods[0]!, { x: -200, y: 0 });
    const events = run(s, 200);
    expect(events).toContainEqual({ kind: "ko", playerId: "p1", by: "p0" });
    expect(s.pods[0]!.knockouts).toBe(1);
    expect(s.pods[1]!.falls).toBe(1);
    run(s, 3000);
    expect(s.pods[1]!.outUntil).toBeNull();
  });

  it("gives no credit for a self-inflicted fall", () => {
    const s = newGame();
    s.status = "playing";
    s.playAt = 0;
    Object.assign(s.pods[1]!, { x: ARENA_RADIUS - 5, y: 0, vx: 600, vy: 0, lastHitBy: null });
    expect(run(s, 200)).toContainEqual({ kind: "ko", playerId: "p1", by: null });
    expect(s.pods[0]!.knockouts).toBe(0);
  });

  it("spawns and collects power-ups", () => {
    const s = newGame(2, { powerups: true });
    s.status = "playing";
    s.playAt = 0;
    s.nextPowerupAt = 0;
    run(s, 50);
    expect(s.powerups).toHaveLength(1);
    const u = s.powerups[0]!;
    Object.assign(s.pods[0]!, { x: u.x, y: u.y, vx: 0, vy: 0 });
    const events = run(s, 100);
    expect(events.some((e) => e.kind === "powerup")).toBe(true);
  });

  it("ends at the time limit and ranks by knockouts", () => {
    const s = newGame(3, { durationSeconds: 30 });
    s.pods[2]!.knockouts = 3;
    s.pods[0]!.knockouts = 1;
    s.pods[0]!.falls = 2;
    engine.tick(s, { now: s.endsAt + 10, rng });
    while (!engine.isFinished(s)) engine.tick(s, { now: s.lastTickAt + 200, rng });
    const r = engine.results(s);
    expect(r.entries[0]).toMatchObject({ playerId: "p2", isWinner: true, score: 300 });
    expect(r.entries.find((e) => e.playerId === "p0")!.score).toBe(50);
  });

  it("limits catch-up after a stalled timer", () => {
    const s = newGame();
    const before = s.tick;
    engine.tick(s, { now: 10_000, rng });
    expect(s.tick - before).toBeLessThanOrEqual(4);
  });

  it("finishes early when only one player is left", () => {
    const s = newGame();
    engine.removePlayer(s, "p1", { now: 100, rng });
    expect(engine.isFinished(s)).toBe(true);
  });
});
