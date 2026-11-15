import { z } from "zod";
import type { MatchResultEntry, MatchResults } from "@platform/shared";
import { fail, type EngineContext, type EngineResult, type EngineSuccess, type GameEngine } from "../core/types";
import { MODES, PROMPTS, promptById, type Mode, type Prompt, type PromptKind, type Topic } from "./prompts";
import { compare, scoreRound, type Answer, type MatchLevel, type PairResult } from "./scoring";

/**
 * Same Wavelength (docs/SAME_WAVELENGTH_DESIGN.md): everyone answers the same prompt in secret; the
 * server reveals all answers at once and scores how often you matched. Cooperative: there are no
 * winners or losers, only a shared wavelength.
 *
 * Server-authoritative: the server picks the prompts, owns every answer, enforces deadlines, keeps
 * answers hidden until the reveal (viewFor shows each player only their own answer while a round
 * is open), refuses second answers, and computes all scores.
 */
export const INTRO_MS = 3_000;
export const REVEAL_MS = 9_000;
export const MAX_TEXT = 40;
/** Players per mode: Couples is for two, Friends up to four, Group up to six. */
export const MODE_MAX_PLAYERS: Record<Mode, number> = { couples: 2, friends: 4, group: 6 };

export const sameWavelengthConfigSchema = z.object({
  mode: z.enum(["couples", "friends", "group"]).default("friends"),
  rounds: z.union([z.literal(5), z.literal(8), z.literal(10), z.literal(12)]).default(8),
  answerSeconds: z.union([z.literal(20), z.literal(30), z.literal(45), z.literal(60)]).default(30),
  /**
   * Typed answers are shown to everyone at the reveal. Off by default, so quick-match rooms with
   * strangers only use built-in options; private rooms turn them on in the lobby.
   */
  textAnswers: z.boolean().default(false),
});
export type SameWavelengthConfig = z.infer<typeof sameWavelengthConfigSchema>;

export const sameWavelengthActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("wave:answer"),
    round: z.number().int().min(1).max(12),
    option: z.string().max(24).optional(),
    player: z.string().max(64).optional(),
    text: z.string().max(200).optional(),
  }),
  z.object({ type: z.literal("wave:next"), round: z.number().int().min(1).max(12) }),
]);
export type SameWavelengthAction = z.infer<typeof sameWavelengthActionSchema>;

interface SWPlayer {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  left: boolean;
  score: number;
  answered: number;
}

interface Round {
  promptId: string;
  /** Predict rounds: whose answer the others are guessing. */
  subjectId: string | null;
  answers: Map<string, Answer>;
  answeredAt: Map<string, number>;
  next: Set<string>;
  result: RoundReveal | null;
}

export interface RevealedAnswer {
  playerId: string;
  /** What the player picked, as shown: the option's label, the chosen player's name, or their text. */
  label: string;
  optionId?: string;
}

export interface RoundReveal {
  round: number;
  promptId: string;
  text: string;
  kind: PromptKind;
  topic: Topic;
  subjectId: string | null;
  answers: RevealedAnswer[];
  /** Players who didn't answer in time. */
  missed: string[];
  pairs: PairResult[];
  points: Record<string, number>;
  pct: number;
  /** Everyone gave the same answer (and at least two answered). */
  allMatched: boolean;
  verdict: "same-brain" | "close" | "mixed" | "different" | "quiet";
}

export interface SessionSummary {
  matchPct: number;
  exactPairs: number;
  closePairs: number;
  totalPairs: number;
  perfectRounds: number;
  roundsPlayed: number;
  bestRound: number | null;
  /** Rounds where everyone gave the same answer: the prompt and the shared answer. */
  sharedPicks: { round: number; text: string; label: string }[];
  /** Rounds where nobody matched: the prompt and the distinct answers. */
  disagreements: { round: number; text: string; labels: string[] }[];
  /** Match percentage per topic, for topics with at least one counted pair. */
  topics: Partial<Record<Topic, number>>;
  fastestAnswerMs: number | null;
}

