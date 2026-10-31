import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signPlayerToken } from "@platform/shared/identity";
import { connect, latestState, sleep, startServer, SECRET, type TestClient } from "./helpers";

let ctx: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
const join = async (id?: string, name?: string) => {
  const c = await connect(ctx.url, id, name);
  clients.push(c);
  return c;
};

beforeEach(async () => {
  ctx = await startServer({ RECONNECT_GRACE_MS: 800 });
});
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await ctx.server.close();
});

async function createRoom(host: TestClient, gameId = "color-clash", config?: Record<string, unknown>) {
  const ack = await host.emit<{ code: string }>("room:create", { gameId, visibility: "private", config });
  expect(ack.ok).toBe(true);
  return (ack as { data: { code: string } }).data.code;
}

/** Plays Color Clash with simple bots until the match ends. */
async function playColorClash(players: TestClient[], maxMoves = 3000) {
  for (let moves = 0; moves < maxMoves; moves++) {
    if (players.every((p) => p.last("game:ended"))) return;
    let acted = false;
    for (const p of players) {
      const s = latestState(p);
      if (!s || s.view.status !== "playing" || !s.view.you?.isTurn) continue;
      const you = s.view.you;
      let ack;
      if (you.playableIds.length) {
        const card = you.hand.find((c: any) => c.id === you.playableIds[0]);
        ack = await p.emit("card:play", { cardId: card.id, chosenColor: card.color ? undefined : "tide" }, { v: s.version });
      } else if (you.drawnCardId) {
        ack = await p.emit("card:pass", {}, { v: s.version });
      } else {
        ack = await p.emit("card:draw", {}, { v: s.version });
      }
      if (ack.ok) acted = true;
      else if (ack.error.code === "RATE_LIMITED") await sleep(200);
      else if (ack.error.code !== "STALE_STATE" && ack.error.code !== "NOT_YOUR_TURN") throw new Error(`Bot move failed: ${ack.error.code} ${ack.error.message}`);
    }
    if (!acted) await sleep(5);
  }
  throw new Error("Match did not finish");
}

describe("authentication", () => {
  it("rejects connections without a valid token", async () => {
    await expect(connect(ctx.url, "x", "x", "not-a-token")).rejects.toThrow(/UNAUTHORIZED/);
    const forged = await signPlayerToken({ sub: "a", name: "a", color: "#000", kind: "guest" }, "realtime", SECRET + "wrong");
    await expect(connect(ctx.url, "x", "x", forged)).rejects.toThrow(/UNAUTHORIZED/);
    const sessionToken = await signPlayerToken({ sub: "a", name: "a", color: "#000", kind: "guest" }, "session", SECRET);
    await expect(connect(ctx.url, "x", "x", sessionToken)).rejects.toThrow(/UNAUTHORIZED/);
  });

  it("rejects banned players", async () => {
    await expect(connect(ctx.url, "banned-1")).rejects.toThrow(/BANNED/);
  });

  it("identity comes from the token, not from the payload", async () => {
    const a = await join("alice", "Alice");
    const code = await createRoom(a);
    const snapshot = await a.waitFor("room:state", (s) => s.code === code);
    expect(snapshot.players.map((p: any) => p.id)).toEqual(["alice"]);
    expect(snapshot.hostId).toBe("alice");
  });
});

