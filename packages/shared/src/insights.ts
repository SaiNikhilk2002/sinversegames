/**
 * Fun Insights (docs/FUN_INSIGHTS_SYSTEM.md): playful, shareable lines about a finished session,
 * derived only from what the game recorded (match percentages, rounds, guesses, hints, scores).
 *
 * Rules, not a model: each rule states the facts it needs and fires only when they hold, so every
 * line is true of the session it describes. Nothing here is a psychological or relationship
 * assessment, and nothing is sent anywhere: it's pure functions shared by the web app and server.
 */
import type { GameId } from "./games/registry";
import type { MatchResults } from "./realtime/protocol";

export type InsightTone = "positive" | "humorous" | "neutral";
export interface Insight {
  id: string;
  text: string;
  tone: InsightTone;
}

/** Recorded facts about a session. Numbers are counts, percentages or milliseconds. */
export type Facts = Record<string, number | string | undefined>;

interface Rule {
  id: string;
  games: readonly GameId[] | "multiplayer";
  /** Player counts the line makes sense for. */
  players?: readonly [number, number];
  tone: InsightTone;
  /** Higher shows first. */
  priority: number;
  when: (f: Facts) => boolean;
  /** Alternative phrasings; {fact} placeholders are filled from the facts. */
  texts: readonly string[];
}

const n = (f: Facts, k: string) => (typeof f[k] === "number" ? (f[k] as number) : Number(f[k] ?? NaN));
const has = (f: Facts, k: string, value: string) => String(f[k] ?? "").split(",").includes(value);
export const TOPIC_LABELS: Record<string, string> = { food: "food", travel: "travel", home: "life at home", fun: "fun stuff", screen: "films and shows", habits: "daily habits", dreams: "daydreams", games: "games" };

const RULES: readonly Rule[] = [
  // Same Wavelength
  { id: "sw-sync", games: ["same-wavelength"], tone: "positive", priority: 90, when: (f) => n(f, "matchPct") >= 80, texts: ["Same brain energy: you matched {matchPct}% of the time!", "{matchPct}% in sync. Are you sharing a brain?"] },
  { id: "sw-perfect", games: ["same-wavelength"], tone: "positive", priority: 80, when: (f) => n(f, "perfectRounds") >= 2, texts: ["{perfectRounds} perfect rounds. Same brain moment, again and again!", "Everyone gave the same answer {perfectRounds} times!"] },
  { id: "sw-food-travel", games: ["same-wavelength"], tone: "humorous", priority: 85, when: (f) => has(f, "differTopics", "food") && has(f, "agreeTopics", "travel"), texts: ["You disagree on food but agree on travel. Interesting combination!"] },
  { id: "sw-travel", games: ["same-wavelength"], tone: "positive", priority: 70, when: (f) => has(f, "agreeTopics", "travel"), texts: ["You're in sync on travel. Plan the trip already!", "Travel plans? You'd agree on the destination."] },
  { id: "sw-food", games: ["same-wavelength"], tone: "positive", priority: 70, when: (f) => has(f, "agreeTopics", "food"), texts: ["Food is where your wavelengths meet. Ordering will be easy.", "You agree on food. That's half of every evening sorted."] },
  { id: "sw-split", games: ["same-wavelength"], tone: "humorous", priority: 60, when: (f) => String(f.differTopics ?? "") !== "", texts: ["Your wavelengths split on {firstDifferTopic}. Great debate material!"] },
  { id: "sw-pairs", games: ["same-wavelength"], players: [2, 2], tone: "neutral", priority: 50, when: (f) => n(f, "comparisons") > 0, texts: ["You matched on {exactMatches} of {comparisons} rounds.", "{exactMatches} exact matches out of {comparisons}."] },
  { id: "sw-group-pairs", games: ["same-wavelength"], players: [3, 6], tone: "neutral", priority: 50, when: (f) => n(f, "comparisons") > 0, texts: ["{exactMatches} exact matches across {comparisons} head-to-head comparisons."] },
  { id: "sw-different", games: ["same-wavelength"], tone: "humorous", priority: 75, when: (f) => n(f, "comparisons") > 0 && n(f, "matchPct") < 30, texts: ["Different opinions, great chemistry! Only {matchPct}% matched, and that's half the fun.", "{matchPct}% in sync. Opposites keep things interesting!"] },
  { id: "sw-mixed", games: ["same-wavelength"], tone: "neutral", priority: 40, when: (f) => n(f, "matchPct") >= 30 && n(f, "matchPct") < 80, texts: ["A healthy mix: {matchPct}% in sync, with plenty left to talk about.", "{matchPct}% on the same wavelength. Enough to agree, enough to argue."] },
  { id: "sw-fast", games: ["same-wavelength"], tone: "humorous", priority: 30, when: (f) => n(f, "fastestAnswerMs") > 0 && n(f, "fastestAnswerMs") < 3000, texts: ["Someone locked in an answer in {fastestAnswerSeconds} seconds. Decisive!"] },
  // Doodle Duel
  { id: "dd-fast", games: ["doodle-duel"], tone: "positive", priority: 80, when: (f) => n(f, "fastestGuessMs") > 0 && n(f, "fastestGuessMs") <= 10_000, texts: ["A drawing was recognised in just {fastestGuessSeconds} seconds!", "Guessed in {fastestGuessSeconds} seconds. Are you reading minds?"] },
  { id: "dd-nohints", games: ["doodle-duel"], tone: "humorous", priority: 70, when: (f) => n(f, "fewestHints") === 0, texts: ["Someone got it with zero letter hints. Telepathy?"] },
  { id: "dd-fewhints", games: ["doodle-duel"], tone: "positive", priority: 60, when: (f) => n(f, "fewestHints") > 0 && n(f, "fewestHints") <= 2, texts: ["You needed only {fewestHints} hints to understand each other!"] },
  { id: "dd-teamwork", games: ["doodle-duel"], tone: "positive", priority: 65, when: (f) => n(f, "drawings") >= 2 && n(f, "drawingsGuessed") / n(f, "drawings") >= 0.75, texts: ["{drawingsGuessed} of {drawings} drawings were guessed. Questionable art, impressive teamwork!"] },
  { id: "dd-abstract", games: ["doodle-duel"], tone: "humorous", priority: 55, when: (f) => n(f, "drawings") >= 2 && n(f, "drawingsGuessed") / n(f, "drawings") < 0.4, texts: ["Only {drawingsGuessed} of {drawings} drawings were guessed. Bold artistic choices!"] },
  // Any multiplayer game
  { id: "mp-close", games: "multiplayer", tone: "humorous", priority: 20, when: (f) => n(f, "competitive") === 1 && n(f, "topScore") > 0 && n(f, "margin") / n(f, "topScore") <= 0.1, texts: ["Only {margin} points in it. The rematch is probably necessary.", "That was close: {margin} points between first and second."] },
  { id: "mp-duo", games: "multiplayer", players: [2, 2], tone: "neutral", priority: 10, when: (f) => n(f, "competitive") === 1 && n(f, "bothScored") === 1, texts: ["You two make a surprisingly competitive pair.", "Two players, one rivalry. Same time tomorrow?"] },
];

