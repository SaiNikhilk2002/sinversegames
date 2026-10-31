import { describe, expect, it } from "vitest";
import { seededRng, shuffle, type EngineContext, type PlayerRef } from "../src";
import { buildDeck, DECK_COMPOSITION, type Card, type CardColor } from "../src/color-clash/cards";
import { colorClashConfigSchema, DISCONNECTED_TURN_MS, type ColorClashConfig } from "../src/color-clash/config";
import { colorClashEngine as engine, type CCState, type ColorClashAction } from "../src/color-clash/engine";
import { canPlay } from "../src/color-clash/rules";
import { cardPoints, handPoints, scoreMatch } from "../src/color-clash/scoring";

const players = (n: number): PlayerRef[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, color: "#fff" }));

const ctxAt = (now: number, seed = 1): EngineContext => ({ now, rng: seededRng(seed) });

const config = (overrides: Partial<ColorClashConfig> = {}) => colorClashConfigSchema.parse(overrides);

let uid = 0;
const card = (kind: Card["kind"], color: CardColor | null = null, value: number | null = null): Card => ({
  id: `t${uid++}`,
  kind,
  color,
  value,
});

function newGame(n = 3, overrides: Partial<ColorClashConfig> = {}, seed = 42): CCState {
  return engine.create(players(n), config(overrides), ctxAt(1000, seed)).state;
}

/** Puts the game into a precise position: given hands, top card and whose turn it is. */
function arrange(s: CCState, hands: Card[][], top: Card, current = 0, activeColor?: CardColor) {
  s.players.forEach((p, i) => (p.hand = hands[i] ?? []));
  s.discard = [top];
  s.activeColor = activeColor ?? top.color!;
  s.current = current;
  s.direction = 1;
  s.pendingDraw = 0;
  s.drawnCardId = null;
  s.drawPile = Array.from({ length: 20 }, (_, i) => card("number", "tide", i % 10));
}

function act(s: CCState, playerId: string, action: ColorClashAction, now = 2000) {
  return engine.handleAction(s, playerId, action, ctxAt(now));
}

const totalCards = (s: CCState) => s.drawPile.length + s.discard.length + s.players.reduce((n, p) => n + p.hand.length, 0);

describe("deck", () => {
  it("has the documented 108-card composition", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(108);
    expect(new Set(deck.map((c) => c.id)).size).toBe(108);
    for (const color of ["ember", "tide", "grove", "sun"] as const) {
      const ofColor = deck.filter((c) => c.color === color);
      expect(ofColor).toHaveLength(25);
      expect(ofColor.filter((c) => c.kind === "number" && c.value === 0)).toHaveLength(DECK_COMPOSITION.numberZeroPerColor);
      for (let v = 1; v <= 9; v++) expect(ofColor.filter((c) => c.value === v)).toHaveLength(2);
      expect(ofColor.filter((c) => c.kind === "block")).toHaveLength(2);
      expect(ofColor.filter((c) => c.kind === "flip")).toHaveLength(2);
      expect(ofColor.filter((c) => c.kind === "plus2")).toHaveLength(2);
    }
    expect(deck.filter((c) => c.kind === "prism")).toHaveLength(4);
    expect(deck.filter((c) => c.kind === "prism4")).toHaveLength(4);
  });

  it("shuffles deterministically with a seed and preserves the cards", () => {
    const a = shuffle(buildDeck(), seededRng(7)).map((c) => c.id);
    const b = shuffle(buildDeck(), seededRng(7)).map((c) => c.id);
    const c = shuffle(buildDeck(), seededRng(8)).map((c) => c.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect([...a].sort()).toEqual(buildDeck().map((x) => x.id).sort());
  });

  it("shuffle is unbiased (each position roughly uniform)", () => {
    const counts = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    const rng = seededRng(99);
    for (let i = 0; i < 8000; i++) {
      shuffle([0, 1, 2, 3], rng).forEach((v, pos) => counts[v]![pos]!++);
    }
    for (const row of counts) for (const n of row) expect(n).toBeGreaterThan(1800), expect(n).toBeLessThan(2200);
  });
});

