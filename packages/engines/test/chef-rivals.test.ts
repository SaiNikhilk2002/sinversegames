import { describe, expect, it } from "vitest";
import { seededRng } from "../src/core/seeded";
import { COUNTDOWN_MS, drawChallenge, INTRO_MS, MYSTERY_INGREDIENTS, questHint, rivalsEngine, RIVALS_PROTOCOL, scoreRival, SECRET_CHALLENGES, type QuestIntent, type RivalsState } from "../src/cuisine-quest";

const players = [{ id: "a", name: "Asha", color: "#ff6b6b" }, { id: "b", name: "Ben", color: "#3d8bff" }];
const START = 1_000_000;
function start(seed = 7, durationSeconds: 120 | 180 | 240 = 180) {
  const made = rivalsEngine.create(players, { durationSeconds }, { now: START, rng: seededRng(seed) });
  return made.state;
}
const ctx = (now: number) => ({ now, rng: seededRng(1) });
const act = (intent: unknown, p = RIVALS_PROTOCOL) => ({ type: "kitchen:act" as const, p, intent: intent as { kind: string } });
function toCooking(s: RivalsState) {
  rivalsEngine.tick(s, ctx(s.introEndsAt));
  rivalsEngine.tick(s, ctx(s.playAt));
  expect(s.phase).toBe("cooking");
  return s.playAt;
}
const chef = (s: RivalsState, id: string) => s.chefs.find(c => c.id === id)!;

/** Plays through coaching. `pace` is the gap between this chef's actions. */
function step(s: RivalsState, id: string, now: number): boolean {
  const kitchen = chef(s, id).kitchen;
  const order = kitchen.orders.find(o => o.status === "waiting");
  const intent = order ? questHint(kitchen, order.id).action as QuestIntent | null : null;
  if (!intent) return false;
  const result = rivalsEngine.handleAction(s, id, act(intent), ctx(now));
  if (!result.ok) throw new Error(`${id}: ${result.message}`);
  return true;
}
function playBoth(s: RivalsState, paces: Record<string, number>) {
  let now = toCooking(s);
  const next: Record<string, number> = { a: now, b: now };
  let guard = 0;
  while (s.phase === "cooking" && guard++ < 40_000) {
    now += 20;
    for (const id of ["a", "b"]) if (now >= next[id]! && !chef(s, id).kitchen.finished && s.phase === "cooking") { step(s, id, now); next[id] = now + paces[id]!; }
    if (s.phase === "cooking") rivalsEngine.tick(s, ctx(now));
  }
  expect(s.phase).toBe("finished");
  return rivalsEngine.results(s);
}

describe("Chef Rivals fairness", () => {
  it("gives both chefs identical kitchens", () => {
    const s = start();
    expect(chef(s, "a").kitchen).toEqual(chef(s, "b").kitchen);
    expect(chef(s, "a").kitchen).not.toBe(chef(s, "b").kitchen);
  });
  it("one chef's actions never change the other's kitchen", () => {
    const s = start(); const now = toCooking(s) + 200;
    const before = JSON.stringify(chef(s, "b").kitchen.orders.map(o => [o.step, o.batchActive, o.quality]));
    step(s, "a", now); step(s, "a", now + 200);
    expect(chef(s, "a").kitchen.orders[0]!.step).toBe(2);
    expect(JSON.stringify(chef(s, "b").kitchen.orders.map(o => [o.step, o.batchActive, o.quality]))).toBe(before);
  });
  it("draws valid, varied challenges reproducibly", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const a = drawChallenge(seededRng(seed), 180_000);
      expect(drawChallenge(seededRng(seed), 180_000)).toEqual(a);
      seen.add(a.mystery);
      expect(MYSTERY_INGREDIENTS).toContain(a.mystery);
      expect(a.plan.orders).toHaveLength(4);
      expect(new Set(a.plan.orders.map(o => o.recipe)).size).toBeGreaterThanOrEqual(3);
      expect(a.plan.rules).toMatchObject({ limitMs: 180_000, gesturePrecision: false });
    }
    expect(seen.size).toBeGreaterThan(3);
  });
  it("a tap at the marker and a rough drag cost the same quality in a duel", () => {
    const s = start(); const now = toCooking(s);
    const k = chef(s, "a").kitchen; const b = chef(s, "b").kitchen;
    let t = now;
    for (const id of ["a", "b"]) { let guard = 0; let local = now; const kitchen = id === "a" ? k : b; while (kitchen.orders[0]!.step < 99 && guard++ < 60) {
      const hint = questHint(kitchen, 0).action; if (!hint || hint.kind === "gesture") break;
      local += 100; rivalsEngine.handleAction(s, id, act(hint), ctx(local)); t = Math.max(t, local);
    } }
    const hint = questHint(k, 0).action;
    if (hint?.kind === "gesture") {
      t += 200;
      expect(rivalsEngine.handleAction(s, "a", act(hint), ctx(t)).ok).toBe(true);
      expect(rivalsEngine.handleAction(s, "b", act({ ...hint, x: hint.x + 100, y: hint.y + 100 > 1000 ? hint.y - 100 : hint.y + 100 }), ctx(t)).ok).toBe(true);
      expect(b.orders[0]!.node).toBe(k.orders[0]!.node);
      expect(b.orders[0]!.quality).toBe(k.orders[0]!.quality);
    }
    expect(k.rules.gesturePrecision).toBe(false);
  });
});

