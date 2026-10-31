import { describe, expect, it } from "vitest";
import { seededRng, type EngineContext, type OutboundMessage, type PlayerRef } from "../src";
import { doodleConfigSchema, DRAWER_DISCONNECT_GRACE_MS, REVEAL_MS, type DoodleConfig } from "../src/doodle-duel/config";
import { createDoodleEngine, pickWordOptions, type DDState, type DoodleAction } from "../src/doodle-duel/engine";
import { maskWord, maxReveals, pickRevealIndex, revealSchedule } from "../src/doodle-duel/hints";
import { classifyGuess, editDistance, normalizeGuess } from "../src/doodle-duel/matching";
import { DEFAULT_DOODLE_SCORING, drawerPoints, guesserPoints } from "../src/doodle-duel/scoring";
import { WORD_BANK, type Word } from "../src/doodle-duel/words";

// Distinctive words so privacy checks can search serialized payloads safely.
const TEST_BANK: Word[] = [
  { text: "zebracorn", category: "animals", difficulty: "easy", alternatives: ["zebra corn"] },
  { text: "quokkaroo", category: "animals", difficulty: "medium", alternatives: [] },
  { text: "platypusaur", category: "animals", difficulty: "hard", alternatives: [], hint: "Duck-billed" },
  { text: "marmalope", category: "food", difficulty: "easy", alternatives: [] },
  { text: "grapefrog", category: "food", difficulty: "medium", alternatives: [] },
  { text: "spoonbridge", category: "objects", difficulty: "hard", alternatives: [] },
];
const engine = createDoodleEngine({ wordBank: TEST_BANK });

const players = (n: number): PlayerRef[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, color: "#fff" }));
const ctxAt = (now: number, seed = 3): EngineContext => ({ now, rng: seededRng(seed) });
const cfg = (o: Partial<DoodleConfig> = {}) => doodleConfigSchema.parse(o);

function start(n = 3, o: Partial<DoodleConfig> = {}) {
  const r = engine.create(players(n), cfg(o), ctxAt(0));
  return { s: r.state, messages: r.messages };
}

function act(s: DDState, pid: string, a: DoodleAction, now = 1000) {
  return engine.handleAction(s, pid, a, ctxAt(now));
}

/** Picks the first word for the current drawer and returns its text. */
function choose(s: DDState, now = 1000): string {
  const r = act(s, s.turn.drawerId, { type: "doodle:select-word", index: 0 }, now);
  expect(r.ok).toBe(true);
  return s.turn.word!.text;
}

const guessers = (s: DDState) => s.players.filter((p) => p.id !== s.turn.drawerId && !p.left);

const deliveredTo = (messages: OutboundMessage[], pid: string) =>
  messages.filter((m) =>
    m.to.kind === "all" ? true : m.to.kind === "only" ? m.to.ids.includes(pid) : !m.to.ids.includes(pid),
  );

describe("word selection", () => {
  it("offers three distinct words with one of each difficulty in mixed mode", () => {
    const opts = pickWordOptions(WORD_BANK, { category: "mixed", difficulty: "mixed" }, [], seededRng(1));
    expect(opts).toHaveLength(3);
    expect(new Set(opts.map((w) => w.text)).size).toBe(3);
    expect(opts.map((w) => w.difficulty).sort()).toEqual(["easy", "hard", "medium"]);
  });

  it("respects category and difficulty filters and avoids used words", () => {
    for (let seed = 0; seed < 30; seed++) {
      const opts = pickWordOptions(WORD_BANK, { category: "sports", difficulty: "hard" }, ["karate"], seededRng(seed));
      expect(opts.every((w) => w.category === "sports" && w.difficulty === "hard")).toBe(true);
      expect(opts.some((w) => w.text === "karate")).toBe(false);
    }
  });

  it("every word in the bank is well formed", () => {
    expect(WORD_BANK.length).toBeGreaterThan(150);
    const texts = WORD_BANK.map((w) => `${w.category}:${w.text}`);
    expect(new Set(texts).size).toBe(texts.length);
    for (const w of WORD_BANK) expect(w.text).toMatch(/^[a-z][a-z ]*[a-z]$/);
  });

  it("only the drawer receives word options, and auto-picks on timeout", () => {
    const { s, messages } = start(3, { chooseSeconds: 10 });
    const options = messages.find((m) => m.event === "doodle:word-options")!;
    expect(options.to).toEqual({ kind: "only", ids: [s.turn.drawerId] });
    expect(engine.viewFor(s, guessers(s)[0]!.id).wordOptions).toBeNull();
    expect(engine.viewFor(s, s.turn.drawerId).wordOptions).toHaveLength(3);
    expect(engine.nextDeadline(s)).toBe(10_000);
    engine.tick(s, ctxAt(10_000));
    expect(s.phase).toBe("drawing");
    expect(s.turn.word).not.toBeNull();
  });

  it("only the drawer may select, and only once", () => {
    const { s } = start(3);
    expect(act(s, guessers(s)[0]!.id, { type: "doodle:select-word", index: 0 })).toMatchObject({ ok: false, code: "NOT_YOUR_TURN" });
    choose(s);
    expect(act(s, s.turn.drawerId, { type: "doodle:select-word", index: 1 })).toMatchObject({ ok: false });
  });
});

