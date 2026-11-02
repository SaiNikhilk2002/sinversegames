import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connect, latestState, sleep, startServer, type TestClient } from "./helpers";

let ctx: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
const join = async (id: string, name: string) => {
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

async function startRoom(gameId: string, config: Record<string, unknown>, names = ["Ava", "Ben"]) {
  const players = await Promise.all(names.map((n, i) => join(`${gameId}-${i}`, n)));
  const host = players[0]!;
  const ack = await host.emit<{ code: string }>("room:create", { gameId, visibility: "private", config });
  expect(ack.ok).toBe(true);
  const code = (ack as { data: { code: string } }).data.code;
  for (const p of players.slice(1)) {
    expect((await p.emit("room:join", { code })).ok).toBe(true);
    await p.emit("room:ready", { ready: true });
  }
  expect((await host.emit("game:start")).ok).toBe(true);
  for (const p of players) await p.waitFor("game:state");
  return { players, code };
}

describe("room creation", () => {
  it("only creates rooms for multiplayer games", async () => {
    const a = await join("solo", "Sol");
    const ack = await a.emit("room:create", { gameId: "kitchen-rush", visibility: "private" });
    expect(ack).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  });
});

describe("Token Trail over sockets", () => {
  /** Plays with simple bots until the match ends. */
  async function playTrail(players: TestClient[], maxActions = 4000) {
    for (let n = 0; n < maxActions; n++) {
      if (players.every((p) => p.last("game:ended"))) return;
      let acted = false;
      for (const p of players) {
        const s = latestState(p);
        if (!s || s.view.status !== "playing" || s.view.currentPlayerId !== p.id) continue;
        const ack =
          s.view.phase === "roll"
            ? await p.emit("trail:roll", {}, { v: s.version })
            : await p.emit("trail:move", { token: s.view.movable[0] }, { v: s.version });
        if (ack.ok) acted = true;
        else if (ack.error.code === "RATE_LIMITED") await sleep(250);
        else if (!["STALE_STATE", "NOT_YOUR_TURN"].includes(ack.error.code)) throw new Error(`${ack.error.code}: ${ack.error.message}`);
      }
      if (!acted) await sleep(5);
    }
    throw new Error("Match did not finish");
  }

  it("plays a full race with server-rolled dice and persists the result", async () => {
    const { players, code } = await startRoom("token-trail", { tokensPerPlayer: 1, turnSeconds: 0 });
    await playTrail(players);
    const results = await players[0]!.waitFor("game:ended");
    expect(results.entries.filter((e: any) => e.isWinner)).toHaveLength(1);
    expect(results.entries[0].details.home).toBe(1);
    await sleep(20);
    expect(ctx.recorded.at(-1)!.roomCode).toBe(code);
    // Every roll was announced to both players.
    const rolls = players[1]!.all("game:action").flatMap((a: any) => a.events).filter((e: any) => e.kind === "roll");
    expect(rolls.length).toBeGreaterThan(0);
    expect(rolls.every((e: any) => e.value >= 1 && e.value <= 6)).toBe(true);
  });

  it("rejects out-of-turn, stale and forged moves", async () => {
    const { players } = await startRoom("token-trail", { turnSeconds: 0 });
    const s = latestState(players[0]!)!;
    const current = players.find((p) => p.id === s.view.currentPlayerId)!;
    const other = players.find((p) => p !== current)!;
    expect(await other.emit("trail:roll", {}, { v: s.version })).toMatchObject({ ok: false, error: { code: "NOT_YOUR_TURN" } });
    expect(await current.emit("trail:roll", {}, { v: s.version - 1 })).toMatchObject({ ok: false, error: { code: "STALE_STATE" } });
    expect(await current.emit("trail:move", { token: 9 }, { v: s.version })).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
    // A client can't pick its own roll: there's no field for it, extra fields are ignored.
    const ack = await current.emit("trail:roll", { value: 6 }, { v: s.version });
    expect(ack.ok).toBe(true);
  });

  it("auto-plays a disconnected player's turn and restores state on reconnect", async () => {
    // The seat must outlive the 5s auto-play delay, so use a longer reconnect grace here.
    await ctx.server.close();
    ctx = await startServer({ RECONNECT_GRACE_MS: 20_000 });
    const { players, code } = await startRoom("token-trail", { turnSeconds: 0 });
    const s = latestState(players[0]!)!;
    const current = players.find((p) => p.id === s.view.currentPlayerId)!;
    const other = players.find((p) => p !== current)!;
    current.close();
    // Disconnected players get 5s before the server plays for them.
    const after = await other.waitFor("game:action", (a) => a.events.some((e: any) => e.kind === "timeout"), 8000);
    expect(after).toBeTruthy();
    const back = await join(current.id, "Back");
    expect((await back.emit("room:join", { code })).ok).toBe(true);
    const st = await back.waitFor("game:state");
    expect(st.view.players).toHaveLength(2);
  }, 15_000);
});

describe("Bumper Blitz over sockets", () => {
  it("simulates on the server from steering input and broadcasts positions every tick", async () => {
    const { players } = await startRoom("bumper-blitz", { durationSeconds: 30, powerups: false, hazards: false });
    const [a, b] = players as [TestClient, TestClient];
    const first = latestState(a)!.view;
    expect(first.status).toBe("countdown");
    const startX = first.pods.find((p: any) => p.id === a.id).x;
    expect((await a.emit("arena:input", { x: 1, y: 0, boost: false })).ok).toBe(true);
    await sleep(3800);
    const now = latestState(b)!.view;
    expect(now.status).toBe("playing");
    expect(now.pods.find((p: any) => p.id === a.id).x).toBeGreaterThan(startX);
    // Ticks arrive steadily (~20 per second).
    const before = b.all("game:state").length;
    await sleep(1000);
    expect(b.all("game:state").length - before).toBeGreaterThanOrEqual(12);
  }, 15_000);

  it("rejects malformed input and rate-limits input floods", async () => {
    const { players } = await startRoom("bumper-blitz", { durationSeconds: 30 });
    const a = players[0]!;
    expect(await a.emit("arena:input", { x: 9, y: 0 })).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
    const acks = await Promise.all(Array.from({ length: 80 }, () => a.emit("arena:input", { x: 0, y: 1 })));
    expect(acks.some((r) => !r.ok && r.error.code === "RATE_LIMITED")).toBe(true);
  });

  it("finishes the match on time and records results", async () => {
    const { players } = await startRoom("bumper-blitz", { durationSeconds: 30, powerups: true, hazards: true });
    const results = await players[0]!.waitFor("game:ended", () => true, 40_000);
    expect(results.entries).toHaveLength(2);
    expect(results.reason).toBe("completed");
    await sleep(20);
    expect(ctx.recorded.at(-1)!.results.gameId).toBe("bumper-blitz");
  }, 45_000);
});
