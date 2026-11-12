import { z } from "zod";
import type { MatchResults } from "@platform/shared";
import { fail, type EngineResult, type EngineSuccess, type GameEngine, type PlayerRef } from "../core/types";
import { LEVELS, RECIPES, type ItemId, type LevelDef, type RecipeId, type StationType } from "./content";
import { advance, createKitchen, maxScore, starsFor, stationForm, tap, targetSchema, type Customer, type Holding, type KitchenState, type Station } from "./engine";

/**
 * Kitchen Rush Co-op: several cooks share one kitchen. The solo simulation
 * already keys hands by cook, and the room layer applies actions one at a time,
 * so whoever reaches a station first gets it and the other's tap does nothing.
 * This file adds the team rules on top: stock, combos, hazards and teamwork.
 */

export const COOP_PROTOCOL = 1;
export const COOP_INTRO_MS = 5000;
export const COOP_COUNTDOWN_MS = 3000;
const SYNC_MS = 500;
const MAX_SHIFT_MS = 7 * 60_000;
const COMBO_WINDOW_MS = 9000;
const HAZARD_MS = 6000;

export interface CoopKitchen {
  number: number; name: string; twist: string; level: number;
  overrides: Partial<Pick<LevelDef, "customers" | "gap" | "patience" | "seats" | "plates">>;
  /** Consecutive quick serves earn a team bonus. */
  combos: boolean;
  /** Ingredients run out: each raw ingredient has this many servings per cook. */
  stockPerCook: number | null;
  /** Grills and fryers flare up and can't be touched for a moment. */
  hazards: boolean;
}
/** Each kitchen adds a new thing to manage, not just a faster clock. */
export const COOP_KITCHENS: CoopKitchen[] = [
  { number: 1, name: "Street Food Stall", twist: "One grill, two pairs of hands. Learn to pass food along.", level: 2, overrides: { customers: 7, gap: [6000, 8000] }, combos: false, stockPerCook: null, hazards: false },
  { number: 2, name: "Small Café", twist: "A chopping board joins the line, so split up prep and grill.", level: 3, overrides: { customers: 8, gap: [5500, 8000] }, combos: false, stockPerCook: null, hazards: false },
  { number: 3, name: "Family Restaurant", twist: "Combo chains: quick serves in a row earn a team bonus.", level: 4, overrides: { customers: 10, gap: [5000, 7000] }, combos: true, stockPerCook: null, hazards: false },
  { number: 4, name: "Luxury Restaurant", twist: "Critics and VIPs pay more and punish mistakes harder.", level: 9, overrides: { customers: 10, gap: [6000, 8500] }, combos: true, stockPerCook: null, hazards: false },
  { number: 5, name: "Food Court", twist: "Limited stock: every wasted ingredient may cost you an order.", level: 7, overrides: { customers: 11, gap: [5000, 7000] }, combos: true, stockPerCook: 5, hazards: false },
  { number: 6, name: "Festival Kitchen", twist: "Flare-ups: grills and fryers go out of reach for a few seconds.", level: 11, overrides: { customers: 12, gap: [4800, 6800] }, combos: true, stockPerCook: null, hazards: true },
  { number: 7, name: "International Food Hall", twist: "Everything at once: combos, limited stock, flare-ups and big waves.", level: 12, overrides: { customers: 14, gap: [4200, 6000] }, combos: true, stockPerCook: 8, hazards: true },
];

export const coopConfigSchema = z.object({ kitchen: z.number().int().min(1).max(COOP_KITCHENS.length).default(1) }).strict();
export type CoopConfig = z.infer<typeof coopConfigSchema>;
export const coopActionSchema = z.object({ type: z.literal("kitchen:tap"), p: z.number().int(), target: targetSchema });
export type CoopAction = z.infer<typeof coopActionSchema>;