describe("word privacy", () => {
  it("guessers never receive the secret word until they solve it or the turn ends", () => {
    const { s } = start(4);
    const word = choose(s);
    const [g1, g2] = guessers(s);
    const all: OutboundMessage[] = [];
    // Wrong guesses, a close guess, a sentence containing the answer, hints and strokes.
    all.push(...(act(s, g1!.id, { type: "doodle:guess", text: "banana" }, 2000) as { messages: OutboundMessage[] }).messages);
    all.push(...(act(s, g2!.id, { type: "doodle:guess", text: `is it a ${word}` }, 2100) as { messages: OutboundMessage[] }).messages);
    all.push(...(act(s, g1!.id, { type: "doodle:guess", text: word.slice(0, -2) + "xx" }, 2200) as { messages: OutboundMessage[] }).messages);
    for (let t = 2000; t < 79_000; t += 1000) all.push(...engine.tick(s, ctxAt(t)).messages);

    for (const g of [g1!, g2!]) {
      const view = engine.viewFor(s, g.id);
      expect(view.word).toBeNull();
      expect(JSON.stringify(view)).not.toContain(word);
      expect(view.mask!.filter((c) => c === "_").length).toBeGreaterThan(0);
    }
    // g2's sentence containing the answer was echoed only to g2 (as "close"), never to g1.
    for (const m of deliveredTo(all, g1!.id)) expect(JSON.stringify(m.payload)).not.toContain(word);
    expect(engine.viewFor(s, s.turn.drawerId).word).toBe(word);
  });

  it("a correct guess is announced without the word; the solver then sees it", () => {
    const { s } = start(3);
    const word = choose(s);
    const [g1, g2] = guessers(s);
    const r = act(s, g1!.id, { type: "doodle:guess", text: `  ${word.toUpperCase()} ` }, 5000);
    expect(r.ok).toBe(true);
    const msgs = (r as { messages: OutboundMessage[] }).messages;
    for (const m of msgs) expect(JSON.stringify(m.payload)).not.toContain(word);
    expect(engine.viewFor(s, g1!.id).word).toBe(word);
    expect(engine.viewFor(s, g2!.id).word).toBeNull();
  });

  it("chat from players who solved it is only visible to the drawer and other solvers", () => {
    const { s } = start(3);
    const word = choose(s);
    const [g1, g2] = guessers(s);
    act(s, g1!.id, { type: "doodle:guess", text: word }, 2000);
    const r = act(s, g1!.id, { type: "doodle:guess", text: `the word was ${word}` }, 2500);
    const msg = (r as { messages: OutboundMessage[] }).messages[0]!;
    expect(msg.to).toEqual({ kind: "only", ids: [s.turn.drawerId, g1!.id] });
    expect(deliveredTo([msg], g2!.id)).toHaveLength(0);
  });
});