export interface SameWavelengthView {
  phase: SWState["phase"];
  mode: Mode;
  round: number;
  totalRounds: number;
  phaseEndsAt: number | null;
  now: number;
  textAnswers: boolean;
  players: { id: string; name: string; color: string; connected: boolean; left: boolean; answered: boolean; score: number; ready: boolean }[];
  prompt: { id: string; kind: PromptKind; text: string; topic: Topic; subjectId: string | null; options: { id: string; label: string }[] } | null;
  /** Your own answer this round, and nobody else's. */
  you: { answer: RevealedAnswer | null; ready: boolean } | null;
  reveal: RoundReveal | null;
  history: RoundReveal[];
  summary: SessionSummary | null;
}

export interface SWState {
  config: SameWavelengthConfig;
  phase: "intro" | "answering" | "reveal" | "finished";
  players: SWPlayer[];
  deck: string[];
  round: number;
  current: Round | null;
  history: RoundReveal[];
  phaseEndsAt: number;
  roundStartedAt: number;
  startedAt: number;
  now: number;
  endedAt: number | null;
  endReason: MatchResults["reason"] | null;
  fastestAnswerMs: number | null;
}

const ok = (state: SWState, stateChanged = true): EngineSuccess<SWState> => ({ ok: true, state, stateChanged, messages: [] });
const present = (s: SWState) => s.players.filter((p) => !p.left);
const subjectName = (s: SWState, id: string | null) => s.players.find((p) => p.id === id)?.name ?? "your partner";

/** The prompts a game can use: the mode's prompts, typed ones only when enabled, predict/who only with a sensible count. */
export function eligiblePrompts(mode: Mode, textAnswers: boolean): Prompt[] {
  return PROMPTS.filter((p) => p.modes.includes(mode) && (textAnswers || p.kind !== "text"));
}

/** Shuffles the eligible prompts with the injected RNG and takes one per round. */
function buildDeck(config: SameWavelengthConfig, rng: EngineContext["rng"]): string[] {
  const pool = eligiblePrompts(config.mode, config.textAnswers).map((p) => p.id);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, config.rounds);
}

/** The prompt as a player sees it: a predict round's subject reads it about themselves. */
function promptText(s: SWState, prompt: Prompt, subjectId: string | null, viewer?: string) {
  if (viewer && viewer === subjectId && prompt.subjectText) return prompt.subjectText;
  return prompt.text.replace("{subject}", subjectName(s, subjectId));
}

function options(s: SWState, prompt: Prompt) {
  if (prompt.kind === "who") return present(s).map((p) => ({ id: p.id, label: p.name }));
  return (prompt.options ?? []).map(({ id, label }) => ({ id, label }));
}

function startRound(s: SWState, now: number) {
  s.round++;
  const prompt = promptById.get(s.deck[s.round - 1]!)!;
  const live = present(s);
  // Predict rounds rotate the subject through the players still in the game.
  const subjectId = prompt.kind === "predict" ? live[(s.round - 1) % live.length]!.id : null;
  s.current = { promptId: prompt.id, subjectId, answers: new Map(), answeredAt: new Map(), next: new Set(), result: null };
  s.phase = "answering";
  s.roundStartedAt = now;
  s.phaseEndsAt = now + s.config.answerSeconds * 1000;
}

function labelOf(s: SWState, prompt: Prompt, answer: Answer): RevealedAnswer["label"] {
  if ("option" in answer) return prompt.options?.find((o) => o.id === answer.option)?.label ?? answer.option;
  if ("player" in answer) return s.players.find((p) => p.id === answer.player)?.name ?? "Someone";
  return answer.text;
}

