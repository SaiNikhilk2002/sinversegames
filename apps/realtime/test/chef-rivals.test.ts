import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { advanceQuest, INTRO_MS, COUNTDOWN_MS, questHint, RIVALS_PROTOCOL, type RivalsView } from "@platform/engines/cuisine-quest";
import { connect, startServer, type TestClient } from "./helpers";

/** Real sockets, real server. An injected clock lets a duel run in test time. */
let clock = Date.now();
const now = () => clock;
describe("Chef Rivals over real sockets", () => {
  let ctx: Awaited<ReturnType<typeof startServer>>;
  const clients: TestClient[] = [];
  beforeAll(async () => { ctx = await startServer({ RECONNECT_GRACE_MS: 400 } as never, now); });
  afterAll(async () => { for (const c of clients) c.close(); await ctx.server.close(); });
  const join = async (id: string, name: string) => { const c = await connect(ctx.url, id, name); clients.push(c); return c; };
  const view = (c: TestClient) => c.last("game:state")?.view as RivalsView;
  const matchId = (c: TestClient) => c.last("game:state")?.matchId as string;

  async function startDuel(tag: string) {
    const [a, b] = [await join(`${tag}-a`, "Asha"), await join(`${tag}-b`, "Ben")];
    const created = await a.emit<{ code: string }>("room:create", { gameId: "chef-rivals", visibility: "private", config: { durationSeconds: 120 } });
    expect(created.ok).toBe(true);
    const code = (created as { data: { code: string } }).data.code;
    expect((await b.emit("room:join", { code })).ok).toBe(true);
    await b.emit("room:ready", { ready: true });
    expect((await a.emit("game:start")).ok).toBe(true);
    await a.waitFor("game:state"); await b.waitFor("game:state");
    return { a, b, code };
  }
  /** Moves past intro and countdown. The server's timer uses real delays, so a sync request refreshes views. */
  async function reachCooking(a: TestClient, b: TestClient) {
    clock += INTRO_MS + 1;
    await a.waitFor("game:state", p => p.view.phase === "countdown", 12_000);
    clock += COUNTDOWN_MS + 1;
    await a.waitFor("game:state", p => p.view.phase === "cooking", 12_000);
    await b.waitFor("game:state", p => p.view.phase === "cooking", 12_000);
  }
  const act = (c: TestClient, intent: unknown, p = RIVALS_PROTOCOL) => c.emit("kitchen:act", { p, intent }, { matchId: matchId(c) });
  async function nextIntent(c: TestClient) {
    await c.emit("room:sync");
    await new Promise(r => setTimeout(r, 5));
    // Advance a private copy to now, exactly as the browser does between server views.
    const kitchen = JSON.parse(JSON.stringify(view(c).you!.kitchen)) as RivalsView["you"] extends infer Y ? NonNullable<Y> extends { kitchen: infer K } ? K : never : never;
    advanceQuest(kitchen, Math.min(clock - view(c).playAt, view(c).durationMs));
    const order = kitchen.orders.find(o => o.status === "waiting");
    return order ? questHint(kitchen, order.id).action : null;
  }

  it("runs a whole duel: both chefs cook at once, and one result is saved", { timeout: 60_000 }, async () => {
    const { a, b, code } = await startDuel("full");
    expect(view(a).phase).toBe("intro");
    expect(view(a).theme).toBe(view(b).theme);
    expect(view(a).mystery).toBe(view(b).mystery);
    expect(view(a).you!.kitchen.orders.map(o => o.recipe)).toEqual(view(b).you!.kitchen.orders.map(o => o.recipe));
    await reachCooking(a, b);

    // Both chefs send at the same moment, across the whole shift.
    let guard = 0;
    while (guard++ < 1500) {
      clock += 170;
      const [ia, ib] = await Promise.all([nextIntent(a), nextIntent(b)]);
      const acks = await Promise.all([ia ? act(a, ia) : null, ib ? act(b, ib) : null]);
      // A hint read from a view that's a moment old can be refused. That costs nothing and a player just tries again.
      for (const ack of acks) if (ack && !ack.ok && ack.error.code !== "GAME_NOT_ACTIVE" && !/Stir|still cooking|another flip|Enough stirring/.test(ack.error.message)) throw new Error(ack.error.message);
      if (a.last("game:ended")) break;
    }
    const results = await a.waitFor("game:ended");
    expect(results.gameId).toBe("chef-rivals");
    expect(results.reason).toBe("completed");
    expect(results.entries).toHaveLength(2);
    for (const entry of results.entries) expect(entry.details).toMatchObject({ served: 5, wanted: 5, mistakes: 0 });
    await new Promise(r => setTimeout(r, 30));
    const saved = ctx.recorded.filter(r => r.roomCode === code);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.id).toBeTruthy();
  });

  it("shows each chef the other's live activity, not their private kitchen", { timeout: 40_000 }, async () => {
    const { a, b } = await startDuel("live");
    await reachCooking(a, b);
    clock += 200;
    expect((await act(a, await nextIntent(a))).ok).toBe(true);
    const seen = await b.waitFor("game:state", p => p.view.rivals[0].pose === "gather");
    expect(seen.view.rivals[0]).toMatchObject({ id: a.id, station: "storage" });
    expect(seen.view.rivals[0].kitchen).toBeUndefined();
    expect(seen.view.you.kitchen.orders[0].step).toBe(0);
  });

  it("applies a retried action once", { timeout: 40_000 }, async () => {
    const { a, b } = await startDuel("retry");
    await reachCooking(a, b);
    clock += 200;
    const intent = await nextIntent(a);
    const options = { id: "retry-action-0001", matchId: matchId(a) };
    const [first, second] = await Promise.all([a.emit("kitchen:act", { p: RIVALS_PROTOCOL, intent }, options), a.emit("kitchen:act", { p: RIVALS_PROTOCOL, intent }, options)]);
    expect(first.ok).toBe(true); expect(second.ok).toBe(true);
    await a.emit("room:sync");
    await a.waitFor("game:state", p => p.view.you.kitchen.orders[0].step === 1);
    expect(view(a).you!.kitchen.mistakes).toBe(0);
  });

  it("rejects forged and out-of-date messages", { timeout: 40_000 }, async () => {
    const { a, b } = await startDuel("forge");
    await reachCooking(a, b);
    clock += 200;
    expect(await act(a, { kind: "finish" })).toMatchObject({ ok: false, error: { code: "INVALID_MOVE" } });
    expect(await act(a, { kind: "serve", order: 0, garnish: "herbs", score: 10_000 })).toMatchObject({ ok: false });
    expect(await act(a, { kind: "heat", order: 0, value: 2 }, 0)).toMatchObject({ ok: false, error: { code: "STALE_STATE" } });
    expect(await a.emit("kitchen:act", { p: RIVALS_PROTOCOL, intent: { kind: "heat", order: 0, value: 2 } }, { matchId: "00000000-0000-4000-8000-000000000000" })).toMatchObject({ ok: false, error: { code: "STALE_STATE" } });
    expect(view(a).you!.kitchen.served).toBe(0);
  });

  it("restores a reconnecting chef's exact kitchen; the kitchen keeps running meanwhile", { timeout: 40_000 }, async () => {
    const { a, b, code } = await startDuel("reconnect");
    await reachCooking(a, b);
    clock += 200;
    await act(b, await nextIntent(b));
    await b.emit("room:sync");
    await b.waitFor("game:state", p => p.view.you.kitchen.orders[0].step === 1);
    b.socket.disconnect();
    await a.waitFor("game:state", p => p.view.rivals[0].connected === false);
    clock += 5000;
    const back = await join(b.id, "Ben");
    expect((await back.emit("room:join", { code })).ok).toBe(true);
    const restored = await back.waitFor("game:state");
    expect(restored.view.you.kitchen.orders[0].step).toBe(1);
    await a.waitFor("game:state", p => p.view.rivals[0].connected === true);
  });

  it("ends and saves nothing when a chef leaves before cooking", { timeout: 20_000 }, async () => {
    const { a, b, code } = await startDuel("early");
    await b.emit("room:leave");
    const results = await a.waitFor("game:ended");
    expect(results.reason).toBe("aborted");
    await new Promise(r => setTimeout(r, 20));
    expect(ctx.recorded.some(r => r.roomCode === code && r.results.reason === "completed")).toBe(false);
  });

  it("offers rematch with a fresh match and challenge state", { timeout: 40_000 }, async () => {
    const { a, b } = await startDuel("rematch");
    await reachCooking(a, b);
    const first = matchId(a);
    await b.emit("room:leave");
    await a.waitFor("game:ended");
    const b2 = await join("rematch-c", "Cleo");
    const code = a.last("room:state").code;
    expect((await b2.emit("room:join", { code })).ok).toBe(true);
    await b2.emit("room:ready", { ready: true }, { matchId: first });
    expect((await a.emit("game:start", {}, { matchId: first })).ok).toBe(true);
    const fresh = await a.waitFor("game:state", p => p.matchId !== first);
    expect(fresh.view.phase).toBe("intro");
    expect(fresh.view.you.kitchen.served).toBe(0);
  });
});