describe("Chef Rivals match flow", () => {
  it("moves through intro, countdown and cooking on the server's clock", () => {
    const s = start();
    expect(s.phase).toBe("intro");
    expect(rivalsEngine.nextDeadline(s)).toBe(START + INTRO_MS);
    rivalsEngine.tick(s, ctx(START + INTRO_MS)); expect(s.phase).toBe("countdown");
    expect(rivalsEngine.nextDeadline(s)).toBe(START + INTRO_MS + COUNTDOWN_MS);
    rivalsEngine.tick(s, ctx(START + INTRO_MS + COUNTDOWN_MS)); expect(s.phase).toBe("cooking");
    expect(s.endsAt).toBe(s.playAt + 180_000);
  });
  it("refuses cooking before the start, even by an instant", () => {
    const s = start();
    const r = rivalsEngine.handleAction(s, "a", act({ kind: "ingredient", order: 0, ingredient: "rice", portions: 1 }), ctx(s.playAt - 1));
    expect(r).toMatchObject({ ok: false, code: "GAME_NOT_ACTIVE" });
  });
  it("both flawless chefs can finish, and the match ends when both are done", () => {
    const s = start();
    const results = playBoth(s, { a: 160, b: 160 });
    expect(results.reason).toBe("completed");
    for (const entry of results.entries) { expect(entry.details).toMatchObject({ served: 5, wanted: 5, mistakes: 0, burnt: 0 }); expect(entry.score).toBeGreaterThan(8000); }
    expect(s.endedAt!).toBeLessThan(s.endsAt);
  });
  it("waits for the slower chef rather than ending at the first finish", () => {
    const s = start();
    let now = toCooking(s);
    while (!chef(s, "a").kitchen.finished) { now += 160; step(s, "a", now); if (!chef(s, "a").kitchen.finished) rivalsEngine.tick(s, ctx(now)); }
    rivalsEngine.tick(s, ctx(now + 500));
    expect(s.phase).toBe("cooking");
    expect(rivalsEngine.handleAction(s, "a", act({ kind: "heat", order: 0, value: 2 }), ctx(now + 600)).ok).toBe(false);
  });
  it("ends at the deadline, scoring only what was served", () => {
    const s = start(); const now = toCooking(s);
    rivalsEngine.tick(s, ctx(s.endsAt));
    expect(s.phase).toBe("finished");
    expect(now).toBeLessThan(s.endsAt);
    const results = rivalsEngine.results(s);
    for (const e of results.entries) { expect(e.score).toBe(0); expect(e.isWinner).toBe(false); expect(e.details?.result).toBe("tie"); }
    expect(rivalsEngine.nextDeadline(s)).toBeNull();
  });
  it("an action landing after the deadline can't cook, and closes the match", () => {
    const s = start(); toCooking(s);
    const r = rivalsEngine.handleAction(s, "a", act({ kind: "ingredient", order: 0, ingredient: "rice", portions: 1 }), ctx(s.endsAt + 5000));
    expect(r.ok).toBe(true);
    expect(s.phase).toBe("finished");
    expect(chef(s, "a").kitchen.served).toBe(0);
    expect(rivalsEngine.handleAction(s, "a", act({ kind: "heat", order: 0, value: 2 }), ctx(s.endsAt + 5001))).toMatchObject({ ok: false, code: "GAME_NOT_ACTIVE" });
  });
  it("uses server time, ignoring any time a client claims", () => {
    const s = start(); const now = toCooking(s) + 3000;
    const order = chef(s, "a").kitchen.orders[0]!; const hint = questHint(chef(s, "a").kitchen, order.id).action!;
    expect(rivalsEngine.handleAction(s, "a", act({ ...hint, t: 999_999 }), ctx(now)).ok).toBe(true);
    expect(chef(s, "a").kitchen.t).toBe(3000);
  });
});

