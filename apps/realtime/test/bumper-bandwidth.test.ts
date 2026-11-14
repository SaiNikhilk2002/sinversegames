import { constants, createDeflateRaw } from "node:zlib";
import { describe, expect, it } from "vitest";
import { bumperBlitzEngine, seededRng } from "@platform/engines";

/**
 * Bumper Blitz bandwidth budget (docs/BUMPER_BLITZ_BANDWIDTH_OPTIMIZATION.md). The server sends
 * every player a full view 20 times a second (about 2 KB of JSON). With WebSocket compression
 * keeping its context between messages, consecutive views cost about 150 bytes, because they repeat
 * each other. A future change that makes views less repetitive (random ids, unsorted keys,
 * per-tick noise) would quietly undo that; this deterministic replay keeps it in budget.
 */
function deflateStream() {
  // As ws does for permessage-deflate with context takeover: one raw deflate stream, synced per message.
  const z = createDeflateRaw({ windowBits: 15, memLevel: 8 });
  let bytes = 0;
  z.on("data", (c: Buffer) => (bytes += c.length));
  return {
    push: (s: string) => new Promise<void>((resolve) => (z.write(s), z.flush(constants.Z_SYNC_FLUSH, () => resolve()))),
    bytes: () => bytes,
  };
}

describe("Bumper Blitz state stream", () => {
  it("stays compressible: under 250 bytes a view on the wire, at least 8x smaller than raw", async () => {
    const rng = seededRng(42);
    const steer = seededRng(7);
    const players = Array.from({ length: 6 }, (_, i) => ({ id: `0b8f3c2e-9d1a-4c7b-8e2f-${String(i).padStart(12, "0")}`, name: `Player ${i}`, color: "#ff6b6b" }));
    let now = 1_000_000;
    let s = bumperBlitzEngine.create(players, bumperBlitzEngine.configSchema.parse({ durationSeconds: 90 }), { now, rng }).state;
    const stream = deflateStream();
    let raw = 0, views = 0;
    for (let t = 0; t < 900; t++) {
      now = bumperBlitzEngine.nextDeadline(s)!;
      // Steering at about 10 inputs a second per player, as real play does.
      if (t % 2 === 0)
        for (const p of players) {
          const r = bumperBlitzEngine.handleAction(s, p.id, { type: "arena:input", x: steer.int(201) / 100 - 1, y: steer.int(201) / 100 - 1, boost: steer.int(40) === 0 }, { now, rng });
          if (r.ok) s = r.state;
        }
      const r = bumperBlitzEngine.tick(s, { now, rng });
      if (!r.ok) throw Error("tick failed");
      s = r.state;
      if (t < 80 || !r.stateChanged) continue; // after the countdown
      // The envelope Room.send wraps around every view (a fresh id per message, as in production).
      const envelope = JSON.stringify({ id: `00000000-0000-4000-8000-${String(t).padStart(12, "0")}`, roomId: "ABCDEF", matchId: "9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d", seq: t, ts: now, payload: { version: t, matchId: "9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d", view: bumperBlitzEngine.viewFor(s, players[0]!.id) } });
      raw += envelope.length;
      views++;
      await stream.push(envelope);
    }
    expect(views).toBeGreaterThan(700);
    const perView = stream.bytes() / views;
    expect(raw / views).toBeGreaterThan(1500); // the raw view is still the full ~2 KB snapshot
    expect(perView).toBeLessThan(250);
    expect(raw / stream.bytes()).toBeGreaterThan(8);
  });
});
