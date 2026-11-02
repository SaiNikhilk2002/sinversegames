import { z } from "zod";
import type { MatchResults } from "@platform/shared";
import {
  fail,
  toAll,
  type EngineContext,
  type EngineResult,
  type EngineSuccess,
  type GameEngine,
  type OutboundMessage,
  type PlayerRef,
} from "../core/types";

/**
 * Token Trail: a race-home dice board game (traditional cross-and-circle rules).
 *
 * Board model: a shared loop of TRACK_LENGTH squares. Each seat starts at
 * `seat * 13` and a token's `progress` counts steps from its own start:
 *   -1          in base
 *   0 … 50      on the shared track (absolute square = (start + progress) % 52)
 *   51 … 55     in the seat's private home lane
 *   56          home (finished)
 * Every roll comes from the server's RNG; clients only ask to roll and choose a token.
 */

export const TRACK_LENGTH = 52;
export const LAST_TRACK_STEP = 50;
export const HOME = 56;
export const SEATS = 4;
/** Start squares and the square eight steps after each are safe "stars". */
export const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const DISCONNECTED_TURN_MS = 5_000;
const ROLL_PAUSE_MS = 700;

export const tokenTrailConfigSchema = z.object({
  /** Tokens each player must bring home. 1–2 make for a quick race. */
  tokensPerPlayer: z.number().int().min(1).max(4).default(4),
  /** Seconds per decision (roll or move). 0 disables the timer; disconnected players are still auto-played. */
  turnSeconds: z.union([z.literal(0), z.number().int().min(5).max(60)]).default(20),
});
export type TokenTrailConfig = z.infer<typeof tokenTrailConfigSchema>;

export const tokenTrailActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("trail:roll") }),
  z.object({ type: z.literal("trail:move"), token: z.number().int().min(0).max(3) }),
]);
export type TokenTrailAction = z.infer<typeof tokenTrailActionSchema>;

export interface TTPlayer extends PlayerRef {
  /** Board seat 0–3; with two players seats 0 and 2 face each other. */
  seat: number;
  tokens: number[];
  connected: boolean;
  left: boolean;
  captures: number;
  timeouts: number;
  finishedAt: number | null;
}

export type TTEvent =
  | { kind: "roll"; playerId: string; value: number }
  | { kind: "move"; playerId: string; token: number; from: number; to: number; captured: { playerId: string; token: number }[] }
  | { kind: "no-move"; playerId: string }
  | { kind: "three-sixes"; playerId: string }
  | { kind: "timeout"; playerId: string }
  | { kind: "left"; playerId: string }
  | { kind: "win"; playerId: string };

export interface TTState {
  config: TokenTrailConfig;
  players: TTPlayer[];
  current: number;
  phase: "roll" | "move";
  roll: number | null;
  sixesInRow: number;
  phaseStartedAt: number;
  turnNumber: number;
  status: "playing" | "finished";
  winnerId: string | null;
  endReason: MatchResults["reason"] | null;
  endedAt: number | null;
  startedAt: number;
  lastEvents: TTEvent[];
}

export interface TTView {
  status: TTState["status"];
  players: { id: string; name: string; color: string; seat: number; tokens: number[]; connected: boolean; left: boolean; captures: number }[];
  currentPlayerId: string;
  phase: TTState["phase"];
  roll: number | null;
  movable: number[];
  deadline: number | null;
  turnNumber: number;
  winnerId: string | null;
  lastEvents: TTEvent[];
  config: TokenTrailConfig;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export const absoluteSquare = (seat: number, progress: number): number | null =>
  progress < 0 || progress > LAST_TRACK_STEP ? null : (seat * 13 + progress) % TRACK_LENGTH;

/** Where a token would land with `roll`, or null if the move is illegal. */
export function targetProgress(progress: number, roll: number): number | null {
  if (progress === HOME) return null;
  if (progress < 0) return roll === 6 ? 0 : null;
  const to = progress + roll;
  return to > HOME ? null : to;
}

export function movableTokens(p: TTPlayer, roll: number): number[] {
  return p.tokens.flatMap((t, i) => (targetProgress(t, roll) === null ? [] : [i]));
}

const active = (s: TTState) => s.players.filter((p) => !p.left);
const tokensHome = (p: TTPlayer) => p.tokens.filter((t) => t === HOME).length;
const totalProgress = (p: TTPlayer) => p.tokens.reduce((n, t) => n + Math.max(0, t + 1), 0);

function nextSeatIndex(s: TTState, from: number): number {
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (!s.players[idx]!.left) return idx;
  }
  return from;
}

function deadline(s: TTState): number | null {
  if (s.status !== "playing") return null;
  const p = s.players[s.current]!;
  if (!p.connected) return s.phaseStartedAt + DISCONNECTED_TURN_MS;
  return s.config.turnSeconds === 0 ? null : s.phaseStartedAt + s.config.turnSeconds * 1000;
}