describe("Chef Rivals invalid input", () => {
  const cooking = () => { const s = start(); return { s, now: toCooking(s) + 100 }; };
  it.each([
    ["a client-claimed finish", { kind: "finish" }],
    ["a client-claimed wait", { kind: "wait" }],
    ["an unknown action", { kind: "award-points", points: 9999 }],
    ["an extra score field", { kind: "heat", order: 0, value: 2, score: 9999 }],
    ["an out-of-range order", { kind: "heat", order: 40, value: 2 }],
    ["an out-of-range heat", { kind: "heat", order: 0, value: 99 }],
  ])("refuses %s, leaving scores untouched", (_name, intent) => {
    const { s, now } = cooking();
    expect(rivalsEngine.handleAction(s, "a", act(intent), ctx(now)).ok).toBe(false);
    expect(chef(s, "a").kitchen).toMatchObject({ served: 0, qualitySum: 0 });
  });
  it("refuses actions from someone outside the match", () => {
    const { s, now } = cooking();
    expect(rivalsEngine.handleAction(s, "intruder", act({ kind: "heat", order: 0, value: 2 }), ctx(now))).toMatchObject({ ok: false, code: "NOT_IN_ROOM" });
  });
  it("asks an out-of-date tab to refresh", () => {
    const { s, now } = cooking();
    const r = rivalsEngine.handleAction(s, "a", act({ kind: "heat", order: 0, value: 2 }, 0), ctx(now));
    expect(r).toMatchObject({ ok: false, code: "STALE_STATE" });
  });
  it("can't serve an unfinished plate or a guest who isn't waiting", () => {
    const { s, now } = cooking();
    expect(rivalsEngine.handleAction(s, "a", act({ kind: "serve", order: 0, garnish: "herbs" }), ctx(now)).ok).toBe(false);
    expect(rivalsEngine.handleAction(s, "a", act({ kind: "ingredient", order: 3, ingredient: "rice", portions: 1 }), ctx(now)).ok).toBe(false);
    expect(chef(s, "a").kitchen.served).toBe(0);
  });
  it("a repeated serve can't complete an order twice", () => {
    const s = start();
    let now = toCooking(s);
    const k = chef(s, "a").kitchen; let guard = 0;
    while (k.orders[0]!.status === "waiting" && guard++ < 500) {
      now += 160; const hint = questHint(k, 0).action;
      if (hint) rivalsEngine.handleAction(s, "a", act(hint), ctx(now));
      else rivalsEngine.tick(s, ctx(now));
      if (hint?.kind === "serve" && (k.orders[0]!.status as string) === "served") {
        const served = k.served;
        expect(rivalsEngine.handleAction(s, "a", act(hint), ctx(now)).ok).toBe(false);
        expect(k.served).toBe(served);
      }
    }
    expect(k.orders[0]!.status).toBe("served");
  });
});

