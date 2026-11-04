"use client";

import { io, type Socket } from "socket.io-client";
import type { Ack, ServerEnvelope, ServerEventName } from "@platform/shared";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "offline" | "unauthorized" | "banned";

type Listener = (env: ServerEnvelope) => void;

const ACK_TIMEOUT_MS = 8_000;
const AUTH_TIMEOUT_MS = 5_000;

const actionId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

/**
 * Single shared Socket.IO connection for the whole tab (it survives client-side
 * navigation). Authentication uses a short-lived token fetched from the web app
 * on every (re)connect, so the long-lived session cookie is never readable by JS.
 */
class RealtimeConnection {
  private socket: Socket | null = null;
  status: ConnectionStatus = "idle";
  /** Estimated (server clock − local clock) in ms. */
  clockOffset = 0;
  private offsetSamples: number[] = [];
  private statusListeners = new Set<() => void>();
  private eventListeners = new Map<string, Set<Listener>>();
  private connectListeners = new Set<() => void>();
  private roomMatch: { roomId: string; matchId: string | null } | null = null;
  private authAbort: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 500;

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  /** Middleware rejections are not retried by Socket.IO's transport manager. */
  private retryAuthentication(socket: Socket) {
    if (socket.active || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      socket.connect();
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 5_000);
  }

  private setStatus(s: ConnectionStatus) {
    if (this.status === s) return;
    this.status = s;
    this.statusListeners.forEach((l) => l());
  }

  onStatus(cb: () => void) {
    this.statusListeners.add(cb);
    return () => void this.statusListeners.delete(cb);
  }

  /** Called after every successful (re)connect — rooms use it to re-join. */
  onConnect(cb: () => void) {
    this.connectListeners.add(cb);
    if (this.socket?.connected) cb();
    return () => void this.connectListeners.delete(cb);
  }

  on(event: ServerEventName, cb: Listener) {
    let set = this.eventListeners.get(event);
    if (!set) this.eventListeners.set(event, (set = new Set()));
    set.add(cb);
    return () => void set!.delete(cb);
  }

  serverNow() {
    return Date.now() + this.clockOffset;
  }

  connect() {
    if (this.socket) return;
    this.setStatus("connecting");
    const url = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4200";
    const socket = io(url, {
      autoConnect: false,
      // Establish polling first, then probe the WebSocket upgrade. A gateway
      // that accepts and immediately closes WebSockets must leave play usable.
      transports: ["polling", "websocket"],
      tryAllTransports: true,
      timeout: 10_000,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
      auth: (cb) => {
        this.authAbort?.abort();
        const controller = new AbortController();
        this.authAbort = controller;
        const deadline = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
        fetch("/api/session/token", { method: "POST", signal: controller.signal, cache: "no-store" })
          .then(async (r) => {
            if (this.authAbort !== controller) return;
            if (r.status === 401) this.setStatus("unauthorized");
            if (r.status === 403) this.setStatus("banned");
            if (!r.ok) throw new Error("Token request failed");
            const data = (await r.json()) as { token?: string };
            if (!data.token) throw new Error("Token missing");
            if (this.authAbort === controller) cb({ token: data.token });
          })
          .catch(() => {
            if (this.authAbort !== controller) return;
            // Complete the handshake even on HTTP failure so connect_error can
            // schedule another token request instead of leaving auth pending.
            cb({ token: "" });
          })
          .finally(() => {
            clearTimeout(deadline);
            if (this.authAbort === controller) this.authAbort = null;
          });
      },
    });
    this.socket = socket;

    socket.on("connect", () => {
      this.clearRetry();
      this.retryDelay = 500;
      this.setStatus("connected");
      this.connectListeners.forEach((l) => l());
    });
    socket.on("disconnect", (reason) => {
      this.clearRetry();
      // "io client disconnect" is a deliberate close; everything else retries automatically.
      this.setStatus(reason === "io client disconnect" ? "idle" : "reconnecting");
      if (reason === "io server disconnect") socket.connect();
    });
    socket.on("connect_error", (err) => {
      if (err.message === "BANNED" || this.status === "banned" || this.status === "unauthorized") {
        if (err.message === "BANNED") this.setStatus("banned");
        this.clearRetry();
        socket.disconnect();
        return;
      }
      this.setStatus(this.status === "connected" || this.status === "reconnecting" ? "reconnecting" : "offline");
      this.retryAuthentication(socket);
    });
    socket.onAny((event: string, env: ServerEnvelope) => {
      if (event === "room:state" && env?.roomId) {
        this.roomMatch = { roomId: env.roomId, matchId: (env.payload as { matchId: string | null }).matchId };
      }
      if (env && typeof env.ts === "number") {
        // sample = trueOffset − latency, so the largest recent sample is the best estimate.
        this.offsetSamples.push(env.ts - Date.now());
        if (this.offsetSamples.length > 30) this.offsetSamples.shift();
        this.clockOffset = Math.max(...this.offsetSamples);
      }
      this.eventListeners.get(event)?.forEach((l) => l(env));
    });
    socket.connect();
  }

  /** Sends an envelope and resolves with the server's acknowledgement. */
  emit<T = unknown>(event: string, payload: unknown = {}, opts: { roomId?: string; matchId?: string | null; v?: number } = {}): Promise<Ack<T>> {
    const socket = this.socket;
    if (!socket?.connected) {
      return Promise.resolve({ ok: false, error: { code: "INTERNAL", message: "Not connected — reconnecting…" } });
    }
    return new Promise((resolve) => {
      const scope = this.roomMatch && (!opts.roomId || opts.roomId === this.roomMatch.roomId) ? this.roomMatch : {};
      socket.timeout(ACK_TIMEOUT_MS).emit(event, { id: actionId(), ...scope, ...opts, payload }, (err: Error | null, ack: Ack<T>) => {
        if (err) resolve({ ok: false, error: { code: "INTERNAL", message: "The server didn't respond — check your connection" } });
        else resolve(ack);
      });
    });
  }

  /** Reliable send without waiting for an ack, for high-frequency events (drawing). */
  send(event: string, payload: unknown) {
    if (this.socket?.connected) this.socket.emit(event, { id: actionId(), ...this.roomMatch, payload });
  }

  /** Re-runs authentication, e.g. after the player first chooses a name. */
  reauthenticate() {
    if (!this.socket) return this.connect();
    this.clearRetry();
    this.retryDelay = 500;
    this.authAbort?.abort();
    this.authAbort = null;
    this.socket.disconnect();
    this.setStatus("connecting");
    this.socket.connect();
  }
}

export const realtime = new RealtimeConnection();
