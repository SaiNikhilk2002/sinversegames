import { randomUUID } from "node:crypto";
import { io as ioClient, type Socket } from "socket.io-client";
import type { Ack, MatchResults, ServerEnvelope } from "@platform/shared";
import { signPlayerToken } from "@platform/shared/identity";
import { seededRng } from "@platform/engines";
import { testConfig, type RealtimeConfig } from "../src/config";
import type { Persistence } from "../src/persistence";
import { createRealtimeServer, type RealtimeServer } from "../src/server";

export const SECRET = testConfig().AUTH_SECRET;

export interface RecordedMatch {
  results: MatchResults;
  roomCode: string;
}

export async function startServer(overrides: Partial<RealtimeConfig> = {}) {
  const recorded: RecordedMatch[] = [];
  const persistence: Persistence = {
    enabled: true,
    recordMatch: async (input) => {
      recorded.push({ results: input.results, roomCode: input.roomCode });
      return { unlocked: {} };
    },
    isBanned: async (id) => id.startsWith("banned"),
    healthy: async () => true,
  };
  const server: RealtimeServer = createRealtimeServer({
    config: testConfig({ MATCHMAKING_WAIT_MS: 300, ...overrides }),
    persistence,
    rng: seededRng(1234),
  });
  const port = await server.listen(0, "127.0.0.1");
  return { server, port, recorded, url: `http://127.0.0.1:${port}` };
}

export interface TestClient {
  id: string;
  socket: Socket;
  events: { event: string; env: ServerEnvelope }[];
  emit<T = unknown>(event: string, payload?: unknown, opts?: { v?: number; id?: string }): Promise<Ack<T>>;
  waitFor(event: string, predicate?: (payload: any) => boolean, timeoutMs?: number): Promise<any>;
  last(event: string): any;
  all(event: string): any[];
  close(): void;
}

export async function connect(url: string, id = `p-${randomUUID().slice(0, 8)}`, name = "Tester", token?: string): Promise<TestClient> {
  const auth = { token: token ?? (await signPlayerToken({ sub: id, name, color: "#ff6b6b", kind: "guest" }, "realtime", SECRET)) };
  const socket = ioClient(url, { auth, transports: ["websocket"], forceNew: true, reconnection: false });
  const events: TestClient["events"] = [];
  const waiters: { event: string; pred: (p: any) => boolean; resolve: (p: any) => void }[] = [];
  socket.onAny((event: string, env: ServerEnvelope) => {
    events.push({ event, env });
    for (const w of [...waiters]) {
      if (w.event === event && w.pred(env.payload)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(env.payload);
      }
    }
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", (e) => reject(e));
  });

  const client: TestClient = {
    id,
    socket,
    events,
    emit: (event, payload = {}, opts = {}) =>
      new Promise((resolve) => socket.emit(event, { id: opts.id ?? randomUUID(), v: opts.v, payload }, (ack: Ack<any>) => resolve(ack))),
    waitFor: (event, predicate = () => true, timeoutMs = 4000) => {
      // Already received?
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i]!;
        if (e.event === event && predicate(e.env.payload)) return Promise.resolve(e.env.payload);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
        waiters.push({ event, pred: predicate, resolve: (p) => (clearTimeout(timer), resolve(p)) });
      });
    },
    last: (event) => [...events].reverse().find((e) => e.event === event)?.env.payload,
    all: (event) => events.filter((e) => e.event === event).map((e) => e.env.payload),
    close: () => socket.close(),
  };
  return client;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits for the next fresh game:state (after `afterIndex` events). */
export async function nextState(c: TestClient, predicate: (s: any) => boolean = () => true, timeoutMs = 4000) {
  const start = c.events.length;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = c.events.slice(start).reverse().find((e) => e.event === "game:state" && predicate(e.env.payload));
    if (found) return found.env.payload as { version: number; view: any };
    await sleep(10);
  }
  throw new Error("Timed out waiting for game:state");
}

export const latestState = (c: TestClient) => c.last("game:state") as { version: number; view: any } | undefined;
