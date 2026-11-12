import { z } from "zod";
import type { MatchResultEntry, MatchResults } from "@platform/shared";
import { sample } from "../core/seeded";
import { fail, type EngineContext, type EngineResult, type EngineSuccess, type GameEngine, type PlayerRef } from "../core/types";
import { byRecipe, CUISINES, INGREDIENTS, RECIPES, type Garnish, type StationId } from "./content";
import { encodeDishes } from "./journey";
import { advanceQuest, applyQuest, createShift, currentStep, questActionSchema, wantedPlates, type CustomerType, type OrderSpec, type QuestState, type ShiftPlan } from "./kitchen";

/**
 * Chef Rivals: chefs cook the same challenge at the same time, each in their own
 * kitchen, against one server clock. Clients only send intents. Time, cooking
 * results and the score are all worked out here.
 */

/** Bump when `kitchen:act` changes, so an old tab is told to refresh rather than misread. */
export const RIVALS_PROTOCOL = 1;
export const INTRO_MS = 7000;
export const COUNTDOWN_MS = 3000;
const SYNC_MS = 1000;
/** A smaller gap than solo: network jitter can bunch up gestures a player made at a steady pace. */
const RIVALS_GESTURE_GAP_MS = 60;

export const rivalsConfigSchema = z.object({ durationSeconds: z.union([z.literal(120), z.literal(180), z.literal(240)]).default(180) }).strict();
export type RivalsConfig = z.infer<typeof rivalsConfigSchema>;
export const rivalsActionSchema = z.object({ type: z.literal("kitchen:act"), p: z.number().int(), intent: z.object({ kind: z.string().max(16) }).loose() });
export type RivalsAction = z.infer<typeof rivalsActionSchema>;

const THEMES = [
  "Royal Feast", "Street Food Reinvented", "Five-Star Comfort", "Midnight Kitchen", "Tropical Table", "Festival Special", "Garden Gourmet", "Harbour Lights",
] as const;

interface SecretCheck { served: number; wanted: number; perfect: number; burnt: number; mistakes: number; satisfaction: number }
/** A hidden bonus, the same for both chefs, revealed only at judging. */
export const SECRET_CHALLENGES = [
  { id: "clean-flame", title: "Clean flame", description: "Serve a plate and burn nothing.", done: (c: SecretCheck) => c.served > 0 && c.burnt === 0 },
  { id: "steady-hands", title: "Steady hands", description: "Serve a plate with no mistakes at all.", done: (c: SecretCheck) => c.served > 0 && c.mistakes === 0 },
  { id: "three-perfect", title: "Hat trick", description: "Serve three perfect plates.", done: (c: SecretCheck) => c.perfect >= 3 },
  { id: "full-house", title: "Full house", description: "Serve every plate that was ordered.", done: (c: SecretCheck) => c.served === c.wanted },
  { id: "warm-room", title: "Warm room", description: "Average 80% guest satisfaction.", done: (c: SecretCheck) => c.satisfaction >= 80 },
] as const;

const recipesWith = (ingredient: string) => RECIPES.filter((r) => r.steps.some((s) => s.kind === "ingredient" && s.ingredient === ingredient));
/** Ingredients shared by enough recipes to make a real basket. */
export const MYSTERY_INGREDIENTS = INGREDIENTS.filter((i) => recipesWith(i).length >= 3);

export interface RivalChallenge { theme: string; mystery: string; secret: (typeof SECRET_CHALLENGES)[number]["id"]; plan: ShiftPlan }

/** Draws one challenge. Every chef builds their kitchen from this same plan. */
export function drawChallenge(rng: { int(max: number): number }, durationMs: number): RivalChallenge {
  const mystery = MYSTERY_INGREDIENTS[rng.int(MYSTERY_INGREDIENTS.length)]!;
  const basket = sample(recipesWith(mystery), 3, rng);
  const recipes = [...basket, basket[rng.int(basket.length)]!];
  const types: CustomerType[] = ["regular", "patient", "large", "special"];
  const orders: OrderSpec[] = recipes.map((recipe, id) => {
    const usual = CUISINES[recipe.level - 1]!.garnish;
    const garnish: Garnish = types[id] === "special" ? (usual === "herbs" ? "lemon" : "herbs") : usual;
    return { recipe: recipe.id, type: types[id]!, garnish, arrivesAt: id * 10_000, patienceMs: types[id] === "patient" ? 180_000 : 150_000, wanted: types[id] === "large" ? 2 : 1 };
  });
  return {
    theme: THEMES[rng.int(THEMES.length)]!, mystery, secret: SECRET_CHALLENGES[rng.int(SECRET_CHALLENGES.length)]!.id,
    plan: { level: basket[0]!.level, seed: rng.int(0x7fffffff), orders, intro: `Mystery ingredient: ${mystery.replaceAll("-", " ")}. Read your first ticket.`, rules: { openingOrders: orders.length, seats: 3, batches: 2, limitMs: durationMs, gesturePrecision: false, gestureGapMs: RIVALS_GESTURE_GAP_MS } },
  };
}

