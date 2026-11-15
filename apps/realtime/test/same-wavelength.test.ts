import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connect, latestState, sleep, startServer, type TestClient } from "./helpers";

/**
 * Same Wavelength over real sockets (docs/SAME_WAVELENGTH_DESIGN.md): mode seat limits, hidden
 * answers, duplicate and stale submissions, reconnection, completion and the recorded result.
 */
let ctx: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
const join = async (id: string, name = id) => {
  const c = await connect(ctx.url, id, name);
  clients.push(c);
  return c;
};
beforeEach(async () => {
  ctx = await startServer({ RECONNECT_GRACE_MS: 3_000, MATCHMAKING_WAIT_MS: 300 });
});
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await ctx.server.close();
});

async function room(ids: string[], config: Record<string, unknown>) {
  const players = [];
  for (const id of ids) players.push(await join(id));
  const host = players[0]!;
  const created = await host.emit<{ code: string }>("room:create", { gameId: "same-wavelength", visibility: "private", config });
  expect(created.ok).toBe(true);
  const code = (created as { data: { code: string } }).data.code;
  for (const p of players.slice(1)) {
    expect((await p.emit("room:join", { code })).ok).toBe(true);
    await p.emit("room:ready", { ready: true });
  }
  return { players, code, host };
}
/** Waits until the game is answering a round, and returns that view. */
async function answering(c: TestClient, round: number) {
  return (await c.waitFor("game:state", (s) => s.view.phase === "answering" && s.view.round === round, 8000)).view;
}
/** The first valid answer for a view's prompt (option `k`, or player `k`). */
const pick = (view: any, k = 0) => (view.prompt.kind === "who" ? { player: view.prompt.options[k % view.prompt.options.length].id } : { option: view.prompt.options[k % view.prompt.options.length].id });

