import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket } from "socket.io-client";
import type { Ack } from "@platform/shared";
import { signPlayerToken } from "@platform/shared/identity";
import { SECRET, connect, sleep, startServer, type TestClient } from "./helpers";
import { WS_COMPRESSION } from "../src/server";

/**
 * WebSocket per-message compression (docs/SOCKET_IO_COMPRESSION_BENCHMARKS.md): negotiated with
 * clients that support it, transparent to payloads, and without cost to long-polling, upgrades,
 * reconnection or concurrent rooms. Every other realtime test also runs with it on (the default).
 */
let ctx: Awaited<ReturnType<typeof startServer>>;
const open: { close(): void }[] = [];
beforeEach(async () => {
  ctx = await startServer({ RECONNECT_GRACE_MS: 2_000 });
});
afterEach(async () => {
  for (const c of open.splice(0)) c.close();
  await ctx.server.close();
});

/** A client with explicit transport options, recording payloads by event. */
async function client(id: string, opts: { transports: ("websocket" | "polling")[]; perMessageDeflate?: false; upgrade?: boolean }) {
  const token = await signPlayerToken({ sub: id, name: id, color: "#ff6b6b", kind: "guest" }, "realtime", SECRET);
  // The client types only describe the object form, but `false` is passed through to ws to decline the extension.
  const socket: Socket = ioClient(ctx.url, { auth: { token }, forceNew: true, reconnection: false, ...(opts as Record<string, unknown>) });
  const seen = new Map<string, any[]>();
  socket.onAny((event: string, env: { payload: unknown }) => seen.set(event, [...(seen.get(event) ?? []), env.payload]));
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  const c = {
    id,
    socket,
    seen,
    last: (event: string) => seen.get(event)?.at(-1),
    emit: <T = unknown>(event: string, payload: unknown = {}) =>
      new Promise<Ack<T>>((resolve) => socket.emit(event, { id: randomUUID(), matchId: c.last("room:state")?.matchId ?? null, payload }, resolve)),
    close: () => socket.close(),
  };
  open.push(c);
  return c;
}
const ws = (s: Socket) => (s.io as any).engine.transport;
const until = async (check: () => boolean, ms = 5_000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw Error("timed out");
    await sleep(20);
  }
};