export type ChefPose = "idle" | "gather" | "chop" | "mix" | "roll" | "cook" | "stir" | "flip" | "plate" | "serve";
export interface ChefActivity { station: StationId; pose: ChefPose; recipe: string | null }
const TECHNIQUE_POSE: Record<string, ChefPose> = { chop: "chop", slice: "chop", crush: "chop", mix: "mix", marinate: "mix", blend: "mix", fold: "roll", knead: "roll", stretch: "roll", spread: "roll", roll: "roll", shape: "roll", wrap: "roll", seal: "roll", layer: "plate", plate: "plate" };
/** What a chef visibly does, read from their real kitchen. Presentation only. */
export function chefActivity(kitchen: QuestState, orderId: number | null): ChefActivity {
  const order = orderId === null ? undefined : kitchen.orders[orderId];
  if (!order || order.status !== "waiting" || (!order.batchActive && order.step === 0)) return { station: "storage", pose: "idle", recipe: null };
  const step = currentStep(order);
  if (!step) return { station: "serving", pose: "serve", recipe: order.recipe };
  if (step.kind === "ingredient") return { station: "storage", pose: "gather", recipe: order.recipe };
  if (step.kind === "technique") return { station: step.station, pose: order.startedAt === null ? "idle" : TECHNIQUE_POSE[step.technique] ?? "mix", recipe: order.recipe };
  if (order.startedAt === null) return { station: step.station, pose: "idle", recipe: order.recipe };
  return { station: step.station, pose: step.flip && !order.flipped ? "flip" : step.stirs > order.stirs ? "stir" : "cook", recipe: order.recipe };
}

interface Chef extends PlayerRef { kitchen: QuestState; focus: number | null; finishMisses: number; connected: boolean; left: boolean }
export interface RivalsState {
  config: RivalsConfig; theme: string; mystery: string; secret: RivalChallenge["secret"]; plan: ShiftPlan;
  phase: "intro" | "countdown" | "cooking" | "finished"; startedAt: number; now: number; introEndsAt: number; playAt: number; endsAt: number; syncAt: number; endedAt: number | null;
  endReason: MatchResults["reason"] | null; chefs: Chef[];
}
export interface RivalSummary extends ChefActivity { id: string; name: string; color: string; served: number; wanted: number; perfect: number; burnt: number; mistakes: number; connected: boolean; left: boolean; done: boolean; event: number; lastEvent: string; feedbackKind: QuestState["feedbackKind"] }
export interface RivalsView { phase: RivalsState["phase"]; now: number; introEndsAt: number; playAt: number; endsAt: number; durationMs: number; theme: string; mystery: string; basket: string[]; you: { id: string; kitchen: QuestState; summary: RivalSummary } | null; rivals: RivalSummary[] }

const summary = (c: Chef): RivalSummary => ({ id: c.id, name: c.name, color: c.color, served: c.kitchen.served, wanted: wantedPlates(c.kitchen), perfect: c.kitchen.perfect, burnt: c.kitchen.burnt, mistakes: c.kitchen.mistakes, connected: c.connected, left: c.left, done: c.kitchen.finished, event: c.kitchen.event, lastEvent: c.kitchen.lastEvent, feedbackKind: c.kitchen.feedbackKind, ...chefActivity(c.kitchen, c.focus) });
const ok = (state: RivalsState, stateChanged = true): EngineSuccess<RivalsState> => ({ ok: true, state, stateChanged, messages: [] });
const present = (s: RivalsState) => s.chefs.filter((c) => !c.left);

export interface RivalScore { total: number; recipe: number; craft: number; timing: number; technique: number; efficiency: number; presentation: number; challenge: number; secretDone: boolean }
/**
 * The judges. Quality and correctness are worth most. Speed appears only as a
 * small efficiency award for a complete service, so fast clicking can't beat
 * good cooking. All of it is computed from simulated events.
 */