describe("Chef Rivals scoring", () => {
  it("good cooking beats fast clicking", () => {
    // A careful chef at a human pace against a rushed chef who keeps burning and fumbling.
    const s = start(11);
    let now = toCooking(s); let guard = 0;
    const fast = chef(s, "b").kitchen;
    const rng = seededRng(3);
    while (s.phase === "cooking" && guard++ < 6000) {
      now += 40;
      if (guard % 12 === 0 && !chef(s, "a").kitchen.finished) step(s, "a", now);
      if (guard % 3 === 0 && !fast.finished && s.phase === "cooking") {
        const order = fast.orders.find(o => o.status === "waiting");
        if (order) {
          const wrong = rng.int(3) === 0;
          const hint = questHint(fast, order.id).action;
          if (wrong) rivalsEngine.handleAction(s, "b", act({ kind: "ingredient", order: order.id, ingredient: "water", portions: 3 }), ctx(now));
          else if (hint) rivalsEngine.handleAction(s, "b", act(hint), ctx(now));
        }
      }
      if (s.phase === "cooking") rivalsEngine.tick(s, ctx(now));
    }
    const results = rivalsEngine.results(s);
    expect(chef(s, "b").kitchen.mistakes).toBeGreaterThan(0);
    expect(results.entries[0]).toMatchObject({ playerId: "a", isWinner: true, placement: 1 });
    expect(results.entries[1]).toMatchObject({ playerId: "b", isWinner: false, placement: 2 });
  });
  it("speed is worth at most 5% of the score", () => {
    const s = start(); playBoth(s, { a: 160, b: 160 });
    const score = scoreRival(chef(s, "a").kitchen, 0, s.secret, s.endsAt - s.playAt);
    expect(score.efficiency).toBeLessThanOrEqual(500);
    expect(score.total).toBeLessThanOrEqual(10_000);
    expect(score.recipe + score.craft + score.timing + score.technique + score.efficiency + score.presentation + score.challenge).toBe(score.total);
  });
  it("different ticket orders are equally valid routes to a full, clean service", () => {
    const s = start();
    const routes = { a: [0, 1, 2, 3], b: [2, 1, 0, 3] } as const;
    const first: Record<string, number> = {};
    let now = toCooking(s); let guard = 0;
    while (s.phase === "cooking" && guard++ < 8000) {
      now += 160;
      for (const id of ["a", "b"] as const) {
        const kitchen = chef(s, id).kitchen;
        const order = routes[id].map(n => kitchen.orders[n]!).find(o => o.status === "waiting");
        const hint = order ? questHint(kitchen, order.id).action : null;
        if (hint && s.phase === "cooking") {
          first[id] ??= order!.id;
          const r = rivalsEngine.handleAction(s, id, act(hint), ctx(now));
          if (!r.ok && !/Two batches|busy/.test(r.message)) throw new Error(r.message);
        }
      }
      if (s.phase === "cooking") rivalsEngine.tick(s, ctx(now));
    }
    expect(chef(s, "a").kitchen.served).toBe(5); expect(chef(s, "b").kitchen.served).toBe(5);
    expect(chef(s, "a").kitchen.mistakes).toBe(0); expect(chef(s, "b").kitchen.mistakes).toBe(0);
  });
  it("every secret challenge can be earned and missed", () => {
    for (const c of SECRET_CHALLENGES) {
      expect(c.done({ served: 5, wanted: 5, perfect: 5, burnt: 0, mistakes: 0, satisfaction: 95 })).toBe(true);
      expect(c.done({ served: 0, wanted: 5, perfect: 0, burnt: 2, mistakes: 3, satisfaction: 0 })).toBe(false);
    }
  });
  it("hides the secret challenge from players until the results", () => {
    const s = start();
    const view = JSON.stringify(rivalsEngine.viewFor(s, "a"));
    const secret = SECRET_CHALLENGES.find(c => c.id === s.secret)!;
    expect(view).not.toContain(secret.id); expect(view).not.toContain(secret.title);
    expect(s.phase).toBe("intro");
  });
  it("shares first place on a tie, with no winner", () => {
    const s = start();
    toCooking(s); rivalsEngine.tick(s, ctx(s.endsAt));
    expect(rivalsEngine.results(s).entries.map(e => e.placement)).toEqual([1, 1]);
  });
});

describe("Chef Rivals views and departures", () => {
  it("shows a rival's activity and tallies but not their kitchen", () => {
    const s = start(); const now = toCooking(s) + 100; step(s, "a", now);
    const view = rivalsEngine.viewFor(s, "b");
    expect(view.rivals).toHaveLength(1);
    expect(view.rivals[0]).toMatchObject({ id: "a", served: 0, pose: "gather", station: "storage" });
    expect(view.rivals[0]).not.toHaveProperty("kitchen");
    expect(view.you!.id).toBe("b");
    expect(view.you!.kitchen.orders[0]!.step).toBe(0);
  });
  it("keeps the kitchen running for a disconnected chef and shows them as offline", () => {
    const s = start(); const now = toCooking(s);
    rivalsEngine.setConnected(s, "b", false, ctx(now));
    expect(rivalsEngine.viewFor(s, "a").rivals[0]!.connected).toBe(false);
    rivalsEngine.tick(s, ctx(now + 5000));
    expect(chef(s, "b").kitchen.t).toBe(5000);
    rivalsEngine.setConnected(s, "b", true, ctx(now + 5000));
    expect(rivalsEngine.viewFor(s, "b").you!.kitchen.t).toBe(5000);
    expect(step(s, "b", now + 5100)).toBe(true);
  });
  it("a rival leaving mid-cook ends the match as players-left, with the stayer winning", () => {
    const s = start(); const now = toCooking(s) + 100;
    rivalsEngine.removePlayer(s, "b", ctx(now));
    expect(s.phase).toBe("finished");
    const results = rivalsEngine.results(s);
    expect(results.reason).toBe("players-left");
    expect(results.entries[0]).toMatchObject({ playerId: "a", isWinner: true, placement: 1 });
    expect(results.entries[1]).toMatchObject({ playerId: "b", isWinner: false, placement: 2 });
  });
  it("leaving before cooking starts aborts the match, so nothing is recorded", () => {
    const s = start();
    rivalsEngine.removePlayer(s, "b", ctx(START + 100));
    expect(rivalsEngine.results(s).reason).toBe("aborted");
  });
});
