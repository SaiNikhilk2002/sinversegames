import { describe, expect, it } from "vitest";
import { seededRng } from "../src/core/seeded";
import {
  eligiblePrompts,
  INTRO_MS,
  MODE_MAX_PLAYERS,
  REVEAL_MS,
  sameWavelengthEngine as engine,
  type SameWavelengthConfig,
  type SWState,
} from "../src/same-wavelength/engine";
import { PROMPTS, promptById, type Prompt } from "../src/same-wavelength/prompts";
import { compare, normalizeText, scoreRound, type Answer } from "../src/same-wavelength/scoring";

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: ["Asha", "Ben", "Chen", "Dev", "Ema", "Finn"][i]!, color: "#ff6b6b" }));
const config = (patch: Partial<SameWavelengthConfig> = {}) => engine.configSchema.parse({ mode: "friends", rounds: 5, answerSeconds: 30, ...patch });

/** A started game in its first answering round, with the clock at `now`. */
function started(n = 2, patch: Partial<SameWavelengthConfig> = {}, seed = 1) {
  const rng = seededRng(seed);
  let now = 1_000_000;
  let s = engine.create(players(n), config(patch), { now, rng }).state;
  now += INTRO_MS;
  s = engine.tick(s, { now, rng }).state;
  return { s, rng, now };
}
const prompt = (s: SWState) => promptById.get(s.current!.promptId)!;
/** A valid answer for the current prompt: option index `k`, player `k`, or a typed text. */
function answerFor(s: SWState, k: number, text = "pizza") {
  const p = prompt(s);
  if (p.kind === "who") return { player: s.players[k % s.players.length]!.id };
  if (p.kind === "text") return { text };
  return { option: p.options![k % p.options!.length]!.id };
}
const act = (s: SWState, playerId: string, payload: Record<string, unknown>, now: number) =>
  engine.handleAction(s, playerId, engine.actionSchema.parse({ type: "wave:answer", round: s.round, ...payload }), { now, rng: seededRng(9) });

describe("prompt bank", () => {
  it("has enough varied, well-formed prompts for every mode, with and without typed answers", () => {
    const ids = new Set<string>();
    for (const p of PROMPTS) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      if (["choice", "scenario", "preference", "emoji", "predict"].includes(p.kind)) {
        expect(p.options!.length).toBeGreaterThanOrEqual(3);
        expect(new Set(p.options!.map((o) => o.id)).size).toBe(p.options!.length);
        // A close group needs at least two members to mean anything.
        for (const o of p.options!) if (o.group) expect(p.options!.filter((x) => x.group === o.group).length).toBeGreaterThanOrEqual(2);
      }
      if (p.kind === "who") expect(p.options).toBeUndefined();
      if (p.kind === "predict") {
        expect(p.text).toContain("{subject}");
        expect(p.subjectText).toBeTruthy();
      }
      if (p.kind === "text") expect(p.aliases!.length).toBeGreaterThan(0);
    }
    for (const mode of ["couples", "friends", "group"] as const) {
      expect(eligiblePrompts(mode, false).length).toBeGreaterThanOrEqual(12);
      expect(eligiblePrompts(mode, true).length).toBeGreaterThan(eligiblePrompts(mode, false).length);
      expect(new Set(eligiblePrompts(mode, true).map((p) => p.kind)).size).toBeGreaterThanOrEqual(6);
    }
  });

  it("keeps away from intrusive or explicit subjects", () => {
    const off = /\b(sex|sexy|naked|kiss|ex|exes|jealous|cheat|salary|debt|weight|fat|religion|politic|drunk|divorce|break ?up|marry|marriage)\b/i;
    for (const p of PROMPTS) for (const text of [p.text, p.subjectText ?? "", ...(p.options ?? []).map((o) => o.label)]) expect(text).not.toMatch(off);
  });
});

describe("scoring", () => {
  const choice = PROMPTS.find((p) => p.id === "weekend")!;
  const text = PROMPTS.find((p) => p.id === "food-now")!;
  it("scores the same option as a match, a grouped option as close, others as different", () => {
    expect(compare(choice, { option: "beach" }, { option: "beach" })).toBe("match");
    expect(compare(choice, { option: "beach" }, { option: "hike" })).toBe("close");
    expect(compare(choice, { option: "beach" }, { option: "movies" })).toBe("different");
  });
  it("normalises typed answers simply and only matches listed equivalents", () => {
    expect(normalizeText("  The Pizzas!! ")).toBe("pizza");
    expect(normalizeText("Chips")).toBe("chip");
    expect(compare(text, { text: "Pizza" }, { text: "the pizza" })).toBe("match");
    expect(compare(text, { text: "biryani" }, { text: "Briyani" })).toBe("match");
    expect(compare(text, { text: "pizza" }, { text: "biryani" })).toBe("different");
    expect(compare(text, { text: "sandwich" }, { text: "burger" })).toBe("different");
  });
  it("adds up pairs: 2 points a match, 1 close, 0 different, as a percentage of the most possible", () => {
    const answers = new Map<string, Answer>([["a", { option: "beach" }], ["b", { option: "beach" }], ["c", { option: "hike" }]]);
    const r = scoreRound(choice, answers, null);
    expect(r.pairs.map((p) => p.level)).toEqual(["match", "close", "close"]);
    expect(r.points).toEqual({ a: 3, b: 3, c: 2 });
    expect(r.earned).toBe(4);
    expect(r.possible).toBe(6);
    expect(r.pct).toBe(67);
  });
  it("counts only the subject's pairs in a predict round", () => {
    const predict = PROMPTS.find((p) => p.kind === "predict")! as Prompt;
    const [o1, o2] = predict.options!;
    const answers = new Map<string, Answer>([["subject", { option: o1!.id }], ["x", { option: o1!.id }], ["y", { option: o2!.id }]]);
    const r = scoreRound(predict, answers, "subject");
    expect(r.pairs.every((p) => p.a === "subject" || p.b === "subject")).toBe(true);
    expect(r.pairs).toHaveLength(2);
  });
});

