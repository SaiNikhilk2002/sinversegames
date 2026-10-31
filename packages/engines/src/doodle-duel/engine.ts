import { z } from "zod";
import type { MatchResults } from "@platform/shared";
import { sample, shuffle, type Rng } from "../core/rng";
import {
  fail,
  toAll,
  toExcept,
  toOnly,
  type EngineContext,
  type EngineResult,
  type EngineSuccess,
  type GameEngine,
  type OutboundMessage,
  type PlayerRef,
} from "../core/types";
import { maskWord, maxReveals, pickRevealIndex, revealSchedule, TEXT_HINT_AT } from "./hints";
import { classifyGuess, normalizeGuess } from "./matching";
import { DEFAULT_DOODLE_SCORING, drawerPoints, guesserPoints, type DoodleScoring } from "./scoring";
import {
  MAX_POINTS_PER_TURN,
  MAX_STROKES_PER_TURN,
  snapshotStroke,
  strokeChunkSchema,
  type Stroke,
  type StrokeSnapshot,
} from "./strokes";
import { WORD_BANK, type Word } from "./words";
import {
  doodleConfigSchema,
  DRAWER_DISCONNECT_GRACE_MS,
  MAX_GUESS_LENGTH,
  REVEAL_MS,
  WORD_CATEGORIES,
  WORD_CHOICES,
  type DoodleConfig,
} from "./config";

export const doodleActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("doodle:select-word"), index: z.number().int().min(0).max(WORD_CHOICES - 1) }),
  strokeChunkSchema.extend({ type: z.literal("doodle:stroke") }),
  z.object({ type: z.literal("doodle:undo") }),
  z.object({ type: z.literal("doodle:clear") }),
  z.object({ type: z.literal("doodle:guess"), text: z.string().max(200) }),
]);
export type DoodleAction = z.infer<typeof doodleActionSchema>;

export interface DDPlayer extends PlayerRef {
  score: number;
  connected: boolean;
  disconnectedAt: number | null;
  left: boolean;
}

interface CorrectGuess {
  playerId: string;
  at: number;
  points: number;
}

export type TurnEndReason = "time" | "all-guessed" | "drawer-left";

interface DDTurn {
  number: number;
  round: number;
  drawerId: string;
  options: Word[];
  word: Word | null;
  drawStartedAt: number | null;
  drawEndsAt: number | null;
  revealed: number[];
  revealAt: number[];
  textHintShown: boolean;
  guesses: CorrectGuess[];
  lastGuess: Record<string, string>;
  strokes: Stroke[];
  pointCount: number;
  endReason: TurnEndReason | null;
  /** Points earned this turn, by player id (filled at turn end). */
  turnPoints: Record<string, number>;
}

export interface DDState {
  config: DoodleConfig;
  players: DDPlayer[];
  /** Drawer rotation (player ids, randomised at start). */
  order: string[];
  orderIndex: number;
  phase: "choosing" | "drawing" | "reveal" | "finished";
  phaseEndsAt: number | null;
  turn: DDTurn;
  usedWords: string[];
  chatSeq: number;
  endReason: MatchResults["reason"] | null;
  endedAt: number | null;
  startedAt: number;
}

export type DoodleChatMessage =
  | { kind: "chat"; id: number; playerId: string; name: string; text: string }
  | { kind: "guessed-chat"; id: number; playerId: string; name: string; text: string }
  | { kind: "correct"; id: number; playerId: string; name: string; points: number; first: boolean }
  | { kind: "close"; id: number; text: string }
  | { kind: "system"; id: number; text: string };

export interface DoodleView {
  phase: DDState["phase"];
  round: number;
  totalRounds: number;
  turnNumber: number;
  drawerId: string;
  phaseEndsAt: number | null;
  drawStartedAt: number | null;
  drawEndsAt: number | null;
  players: { id: string; name: string; color: string; score: number; connected: boolean; left: boolean; guessed: boolean }[];
  /** Blanks/revealed letters for the current word while drawing; null otherwise. */
  mask: string[] | null;
  category: string | null;
  textHint: string | null;
  /** The secret word — only for the drawer, players who guessed it, or after the turn. */
  word: string | null;
  wordOptions: { text: string; category: string; difficulty: Word["difficulty"] }[] | null;
  lastTurn: { word: string; drawerId: string; reason: TurnEndReason; points: Record<string, number> } | null;
  you: { id: string; isDrawer: boolean; hasGuessed: boolean } | null;
  config: DoodleConfig;
}

