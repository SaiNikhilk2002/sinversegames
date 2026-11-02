import { randomUUID } from "node:crypto";
import type { Socket } from "socket.io";
import {
  getGame,
  type Ack,
  type ClientEnvelope,
  type MultiplayerGameId,
  type MatchResults,
  type ProtocolError,
  type RoomCloseReason,
  type RoomSnapshot,
  type RoomVisibility,
  type ServerEventName,
} from "@platform/shared";
import type { AnyGameEngine, EngineResult, OutboundMessage, Rng } from "@platform/engines";
import type { Logger } from "../logger";
import { errorFields } from "../logger";

export interface PlayerInfo {
  id: string;
  name: string;
  color: string;
}

interface Member extends PlayerInfo {
  ready: boolean;
  socket: Socket | null;
  disconnectedAt: number | null;
  graceTimer: NodeJS.Timeout | null;
  /** Per-connection outbound sequence number. */
  seq: number;
  /** Recent client action ids → ack, for idempotent retries. */
  recentActions: Map<string, Ack>;
}

export interface RoomDeps {
  now: () => number;
  rng: Rng;
  logger: Logger;
  reconnectGraceMs: number;
  /** Called (asynchronously persisted) when a match ends. */
  onMatchEnded: (room: Room, results: MatchResults, players: PlayerInfo[], startedAt: number) => void;
  /** Called whenever the room loses its last member. */
  onEmpty: (room: Room) => void;
  /** Called when a player is no longer a member (left, kicked, timed out). */
  onMemberRemoved: (room: Room, playerId: string) => void;
}

const RECENT_ACTIONS = 64;
const PUBLIC_AUTOSTART_MS = 5_000;

export const err = (code: ProtocolError["code"], message: string): Ack => ({ ok: false, error: { code, message } });
const OK: Ack = { ok: true };

/**
 * A room owns its members, lobby settings and — while a match is running — the
 * authoritative game state. Node's event loop runs each handler to completion,
 * so all actions for a room are processed strictly one at a time: two players
 * acting "simultaneously" are simply applied in arrival order, and the second
 * is validated against the state produced by the first.
 */
export class Room {
  readonly members = new Map<string, Member>();
  readonly createdAt: number;
  status: RoomSnapshot["status"] = "lobby";
  hostId: string;
  config: Record<string, unknown>;
  lastActivityAt: number;
  matchNumber = 0;
  lastResults: MatchResults | null = null;
  closed = false;

  private state: unknown = null;
  private version = 0;
  private matchStartedAt = 0;
  private matchPlayers: PlayerInfo[] = [];
  private tickTimer: NodeJS.Timeout | null = null;
  private autoStartTimer: NodeJS.Timeout | null = null;
  private autoStartAt: number | null = null;

  constructor(
    readonly code: string,
    readonly gameId: MultiplayerGameId,
    readonly engine: AnyGameEngine,
    readonly visibility: RoomVisibility,
    host: PlayerInfo,
    config: Record<string, unknown>,
    private readonly deps: RoomDeps,
  ) {
    this.createdAt = deps.now();
    this.lastActivityAt = this.createdAt;
    this.hostId = host.id;
    this.config = config;
  }

  get meta() {
    return getGame(this.gameId);
  }

  get connectedCount() {
    let n = 0;
    for (const m of this.members.values()) if (m.socket) n++;
    return n;
  }

  has(playerId: string) {
    return this.members.has(playerId);
  }

  // -------------------------------------------------------------------------
  // Delivery
  // -------------------------------------------------------------------------

  private send(m: Member, event: ServerEventName, payload: unknown) {
    if (!m.socket) return;
    m.seq++;
    m.socket.emit(event, { id: randomUUID(), roomId: this.code, seq: m.seq, ts: this.deps.now(), payload });
  }

  private broadcast(event: ServerEventName, payload: unknown) {
    for (const m of this.members.values()) this.send(m, event, payload);
  }

  private deliver(messages: OutboundMessage[]) {
    for (const msg of messages) {
      for (const m of this.members.values()) {
        const to = msg.to;
        const included = to.kind === "all" || (to.kind === "only" ? to.ids.includes(m.id) : !to.ids.includes(m.id));
        if (included) this.send(m, msg.event as ServerEventName, msg.payload);
      }
    }
  }

  notice(playerId: string, kind: "info" | "warning" | "error", message: string) {
    const m = this.members.get(playerId);
    if (m) this.send(m, "room:notice", { kind, message });
  }

