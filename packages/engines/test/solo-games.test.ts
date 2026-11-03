import { describe, expect, it } from "vitest";
import {
  cascadeSolitaire,
  deal,
  hints,
  isLegal,
  rankOf,
  SolitaireGame,
  solitaireLogSchema,
  totalScore as solitaireScore,
  type SolitaireMove,
} from "../src/cascade-solitaire/engine";
import {
  availablePairs,
  freeTiles,
  generateBoard,
  isDeadEnd,
  isFree,
  LAYOUTS,
  MahjongGame,
  mahjongGarden,
  matchKey,
  newBoard,
  safeHint,
  type MahjongMove,
} from "../src/mahjong-garden/engine";
import {
  advance,
  createKitchen,
  cratesFor,
  kitchenRush,
  LEVELS,
  PROCESSES,
  RECIPES,
  SOLO_COOK,
  starsFor,
  stationForm,
  tap,
  type KitchenState,
  type KitchenTap,
} from "../src/kitchen-rush";

// ---------------------------------------------------------------------------
// Cascade Solitaire
// ---------------------------------------------------------------------------

describe("Cascade Solitaire", () => {
  it("deals a full deck: 28 tableau cards, 24 in the stock, one face-up per column", () => {
    const s = deal(123, { draw: 1 });
    expect(s.tableau.map((c) => c.cards.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s.tableau.every((c) => c.down === c.cards.length - 1)).toBe(true);
    expect(s.stock).toHaveLength(24);
    const all = [...s.stock, ...s.tableau.flatMap((c) => c.cards)].sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 52 }, (_, i) => i));
  });

  it("is deterministic per seed", () => {
    expect(deal(5, { draw: 3 })).toEqual(deal(5, { draw: 3 }));
    expect(deal(5, { draw: 1 }).stock).not.toEqual(deal(6, { draw: 1 }).stock);
  });

  it("enforces alternating colours, descending ranks, kings on empty columns and aces first on foundations", () => {
    const s = deal(1, { draw: 1 });
    // Build a precise position.
    s.tableau = [
      { cards: [13 + 7], down: 0 }, // 8♥
      { cards: [6], down: 0 }, // 7♠
      { cards: [], down: 0 },
      { cards: [12], down: 0 }, // K♠
      { cards: [0], down: 0 }, // A♠
      { cards: [26 + 6], down: 0 }, // 7♦
      { cards: [1], down: 0 },
    ];
    expect(isLegal(s, "t1", "t0")).toBe(true); // 7♠ on 8♥
    expect(isLegal(s, "t5", "t0")).toBe(false); // 7♦ on 8♥ (same colour)
    expect(isLegal(s, "t3", "t2")).toBe(true); // K to empty
    expect(isLegal(s, "t1", "t2")).toBe(false);
    expect(isLegal(s, "t4", "f0")).toBe(true); // ace up
    expect(isLegal(s, "t6", "f0")).toBe(false); // 2 before ace
  });

  it("scores moves, flips face-down cards and charges for undo", () => {
    const g = new SolitaireGame(9, { draw: 1 });
    const h = hints(g.state).find((m) => "from" in m && m.from[0] === "t" && m.to[0] === "t");
    if (h && "from" in h) {
      const before = g.state.score;
      expect(g.apply({ k: "move", from: h.from, to: h.to, n: h.n, t: 1000 })).toBe(true);
      expect(g.state.score).toBeGreaterThanOrEqual(before);
      expect(g.apply({ k: "undo", t: 2000 })).toBe(true);
      expect(solitaireScore(g.state, 2000)).toBe(Math.max(0, before - 10));
    }
    expect(g.apply({ k: "draw", t: 3000 })).toBe(true);
    expect(g.state.waste).toHaveLength(1);
  });

  it("verifies an honest replay and rejects illegal or out-of-order logs", () => {
    const g = new SolitaireGame(77, { draw: 1 });
    const log: SolitaireMove[] = [];
    let t = 0;
    for (let i = 0; i < 300 && !g.state.won; i++) {
      const best = hints(g.state)[0];
      if (!best) break;
      const move: SolitaireMove = "draw" in best ? { k: "draw", t: (t += 500) } : { k: "move", from: best.from, to: best.to, n: best.n, t: (t += 500) };
      expect(g.apply(move)).toBe(true);
      log.push(move);
    }
    const verified = cascadeSolitaire.verify(77, { draw: 1 }, solitaireLogSchema.parse(log));
    expect(verified).toMatchObject({ ok: true, result: { score: solitaireScore(g.state, t), completed: g.state.won } });

    const bad: SolitaireMove[] = [{ k: "move", from: "w", to: "f0", n: 1, t: 10 }];
    expect(cascadeSolitaire.verify(77, { draw: 1 }, bad)).toMatchObject({ ok: false });
    expect(cascadeSolitaire.verify(77, { draw: 1 }, [{ k: "draw", t: 50 }, { k: "draw", t: 10 }])).toMatchObject({ ok: false });
  });

  it("awards the win bonus only for a completed game", () => {
    const g = new SolitaireGame(3, { draw: 1 });
    g.state.foundations = [0, 1, 2, 3].map((suit) => Array.from({ length: 13 }, (_, r) => suit * 13 + r));
    g.state.won = true;
    expect(solitaireScore(g.state, 60_000)).toBeGreaterThan(solitaireScore({ ...g.state, won: false }, 60_000));
    expect(rankOf(12)).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// Mahjong Garden
// ---------------------------------------------------------------------------

/** Plays a board to the end using only available pairs; true if cleared. */
function solveGreedy(game: MahjongGame, log: MahjongMove[], startT = 0): boolean {
  let t = startT;
  for (let i = 0; i < 200 && !game.state.won; i++) {
    const pair = availablePairs(game.state)[0];
    if (!pair) {
      const m: MahjongMove = { k: "shuffle", t: (t += 1000) };
      if (!game.apply(m)) return false;
      log.push(m);
      continue;
    }
    const m: MahjongMove = { k: "match", a: pair[0], b: pair[1], t: (t += 1000) };
    expect(game.apply(m)).toBe(true);
    log.push(m);
  }
  return game.state.won;
}

describe("Mahjong Garden", () => {
  it("defines layouts with an even number of tiles", () => {
    for (const def of Object.values(LAYOUTS)) expect(def.slots.length % 2).toBe(0);
    expect(LAYOUTS.pebble.slots).toHaveLength(36);
  });

  it("generates boards whose tiles form matching pairs", () => {
    for (const layout of ["pebble", "lotus", "pagoda"] as const) {
      const s = newBoard(11, { layout });
      const counts = new Map<number, number>();
      for (const t of s.tiles) counts.set(matchKey(t!), (counts.get(matchKey(t!)) ?? 0) + 1);
      for (const n of counts.values()) expect(n % 2).toBe(0);
    }
  });

  it("only allows free tiles: covered or boxed-in tiles are blocked", () => {
    const s = newBoard(1, { layout: "pebble" });
    const present = (i: number) => s.tiles[i] !== null;
    const top = s.slots.findIndex((x) => x.z === 2);
    const under = s.slots.findIndex((x) => x.z === 1 && Math.abs(x.x - s.slots[top]!.x) < 2 && Math.abs(x.y - s.slots[top]!.y) < 2);
    expect(isFree(s.slots, present, top)).toBe(true);
    expect(isFree(s.slots, present, under)).toBe(false);
    expect(freeTiles(s).length).toBeGreaterThan(1);
  });

  it("guarantees solvable boards: the generator's own removal order clears them", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const layout = (["pebble", "lotus", "pagoda"] as const)[seed % 3]!;
      const { state, solution } = generateBoard(seed, { layout });
      const game = new MahjongGame(seed, { layout });
      expect(game.state.tiles).toEqual(state.tiles);
      solution.forEach(([a, b], i) => expect(game.apply({ k: "match", a, b, t: i * 1000 })).toBe(true));
      expect(game.state.won).toBe(true);
    }
  });

  it("tells a shuffle-fixable position from a true dead end", () => {
    const g = new MahjongGame(3, { layout: "pebble" });
    const slots = g.state.slots;
    const stackOn = (z1: number) => slots.findIndex((x) => x.z === 0 && x.x === slots[z1]!.x && x.y === slots[z1]!.y);
    const tops = slots.flatMap((x, i) => (x.z === 1 ? [i] : []));
    const [a1, b1] = [tops[0]!, tops[3]!];
    const [a2, b2] = [stackOn(a1), stackOn(b1)];
    // Two stacks whose top tiles differ: no move now, but a re-deal can fix it.
    g.state.tiles = g.state.tiles.map((_, i) => (i === a1 || i === b2 ? 5 : i === b1 || i === a2 ? 6 : null));
    expect(availablePairs(g.state)).toHaveLength(0);
    expect(isDeadEnd(g.state)).toBe(false);
    // A single stacked column can never be cleared, whatever the tiles.
    g.state.tiles = g.state.tiles.map((_, i) => (i === a1 || i === a2 ? 5 : null));
    expect(isDeadEnd(g.state)).toBe(true);
  });

  it("rejects mismatched or blocked pairs and supports undo", () => {
    const g = new MahjongGame(4, { layout: "pebble" });
    const [a, b] = availablePairs(g.state)[0]!;
    const blocked = g.state.tiles.findIndex((_, i) => !freeTiles(g.state).includes(i));
    expect(g.apply({ k: "match", a, b: blocked, t: 100 })).toBe(false);
    expect(g.apply({ k: "match", a, b, t: 200 })).toBe(true);
    expect(g.state.tiles[a]).toBeNull();
    expect(g.apply({ k: "undo", t: 300 })).toBe(true);
    expect(g.state.tiles[a]).not.toBeNull();
    expect(g.state.undos).toBe(1);
  });

  it("verifies honest replays, penalises hints and rejects forged matches", () => {
    const g = new MahjongGame(21, { layout: "pebble" });
    const log: MahjongMove[] = [{ k: "hint", t: 500 }];
    g.apply(log[0]!);
    expect(solveGreedy(g, log, 500)).toBe(true);
    const v = mahjongGarden.verify(21, { layout: "pebble" }, log);
    expect(v).toMatchObject({ ok: true, result: { completed: true } });
    const clean = new MahjongGame(21, { layout: "pebble" });
    const cleanLog: MahjongMove[] = [];
    solveGreedy(clean, cleanLog, 500);
    const v2 = mahjongGarden.verify(21, { layout: "pebble" }, cleanLog);
    if (v.ok && v2.ok) expect(v.result.score).toBeLessThan(v2.result.score);
    expect(mahjongGarden.verify(21, { layout: "pebble" }, [{ k: "match", a: 0, b: 1, t: 5 }])).toMatchObject({ ok: false });
  });

  it("hints never lead into a dead end: following them clears every board", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const game = new MahjongGame(seed, { layout: "pebble" });
      let t = 0;
      for (let step = 0; step < 40 && !game.state.won; step++) {
        const pair = safeHint(game.state);
        expect(pair, `seed ${seed}: a hint exists until the board is clear`).not.toBeNull();
        t += 500;
        expect(game.apply({ k: "match", a: pair![0], b: pair![1], t })).toBe(true);
      }
      expect(game.state.won, `seed ${seed}`).toBe(true);
    }
  });

  it("hints stay quick on the largest layout", () => {
    const s = newBoard(7, { layout: "pagoda" });
    const start = performance.now();
    expect(safeHint(s)).not.toBeNull();
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

// ---------------------------------------------------------------------------
// Kitchen Rush
// ---------------------------------------------------------------------------

/** Taps a sequence of targets with a fixed gap, recording the log. */
function play(s: KitchenState, log: KitchenTap[], targets: string[], start: number, gap = 300): number {
  let t = start;
  for (const target of targets) {
    t += gap;
    tap(s, SOLO_COOK, target, t);
    log.push({ t, target });
  }
  return t;
}

describe("Kitchen Rush", () => {
  it("has 12 levels whose recipes can be made with the level's stations and crates", () => {
    expect(LEVELS).toHaveLength(12);
    for (const level of LEVELS) {
      const crates = cratesFor(level);
      for (const r of level.recipes) {
        for (const part of RECIPES[r].parts) {
          const viaStation = Object.entries(PROCESSES).some(
            ([type, procs]) => (level.stations[type as keyof typeof level.stations] ?? 0) > 0 && Object.values(procs).some((p) => p?.to === part),
          );
          expect(crates.includes(part) || viaStation).toBe(true);
        }
      }
    }
  });

  it("cooks over time and burns food left too long", () => {
    const s = createKitchen(1, { level: 1 });
    tap(s, SOLO_COOK, "crate:patty-raw", 100);
    tap(s, SOLO_COOK, "st:grill:0", 200);
    const grill = s.stations[0]!;
    expect(stationForm(grill, 1000).state).toBe("working");
    expect(stationForm(grill, 4300).item).toBe("patty-cooked");
    advance(s, 20_000);
    expect(stationForm(grill, 20_000).item).toBe("burnt");
    expect(s.burnt).toBe(1);
  });

  it("serves a correct dish for points and a tip", () => {
    const s = createKitchen(1, { level: 1 });
    const log: KitchenTap[] = [];
    let t = play(s, log, ["crate:patty-raw", "st:grill:0"], 2000);
    t = play(s, log, ["st:grill:0", "plate:0", "crate:bun", "plate:0", "plate:0", "seat:0"], t + 4000);
    expect(s.served).toBe(1);
    expect(s.score).toBeGreaterThan(RECIPES.burger.value);
  });

  it("penalises wrong dishes and customers who run out of patience", () => {
    const s = createKitchen(2, { level: 1 });
    tap(s, SOLO_COOK, "crate:bun", 2500);
    tap(s, SOLO_COOK, "plate:0", 2600);
    tap(s, SOLO_COOK, "plate:0", 2700);
    tap(s, SOLO_COOK, "seat:0", 2800);
    expect(s.wrong).toBe(1);
    expect(s.score).toBeLessThan(0);
    advance(s, 10 * 60_000);
    expect(s.finished).toBe(true);
    expect(s.missed).toBe(LEVELS[0]!.customers - 1);
  });

  it("refuses illegal combinations: raw food on plates, duplicates, the wrong station", () => {
    const s = createKitchen(3, { level: 3 });
    tap(s, SOLO_COOK, "crate:patty-raw", 100);
    tap(s, SOLO_COOK, "plate:0", 200);
    expect(s.plates[0]).toEqual([]);
    tap(s, SOLO_COOK, "st:board:0", 300);
    expect(s.stations.find((x) => x.type === "board")!.item).toBeNull();
    tap(s, SOLO_COOK, "trash", 400);
    tap(s, SOLO_COOK, "crate:bun", 500);
    tap(s, SOLO_COOK, "plate:0", 600);
    tap(s, SOLO_COOK, "crate:bun", 700);
    tap(s, SOLO_COOK, "plate:0", 800);
    expect(s.plates[0]).toEqual(["bun"]);
  });

  it("brings in customers only when a seat is free", () => {
    const s = createKitchen(4, { level: 1 });
    advance(s, 60_000);
    expect(s.customers.filter((c) => c.status === "waiting").length).toBeLessThanOrEqual(LEVELS[0]!.seats);
  });

  it("verifies a played shift and gives the same score as the live game", () => {
    const seed = 99;
    const s = createKitchen(seed, { level: 1 });
    const log: KitchenTap[] = [];
    let t = 2000;
    // Serve every customer: grill, plate, bun, serve the first waiting seat.
    for (let i = 0; i < LEVELS[0]!.customers; i++) {
      t = play(s, log, ["crate:patty-raw", "st:grill:0"], t);
      t = play(s, log, ["st:grill:0", "plate:0", "crate:bun", "plate:0", "plate:0"], t + 4000);
      advance(s, t);
      const waiting = s.customers.find((c) => c.status === "waiting");
      if (!waiting) {
        t = Math.max(t, s.customers.find((c) => c.status === "queued")?.scheduledAt ?? t) + 100;
        advance(s, t);
      }
      const seat = s.customers.find((c) => c.status === "waiting")?.seat ?? 0;
      t = play(s, log, [`seat:${seat}`], t);
    }
    advance(s, 15 * 60_000);
    const v = kitchenRush.verify(seed, { level: 1 }, log);
    expect(v).toMatchObject({ ok: true, result: { score: Math.max(0, s.score), completed: starsFor(s, Math.max(0, s.score)) >= 1 } });
    expect(s.served).toBe(LEVELS[0]!.customers);
    expect(starsFor(s)).toBeGreaterThanOrEqual(2);
  });

  it("rejects malformed timelines", () => {
    expect(kitchenRush.verify(1, { level: 1 }, [{ t: 500, target: "trash" }, { t: 100, target: "trash" }])).toMatchObject({ ok: false });
  });
});
