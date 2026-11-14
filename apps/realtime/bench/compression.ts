/**
 * Socket.IO WebSocket compression benchmark with the real server and real socket.io-client bots.
 *
 *   pnpm --filter @platform/realtime bench:compression          (from the repository root)
 *   BENCH_SECONDS=30 BENCH_CONFIGS=off,contextTakeover node --import tsx bench/compression.ts
 *
 * For each compression setting: start the server in a child process (bench/compression-server.ts),
 * open concurrent rooms of all six multiplayer games over WebSocket, play with simple bots for a
 * measurement window, and record per game: bytes received on the wire (TCP, including WebSocket
 * framing), messages, Bumper Blitz delivery latency (server timestamp to client receipt, same
 * machine), and the server process's CPU and memory. Local loopback only; no database.
 */
import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { io as ioClient, type Socket } from "socket.io-client";
import { signPlayerToken } from "@platform/shared/identity";
import { testConfig } from "../src/config";
import type { WsCompression } from "../src/server";

const SECRET = testConfig().AUTH_SECRET;
const SECONDS = Number(process.env.BENCH_SECONDS ?? 30);
const WARMUP = 4;
/** Multiplies the rooms per game (BENCH_SCALE=4 runs 248 clients), for memory and CPU at more load. */
const SCALE = Number(process.env.BENCH_SCALE ?? 1);

export const CONFIGS: Record<string, false | WsCompression> = {
  off: false,
  /** ws defaults with Engine.IO's 1 KB threshold: context takeover, 32 KB window, zlib level 6. */
  contextTakeover: { threshold: 1024 },
  /** Smaller window and memory, fastest level: bounds per-socket memory. */
  lowMemory: { threshold: 1024, serverMaxWindowBits: 11, zlibDeflateOptions: { level: 1, memLevel: 4 } },
  /** No context between messages: each message compressed alone. */
  /** 8 KB window (holds the previous few messages), fastest level, small hash memory. */
  window13: { threshold: 1024, serverMaxWindowBits: 13, zlibDeflateOptions: { level: 1, memLevel: 4 } },
  /** 16 KB window, fast level. */
  window14: { threshold: 1024, serverMaxWindowBits: 14, zlibDeflateOptions: { level: 1, memLevel: 5 } },
  /** Full 32 KB window at the fastest level. */
  window15fast: { threshold: 1024, zlibDeflateOptions: { level: 1, memLevel: 8 } },
  /** Context takeover with a lower threshold: also compresses mid-size messages (doodle strokes). */
  lowThreshold: { threshold: 256 },
  noContextTakeover: { threshold: 1024, serverNoContextTakeover: true, clientNoContextTakeover: true, zlibDeflateOptions: { level: 1 } },
};

/** Rooms per game in each run, and players per room (the matchmaker's target sizes). */
const ROOMS: { game: string; rooms: number; players: number; config: Record<string, unknown> }[] = [
  { game: "bumper-blitz", rooms: 4, players: 6, config: { durationSeconds: 180 } },
  { game: "kitchen-rush-coop", rooms: 2, players: 3, config: {} },
  { game: "chef-rivals", rooms: 2, players: 2, config: {} },
  { game: "color-clash", rooms: 2, players: 4, config: {} },
  { game: "token-trail", rooms: 2, players: 4, config: {} },
  { game: "doodle-duel", rooms: 2, players: 6, config: {} },
];

interface Bot {
  id: string;
  game: string;
  socket: Socket;
  last: Map<string, any>;
  messages: number;
  latencies: number[];
  emit(event: string, payload?: unknown, extra?: Record<string, unknown>): Promise<any>;
}
const wireBytes = (b: Bot) => ((b.socket.io as any).engine?.transport?.ws?._socket?.bytesRead as number | undefined) ?? 0;