  snapshot(): RoomSnapshot {
    return {
      code: this.code,
      gameId: this.gameId,
      visibility: this.visibility,
      status: this.status,
      hostId: this.hostId,
      players: [...this.members.values()].map((m) => ({
        id: m.id,
        name: m.name,
        color: m.color,
        isHost: m.id === this.hostId,
        ready: m.ready,
        connected: !!m.socket,
        disconnectedUntil: m.disconnectedAt === null ? null : m.disconnectedAt + this.deps.reconnectGraceMs,
      })),
      minPlayers: this.engine.minPlayers,
      maxPlayers: this.engine.maxPlayers,
      config: this.config,
      matchNumber: this.matchNumber,
      autoStartAt: this.autoStartAt,
      lastResults: this.lastResults,
    };
  }

  private broadcastRoom() {
    this.broadcast("room:state", this.snapshot());
  }

  private sendGameState(m: Member) {
    if (this.status !== "playing" || this.state === null) return;
    this.send(m, "game:state", { version: this.version, view: this.engine.viewFor(this.state, m.id) });
  }

  private broadcastGameState() {
    for (const m of this.members.values()) this.sendGameState(m);
  }

  private touch() {
    this.lastActivityAt = this.deps.now();
  }

  // -------------------------------------------------------------------------
  // Membership
  // -------------------------------------------------------------------------

  /** Adds a player or reattaches a returning player's new connection. */
  join(player: PlayerInfo, socket: Socket): Ack {
    if (this.closed) return err("ROOM_NOT_FOUND", "This room no longer exists");
    const existing = this.members.get(player.id);
    if (existing) {
      this.attach(existing, socket);
      return OK;
    }
    if (this.status === "playing") return err("ROOM_IN_PROGRESS", "A game is already in progress in this room");
    if (this.members.size >= this.engine.maxPlayers) return err("ROOM_FULL", "This room is full");

    const m: Member = {
      ...player,
      ready: false,
      socket: null,
      disconnectedAt: null,
      graceTimer: null,
      seq: 0,
      recentActions: new Map(),
    };
    if (this.members.size === 0) this.hostId = player.id;
    this.members.set(player.id, m);
    this.attach(m, socket);
    this.updateAutoStart();
    return OK;
  }

  private attach(m: Member, socket: Socket) {
    const previous = m.socket;
    if (previous && previous.id !== socket.id) {
      // Same player opened the room elsewhere: the newest connection wins.
      this.send(m, "session:replaced", { message: "You opened this game in another tab or device." });
      previous.data.roomCode = null;
    }
    if (m.graceTimer) clearTimeout(m.graceTimer);
    m.graceTimer = null;
    m.socket = socket;
    m.seq = 0;
    socket.data.roomCode = this.code;
    const wasDisconnected = m.disconnectedAt !== null;
    m.disconnectedAt = null;
    this.touch();

    if (this.status === "playing" && this.state !== null) {
      if (wasDisconnected) this.applyEngine(this.engine.setConnected(this.state, m.id, true, this.ctx()));
      this.broadcastRoom();
      this.sendGameState(m);
      this.deliver(this.engine.syncMessages(this.state, m.id));
      this.send(m, "game:reconnected", { version: this.version });
    } else {
      this.broadcastRoom();
    }
  }

  /** Socket dropped. The seat is held for the reconnect grace period. */
  disconnect(playerId: string, socketId: string) {
    const m = this.members.get(playerId);
    if (!m || !m.socket || m.socket.id !== socketId) return; // stale socket already replaced
    m.socket = null;
    m.disconnectedAt = this.deps.now();
    m.ready = this.status === "playing" ? m.ready : false;
    m.graceTimer = setTimeout(() => this.remove(playerId, "timeout"), this.deps.reconnectGraceMs);
    if (this.status === "playing" && this.state !== null) {
      this.applyEngine(this.engine.setConnected(this.state, playerId, false, this.ctx()));
    }
    this.updateAutoStart();
    this.broadcastRoom();
    if (this.connectedCount === 0) this.deps.onEmpty(this);
  }

  /** Permanently removes a member (left, kicked or reconnect grace expired). */
  remove(playerId: string, reason: "left" | "kicked" | "timeout" | "moderated") {
    const m = this.members.get(playerId);
    if (!m) return;
    if (m.graceTimer) clearTimeout(m.graceTimer);
    if (reason === "kicked" || reason === "moderated") this.send(m, "room:closed", { reason: reason === "kicked" ? "kicked" : "moderated" });
    if (m.socket) m.socket.data.roomCode = null;
    this.members.delete(playerId);
    this.deps.onMemberRemoved(this, playerId);
    this.touch();

    if (this.hostId === playerId) {
      // Prefer a connected player as the new host.
      const next = [...this.members.values()].sort((a, b) => Number(!!b.socket) - Number(!!a.socket))[0];
      if (next) this.hostId = next.id;
    }
    if (this.status === "playing" && this.state !== null) {
      this.applyEngine(this.engine.removePlayer(this.state, playerId, this.ctx()));
    }
    if (this.members.size === 0) {
      this.deps.onEmpty(this);
      return;
    }
    this.updateAutoStart();
    this.broadcastRoom();
  }

