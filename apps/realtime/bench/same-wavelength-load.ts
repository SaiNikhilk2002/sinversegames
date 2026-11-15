/**
 * Same Wavelength under concurrent room load (docs/SAME_WAVELENGTH_DESIGN.md).
 *
 *   pnpm --filter @platform/realtime bench:wavelength        (WAVE_COUPLES=40 WAVE_GROUPS=10 BENCH_SECONDS=30)
 *
 * Runs the real server in a child process (bench/compression-server.ts, production compression) and
 * plays many rooms at once with bots that answer within a second or two and ready up after each
 * reveal: Couples rooms of 2 and Group rooms of 6. Reports the server's CPU and memory, and the
 * traffic and messages per room. Local loopback; no database.
 */
import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { io as ioClient, type Socket } from "socket.io-client";
import { signPlayerToken } from "@platform/shared/identity";
import { testConfig } from "../src/config";
import { WS_COMPRESSION } from "../src/server";

const SECRET = testConfig().AUTH_SECRET;
const COUPLES = Number(process.env.WAVE_COUPLES ?? 40);
const GROUPS = Number(process.env.WAVE_GROUPS ?? 10);
const SECONDS = Number(process.env.BENCH_SECONDS ?? 30);

interface Bot {
  id: string;
  socket: Socket;
  state: any;
  room: any;
  messages: number;
  emit(event: string, payload?: unknown): Promise<any>;
}
const wire = (b: Bot) => ((b.socket.io as any).engine?.transport?.ws?._socket?.bytesRead as number | undefined) ?? 0;

async function bot(url: string): Promise<Bot> {
  const id = `wave-${randomUUID().slice(0, 8)}`;
  const token = await signPlayerToken({ sub: id, name: id.slice(-4), color: "#ff7a9c", kind: "guest" }, "realtime", SECRET);
  const socket = ioClient(url, { auth: { token }, transports: ["websocket"], forceNew: true, reconnection: false });
  const b: Bot = {
    id,
    socket,
    state: null,
    room: null,
    messages: 0,
    emit: (event, payload = {}) => new Promise((resolve) => socket.emit(event, { id: randomUUID(), matchId: b.room?.matchId ?? null, payload }, resolve)),
  };
  socket.onAny((event: string, env: { payload: any }) => {
    b.messages++;
    if (event === "room:state") b.room = env.payload;
    if (event === "game:state") b.state = env.payload;
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return b;
}

async function room(url: string, size: number, mode: string) {
  const bots = await Promise.all(Array.from({ length: size }, () => bot(url)));
  const created = await bots[0]!.emit("room:create", { gameId: "same-wavelength", visibility: "private", config: { mode, rounds: 12, answerSeconds: 20, textAnswers: true } });
  if (!created.ok) throw Error(created.error?.message);
  for (const b of bots.slice(1)) {
    await b.emit("room:join", { code: created.data.code });
    await b.emit("room:ready", { ready: true });
  }
  await bots[0]!.emit("game:start");
  return bots;
}

/** Answers once per round after a human-like pause, readies up after each reveal, rematches when a game ends. */
function play(bots: Bot[]) {
  const answered = new Map<Bot, number>();
  const next = new Map<Bot, number>();
  const timer = setInterval(() => {
    for (const b of bots) {
      const v = b.state?.view;
      if (!v) continue;
      if (v.phase === "answering" && answered.get(b) !== v.round && !v.you?.answer && Math.random() < 0.25) {
        answered.set(b, v.round);
        const p = v.prompt;
        const pick = p.options[Math.floor(Math.random() * Math.max(1, p.options.length))];
        void b.emit("wave:answer", { round: v.round, ...(p.kind === "text" ? { text: Math.random() < 0.5 ? "pizza" : "tacos" } : p.kind === "who" ? { player: pick.id } : { option: pick.id }) });
      }
      if (v.phase === "reveal" && next.get(b) !== v.round && Math.random() < 0.3) {
        next.set(b, v.round);
        void b.emit("wave:next", { round: v.round });
      }
    }
    // A finished game starts again, so rooms stay busy for the whole window.
    for (const b of bots) if (b.room?.status === "finished" && b.room?.hostId === b.id) void b.emit("game:start");
    for (const b of bots) if (b.room?.status === "finished" && b.room?.hostId !== b.id && !b.room.players.find((p: any) => p.id === b.id)?.ready) void b.emit("room:ready", { ready: true });
  }, 250);
  return () => clearInterval(timer);
}

const child = fork(fileURLToPath(new URL("./compression-server.ts", import.meta.url)), [JSON.stringify(WS_COMPRESSION)], { execArgv: ["--import", "tsx"], stdio: ["ignore", "inherit", "inherit", "ipc"] });
const ask = () =>
  new Promise<any>((resolve) => {
    child.once("message", (m: any) => resolve(m.stats));
    child.send("stats");
  });
const port = await new Promise<number>((resolve) => child.once("message", (m: any) => resolve(m.port)));
const url = `http://127.0.0.1:${port}`;
const idle = await ask();
const groups: Bot[][] = [];
for (let k = 0; k < COUPLES; k++) groups.push(await room(url, 2, "couples"));
for (let k = 0; k < GROUPS; k++) groups.push(await room(url, 6, "group"));
const stops = groups.map(play);
await new Promise((r) => setTimeout(r, 4000));
const all = groups.flat();
const before = await ask();
const bytes0 = new Map(all.map((b) => [b, wire(b)]));
const msgs0 = new Map(all.map((b) => [b, b.messages]));
await new Promise((r) => setTimeout(r, SECONDS * 1000));
const after = await ask();
stops.forEach((s) => s());
const rounds = all.reduce((n, b) => Math.max(n, b.state?.view?.round ?? 0), 0);
const kb = all.reduce((n, b) => n + wire(b) - bytes0.get(b)!, 0) / 1024;
const msgs = all.reduce((n, b) => n + b.messages - msgs0.get(b)!, 0);
console.log(`Same Wavelength load: ${COUPLES} Couples rooms (2) + ${GROUPS} Group rooms (6) = ${groups.length} rooms, ${all.length} players, ${SECONDS}s, production compression`);
console.log(`server CPU ${(((after.cpuMs - before.cpuMs) / (after.at - before.at)) * 100).toFixed(1)}% of one core | RSS idle ${idle.rssMb.toFixed(0)} MB -> ${after.rssMb.toFixed(0)} MB | heap ${after.heapMb.toFixed(0)} MB`);
console.log(`to clients: ${(kb / SECONDS).toFixed(1)} KB/s total, ${(kb / SECONDS / groups.length).toFixed(2)} KB/s per room, ${(msgs / SECONDS / groups.length).toFixed(2)} messages/s per room | furthest round reached: ${rounds}`);
for (const b of all) b.socket.close();
child.send("stop");
await new Promise((r) => child.once("exit", r));
process.exit(0);
