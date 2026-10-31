"use client";

import { io, type Socket } from "socket.io-client";
import type { Ack, ServerEnvelope, ServerEventName } from "@platform/shared";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "offline" | "unauthorized" | "banned";

type Listener = (env: ServerEnvelope) => void;

const ACK_TIMEOUT_MS = 8_000;

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
      transports: ["websocket", "polling"],
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
      auth: (cb) => {
        fetch("/api/session/token", { method: "POST" })
          .then(async (r) => {
            if (r.status === 401) this.setStatus("unauthorized");
            if (r.status === 403) this.setStatus("banned");
            const data = (await r.json()) as { token?: string };
            cb({ token: data.token ?? "" });
          })
          .catch(() => cb({ token: "" }));
      },
    });
    this.socket = socket;

    socket.on("connect", () => {
      this.setStatus("connected");
      this.connectListeners.forEach((l) => l());
    });
    socket.on("disconnect", (reason) => {
      // "io client disconnect" is a deliberate close; everything else retries automatically.
      this.setStatus(reason === "io client disconnect" ? "idle" : "reconnecting");
      if (reason === "io server disconnect") socket.connect();
    });
    socket.on("connect_error", (err) => {
      if (err.message === "BANNED") this.setStatus("banned");
      else if (err.message === "UNAUTHORIZED" && this.status === "unauthorized") socket.disconnect();
      else this.setStatus(this.status === "connected" || this.status === "reconnecting" ? "reconnecting" : "offline");
    });
    socket.onAny((event: string, env: ServerEnvelope) => {
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
  emit<T = unknown>(event: string, payload: unknown = {}, opts: { roomId?: string; v?: number } = {}): Promise<Ack<T>> {
    const socket = this.socket;
    if (!socket?.connected) {
      return Promise.resolve({ ok: false, error: { code: "INTERNAL", message: "Not connected — reconnecting…" } });
    }
    return new Promise((resolve) => {
      socket.timeout(ACK_TIMEOUT_MS).emit(event, { id: actionId(), ...opts, payload }, (err: Error | null, ack: Ack<T>) => {
        if (err) resolve({ ok: false, error: { code: "INTERNAL", message: "The server didn't respond — check your connection" } });
        else resolve(ack);
      });
    });
  }

  /** Reliable send without waiting for an ack, for high-frequency events (drawing). */
  send(event: string, payload: unknown) {
    this.socket?.emit(event, { id: actionId(), payload });
  }

  /** Re-runs authentication, e.g. after the player first chooses a name. */
  reauthenticate() {
    if (!this.socket) return this.connect();
    this.socket.disconnect();
    this.setStatus("connecting");
    this.socket.connect();
  }
}

export const realtime = new RealtimeConnection();