async function connect(url: string, game: string): Promise<Bot> {
  const id = `${game.slice(0, 4)}-${randomUUID().slice(0, 8)}`;
  const token = await signPlayerToken({ sub: id, name: `Bench ${id.slice(-4)}`, color: "#ff6b6b", kind: "guest" }, "realtime", SECRET);
  const socket = ioClient(url, { auth: { token }, transports: ["websocket"], forceNew: true, reconnection: false });
  const bot: Bot = {
    id,
    game,
    socket,
    last: new Map(),
    messages: 0,
    latencies: [],
    emit: (event, payload = {}, extra = {}) =>
      new Promise((resolve) => socket.emit(event, { id: randomUUID(), matchId: bot.last.get("room:state")?.matchId, payload, ...extra }, resolve)),
  };
  socket.onAny((event: string, env: { ts: number; payload: any }) => {
    bot.messages++;
    bot.last.set(event, env.payload);
    if (event === "game:state" && game === "bumper-blitz") bot.latencies.push(Date.now() - env.ts);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return bot;
}

async function startRoom(url: string, game: string, players: number, config: Record<string, unknown>) {
  const bots = await Promise.all(Array.from({ length: players }, () => connect(url, game)));
  const ack = await bots[0]!.emit("room:create", { gameId: game, visibility: "private", config });
  if (!ack.ok) throw Error(`${game}: ${ack.error?.message}`);
  for (const b of bots.slice(1)) {
    await b.emit("room:join", { code: ack.data.code });
    await b.emit("room:ready", { ready: true });
  }
  const started = await bots[0]!.emit("game:start");
  if (!started.ok) throw Error(`${game} start: ${started.error?.message}`);
  return bots;
}

/** Bot behaviour while measuring: Bumper Blitz steering at the real client's ~15 inputs/s; the doodle drawer strokes. */
function drive(bots: Bot[]) {
  const timers: NodeJS.Timeout[] = [];
  for (const b of bots) {
    if (b.game === "bumper-blitz") {
      timers.push(setInterval(() => void b.emit("arena:input", { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, boost: Math.random() < 0.02 }), 66));
    }
    if (b.game === "color-clash" || b.game === "token-trail") {
      // About one action a second on your turn, a human-like pace.
      timers.push(
        setInterval(() => {
          const s = b.last.get("game:state");
          const view = s?.view;
          if (!view || view.status !== "playing") return;
          if (b.game === "token-trail") {
            if (view.currentPlayerId !== b.id) return;
            void (view.phase === "roll" ? b.emit("trail:roll", {}, { v: s.version }) : b.emit("trail:move", { token: view.movable?.[0] }, { v: s.version }));
            return;
          }
          const you = view.you;
          if (!you?.isTurn) return;
          const card = you.hand.find((c: any) => c.id === you.playableIds[0]);
          if (card) void b.emit("card:play", { cardId: card.id, chosenColor: card.color ? undefined : "tide" }, { v: s.version });
          else void b.emit(you.drawnCardId ? "card:pass" : "card:draw", {}, { v: s.version });
        }, 1000),
      );
    }
    if (b.game === "doodle-duel") {
      let seq = 0;
      const stroke = `s${randomUUID().slice(0, 6)}`;
      timers.push(
        setInterval(() => {
          const view = b.last.get("game:state")?.view;
          if (!view || view.drawerId !== b.id) return;
          if (view.phase === "choosing") return void b.emit("doodle:select-word", { index: 0 });
          if (view.phase !== "drawing") return;
          const x = 100 + Math.floor(Math.random() * 800), y = 100 + Math.floor(Math.random() * 550);
          void b.emit("doodle:stroke", { strokeId: stroke, seq: seq++ % 5000, tool: "pen", color: "#1b1b1f", size: 6, points: Array.from({ length: 8 }, (_, k) => [x + k * 3, y + k * 2]) });
        }, 66),
      );
    }
  }
  return () => timers.forEach(clearInterval);
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))]! : NaN;
};

