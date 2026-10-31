import { z } from "zod";
import { GAME_IDS, type GameId } from "../games/registry";

/**
 * Wire protocol shared by the web client and the realtime server.
 *
 * Every client → server message is an envelope `{ id, roomId?, v?, payload }`
 * sent with a Socket.IO acknowledgement callback. `id` is a client-generated
 * action id used for idempotency; `v` is the game-state version the client
 * acted on (turn-based games reject stale actions).
 *
 * Every server → client message is an envelope `{ id, roomId, seq, ts, payload }`.
 * `seq` increments per recipient connection so clients can detect gaps and
 * request a resync; `ts` is the server clock, used to align countdowns.
 */

// Excludes visually ambiguous characters (I, L, O, 0, 1).
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJKMNP-Z2-9]{6}$/, "Invalid room code");

export const gameIdSchema = z.enum(GAME_IDS);

export const ERROR_CODES = [
  "UNAUTHORIZED",
  "BANNED",
  "INVALID_PAYLOAD",
  "RATE_LIMITED",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "ROOM_IN_PROGRESS",
  "NOT_IN_ROOM",
  "ALREADY_IN_ROOM",
  "NOT_HOST",
  "NOT_ENOUGH_PLAYERS",
  "PLAYERS_NOT_READY",
  "GAME_NOT_ACTIVE",
  "NOT_YOUR_TURN",
  "INVALID_MOVE",
  "STALE_STATE",
  "ALREADY_QUEUED",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ProtocolError {
  code: ErrorCode;
  message: string;
}

export type Ack<T = unknown> = { ok: true; data?: T } | { ok: false; error: ProtocolError };

export const clientEnvelopeSchema = z.object({
  id: z.string().min(8).max(64),
  roomId: z.string().max(16).optional(),
  v: z.number().int().nonnegative().optional(),
  payload: z.unknown(),
});
export type ClientEnvelope<P = unknown> = { id: string; roomId?: string; v?: number; payload: P };

export interface ServerEnvelope<P = unknown> {
  id: string;
  roomId: string | null;
  seq: number;
  ts: number;
  payload: P;
}

// ---------------------------------------------------------------------------
// Room payloads
// ---------------------------------------------------------------------------

export const roomVisibilitySchema = z.enum(["private", "public"]);
export type RoomVisibility = z.infer<typeof roomVisibilitySchema>;

export const roomCreatePayload = z.object({
  gameId: gameIdSchema,
  visibility: roomVisibilitySchema.default("private"),
  /** Game-specific lobby config; validated by the game's engine. */
  config: z.record(z.string(), z.unknown()).optional(),
});
export const roomJoinPayload = z.object({ code: roomCodeSchema });
export const roomReadyPayload = z.object({ ready: z.boolean() });
export const roomConfigurePayload = z.object({ config: z.record(z.string(), z.unknown()) });
export const roomKickPayload = z.object({ playerId: z.string().min(1).max(64) });
export const emptyPayload = z.object({}).passthrough().optional();
export const matchQueuePayload = z.object({ gameId: gameIdSchema });

export type RoomStatus = "lobby" | "playing" | "finished";

export interface RoomPlayerInfo {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  /** Epoch ms when the player's reconnect grace period ends, if disconnected. */
  disconnectedUntil: number | null;
}

export interface RoomSnapshot {
  code: string;
  gameId: GameId;
  visibility: RoomVisibility;
  status: RoomStatus;
  hostId: string;
  players: RoomPlayerInfo[];
  minPlayers: number;
  maxPlayers: number;
  config: Record<string, unknown>;
  matchNumber: number;
  /** Public rooms auto-start when everyone is ready; epoch ms or null. */
  autoStartAt: number | null;
  /** Results of the most recent finished match, if any. */
  lastResults: MatchResults | null;
}

export interface MatchResultEntry {
  playerId: string;
  name: string;
  color: string;
  placement: number;
  score: number;
  isWinner: boolean;
  /** Game-specific extra stats shown on the results screen. */
  details?: Record<string, number | string>;
}

export interface MatchResults {
  gameId: GameId;
  endedAt: number;
  reason: "completed" | "players-left" | "aborted";
  entries: MatchResultEntry[];
}

export interface GameStatePayload<V = unknown> {
  version: number;
  view: V;
}

export interface MatchStatusPayload {
  state: "idle" | "searching" | "matched";
  gameId?: GameId;
  queued?: number;
  since?: number;
  roomCode?: string;
}

export interface RoomNoticePayload {
  kind: "info" | "warning" | "error";
  message: string;
}

export interface SessionReadyPayload {
  playerId: string;
  name: string;
  color: string;
  roomCode: string | null;
}

// ---------------------------------------------------------------------------
// Socket.IO event maps
// ---------------------------------------------------------------------------

type ClientHandler = (envelope: ClientEnvelope, ack: (response: Ack) => void) => void;
type ServerHandler<P> = (envelope: ServerEnvelope<P>) => void;

/** Events every game shares. Game-specific action events are listed in GAME_ACTION_EVENTS. */
export const ROOM_EVENTS = [
  "room:create",
  "room:join",
  "room:leave",
  "room:ready",
  "room:configure",
  "room:kick",
  "room:sync",
  "game:start",
  "match:queue",
  "match:cancel",
] as const;

export const GAME_ACTION_EVENTS = [
  "card:play",
  "card:draw",
  "card:pass",
  "doodle:select-word",
  "doodle:stroke",
  "doodle:undo",
  "doodle:clear",
  "doodle:guess",
] as const;
export type GameActionEvent = (typeof GAME_ACTION_EVENTS)[number];

export type ClientToServerEvents = {
  [K in (typeof ROOM_EVENTS)[number] | GameActionEvent]: ClientHandler;
};

export interface ServerToClientEvents {
  "session:ready": ServerHandler<SessionReadyPayload>;
  "session:replaced": ServerHandler<{ message: string }>;
  "room:state": ServerHandler<RoomSnapshot>;
  "room:closed": ServerHandler<{ reason: string }>;
  "room:notice": ServerHandler<RoomNoticePayload>;
  "game:state": ServerHandler<GameStatePayload>;
  "game:action": ServerHandler<unknown>;
  "game:ended": ServerHandler<MatchResults>;
  "game:reconnected": ServerHandler<{ version: number }>;
  "match:status": ServerHandler<MatchStatusPayload>;
  "doodle:word-options": ServerHandler<unknown>;
  "doodle:stroke": ServerHandler<unknown>;
  "doodle:undo": ServerHandler<unknown>;
  "doodle:clear": ServerHandler<unknown>;
  "doodle:canvas": ServerHandler<unknown>;
  "doodle:guess": ServerHandler<unknown>;
  "doodle:hint": ServerHandler<unknown>;
  "doodle:round-ended": ServerHandler<unknown>;
}
export type ServerEventName = keyof ServerToClientEvents;

/** Reasons the server gives when closing a room, mapped to friendly copy client-side. */
export const ROOM_CLOSE_REASONS = {
  expired: "This room expired after being inactive.",
  empty: "Everyone left the room.",
  moderated: "This room was closed by a moderator.",
  kicked: "You were removed from the room by the host.",
  left: "You left the room.",
  shutdown: "The game server restarted.",
} as const;
export type RoomCloseReason = keyof typeof ROOM_CLOSE_REASONS;
