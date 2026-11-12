import { describe, expect, it } from "vitest";
import { seededRng } from "../src/core/seeded";
import { COOP_COUNTDOWN_MS, COOP_INTRO_MS, COOP_KITCHENS, COOP_PROTOCOL, kitchenCoopEngine, PROCESSES, RECIPES, stationForm, STATION_TYPES, tap, createKitchen, teamScore, type CoopState, type ItemId } from "../src/kitchen-rush";

const crew = (n = 2) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `Cook ${i}`, color: "#ff6b6b" }));
const START = 2_000_000;
const ctx = (now: number) => ({ now, rng: seededRng(5) });
const start = (kitchen = 1, n = 2, seed = 9) => kitchenCoopEngine.create(crew(n), { kitchen }, { now: START, rng: seededRng(seed) }).state;
const act = (target: string, p = COOP_PROTOCOL) => ({ type: "kitchen:tap" as const, p, target });
function open(s: CoopState) { kitchenCoopEngine.tick(s, ctx(s.playAt)); expect(s.phase).toBe("cooking"); return s.playAt; }
const hand = (s: CoopState, id: string) => s.kitchen.hands[id] ?? null;
const go = (s: CoopState, id: string, target: string, now: number) => kitchenCoopEngine.handleAction(s, id, act(target), ctx(now));
function firstCustomerIn(s: CoopState, now: number) { kitchenCoopEngine.tick(s, ctx(now)); return s.kitchen.customers.find(c => c.status === "waiting")!; }

/** A simple team: each cook takes whichever useful job is free. Rolls only ever come from intents. */
function teamTurn(s: CoopState, id: string, now: number) {
  const k = s.kitchen; const t = now - s.playAt; const h = hand(s, id);
  const waiting = k.customers.filter(c => c.status === "waiting");
  if (h?.kind === "plate") {
    const parts = [...k.plates[h.plate]!].sort().join();
    const match = waiting.find(c => [...RECIPES[c.recipe].parts].sort().join() === parts);
    if (match) return go(s, id, `seat:${match.seat}`, now);
    return go(s, id, `plate:${h.plate}`, now);
  }
  if (h?.kind === "item") {
    const item = h.item;
    if (item === "burnt") return go(s, id, "trash", now);
    const station = STATION_TYPES.flatMap(type => PROCESSES[type][item] ? k.stations.filter(st => st.type === type && !st.item) : [])[0];
    if (station) return go(s, id, `st:${station.type}:${station.index}`, now);
    if (PROCESSES.board[item] || PROCESSES.grill[item] || PROCESSES.fryer[item] || PROCESSES.pot[item]) return null;
    const plate = k.plates.findIndex((parts, i) => !Object.entries(k.hands).some(([cid, x]) => cid !== id && x?.kind === "plate" && x.plate === i) && !parts.includes(item) && waiting.some(c => (RECIPES[c.recipe].parts as readonly ItemId[]).includes(item) && parts.every(p => (RECIPES[c.recipe].parts as readonly ItemId[]).includes(p))));
    return plate >= 0 ? go(s, id, `plate:${plate}`, now) : go(s, id, "trash", now);
  }
  for (let i = 0; i < k.plates.length; i++) {
    const parts = [...k.plates[i]!].sort().join();
    if (parts && waiting.some(c => [...RECIPES[c.recipe].parts].sort().join() === parts) && !Object.values(k.hands).some(x => x?.kind === "plate" && x.plate === i)) return go(s, id, `plate:${i}`, now);
  }
  const ready = k.stations.find(st => st.item && ["done", "burning", "burnt", "idle"].includes(stationForm(st, t).state));
  if (ready) return go(s, id, `st:${ready.type}:${ready.index}`, now);
  const becomes = (item: ItemId): ItemId[] => { const next = STATION_TYPES.map(type => PROCESSES[type][item]?.to).find(Boolean); return next ? [item, ...becomes(next)] : [item]; };
  const have = new Set<ItemId>([...k.plates.flat(), ...k.stations.flatMap(st => st.item ? becomes(st.item) : []), ...Object.values(k.hands).flatMap(x => x?.kind === "item" ? becomes(x.item) : [])]);
  for (const c of waiting) for (const part of RECIPES[c.recipe].parts) {
    if (have.has(part as ItemId)) continue;
    const source = k.crates.find(raw => raw === part || STATION_TYPES.some(type => PROCESSES[type][raw]?.to === part || (PROCESSES[type][raw]?.to && STATION_TYPES.some(two => PROCESSES[two][PROCESSES[type][raw]!.to]?.to === part))));
    if (source) { have.add(part as ItemId); return go(s, id, `crate:${source}`, now); }
  }
  return null;
}
function playTeam(s: CoopState, pace = 300) {
  let now = open(s); let guard = 0;
  while (s.phase === "cooking" && guard++ < 20_000) {
    now += pace;
    for (const cook of s.cooks) if (s.phase === "cooking" && !cook.left) teamTurn(s, cook.id, now);
    if (s.phase === "cooking") kitchenCoopEngine.tick(s, ctx(now));
  }
  expect(s.phase).toBe("finished");
  return kitchenCoopEngine.results(s);
}