function beginTurn(s: TTState, index: number, now: number) {
  s.current = index;
  s.phase = "roll";
  s.roll = null;
  s.sixesInRow = 0;
  s.phaseStartedAt = now;
  s.turnNumber++;
}

function endTurnOrRollAgain(s: TTState, bonus: boolean, now: number) {
  if (s.status !== "playing") return;
  if (bonus) {
    s.phase = "roll";
    s.roll = null;
    s.phaseStartedAt = now;
    return;
  }
  beginTurn(s, nextSeatIndex(s, s.current), now);
}

function finish(s: TTState, reason: MatchResults["reason"], winnerId: string | null, now: number) {
  s.status = "finished";
  s.endReason = reason;
  s.winnerId = winnerId;
  s.endedAt = now;
}

/** Moves a token (already validated) and applies captures, bonuses and the win check. */
function applyMove(s: TTState, player: TTPlayer, token: number, now: number, events: TTEvent[]) {
  const roll = s.roll!;
  const from = player.tokens[token]!;
  const to = targetProgress(from, roll)!;
  player.tokens[token] = to;
  const captured: { playerId: string; token: number }[] = [];
  const square = absoluteSquare(player.seat, to);
  if (square !== null && !SAFE_SQUARES.has(square)) {
    for (const other of s.players) {
      if (other.id === player.id || other.left) continue;
      other.tokens.forEach((t, i) => {
        if (absoluteSquare(other.seat, t) === square) {
          other.tokens[i] = -1;
          captured.push({ playerId: other.id, token: i });
        }
      });
    }
  }
  player.captures += captured.length;
  events.push({ kind: "move", playerId: player.id, token, from, to, captured });
  if (tokensHome(player) === player.tokens.length) {
    player.finishedAt = now;
    events.push({ kind: "win", playerId: player.id });
    finish(s, "completed", player.id, now);
    return;
  }
  endTurnOrRollAgain(s, roll === 6 || captured.length > 0 || to === HOME, now);
}

function doRoll(s: TTState, player: TTPlayer, ctx: EngineContext, events: TTEvent[]) {
  const value = ctx.rng.int(6) + 1;
  s.roll = value;
  events.push({ kind: "roll", playerId: player.id, value });
  s.sixesInRow = value === 6 ? s.sixesInRow + 1 : 0;
  if (s.sixesInRow === 3) {
    events.push({ kind: "three-sixes", playerId: player.id });
    beginTurn(s, nextSeatIndex(s, s.current), ctx.now);
    return;
  }
  const movable = movableTokens(player, value);
  if (movable.length === 0) {
    events.push({ kind: "no-move", playerId: player.id });
    // No legal move ends the turn even on a 6 (nothing can use the bonus).
    beginTurn(s, nextSeatIndex(s, s.current), ctx.now);
    return;
  }
  // A single option (or several tokens still in base) has only one real choice: play it automatically.
  const distinctTargets = new Set(movable.map((i) => player.tokens[i]));
  if (distinctTargets.size === 1) {
    applyMove(s, player, movable[0]!, ctx.now + ROLL_PAUSE_MS, events);
    return;
  }
  s.phase = "move";
  s.phaseStartedAt = ctx.now;
}