export function scoreRival(kitchen: QuestState, finishMisses: number, secret: RivalChallenge["secret"], limitMs: number): RivalScore {
  const wanted = wantedPlates(kitchen);
  const { served, qualitySum, satisfactionSum, mistakes, perfect, burnt } = kitchen;
  const share = served / wanted;
  const recipe = Math.round(3000 * share);
  const craft = Math.round(30 * qualitySum / wanted);
  const timing = Math.round(15 * satisfactionSum / wanted);
  const technique = Math.round(1000 * Math.max(0, 1 - mistakes / (wanted * 3)) * share);
  const efficiency = served === wanted ? Math.round(500 * Math.max(0, 1 - (kitchen.finishedAt ?? limitMs) / limitMs)) : 0;
  const presentation = Math.round(500 * Math.max(0, served - finishMisses) / wanted);
  const secretDone = SECRET_CHALLENGES.find((c) => c.id === secret)!.done({ served, wanted, perfect, burnt, mistakes, satisfaction: satisfactionSum / wanted });
  const challenge = secretDone ? 500 : 0;
  return { total: recipe + craft + timing + technique + efficiency + presentation + challenge, recipe, craft, timing, technique, efficiency, presentation, challenge, secretDone };
}

function clockOf(s: RivalsState, now: number) { return Math.max(0, Math.min(now - s.playAt, s.endsAt - s.playAt)); }
function advanceAll(s: RivalsState, now: number) {
  if (s.phase !== "cooking") return;
  const t = clockOf(s, now);
  for (const chef of s.chefs) if (!chef.left) advanceQuest(chef.kitchen, t);
}
function finish(s: RivalsState, now: number, reason: MatchResults["reason"]) {
  if (s.phase === "finished") return;
  s.phase = "finished"; s.endedAt = now; s.endReason = reason;
}
function concludeIfDone(s: RivalsState, now: number) {
  if (s.phase === "cooking" && (now >= s.endsAt || present(s).every((c) => c.kitchen.finished))) finish(s, now, "completed");
}