describe("dealing", () => {
  it("deals handSize cards to each player and flips a number card", () => {
    for (const n of [2, 3, 4]) {
      const s = newGame(n, { handSize: 7 });
      expect(s.players.every((p) => p.hand.length === 7)).toBe(true);
      expect(s.discard).toHaveLength(1);
      expect(s.discard[0]!.kind).toBe("number");
      expect(s.activeColor).toBe(s.discard[0]!.color);
      expect(s.drawPile).toHaveLength(108 - n * 7 - 1);
      expect(totalCards(s)).toBe(108);
    }
  });

  it("rejects unsupported player counts", () => {
    expect(() => engine.create(players(1), config(), ctxAt(0))).toThrow();
    expect(() => engine.create(players(5), config(), ctxAt(0))).toThrow();
  });
});

describe("move validation", () => {
  const cfg = config();
  const base = { pendingDraw: 0, hand: [] as Card[], config: cfg };

  it("matches by colour, number or action symbol", () => {
    const top = card("number", "ember", 5);
    expect(canPlay(card("number", "ember", 2), { ...base, top, activeColor: "ember" })).toBe(true);
    expect(canPlay(card("number", "tide", 5), { ...base, top, activeColor: "ember" })).toBe(true);
    expect(canPlay(card("number", "tide", 4), { ...base, top, activeColor: "ember" })).toBe(false);
    expect(canPlay(card("block", "tide"), { ...base, top, activeColor: "ember" })).toBe(false);
    const blockTop = card("block", "ember");
    expect(canPlay(card("block", "tide"), { ...base, top: blockTop, activeColor: "ember" })).toBe(true);
    expect(canPlay(card("flip", "tide"), { ...base, top: blockTop, activeColor: "ember" })).toBe(false);
  });

  it("wilds are always playable; after a wild only the chosen colour matches", () => {
    const top = card("prism");
    expect(canPlay(card("prism"), { ...base, top, activeColor: "sun" })).toBe(true);
    expect(canPlay(card("prism4"), { ...base, top, activeColor: "sun" })).toBe(true);
    expect(canPlay(card("number", "sun", 1), { ...base, top, activeColor: "sun" })).toBe(true);
    expect(canPlay(card("number", "tide", 1), { ...base, top, activeColor: "sun" })).toBe(false);
  });

  it("restricts Prism +4 when the house rule requires it", () => {
    const strict = config({ prism4AnyTime: false });
    const p4 = card("prism4");
    const top = card("number", "grove", 3);
    expect(canPlay(p4, { top, activeColor: "grove", pendingDraw: 0, hand: [p4, card("number", "grove", 9)], config: strict })).toBe(false);
    expect(canPlay(p4, { top, activeColor: "grove", pendingDraw: 0, hand: [p4, card("number", "tide", 9)], config: strict })).toBe(true);
  });

  it("only draw cards can answer a pending penalty when stacking", () => {
    const stack = config({ stackDrawCards: true });
    const top = card("plus2", "ember");
    const ctx = { top, activeColor: "ember" as const, pendingDraw: 2, hand: [], config: stack };
    expect(canPlay(card("plus2", "tide"), ctx)).toBe(true);
    expect(canPlay(card("prism4"), ctx)).toBe(true);
    expect(canPlay(card("number", "ember", 1), ctx)).toBe(false);
    expect(canPlay(card("plus2", "tide"), { ...ctx, top: card("prism4"), activeColor: "tide", pendingDraw: 4 })).toBe(false);
  });
});