describe("WebSocket compression", () => {
  it("is on by default with a 1 KB threshold, and negotiated with a client that supports it", async () => {
    expect(WS_COMPRESSION).toEqual({ threshold: 1024 });
    const a = await client("deflate-a", { transports: ["websocket"] });
    expect(ws(a.socket).name).toBe("websocket");
    expect(ws(a.socket).ws.extensions).toContain("permessage-deflate");
  });

  it("serves a client that declines compression, with identical game states in the same room", async () => {
    const plain = await client("plain-host", { transports: ["websocket"], perMessageDeflate: false });
    const deflated = await client("deflated-guest", { transports: ["websocket"] });
    expect(ws(plain.socket).ws.extensions).toBe("");
    expect(ws(deflated.socket).ws.extensions).toContain("permessage-deflate");
    const created = await plain.emit<{ code: string }>("room:create", { gameId: "bumper-blitz", visibility: "private", config: { durationSeconds: 30 } });
    expect(created.ok).toBe(true);
    const code = (created as { data: { code: string } }).data.code;
    expect((await deflated.emit("room:join", { code })).ok).toBe(true);
    expect((await deflated.emit("room:ready", { ready: true })).ok).toBe(true);
    expect((await plain.emit("game:start")).ok).toBe(true);
    // Bumper Blitz states are about 2 KB, so they are compressed for one client and not the other.
    await until(() => (plain.seen.get("game:state")?.length ?? 0) > 10 && (deflated.seen.get("game:state")?.length ?? 0) > 10);
    const byVersion = (c: typeof plain) => new Map((c.seen.get("game:state") ?? []).map((s: any) => [s.version, JSON.stringify(s)]));
    const a = byVersion(plain), b = byVersion(deflated);
    const shared = [...a.keys()].filter((v) => b.has(v));
    expect(shared.length).toBeGreaterThan(5);
    for (const v of shared) expect(b.get(v)).toBe(a.get(v));
    // The same stream costs the compressing client far fewer bytes on the wire.
    const wire = (c: typeof plain) => ws(c.socket).ws._socket.bytesRead as number;
    expect(wire(deflated)).toBeLessThan(wire(plain) * 0.5);
  });

  it("keeps long-polling working, alone and as the first step of an upgrade", async () => {
    const polling = await client("polling-only", { transports: ["polling"] });
    const upgrading = await client("polling-upgrade", { transports: ["polling", "websocket"] });
    expect(ws(polling.socket).name).toBe("polling");
    const created = await polling.emit<{ code: string }>("room:create", { gameId: "bumper-blitz", visibility: "private", config: { durationSeconds: 30 } });
    const code = (created as { data: { code: string } }).data.code;
    expect((await upgrading.emit("room:join", { code })).ok).toBe(true);
    expect((await upgrading.emit("room:ready", { ready: true })).ok).toBe(true);
    expect((await polling.emit("game:start")).ok).toBe(true);
    await until(() => (polling.seen.get("game:state")?.length ?? 0) > 5 && (upgrading.seen.get("game:state")?.length ?? 0) > 5);
    // The polling-first client upgrades to a compressed WebSocket.
    await until(() => ws(upgrading.socket).name === "websocket");
    expect(ws(upgrading.socket).ws.extensions).toContain("permessage-deflate");
    expect(ws(polling.socket).name).toBe("polling");
    expect((await polling.emit("arena:input", { x: 1, y: 0, boost: false })).ok).toBe(true);
  });

  it("reconnects a compressed client to its seat with the current game state", async () => {
    const host = await connect(ctx.url, "re-host", "Host");
    const guest = await connect(ctx.url, "re-guest", "Guest");
    open.push(host, guest);
    const created = await host.emit<{ code: string }>("room:create", { gameId: "bumper-blitz", visibility: "private", config: { durationSeconds: 30 } });
    const code = (created as { data: { code: string } }).data.code;
    await guest.emit("room:join", { code });
    await guest.emit("room:ready", { ready: true });
    expect((await host.emit("game:start")).ok).toBe(true);
    await guest.waitFor("game:state");
    guest.close();
    const back = await connect(ctx.url, "re-guest", "Guest");
    open.push(back);
    expect((await back.emit("room:join", { code })).ok).toBe(true);
    const state = await back.waitFor("game:state");
    expect(state.view.pods.map((p: any) => p.id).sort()).toEqual(["re-guest", "re-host"]);
    expect(await back.waitFor("game:reconnected")).toMatchObject({ version: expect.any(Number) });
  });

  it("runs concurrent rooms of different games over compressed sockets without cross-talk", async () => {
    const games = [
      { game: "bumper-blitz", config: { durationSeconds: 30 } },
      { game: "token-trail", config: {} },
      { game: "color-clash", config: {} },
      { game: "kitchen-rush-coop", config: {} },
    ];
    const rooms: { code: string; game: string; players: TestClient[] }[] = [];
    for (const [n, g] of games.entries()) {
      const players = [await connect(ctx.url, `multi-${n}-a`, "A"), await connect(ctx.url, `multi-${n}-b`, "B")];
      open.push(...players);
      const created = await players[0]!.emit<{ code: string }>("room:create", { gameId: g.game, visibility: "private", config: g.config });
      expect(created.ok).toBe(true);
      const code = (created as { data: { code: string } }).data.code;
      await players[1]!.emit("room:join", { code });
      await players[1]!.emit("room:ready", { ready: true });
      expect((await players[0]!.emit("game:start")).ok).toBe(true);
      rooms.push({ code, game: g.game, players });
    }
    for (const r of rooms) for (const p of r.players) {
      await p.waitFor("game:state");
      expect(p.socket.io.engine.transport.name).toBe("websocket");
      // Every envelope a player received belongs to their own room.
      expect(p.events.filter((e) => e.env.roomId).every((e) => e.env.roomId === r.code)).toBe(true);
      expect(p.last("room:state").gameId).toBe(r.game);
    }
  });
});