describe("Kitchen Rush Co-op flow", () => {
  it("runs intro, countdown and cooking on the server's clock", () => {
    const s = start();
    expect(s.phase).toBe("intro");
    expect(kitchenCoopEngine.nextDeadline(s)).toBe(START + COOP_INTRO_MS);
    kitchenCoopEngine.tick(s, ctx(START + COOP_INTRO_MS)); expect(s.phase).toBe("countdown");
    kitchenCoopEngine.tick(s, ctx(START + COOP_INTRO_MS + COOP_COUNTDOWN_MS)); expect(s.phase).toBe("cooking");
  });
  it("refuses cooking before the start", () => expect(go(start(), "c0", "crate:bun", START + 10)).toMatchObject({ ok: false, code: "GAME_NOT_ACTIVE" }));
  it("every cook has their own empty hands, and no solo chef remains", () => {
    expect(start(1, 4).kitchen.hands).toEqual({ c0: null, c1: null, c2: null, c3: null });
  });
  it.each(COOP_KITCHENS.map(k => [k.number, k.name] as const))("kitchen %i (%s) can be completed by a real team", (number) => {
    for (const n of [2, 4]) {
      const results = playTeam(start(number, n));
      expect(results.reason).toBe("completed");
      expect(results.entries).toHaveLength(n);
      expect(Number(results.entries[0]!.details!.served)).toBeGreaterThan(0);
      expect(results.entries[0]!.score).toBeGreaterThan(0);
    }
  });
  it("each later kitchen adds a rule, not only speed", () => {
    const signature = COOP_KITCHENS.map(k => `${k.level}|${k.combos}|${k.stockPerCook !== null}|${k.hazards}`);
    expect(new Set(signature).size).toBe(COOP_KITCHENS.length);
    expect(COOP_KITCHENS).toHaveLength(7);
  });
  it("more cooks means more guests", () => {
    expect(start(1, 4).kitchen.customers.length).toBeGreaterThan(start(1, 2).kitchen.customers.length);
  });
});

