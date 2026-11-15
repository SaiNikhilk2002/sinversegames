/**
 * Child process for bench/compression.ts: the real realtime server (no database), with the WebSocket
 * compression settings passed as JSON in argv[2]. Reports its own CPU, memory and bytes written over
 * IPC, so the client bots running in the parent don't pollute the measurements.
 */
import type { Socket as NetSocket } from "node:net";
import { testConfig } from "../src/config";
import { noopPersistence } from "../src/persistence";
import { createRealtimeServer } from "../src/server";

const perMessageDeflate = JSON.parse(process.argv[2] ?? "false");
const server = createRealtimeServer({
  config: testConfig({ LOG_LEVEL: "error", MAX_CONNECTIONS_PER_IP: 10_000, MAX_ROOMS: 10_000 }),
  persistence: noopPersistence,
  perMessageDeflate,
});
const open = new Set<NetSocket>();
let closedBytes = 0;
server.http.on("connection", (s: NetSocket) => {
  open.add(s);
  s.once("close", () => {
    closedBytes += s.bytesWritten;
    open.delete(s);
  });
});
const port = await server.listen(0, "127.0.0.1");
const stats = () => {
  let written = closedBytes;
  for (const s of open) written += s.bytesWritten;
  const cpu = process.cpuUsage();
  const mem = process.memoryUsage();
  return { written, cpuMs: (cpu.user + cpu.system) / 1000, rssMb: mem.rss / 1048576, heapMb: mem.heapUsed / 1048576, at: performance.now() };
};
process.send!({ port });
process.on("message", (m) => {
  if (m === "stats") process.send!({ stats: stats() });
  if (m === "stop") void server.close().then(() => process.exit(0));
});
