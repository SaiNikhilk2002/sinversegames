import { describe, expect, it } from "vitest";
import { factsFromResults, insightsFor, insightsForResults, shareCaption } from "../src/insights";
import type { MatchResults } from "../src/realtime/protocol";

const wave = (details: Record<string, number | string>, players = 2): MatchResults => ({
  gameId: "same-wavelength",
  endedAt: 1,
  reason: "completed",
  entries: Array.from({ length: players }, (_, i) => ({ playerId: `p${i}`, name: `P${i}`, color: "#fff", placement: 1, score: 10, isWinner: false, details: { result: "shared", players, ...details } })),
});

describe("Fun Insights", () => {
  it("only says what the session's facts support", () => {
    const high = insightsForResults(wave({ matchPct: 86, exactMatches: 7, comparisons: 8, perfectRounds: 3, rounds: 8, agreeTopics: "travel", differTopics: "food" }), "m1");
    expect(high.map((i) => i.id)).toEqual(["sw-sync", "sw-food-travel", "sw-perfect"]);
    expect(high[0]!.text).toContain("86%");
    const low = insightsForResults(wave({ matchPct: 12, exactMatches: 1, comparisons: 8, perfectRounds: 0, rounds: 8, agreeTopics: "", differTopics: "habits" }), "m1");
    expect(low.map((i) => i.id)).toContain("sw-different");
    expect(low.map((i) => i.id)).not.toContain("sw-sync");
    expect(low.find((i) => i.id === "sw-split")?.text).toContain("daily habits");
  });

  it("uses wording for the player count", () => {
    const facts = { matchPct: 50, exactMatches: 4, comparisons: 8, rounds: 8 };
    const two = insightsFor("same-wavelength", facts, { players: 2, seed: "x", multiplayer: true, limit: 10 }).map((i) => i.id);
    const four = insightsFor("same-wavelength", facts, { players: 4, seed: "x", multiplayer: true, limit: 10 }).map((i) => i.id);
    expect(two).toContain("sw-pairs");
    expect(two).not.toContain("sw-group-pairs");
    expect(four).toContain("sw-group-pairs");
  });

  it("is deterministic for a session and varies phrasing across sessions", () => {
    const r = wave({ matchPct: 90, exactMatches: 9, comparisons: 10, perfectRounds: 3, rounds: 10 });
    expect(insightsForResults(r, "same-seed")).toEqual(insightsForResults(r, "same-seed"));
    const phrasings = new Set(Array.from({ length: 30 }, (_, k) => insightsForResults(r, `seed-${k}`)[0]!.text));
    expect(phrasings.size).toBeGreaterThan(1);
  });

  it("derives Doodle Duel lines from recorded guesses and hints", () => {
    const results: MatchResults = {
      gameId: "doodle-duel",
      endedAt: 1,
      reason: "completed",
      entries: [
        { playerId: "a", name: "A", color: "#fff", placement: 1, score: 900, isWinner: true, details: { correctGuesses: 3, drawings: 2, drawingsGuessed: 2, fastestGuessMs: 7400, fewestHints: 0 } },
        { playerId: "b", name: "B", color: "#fff", placement: 2, score: 880, isWinner: false, details: { correctGuesses: 2, drawings: 2, drawingsGuessed: 2, fastestGuessMs: 12000, fewestHints: 1 } },
      ],
    };
    const facts = factsFromResults(results);
    expect(facts).toMatchObject({ fastestGuessMs: 7400, fewestHints: 0, drawings: 4, drawingsGuessed: 4, margin: 20 });
    const ids = insightsForResults(results, "d1", 6).map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["dd-fast", "dd-nohints", "dd-teamwork", "mp-close", "mp-duo"]));
    expect(insightsForResults(results, "d1", 6).find((i) => i.id === "dd-fast")!.text).toMatch(/7 seconds/);
  });

  it("says nothing about unfinished matches, and never makes relationship or personality claims", () => {
    expect(insightsForResults({ ...wave({ matchPct: 100 }), reason: "players-left" }, "x")).toEqual([]);
    const claims = /\b(compatib|soulmate|relationship|personality|attachment|scientific|study|research|predict)/i;
    for (const pct of [0, 15, 35, 55, 75, 95])
      for (const seed of ["a", "b", "c"]) for (const i of insightsForResults(wave({ matchPct: pct, exactMatches: 3, comparisons: 8, perfectRounds: 2, rounds: 8, agreeTopics: "food,travel", differTopics: "screen", fastestAnswerMs: 1500 }), seed, 10)) expect(i.text).not.toMatch(claims);
    expect(shareCaption("Same Wavelength", { matchPct: 72 })).toBe("We're 72% on the same wavelength. Can you beat that?");
  });
});
