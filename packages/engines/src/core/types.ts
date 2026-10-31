import type { z } from "zod";
import type { ErrorCode, GameId, MatchResults } from "@platform/shared";
import type { Rng } from "./rng";

/**
 * The common game integration contract. Every game's server-side engine
 * implements GameEngine; the realtime server is game-agnostic and only talks to
 * engines through this interface.
 *
 * Engines are synchronous and transport-free: they receive the current time and
 * an RNG, and return the messages to deliver. The room layer handles sockets,
 * timers, serialization of actions and persistence.
 *
 * Engines may mutate `state` in place, but MUST validate an action completely
 * before mutating anything, so a rejected action leaves state untouched.
 */

export interface PlayerRef {
  id: string;
  name: string;
  color: string;
}

export interface EngineContext {
  now: number;
  rng: Rng;
}

export type Audience = { kind: "all" } | { kind: "only"; ids: string[] } | { kind: "except"; ids: string[] };

export const toAll: Audience = { kind: "all" };
export const toOnly = (...ids: string[]): Audience => ({ kind: "only", ids });
export const toExcept = (...ids: string[]): Audience => ({ kind: "except", ids });

export interface OutboundMessage {
  to: Audience;
  /** A ServerEventName (kept as string so engines stay decoupled from Socket.IO typings). */
  event: string;
  payload: unknown;
}

export interface EngineSuccess<S> {
  ok: true;
  state: S;
  /** When true the room layer sends every player their fresh `game:state` view. */
  stateChanged: boolean;
  messages: OutboundMessage[];
}

export interface EngineFailure {
  ok: false;
  code: ErrorCode;
  message: string;
}

export type EngineResult<S> = EngineSuccess<S> | EngineFailure;

export const fail = (code: ErrorCode, message: string): EngineFailure => ({ ok: false, code, message });

export interface GameEngine<S, C, A extends { type: string }, V = unknown> {
  readonly id: GameId;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  /** Lobby-configurable settings. Partial input is merged with defaults. */
  readonly configSchema: z.ZodType<C>;
  defaultConfig(): C;
  /** Action payload schema; `type` equals the socket event name (e.g. "card:play"). */
  readonly actionSchema: z.ZodType<A>;
  readonly actionTypes: readonly A["type"][];
  /** Whether actions must carry the state version they were based on (turn-based games). */
  requiresVersion(type: A["type"]): boolean;

  create(players: PlayerRef[], config: C, ctx: EngineContext): EngineSuccess<S>;
  handleAction(state: S, playerId: string, action: A, ctx: EngineContext): EngineResult<S>;
  /** Called by the room layer when `now >= nextDeadline(state)`. */
  tick(state: S, ctx: EngineContext): EngineSuccess<S>;
  nextDeadline(state: S): number | null;
  /** Per-player projection of state. Must never include other players' private data. */
  viewFor(state: S, playerId: string): V;
  /** Extra messages to send a player who (re)joins mid-game, e.g. the current canvas. */
  syncMessages(state: S, playerId: string): OutboundMessage[];
  setConnected(state: S, playerId: string, connected: boolean, ctx: EngineContext): EngineSuccess<S>;
  /** The player left permanently (or their reconnect grace period expired). */
  removePlayer(state: S, playerId: string, ctx: EngineContext): EngineSuccess<S>;
  isFinished(state: S): boolean;
  results(state: S): MatchResults;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameEngine = GameEngine<any, any, { type: string }, unknown>;
