# Socket.IO WebSocket compression: benchmarks and the setting chosen

**Shipped (locally, commit `8b864a0`):** `perMessageDeflate: { threshold: 1024 }` on the realtime server (`WS_COMPRESSION` in `apps/realtime/src/server.ts`). That's per-message deflate with the `ws` library's defaults: **the compression context is kept between messages** (32 KB window, zlib default level, memLevel 8), and messages under 1 KB stay uncompressed.

**Measured result**, with the real server, the real `socket.io-client`, all six multiplayer games and 248 concurrent clients:
- **13.1× less Bumper Blitz traffic:** 2,072 → 158 bytes per message on the wire;
- **11.6× less server output** across all games.

That's more than the 3.2× the earlier audit estimated. The audit compressed each message on its own; consecutive game states repeat each other, so keeping the context is what pays.

## What was inspected

- **Server:** `apps/realtime/src/server.ts`.
  - Transports `websocket` and `polling`; `maxHttpBufferSize` 32 KB; ping 15 s / 20 s.
  - `perMessageDeflate` wasn't set, so it was off: Socket.IO's default since v3 ([server options](https://socket.io/docs/v4/server-options/)).
  - `httpCompression` (long-polling) is on by default.
- **Engine.IO 6.6.11:** passes `perMessageDeflate` to `ws` 8 (`build/server.js`), and defaults the threshold to 1,024 B.
  - `ws` compresses any message at or above the threshold once a client has negotiated the extension.
  - The room code sends to each member individually (`Room.send`). There are no Socket.IO broadcasts, so the pre-encoded broadcast frame path isn't involved.
- **Client:** `apps/web/src/lib/realtime/connection.ts`.
  - Polling first, then the WebSocket upgrade, with `tryAllTransports`.
  - Browsers' native WebSocket negotiates `permessage-deflate` automatically; **no client change is needed.**
- **Payloads:** JSON envelopes `{ id, roomId, matchId, seq, ts, payload }`. No binary, nothing pre-compressed.
- **Bumper Blitz broadcast:**
  - a 50 ms server tick (20 Hz);
  - each tick, a full `game:state` view (about 2 KB) to **each** player, identical for every player;
  - the client renders 100 ms behind with interpolation, and sends input at most about 15 times a second.

## Method

`pnpm --filter @platform/realtime bench:compression` (`apps/realtime/bench/compression.ts`, `compression-server.ts`):

- **Server process.** The real `createRealtimeServer` runs in a **child process**, with no database and each compression setting in turn. It reports its own CPU (`process.cpuUsage`), memory and bytes written, so the bots' work doesn't count.
- **Bots.** Real `socket.io-client` bots join private rooms of every multiplayer game, at the matchmaker's target sizes:

  | Game | Players per room | Rooms |
  |---|---|---|
  | Bumper Blitz | 6 | 4 |
  | Kitchen Rush Co-op | 3 | 2 |
  | Chef Rivals | 2 | 2 |
  | Color Clash | 4 | 2 |
  | Token Trail (the Ludo-style game) | 4 | 2 |
  | Doodle Duel | 6 | 2 |

  That's 62 clients; `BENCH_SCALE=4` gives 248.
- **What they do:**
  - Bumper Blitz bots steer about 15 times a second, as the real client does.
  - Color Clash and Token Trail bots play about once a second on their turn.
  - The Doodle drawer picks a word and strokes about 15 times a second.
  - **Kitchen Rush Co-op and Chef Rivals bots don't cook** (their traffic is the server's syncs only), so the co-op figures are a lower bound.
- **Measurement:** 4 s of warm-up, then **30 s** measured.
  - Bytes are read from each client's TCP socket: wire bytes, including WebSocket framing.
  - Delivery delay is the time from Bumper Blitz's server timestamp to receipt, reported above the fastest delivery in that run, because the two processes' clocks differ by a constant.
- **Machine:** Windows 11 laptop, 16 logical processors, Node 24.14.0, loopback, 2026-11-14.
  - CPU readings at 62 clients varied by about ±5 points between runs; the 248-client runs are the reliable ones for CPU and memory.
  - An unrelated process from an earlier session was using one core throughout.

## Results: 248 clients, 56 rooms, 30 s each

| Setting | Server CPU (one core = 100%) | RSS | Server output | p50 / p95 / p99 delay above fastest |
|---|---|---|---|---|
| **Off (before)** | 23.5% | 154 MB | 4,425 KB/s | 0 / 1 / 3 ms |
| 8 KB window, level 1, memLevel 4 | 42.8% | 240 MB | 518 KB/s (**8.55× less**) | 2 / 6 / 7 ms |
| **Context takeover, ws defaults (shipped)** | **49.8%** | **271 MB** | **381 KB/s (11.63× less)** | 2 / 5 / 6 ms |
| Context takeover, 256 B threshold | 45.4% | 278 MB | 376 KB/s | 2 / 6 / 8 ms |

**Per game, wire bytes per message** (same runs):

| Game | Messages/s per room | Off | Shipped | Ratio | KB/s per room, off → on |
|---|---|---|---|---|---|
| **Bumper Blitz** (6 players) | 123.7 | 2,072 B | **158 B** | **13.1×** | **250.0 → 19.1** |
| Kitchen Rush Co-op (3, syncs only) | 5.4 | 1,734 B | 87 B | 19.9× | 9.0 → 0.5 |
| Chef Rivals (2, syncs only) | 1.7 | 3,211 B | 109 B | 29.6× | 5.4 → 0.2 |
| Color Clash (4) | 7.8 | 890 B | 84 B | 10.3× | 7.1 → 0.6 |
| Token Trail (4) | 8.0 | 719 B | 73 B | 9.7× | 5.6 → 0.6 |
| Doodle Duel (6) | 75.1 | 359 B | 103 B | 3.5× | 26.0 → 7.6 |

**Smaller runs** (62 clients, 30 s; total server output against off):

| Setting | Total output vs off | Bumper Blitz vs off |
|---|---|---|
| Context takeover (shipped) | 11.62× less | 13.09× less |
| 32 KB window at level 1 | 9.50× | 10.39× |
| 16 KB window | 9.20× | 10.03× |
| 8 KB window | 8.65× | 9.34× |
| 2 KB window ("low memory") | 3.46× | 3.44× |
| **No context takeover** (each message alone, the earlier audit's assumption) | **2.72×** | **3.03×** |

A 2 KB window can't reach back past a 2 KB message, which is why it barely beats compressing each message alone.

## Why this setting

On Railway's prices, per 248 clients playing continuously for a month:

| Change | Egress saved | Extra CPU | Extra memory |
|---|---|---|---|
| Off → 8 KB window | ≈ 10 TB (≈ $514) | +0.19 vCPU (≈ $3.90) | +86 MB (≈ $0.90) |
| 8 KB → **32 KB window (shipped)** | another ≈ 360 GB (≈ $18) | +0.07 vCPU (≈ $1.40) | +31 MB (≈ $0.30) |

Egress dominates, so the bigger window wins. Memory is about **0.5 MB per busy socket**: about 470 MB at 1,000 simultaneous players, well within a Railway service.

**Not applied blindly:**
- **Small messages stay uncompressed.** The 1 KB threshold leaves out acknowledgements, lobby updates and most Doodle stroke relays. Lowering it to 256 B saved nothing measurable.
- **Nothing is already compressed.** There's no binary, and nothing pre-compressed.
- **Off the event loop.** `ws` runs zlib on libuv's thread pool, not on the event loop.

## Compatibility (tested)

`apps/realtime/test/compression.test.ts`, 5 tests:

- **Negotiation:** the extension is negotiated with a client that supports it.
- **A declining client** (`perMessageDeflate: false`) is served uncompressed in the same room, with **byte-identical game states**. The compressing client receives far fewer wire bytes for the same stream.
- **Long-polling only** still works, with HTTP compression.
- **Polling first, then upgrade:** a polling-first client upgrades to a compressed WebSocket.
- **Reconnection:** a dropped client returns to its seat with the current state and `game:reconnected`.
- **Concurrent rooms:** Bumper Blitz, Token Trail, Color Clash and Kitchen Rush Co-op run at once, with no message crossing rooms.
- **The 61 existing realtime tests now run with compression on** (it's the default): rooms, matchmaking, acknowledgements, idempotent actions, reconnection grace, rematch, Chef Rivals, Kitchen Rush Co-op and the new games.
- `bumper-bandwidth.test.ts` keeps the Bumper Blitz state stream compressible (`BUMPER_BLITZ_BANDWIDTH_OPTIMIZATION.md`).

**Unchanged:** event names, payload shapes, acknowledgements, room membership, matchmaking and server authority. Only the bytes on the wire change.

## Rollback

Set `WS_COMPRESSION` to `false` and redeploy realtime. Clients need nothing.