/** Heuristic for auto-play: capture > reach home > leave base > advance the furthest token. */
export function bestMove(s: TTState, player: TTPlayer): number {
  const roll = s.roll!;
  let best = -1;
  let bestScore = -Infinity;
  for (const i of movableTokens(player, roll)) {
    const from = player.tokens[i]!;
    const to = targetProgress(from, roll)!;
    const sq = absoluteSquare(player.seat, to);
    let score = to;
    if (to === HOME) score += 200;
    if (from < 0) score += 100;
    if (sq !== null && !SAFE_SQUARES.has(sq)) {
      const captures = s.players.some((o) => o.id !== player.id && !o.left && o.tokens.some((t) => absoluteSquare(o.seat, t) === sq));
      if (captures) score += 300;
    }
    if (sq !== null && SAFE_SQUARES.has(sq)) score += 20;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function seatsFor(count: number): number[] {
  if (count === 2) return [0, 2];
  return [0, 1, 2, 3].slice(0, count);
}

const ok = (state: TTState, events: TTEvent[], stateChanged = true): EngineSuccess<TTState> => {
  state.lastEvents = events.length ? events.slice(-6) : state.lastEvents;
  const messages: OutboundMessage[] = events.length ? [{ to: toAll, event: "game:action", payload: { events } }] : [];
  return { ok: true, state, stateChanged, messages };
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export const tokenTrailEngine: GameEngine<TTState, TokenTrailConfig, TokenTrailAction, TTView> = {
  id: "token-trail",
  minPlayers: 2,
  maxPlayers: 4,
  configSchema: tokenTrailConfigSchema,
  defaultConfig: () => tokenTrailConfigSchema.parse({}),
  actionSchema: tokenTrailActionSchema,
  actionTypes: ["trail:roll", "trail:move"],
  requiresVersion() {
    return true;
  },

  create(players, config, ctx) {
    const seats = seatsFor(players.length);
    const state: TTState = {
      config,
      players: players.map((p, i) => ({
        ...p,
        seat: seats[i]!,
        tokens: Array.from({ length: config.tokensPerPlayer }, () => -1),
        connected: true,
        left: false,
        captures: 0,
        timeouts: 0,
        finishedAt: null,
      })),
      current: ctx.rng.int(players.length),
      phase: "roll",
      roll: null,
      sixesInRow: 0,
      phaseStartedAt: ctx.now,
      turnNumber: 1,
      status: "playing",
      winnerId: null,
      endReason: null,
      endedAt: null,
      startedAt: ctx.now,
      lastEvents: [],
    };
    return ok(state, []);
  },

  handleAction(s, playerId, action, ctx): EngineResult<TTState> {
    if (s.status !== "playing") return fail("GAME_NOT_ACTIVE", "The game is over");
    const player = s.players[s.current]!;
    if (player.id !== playerId) return fail("NOT_YOUR_TURN", "It's not your turn");
    const events: TTEvent[] = [];
    player.timeouts = 0;
    if (action.type === "trail:roll") {
      if (s.phase !== "roll") return fail("INVALID_MOVE", "Choose a token to move first");
      doRoll(s, player, ctx, events);
      return ok(s, events);
    }
    if (s.phase !== "move" || s.roll === null) return fail("INVALID_MOVE", "Roll the die first");
    if (action.token >= player.tokens.length || targetProgress(player.tokens[action.token]!, s.roll) === null) {
      return fail("INVALID_MOVE", "That token can't move that far");
    }
    applyMove(s, player, action.token, ctx.now, events);
    return ok(s, events);
  },

  tick(s, ctx) {
    const due = deadline(s);
    if (s.status !== "playing" || due === null || ctx.now < due) return ok(s, [], false);
    const player = s.players[s.current]!;
    const events: TTEvent[] = [{ kind: "timeout", playerId: player.id }];
    player.timeouts++;
    if (s.phase === "roll") doRoll(s, player, ctx, events);
    else applyMove(s, player, bestMove(s, player), ctx.now, events);
    return ok(s, events);
  },

  nextDeadline: deadline,

  viewFor(s): TTView {
    const current = s.players[s.current]!;
    return {
      status: s.status,
      players: s.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        seat: p.seat,
        tokens: [...p.tokens],
        connected: p.connected,
        left: p.left,
        captures: p.captures,
      })),
      currentPlayerId: current.id,
      phase: s.phase,
      roll: s.roll,
      movable: s.phase === "move" && s.roll !== null ? movableTokens(current, s.roll) : [],
      deadline: deadline(s),
      turnNumber: s.turnNumber,
      winnerId: s.winnerId,
      lastEvents: s.lastEvents,
      config: s.config,
    };
  },

  syncMessages() {
    return [];
  },

  setConnected(s, playerId, connected, ctx) {
    const p = s.players.find((x) => x.id === playerId);
    if (!p) return ok(s, [], false);
    p.connected = connected;
    // Restart the clock so a reconnecting player gets their full turn back.
    if (s.players[s.current]?.id === playerId) s.phaseStartedAt = ctx.now;
    return ok(s, []);
  },

  removePlayer(s, playerId, ctx) {
    const p = s.players.find((x) => x.id === playerId);
    if (!p || p.left || s.status !== "playing") return ok(s, [], false);
    p.left = true;
    p.connected = false;
    const events: TTEvent[] = [{ kind: "left", playerId }];
    const remaining = active(s);
    if (remaining.length < 2) {
      finish(s, "players-left", remaining[0]?.id ?? null, ctx.now);
    } else if (s.players[s.current]!.id === playerId) {
      beginTurn(s, nextSeatIndex(s, s.current), ctx.now);
    }
    return ok(s, events);
  },

  isFinished: (s) => s.status === "finished",

  results(s): MatchResults {
    const ranked = [...s.players].sort((a, b) => {
      if (a.id === s.winnerId) return -1;
      if (b.id === s.winnerId) return 1;
      if (a.left !== b.left) return a.left ? 1 : -1;
      return totalProgress(b) - totalProgress(a) || b.captures - a.captures;
    });
    return {
      gameId: "token-trail",
      endedAt: s.endedAt ?? Date.now(),
      reason: s.endReason ?? "aborted",
      entries: ranked.map((p, i) => ({
        playerId: p.id,
        name: p.name,
        color: p.color,
        placement: i + 1,
        // Steps travelled plus a bonus per capture and for winning.
        score: totalProgress(p) + p.captures * 10 + (p.id === s.winnerId ? 50 : 0),
        isWinner: p.id === s.winnerId,
        details: { home: tokensHome(p), captures: p.captures },
      })),
    };
  },
};