export async function run(name: string, setting: false | WsCompression) {
  const child = fork(fileURLToPath(new URL("./compression-server.ts", import.meta.url)), [JSON.stringify(setting)], { execArgv: ["--import", "tsx"], stdio: ["ignore", "inherit", "inherit", "ipc"] });
  const ask = <T>(msg: string) =>
    new Promise<T>((resolve) => {
      child.once("message", (m: any) => resolve(m.stats));
      child.send(msg);
    });
  const port = await new Promise<number>((resolve) => child.once("message", (m: any) => resolve(m.port)));
  const url = `http://127.0.0.1:${port}`;
  const all: Bot[] = [];
  for (const r of ROOMS) for (let k = 0; k < r.rooms * SCALE; k++) all.push(...(await startRoom(url, r.game, r.players, r.config)));
  const stop = drive(all);
  await new Promise((r) => setTimeout(r, WARMUP * 1000));
  const before = await ask<any>("stats");
  const bytes0 = new Map(all.map((b) => [b, wireBytes(b)]));
  const msgs0 = new Map(all.map((b) => [b, b.messages]));
  for (const b of all) b.latencies.length = 0;
  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  const after = await ask<any>("stats");
  stop();
  const perGame = ROOMS.map((r) => {
    const bots = all.filter((b) => b.game === r.game);
    const bytes = bots.reduce((n, b) => n + wireBytes(b) - bytes0.get(b)!, 0);
    const msgs = bots.reduce((n, b) => n + b.messages - msgs0.get(b)!, 0);
    return { game: r.game, rooms: r.rooms * SCALE, players: r.players, kbPerSecPerRoom: bytes / 1024 / SECONDS / (r.rooms * SCALE), msgsPerSecPerRoom: msgs / SECONDS / (r.rooms * SCALE), bytesPerMsg: msgs ? bytes / msgs : 0 };
  });
  // The two processes' clocks differ by a small constant offset, so report delivery time above the
  // fastest delivery seen in this run: the queueing and (de)compression a setting adds.
  const raw = all.filter((b) => b.game === "bumper-blitz").flatMap((b) => b.latencies);
  const floor = Math.min(...raw);
  const lat = raw.map((x) => x - floor);
  const result = {
    name,
    setting,
    clients: all.length,
    seconds: SECONDS,
    serverCpuPct: ((after.cpuMs - before.cpuMs) / (after.at - before.at)) * 100,
    serverWrittenKBps: (after.written - before.written) / 1024 / SECONDS,
    rssMb: after.rssMb,
    heapMb: after.heapMb,
    bumperLatencyMs: { p50: pct(lat, 0.5), p95: pct(lat, 0.95), p99: pct(lat, 0.99) },
    perGame,
  };
  for (const b of all) b.socket.close();
  child.send("stop");
  await new Promise((r) => child.once("exit", r));
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const names = (process.env.BENCH_CONFIGS ?? Object.keys(CONFIGS).join(",")).split(",");
  const results = [];
  for (const n of names) {
    const r = await run(n, CONFIGS[n]!);
    results.push(r);
    console.log(`\n== ${n} ${JSON.stringify(r.setting)}: ${r.clients} clients, ${r.seconds}s | server CPU ${r.serverCpuPct.toFixed(1)}% of a core | server wrote ${r.serverWrittenKBps.toFixed(0)} KB/s | RSS ${r.rssMb.toFixed(0)} MB heap ${r.heapMb.toFixed(0)} MB | Bumper delivery above fastest p50/p95/p99 ${r.bumperLatencyMs.p50}/${r.bumperLatencyMs.p95}/${r.bumperLatencyMs.p99} ms`);
    for (const g of r.perGame) console.log(`   ${g.game.padEnd(18)} ${g.kbPerSecPerRoom.toFixed(1).padStart(7)} KB/s per room | ${g.msgsPerSecPerRoom.toFixed(1).padStart(6)} msgs/s per room | ${g.bytesPerMsg.toFixed(0).padStart(5)} B per message on the wire`);
  }
  const base = results.find((r) => r.name === "off");
  if (base) for (const r of results.filter((x) => x !== base)) console.log(`\n${r.name}: total server bytes ${(base.serverWrittenKBps / r.serverWrittenKBps).toFixed(2)}x less than off; Bumper Blitz ${(base.perGame[0]!.kbPerSecPerRoom / r.perGame[0]!.kbPerSecPerRoom).toFixed(2)}x less`);
  process.exit(0);
}