export const rivalsEngine: GameEngine<RivalsState, RivalsConfig, RivalsAction, RivalsView> = {
  id: "chef-rivals",
  minPlayers: 2,
  maxPlayers: 2,
  configSchema: rivalsConfigSchema,
  defaultConfig: () => ({ durationSeconds: 180 }),
  actionSchema: rivalsActionSchema,
  actionTypes: ["kitchen:act"],
  requiresVersion: () => false,

  create(players, config, ctx) {
    const durationMs = config.durationSeconds * 1000;
    const challenge = drawChallenge(ctx.rng, durationMs);
    const introEndsAt = ctx.now + INTRO_MS, playAt = introEndsAt + COUNTDOWN_MS;
    return ok({
      config, theme: challenge.theme, mystery: challenge.mystery, secret: challenge.secret, plan: challenge.plan,
      phase: "intro", startedAt: ctx.now, now: ctx.now, introEndsAt, playAt, endsAt: playAt + durationMs, syncAt: playAt, endedAt: null, endReason: null,
      chefs: players.map((p) => ({ ...p, kitchen: createShift(challenge.plan), focus: null, finishMisses: 0, connected: true, left: false })),
    });
  },

  handleAction(s, playerId, action, ctx): EngineResult<RivalsState> {
    s.now = ctx.now;
    if (action.p !== RIVALS_PROTOCOL) return fail("STALE_STATE", "The game has been updated. Refresh this page to keep playing.");
    const chef = s.chefs.find((c) => c.id === playerId);
    if (!chef || chef.left) return fail("NOT_IN_ROOM", "You're not cooking in this match");
    if (s.phase !== "cooking") return fail("GAME_NOT_ACTIVE", s.phase === "finished" ? "The match is over" : "Cooking hasn't started yet");
    const kind = action.intent.kind;
    if (kind === "wait" || kind === "finish") return fail("INVALID_MOVE", "That isn't a cooking action");
    advanceAll(s, ctx.now);
    concludeIfDone(s, ctx.now);
    if ((s.phase as RivalsState["phase"]) === "finished") return ok(s);
    const parsed = questActionSchema.safeParse({ ...action.intent, t: clockOf(s, ctx.now) });
    if (!parsed.success) return fail("INVALID_PAYLOAD", "Invalid cooking action");
    const before = chef.kitchen.mistakes;
    const result = applyQuest(chef.kitchen, parsed.data);
    if (!result.ok) return fail("INVALID_MOVE", result.error ?? "That can't be done right now");
    if (parsed.data.kind === "serve" && chef.kitchen.mistakes > before) chef.finishMisses++;
    if ("order" in parsed.data) chef.focus = parsed.data.order;
    concludeIfDone(s, ctx.now);
    return ok(s);
  },

  tick(s, ctx) {
    s.now = ctx.now;
    if (s.phase === "intro" && ctx.now >= s.introEndsAt) s.phase = "countdown";
    if (s.phase === "countdown" && ctx.now >= s.playAt) s.phase = "cooking";
    advanceAll(s, ctx.now);
    concludeIfDone(s, ctx.now);
    s.syncAt = Math.min(s.endsAt, ctx.now + SYNC_MS);
    return ok(s);
  },
  nextDeadline(s) {
    if (s.phase === "finished") return null;
    if (s.phase === "intro") return s.introEndsAt;
    if (s.phase === "countdown") return s.playAt;
    return s.syncAt;
  },
  viewFor(s, playerId) {
    const self = s.chefs.find((c) => c.id === playerId);
    return {
      phase: s.phase, now: s.now, introEndsAt: s.introEndsAt, playAt: s.playAt, endsAt: s.endsAt, durationMs: s.endsAt - s.playAt, theme: s.theme, mystery: s.mystery,
      basket: [...new Set(s.plan.orders.map((o) => o.recipe))],
      you: self ? { id: self.id, kitchen: self.kitchen, summary: summary(self) } : null,
      rivals: s.chefs.filter((c) => c.id !== playerId).map(summary),
    };
  },
  syncMessages: () => [],
  setConnected(s, playerId, connected, ctx) {
    s.now = ctx.now;
    const chef = s.chefs.find((c) => c.id === playerId);
    if (chef) chef.connected = connected;
    return ok(s);
  },
  removePlayer(s, playerId, ctx: EngineContext) {
    s.now = ctx.now;
    const chef = s.chefs.find((c) => c.id === playerId);
    if (chef) { advanceAll(s, ctx.now); chef.left = true; chef.connected = false; }
    if (present(s).length < 2) finish(s, ctx.now, s.phase === "cooking" ? "players-left" : "aborted");
    return ok(s);
  },
  isFinished: (s) => s.phase === "finished",
  results(s) {
    const limit = s.endsAt - s.playAt;
    const scored = s.chefs.map((chef) => ({ chef, score: scoreRival(chef.kitchen, chef.finishMisses, s.secret, limit) }));
    const staying = scored.filter((x) => !x.chef.left).sort((a, b) => b.score.total - a.score.total);
    const ranked = [...staying, ...scored.filter((x) => x.chef.left)];
    const tie = staying.length > 1 && staying[0]!.score.total === staying[1]!.score.total;
    const secret = SECRET_CHALLENGES.find((c) => c.id === s.secret)!;
    const entries: MatchResultEntry[] = ranked.map(({ chef, score }, i) => {
      const best = chef.kitchen.orders.flatMap((o) => o.plates.map((quality) => ({ recipe: o.recipe, quality }))).sort((a, b) => b.quality - a.quality)[0];
      const shared = tie && !chef.left && score.total === staying[0]!.score.total;
      return {
        playerId: chef.id, name: chef.name, color: chef.color, placement: shared ? 1 : i + 1, score: score.total, isWinner: !tie && i === 0 && !chef.left,
        details: {
          ...(shared ? { result: "tie" } : {}), theme: s.theme, mystery: s.mystery, secret: secret.title, secretText: secret.description, secretDone: score.secretDone ? 1 : 0,
          recipeScore: score.recipe, craftScore: score.craft, timingScore: score.timing, techniqueScore: score.technique, efficiencyScore: score.efficiency, presentationScore: score.presentation, challengeScore: score.challenge,
          served: chef.kitchen.served, wanted: wantedPlates(chef.kitchen), perfect: chef.kitchen.perfect, burnt: chef.kitchen.burnt, mistakes: chef.kitchen.mistakes,
          dish: best?.recipe ?? "", dishName: best ? byRecipe.get(best.recipe)!.name : "", dishQuality: best?.quality ?? 0, dishes: encodeDishes(chef.kitchen.orders),
        },
      };
    });
    return { gameId: "chef-rivals", endedAt: s.endedAt ?? s.endsAt, reason: s.endReason ?? "completed", entries };
  },
};