describe("guess matching", () => {
  it("normalizes case, whitespace, accents and punctuation", () => {
    expect(normalizeGuess("  Ice   CREAM!! ")).toBe("ice cream");
    expect(normalizeGuess("Crème-brûlée")).toBe("creme brulee");
    expect(normalizeGuess("   ")).toBe("");
  });

  it("accepts exact answers, alternatives and spacing variants", () => {
    const w = { text: "ice cream", alternatives: ["icecream"] };
    expect(classifyGuess("ICE CREAM", w, true)).toBe("correct");
    expect(classifyGuess("icecream", w, true)).toBe("correct");
    expect(classifyGuess("ice-cream", w, true)).toBe("correct");
    expect(classifyGuess("doughnut", { text: "doughnut", alternatives: ["donut"] }, true)).toBe("correct");
    expect(classifyGuess("donut", { text: "doughnut", alternatives: ["donut"] }, true)).toBe("correct");
  });

  it("tolerates one typo on longer words only when enabled", () => {
    const w = { text: "giraffe", alternatives: [] };
    expect(classifyGuess("girafe", w, true)).toBe("correct");
    expect(classifyGuess("girafe", w, false)).toBe("close");
    expect(classifyGuess("grafe", w, true)).toBe("close");
    expect(classifyGuess("cot", { text: "cat", alternatives: [] }, true)).toBe("wrong");
    expect(classifyGuess("lamb", { text: "lamp", alternatives: [] }, true)).toBe("close");
    expect(classifyGuess("tree", w, true)).toBe("wrong");
  });

  it("treats a message containing the answer as close, not public chat", () => {
    expect(classifyGuess("is it a cat?", { text: "cat", alternatives: [] }, true)).toBe("close");
  });

  it("computes bounded edit distance", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("abc", "abc")).toBe(0);
    expect(editDistance("a", "abcdef", 2)).toBe(3);
  });
});

describe("hints", () => {
  it("never reveals every letter", () => {
    for (const d of ["easy", "medium", "hard"] as const) {
      for (const w of ["cat", "ox", "elephant", "ice cream"]) {
        const letters = w.replace(/ /g, "").length;
        expect(maxReveals(w, d)).toBeLessThan(letters);
      }
    }
    const rng = seededRng(5);
    const revealed: number[] = [];
    for (let i = 0; i < 10; i++) {
      const idx = pickRevealIndex("cat", revealed, rng);
      if (idx !== null) revealed.push(idx);
    }
    expect(revealed.length).toBe(2);
  });

  it("masks letters but keeps spaces", () => {
    expect(maskWord("ice cream", [0, 4]).join("")).toBe("i__ c____");
  });

  it("spreads reveals across the hint window", () => {
    expect(revealSchedule(0, 100_000, 3)).toEqual([35_000, 60_000, 85_000]);
    expect(revealSchedule(0, 100_000, 0)).toEqual([]);
  });

  it("reveals letters progressively during the turn and the text hint at half time", () => {
    const { s } = start(2, { drawSeconds: 100 });
    s.turn.options = [TEST_BANK[2]!]; // "platypusaur", hard, with a hint
    act(s, s.turn.drawerId, { type: "doodle:select-word", index: 0 }, 0);
    const guesser = guessers(s)[0]!.id;
    const hidden = () => engine.viewFor(s, guesser).mask!.filter((c) => c === "_").length;
    expect(hidden()).toBe(11);
    expect(engine.viewFor(s, guesser).category).toBe("Animals");
    engine.tick(s, ctxAt(36_000));
    expect(hidden()).toBe(10);
    engine.tick(s, ctxAt(51_000));
    expect(engine.viewFor(s, guesser).textHint).toBe("Duck-billed");
    engine.tick(s, ctxAt(99_000));
    expect(hidden()).toBe(11 - maxReveals("platypusaur", "hard"));
  });

  it("disabling hints shows only blanks", () => {
    const { s } = start(2, { hints: false });
    choose(s, 0);
    const view = engine.viewFor(s, guessers(s)[0]!.id);
    expect(view.category).toBeNull();
    expect(s.turn.revealAt).toEqual([]);
  });
});