describe("turns and card effects", () => {
  it("rejects out-of-turn plays and cards the player does not own, leaving state untouched", () => {
    const s = newGame(3);
    const theirs = card("number", "ember", 1);
    arrange(s, [[card("number", "ember", 2)], [theirs], [card("number", "ember", 3)]], card("number", "ember", 5), 0);
    const before = JSON.stringify(s);
    const notTurn = act(s, "p1", { type: "card:play", cardId: theirs.id });
    expect(notTurn).toMatchObject({ ok: false, code: "NOT_YOUR_TURN" });
    const notOwned = act(s, "p0", { type: "card:play", cardId: theirs.id });
    expect(notOwned).toMatchObject({ ok: false, code: "INVALID_MOVE" });
    expect(act(s, "stranger", { type: "card:draw" })).toMatchObject({ ok: false, code: "NOT_IN_ROOM" });
    expect(JSON.stringify(s)).toBe(before);
  });

  it("advances clockwise after a number card", () => {
    const s = newGame(3);
    const c = card("number", "ember", 2);
    arrange(s, [[c, card("number", "tide", 1)], [card("number", "tide", 1)], [card("number", "tide", 1)]], card("number", "ember", 5));
    const r = act(s, "p0", { type: "card:play", cardId: c.id });
    expect(r.ok).toBe(true);
    expect(s.current).toBe(1);
    expect(s.discard.at(-1)!.id).toBe(c.id);
  });

  it("Block skips the next player", () => {
    const s = newGame(3);
    const b = card("block", "ember");
    arrange(s, [[b, card("number", "tide", 1)], [card("number", "tide", 1)], [card("number", "tide", 1)]], card("number", "ember", 5));
    act(s, "p0", { type: "card:play", cardId: b.id });
    expect(s.current).toBe(2);
  });

  it("Flip reverses direction with 3+ players and acts as Block with 2", () => {
    const s3 = newGame(3);
    const f = card("flip", "ember");
    arrange(s3, [[f, card("number", "tide", 1)], [card("number", "tide", 1)], [card("number", "tide", 1)]], card("number", "ember", 5));
    act(s3, "p0", { type: "card:play", cardId: f.id });
    expect(s3.direction).toBe(-1);
    expect(s3.current).toBe(2);

    const s2 = newGame(2);
    const f2 = card("flip", "ember");
    arrange(s2, [[f2, card("number", "tide", 1)], [card("number", "tide", 1)]], card("number", "ember", 5));
    act(s2, "p0", { type: "card:play", cardId: f2.id });
    expect(s2.current).toBe(0);
  });

  it("+2 makes the next player draw two and skips them", () => {
    const s = newGame(3);
    const p2 = card("plus2", "ember");
    arrange(s, [[p2, card("number", "tide", 1)], [card("number", "tide", 1)], [card("number", "tide", 1)]], card("number", "ember", 5));
    act(s, "p0", { type: "card:play", cardId: p2.id });
    expect(s.players[1]!.hand).toHaveLength(3);
    expect(s.current).toBe(2);
  });

  it("Prism requires a colour choice and sets the active colour", () => {
    const s = newGame(2);
    const w = card("prism");
    arrange(s, [[w, card("number", "tide", 1)], [card("number", "tide", 1)]], card("number", "ember", 5));
    expect(act(s, "p0", { type: "card:play", cardId: w.id })).toMatchObject({ ok: false, code: "INVALID_MOVE" });
    expect(act(s, "p0", { type: "card:play", cardId: w.id, chosenColor: "grove" }).ok).toBe(true);
    expect(s.activeColor).toBe("grove");
  });

  it("rejects a colour choice on a non-wild card", () => {
    const s = newGame(2);
    const c = card("number", "ember", 1);
    arrange(s, [[c, card("number", "tide", 1)], [card("number", "tide", 1)]], card("number", "ember", 5));
    expect(act(s, "p0", { type: "card:play", cardId: c.id, chosenColor: "tide" })).toMatchObject({ ok: false });
  });

  it("Prism +4 makes the next player draw four", () => {
    const s = newGame(2);
    const w = card("prism4");
    arrange(s, [[w, card("number", "tide", 1)], [card("number", "tide", 1)]], card("number", "ember", 5));
    act(s, "p0", { type: "card:play", cardId: w.id, chosenColor: "sun" });
    expect(s.players[1]!.hand).toHaveLength(5);
    expect(s.current).toBe(0);
    expect(s.activeColor).toBe("sun");
  });

  it("stacks draw penalties under the stacking house rule", () => {
    const s = newGame(3, { stackDrawCards: true });
    const a = card("plus2", "ember");
    const b = card("plus2", "tide");
    arrange(s, [[a, card("number", "tide", 1)], [b, card("number", "tide", 1)], [card("number", "sun", 1)]], card("number", "ember", 5));
    act(s, "p0", { type: "card:play", cardId: a.id });
    expect(s.pendingDraw).toBe(2);
    expect(s.current).toBe(1);
    act(s, "p1", { type: "card:play", cardId: b.id });
    expect(s.pendingDraw).toBe(4);
    expect(s.current).toBe(2);
    act(s, "p2", { type: "card:draw" });
    expect(s.players[2]!.hand).toHaveLength(5);
    expect(s.pendingDraw).toBe(0);
    expect(s.current).toBe(0);
  });
});