describe("rooms", () => {
  it("creates a private room that another player can join by code", async () => {
    const a = await join("a", "Ava");
    const b = await join("b", "Ben");
    const code = await createRoom(a);
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect((await b.emit("room:join", { code: code.toLowerCase() })).ok).toBe(true);
    const state = await a.waitFor("room:state", (s) => s.players.length === 2);
    expect(state.players.map((p: any) => p.name)).toEqual(["Ava", "Ben"]);
  });

  it("handles invalid and full rooms", async () => {
    const a = await join();
    expect(await a.emit("room:join", { code: "ZZZZZZ" })).toMatchObject({ ok: false, error: { code: "ROOM_NOT_FOUND" } });
    expect(await a.emit("room:join", { code: "bad!" })).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
    const code = await createRoom(a);
    for (let i = 0; i < 3; i++) expect((await (await join()).emit("room:join", { code })).ok).toBe(true);
    expect(await (await join()).emit("room:join", { code })).toMatchObject({ ok: false, error: { code: "ROOM_FULL" } });
  });

  it("enforces host controls, readiness and player counts", async () => {
    const a = await join("host");
    const b = await join("guest");
    const code = await createRoom(a);
    expect(await a.emit("game:start")).toMatchObject({ ok: false, error: { code: "NOT_ENOUGH_PLAYERS" } });
    await b.emit("room:join", { code });
    expect(await b.emit("game:start")).toMatchObject({ ok: false, error: { code: "NOT_HOST" } });
    expect(await a.emit("game:start")).toMatchObject({ ok: false, error: { code: "PLAYERS_NOT_READY" } });
    expect(await b.emit("room:configure", { config: { handSize: 5 } })).toMatchObject({ ok: false, error: { code: "NOT_HOST" } });
    expect(await a.emit("room:configure", { config: { handSize: 99 } })).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
    expect((await a.emit("room:configure", { config: { handSize: 5 } })).ok).toBe(true);
    await b.emit("room:ready", { ready: true });
    expect((await a.emit("game:start")).ok).toBe(true);
    const s = await b.waitFor("game:state");
    expect(s.view.you.hand).toHaveLength(5);
    // Nobody can join a game in progress.
    expect(await (await join()).emit("room:join", { code })).toMatchObject({ ok: false, error: { code: "ROOM_IN_PROGRESS" } });
  });

  it("transfers host when the host leaves and removes empty rooms", async () => {
    const a = await join("a");
    const b = await join("b");
    const code = await createRoom(a);
    await b.emit("room:join", { code });
    await a.emit("room:leave");
    const s = await b.waitFor("room:state", (x) => x.players.length === 1);
    expect(s.hostId).toBe("b");
    await b.emit("room:leave");
    expect(ctx.server.manager.get(code)).toBeUndefined();
  });

  it("kicked players are notified and removed", async () => {
    const a = await join("a");
    const b = await join("b");
    const code = await createRoom(a);
    await b.emit("room:join", { code });
    expect((await a.emit("room:kick", { playerId: "b" })).ok).toBe(true);
    expect(await b.waitFor("room:closed")).toMatchObject({ reason: "kicked" });
    expect(ctx.server.manager.get(code)!.has("b")).toBe(false);
  });

  it("a player can only be in one room at a time", async () => {
    const a = await join("solo");
    const first = await createRoom(a);
    const second = await createRoom(a);
    expect(ctx.server.manager.get(first)).toBeUndefined(); // left and emptied
    expect(ctx.server.manager.roomOf("solo")!.code).toBe(second);
  });
});

