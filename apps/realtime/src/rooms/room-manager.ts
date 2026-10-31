import { randomInt } from "node:crypto";
import type { Socket } from "socket.io";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type Ack, type GameId, type RoomVisibility } from "@platform/shared";
import { getEngine, type Rng } from "@platform/engines";
import type { RealtimeConfig } from "../config";
import type { Logger } from "../logger";
import { errorFields } from "../logger";
import type { Persistence } from "../persistence";
import { err, Room, type PlayerInfo } from "./room";

export interface ManagerDeps {
  config: RealtimeConfig;
  logger: Logger;
  persistence: Persistence;
  rng: Rng;
  now: () => number;
}

/** Cryptographically random code from an unambiguous alphabet (31^6 ≈ 887M codes). */
export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

/**
 * Owns every room on this server instance and guarantees that a player belongs
 * to at most one room at a time.
 */
export class RoomManager {
  readonly rooms = new Map<string, Room>();
  /** playerId → room code. */
  private readonly playerRoom = new Map<string, string>();
  private readonly emptySince = new Map<string, number>();
  private sweepTimer: NodeJS.Timeout;
  matchesCompleted = 0;

  constructor(private readonly deps: ManagerDeps) {
    this.sweepTimer = setInterval(() => this.sweep(), 15_000);
    this.sweepTimer.unref();
  }

  roomOf(playerId: string): Room | undefined {
    const code = this.playerRoom.get(playerId);
    return code ? this.rooms.get(code) : undefined;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  create(host: PlayerInfo, gameId: GameId, visibility: RoomVisibility, configPatch: Record<string, unknown> | undefined): Room | Ack {
    if (this.rooms.size >= this.deps.config.MAX_ROOMS) return err("INTERNAL", "The server is at capacity — please try again shortly");
    const engine = getEngine(gameId);
    const parsed = engine.configSchema.safeParse({ ...engine.defaultConfig(), ...(configPatch ?? {}) });
    if (!parsed.success) return err("INVALID_PAYLOAD", "Invalid game settings");

    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const room = new Room(code, gameId, engine, visibility, host, parsed.data as Record<string, unknown>, {
      now: this.deps.now,
      rng: this.deps.rng,
      logger: this.deps.logger,
      reconnectGraceMs: this.deps.config.RECONNECT_GRACE_MS,
      onMatchEnded: (r, results, players, startedAt) => {
        this.matchesCompleted++;
        void this.deps.persistence
          .recordMatch({ results, roomCode: r.code, visibility: r.visibility, config: r.config, startedAt, players })
          .then((out) => {
            for (const [playerId, keys] of Object.entries(out?.unlocked ?? {})) {
              r.notice(playerId, "info", `Achievement unlocked: ${keys.length === 1 ? keys[0] : `${keys.length} new achievements`}!`);
            }
          })
          .catch((e) => this.deps.logger.error("persist match failed", errorFields(e)));
      },
      onEmpty: (r) => {
        if (r.members.size === 0) this.destroy(r, "empty");
        else this.emptySince.set(r.code, this.deps.now());
      },
      onMemberRemoved: (r, playerId) => {
        if (this.playerRoom.get(playerId) === r.code) this.playerRoom.delete(playerId);
      },
    });
    this.rooms.set(code, room);
    this.deps.logger.info("room created", { room: code, game: gameId, visibility });
    return room;
  }

  /** Joins `room`, leaving any other room the player is in first. */
  join(room: Room, player: PlayerInfo, socket: Socket): Ack {
    const current = this.roomOf(player.id);
    if (current && current !== room) {
      if (!room.has(player.id) && (room.status === "playing" || room.members.size >= room.engine.maxPlayers)) {
        // Check before leaving so a failed join doesn't cost the player their current seat.
        return room.join(player, socket);
      }
      current.remove(player.id, "left");
    }
    const ack = room.join(player, socket);
    if (ack.ok) {
      this.playerRoom.set(player.id, room.code);
      this.emptySince.delete(room.code);
    }
    return ack;
  }

  leave(playerId: string): Ack {
    const room = this.roomOf(playerId);
    if (!room) return { ok: true };
    room.remove(playerId, "left");
    return { ok: true };
  }

  disconnect(playerId: string, socket: Socket) {
    const code = socket.data.roomCode as string | null | undefined;
    if (!code) return;
    this.rooms.get(code)?.disconnect(playerId, socket.id);
  }

  destroy(room: Room, reason: "empty" | "expired" | "moderated" | "shutdown") {
    room.close(reason);
    this.rooms.delete(room.code);
    this.emptySince.delete(room.code);
    this.deps.logger.info("room closed", { room: room.code, reason });
  }

  /** Public lobbies with space, oldest first — used by matchmaking. */
  openPublicRooms(gameId: GameId): Room[] {
    return [...this.rooms.values()]
      .filter((r) => r.gameId === gameId && r.visibility === "public" && !r.closed && r.status !== "playing" && r.members.size < r.engine.maxPlayers && r.connectedCount > 0)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  sweep() {
    const now = this.deps.now();
    for (const room of [...this.rooms.values()]) {
      const empty = this.emptySince.get(room.code);
      if (room.members.size === 0 || (empty !== undefined && room.connectedCount === 0 && now - empty > this.deps.config.EMPTY_ROOM_TTL_MS)) {
        this.destroy(room, "empty");
      } else if (room.status !== "playing" && now - room.lastActivityAt > this.deps.config.ROOM_IDLE_MS) {
        this.destroy(room, "expired");
      }
    }
  }

  shutdown() {
    clearInterval(this.sweepTimer);
    for (const room of [...this.rooms.values()]) this.destroy(room, "shutdown");
  }

  metrics() {
    const rooms = [...this.rooms.values()];
    const byGame: Record<string, { rooms: number; playing: number; players: number }> = {};
    for (const r of rooms) {
      const g = (byGame[r.gameId] ??= { rooms: 0, playing: 0, players: 0 });
      g.rooms++;
      if (r.status === "playing") g.playing++;
      g.players += r.members.size;
    }
    return {
      rooms: rooms.length,
      playing: rooms.filter((r) => r.status === "playing").length,
      players: this.playerRoom.size,
      matchesCompleted: this.matchesCompleted,
      byGame,
      list: rooms.map((r) => r.metrics()).sort((a, b) => b.lastActivityAt - a.lastActivityAt).slice(0, 200),
    };
  }
}