describe("Same Wavelength rounds", () => {
  it("deals the same prompts for the same seed, and only the mode's prompts", () => {
    const a = started(2, { mode: "couples", rounds: 12 }, 7).s.deck;
    const b = started(2, { mode: "couples", rounds: 12 }, 7).s.deck;
    expect(a).toEqual(b);
    expect(a).toHaveLength(12);
    expect(new Set(a).size).toBe(12);
    for (const id of a) {
      expect(promptById.get(id)!.modes).toContain("couples");
      expect(promptById.get(id)!.kind).not.toBe("text"); // typed answers are off by default
    }
  });

  it("starts after the intro and opens answers with a deadline", () => {
    const rng = seededRng(2);
    const s = engine.create(players(2), config(), { now: 0, rng }).state;
    expect(s.phase).toBe("intro");
    expect(engine.viewFor(s, "p0").prompt).toBeNull();
    const next = engine.tick(s, { now: INTRO_MS, rng }).state;
    expect(next.phase).toBe("answering");
    expect(next.round).toBe(1);
    expect(engine.nextDeadline(next)).toBe(INTRO_MS + 30_000);
  });

  it("never shows another player's answer before the reveal, then reveals all at once", () => {
    const { s, now } = started(3);
    expect(act(s, "p0", answerFor(s, 0), now + 1000).ok).toBe(true);
    // p1 and p2 see that p0 answered, not what.
    for (const viewer of ["p1", "p2"]) {
      const v = engine.viewFor(s, viewer);
      expect(v.players.find((p) => p.id === "p0")!.answered).toBe(true);
      expect(v.you!.answer).toBeNull();
      expect(v.reveal).toBeNull();
      expect(JSON.stringify(v)).not.toContain(JSON.stringify(answerFor(s, 0)).slice(1, -1));
    }
    expect(engine.viewFor(s, "p0").you!.answer).not.toBeNull();
    act(s, "p1", answerFor(s, 1), now + 2000);
    expect(s.phase).toBe("answering");
    act(s, "p2", answerFor(s, 2), now + 3000);
    expect(s.phase).toBe("reveal");
    const v = engine.viewFor(s, "p1");
    expect(v.reveal!.answers.map((a) => a.playerId).sort()).toEqual(["p0", "p1", "p2"]);
  });

  it("refuses a second answer, a stale round, an invalid option, a non-player and an empty or long text", () => {
    const { s, now } = started(2, { textAnswers: true });
    const p = prompt(s);
    if (p.kind === "who") expect(act(s, "p0", { player: "intruder" }, now)).toMatchObject({ ok: false, code: "INVALID_PAYLOAD" });
    else if (p.kind === "text") {
      expect(act(s, "p0", { text: "   " }, now)).toMatchObject({ ok: false, code: "INVALID_PAYLOAD" });
      expect(act(s, "p0", { text: "x".repeat(41) }, now)).toMatchObject({ ok: false, code: "INVALID_PAYLOAD" });
    } else expect(act(s, "p0", { option: "not-an-option" }, now)).toMatchObject({ ok: false, code: "INVALID_PAYLOAD" });
    expect(engine.handleAction(s, "p0", engine.actionSchema.parse({ type: "wave:answer", round: 2, option: "x" }), { now, rng: seededRng(1) })).toMatchObject({ ok: false, code: "STALE_STATE" });
    expect(act(s, "p0", answerFor(s, 0), now).ok).toBe(true);
    expect(act(s, "p0", answerFor(s, 1), now)).toMatchObject({ ok: false, code: "INVALID_MOVE" });
    expect(engine.handleAction(s, "stranger", engine.actionSchema.parse({ type: "wave:answer", round: 1, option: "x" }), { now, rng: seededRng(1) })).toMatchObject({ ok: false, code: "NOT_IN_ROOM" });
  });

  it("reveals at the deadline with whoever answered, and refuses late answers", () => {
    const { s, now, rng } = started(3);
    act(s, "p0", answerFor(s, 0), now + 1000);
    act(s, "p1", answerFor(s, 0), now + 1500);
    const deadline = engine.nextDeadline(s)!;
    expect(act(s, "p2", answerFor(s, 0), deadline + 1)).toMatchObject({ ok: false, code: "GAME_NOT_ACTIVE" });
    engine.tick(s, { now: deadline, rng });
    expect(s.phase).toBe("reveal");
    expect(s.history[0]!.missed).toEqual(["p2"]);
    expect(s.history[0]!.answers).toHaveLength(2);
  });

  it("moves on when everyone taps next, or after the reveal time, and finishes after the last round", () => {
    const { s, now, rng } = started(2, { rounds: 5 });
    let t = now;
    for (let r = 1; r <= 5; r++) {
      act(s, "p0", answerFor(s, 0), t + 100);
      act(s, "p1", answerFor(s, 0), t + 200);
      expect(s.phase).toBe("reveal");
      if (r % 2) {
        expect(engine.handleAction(s, "p0", { type: "wave:next", round: r }, { now: t + 300, rng }).ok).toBe(true);
        expect(s.phase).toBe("reveal");
        engine.handleAction(s, "p1", { type: "wave:next", round: r }, { now: t + 400, rng });
      } else engine.tick(s, { now: t + 200 + REVEAL_MS, rng });
      t += 1000 + REVEAL_MS;
    }
    expect(s.phase).toBe("finished");
    expect(engine.isFinished(s)).toBe(true);
    const v = engine.viewFor(s, "p0");
    expect(v.summary!.roundsPlayed).toBe(5);
    // Both always picked the same: a perfect wavelength.
    expect(v.summary!.matchPct).toBe(100);
    expect(v.summary!.perfectRounds).toBe(5);
    expect(v.summary!.sharedPicks.length).toBe(5);
  });

  it("predict rounds show the subject a question about themselves and count the subject's pairs", () => {
    for (let seed = 1; seed < 400; seed++) {
      const { s } = started(2, { mode: "couples", rounds: 12 }, seed);
      const i = s.deck.findIndex((id) => promptById.get(id)!.kind === "predict");
      if (i !== 0) continue;
      const subject = s.current!.subjectId!;
      const other = s.players.find((p) => p.id !== subject)!.id;
      expect(engine.viewFor(s, subject).prompt!.text).toBe(prompt(s).subjectText);
      expect(engine.viewFor(s, other).prompt!.text).toContain(s.players.find((p) => p.id === subject)!.name);
      return;
    }
    throw Error("no seed dealt a predict prompt first");
  });

  it("reveals when the only player still waiting disconnects, and ends when too few players remain", () => {
    const { s, now } = started(3);
    act(s, "p0", answerFor(s, 0), now + 100);
    act(s, "p1", answerFor(s, 1), now + 200);
    engine.setConnected(s, "p2", false, { now: now + 300, rng: seededRng(1) });
    expect(s.phase).toBe("reveal");
    engine.removePlayer(s, "p2", { now: now + 400, rng: seededRng(1) });
    expect(s.phase).toBe("reveal");
    engine.removePlayer(s, "p1", { now: now + 500, rng: seededRng(1) });
    expect(s.phase).toBe("finished");
    expect(engine.results(s).reason).toBe("players-left");
  });

  it("limits players by mode", () => {
    expect(engine.maxPlayersFor!(config({ mode: "couples" }))).toBe(2);
    expect(engine.maxPlayersFor!(config({ mode: "friends" }))).toBe(4);
    expect(engine.maxPlayersFor!(config({ mode: "group" }))).toBe(6);
    expect(() => engine.create(players(3), config({ mode: "couples" }), { now: 0, rng: seededRng(1) })).toThrow();
    expect(MODE_MAX_PLAYERS.group).toBe(engine.maxPlayers);
  });

  it("records a cooperative result with aggregates only: no answers, no winners", () => {
    const { s, now, rng } = started(2, { rounds: 5, textAnswers: true });
    let t = now;
    for (let r = 1; r <= 5; r++) {
      act(s, "p0", answerFor(s, 0, "secret answer one"), t + 100);
      act(s, "p1", answerFor(s, 1, "secret answer two"), t + 200);
      engine.tick(s, { now: t + 200 + REVEAL_MS, rng });
      t += 1000 + REVEAL_MS;
    }
    const results = engine.results(s);
    expect(results.gameId).toBe("same-wavelength");
    expect(results.reason).toBe("completed");
    for (const e of results.entries) {
      expect(e.isWinner).toBe(false);
      expect(e.placement).toBe(1);
      expect(e.details).toMatchObject({ result: "shared", rounds: 5, players: 2, answered: 5 });
      expect(typeof e.details!.matchPct).toBe("number");
    }
    const stored = JSON.stringify(results);
    expect(stored).not.toContain("secret answer");
    for (const id of s.deck) for (const o of promptById.get(id)!.options ?? []) expect(stored).not.toContain(`"${o.label}"`);
  });
});