  close(reason: RoomCloseReason) {
    if (this.closed) return;
    this.closed = true;
    this.clearTimers();
    for (const m of this.members.values()) {
      this.send(m, "room:closed", { reason });
      if (m.graceTimer) clearTimeout(m.graceTimer);
      if (m.socket) m.socket.data.roomCode = null;
    }
    const ids = [...this.members.keys()];
    this.members.clear();
    for (const id of ids) this.deps.onMemberRemoved(this, id);
  }

  // -------------------------------------------------------------------------
  // Lobby
  // -------------------------------------------------------------------------

  setReady(playerId: string, ready: boolean): Ack {
    const m = this.members.get(playerId);
    if (!m) return err("NOT_IN_ROOM", "You are not in this room");
    if (this.status === "playing") return err("ROOM_IN_PROGRESS", "The game has already started");
    m.ready = ready;
    this.touch();
    this.updateAutoStart();
    this.broadcastRoom();
    return OK;
  }

  configure(playerId: string, patch: Record<string, unknown>): Ack {
    if (playerId !== this.hostId) return err("NOT_HOST", "Only the host can change settings");
    if (this.status === "playing") return err("ROOM_IN_PROGRESS", "Settings can't change during a game");
    const parsed = this.engine.configSchema.safeParse({ ...this.config, ...patch });
    if (!parsed.success) return err("INVALID_PAYLOAD", "Invalid game settings");
    this.config = parsed.data as Record<string, unknown>;
    // Changing settings resets readiness so nobody is surprised by new rules.
    for (const m of this.members.values()) if (m.id !== this.hostId) m.ready = false;
    this.touch();
    this.updateAutoStart();
    this.broadcastRoom();
    return OK;
  }

  kick(hostId: string, targetId: string): Ack {
    if (hostId !== this.hostId) return err("NOT_HOST", "Only the host can remove players");
    if (targetId === hostId) return err("INVALID_PAYLOAD", "You can't remove yourself");
    if (!this.members.has(targetId)) return err("NOT_IN_ROOM", "That player isn't in the room");
    this.remove(targetId, "kicked");
    return OK;
  }

  /** Public rooms start automatically a few seconds after everyone is ready. */
  private updateAutoStart() {
    if (this.visibility !== "public") return;
    const members = [...this.members.values()];
    const eligible =
      this.status !== "playing" &&
      members.length >= this.engine.minPlayers &&
      members.every((m) => m.socket && m.ready);
    if (eligible && !this.autoStartTimer) {
      this.autoStartAt = this.deps.now() + PUBLIC_AUTOSTART_MS;
      this.autoStartTimer = setTimeout(() => {
        this.autoStartTimer = null;
        this.autoStartAt = null;
        const res = this.start(this.hostId, true);
        if (!res.ok) this.broadcastRoom();
      }, PUBLIC_AUTOSTART_MS);
    } else if (!eligible && this.autoStartTimer) {
      clearTimeout(this.autoStartTimer);
      this.autoStartTimer = null;
      this.autoStartAt = null;
    }
  }

  // -------------------------------------------------------------------------
  // Match lifecycle
  // -------------------------------------------------------------------------

  private ctx() {
    return { now: this.deps.now(), rng: this.deps.rng };
  }

  start(playerId: string, auto = false): Ack {
    if (!auto && playerId !== this.hostId) return err("NOT_HOST", "Only the host can start the game");
    if (this.status === "playing") return err("ROOM_IN_PROGRESS", "The game has already started");
    const members = [...this.members.values()];
    if (members.length < this.engine.minPlayers) {
      return err("NOT_ENOUGH_PLAYERS", `${this.meta.name} needs at least ${this.engine.minPlayers} players`);
    }
    if (members.some((m) => !m.socket)) return err("PLAYERS_NOT_READY", "Wait for everyone to reconnect");
    if (members.some((m) => m.id !== this.hostId && !m.ready)) return err("PLAYERS_NOT_READY", "Everyone must be ready");

    if (this.autoStartTimer) clearTimeout(this.autoStartTimer);
    this.autoStartTimer = null;
    this.autoStartAt = null;

    const config = this.engine.configSchema.parse(this.config);
    this.matchPlayers = members.map((m) => ({ id: m.id, name: m.name, color: m.color }));
    let created;
    try {
      created = this.engine.create(this.matchPlayers, config, this.ctx());
    } catch (e) {
      this.deps.logger.error("engine create failed", { room: this.code, ...errorFields(e) });
      return err("INTERNAL", "The game could not be started");
    }
    this.state = created.state;
    this.status = "playing";
    this.version = 1;
    this.matchNumber++;
    this.matchStartedAt = this.deps.now();
    this.lastResults = null;
    for (const m of members) m.recentActions.clear();
    this.touch();
    this.deps.logger.info("match started", { room: this.code, game: this.gameId, players: members.length, match: this.matchNumber });

    this.broadcastRoom();
    this.broadcastGameState();
    this.deliver(created.messages);
    this.scheduleTick();
    return OK;
  }