describe("drawing", () => {
  it("a playable drawn card may be played or passed; nothing else may be played", () => {
    const s = newGame(2);
    const other = card("number", "ember", 7);
    arrange(s, [[other], [card("number", "sun", 1)]], card("number", "ember", 5));
    const drawn = card("number", "ember", 9);
    s.drawPile.push(drawn);
    act(s, "p0", { type: "card:draw" });
    expect(s.drawnCardId).toBe(drawn.id);
    expect(s.current).toBe(0);
    expect(act(s, "p0", { type: "card:play", cardId: other.id })).toMatchObject({ ok: false });
    expect(act(s, "p0", { type: "card:draw" })).toMatchObject({ ok: false });
    expect(act(s, "p0", { type: "card:pass" }).ok).toBe(true);
    expect(s.current).toBe(1);
  });

  it("an unplayable drawn card ends the turn", () => {
    const s = newGame(2);
    arrange(s, [[card("number", "tide", 1)], [card("number", "sun", 1)]], card("number", "ember", 5));
    s.drawPile.push(card("number", "grove", 2));
    act(s, "p0", { type: "card:draw" });
    expect(s.players[0]!.hand).toHaveLength(2);
    expect(s.current).toBe(1);
    expect(act(s, "p0", { type: "card:pass" })).toMatchObject({ ok: false });
  });

  it("drawUntilPlayable keeps drawing until a playable card", () => {
    const s = newGame(2, { drawUntilPlayable: true });
    arrange(s, [[card("number", "tide", 1)], [card("number", "sun", 1)]], card("number", "ember", 5));
    const playable = card("number", "ember", 3);
    s.drawPile = [playable, card("number", "grove", 2), card("number", "sun", 2)];
    act(s, "p0", { type: "card:draw" });
    expect(s.players[0]!.hand).toHaveLength(4);
    expect(s.drawnCardId).toBe(playable.id);
  });

  it("reshuffles the discard pile into the draw pile when it runs out", () => {
    const s = newGame(2);
    const top = card("number", "ember", 5);
    arrange(s, [[card("number", "tide", 1)], [card("number", "sun", 1)]], top);
    s.drawPile = [];
    s.discard = [card("number", "grove", 1), card("number", "grove", 2), top];
    act(s, "p0", { type: "card:draw" });
    expect(s.discard).toEqual([top]);
    expect(s.players[0]!.hand).toHaveLength(2);
    expect(s.drawPile).toHaveLength(1);
  });

  it("passes the turn when no cards are left anywhere to draw", () => {
    const s = newGame(2);
    arrange(s, [[card("number", "tide", 1)], [card("number", "sun", 1)]], card("number", "ember", 5));
    s.drawPile = [];
    const r = act(s, "p0", { type: "card:draw" });
    expect(r.ok).toBe(true);
    expect(s.players[0]!.hand).toHaveLength(1);
    expect(s.current).toBe(1);
  });
});

describe("timers and connections", () => {
  it("auto-draws and passes when the turn timer expires", () => {
    const s = newGame(2, { turnSeconds: 30 });
    arrange(s, [[card("number", "tide", 1)], [card("number", "sun", 1)]], card("number", "ember", 5));
    s.turnStartedAt = 0;
    expect(engine.nextDeadline(s)).toBe(30_000);
    expect(engine.tick(s, ctxAt(29_999)).stateChanged).toBe(false);
    const r = engine.tick(s, ctxAt(30_000));
    expect(r.stateChanged).toBe(true);
    expect(s.players[0]!.hand).toHaveLength(2);
    expect(s.current).toBe(1);
    expect(s.players[0]!.timeouts).toBe(1);
  });

  it("gives disconnected players a short turn even with the timer off", () => {
    const s = newGame(2, { turnSeconds: 0 });
    arrange(s, [[card("number", "tide", 1)], [card("number", "sun", 1)]], card("number", "ember", 5));
    s.turnStartedAt = 0;
    expect(engine.nextDeadline(s)).toBeNull();
    engine.setConnected(s, "p0", false, ctxAt(5000));
    expect(engine.nextDeadline(s)).toBe(5000 + DISCONNECTED_TURN_MS);
    engine.setConnected(s, "p0", true, ctxAt(6000));
    expect(engine.nextDeadline(s)).toBeNull();
  });

  it("a leaving player's cards return to the pile and the turn moves on", () => {
    const s = newGame(3);
    arrange(s, [[card("number", "tide", 1), card("number", "tide", 2)], [card("number", "sun", 1)], [card("number", "sun", 1)]], card("number", "ember", 5));
    const pile = s.drawPile.length;
    engine.removePlayer(s, "p0", ctxAt(3000));
    expect(s.players[0]!.left).toBe(true);
    expect(s.drawPile).toHaveLength(pile + 2);
    expect(s.current).toBe(1);
    // Turn order skips the departed player.
    s.drawPile.push(card("number", "grove", 9));
    act(s, "p1", { type: "card:draw" });
    s.drawPile.push(card("number", "grove", 9));
    act(s, "p2", { type: "card:draw" });
    expect(s.current).toBe(1);
  });

  it("the last remaining player wins when everyone else leaves", () => {
    const s = newGame(2);
    engine.removePlayer(s, "p1", ctxAt(3000));
    expect(engine.isFinished(s)).toBe(true);
    expect(s.winnerId).toBe("p0");
    expect(engine.results(s).reason).toBe("players-left");
  });
});

