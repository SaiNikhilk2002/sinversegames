import { z } from "zod";
import { seededRng, type Rng } from "../core/seeded";
import { checkTimeline, type SoloGameDefinition, type SoloVerifyResult } from "../core/solo";
import {
  CUSTOMER_TYPES,
  isFinal,
  LEVELS,
  PROCESSES,
  RECIPES,
  STATION_TYPES,
  cratesFor,
  type CustomerTypeId,
  type ItemId,
  type LevelDef,
  type RecipeId,
  type StationType,
} from "./content";

/**
 * Kitchen Rush simulation.
 *
 * Every change is derived from timestamps (ms since the shift started):
 * cooking progress is computed from when food was placed, and customers
 * arrive, lose patience and leave at exact times. `advance(state, t)` replays
 * those timed events in order, and `tap(state, cook, target, t)` applies a
 * player interaction. Because nothing depends on frame rate, the browser and
 * the server's replay produce identical results.
 *
 * Every interaction is a tap on a target (drag-and-drop is two taps):
 *   crate:<item>   pick up a raw ingredient
 *   st:<type>:<i>  place on / take from a station
 *   plate:<i>      add the held food to a plate, or pick the plate up to serve
 *   seat:<i>       serve the held plate to that customer
 *   trash          throw away what you're holding (or empty the held plate)
 *
 * Hands are keyed by cook id so co-op (several cooks, one kitchen) can reuse
 * this engine later; single-player uses the cook id "chef".
 */

export const SOLO_COOK = "chef";
const FIRST_ARRIVAL_MS = 2000;
const PLATE_CAPACITY = 6;
export const BURN_PENALTY = 5;
export const MISSED_PENALTY = 10;
export const WRONG_PENALTY = 15;
export const TIP_SHARE = 0.5;
const MAX_SHIFT_MS = 15 * 60 * 1000;

export const targetSchema = z
  .string()
  .max(32)
  .regex(/^(crate:[a-z-]+|st:(board|grill|fryer|pot):\d|plate:\d|seat:\d|trash)$/);

export const kitchenConfigSchema = z.object({ level: z.number().int().min(1).max(LEVELS.length).default(1) });
export type KitchenConfig = z.infer<typeof kitchenConfigSchema>;

export const kitchenTapSchema = z.object({ t: z.number().int(), target: targetSchema });
export type KitchenTap = z.infer<typeof kitchenTapSchema>;
export const kitchenLogSchema = z.array(kitchenTapSchema).max(6000);

export interface Station {
  type: StationType;
  index: number;
  item: ItemId | null;
  placedAt: number;
  burnPenalized: boolean;
}

export type Holding = { kind: "item"; item: ItemId } | { kind: "plate"; plate: number } | null;

export interface Customer {
  id: number;
  recipe: RecipeId;
  type: CustomerTypeId;
  scheduledAt: number;
  patienceMs: number;
  seat: number | null;
  arrivedAt: number | null;
  status: "queued" | "waiting" | "served" | "wrong" | "left";
  resolvedAt: number | null;
  earned: number;
}

export type KitchenEvent =
  | { kind: "arrive"; customer: number; seat: number }
  | { kind: "served"; customer: number; seat: number; points: number; tip: number }
  | { kind: "wrong"; customer: number; seat: number; penalty: number }
  | { kind: "left"; customer: number; seat: number; penalty: number }
  | { kind: "burnt"; station: string }
  | { kind: "pickup"; item: ItemId }
  | { kind: "place"; target: string }
  | { kind: "plate"; plate: number; item: ItemId }
  | { kind: "trash" }
  | { kind: "nope"; target: string };