describe("Color Clash over sockets", () => {
  async function startDuel() {
    const a = await join("a", "Ava");
    const b = await join("b", "Ben");
    const code = await createRoom(a, "color-clash", { handSize: 5, turnSeconds: 0 });
    await b.emit("room:join", { code });
    await b.emit("room:ready", { ready: true });
    expect((await a.emit("game:start")).ok).toBe(true);
    await a.waitFor("game:state");
    await b.waitFor("game:state");
    return { a, b, code };
  }

  it("plays a complete match, announces results and persists them", async () => {
    const { a, b, code } = await startDuel();
    await playColorClash([a, b]);
    const results = await a.waitFor("game:ended");
    expect(results.entries).toHaveLength(2);
    expect(results.entries.filter((e: any) => e.isWinner)).toHaveLength(1);
    await sleep(20);
    expect(ctx.recorded).toHaveLength(1);
    expect(ctx.recorded[0]!.roomCode).toBe(code);
    const room = await b.waitFor("room:state", (s) => s.status === "finished");
    expect(room.lastResults.entries).toHaveLength(2);
    // The host can start a rematch from the same room.
    await b.emit("room:ready", { ready: true });
    expect((await a.emit("game:start")).ok).toBe(true);
  });

  it("never sends one player another player's hand", async () => {
    const { a, b } = await startDuel();
    const aHand = latestState(a)!.view.you.hand.map((c: any) => c.id);
    const bPayloads = JSON.stringify(b.events.map((e) => e.env.payload));
    for (const id of aHand) expect(bPayloads).not.toContain(`"${id}"`);
    expect(latestState(b)!.view.players.find((p: any) => p.id === "a").cardCount).toBe(5);
  });

  it("serializes simultaneous actions, rejects stale and out-of-turn moves, and dedupes retries", async () => {
    const { a, b } = await startDuel();
    const s = latestState(a)!;
    const [turnTaker, waiting] = s.view.currentPlayerId === "a" ? [a, b] : [b, a];
    const v = latestState(turnTaker)!.version;
    expect(await waiting.emit("card:draw", {}, { v })).toMatchObject({ ok: false, error: { code: "NOT_YOUR_TURN" } });
    const [r1, r2] = await Promise.all([
      turnTaker.emit("card:draw", {}, { v, id: "dup-action-0001" }),
      waiting.emit("card:draw", {}, { v }),
    ]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    expect(["NOT_YOUR_TURN", "STALE_STATE"]).toContain((r2 as any).error.code);
    const handAfter = latestState(turnTaker)!.view.you.hand.length;
    // Retrying the same action id returns the original ack and does not draw again.
    const retry = await turnTaker.emit("card:draw", {}, { v, id: "dup-action-0001" });
    expect(retry).toEqual(r1);
    await sleep(30);
    expect(latestState(turnTaker)!.view.you.hand.length).toBe(handAfter);
    // An action based on an old version is rejected.
    expect(await turnTaker.emit("card:draw", {}, { v: v - 1 })).toMatchObject({ ok: false, error: { code: "STALE_STATE" } });
  });

  it("rejects invalid payloads and actions from other games", async () => {
    const { a } = await startDuel();
    const v = latestState(a)!.version;
    expect(await a.emit("card:play", { cardId: 42 }, { v })).toMatchObject({ ok: false });
    expect(await a.emit("doodle:guess", { text: "hi" })).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  });

  it("restores state after a reconnect and tells others about the disconnect", async () => {
    const { a, b } = await startDuel();
    const hand = latestState(b)!.view.you.hand.map((c: any) => c.id).sort();
    b.close();
    await a.waitFor("room:state", (s) => s.players.some((p: any) => p.id === "b" && !p.connected));
    const b2 = await join("b", "Ben");
    expect((await b2.emit("room:join", { code: ctx.server.manager.roomOf("b")!.code })).ok).toBe(true);
    await b2.waitFor("game:reconnected");
    const restored = latestState(b2)!;
    expect(restored.view.you.hand.map((c: any) => c.id).sort()).toEqual(hand);
    await a.waitFor("room:state", (s) => s.players.every((p: any) => p.connected));
  });

  it("ends the match when a disconnected player's grace period expires", async () => {
    const { a, b } = await startDuel();
    b.close();
    const results = await a.waitFor("game:ended", () => true, 3000);
    expect(results.reason).toBe("players-left");
    expect(results.entries.find((e: any) => e.playerId === "a").isWinner).toBe(true);
  });

  it("replaces a duplicate session for the same player", async () => {
    const { b } = await startDuel();
    const code = ctx.server.manager.roomOf("b")!.code;
    const b2 = await join("b", "Ben");
    await b2.emit("room:join", { code });
    await b.waitFor("session:replaced");
    expect(latestState(b2)).toBeDefined();
  });

  it("isolates rooms from each other", async () => {
    const { a, b } = await startDuel();
    const c = await join("c");
    const d = await join("d");
    const code2 = await createRoom(c, "doodle-duel");
    await d.emit("room:join", { code: code2 });
    await d.emit("room:ready", { ready: true });
    await c.emit("game:start");
    await c.waitFor("game:state");
    await playColorClash([a, b]);
    for (const e of [...a.events, ...b.events]) {
      if (e.env.roomId) expect(e.env.roomId).not.toBe(code2);
      expect(e.event.startsWith("doodle:")).toBe(false);
    }
    for (const e of [...c.events, ...d.events]) expect(e.event).not.toBe("game:action");
  });
});

describe("Doodle Duel over sockets", () => {
  it("keeps the word private, syncs strokes and scores correct guesses on the server", async () => {
    const a = await join("a", "Ava");
    const b = await join("b", "Ben");
    const code = await createRoom(a, "doodle-duel", { rounds: 1, drawSeconds: 30 });
    await b.emit("room:join", { code });
    await b.emit("room:ready", { ready: true });
    await a.emit("game:start");
    const first = await a.waitFor("game:state");
    const drawerId = first.view.drawerId;
    const [drawer, guesser] = drawerId === "a" ? [a, b] : [b, a];

    const options = await drawer.waitFor("doodle:word-options");
    expect(options.options).toHaveLength(3);
    expect(guesser.all("doodle:word-options")).toHaveLength(0);
    expect((await drawer.emit("doodle:select-word", { index: 0 })).ok).toBe(true);
    const word = options.options[0].text as string;
    await guesser.waitFor("game:state", (s) => s.view.phase === "drawing");

    // Guessers cannot draw; the drawer's strokes reach the guesser.
    const stroke = { strokeId: "s1", seq: 0, tool: "pen", color: "#1b1b1f", size: 6, points: [[100, 100], [200, 150]] };
    expect(await guesser.emit("doodle:stroke", stroke)).toMatchObject({ ok: false, error: { code: "NOT_YOUR_TURN" } });
    expect((await drawer.emit("doodle:stroke", stroke)).ok).toBe(true);
    const relayed = await guesser.waitFor("doodle:stroke");
    expect(relayed.points).toEqual(stroke.points);

    // A late (re)joining guesser receives the canvas.
    expect((await guesser.emit("room:sync")).ok).toBe(true);
    const canvas = await guesser.waitFor("doodle:canvas");
    expect(canvas.strokes).toHaveLength(1);

    // Nothing the guesser received so far contains the word.
    expect(JSON.stringify(guesser.events.map((e) => e.env.payload))).not.toContain(`"${word}"`);

    expect((await guesser.emit("doodle:guess", { text: word.toUpperCase() })).ok).toBe(true);
    const correct = await drawer.waitFor("doodle:guess", (m) => m.kind === "correct");
    expect(correct.points).toBeGreaterThan(100);
    const ended = await guesser.waitFor("doodle:round-ended");
    expect(ended.word).toBe(word);
    expect(ended.points[guesser.id]).toBe(correct.points);
  });

  it("rate-limits guess spam", async () => {
    const a = await join("a");
    const b = await join("b");
    const code = await createRoom(a, "doodle-duel");
    await b.emit("room:join", { code });
    await b.emit("room:ready", { ready: true });
    await a.emit("game:start");
    await a.waitFor("game:state");
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => b.emit("doodle:guess", { text: `spam ${i}` })));
    expect(results.some((r) => !r.ok && r.error.code === "RATE_LIMITED")).toBe(true);
  });
});