describe("winning and scoring", () => {
  it("detects the winner when a hand is emptied and scores opponents' cards", () => {
    const s = newGame(3);
    const last = card("plus2", "ember");
    arrange(
      s,
      [[last], [card("number", "tide", 9), card("prism")], [card("block", "sun")]],
      card("number", "ember", 5),
    );
    act(s, "p0", { type: "card:play", cardId: last.id });
    expect(engine.isFinished(s)).toBe(true);
    expect(s.winnerId).toBe("p0");
    // p1 drew 2 tide cards from the arranged pile (values 9 and 8 from the end of the pile).
    const res = engine.results(s);
    const winner = res.entries.find((e) => e.playerId === "p0")!;
    const expected = handPoints(s.players[1]!.hand) + handPoints(s.players[2]!.hand);
    expect(winner).toMatchObject({ placement: 1, isWinner: true, score: expected });
    expect(res.entries.map((e) => e.placement)).toEqual([1, 2, 3]);
    expect(act(s, "p1", { type: "card:draw" })).toMatchObject({ ok: false, code: "GAME_NOT_ACTIVE" });
  });

  it("card values follow the scoring table", () => {
    expect(cardPoints(card("number", "ember", 7))).toBe(7);
    expect(cardPoints(card("block", "ember"))).toBe(20);
    expect(cardPoints(card("prism4"))).toBe(50);
    const ranked = scoreMatch(
      [
        { id: "a", hand: [card("prism")], left: false },
        { id: "b", hand: [], left: false },
        { id: "c", hand: [card("number", "sun", 1)], left: false },
        { id: "d", hand: [], left: true },
      ],
      "b",
    );
    expect(ranked.map((r) => r.id)).toEqual(["b", "c", "a", "d"]);
    expect(ranked[0]!.score).toBe(51);
  });
});

describe("privacy", () => {
  it("views never contain other players' hands", () => {
    const s = newGame(4);
    for (const viewer of s.players) {
      const view = engine.viewFor(s, viewer.id);
      const json = JSON.stringify(view);
      for (const other of s.players.filter((p) => p.id !== viewer.id)) {
        for (const c of other.hand) expect(json).not.toContain(`"${c.id}"`);
      }
      expect(view.you!.hand).toHaveLength(viewer.hand.length);
    }
    // Spectator / unknown viewer gets no private data at all.
    expect(engine.viewFor(s, "nobody").you).toBeNull();
  });
});

describe("full-game simulation", () => {
  it("random legal play always terminates with a winner and conserves cards", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rng = seededRng(seed);
      const n = 2 + (seed % 3);
      const cfg = config({ stackDrawCards: seed % 2 === 0, drawUntilPlayable: seed % 5 === 0, prism4AnyTime: seed % 3 !== 0 });
      const s = engine.create(players(n), cfg, { now: 0, rng }).state;
      let now = 0;
      for (let step = 0; step < 5000 && !engine.isFinished(s); step++) {
        now += 100;
        const pid = s.players[s.current]!.id;
        const view = engine.viewFor(s, pid);
        const ctx = { now, rng };
        let r;
        if (view.you!.playableIds.length && rng.int(10) > 0) {
          const id = view.you!.playableIds[rng.int(view.you!.playableIds.length)]!;
          const c = view.you!.hand.find((h) => h.id === id)!;
          const chosenColor = c.color === null ? (["ember", "tide", "grove", "sun"] as const)[rng.int(4)] : undefined;
          r = engine.handleAction(s, pid, { type: "card:play", cardId: id, chosenColor }, ctx);
        } else if (view.you!.drawnCardId) {
          r = engine.handleAction(s, pid, { type: "card:pass" }, ctx);
        } else {
          r = engine.handleAction(s, pid, { type: "card:draw" }, ctx);
        }
        expect(r.ok).toBe(true);
        expect(totalCards(s)).toBe(108);
      }
      expect(engine.isFinished(s)).toBe(true);
      expect(s.players.some((p) => p.hand.length === 0)).toBe(true);
    }
  });
});
