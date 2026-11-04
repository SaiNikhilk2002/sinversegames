import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { connect, sleep, startServer, type TestClient } from "./helpers";

let ctx: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
let clock = Date.now();
afterEach(async () => { for (const c of clients.splice(0)) c.close(); await ctx?.server.close(); });

async function setup() {
  clock = Date.now();
  ctx = await startServer({ FINISHED_ROOM_TTL_MS: 15_000 }, () => clock);
  const a = await connect(ctx.url, "rematch-a", "Ava"); const b = await connect(ctx.url, "rematch-b", "Ben");
  clients.push(a, b);
  const created = await a.emit<{ code: string }>("room:create", { gameId: "doodle-duel", visibility: "private", config: { rounds: 1, drawSeconds: 30 } });
  expect(created.ok).toBe(true);
  const code = (created as { data: { code: string } }).data.code;
  await b.emit("room:join", { code }); await b.emit("room:ready", { ready: true }); await a.emit("game:start");
  await a.waitFor("game:state"); await b.waitFor("game:state");
  return { a, b, code, room: ctx.server.manager.get(code)! };
}

async function finish(a: TestClient, b: TestClient) {
  // Advance the injected clock; real room timers still drive the engine.
  for (let turn = 1; turn <= 2; turn++) {
    await a.waitFor("game:state", (s) => s.view.turnNumber === turn && s.view.phase === "choosing");
    const drawer = a.last("game:state").view.drawerId === a.id ? a : b;
    const guesser = drawer === a ? b : a;
    const options = await drawer.waitFor("doodle:word-options", (p) => p.turn === turn);
    expect((await drawer.emit("doodle:select-word", { index: 0 })).ok).toBe(true);
    expect((await drawer.emit("doodle:stroke", { strokeId: `turn${turn}`, seq: 0, tool: "pen", color: "#1b1b1f", size: 12, points: [[100, 100]] })).ok).toBe(true);
    expect((await guesser.emit("doodle:guess", { text: options.options[0].text })).ok).toBe(true);
    clock += 10_000;
    // Timer delay was based on reveal time before advancing the clock.
    await sleep(4_100);
  }
  await a.waitFor("room:state", (s) => s.status === "finished");
  await b.waitFor("room:state", (s) => s.status === "finished");
}

it("starts a fresh Doodle session in the same room and rejects old/unscoped inputs and duplicate starts", async () => {
  const { a, b, code, room } = await setup();
  const oldMatch = room.matchId!;
  await finish(a, b);
  expect(room.finishedAt).not.toBeNull();
  expect(ctx.recorded).toHaveLength(1);
  expect(ctx.recorded[0]!.id).toBe(oldMatch);
  expect(a.last("room:state").players.every((p: { ready: boolean }) => !p.ready)).toBe(true);
  expect(await b.emit("game:start")).toMatchObject({ ok: false, error: { code: "NOT_HOST" } });
  await b.emit("room:ready", { ready: true });
  const starts = await Promise.all([a.emit("game:start"), a.emit("game:start")]);
  expect(starts.filter((r) => r.ok)).toHaveLength(1);
  await a.waitFor("room:state", (s) => s.matchNumber === 2);
  await a.waitFor("game:state", (s) => s.matchId !== oldMatch);
  expect(room.matchId).not.toBe(oldMatch); expect(room.finishedAt).toBeNull();
  const snapshot = a.last("room:state");
  expect(snapshot.code).toBe(code); expect(snapshot.players).toHaveLength(2); expect(snapshot.expiresAt).toBeNull();
  expect(snapshot.players.every((p: { ready: boolean }) => !p.ready)).toBe(true);
  const view = a.last("game:state").view;
  expect(view.turnNumber).toBe(1); expect(view.phase).toBe("choosing");
  expect(view.players.every((p: { score: number }) => p.score === 0)).toBe(true);
  for (const matchId of [oldMatch, null, randomUUID()]) {
    expect(await a.emit("doodle:select-word", { index: 0 }, { matchId })).toMatchObject({ ok: false, error: { code: "STALE_STATE" } });
    expect(await a.emit("doodle:stroke", { strokeId: "old-drawing", seq: 0, tool: "pen", color: "#1b1b1f", size: 12, points: [[50, 50]] }, { matchId })).toMatchObject({ ok: false, error: { code: "STALE_STATE" } });
    expect(await b.emit("doodle:guess", { text: "old guess" }, { matchId })).toMatchObject({ ok: false, error: { code: "STALE_STATE" } });
  }
  expect(room.matchNumber).toBe(2); expect(ctx.recorded).toHaveLength(1);
}, 20_000);

it("expires completed rooms on a fixed grace deadline despite readiness and sync activity", async () => {
  const { a, b, code, room } = await setup();
  await finish(a, b);
  const c = await connect(ctx.url, "rematch-c", "Cia"); clients.push(c);
  expect(await c.emit("room:create", { gameId: "color-clash", visibility: "private" })).toMatchObject({ ok: true });
  const currentRoom = ctx.server.manager.roomOf(c.id)!;
  const deadline = a.last("room:state").expiresAt;
  clock += 14_000;
  await b.emit("room:ready", { ready: true }); await a.emit("room:sync");
  expect(a.last("room:state").expiresAt).toBe(deadline);
  clock += 1_001;
  expect(await a.emit("game:start")).toMatchObject({ ok: false, error: { code: "ROOM_NOT_FOUND" } });
  expect(await c.emit("room:join", { code })).toMatchObject({ ok: false, error: { code: "ROOM_NOT_FOUND" } });
  expect(ctx.server.manager.roomOf(c.id)).toBe(currentRoom);
  expect(currentRoom.has(c.id)).toBe(true);
  ctx.server.manager.sweep();
  expect(ctx.server.manager.get(code)).toBeUndefined();
  expect(room.closed).toBe(true);
  await a.waitFor("room:closed");
}, 20_000);