function reveal(s: SWState, now: number) {
  const round = s.current!;
  const prompt = promptById.get(round.promptId)!;
  const scored = scoreRound(prompt, round.answers, round.subjectId && round.answers.has(round.subjectId) ? round.subjectId : null);
  const subjectMissing = !!round.subjectId && !round.answers.has(round.subjectId);
  const pairs = subjectMissing ? [] : scored.pairs;
  const points = subjectMissing ? Object.fromEntries([...round.answers.keys()].map((id) => [id, 0])) : scored.points;
  for (const [id, pts] of Object.entries(points)) {
    const player = s.players.find((p) => p.id === id);
    if (player) player.score += pts;
  }
  const pct = subjectMissing ? 0 : scored.pct;
  const answers = [...round.answers.entries()].map(([playerId, a]) => ({ playerId, label: labelOf(s, prompt, a), ...("option" in a ? { optionId: a.option } : "player" in a ? { optionId: a.player } : {}) }));
  const allMatched = answers.length >= 2 && pairs.length > 0 && pairs.every((p) => p.level === "match") && (!round.subjectId || pairs.length === answers.length - 1);
  const verdict: RoundReveal["verdict"] = pairs.length === 0 ? "quiet" : allMatched ? "same-brain" : pct >= 50 ? "close" : pct > 0 ? "mixed" : "different";
  round.result = {
    round: s.round,
    promptId: prompt.id,
    text: promptText(s, prompt, round.subjectId),
    kind: prompt.kind,
    topic: prompt.topic,
    subjectId: round.subjectId,
    answers,
    missed: present(s).filter((p) => !round.answers.has(p.id)).map((p) => p.id),
    pairs,
    points,
    pct,
    allMatched,
    verdict,
  };
  s.history.push(round.result);
  s.phase = "reveal";
  s.phaseEndsAt = now + REVEAL_MS;
}

function finish(s: SWState, now: number, reason: MatchResults["reason"]) {
  if (s.phase === "finished") return;
  s.phase = "finished";
  s.endedAt = now;
  s.endReason = reason;
  s.current = null;
}

function advance(s: SWState, now: number) {
  if (s.round >= s.config.rounds) finish(s, now, "completed");
  else startRound(s, now);
}

/** Everyone still connected has answered: reveal without waiting for the timer. */
function revealIfAllAnswered(s: SWState, now: number) {
  if (s.phase !== "answering") return;
  const waiting = present(s).filter((p) => p.connected && !s.current!.answers.has(p.id));
  if (waiting.length === 0 && s.current!.answers.size > 0) reveal(s, now);
}

