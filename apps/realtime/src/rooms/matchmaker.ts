import { randomUUID } from "node:crypto";
import type { Socket } from "socket.io";
import { MULTIPLAYER_GAME_IDS, type Ack, type MultiplayerGameId, type MatchStatusPayload } from "@platform/shared";
import { getEngine } from "@platform/engines";
import type { PlayerInfo } from "./room";
import { err } from "./room";
import type { RoomManager } from "./room-manager";

interface QueueEntry {
  player: PlayerInfo;
  socket: Socket;
  since: number;
}

/** Preferred match sizes; matches start smaller if players have waited long enough. */
const TARGET_SIZE: Record<MultiplayerGameId, number> = { "color-clash": 4, "doodle-duel": 6, "token-trail": 4, "bumper-blitz": 6 };

/**
 * Public matchmaking. A searching player is first placed into an open public
 * lobby for that game if one exists; otherwise they wait in a per-game queue.
 * The queue forms a room as soon as the target size is reached, or with at
 * least the minimum player count once the oldest entry has waited `waitMs`.
 */
export class Matchmaker {
  private readonly queues = new Map<MultiplayerGameId, QueueEntry[]>(MULTIPLAYER_GAME_IDS.map((g) => [g, []]));
  private readonly timer: NodeJS.Timeout;

  constructor(
    private readonly manager: RoomManager,
    private readonly waitMs: number,
    private readonly now: () => number,
  ) {
    this.timer = setInterval(() => MULTIPLAYER_GAME_IDS.forEach((g) => this.tryMatch(g)), 1_000);
    this.timer.unref();
  }

  private status(socket: Socket, payload: MatchStatusPayload) {
    socket.emit("match:status", { id: randomUUID(), roomId: null, seq: 0, ts: this.now(), payload });
  }

  queuedGame(playerId: string): MultiplayerGameId | null {
    for (const [g, q] of this.queues) if (q.some((e) => e.player.id === playerId)) return g;
    return null;
  }

  enqueue(player: PlayerInfo, socket: Socket, gameId: MultiplayerGameId): Ack {
    if (this.queuedGame(player.id)) return err("ALREADY_QUEUED", "You're already searching for a match");
    const current = this.manager.roomOf(player.id);
    if (current?.status === "playing") return err("ALREADY_IN_ROOM", "Finish or leave your current game first");

    for (const room of this.manager.openPublicRooms(gameId)) {
      const ack = this.manager.join(room, player, socket);
      if (ack.ok) {
        this.status(socket, { state: "matched", gameId, roomCode: room.code });
        return { ok: true, data: { roomCode: room.code } };
      }
    }
    const q = this.queues.get(gameId)!;
    q.push({ player, socket, since: this.now() });
    this.broadcastQueue(gameId);
    this.tryMatch(gameId);
    return { ok: true };
  }

  cancel(playerId: string, notify = true): Ack {
    for (const [g, q] of this.queues) {
      const i = q.findIndex((e) => e.player.id === playerId);
      if (i >= 0) {
        const [entry] = q.splice(i, 1);
        if (notify) this.status(entry!.socket, { state: "idle" });
        this.broadcastQueue(g);
      }
    }
    return { ok: true };
  }

  /** Drops a disconnected socket from any queue (another tab may still be searching). */
  dropSocket(socketId: string) {
    for (const [g, q] of this.queues) {
      const before = q.length;
      this.queues.set(g, q.filter((e) => e.socket.id !== socketId));
      if (this.queues.get(g)!.length !== before) this.broadcastQueue(g);
    }
  }

  private broadcastQueue(gameId: MultiplayerGameId) {
    const q = this.queues.get(gameId)!;
    for (const e of q) this.status(e.socket, { state: "searching", gameId, queued: q.length, since: e.since });
  }

  tryMatch(gameId: MultiplayerGameId) {
    const q = this.queues.get(gameId)!;
    const engine = getEngine(gameId);
    const target = Math.min(TARGET_SIZE[gameId], engine.maxPlayers);
    while (q.length >= engine.minPlayers) {
      const waitedLongEnough = this.now() - q[0]!.since >= this.waitMs;
      if (q.length < target && !waitedLongEnough) return;
      const group = q.splice(0, Math.min(target, q.length));
      const room = this.manager.create(group[0]!.player, gameId, "public", undefined);
      if (!("code" in room)) {
        q.unshift(...group);
        return;
      }
      for (const e of group) {
        const ack = this.manager.join(room, e.player, e.socket);
        if (ack.ok) this.status(e.socket, { state: "matched", gameId, roomCode: room.code });
        else this.status(e.socket, { state: "idle" });
      }
    }
  }

  metrics() {
    return Object.fromEntries([...this.queues].map(([g, q]) => [g, q.length]));
  }

  stop() {
    clearInterval(this.timer);
  }
}
