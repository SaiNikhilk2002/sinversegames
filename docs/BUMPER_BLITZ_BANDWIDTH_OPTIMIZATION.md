# Bumper Blitz bandwidth

**Decision:**
- **Compression (`SOCKET_IO_COMPRESSION_BENCHMARKS.md`) is the optimisation:** 250 → 19 KB/s per 6-player room, 13×.
- **No protocol change.** Measured after compression, the remaining savings are about 10% and would need a breaking client/server change.
- **A deterministic test keeps the stream compressible.**

## What is sent

`packages/engines/src/bumper-blitz/engine.ts` and `apps/realtime/src/rooms/room.ts`:
- **Rate:** the server ticks every **50 ms** (20 Hz); `TICK_MS` is unchanged.
- **Content:** each tick, every player gets a full `game:state` view, the same for all players (`viewFor` ignores the player).
- **Size:** about 2.1 KB with its envelope. Measured mid-match:

  | Part | Bytes |
  |---|---|
  | Pods (6 × about 260) | 1,565 |
  | Static: bumpers, config, timings | 169 |
  | Pod identity: ids, names, colours | 516 |
  | Envelope: a random UUID, match id twice, sequence, time | about 220 |

- **Precision:** positions and velocities are **already rounded** to 0.1 (`r1`), so precision isn't the waste.
- **Client:** keeps a snapshot history and renders 100 ms behind with interpolation (`INTERP_DELAY_MS`), and sends input at most about 15 times a second (`SEND_INTERVAL_MS` 66).

## Measured options (2026-11-14)

| Approach | Bytes per view on the wire | Notes |
|---|---|---|
| Today, uncompressed | 2,072 (benchmark) | — |
| **Compression with context (shipped)** | **158** (benchmark), 148 (stream model) | Consecutive views repeat each other; the static fields and keys cost almost nothing |
| Compression **plus** stripping every static field, short keys, flags only when set | 133 (stream model) | **−10%** on top. It needs a new client that caches static fields, deployed before the server, or old tabs break |
| Lower tick or broadcast rate (for example 10 Hz) | about −50% messages | Changes how the game feels (the interpolation delay is tuned for 20 Hz). Not done: gameplay first |

The stream model replays 1,400 views through a raw deflate stream synced per message, as `ws` does.

**What remains after compression is real information:** moving positions, timestamps, and the envelope's random UUID (about 20 bytes a message). Removing the UUID would change the shared envelope protocol for every game, for about 13%.

**Cost context, typical month (`node docs/infrastructure-cost-model.mjs`):** with compression, Railway's egress for the whole game mix at 1,000 peak players is about 1 TB, about $48. A further 10% on Bumper Blitz's two-thirds share would be about $3 a month. That isn't worth a breaking protocol change now. Revisit if Bumper Blitz egress grows well beyond that.

## Preserved

- Server-authoritative physics, collisions, fairness and the tick rate.
- Reconnection state (`syncMessages` and resync).
- Client interpolation.

**Nothing in the engine or client changed.**

## Tests

- **`apps/realtime/test/bumper-bandwidth.test.ts`:** a seeded 6-player match (deterministic inputs), streamed through the same compression. It requires under 250 bytes a view and at least 8× smaller than raw. It fails if a future change makes the views less repetitive.
- **Existing Bumper Blitz tests** (`new-games.test.ts`, now over compressed sockets): physics, knockouts, powerups and hazards, results. Also the compression tests' state equality between compressed and uncompressed clients, and the Bumper Blitz browser coverage (`apps/web/e2e/multiplayer-new.spec.ts`) in the full suite.