describe("Same Wavelength rooms", () => {
  it("seats two in Couples mode, refuses a third, and won't switch to a mode that can't seat everyone", async () => {
    const { code, host } = await room(["sw-a", "sw-b"], { mode: "couples", rounds: 5 });
    expect(latestState(host)).toBeUndefined();
    expect(host.last("room:state").maxPlayers).toBe(2);
    const third = await join("sw-c");
    expect(await third.emit("room:join", { code })).toMatchObject({ ok: false, error: { code: "ROOM_FULL" } });
    // A Friends room of three can't become a Couples room.
    const friends = await room(["sw-d", "sw-e", "sw-f"], { mode: "friends", rounds: 5 });
    expect(friends.host.last("room:state").maxPlayers).toBe(4);
    expect(await friends.host.emit("room:configure", { config: { mode: "couples" } })).toMatchObject({ ok: false, error: { code: "ROOM_FULL" } });
    expect((await friends.host.emit("room:configure", { config: { mode: "group" } })).ok).toBe(true);
    expect(friends.host.last("room:state").maxPlayers).toBe(6);
  });

  it("keeps answers private until everyone has answered, then reveals them together", async () => {
    const { players, host } = await room(["sw-g", "sw-h", "sw-i"], { mode: "friends", rounds: 5 });
    expect((await host.emit("game:start")).ok).toBe(true);
    const [a, b, c] = players as [TestClient, TestClient, TestClient];
    const view = await answering(a, 1);
    const mine = pick(view, 0);
    expect((await a.emit("wave:answer", { round: 1, ...mine })).ok).toBe(true);
    const seenByB = await b.waitFor("game:state", (s) => s.view.players.find((p: any) => p.id === "sw-g")?.answered);
    expect(seenByB.view.you.answer).toBeNull();
    expect(seenByB.view.reveal).toBeNull();
    // Nothing b or c received before the reveal names a's choice.
    const leaked = (client: TestClient) => client.events.filter((e) => e.event === "game:state" && (e.env.payload as { view: { phase: string } }).view.phase === "answering").some((e) => JSON.stringify(e.env.payload).includes(`"optionId":"${Object.values(mine)[0]}"`));
    expect(leaked(b)).toBe(false);
    expect(leaked(c)).toBe(false);
    // A second answer is refused; a stale round too; an outsider can't act.
    expect(await a.emit("wave:answer", { round: 1, ...pick(view, 1) })).toMatchObject({ ok: false, error: { code: "INVALID_MOVE" } });
    expect(await b.emit("wave:answer", { round: 2, ...pick(view, 0) })).toMatchObject({ ok: false, error: { code: "STALE_STATE" } });
    const outsider = await join("sw-outsider");
    expect(await outsider.emit("wave:answer", { round: 1, ...pick(view, 0) })).toMatchObject({ ok: false, error: { code: "NOT_IN_ROOM" } });
    await b.emit("wave:answer", { round: 1, ...pick(view, 0) });
    await c.emit("wave:answer", { round: 1, ...pick(view, 2) });
    const revealed = await a.waitFor("game:state", (s) => s.view.phase === "reveal");
    expect(revealed.view.reveal.answers.map((x: any) => x.playerId).sort()).toEqual(["sw-g", "sw-h", "sw-i"]);
    expect(revealed.view.reveal.pairs.length).toBe(3);
  }, 20_000);

  it("restores a reconnecting player's own answer and keeps the round going", async () => {
    const { players, host, code } = await room(["sw-j", "sw-k"], { mode: "couples", rounds: 5 });
    await host.emit("game:start");
    const [a] = players as [TestClient, TestClient];
    const view = await answering(a, 1);
    await a.emit("wave:answer", { round: 1, ...pick(view, 1) });
    a.close();
    const back = await join("sw-j");
    expect((await back.emit("room:join", { code })).ok).toBe(true);
    const state = await back.waitFor("game:state");
    expect(state.view.round).toBe(1);
    expect(state.view.you.answer).not.toBeNull();
    expect(state.view.phase).toBe("answering");
  }, 20_000);

  it("plays a whole Couples game to a shared, neutral result with aggregates only", async () => {
    const { players, host } = await room(["sw-l", "sw-m"], { mode: "couples", rounds: 5, answerSeconds: 20 });
    await host.emit("game:start");
    const [a, b] = players as [TestClient, TestClient];
    for (let round = 1; round <= 5; round++) {
      const view = await answering(a, round);
      await a.emit("wave:answer", { round, ...pick(view, 0) });
      await b.emit("wave:answer", { round, ...pick(view, round % 2) });
      await a.waitFor("game:state", (s) => s.view.phase === "reveal" && s.view.round === round);
      await a.emit("wave:next", { round });
      await b.emit("wave:next", { round });
    }
    const ended = await a.waitFor("game:ended", () => true, 6000);
    expect(ended.gameId).toBe("same-wavelength");
    expect(ended.reason).toBe("completed");
    for (const e of ended.entries) {
      expect(e.isWinner).toBe(false);
      expect(e.placement).toBe(1);
      expect(e.details).toMatchObject({ result: "shared", mode: "couples", rounds: 5, players: 2, answered: 5 });
    }
    const final = latestState(a)!;
    expect(final.view.summary.roundsPlayed).toBe(5);
    await sleep(100);
    expect(ctx.recorded.at(-1)!.results.gameId).toBe("same-wavelength");
  }, 30_000);

  it("pairs two quick-match players into a public room", async () => {
    const a = await join("sw-q1");
    const b = await join("sw-q2");
    expect((await a.emit("match:queue", { gameId: "same-wavelength" })).ok).toBe(true);
    expect((await b.emit("match:queue", { gameId: "same-wavelength" })).ok).toBe(true);
    const matched = await a.waitFor("match:status", (p) => p.state === "matched", 4000);
    expect(matched.roomCode).toBeTruthy();
    const roomState = await a.waitFor("room:state", (s) => s.players.length === 2, 4000);
    expect(roomState.gameId).toBe("same-wavelength");
    expect(roomState.config).toMatchObject({ mode: "friends", textAnswers: false });
  });
});