export type CookPose = "idle" | "gather" | "chop" | "cook" | "stir" | "plate" | "serve";
interface Cook extends PlayerRef { connected: boolean; left: boolean; target: string | null; pose: CookPose; actions: number }
export interface CoopState {
  config: CoopConfig; def: CoopKitchen; phase: "intro" | "countdown" | "cooking" | "finished"; now: number; startedAt: number; introEndsAt: number; playAt: number; endsAt: number; syncAt: number; endedAt: number | null; endReason: MatchResults["reason"] | null;
  kitchen: KitchenState; cooks: Cook[]; stock: Partial<Record<ItemId, number>> | null; wasted: number; combo: number; bestCombo: number; comboBonus: number; lastServedAt: number | null;
  hazard: { target: string; until: number } | null; nextHazardAt: number; hazards: number; handoffs: number; touched: Record<string, string>; seenEvent: number; hazardRoll: number;
}
export interface CoopView {
  phase: CoopState["phase"]; now: number; introEndsAt: number; playAt: number; endsAt: number; kitchenDef: { number: number; name: string; twist: string; combos: boolean; hazards: boolean }; levelNumber: number;
  t: number; stations: Station[]; plates: ItemId[][]; crates: ItemId[]; seats: number; customers: Customer[]; upcoming: number; hands: Record<string, Holding>;
  score: number; served: number; wrong: number; missed: number; burnt: number; wasted: number; combo: number; handoffs: number; stock: Partial<Record<ItemId, number>> | null; hazard: { target: string; until: number } | null; finished: boolean; maxScore: number;
  events: KitchenState["events"]; eventSeq: number; cooks: { id: string; name: string; color: string; connected: boolean; left: boolean; target: string | null; pose: CookPose }[];
}

const ok = (state: CoopState, stateChanged = true): EngineSuccess<CoopState> => ({ ok: true, state, stateChanged, messages: [] });
const staying = (s: CoopState) => s.cooks.filter((c) => !c.left);
const clockOf = (s: CoopState, now: number) => Math.max(0, Math.min(now - s.playAt, s.endsAt - s.playAt));

/** The team's score. Everyone shares it, so helping a teammate pays exactly as much as serving. */
export function teamScore(s: CoopState) {
  const teamwork = Math.min(s.handoffs, s.kitchen.served * 2) * 3;
  return Math.max(0, s.kitchen.score + s.comboBonus + teamwork - s.wasted * 2);
}

function poseFor(s: CoopState, target: string): CookPose {
  const [kind, type] = target.split(":");
  if (kind === "crate" || kind === "trash") return "gather";
  if (kind === "plate") return "plate";
  if (kind === "seat") return "serve";
  return type === "board" ? "chop" : type === "pot" ? "stir" : "cook";
}
function finish(s: CoopState, now: number, reason: MatchResults["reason"]) {
  if (s.phase === "finished") return;
  s.phase = "finished"; s.endedAt = now; s.endReason = reason;
}
/** Combos follow served and failed events, wherever they came from. */
function followEvents(s: CoopState) {
  for (const { seq, t, e } of s.kitchen.events) {
    if (seq <= s.seenEvent) continue;
    s.seenEvent = seq;
    if (e.kind === "served") {
      s.combo = s.lastServedAt !== null && t - s.lastServedAt <= COMBO_WINDOW_MS ? s.combo + 1 : 1;
      s.lastServedAt = t;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      if (s.def.combos && s.combo > 1) s.comboBonus += Math.min(25, (s.combo - 1) * 5);
    } else if (e.kind === "wrong" || e.kind === "left") s.combo = 0;
  }
}
function step(s: CoopState, now: number, rng: { int(max: number): number }) {
  if (s.phase === "intro" && now >= s.introEndsAt) s.phase = "countdown";
  if (s.phase === "countdown" && now >= s.playAt) s.phase = "cooking";
  if (s.phase !== "cooking") return;
  const t = clockOf(s, now);
  advance(s.kitchen, t);
  followEvents(s);
  if (s.hazard && t >= s.hazard.until) s.hazard = null;
  if (s.def.hazards && !s.hazard && t >= s.nextHazardAt) {
    const hot = s.kitchen.stations.filter((st) => st.type === "grill" || st.type === "fryer");
    if (hot.length) { const st = hot[rng.int(hot.length)]!; s.hazard = { target: `st:${st.type}:${st.index}`, until: t + HAZARD_MS }; s.hazards++; }
    s.nextHazardAt = t + 18_000 + rng.int(8000);
  }
  if (s.kitchen.finished || now >= s.endsAt) finish(s, now, "completed");
}