describe("matchmaking", () => {
  it("matches queued players into a public room and avoids double-queueing", async () => {
    const a = await join("a");
    const b = await join("b");
    expect((await a.emit("match:queue", { gameId: "doodle-duel" })).ok).toBe(true);
    expect(await a.emit("match:queue", { gameId: "doodle-duel" })).toMatchObject({ ok: false, error: { code: "ALREADY_QUEUED" } });
    await a.waitFor("match:status", (s) => s.state === "searching");
    expect((await b.emit("match:queue", { gameId: "doodle-duel" })).ok).toBe(true);
    const ma = await a.waitFor("match:status", (s) => s.state === "matched", 4000);
    const mb = await b.waitFor("match:status", (s) => s.state === "matched", 4000);
    expect(ma.roomCode).toBe(mb.roomCode);
    const room = ctx.server.manager.get(ma.roomCode)!;
    expect(room.visibility).toBe("public");
    expect(room.members.size).toBe(2);
  });

  it("joins an existing open public lobby immediately, and cancelling leaves the queue", async () => {
    const a = await join("a");
    const ack = await a.emit<{ code: string }>("room:create", { gameId: "color-clash", visibility: "public" });
    const b = await join("b");
    const queued = await b.emit<{ roomCode: string }>("match:queue", { gameId: "color-clash" });
    expect(queued).toMatchObject({ ok: true, data: { roomCode: (ack as any).data.code } });

    const c = await join("c");
    await c.emit("match:queue", { gameId: "doodle-duel" });
    expect((await c.emit("match:cancel")).ok).toBe(true);
    expect(ctx.server.matchmaker.queuedGame("c")).toBeNull();
  });

  it("public rooms auto-start once everyone is ready", async () => {
    const a = await join("a");
    const b = await join("b");
    const ack = await a.emit<{ code: string }>("room:create", { gameId: "color-clash", visibility: "public" });
    await b.emit("room:join", { code: (ack as any).data.code });
    await a.emit("room:ready", { ready: true });
    await b.emit("room:ready", { ready: true });
    const s = await a.waitFor("room:state", (x) => x.autoStartAt !== null);
    expect(s.autoStartAt).toBeGreaterThan(Date.now());
    await a.waitFor("game:state", () => true, 7000);
  }, 10_000);
});

describe("admin endpoints", () => {
  it("health is public; metrics require the admin token", async () => {
    const health = await fetch(`${ctx.url}/health`);
    expect(health.status).toBe(200);
    expect((await fetch(`${ctx.url}/admin/metrics`)).status).toBe(401);
    expect((await fetch(`${ctx.url}/admin/metrics`, { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
  });
});