describe("scoring", () => {
  it("rewards faster guesses and the first correct guess", () => {
    expect(guesserPoints(1, true)).toBe(350);
    expect(guesserPoints(0.5, false)).toBe(200);
    expect(guesserPoints(-1, false)).toBe(DEFAULT_DOODLE_SCORING.guessBase);
    expect(drawerPoints(0, 3)).toBe(0);
    expect(drawerPoints(2, 3)).toBe(120);
    expect(drawerPoints(3, 3)).toBe(280);
  });

  it("awards server-side points once per player and ends early when all guess", () => {
    const { s } = start(3, { drawSeconds: 100 });
    const word = choose(s, 0);
    const [g1, g2] = guessers(s);
    const drawer = s.players.find((p) => p.id === s.turn.drawerId)!;

    act(s, g1!.id, { type: "doodle:guess", text: word }, 50_000);
    expect(g1!.score).toBe(guesserPoints(0.5, true));
    // Repeating the answer neither scores again nor leaks it.
    act(s, g1!.id, { type: "doodle:guess", text: word }, 51_000);
    expect(g1!.score).toBe(guesserPoints(0.5, true));
    expect(s.phase).toBe("drawing");

    act(s, g2!.id, { type: "doodle:guess", text: word }, 75_000);
    expect(g2!.score).toBe(guesserPoints(0.25, false));
    expect(s.phase).toBe("reveal");
    expect(s.turn.endReason).toBe("all-guessed");
    expect(drawer.score).toBe(drawerPoints(2, 2));
    expect(engine.viewFor(s, g2!.id).lastTurn!.points[drawer.id]).toBe(drawerPoints(2, 2));
  });

  it("handles simultaneous correct guesses deterministically", () => {
    const { s } = start(3);
    const word = choose(s, 0);
    const [g1, g2] = guessers(s);
    act(s, g1!.id, { type: "doodle:guess", text: word }, 10_000);
    act(s, g2!.id, { type: "doodle:guess", text: word }, 10_000);
    expect(s.turn.guesses.map((g) => g.playerId)).toEqual([g1!.id, g2!.id]);
    expect(g1!.score - g2!.score).toBe(DEFAULT_DOODLE_SCORING.firstGuessBonus);
  });

  it("rejects duplicate wrong guesses and drawer guesses; ignores empty ones", () => {
    const { s } = start(3);
    const word = choose(s, 0);
    const g = guessers(s)[0]!;
    expect(act(s, g.id, { type: "doodle:guess", text: "pizza" }).ok).toBe(true);
    expect(act(s, g.id, { type: "doodle:guess", text: " PIZZA " })).toMatchObject({ ok: false });
    expect(act(s, s.turn.drawerId, { type: "doodle:guess", text: word })).toMatchObject({ ok: false });
    const empty = act(s, g.id, { type: "doodle:guess", text: "   " });
    expect(empty).toMatchObject({ ok: true, messages: [] });
  });
});

describe("round flow and rotation", () => {
  it("each player draws once per round; two players alternate", () => {
    const { s } = start(2, { rounds: 2, drawSeconds: 30, chooseSeconds: 5 });
    const drawers: string[] = [];
    let now = 0;
    while (s.phase !== "finished" && now < 1_000_000) {
      if (s.phase === "choosing" && drawers.length < s.turn.number) drawers.push(s.turn.drawerId);
      now += 500;
      engine.tick(s, ctxAt(now));
    }
    expect(drawers).toHaveLength(4);
    expect(drawers[0]).not.toBe(drawers[1]);
    expect(drawers[0]).toBe(drawers[2]);
    expect(drawers[1]).toBe(drawers[3]);
    expect(engine.results(s).reason).toBe("completed");
  });

  it("time expiry reveals the word to everyone, then the next turn starts", () => {
    const { s } = start(3, { drawSeconds: 30 });
    const word = choose(s, 0);
    const first = s.turn.drawerId;
    engine.tick(s, ctxAt(30_000));
    expect(s.phase).toBe("reveal");
    for (const p of s.players) expect(engine.viewFor(s, p.id).word).toBe(word);
    engine.tick(s, ctxAt(30_000 + REVEAL_MS));
    expect(s.phase).toBe("choosing");
    expect(s.turn.drawerId).not.toBe(first);
    expect(s.turn.number).toBe(2);
  });

  it("produces a ranked final leaderboard", () => {
    const { s } = start(3, { rounds: 1 });
    s.players[0]!.score = 300;
    s.players[1]!.score = 300;
    s.players[2]!.score = 100;
    s.phase = "finished";
    s.endReason = "completed";
    const res = engine.results(s);
    expect(res.entries.map((e) => e.placement)).toEqual([1, 1, 3]);
    expect(res.entries.filter((e) => e.isWinner)).toHaveLength(2);
  });
});

