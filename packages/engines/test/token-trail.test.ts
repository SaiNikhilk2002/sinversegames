import { describe, expect, it } from "vitest";
import { seededRng, type EngineContext, type PlayerRef, type Rng } from "../src";
import {
  absoluteSquare,
  bestMove,
  HOME,
  SAFE_SQUARES,
  targetProgress,
  tokenTrailConfigSchema,
  tokenTrailEngine as engine,
  type TokenTrailConfig,
  type TTState,
} from "../src/token-trail/engine";

const players = (n: number): PlayerRef[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: "#fff" }));
/** An RNG that returns the given die faces (1–6) in order. */
const dice = (...faces: number[]): Rng => ({ int: () => (faces.shift() ?? 1) - 1 });
const ctx = (now: number, rng: Rng = seededRng(1)): EngineContext => ({ now, rng });

function newGame(n = 2, config: Partial<TokenTrailConfig> = {}): TTState {
  const s = engine.create(players(n), tokenTrailConfigSchema.parse(config), ctx(1000)).state;
  s.current = 0;
  return s;
}

function act(s: TTState, id: string, action: Parameters<typeof engine.handleAction>[2], rng: Rng, now = 2000) {
  return engine.handleAction(s, id, action, ctx(now, rng));
}

describe("Token Trail rules", () => {
  it("seats two players opposite each other and starts everyone in base", () => {
    const s = newGame(2);
    expect(s.players.map((p) => p.seat)).toEqual([0, 2]);
    expect(s.players.every((p) => p.tokens.every((t) => t === -1))).toBe(true);
    expect(newGame(4).players.map((p) => p.seat)).toEqual([0, 1, 2, 3]);
  });

  it("needs a 6 to leave base and needs an exact roll to get home", () => {
    expect(targetProgress(-1, 5)).toBeNull();
    expect(targetProgress(-1, 6)).toBe(0);
    expect(targetProgress(50, 6)).toBe(56);
    expect(targetProgress(53, 4)).toBeNull();
    expect(targetProgress(HOME, 1)).toBeNull();
  });

  it("maps progress onto the shared loop per seat and keeps home lanes private", () => {
    expect(absoluteSquare(0, 0)).toBe(0);
    expect(absoluteSquare(1, 0)).toBe(13);
    expect(absoluteSquare(3, 40)).toBe((39 + 40) % 52);
    expect(absoluteSquare(2, 51)).toBeNull();
  });

  it("passes the turn when no token can move", () => {
    const s = newGame(2);
    const r = act(s, "p0", { type: "trail:roll" }, dice(3));
    expect(r.ok).toBe(true);
    expect(s.players[s.current]!.id).toBe("p1");
    expect(s.phase).toBe("roll");
  });

  it("auto-moves when only one choice exists and grants a bonus roll on a 6", () => {
    const s = newGame(2);
    act(s, "p0", { type: "trail:roll" }, dice(6));
    expect(s.players[0]!.tokens.filter((t) => t === 0)).toHaveLength(1);
    expect(s.players[s.current]!.id).toBe("p0");
    expect(s.phase).toBe("roll");
  });

  it("lets the player choose between different tokens", () => {
    const s = newGame(2);
    s.players[0]!.tokens = [5, 10, -1, -1];
    act(s, "p0", { type: "trail:roll" }, dice(2));
    expect(s.phase).toBe("move");
    expect(engine.viewFor(s, "p0").movable).toEqual([0, 1]);
    expect(act(s, "p0", { type: "trail:move", token: 2 }, dice()).ok).toBe(false);
    expect(act(s, "p0", { type: "trail:move", token: 1 }, dice()).ok).toBe(true);
    expect(s.players[0]!.tokens[1]).toBe(12);
    expect(s.players[s.current]!.id).toBe("p1");
  });

  it("captures rivals off safe squares and earns another roll", () => {
    const s = newGame(2);
    // p1 (seat 2) token at its progress 3 → absolute square 29; p0 token at 27 rolls 2 → square 29.
    s.players[1]!.tokens = [3, -1, -1, -1];
    s.players[0]!.tokens = [27, 40, -1, -1];
    act(s, "p0", { type: "trail:roll" }, dice(2));
    act(s, "p0", { type: "trail:move", token: 0 }, dice());
    expect(s.players[1]!.tokens[0]).toBe(-1);
    expect(s.players[0]!.captures).toBe(1);
    expect(s.players[s.current]!.id).toBe("p0");
  });

  it("never captures on a safe star square", () => {
    const s = newGame(2);
    // p1 seat 2 progress 8 → absolute 34, which is a star.
    expect(SAFE_SQUARES.has(34)).toBe(true);
    s.players[1]!.tokens = [8, -1, -1, -1];
    s.players[0]!.tokens = [32, 10, -1, -1];
    act(s, "p0", { type: "trail:roll" }, dice(2));
    act(s, "p0", { type: "trail:move", token: 0 }, dice());
    expect(s.players[1]!.tokens[0]).toBe(8);
  });

  it("ends the turn on three sixes in a row", () => {
    const s = newGame(2);
    s.players[0]!.tokens = [10, 20, -1, -1];
    for (let i = 0; i < 2; i++) {
      act(s, "p0", { type: "trail:roll" }, dice(6));
      act(s, "p0", { type: "trail:move", token: 0 }, dice());
    }
    expect(s.players[s.current]!.id).toBe("p0");
    act(s, "p0", { type: "trail:roll" }, dice(6));
    expect(s.players[s.current]!.id).toBe("p1");
    expect(s.lastEvents.some((e) => e.kind === "three-sixes")).toBe(true);
  });

  it("rejects out-of-turn and out-of-phase actions without changing state", () => {
    const s = newGame(2);
    expect(act(s, "p1", { type: "trail:roll" }, dice(6))).toMatchObject({ ok: false, code: "NOT_YOUR_TURN" });
    expect(act(s, "p0", { type: "trail:move", token: 0 }, dice())).toMatchObject({ ok: false, code: "INVALID_MOVE" });
    expect(s.players[0]!.tokens).toEqual([-1, -1, -1, -1]);
  });

  it("wins when every token is home and ranks the rest by progress", () => {
    const s = newGame(3, { tokensPerPlayer: 1 });
    s.players[0]!.tokens = [52];
    s.players[1]!.tokens = [30];
    s.players[2]!.tokens = [10];
    act(s, "p0", { type: "trail:roll" }, dice(4));
    expect(engine.isFinished(s)).toBe(true);
    const r = engine.results(s);
    expect(r.entries.map((e) => e.playerId)).toEqual(["p0", "p1", "p2"]);
    expect(r.entries[0]).toMatchObject({ isWinner: true, placement: 1 });
  });

  it("auto-plays timed-out turns, faster for disconnected players", () => {
    const s = newGame(2, { turnSeconds: 10 });
    expect(engine.nextDeadline(s)).toBe(s.phaseStartedAt + 10_000);
    engine.setConnected(s, "p0", false, ctx(1000));
    expect(engine.nextDeadline(s)).toBe(1000 + 5000);
    engine.tick(s, ctx(6000, dice(6)));
    expect(s.players[0]!.tokens).toContain(0);
  });

  it("prefers captures when auto-playing", () => {
    const s = newGame(2);
    s.players[1]!.tokens = [3, -1, -1, -1];
    s.players[0]!.tokens = [27, 40, -1, -1];
    s.roll = 2;
    expect(bestMove(s, s.players[0]!)).toBe(0);
  });

  it("ends the match when only one player remains", () => {
    const s = newGame(2);
    engine.removePlayer(s, "p1", ctx(3000));
    expect(engine.isFinished(s)).toBe(true);
    expect(engine.results(s)).toMatchObject({ reason: "players-left" });
  });

  it("finishes random full games with legal states only", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = seededRng(seed);
      const s = engine.create(players(2 + (seed % 3)), tokenTrailConfigSchema.parse({ tokensPerPlayer: 1 + (seed % 4) }), ctx(0, rng)).state;
      let now = 0;
      for (let step = 0; step < 5000 && !engine.isFinished(s); step++) {
        now += 1000;
        const p = s.players[s.current]!;
        const res =
          s.phase === "roll"
            ? engine.handleAction(s, p.id, { type: "trail:roll" }, ctx(now, rng))
            : engine.handleAction(s, p.id, { type: "trail:move", token: bestMove(s, p) }, ctx(now, rng));
        expect(res.ok).toBe(true);
        for (const pl of s.players) for (const t of pl.tokens) expect(t >= -1 && t <= HOME).toBe(true);
      }
      expect(engine.isFinished(s)).toBe(true);
    }
  });
});