export interface DoodleEngineOptions {
  wordBank?: readonly Word[];
  scoring?: DoodleScoring;
}

// ---------------------------------------------------------------------------

export function pickWordOptions(
  bank: readonly Word[],
  config: Pick<DoodleConfig, "category" | "difficulty">,
  used: readonly string[],
  rng: Rng,
  count = WORD_CHOICES,
): Word[] {
  let pool = bank.filter((w) => config.category === "mixed" || w.category === config.category);
  if (config.difficulty !== "mixed") {
    const filtered = pool.filter((w) => w.difficulty === config.difficulty);
    if (filtered.length >= count) pool = filtered;
  }
  let available = pool.filter((w) => !used.includes(w.text));
  if (available.length < count) available = pool; // exhausted: allow repeats
  if (config.difficulty !== "mixed") return sample(available, count, rng);

  // Mixed: offer one easy, one medium and one hard word where possible.
  const picks: Word[] = [];
  for (const d of ["easy", "medium", "hard"] as const) {
    const options = available.filter((w) => w.difficulty === d && !picks.includes(w));
    if (options.length && picks.length < count) picks.push(options[rng.int(options.length)]!);
  }
  const rest = shuffle(available.filter((w) => !picks.includes(w)), rng);
  while (picks.length < count && rest.length) picks.push(rest.pop()!);
  return picks;
}

const active = (s: DDState) => s.players.filter((p) => !p.left);
const drawerOf = (s: DDState) => s.players.find((p) => p.id === s.turn.drawerId)!;
const hasGuessed = (s: DDState, id: string) => s.turn.guesses.some((g) => g.playerId === id);

function emptyTurn(number: number, round: number, drawerId: string): DDTurn {
  return {
    number,
    round,
    drawerId,
    options: [],
    word: null,
    drawStartedAt: null,
    drawEndsAt: null,
    revealed: [],
    revealAt: [],
    textHintShown: false,
    guesses: [],
    lastGuess: {},
    strokes: [],
    pointCount: 0,
    endReason: null,
    turnPoints: {},
  };
}