describe("drawing", () => {
  const chunk = (strokeId: string, seq: number, pts: [number, number][] = [[10, 10], [20, 20]]): DoodleAction => ({
    type: "doodle:stroke",
    strokeId,
    seq,
    tool: "pen",
    color: "#1b1b1f",
    size: 6,
    points: pts,
  });

  it("only the drawer may draw, and strokes are relayed to everyone else", () => {
    const { s } = start(3);
    choose(s, 0);
    expect(act(s, guessers(s)[0]!.id, chunk("a", 0))).toMatchObject({ ok: false, code: "NOT_YOUR_TURN" });
    const r = act(s, s.turn.drawerId, chunk("a", 0));
    expect(r).toMatchObject({ ok: true, stateChanged: false });
    const msg = (r as { messages: OutboundMessage[] }).messages[0]!;
    expect(msg).toMatchObject({ event: "doodle:stroke", to: { kind: "except", ids: [s.turn.drawerId] } });
  });

  it("cannot draw while choosing", () => {
    const { s } = start(2);
    expect(act(s, s.turn.drawerId, chunk("a", 0))).toMatchObject({ ok: false });
  });

  it("ignores duplicate chunks and orders out-of-order chunks in the canvas sync", () => {
    const { s } = start(2);
    choose(s, 0);
    const d = s.turn.drawerId;
    act(s, d, chunk("a", 2, [[3, 3]]));
    act(s, d, chunk("a", 0, [[1, 1]]));
    act(s, d, chunk("a", 1, [[2, 2]]));
    const dup = act(s, d, chunk("a", 1, [[9, 9]]));
    expect(dup).toMatchObject({ ok: true, messages: [] });
    const sync = engine.syncMessages(s, guessers(s)[0]!.id)[0]!;
    expect((sync.payload as { strokes: { chunks: number[][][] }[] }).strokes[0]!.chunks).toEqual([[[1, 1]], [[2, 2]], [[3, 3]]]);
  });

  it("undo removes the last stroke and clear removes all", () => {
    const { s } = start(2);
    choose(s, 0);
    const d = s.turn.drawerId;
    act(s, d, chunk("a", 0));
    act(s, d, chunk("b", 0));
    act(s, d, { type: "doodle:undo" });
    expect(s.turn.strokes.map((x) => x.id)).toEqual(["a"]);
    act(s, d, { type: "doodle:clear" });
    expect(s.turn.strokes).toEqual([]);
    expect(s.turn.pointCount).toBe(0);
  });

  it("rejects malformed stroke payloads", () => {
    const bad = [
      { ...chunk("a", 0), color: "#123456" },
      { ...chunk("a", 0), size: 7 },
      { ...chunk("a", 0), points: [[2000, 10]] },
      { ...chunk("a", 0), points: Array.from({ length: 65 }, () => [1, 1]) },
      { ...chunk("a b", 0) },
    ];
    for (const b of bad) expect(engine.actionSchema.safeParse(b).success).toBe(false);
    expect(engine.actionSchema.safeParse(chunk("a", 0)).success).toBe(true);
  });
});

describe("disconnects", () => {
  it("ends the turn if the drawer stays disconnected past the grace period", () => {
    const { s } = start(3);
    choose(s, 0);
    engine.setConnected(s, s.turn.drawerId, false, ctxAt(5000));
    expect(engine.nextDeadline(s)).toBe(5000 + DRAWER_DISCONNECT_GRACE_MS);
    engine.tick(s, ctxAt(5000 + DRAWER_DISCONNECT_GRACE_MS));
    expect(s.phase).toBe("reveal");
    expect(s.turn.endReason).toBe("drawer-left");
  });

  it("a drawer who reconnects in time keeps drawing", () => {
    const { s } = start(3);
    choose(s, 0);
    engine.setConnected(s, s.turn.drawerId, false, ctxAt(5000));
    engine.setConnected(s, s.turn.drawerId, true, ctxAt(9000));
    engine.tick(s, ctxAt(5000 + DRAWER_DISCONNECT_GRACE_MS));
    expect(s.phase).toBe("drawing");
  });

  it("finishes the match when fewer than two players remain", () => {
    const { s } = start(2);
    engine.removePlayer(s, "p1", ctxAt(1000));
    expect(s.phase).toBe("finished");
    expect(engine.results(s).reason).toBe("players-left");
  });

  it("skips a drawer who left and ends the turn early when remaining guessers solved it", () => {
    const { s } = start(3);
    const word = choose(s, 0);
    const [g1, g2] = guessers(s);
    act(s, g1!.id, { type: "doodle:guess", text: word }, 2000);
    engine.removePlayer(s, g2!.id, ctxAt(3000));
    expect(s.phase).toBe("reveal");
    expect(s.turn.endReason).toBe("all-guessed");
  });
});