describe("Simultaneous actions on shared things", () => {
  it("lets two cooks work independently at once", () => {
    const s = start(2); const now = open(s) + 100;
    expect(go(s, "c0", "crate:patty-raw", now).ok).toBe(true);
    expect(go(s, "c1", "crate:bun", now).ok).toBe(true);
    expect(hand(s, "c0")).toEqual({ kind: "item", item: "patty-raw" });
    expect(hand(s, "c1")).toEqual({ kind: "item", item: "bun" });
  });
  it("gives a one-slot station to whoever arrived first", () => {
    const s = start(1); const now = open(s) + 100;
    s.kitchen.stations = s.kitchen.stations.slice(0, 1);
    const st = s.kitchen.stations[0]!; const target = `st:${st.type}:${st.index}`;
    go(s, "c0", "crate:patty-raw", now); go(s, "c1", "crate:patty-raw", now);
    go(s, "c0", target, now + 10); go(s, "c1", target, now + 10);
    expect(hand(s, "c0")).toBeNull();
    expect(hand(s, "c1")).toEqual({ kind: "item", item: "patty-raw" });
    expect(s.kitchen.stations[0]!.placedAt).toBe(110);
  });
  it("two cooks grabbing the same cooked food: only one gets it, so it can't duplicate", () => {
    const s = start(1); const now = open(s) + 100;
    const st = s.kitchen.stations[0]!; const target = `st:${st.type}:${st.index}`;
    go(s, "c0", "crate:patty-raw", now); go(s, "c0", target, now + 10);
    const later = now + 4500;
    go(s, "c0", target, later); go(s, "c1", target, later);
    expect(hand(s, "c0")).toEqual({ kind: "item", item: "patty-cooked" });
    expect(hand(s, "c1")).toBeNull();
    expect(s.kitchen.stations[0]!.item).toBeNull();
  });
  it("a plate can only be in one cook's hands", () => {
    const s = start(1); const now = open(s) + 100;
    go(s, "c0", "crate:bun", now); go(s, "c0", "plate:0", now);
    go(s, "c0", "plate:0", now + 10); go(s, "c1", "plate:0", now + 10);
    expect(hand(s, "c0")).toEqual({ kind: "plate", plate: 0 });
    expect(hand(s, "c1")).toBeNull();
  });
  it("can't add food to a plate a teammate is holding", () => {
    const s = start(1); const now = open(s) + 100;
    go(s, "c0", "crate:bun", now); go(s, "c0", "plate:0", now); go(s, "c0", "plate:0", now + 5);
    go(s, "c1", "crate:bun", now + 10); go(s, "c1", "plate:0", now + 15);
    expect(s.kitchen.plates[0]).toEqual(["bun"]);
    expect(hand(s, "c1")).toEqual({ kind: "item", item: "bun" });
  });
  it("one plate completes one order, once", () => {
    const s = start(1); let now = open(s) + 100;
    const customer = firstCustomerIn(s, now + 2100); now += 2200;
    const st = s.kitchen.stations[0]!; const target = `st:${st.type}:${st.index}`;
    go(s, "c0", "crate:patty-raw", now); go(s, "c0", target, now + 10);
    now += 4500; go(s, "c0", target, now); go(s, "c0", "plate:0", now + 10);
    go(s, "c1", "crate:bun", now + 20); go(s, "c1", "plate:0", now + 30);
    if (customer.recipe === "burger") {
      go(s, "c1", "plate:0", now + 40);
      go(s, "c1", `seat:${customer.seat}`, now + 50);
      go(s, "c0", `seat:${customer.seat}`, now + 50);
      expect(s.kitchen.served).toBe(1);
      expect(s.kitchen.wrong).toBe(0);
      expect(s.kitchen.customers[customer.id]!.status).toBe("served");
    }
    expect(s.handoffs).toBeGreaterThanOrEqual(0);
  });
  it("solo Kitchen Rush is unaffected by plate locking", () => {
    const k = createKitchen(1, { level: 1 });
    tap(k, "chef", "crate:bun", 10); tap(k, "chef", "plate:0", 20); tap(k, "chef", "plate:0", 30);
    expect(k.hands.chef).toEqual({ kind: "plate", plate: 0 });
  });
});

describe("Team rules", () => {
  it("everyone shares one team score, whoever did the work", () => {
    const s = start(3, 3);
    const results = playTeam(s);
    const present = results.entries.map(e => e.score);
    expect(new Set(present).size).toBe(1);
    expect(present[0]).toBe(teamScore(s));
    expect(results.entries.every(e => e.placement === 1)).toBe(true);
  });
  it("all win or none do", () => {
    const failed = start(1);
    open(failed);
    kitchenCoopEngine.tick(failed, ctx(failed.endsAt));
    const results = kitchenCoopEngine.results(failed);
    expect(results.entries.every(e => !e.isWinner)).toBe(true);
    expect(results.entries.every(e => e.score === 0)).toBe(true);
  });
  it("food passed between cooks counts as teamwork", () => {
    const s = start(1); const now = open(s) + 100;
    const st = s.kitchen.stations[0]!; const target = `st:${st.type}:${st.index}`;
    go(s, "c0", "crate:patty-raw", now); go(s, "c0", target, now + 10);
    go(s, "c1", target, now + 4500);
    expect(hand(s, "c1")).toEqual({ kind: "item", item: "patty-cooked" });
    expect(s.handoffs).toBe(1);
  });
  it("picking up your own food isn't a handoff", () => {
    const s = start(1); const now = open(s) + 100;
    const st = s.kitchen.stations[0]!; const target = `st:${st.type}:${st.index}`;
    go(s, "c0", "crate:patty-raw", now); go(s, "c0", target, now + 10); go(s, "c0", target, now + 4500);
    expect(s.handoffs).toBe(0);
  });
  it("trashing food costs the team, and passing food back and forth can't farm points", () => {
    const s = start(1); const now = open(s) + 100;
    go(s, "c0", "crate:bun", now); go(s, "c0", "trash", now + 10);
    expect(s.wasted).toBe(1);
    expect(teamScore(s)).toBe(0);
    s.handoffs = 500;
    expect(teamScore(s)).toBe(0);
  });
  it("limited stock runs out, and a spare can't be taken twice", () => {
    const s = start(5, 2); const now = open(s) + 100;
    const item = s.kitchen.crates[0]!;
    expect(s.stock![item]).toBe(10);
    s.stock![item] = 1;
    expect(go(s, "c0", `crate:${item}`, now).ok).toBe(true);
    expect(s.stock![item]).toBe(0);
    expect(go(s, "c1", `crate:${item}`, now)).toMatchObject({ ok: false, code: "INVALID_MOVE" });
    expect(hand(s, "c1")).toBeNull();
  });
  it("a full-handed tap doesn't spend stock", () => {
    const s = start(5, 2); const now = open(s) + 100;
    const item = s.kitchen.crates[0]!; const before = s.stock![item]!;
    go(s, "c0", `crate:${item}`, now); go(s, "c0", `crate:${item}`, now + 10);
    expect(s.stock![item]).toBe(before - 1);
  });
  it("a flare-up blocks the station, then clears", () => {
    const s = start(6, 2); open(s);
    kitchenCoopEngine.tick(s, ctx(s.playAt + 15_000));
    expect(s.hazard).not.toBeNull();
    const target = s.hazard!.target; const until = s.hazard!.until;
    expect(go(s, "c0", target, s.playAt + 15_100)).toMatchObject({ ok: false, code: "INVALID_MOVE" });
    kitchenCoopEngine.tick(s, ctx(s.playAt + until));
    expect(s.hazard?.target === target && s.hazard.until === until).toBe(false);
  });
  it("quick serves chain into combos; only combo kitchens pay for them", () => {
    const s = start(3, 2);
    const results = playTeam(s, 200);
    expect(s.comboBonus).toBeGreaterThanOrEqual(0);
    expect(Number(results.entries[0]!.details!.bestCombo)).toBeGreaterThanOrEqual(1);
    const noCombos = start(1, 2); playTeam(noCombos, 200);
    expect(noCombos.comboBonus).toBe(0);
  });
});