  /** Validates and applies a game action from a player. */
  action(playerId: string, type: string, envelope: ClientEnvelope): Ack {
    const m = this.members.get(playerId);
    if (!m) return err("NOT_IN_ROOM", "You are not in this room");
    const previous = m.recentActions.get(envelope.id);
    if (previous) return previous; // duplicate submission (e.g. retry after a flaky network)

    const ack = this.applyAction(m, type, envelope);
    m.recentActions.set(envelope.id, ack);
    if (m.recentActions.size > RECENT_ACTIONS) m.recentActions.delete(m.recentActions.keys().next().value!);
    return ack;
  }

  private applyAction(m: Member, type: string, envelope: ClientEnvelope): Ack {
    if (this.status !== "playing" || this.state === null) return err("GAME_NOT_ACTIVE", "No game is running");
    if (!this.engine.actionTypes.includes(type)) return err("INVALID_PAYLOAD", "That action isn't part of this game");
    if (this.engine.requiresVersion(type) && envelope.v !== this.version) {
      return err("STALE_STATE", "The game moved on — try again");
    }
    const payload = typeof envelope.payload === "object" && envelope.payload !== null ? envelope.payload : {};
    const parsed = this.engine.actionSchema.safeParse({ ...payload, type });
    if (!parsed.success) return err("INVALID_PAYLOAD", "Invalid action");

    let result: EngineResult<unknown>;
    try {
      result = this.engine.handleAction(this.state, m.id, parsed.data, this.ctx());
    } catch (e) {
      this.deps.logger.error("engine action failed", { room: this.code, type, ...errorFields(e) });
      return err("INTERNAL", "Something went wrong");
    }
    if (!result.ok) return err(result.code, result.message);
    this.touch();
    this.applyEngine(result);
    return { ok: true, data: { version: this.version } };
  }

  /** Applies a successful engine result: deliver messages, publish state, schedule timers, detect the end. */
  private applyEngine(result: EngineResult<unknown>) {
    if (!result.ok) return;
    this.state = result.state;
    if (result.stateChanged) this.version++;
    this.deliver(result.messages);
    if (result.stateChanged) this.broadcastGameState();
    if (this.engine.isFinished(this.state)) this.endMatch();
    else this.scheduleTick();
  }

  private scheduleTick() {
    if (this.tickTimer) clearTimeout(this.tickTimer);
    this.tickTimer = null;
    if (this.status !== "playing" || this.state === null) return;
    const deadline = this.engine.nextDeadline(this.state);
    if (deadline === null) return;
    const delay = Math.max(0, deadline - this.deps.now()) + 5;
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      if (this.status !== "playing" || this.state === null) return;
      try {
        this.applyEngine(this.engine.tick(this.state, this.ctx()));
      } catch (e) {
        this.deps.logger.error("engine tick failed", { room: this.code, ...errorFields(e) });
      }
    }, delay);
  }

  private endMatch() {
    if (this.state === null) return;
    const results = this.engine.results(this.state);
    this.status = "finished";
    this.lastResults = results;
    this.state = null;
    this.clearTimers();
    for (const m of this.members.values()) m.ready = false;
    this.deps.logger.info("match ended", { room: this.code, game: this.gameId, reason: results.reason });
    this.broadcast("game:ended", results);
    this.broadcastRoom();
    this.deps.onMatchEnded(this, results, this.matchPlayers, this.matchStartedAt);
  }

  /** Re-sends everything a client needs to rebuild its view (after a detected sequence gap). */
  resync(playerId: string): Ack {
    const m = this.members.get(playerId);
    if (!m) return err("NOT_IN_ROOM", "You are not in this room");
    this.send(m, "room:state", this.snapshot());
    if (this.status === "playing" && this.state !== null) {
      this.sendGameState(m);
      this.deliver(this.engine.syncMessages(this.state, m.id));
    }
    return OK;
  }

  private clearTimers() {
    if (this.tickTimer) clearTimeout(this.tickTimer);
    if (this.autoStartTimer) clearTimeout(this.autoStartTimer);
    this.tickTimer = null;
    this.autoStartTimer = null;
    this.autoStartAt = null;
  }

  metrics() {
    return {
      code: this.code,
      gameId: this.gameId,
      visibility: this.visibility,
      status: this.status,
      players: this.members.size,
      connected: this.connectedCount,
      matchNumber: this.matchNumber,
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
    };
  }
}