export const kitchenCoopEngine: GameEngine<CoopState, CoopConfig, CoopAction, CoopView> = {
  id: "kitchen-rush-coop",
  minPlayers: 2,
  maxPlayers: 4,
  configSchema: coopConfigSchema,
  defaultConfig: () => ({ kitchen: 1 }),
  actionSchema: coopActionSchema,
  actionTypes: ["kitchen:tap"],
  requiresVersion: () => false,
  create(players, config, ctx) {
    const def = COOP_KITCHENS[config.kitchen - 1]!;
    const extra = Math.max(0, players.length - 2);
    const customers = (def.overrides.customers ?? LEVELS[def.level - 1]!.customers) + extra * 2;
    const kitchen = createKitchen(ctx.rng.int(0x7fffffff), { level: def.level }, { ...def.overrides, customers });
    kitchen.hands = Object.fromEntries(players.map((p) => [p.id, null]));
    const introEndsAt = ctx.now + COOP_INTRO_MS, playAt = introEndsAt + COOP_COUNTDOWN_MS;
    return ok({
      config, def, phase: "intro", now: ctx.now, startedAt: ctx.now, introEndsAt, playAt, endsAt: playAt + MAX_SHIFT_MS, syncAt: playAt, endedAt: null, endReason: null, kitchen,
      cooks: players.map((p) => ({ ...p, connected: true, left: false, target: null, pose: "idle", actions: 0 })),
      stock: def.stockPerCook === null ? null : Object.fromEntries(kitchen.crates.map((item) => [item, def.stockPerCook! * players.length])),
      wasted: 0, combo: 0, bestCombo: 0, comboBonus: 0, lastServedAt: null, hazard: null, nextHazardAt: 15_000, hazards: 0, handoffs: 0, touched: {}, seenEvent: 0, hazardRoll: 0,
    });
  },
  handleAction(s, playerId, action, ctx): EngineResult<CoopState> {
    s.now = ctx.now;
    if (action.p !== COOP_PROTOCOL) return fail("STALE_STATE", "The game has been updated. Refresh this page to keep playing.");
    const cook = s.cooks.find((c) => c.id === playerId);
    if (!cook || cook.left) return fail("NOT_IN_ROOM", "You're not cooking in this match");
    if (s.phase !== "cooking") return fail("GAME_NOT_ACTIVE", s.phase === "finished" ? "The shift is over" : "The shift hasn't started yet");
    step(s, ctx.now, ctx.rng);
    if ((s.phase as CoopState["phase"]) === "finished") return ok(s);
    const { target } = action;
    if (s.hazard?.target === target) return fail("INVALID_MOVE", "Flare-up! Wait a moment before touching that.");
    const kitchen = s.kitchen;
    const before = kitchen.hands[playerId] ?? null;
    const [kind, a, b] = target.split(":");
    if (kind === "crate" && !before && s.stock && (s.stock[a as ItemId] ?? 0) <= 0) return fail("INVALID_MOVE", `Out of ${a!.replaceAll("-", " ")}. Don't waste what's left.`);
    const heldParts = before?.kind === "plate" ? kitchen.plates[before.plate]!.length : 0;
    const stationHeld = kind === "st" ? kitchen.stations.find((x) => x.type === a && x.index === Number(b))?.item ?? null : null;
    tap(kitchen, playerId, target, clockOf(s, ctx.now));
    const after = kitchen.hands[playerId] ?? null;
    if (kind === "crate" && !before && after?.kind === "item" && s.stock) s.stock[a as ItemId] = (s.stock[a as ItemId] ?? 0) - 1;
    if (kind === "trash" && before) s.wasted += before.kind === "item" ? 1 : heldParts;
    // Teamwork: count food that one cook prepared and another carried on.
    const noteHandoff = (place: string) => { const by = s.touched[place]; if (by && by !== playerId) s.handoffs++; };
    if (kind === "st") {
      if (!before && after?.kind === "item" && stationHeld) { noteHandoff(target); delete s.touched[target]; }
      else if (before?.kind === "item" && !after) s.touched[target] = playerId;
      else if (before?.kind === "plate" && stationHeld && kitchen.stations.find((x) => x.type === a && x.index === Number(b))?.item === null) { noteHandoff(target); delete s.touched[target]; s.touched[`plate:${before.plate}`] = playerId; }
    }
    if (kind === "plate" && before?.kind === "item" && !after) s.touched[target] = playerId;
    if (kind === "seat" && before?.kind === "plate" && !after) { noteHandoff(`plate:${before.plate}`); delete s.touched[`plate:${before.plate}`]; }
    cook.target = target; cook.pose = poseFor(s, target); cook.actions++;
    followEvents(s);
    if (kitchen.finished) finish(s, ctx.now, "completed");
    return ok(s);
  },
  tick(s, ctx) {
    s.now = ctx.now;
    step(s, ctx.now, ctx.rng);
    s.syncAt = Math.min(s.endsAt, ctx.now + SYNC_MS);
    return ok(s);
  },
  nextDeadline(s) {
    if (s.phase === "finished") return null;
    if (s.phase === "intro") return s.introEndsAt;
    if (s.phase === "countdown") return s.playAt;
    return s.syncAt;
  },
  viewFor(s) {
    const k = s.kitchen;
    return {
      phase: s.phase, now: s.now, introEndsAt: s.introEndsAt, playAt: s.playAt, endsAt: s.endsAt, kitchenDef: { number: s.def.number, name: s.def.name, twist: s.def.twist, combos: s.def.combos, hazards: s.def.hazards }, levelNumber: s.def.level,
      t: k.t, stations: k.stations, plates: k.plates, crates: k.crates, seats: k.level.seats,
      // Future guests stay on the server; only their number is shown.
      customers: k.customers.filter((c) => c.status === "waiting"), upcoming: k.customers.filter((c) => c.status === "queued").length, hands: k.hands,
      score: teamScore(s), served: k.served, wrong: k.wrong, missed: k.missed, burnt: k.burnt, wasted: s.wasted, combo: s.combo, handoffs: s.handoffs, stock: s.stock, hazard: s.hazard, finished: k.finished, maxScore: maxScore(k),
      events: k.events, eventSeq: k.eventSeq, cooks: s.cooks.map(({ id, name, color, connected, left, target, pose }) => ({ id, name, color, connected, left, target, pose })),
    };
  },
  syncMessages: () => [],
  setConnected(s, playerId, connected, ctx) {
    s.now = ctx.now;
    const cook = s.cooks.find((c) => c.id === playerId);
    if (cook) cook.connected = connected;
    return ok(s);
  },
  removePlayer(s, playerId, ctx) {
    s.now = ctx.now;
    const cook = s.cooks.find((c) => c.id === playerId);
    if (cook) {
      cook.left = true; cook.connected = false;
      // Whatever they carried goes back on the counter: a held plate stays usable, and nothing stays locked.
      delete s.kitchen.hands[playerId];
    }
    if (s.phase !== "cooking" && staying(s).length < 2) finish(s, ctx.now, "aborted");
    if (staying(s).length === 0) finish(s, ctx.now, "players-left");
    return ok(s);
  },
  isFinished: (s) => s.phase === "finished",
  results(s) {
    const score = teamScore(s);
    const stars = starsFor(s.kitchen, score);
    return {
      gameId: "kitchen-rush-coop", endedAt: s.endedAt ?? s.endsAt, reason: s.endReason ?? "completed",
      entries: s.cooks.map((cook) => ({
        playerId: cook.id, name: cook.name, color: cook.color, placement: cook.left ? 2 : 1, score: cook.left ? 0 : score, isWinner: !cook.left && stars >= 1,
        details: { kitchen: s.def.name, kitchenNumber: s.def.number, stars, served: s.kitchen.served, wrong: s.kitchen.wrong, missed: s.kitchen.missed, burnt: s.kitchen.burnt, wasted: s.wasted, bestCombo: s.bestCombo, handoffs: s.handoffs, hazards: s.hazards, teamScore: score, maxScore: maxScore(s.kitchen), actions: cook.actions, ...(cook.left ? { left: 1 } : {}) },
      })),
    };
  },
};

export const recipeNeeds = (recipe: RecipeId) => RECIPES[recipe].parts as readonly ItemId[];
export { stationForm };
export type { StationType };