export interface KitchenState {
  level: LevelDef;
  t: number;
  stations: Station[];
  plates: ItemId[][];
  crates: ItemId[];
  hands: Record<string, Holding>;
  customers: Customer[];
  score: number;
  tips: number;
  served: number;
  wrong: number;
  missed: number;
  burnt: number;
  finished: boolean;
  finishedAt: number | null;
  /** Recent events with a running sequence number, for sounds and pop-ups. */
  events: { seq: number; t: number; e: KitchenEvent }[];
  eventSeq: number;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function pickWeighted<T extends string>(weights: Partial<Record<T, number>>, rng: Rng): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((n, [, w]) => n + w, 0);
  let roll = rng.int(total * 1000) / 1000;
  for (const [k, w] of entries) {
    if (roll < w) return k;
    roll -= w;
  }
  return entries[entries.length - 1]![0];
}

const between = (rng: Rng, [lo, hi]: [number, number]) => lo + rng.int(hi - lo + 1);

export function createKitchen(seed: number, config: KitchenConfig, overrides?: Partial<LevelDef>): KitchenState {
  const level = overrides ? { ...LEVELS[config.level - 1]!, ...overrides } : LEVELS[config.level - 1]!;
  const rng = seededRng(seed);
  const customers: Customer[] = [];
  let at = FIRST_ARRIVAL_MS;
  for (let i = 0; i < level.customers; i++) {
    const type = i === 0 ? "regular" : pickWeighted(level.types, rng);
    const recipe = i === 0 ? level.recipes[0]! : level.recipes[rng.int(level.recipes.length)]!;
    customers.push({
      id: i,
      recipe,
      type,
      scheduledAt: at,
      patienceMs: Math.round(between(rng, level.patience) * CUSTOMER_TYPES[type].patience),
      seat: null,
      arrivedAt: null,
      status: "queued",
      resolvedAt: null,
      earned: 0,
    });
    at += between(rng, level.gap);
  }
  const stations: Station[] = [];
  for (const type of STATION_TYPES) {
    for (let i = 0; i < (level.stations[type] ?? 0); i++) stations.push({ type, index: i, item: null, placedAt: 0, burnPenalized: false });
  }
  return {
    level,
    t: 0,
    stations,
    plates: Array.from({ length: level.plates }, () => []),
    crates: cratesFor(level),
    hands: { [SOLO_COOK]: null },
    customers,
    score: 0,
    tips: 0,
    served: 0,
    wrong: 0,
    missed: 0,
    burnt: 0,
    finished: false,
    finishedAt: null,
    events: [],
    eventSeq: 0,
  };
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

const stationKey = (st: Station) => `st:${st.type}:${st.index}`;

/** What is on a station at time t (food changes as it cooks and burns). */
export function stationForm(st: Station, t: number): { item: ItemId | null; progress: number; state: "empty" | "working" | "done" | "burning" | "burnt" | "idle" } {
  if (!st.item) return { item: null, progress: 0, state: "empty" };
  const proc = PROCESSES[st.type][st.item];
  if (!proc) return { item: st.item, progress: 1, state: "idle" };
  const elapsed = t - st.placedAt;
  if (elapsed < proc.ms) return { item: st.item, progress: elapsed / proc.ms, state: "working" };
  if (proc.burnMs === undefined) return { item: proc.to, progress: 1, state: "done" };
  const over = elapsed - proc.ms;
  if (over < proc.burnMs) return { item: proc.to, progress: over / proc.burnMs, state: over > proc.burnMs * 0.5 ? "burning" : "done" };
  return { item: "burnt", progress: 1, state: "burnt" };
}

function burnTime(st: Station): number | null {
  if (!st.item || st.burnPenalized) return null;
  const proc = PROCESSES[st.type][st.item];
  return proc?.burnMs === undefined ? null : st.placedAt + proc.ms + proc.burnMs;
}

function emit(s: KitchenState, e: KitchenEvent) {
  s.events.push({ seq: ++s.eventSeq, t: s.t, e });
  if (s.events.length > 16) s.events.shift();
}

const freeSeat = (s: KitchenState) => {
  for (let seat = 0; seat < s.level.seats; seat++) if (!s.customers.some((c) => c.status === "waiting" && c.seat === seat)) return seat;
  return null;
};

function resolve(s: KitchenState, c: Customer, status: Customer["status"]) {
  c.status = status;
  c.resolvedAt = s.t;
  if (s.customers.every((x) => x.status !== "queued" && x.status !== "waiting")) {
    s.finished = true;
    s.finishedAt = s.t;
  }
}

/** Processes every timed event up to `t`, in order. */
export function advance(s: KitchenState, t: number) {
  while (!s.finished) {
    let next = Infinity;
    let run: (() => void) | null = null;
    for (const st of s.stations) {
      const bt = burnTime(st);
      if (bt !== null && bt < next) {
        next = bt;
        run = () => {
          st.burnPenalized = true;
          s.burnt++;
          s.score -= BURN_PENALTY;
          emit(s, { kind: "burnt", station: stationKey(st) });
        };
      }
    }
    for (const c of s.customers) {
      if (c.status !== "waiting") continue;
      const leaveAt = c.arrivedAt! + c.patienceMs;
      if (leaveAt < next) {
        next = leaveAt;
        run = () => {
          const penalty = Math.round(MISSED_PENALTY * CUSTOMER_TYPES[c.type].penalty);
          s.missed++;
          s.score -= penalty;
          emit(s, { kind: "left", customer: c.id, seat: c.seat!, penalty });
          resolve(s, c, "left");
        };
      }
    }
    const queued = s.customers.find((c) => c.status === "queued");
    const seat = queued ? freeSeat(s) : null;
    if (queued && seat !== null) {
      const arriveAt = Math.max(queued.scheduledAt, s.t);
      if (arriveAt < next) {
        next = arriveAt;
        run = () => {
          queued.status = "waiting";
          queued.seat = seat;
          queued.arrivedAt = s.t;
          emit(s, { kind: "arrive", customer: queued.id, seat });
        };
      }
    }
    if (next > t || !run) break;
    s.t = next;
    run();
  }
  if (t > s.t) s.t = t;
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

const sameDish = (parts: ItemId[], recipe: RecipeId) => {
  const want = [...RECIPES[recipe].parts].sort();
  const have = [...parts].sort();
  return want.length === have.length && want.every((p, i) => p === have[i]);
};

export const customerValue = (c: Customer) => Math.round(RECIPES[c.recipe].value * CUSTOMER_TYPES[c.type].value);
export const maxTip = (c: Customer) => Math.round(RECIPES[c.recipe].value * TIP_SHARE * CUSTOMER_TYPES[c.type].tip);

function addToPlate(s: KitchenState, plate: number, item: ItemId): boolean {
  const parts = s.plates[plate];
  if (!parts || !isFinal(item) || parts.includes(item) || parts.length >= PLATE_CAPACITY) return false;
  parts.push(item);
  emit(s, { kind: "plate", plate, item });
  return true;
}

/** Applies one tap at time t (call `advance` first). Taps that do nothing are harmless. */
export function tap(s: KitchenState, cook: string, target: string, t: number) {
  advance(s, t);
  if (s.finished) return;
  const hand = s.hands[cook] ?? null;
  const nope = () => emit(s, { kind: "nope", target });
  const [kind, a, b] = target.split(":");

  if (kind === "crate") {
    const item = a as ItemId;
    if (!s.crates.includes(item)) return nope();
    if (hand) return nope();
    s.hands[cook] = { kind: "item", item };
    emit(s, { kind: "pickup", item });
    return;
  }

  if (kind === "st") {
    const st = s.stations.find((x) => x.type === a && x.index === Number(b));
    if (!st) return nope();
    const form = stationForm(st, s.t);
    if (hand?.kind === "item") {
      if (st.item || !PROCESSES[st.type][hand.item]) return nope();
      st.item = hand.item;
      st.placedAt = s.t;
      st.burnPenalized = false;
      s.hands[cook] = null;
      emit(s, { kind: "place", target });
      return;
    }
    if (!st.item || form.state === "working") return nope();
    if (hand?.kind === "plate") {
      // Shortcut: tap a station while holding a plate to plate the finished food directly.
      if (!form.item || !addToPlate(s, hand.plate, form.item)) return nope();
      st.item = null;
      return;
    }
    s.hands[cook] = { kind: "item", item: form.item! };
    st.item = null;
    emit(s, { kind: "pickup", item: form.item! });
    return;
  }

  if (kind === "plate") {
    const plate = Number(a);
    if (!s.plates[plate]) return nope();
    if (hand?.kind === "item") {
      if (Object.entries(s.hands).some(([id, h]) => id !== cook && h?.kind === "plate" && h.plate === plate)) return nope();
      if (!addToPlate(s, plate, hand.item)) return nope();
      s.hands[cook] = null;
      return;
    }
    // A plate can only be in one cook's hands, or two cooks could serve the same food.
    const heldByOther = Object.entries(s.hands).some(([id, h]) => id !== cook && h?.kind === "plate" && h.plate === plate);
    if (hand?.kind === "plate") {
      if (hand.plate !== plate && heldByOther) return nope();
      s.hands[cook] = hand.plate === plate ? null : { kind: "plate", plate };
      return;
    }
    if (heldByOther || !s.plates[plate]!.length) return nope();
    s.hands[cook] = { kind: "plate", plate };
    return;
  }

  if (kind === "seat") {
    const seat = Number(a);
    const c = s.customers.find((x) => x.status === "waiting" && x.seat === seat);
    if (!c || hand?.kind !== "plate") return nope();
    const parts = s.plates[hand.plate]!;
    s.plates[hand.plate] = [];
    s.hands[cook] = null;
    const type = CUSTOMER_TYPES[c.type];
    if (sameDish(parts, c.recipe)) {
      const remaining = Math.max(0, (c.arrivedAt! + c.patienceMs - s.t) / c.patienceMs);
      const points = customerValue(c);
      const tip = Math.round(maxTip(c) * remaining);
      c.earned = points + tip;
      s.score += points + tip;
      s.tips += tip;
      s.served++;
      emit(s, { kind: "served", customer: c.id, seat, points, tip });
      resolve(s, c, "served");
    } else {
      const penalty = Math.round(WRONG_PENALTY * type.penalty);
      s.score -= penalty;
      s.wrong++;
      emit(s, { kind: "wrong", customer: c.id, seat, penalty });
      resolve(s, c, "wrong");
    }
    return;
  }

  if (kind === "trash") {
    if (!hand) return nope();
    if (hand.kind === "plate") s.plates[hand.plate] = [];
    s.hands[cook] = null;
    emit(s, { kind: "trash" });
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export const maxScore = (s: KitchenState) => s.customers.reduce((n, c) => n + customerValue(c) + maxTip(c), 0);

export function starsFor(s: KitchenState, score = s.score): 0 | 1 | 2 | 3 {
  const ratio = score / Math.max(1, maxScore(s));
  return ratio >= 0.8 ? 3 : ratio >= 0.6 ? 2 : ratio >= 0.35 ? 1 : 0;
}

export const kitchenRush: SoloGameDefinition<KitchenConfig, KitchenTap[]> = {
  id: "kitchen-rush",
  configSchema: kitchenConfigSchema,
  logSchema: kitchenLogSchema,
  verify(seed, config, log): SoloVerifyResult {
    const timing = checkTimeline(
      log.map((x) => x.t),
      MAX_SHIFT_MS,
    );
    if (timing) return { ok: false, reason: timing };
    const s = createKitchen(seed, config);
    for (const { t, target } of log) tap(s, SOLO_COOK, target, t);
    // Whatever wasn't served by the end of the log plays out (customers leave, food burns).
    advance(s, MAX_SHIFT_MS);
    if (!s.finished) return { ok: false, reason: "The shift did not finish" };
    const score = Math.max(0, s.score);
    const stars = starsFor(s, score);
    return {
      ok: true,
      result: {
        score,
        completed: stars >= 1,
        durationMs: s.finishedAt ?? s.t,
        details: { level: s.level.number, stars, served: s.served, missed: s.missed, wrong: s.wrong, burnt: s.burnt },
      },
    };
  },
};