/** A small, stable hash so the same session always gets the same phrasing. */
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
function fill(template: string, f: Facts) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(f[k] ?? ""));
}

/**
 * The insights for a session: rules that hold, highest priority first, at most `limit`.
 * `seed` (e.g. the match id) picks among phrasings deterministically.
 */
export function insightsFor(gameId: GameId, facts: Facts, opts: { players: number; seed: string; multiplayer: boolean; limit?: number }): Insight[] {
  const derived: Facts = {
    ...facts,
    fastestAnswerSeconds: facts.fastestAnswerMs !== undefined ? Math.max(1, Math.round(n(facts, "fastestAnswerMs") / 1000)) : undefined,
    fastestGuessSeconds: facts.fastestGuessMs !== undefined ? Math.max(1, Math.round(n(facts, "fastestGuessMs") / 1000)) : undefined,
    firstDifferTopic: TOPIC_LABELS[String(facts.differTopics ?? "").split(",")[0] ?? ""] ?? String(facts.differTopics ?? "").split(",")[0],
  };
  return RULES.filter((r) => (r.games === "multiplayer" ? opts.multiplayer : r.games.includes(gameId)))
    .filter((r) => !r.players || (opts.players >= r.players[0] && opts.players <= r.players[1]))
    .filter((r) => {
      try {
        return r.when(derived);
      } catch {
        return false;
      }
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, opts.limit ?? 3)
    .map((r) => ({ id: r.id, tone: r.tone, text: fill(r.texts[hash(`${opts.seed}:${r.id}`) % r.texts.length]!, derived) }));
}

/** Session facts from a finished match's recorded results (the same on the client and the server). */
export function factsFromResults(results: MatchResults): Facts {
  const entries = results.entries.filter((e) => !e.details?.left);
  const d = (k: string) => entries.map((e) => e.details?.[k]).filter((v) => v !== undefined && v !== "").map(Number).filter(Number.isFinite);
  const min = (k: string) => (d(k).length ? Math.min(...d(k)) : undefined);
  const sum = (k: string) => d(k).reduce((a, b) => a + b, 0);
  if (results.gameId === "same-wavelength") {
    // Shared by everyone: every entry carries the same session aggregates.
    const first = entries[0]?.details ?? {};
    return { ...first };
  }
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  const facts: Facts = {
    competitive: results.gameId === "kitchen-rush-coop" ? 0 : 1,
    topScore: sorted[0]?.score ?? 0,
    margin: sorted.length > 1 ? sorted[0]!.score - sorted[1]!.score : undefined,
    bothScored: entries.length === 2 && entries.every((e) => e.score > 0) ? 1 : 0,
  };
  if (results.gameId === "doodle-duel") Object.assign(facts, { fastestGuessMs: min("fastestGuessMs"), fewestHints: min("fewestHints"), drawings: sum("drawings"), drawingsGuessed: sum("drawingsGuessed") });
  return facts;
}

/** Insights for a finished match, as shown on its results screen and its share card. */
export function insightsForResults(results: MatchResults, seed: string, limit = 3): Insight[] {
  if (results.reason !== "completed") return [];
  const players = results.entries.filter((e) => !e.details?.left).length;
  return insightsFor(results.gameId, factsFromResults(results), { players, seed, multiplayer: true, limit });
}

/** A one-line caption for sharing a result. */
export function shareCaption(gameName: string, facts: Facts): string {
  if (facts.matchPct !== undefined) return `We're ${facts.matchPct}% on the same wavelength. Can you beat that?`;
  return `We just played ${gameName}. Your turn!`;
}
