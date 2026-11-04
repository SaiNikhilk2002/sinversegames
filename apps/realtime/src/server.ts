import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { Server, type Socket } from "socket.io";
import {
  clientEnvelopeSchema,
  emptyPayload,
  GAME_ACTION_EVENTS,
  matchQueuePayload,
  roomConfigurePayload,
  roomCreatePayload,
  roomJoinPayload,
  roomKickPayload,
  roomReadyPayload,
  type Ack,
  type ClientEnvelope,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@platform/shared";
import { InvalidTokenError, verifyPlayerToken } from "@platform/shared/identity";
import { cryptoRng, type Rng } from "@platform/engines";
import type { z } from "zod";
import type { RealtimeConfig } from "./config";
import { createLogger, errorFields, type Logger } from "./logger";
import { noopPersistence, type Persistence } from "./persistence";
import { categoryFor, RateLimiter } from "./rate-limit";
import { Matchmaker } from "./rooms/matchmaker";
import { err, type PlayerInfo } from "./rooms/room";
import { RoomManager } from "./rooms/room-manager";
import { avatarHandler } from "./avatars";
import { getDb, resolveAccountSession } from "@platform/db";

export interface RealtimeServerOptions {
  config: RealtimeConfig;
  persistence?: Persistence;
  logger?: Logger;
  rng?: Rng;
  now?: () => number;
}

interface SocketData {
  player: PlayerInfo;
  roomCode: string | null;
  limiter: RateLimiter;
  ip: string;
  sessionHash?: string;
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface RealtimeServer {
  http: HttpServer;
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
  manager: RoomManager;
  matchmaker: Matchmaker;
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

const secureEquals = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function createRealtimeServer(opts: RealtimeServerOptions): RealtimeServer {
  const { config } = opts;
  const logger = opts.logger ?? createLogger(config.LOG_LEVEL);
  const persistence = opts.persistence ?? noopPersistence;
  const now = opts.now ?? Date.now;
  const manager = new RoomManager({ config, logger, persistence, rng: opts.rng ?? cryptoRng, now });
  const matchmaker = new Matchmaker(manager, config.MATCHMAKING_WAIT_MS, now);
  const startedAt = Date.now();
  const counters = { rateLimited: 0, rejectedConnections: 0, connectionsTotal: 0 };
  const connectionsPerIp = new Map<string, number>();
  const allowedOrigins = new Set(config.ALLOWED_ORIGINS);
  const originAllowed = (origin: string | undefined) => {
    // Browsers always send Origin on WebSocket handshakes; non-browser clients
    // without one still need a valid signed token to do anything.
    if (!origin) return true;
    if (allowedOrigins.size === 0) return config.NODE_ENV !== "production";
    return allowedOrigins.has(origin.replace(/\/$/, ""));
  };

  // ---------------------------------------------------------------------------
  // HTTP: health + authenticated admin endpoints
  // ---------------------------------------------------------------------------

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    res.end(JSON.stringify(body));
  };

  const isAdmin = (req: IncomingMessage) => {
    const header = req.headers.authorization ?? "";
    return !!config.ADMIN_TOKEN && header.startsWith("Bearer ") && secureEquals(header.slice(7), config.ADMIN_TOKEN);
  };
  const handleAvatar = avatarHandler(config.AUTH_SECRET);
  const accountValid = async (playerId: string, sid?: string) => {
    if (!persistence.enabled) return !sid;
    const db = getDb();
    if (!db) return !sid;
    try {
      if (sid) return (await resolveAccountSession(db, sid))?.playerId === playerId;
      const player = await db.player.findUnique({ where: { id: playerId }, select: { kind: true } });
      return player?.kind !== "REGISTERED";
    } catch { return false; }
  };

  const http = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "POST" && url.pathname === "/internal/avatar") return await handleAvatar(req, res);
      if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/")) {
        return json(res, 200, { status: "ok", uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) });
      }
      if (url.pathname.startsWith("/admin/")) {
        if (!isAdmin(req)) return json(res, 401, { error: "unauthorized" });
        if (req.method === "GET" && url.pathname === "/admin/metrics") {
          return json(res, 200, {
            status: "ok",
            uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
            connections: io.engine.clientsCount,
            connectionsTotal: counters.connectionsTotal,
            rejectedConnections: counters.rejectedConnections,
            rateLimited: counters.rateLimited,
            errors: logger.errorCount,
            database: persistence.enabled ? ((await persistence.healthy()) ? "ok" : "down") : "disabled",
            memoryMb: Math.round(process.memoryUsage().rss / 1048576),
            queues: matchmaker.metrics(),
            ...manager.metrics(),
          });
        }
        const closeRoom = url.pathname.match(/^\/admin\/rooms\/([A-Z0-9]{6})\/close$/);
        if (req.method === "POST" && closeRoom) {
          const room = manager.get(closeRoom[1]!);
          if (!room) return json(res, 404, { error: "not found" });
          manager.destroy(room, "moderated");
          logger.warn("admin closed room", { room: room.code });
          return json(res, 200, { ok: true });
        }
        const kick = url.pathname.match(/^\/admin\/players\/([\w-]{1,64})\/kick$/);
        if (req.method === "POST" && kick) {
          const playerId = kick[1]!;
          manager.roomOf(playerId)?.remove(playerId, "moderated");
          matchmaker.cancel(playerId, false);
          for (const s of await io.fetchSockets()) if (s.data.player?.id === playerId) s.disconnect(true);
          logger.warn("admin kicked player", { player: playerId });
          return json(res, 200, { ok: true });
        }
      }
      json(res, 404, { error: "not found" });
    } catch (e) {
      logger.error("http handler failed", errorFields(e));
      json(res, 500, { error: "internal" });
    }
  });

  // ---------------------------------------------------------------------------
  // Socket.IO
  // ---------------------------------------------------------------------------

  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(http, {
    cors: { origin: config.ALLOWED_ORIGINS.length ? config.ALLOWED_ORIGINS : true, credentials: false },
    allowRequest: (req, cb) => cb(null, originAllowed(req.headers.origin)),
    maxHttpBufferSize: 32 * 1024,
    pingInterval: 15_000,
    pingTimeout: 20_000,
    serveClient: false,
    transports: ["websocket", "polling"],
  });

  // Authenticate every connection with a short-lived token issued by the web app.
  io.use(async (socket, next) => {
    const ip = (socket.handshake.headers["x-forwarded-for"]?.toString().split(",")[0] ?? socket.handshake.address).trim();
    if ((connectionsPerIp.get(ip) ?? 0) >= config.MAX_CONNECTIONS_PER_IP) {
      counters.rejectedConnections++;
      return next(new Error("RATE_LIMITED"));
    }
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || token.length > 4096) {
      counters.rejectedConnections++;
      return next(new Error("UNAUTHORIZED"));
    }
    try {
      const claims = await verifyPlayerToken(token, "realtime", config.AUTH_SECRET);
      if ((claims.kind === "registered" && !claims.sid) || !await accountValid(claims.sub, claims.sid)) return next(new Error("UNAUTHORIZED"));
      socket.data.sessionHash = claims.sid;
      if (await persistence.isBanned(claims.sub)) {
        counters.rejectedConnections++;
        return next(new Error("BANNED"));
      }
      socket.data.player = { id: claims.sub, name: claims.name, color: claims.color };
      socket.data.roomCode = null;
      socket.data.limiter = new RateLimiter(now);
      socket.data.ip = ip;
      next();
    } catch (e) {
      counters.rejectedConnections++;
      next(new Error(e instanceof InvalidTokenError && e.reason === "expired" ? "TOKEN_EXPIRED" : "UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket: GameSocket) => {
    const player = socket.data.player;
    socket.use((_packet, next) => {
      void accountValid(player.id, socket.data.sessionHash).then(valid => {
        if (valid) next();
        else { next(new Error("UNAUTHORIZED")); socket.disconnect(true); }
      }).catch(() => socket.disconnect(true));
    });
    counters.connectionsTotal++;
    connectionsPerIp.set(socket.data.ip, (connectionsPerIp.get(socket.data.ip) ?? 0) + 1);
    logger.debug("connected", { player: player.id, socket: socket.id });
    socket.emit("session:ready", {
      id: randomUUID(),
      roomId: null,
      seq: 0,
      ts: now(),
      payload: { playerId: player.id, name: player.name, color: player.color, roomCode: manager.roomOf(player.id)?.code ?? null },
    });

    /** Registers a handler with rate limiting, envelope + payload validation and error containment. */
    function on<S extends z.ZodType>(event: keyof ClientToServerEvents, schema: S | null, fn: (payload: z.infer<S>, env: ClientEnvelope) => Ack) {
      socket.on(event, (raw: unknown, ack: unknown) => {
        const reply = typeof ack === "function" ? (ack as (a: Ack) => void) : () => {};
        if (!socket.data.limiter.take(categoryFor(event))) {
          counters.rateLimited++;
          return reply(err("RATE_LIMITED", "Slow down a little"));
        }
        const env = clientEnvelopeSchema.safeParse(raw);
        if (!env.success) return reply(err("INVALID_PAYLOAD", "Malformed message"));
        let payload: unknown = env.data.payload;
        if (schema) {
          const parsed = schema.safeParse(env.data.payload ?? {});
          if (!parsed.success) return reply(err("INVALID_PAYLOAD", parsed.error.issues[0]?.message ?? "Invalid request"));
          payload = parsed.data;
        }
        try {
          reply(fn(payload as z.infer<S>, env.data as ClientEnvelope));
        } catch (e) {
          logger.error("handler failed", { event, player: player.id, ...errorFields(e) });
          reply(err("INTERNAL", "Something went wrong"));
        }
      });
    }

    const currentRoom = () => {
      const code = socket.data.roomCode;
      return code ? manager.get(code) : undefined;
    };

    on("room:create", roomCreatePayload, (p) => {
      matchmaker.cancel(player.id, false);
      const room = manager.create(player, p.gameId, p.visibility, p.config);
      if (!("code" in room)) return room;
      const ack = manager.join(room, player, socket);
      return ack.ok ? { ok: true, data: { code: room.code } } : ack;
    });

    on("room:join", roomJoinPayload, (p) => {
      const room = manager.get(p.code);
      if (!room || room.closed) return err("ROOM_NOT_FOUND", "We couldn't find that room — check the code");
      matchmaker.cancel(player.id, false);
      const ack = manager.join(room, player, socket);
      return ack.ok ? { ok: true, data: { code: room.code, gameId: room.gameId } } : ack;
    });

    on("room:leave", emptyPayload, () => {
      const room = currentRoom();
      if (room) room.remove(player.id, "left");
      return { ok: true };
    });

    const scoped = (env: ClientEnvelope, action: (room: NonNullable<ReturnType<typeof currentRoom>>) => Ack): Ack => {
      const room = currentRoom();
      if (!room) return err("NOT_IN_ROOM", "Join a room first");
      if (env.roomId && env.roomId !== room.code) return err("STALE_STATE", "You are in a different room now.");
      if ((env.matchId ?? null) !== room.matchId) return err("STALE_STATE", "This match changed. Refresh the room to continue.");
      return action(room);
    };
    on("room:ready", roomReadyPayload, (p, env) => scoped(env, (room) => room.setReady(player.id, p.ready)));
    on("room:configure", roomConfigurePayload, (p, env) => scoped(env, (room) => room.configure(player.id, p.config)));
    on("room:kick", roomKickPayload, (p, env) => scoped(env, (room) => room.kick(player.id, p.playerId)));
    on("room:sync", emptyPayload, () => currentRoom()?.resync(player.id) ?? err("NOT_IN_ROOM", "Join a room first"));
    on("game:start", emptyPayload, (_p, env) => scoped(env, (room) => room.start(player.id, false, env.matchId)));

    on("match:queue", matchQueuePayload, (p) => matchmaker.enqueue(player, socket, p.gameId));
    on("match:cancel", emptyPayload, () => matchmaker.cancel(player.id));

    for (const event of GAME_ACTION_EVENTS) {
      on(event, null, (_p, env) => currentRoom()?.action(player.id, event, env) ?? err("NOT_IN_ROOM", "Join a room first"));
    }

    socket.on("disconnect", (reason) => {
      logger.debug("disconnected", { player: player.id, reason });
      const n = (connectionsPerIp.get(socket.data.ip) ?? 1) - 1;
      if (n <= 0) connectionsPerIp.delete(socket.data.ip);
      else connectionsPerIp.set(socket.data.ip, n);
      matchmaker.dropSocket(socket.id);
      manager.disconnect(player.id, socket);
    });
  });

  return {
    http,
    io,
    manager,
    matchmaker,
    listen(port = config.PORT, host = config.HOST) {
      return new Promise((resolve) => {
        http.listen(port, host, () => {
          const addr = http.address();
          resolve(typeof addr === "object" && addr ? addr.port : port);
        });
      });
    },
    async close() {
      matchmaker.stop();
      manager.shutdown();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