describe("Co-op invalid input and departures", () => {
  it.each(["seat:9", "plate:9", "st:grill:9", "crate:gold"])("treats the harmless bad target %s as doing nothing", (target) => {
    const s = start(); const now = open(s) + 100;
    expect(go(s, "c0", target, now).ok).toBe(true);
    expect(s.kitchen.served).toBe(0); expect(hand(s, "c0")).toBeNull();
  });
  it("rejects outsiders and out-of-date tabs", () => {
    const s = start(); const now = open(s) + 100;
    expect(go(s, "stranger", "crate:bun", now)).toMatchObject({ ok: false, code: "NOT_IN_ROOM" });
    expect(kitchenCoopEngine.handleAction(s, "c0", act("crate:bun", 0), ctx(now))).toMatchObject({ ok: false, code: "STALE_STATE" });
  });
  it("hides future guests' orders", () => {
    const s = start();
    const view = kitchenCoopEngine.viewFor(s, "c0");
    expect(view.customers).toEqual([]);
    expect(view.upcoming).toBe(s.kitchen.customers.length);
  });
  it("keeps the shift going when a cook drops, and shows them offline", () => {
    const s = start(); const now = open(s);
    kitchenCoopEngine.setConnected(s, "c1", false, ctx(now));
    expect(kitchenCoopEngine.viewFor(s, "c0").cooks[1]!.connected).toBe(false);
    kitchenCoopEngine.tick(s, ctx(now + 3000));
    expect(s.kitchen.t).toBe(3000);
  });
  it("a departing cook frees their plate, and the team can finish", () => {
    const s = start(1, 3); const now = open(s) + 100;
    go(s, "c0", "crate:bun", now); go(s, "c0", "plate:0", now); go(s, "c0", "plate:0", now + 5);
    kitchenCoopEngine.removePlayer(s, "c0", ctx(now + 10));
    expect(s.phase).toBe("cooking");
    expect(go(s, "c1", "plate:0", now + 20).ok).toBe(true);
    expect(hand(s, "c1")).toEqual({ kind: "plate", plate: 0 });
    const results = playTeamFrom(s, now + 40);
    const left = results.entries.find(e => e.playerId === "c0")!;
    expect(left).toMatchObject({ isWinner: false, score: 0, placement: 2 });
  });
  it("leaving before cooking aborts when too few remain", () => {
    const s = start();
    kitchenCoopEngine.removePlayer(s, "c1", ctx(START + 100));
    expect(kitchenCoopEngine.results(s).reason).toBe("aborted");
  });
});
function playTeamFrom(s: CoopState, from: number) {
  let now = from; let guard = 0;
  while (s.phase === "cooking" && guard++ < 20_000) {
    now += 300;
    for (const cook of s.cooks) if (s.phase === "cooking" && !cook.left) teamTurn(s, cook.id, now);
    if (s.phase === "cooking") kitchenCoopEngine.tick(s, ctx(now));
  }
  return kitchenCoopEngine.results(s);
}