export function createDoodleEngine(options: DoodleEngineOptions = {}): GameEngine<DDState, DoodleConfig, DoodleAction, DoodleView> {
  const bank = options.wordBank ?? WORD_BANK;
  const scoring = options.scoring ?? DEFAULT_DOODLE_SCORING;

  const nextChatId = (s: DDState) => ++s.chatSeq;

  function startTurn(s: DDState, ctx: EngineContext, number: number, round: number): OutboundMessage[] {
    const drawerId = s.order[s.orderIndex]!;
    s.turn = emptyTurn(number, round, drawerId);
    s.turn.options = pickWordOptions(bank, s.config, s.usedWords, ctx.rng);
    s.phase = "choosing";
    s.phaseEndsAt = ctx.now + s.config.chooseSeconds * 1000;
    return [
      {
        to: toOnly(drawerId),
        event: "doodle:word-options",
        payload: {
          turn: number,
          endsAt: s.phaseEndsAt,
          options: s.turn.options.map((w) => ({ text: w.text, category: WORD_CATEGORIES[w.category], difficulty: w.difficulty })),
        },
      },
      { to: toAll, event: "doodle:clear", payload: { turn: number } },
    ];
  }

  function beginDrawing(s: DDState, word: Word, ctx: EngineContext): OutboundMessage[] {
    const t = s.turn;
    t.word = word;
    t.options = [];
    s.usedWords.push(word.text);
    const duration = s.config.drawSeconds * 1000;
    t.drawStartedAt = ctx.now;
    t.drawEndsAt = ctx.now + duration;
    t.revealAt = s.config.hints ? revealSchedule(ctx.now, duration, maxReveals(word.text, word.difficulty)) : [];
    s.phase = "drawing";
    s.phaseEndsAt = t.drawEndsAt;
    return [];
  }

  function endTurn(s: DDState, reason: TurnEndReason, ctx: EngineContext): OutboundMessage[] {
    const t = s.turn;
    t.endReason = reason;
    const eligible = active(s).filter((p) => p.id !== t.drawerId).length;
    const drawer = drawerOf(s);
    const dPoints = reason === "drawer-left" ? 0 : drawerPoints(t.guesses.length, eligible, scoring);
    drawer.score += dPoints;
    for (const g of t.guesses) t.turnPoints[g.playerId] = g.points;
    t.turnPoints[drawer.id] = dPoints;
    s.phase = "reveal";
    s.phaseEndsAt = ctx.now + REVEAL_MS;
    return [
      {
        to: toAll,
        event: "doodle:round-ended",
        payload: { turn: t.number, word: t.word?.text ?? null, drawerId: t.drawerId, reason, points: t.turnPoints },
      },
    ];
  }

  function finish(s: DDState, reason: MatchResults["reason"], ctx: EngineContext) {
    s.phase = "finished";
    s.phaseEndsAt = null;
    s.endReason = reason;
    s.endedAt = ctx.now;
  }

  /** Moves to the next drawer who is still in the game, or ends the match after the last round. */
  function advance(s: DDState, ctx: EngineContext): OutboundMessage[] {
    let round = s.turn.round;
    for (let i = 0; i < s.order.length + 1; i++) {
      s.orderIndex++;
      if (s.orderIndex >= s.order.length) {
        s.orderIndex = 0;
        round++;
      }
      if (round > s.config.rounds) {
        finish(s, "completed", ctx);
        return [];
      }
      const candidate = s.players.find((p) => p.id === s.order[s.orderIndex]);
      if (candidate && !candidate.left) return startTurn(s, ctx, s.turn.number + 1, round);
    }
    finish(s, "players-left", ctx);
    return [];
  }

  /** Ends the turn early once every connected guesser has solved the word. */
  function maybeAllGuessed(s: DDState, ctx: EngineContext): OutboundMessage[] {
    if (s.phase !== "drawing") return [];
    const waiting = active(s).filter((p) => p.id !== s.turn.drawerId && p.connected && !hasGuessed(s, p.id));
    if (waiting.length === 0 && s.turn.guesses.length > 0) return endTurn(s, "all-guessed", ctx);
    return [];
  }

  function textHintAt(s: DDState): number | null {
    const t = s.turn;
    if (!s.config.hints || !t.word?.hint || t.textHintShown || t.drawStartedAt === null) return null;
    return t.drawStartedAt + s.config.drawSeconds * 1000 * TEXT_HINT_AT;
  }

  function nextDeadline(s: DDState): number | null {
    switch (s.phase) {
      case "finished":
        return null;
      case "choosing":
      case "reveal":
        return s.phaseEndsAt;
      case "drawing": {
        const t = s.turn;
        const drawer = drawerOf(s);
        const candidates = [t.drawEndsAt ?? Infinity, t.revealAt[0] ?? Infinity, textHintAt(s) ?? Infinity];
        if (!drawer.connected && drawer.disconnectedAt !== null) candidates.push(drawer.disconnectedAt + DRAWER_DISCONNECT_GRACE_MS);
        const d = Math.min(...candidates);
        return Number.isFinite(d) ? d : null;
      }
    }
  }

  function success(s: DDState, messages: OutboundMessage[], stateChanged = true): EngineSuccess<DDState> {
    return { ok: true, state: s, stateChanged, messages };
  }

  const engine: GameEngine<DDState, DoodleConfig, DoodleAction, DoodleView> = {
    id: "doodle-duel",
    minPlayers: 2,
    maxPlayers: 8,
    configSchema: doodleConfigSchema,
    defaultConfig: () => doodleConfigSchema.parse({}),
    actionSchema: doodleActionSchema,
    actionTypes: ["doodle:select-word", "doodle:stroke", "doodle:undo", "doodle:clear", "doodle:guess"],
    requiresVersion: () => false,

    create(players, config, ctx) {
      if (players.length < 2 || players.length > 8) throw new Error("Doodle Duel needs 2–8 players");
      const s: DDState = {
        config,
        players: players.map((p) => ({ ...p, score: 0, connected: true, disconnectedAt: null, left: false })),
        order: shuffle(players.map((p) => p.id), ctx.rng),
        orderIndex: 0,
        phase: "choosing",
        phaseEndsAt: null,
        turn: emptyTurn(0, 1, players[0]!.id),
        usedWords: [],
        chatSeq: 0,
        endReason: null,
        endedAt: null,
        startedAt: ctx.now,
      };
      return success(s, startTurn(s, ctx, 1, 1));
    },

    handleAction(s, playerId, action, ctx): EngineResult<DDState> {
      if (s.phase === "finished") return fail("GAME_NOT_ACTIVE", "The game has ended");
      const player = s.players.find((p) => p.id === playerId && !p.left);
      if (!player) return fail("NOT_IN_ROOM", "You are not playing in this match");
      const t = s.turn;
      const isDrawer = t.drawerId === playerId;

      switch (action.type) {
        case "doodle:select-word": {
          if (!isDrawer) return fail("NOT_YOUR_TURN", "Only the drawer picks the word");
          if (s.phase !== "choosing") return fail("INVALID_MOVE", "The word has already been chosen");
          const word = t.options[action.index];
          if (!word) return fail("INVALID_MOVE", "Invalid word choice");
          return success(s, beginDrawing(s, word, ctx));
        }

        case "doodle:stroke": {
          if (!isDrawer) return fail("NOT_YOUR_TURN", "Only the drawer can draw");
          if (s.phase !== "drawing") return fail("INVALID_MOVE", "You can't draw right now");
          let stroke: Stroke | undefined;
          for (let i = t.strokes.length - 1; i >= 0; i--) {
            if (t.strokes[i]!.id === action.strokeId) {
              stroke = t.strokes[i];
              break;
            }
          }
          if (stroke && stroke.chunks[action.seq]) return success(s, [], false); // duplicate chunk
          if (!stroke && t.strokes.length >= MAX_STROKES_PER_TURN) return fail("INVALID_MOVE", "The canvas is full — clear or undo to keep drawing");
          if (t.pointCount + action.points.length > MAX_POINTS_PER_TURN) return fail("INVALID_MOVE", "The canvas is full — clear or undo to keep drawing");
          if (!stroke) {
            stroke = { id: action.strokeId, tool: action.tool, color: action.color, size: action.size, chunks: {} };
            t.strokes.push(stroke);
          }
          stroke.chunks[action.seq] = action.points;
          t.pointCount += action.points.length;
          // Tool, colour and size always come from the stroke's first chunk.
          const relay = { turn: t.number, strokeId: stroke.id, seq: action.seq, tool: stroke.tool, color: stroke.color, size: stroke.size, points: action.points };
          return success(s, [{ to: toExcept(playerId), event: "doodle:stroke", payload: relay }], false);
        }

        case "doodle:undo": {
          if (!isDrawer) return fail("NOT_YOUR_TURN", "Only the drawer can undo");
          if (s.phase !== "drawing") return fail("INVALID_MOVE", "You can't draw right now");
          const removed = t.strokes.pop();
          if (!removed) return success(s, [], false);
          t.pointCount -= Object.values(removed.chunks).reduce((n, c) => n + c.length, 0);
          return success(s, [{ to: toExcept(playerId), event: "doodle:undo", payload: { turn: t.number, strokeId: removed.id } }], false);
        }

        case "doodle:clear": {
          if (!isDrawer) return fail("NOT_YOUR_TURN", "Only the drawer can clear the canvas");
          if (s.phase !== "drawing") return fail("INVALID_MOVE", "You can't draw right now");
          t.strokes = [];
          t.pointCount = 0;
          return success(s, [{ to: toExcept(playerId), event: "doodle:clear", payload: { turn: t.number } }], false);
        }

        case "doodle:guess": {
          const text = action.text
            .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯]/g, "")
            .trim()
            .slice(0, MAX_GUESS_LENGTH);
          const normalized = normalizeGuess(text);
          if (!normalized) return success(s, [], false); // empty submissions are ignored

          const chat = (kind: "chat" | "guessed-chat"): DoodleChatMessage => ({ kind, id: nextChatId(s), playerId, name: player.name, text });

          // Outside of drawing nothing is secret, so messages are ordinary chat.
          if (s.phase !== "drawing" || !t.word) return success(s, [{ to: toAll, event: "doodle:guess", payload: chat("chat") }], false);
          if (isDrawer) return fail("INVALID_MOVE", "You're drawing — no hints in the chat!");

          if (hasGuessed(s, playerId)) {
            // Players who know the word may only talk to others who know it.
            const insiders = [t.drawerId, ...t.guesses.map((g) => g.playerId)];
            return success(s, [{ to: toOnly(...insiders), event: "doodle:guess", payload: chat("guessed-chat") }], false);
          }

          if (t.lastGuess[playerId] === normalized) return fail("INVALID_MOVE", "You already tried that");
          t.lastGuess[playerId] = normalized;

          const verdict = classifyGuess(text, t.word, s.config.typoTolerance);
          if (verdict === "correct") {
            const duration = s.config.drawSeconds * 1000;
            const remaining = ((t.drawEndsAt ?? ctx.now) - ctx.now) / duration;
            const first = t.guesses.length === 0;
            const points = guesserPoints(remaining, first, scoring);
            t.guesses.push({ playerId, at: ctx.now, points });
            player.score += points;
            const messages: OutboundMessage[] = [
              { to: toAll, event: "doodle:guess", payload: { kind: "correct", id: nextChatId(s), playerId, name: player.name, points, first } satisfies DoodleChatMessage },
            ];
            messages.push(...maybeAllGuessed(s, ctx));
            return success(s, messages);
          }
          if (verdict === "close") {
            return success(s, [{ to: toOnly(playerId), event: "doodle:guess", payload: { kind: "close", id: nextChatId(s), text } satisfies DoodleChatMessage }], false);
          }
          return success(s, [{ to: toAll, event: "doodle:guess", payload: chat("chat") }], false);
        }
      }
    },

    tick(s, ctx) {
      const messages: OutboundMessage[] = [];
      let changed = false;
      // Several deadlines can be due at once (e.g. after a long event-loop stall).
      for (let guard = 0; guard < 32; guard++) {
        const deadline = nextDeadline(s);
        if (deadline === null || ctx.now < deadline) break;
        changed = true;
        const t = s.turn;
        if (s.phase === "choosing") {
          messages.push(...beginDrawing(s, t.options[ctx.rng.int(t.options.length)]!, ctx));
        } else if (s.phase === "reveal") {
          messages.push(...advance(s, ctx));
        } else if (s.phase === "drawing") {
          const drawer = drawerOf(s);
          if (!drawer.connected && drawer.disconnectedAt !== null && ctx.now >= drawer.disconnectedAt + DRAWER_DISCONNECT_GRACE_MS) {
            messages.push(...endTurn(s, "drawer-left", ctx));
          } else if (ctx.now >= (t.drawEndsAt ?? 0)) {
            messages.push(...endTurn(s, "time", ctx));
          } else if (t.revealAt.length && ctx.now >= t.revealAt[0]!) {
            t.revealAt.shift();
            const idx = pickRevealIndex(t.word!.text, t.revealed, ctx.rng);
            if (idx !== null) {
              t.revealed.push(idx);
              messages.push({ to: toAll, event: "doodle:hint", payload: { turn: t.number, kind: "letter" } });
            }
          } else {
            t.textHintShown = true;
            messages.push({ to: toAll, event: "doodle:hint", payload: { turn: t.number, kind: "text" } });
          }
        }
      }
      return success(s, messages, changed);
    },

    nextDeadline,

    viewFor(s, viewerId): DoodleView {
      const t = s.turn;
      const me = s.players.find((p) => p.id === viewerId && !p.left);
      const isDrawer = !!me && t.drawerId === me.id;
      const guessed = !!me && hasGuessed(s, me.id);
      const turnOver = s.phase === "reveal" || s.phase === "finished";
      const showWord = !!t.word && (isDrawer || guessed || turnOver);
      return {
        phase: s.phase,
        round: t.round,
        totalRounds: s.config.rounds,
        turnNumber: t.number,
        drawerId: t.drawerId,
        phaseEndsAt: s.phaseEndsAt,
        drawStartedAt: t.drawStartedAt,
        drawEndsAt: t.drawEndsAt,
        players: s.players.map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          score: p.score,
          connected: p.connected,
          left: p.left,
          guessed: hasGuessed(s, p.id),
        })),
        mask: s.phase === "drawing" && t.word ? maskWord(t.word.text, t.revealed) : null,
        category: s.config.hints && t.word && s.phase !== "choosing" ? WORD_CATEGORIES[t.word.category] : null,
        textHint: s.phase === "drawing" && t.textHintShown && t.word?.hint ? t.word.hint : null,
        word: showWord ? t.word!.text : null,
        wordOptions:
          isDrawer && s.phase === "choosing"
            ? t.options.map((w) => ({ text: w.text, category: WORD_CATEGORIES[w.category], difficulty: w.difficulty }))
            : null,
        lastTurn:
          turnOver && t.word && t.endReason
            ? { word: t.word.text, drawerId: t.drawerId, reason: t.endReason, points: t.turnPoints }
            : null,
        you: me ? { id: me.id, isDrawer, hasGuessed: guessed } : null,
        config: s.config,
      };
    },

    syncMessages(s, playerId) {
      if (s.phase !== "drawing" && s.phase !== "reveal") return [];
      const strokes: StrokeSnapshot[] = s.turn.strokes.map(snapshotStroke);
      return [{ to: toOnly(playerId), event: "doodle:canvas", payload: { turn: s.turn.number, strokes } }];
    },

    setConnected(s, playerId, connected, ctx) {
      const p = s.players.find((x) => x.id === playerId);
      if (!p) return success(s, [], false);
      p.connected = connected;
      p.disconnectedAt = connected ? null : ctx.now;
      return success(s, connected ? [] : maybeAllGuessed(s, ctx));
    },

    removePlayer(s, playerId, ctx) {
      const p = s.players.find((x) => x.id === playerId);
      if (!p || p.left || s.phase === "finished") return success(s, [], false);
      p.left = true;
      p.connected = false;
      const messages: OutboundMessage[] = [
        { to: toAll, event: "doodle:guess", payload: { kind: "system", id: nextChatId(s), text: `${p.name} left the game` } satisfies DoodleChatMessage },
      ];
      if (active(s).length < 2) {
        finish(s, "players-left", ctx);
        return success(s, messages);
      }
      if (s.turn.drawerId === playerId) {
        if (s.phase === "choosing") messages.push(...advance(s, ctx));
        else if (s.phase === "drawing") messages.push(...endTurn(s, "drawer-left", ctx));
      } else {
        messages.push(...maybeAllGuessed(s, ctx));
      }
      return success(s, messages);
    },

    isFinished: (s) => s.phase === "finished",

    results(s): MatchResults {
      const ranked = [...s.players].sort((a, b) => Number(a.left) - Number(b.left) || b.score - a.score);
      let placement = 0;
      let lastScore: number | null = null;
      let lastLeft: boolean | null = null;
      return {
        gameId: "doodle-duel",
        endedAt: s.endedAt ?? Date.now(),
        reason: s.endReason ?? "aborted",
        entries: ranked.map((p, i) => {
          // Ties share a placement (standard competition ranking).
          if (p.score !== lastScore || p.left !== lastLeft) placement = i + 1;
          lastScore = p.score;
          lastLeft = p.left;
          return {
            playerId: p.id,
            name: p.name,
            color: p.color,
            placement,
            score: p.score,
            isWinner: placement === 1 && !p.left && p.score > 0,
            details: {},
          };
        }),
      };
    },
  };
  return engine;
}

export const doodleDuelEngine = createDoodleEngine();