function parseAnswer(s: SWState, prompt: Prompt, action: Extract<SameWavelengthAction, { type: "wave:answer" }>): Answer | string {
  if (prompt.kind === "who") {
    if (!action.player || !present(s).some((p) => p.id === action.player)) return "Pick one of the players";
    return { player: action.player };
  }
  if (prompt.kind === "text") {
    // Strip control characters; keep it short. Shown as plain text, never as HTML.
    const text = (action.text ?? "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
    if (!text) return "Type an answer";
    if (text.length > MAX_TEXT) return `Keep it under ${MAX_TEXT} characters`;
    return { text };
  }
  if (!action.option || !prompt.options?.some((o) => o.id === action.option)) return "Pick one of the options";
  return { option: action.option };
}

export function summarize(s: SWState): SessionSummary {
  let exact = 0, close = 0, total = 0, earned = 0;
  const byTopic = new Map<Topic, { earned: number; possible: number }>();
  for (const r of s.history) {
    for (const p of r.pairs) {
      total++;
      if (p.level === "match") exact++;
      if (p.level === "close") close++;
    }
    const e = r.pairs.reduce((n, p) => n + (p.level === "match" ? 2 : p.level === "close" ? 1 : 0), 0);
    earned += e;
    if (r.pairs.length) {
      const t = byTopic.get(r.topic) ?? { earned: 0, possible: 0 };
      t.earned += e;
      t.possible += r.pairs.length * 2;
      byTopic.set(r.topic, t);
    }
  }
  const counted = s.history.filter((r) => r.pairs.length > 0);
  const best = [...counted].sort((a, b) => b.pct - a.pct || a.round - b.round)[0];
  return {
    matchPct: total ? Math.round((earned / (total * 2)) * 100) : 0,
    exactPairs: exact,
    closePairs: close,
    totalPairs: total,
    perfectRounds: s.history.filter((r) => r.allMatched).length,
    roundsPlayed: s.history.length,
    bestRound: best ? best.round : null,
    sharedPicks: s.history.filter((r) => r.allMatched).slice(0, 5).map((r) => ({ round: r.round, text: r.text, label: r.answers[0]!.label })),
    disagreements: s.history
      .filter((r) => r.pairs.length > 0 && r.pct === 0)
      .slice(0, 3)
      .map((r) => ({ round: r.round, text: r.text, labels: [...new Set(r.answers.map((a) => a.label))] })),
    topics: Object.fromEntries([...byTopic].map(([t, v]) => [t, Math.round((v.earned / v.possible) * 100)])),
    fastestAnswerMs: s.fastestAnswerMs,
  };
}

export const sameWavelengthEngine: GameEngine<SWState, SameWavelengthConfig, SameWavelengthAction, SameWavelengthView> = {
  id: "same-wavelength",
  minPlayers: 2,
  maxPlayers: 6,
  maxPlayersFor: (config) => MODE_MAX_PLAYERS[(config as SameWavelengthConfig).mode] ?? 6,
  configSchema: sameWavelengthConfigSchema,
  defaultConfig: () => sameWavelengthConfigSchema.parse({}),
  actionSchema: sameWavelengthActionSchema,
  actionTypes: ["wave:answer", "wave:next"],
  requiresVersion: () => false,

  create(players, config, ctx) {
    if (players.length > MODE_MAX_PLAYERS[config.mode]) throw Error(`${config.mode} mode is for up to ${MODE_MAX_PLAYERS[config.mode]} players`);
    const s: SWState = {
      config,
      phase: "intro",
      players: players.map((p) => ({ ...p, connected: true, left: false, score: 0, answered: 0 })),
      deck: buildDeck(config, ctx.rng),
      round: 0,
      current: null,
      history: [],
      phaseEndsAt: ctx.now + INTRO_MS,
      roundStartedAt: ctx.now,
      startedAt: ctx.now,
      now: ctx.now,
      endedAt: null,
      endReason: null,
      fastestAnswerMs: null,
    };
    return ok(s);
  },

  handleAction(s, playerId, action, ctx): EngineResult<SWState> {
    s.now = ctx.now;
    const player = s.players.find((p) => p.id === playerId);
    if (!player || player.left) return fail("NOT_IN_ROOM", "You're not playing in this game");
    if (action.round !== s.round) return fail("STALE_STATE", "That round has already moved on");
    if (action.type === "wave:next") {
      if (s.phase !== "reveal") return fail("GAME_NOT_ACTIVE", "There's nothing to skip right now");
      if (s.current!.next.has(playerId)) return ok(s, false);
      s.current!.next.add(playerId);
      if (present(s).filter((p) => p.connected).every((p) => s.current!.next.has(p.id))) advance(s, ctx.now);
      return ok(s);
    }
    if (s.phase !== "answering") return fail("GAME_NOT_ACTIVE", s.phase === "finished" ? "The game is over" : "Answers aren't open right now");
    if (ctx.now > s.phaseEndsAt) return fail("GAME_NOT_ACTIVE", "Time's up for this round");
    const round = s.current!;
    if (round.answers.has(playerId)) return fail("INVALID_MOVE", "You've already locked in your answer");
    const prompt = promptById.get(round.promptId)!;
    const answer = parseAnswer(s, prompt, action);
    if (typeof answer === "string") return fail("INVALID_PAYLOAD", answer);
    round.answers.set(playerId, answer);
    round.answeredAt.set(playerId, ctx.now);
    player.answered++;
    const took = ctx.now - s.roundStartedAt;
    if (s.fastestAnswerMs === null || took < s.fastestAnswerMs) s.fastestAnswerMs = took;
    revealIfAllAnswered(s, ctx.now);
    return ok(s);
  },

  tick(s, ctx) {
    s.now = ctx.now;
    if (s.phase === "intro" && ctx.now >= s.phaseEndsAt) startRound(s, ctx.now);
    else if (s.phase === "answering" && ctx.now >= s.phaseEndsAt) reveal(s, ctx.now);
    else if (s.phase === "reveal" && ctx.now >= s.phaseEndsAt) advance(s, ctx.now);
    return ok(s);
  },

  nextDeadline: (s) => (s.phase === "finished" ? null : s.phaseEndsAt),

  viewFor(s, playerId): SameWavelengthView {
    const round = s.current;
    const prompt = round ? promptById.get(round.promptId)! : null;
    const me = s.players.find((p) => p.id === playerId);
    const own = round && prompt ? round.answers.get(playerId) : undefined;
    return {
      phase: s.phase,
      mode: s.config.mode,
      round: s.round,
      totalRounds: s.config.rounds,
      phaseEndsAt: s.phase === "finished" ? null : s.phaseEndsAt,
      now: s.now,
      textAnswers: s.config.textAnswers,
      players: s.players.map((p) => ({ id: p.id, name: p.name, color: p.color, connected: p.connected, left: p.left, answered: !!round?.answers.has(p.id), score: p.score, ready: !!round?.next.has(p.id) })),
      prompt: round && prompt && s.phase !== "intro" ? { id: prompt.id, kind: prompt.kind, text: promptText(s, prompt, round.subjectId, playerId), topic: prompt.topic, subjectId: round.subjectId, options: options(s, prompt) } : null,
      // While a round is open, only your own answer is in your view. Others' appear at the reveal.
      you: me ? { answer: own && prompt ? { playerId, label: labelOf(s, prompt, own), ...("option" in own ? { optionId: own.option } : "player" in own ? { optionId: own.player } : {}) } : null, ready: !!round?.next.has(playerId) } : null,
      reveal: s.phase === "reveal" ? round!.result : null,
      history: s.history,
      summary: s.phase === "finished" ? summarize(s) : null,
    };
  },

  syncMessages: () => [],

  setConnected(s, playerId, connected, ctx) {
    s.now = ctx.now;
    const player = s.players.find((p) => p.id === playerId);
    if (player) player.connected = connected;
    // Don't make the others wait for someone who dropped: reveal if everyone still here has answered.
    if (!connected) revealIfAllAnswered(s, ctx.now);
    return ok(s);
  },

  removePlayer(s, playerId, ctx) {
    s.now = ctx.now;
    const player = s.players.find((p) => p.id === playerId);
    if (player) {
      player.left = true;
      player.connected = false;
    }
    if (present(s).length < 2) finish(s, ctx.now, s.history.length > 0 ? "players-left" : "aborted");
    else revealIfAllAnswered(s, ctx.now);
    return ok(s);
  },

  isFinished: (s) => s.phase === "finished",

  results(s): MatchResults {
    const summary = summarize(s);
    const agree = Object.entries(summary.topics).filter(([, pct]) => pct! >= 60).map(([t]) => t);
    const differ = Object.entries(summary.topics).filter(([, pct]) => pct! < 30).map(([t]) => t);
    // Cooperative: everyone shares placement 1 and nobody wins or loses (recordMatch records it as neutral).
    const entries: MatchResultEntry[] = [...s.players]
      .sort((a, b) => Number(a.left) - Number(b.left) || b.score - a.score)
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        color: p.color,
        placement: 1,
        score: p.score,
        isWinner: false,
        // Aggregates only: the answers themselves are never stored.
        details: {
          result: "shared",
          mode: s.config.mode,
          rounds: summary.roundsPlayed,
          matchPct: summary.matchPct,
          exactMatches: summary.exactPairs,
          closeMatches: summary.closePairs,
          comparisons: summary.totalPairs,
          perfectRounds: summary.perfectRounds,
          bestRound: summary.bestRound ?? 0,
          answered: p.answered,
          players: s.players.length,
          agreeTopics: agree.join(","),
          differTopics: differ.join(","),
          fastestAnswerMs: summary.fastestAnswerMs ?? 0,
          ...(p.left ? { left: 1 } : {}),
        },
      }));
    return { gameId: "same-wavelength", endedAt: s.endedAt ?? s.now, reason: s.endReason ?? "completed", entries };
  },
};

export { compare, MODES };
export type { MatchLevel, Mode };
