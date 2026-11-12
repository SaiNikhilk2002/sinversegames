import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COOP_COUNTDOWN_MS, COOP_INTRO_MS, COOP_PROTOCOL, type CoopView } from "@platform/engines/kitchen-rush";
import { connect, startServer, type TestClient } from "./helpers";

/** Real sockets and a real server: several cooks acting at the same moment in one kitchen. */
let clock = Date.now();
describe("Kitchen Rush Co-op over real sockets", () => {
  let ctx: Awaited<ReturnType<typeof startServer>>;
  const clients: TestClient[] = [];
  beforeAll(async () => { ctx = await startServer({ RECONNECT_GRACE_MS: 300 } as never, () => clock); });
  afterAll(async () => { for (const c of clients) c.close(); await ctx.server.close(); });
  const join = async (id: string) => { const c = await connect(ctx.url, id, id); clients.push(c); return c; };
  const view = (c: TestClient) => c.last("game:state")?.view as CoopView;
  const tap = (c: TestClient, target: string, p = COOP_PROTOCOL) => c.emit("kitchen:tap", { p, target }, { matchId: c.last("game:state")?.matchId });

  async function crew(tag: string, size: number) {
    const cooks = await Promise.all(Array.from({ length: size }, (_, i) => join(`${tag}-${i}`)));
    const created = await cooks[0]!.emit<{ code: string }>("room:create", { gameId: "kitchen-rush-coop", visibility: "private", config: { kitchen: 1 } });
    const code = (created as { data: { code: string } }).data.code;
    for (const c of cooks.slice(1)) { expect((await c.emit("room:join", { code })).ok).toBe(true); await c.emit("room:ready", { ready: true }); }
    expect((await cooks[0]!.emit("game:start")).ok).toBe(true);
    for (const c of cooks) await c.waitFor("game:state");
    clock += COOP_INTRO_MS + 1;
    await cooks[0]!.waitFor("game:state", p => p.view.phase === "countdown", 12_000);
    clock += COOP_COUNTDOWN_MS + 1;
    for (const c of cooks) await c.waitFor("game:state", p => p.view.phase === "cooking", 12_000);
    return { cooks, code };
  }
  const fresh = async (c: TestClient, check: (v: CoopView) => boolean) => { await c.emit("room:sync"); return c.waitFor("game:state", p => check(p.view)); };

  it("shares one kitchen: every cook sees each other's food and position", { timeout: 40_000 }, async () => {
    const { cooks: [a, b] } = await crew("share", 2);
    clock += 100;
    expect((await tap(a!, "crate:bun")).ok).toBe(true);
    const seen = await fresh(b!, v => v.hands[a!.id]?.kind === "item");
    expect(seen.view.hands[a!.id]).toEqual({ kind: "item", item: "bun" });
    expect(seen.view.cooks.find((c: { id: string }) => c.id === a!.id)).toMatchObject({ target: "crate:bun", pose: "gather" });
  });

  it("four cooks tapping at once: the shared plate goes to exactly one", { timeout: 40_000 }, async () => {
    const { cooks } = await crew("rush", 4);
    const [a] = cooks;
    clock += 100;
    await tap(a!, "crate:bun"); await tap(a!, "plate:0");
    await Promise.all(cooks.map(c => tap(c, "plate:0")));
    const { view: v } = await fresh(a!, x => x.plates[0]!.length === 1);
    const holders = cooks.filter(c => v.hands[c.id]?.kind === "plate");
    expect(holders).toHaveLength(1);
  });

  it("a whole order passed between two cooks is served once and saved once", { timeout: 60_000 }, async () => {
    const { cooks: [a, b], code } = await crew("order", 2);
    clock += 2100;
    const guest = await fresh(a!, v => v.customers.length > 0);
    const seat = guest.view.customers[0].seat as number;
    expect(guest.view.customers[0].recipe).toBe("burger");
    await tap(a!, "crate:patty-raw"); await tap(a!, "st:grill:0");
    await tap(b!, "crate:bun"); await tap(b!, "plate:0");
    clock += 4100;
    await tap(b!, "st:grill:0");
    await tap(b!, "plate:0");
    await tap(a!, "plate:0");
    await Promise.all([tap(a!, `seat:${seat}`), tap(a!, `seat:${seat}`), tap(b!, `seat:${seat}`)]);
    const { view: v } = await fresh(b!, x => x.served === 1);
    expect(v.served).toBe(1); expect(v.wrong).toBe(0);
    expect(v.handoffs).toBeGreaterThanOrEqual(1);
    // Let the rest of the shift run out on the clock.
    for (let i = 0; i < 12 && !a!.last("game:ended"); i++) { clock += 60_000; await tap(a!, "plate:1"); }
    const results = await a!.waitFor("game:ended", undefined, 15_000);
    expect(results.gameId).toBe("kitchen-rush-coop");
    expect(new Set(results.entries.map((e: { score: number }) => e.score)).size).toBe(1);
    await new Promise(r => setTimeout(r, 30));
    expect(ctx.recorded.filter(r => r.roomCode === code)).toHaveLength(1);
  });

  it("rejects forged and stale messages", { timeout: 40_000 }, async () => {
    const { cooks: [a, b] } = await crew("forge", 2);
    clock += 100;
    expect(await tap(a!, "'; DROP TABLE")).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
    expect(await tap(a!, "crate:bun", 0)).toMatchObject({ ok: false, error: { code: "STALE_STATE" } });
    expect(await a!.emit("kitchen:tap", { p: COOP_PROTOCOL, target: "crate:bun", score: 99999 }, { matchId: "00000000-0000-4000-8000-000000000000" })).toMatchObject({ ok: false, error: { code: "STALE_STATE" } });
    const { view: v } = await fresh(b!, () => true);
    expect(v.served).toBe(0); expect(v.score).toBe(0);
  });

  it("holds a dropped cook's seat, then frees their plate when they time out", { timeout: 40_000 }, async () => {
    const { cooks: [a, b, c] } = await crew("drop", 3);
    clock += 100;
    await tap(c!, "crate:bun"); await tap(c!, "plate:0"); await tap(c!, "plate:0");
    await fresh(a!, v => v.hands[c!.id]?.kind === "plate");
    c!.socket.disconnect();
    await a!.waitFor("game:state", p => p.view.cooks.find((x: { id: string }) => x.id === c!.id).connected === false);
    expect((await tap(b!, "plate:0")).ok).toBe(true);
    const held = await fresh(b!, () => true);
    expect(held.view.hands[b!.id]).toBeNull();
    await a!.waitFor("game:state", p => p.view.cooks.find((x: { id: string }) => x.id === c!.id).left === true, 5000);
    expect((await tap(b!, "plate:0")).ok).toBe(true);
    const freed = await fresh(b!, v => v.hands[b!.id]?.kind === "plate");
    expect(freed.view.hands[b!.id]).toEqual({ kind: "plate", plate: 0 });
  });
});
