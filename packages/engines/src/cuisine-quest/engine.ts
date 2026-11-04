import { z } from "zod";
import { seededRng } from "../core/seeded";
import { checkTimeline, type SoloGameDefinition, type SoloRunResult } from "../core/solo";
import { byRecipe, CUISINES, PATHS, type Garnish, type Recipe, type Step } from "./content";

export const MAX_SHIFT_MS = 540_000;
export const GESTURE_GAP_MS = 140;
export const questConfigSchema = z.object({ level: z.number().int().min(1).max(7).default(1) }).strict();
export type QuestConfig = z.infer<typeof questConfigSchema>;
const timed = { t: z.number().int().min(0).max(MAX_SHIFT_MS) };
const order = { ...timed, order: z.number().int().min(0).max(5) };
export const questActionSchema = z.discriminatedUnion("kind", [
  z.object({ ...timed, kind: z.literal("wait") }).strict(),
  z.object({ ...timed, kind: z.literal("finish") }).strict(),
  z.object({ ...order, kind: z.literal("ingredient"), ingredient: z.string().min(1).max(24), portions: z.number().int().min(1).max(3) }).strict(),
  z.object({ ...order, kind: z.literal("begin") }).strict(),
  z.object({ ...order, kind: z.literal("gesture"), node: z.number().int().min(0).max(7), x: z.number().int().min(0).max(1000), y: z.number().int().min(0).max(1000) }).strict(),
  z.object({ ...order, kind: z.literal("heat"), value: z.number().int().min(1).max(5) }).strict(),
  z.object({ ...order, kind: z.literal("flip") }).strict(),
  z.object({ ...order, kind: z.literal("stir") }).strict(),
  z.object({ ...order, kind: z.literal("lift") }).strict(),
  z.object({ ...order, kind: z.literal("restart") }).strict(),
  z.object({ ...order, kind: z.literal("serve"), garnish: z.enum(["herbs", "lemon", "sesame"]), recipient: z.number().int().min(0).max(5).optional() }).strict(),
]);
export type QuestAction = z.infer<typeof questActionSchema>;
type WithoutTime<T> = T extends unknown ? Omit<T, "t"> : never;
export type QuestIntent = WithoutTime<QuestAction>;
export const questLogSchema = z.array(questActionSchema).min(1).max(3000);
export type CustomerType = "regular" | "patient" | "impatient" | "large" | "special";
export interface Order {
  id: number; recipe: string; type: CustomerType; garnish: Garnish;
  status: "queued" | "waiting" | "served" | "left"; scheduledAt: number; arrivedAt: number | null; resolvedAt: number | null; patienceMs: number;
  wanted: number; delivered: number; step: number; startedAt: number | null; batchActive: boolean;
  node: number; lastGestureAt: number; heat: number; work: number; offHeatMs: number; cookElapsedMs: number; flipped: boolean; stirs: number; lastStirAt: number;
  quality: number; cookQuality: number; cookCount: number; burnCounted: boolean; earned: number;
}
export interface QuestState {
  level: number; seed: number; t: number; orders: Order[]; finished: boolean; sealed: boolean; finishedAt: number | null;
  served: number; missed: number; mistakes: number; burnt: number; perfect: number; qualitySum: number; satisfactionSum: number;
  feedback: string; feedbackKind: "good" | "error" | "info"; event: number; lastEvent: string;
}
export const currentRecipe = (o: Order): Recipe => byRecipe.get(o.recipe)!;
export const currentStep = (o: Order): Step | undefined => currentRecipe(o).steps[o.step];
export const wantedPlates = (s: QuestState) => s.orders.reduce((n, o) => n + o.wanted, 0);
export const canUnlock = (level: number, stars: readonly number[]) => level === 1 || (level >= 2 && level <= 7 && Array.from({ length: level - 1 }, (_, i) => stars[i] ?? 0).every(n => n >= 1));

export function createQuest(seed: number, config: QuestConfig): QuestState {
  const cuisine = CUISINES[config.level - 1]!;
  const rng = seededRng(seed);
  const types: CustomerType[] = ["regular", "patient", config.level >= 3 ? "impatient" : "regular", "large", "special", "regular"];
  const recipes = [...cuisine.recipes, cuisine.recipes[rng.int(4)]!, cuisine.recipes[rng.int(4)]!];
  const orders: Order[] = recipes.map((recipe, id) => ({
    id, recipe, type: types[id]!, garnish: types[id] === "special" ? (cuisine.garnish === "herbs" ? "lemon" : "herbs") : cuisine.garnish,
    status: "queued", scheduledAt: id < 4 ? id * 14_000 : MAX_SHIFT_MS, arrivedAt: null, resolvedAt: null,
    patienceMs: types[id] === "patient" ? 180_000 : types[id] === "large" ? 200_000 : types[id] === "impatient" ? 125_000 : 155_000,
    wanted: types[id] === "large" ? 2 : 1, delivered: 0, step: 0, startedAt: null, batchActive: false,
    node: 0, lastGestureAt: -1000, heat: 2, work: 0, offHeatMs: 0, cookElapsedMs: 0, flipped: false, stirs: 0, lastStirAt: -1000,
    quality: 100, cookQuality: 0, cookCount: 0, burnCounted: false, earned: 0,
  }));
  const s: QuestState = { level: config.level, seed, t: 0, orders, finished: false, sealed: false, finishedAt: null, served: 0, missed: 0, mistakes: 0, burnt: 0, perfect: 0, qualitySum: 0, satisfactionSum: 0, feedback: "Read your first ticket, then choose its ingredients in order.", feedbackKind: "info", event: 0, lastEvent: "arrive" };
  advanceQuest(s, 0);
  return s;
}
function notify(s: QuestState, text: string, kind: QuestState["feedbackKind"], event: string) {
  s.feedback = text; s.feedbackKind = kind; s.lastEvent = event; s.event++;
}
function mistake(s: QuestState, o: Order, text: string, loss = 5) {
  s.mistakes++; o.quality = Math.max(10, o.quality - loss);
  notify(s, text, "error", "mistake");
}
function resetBatch(o: Order) {
  Object.assign(o, { step: 0, startedAt: null, batchActive: false, node: 0, lastGestureAt: -1000, work: 0, offHeatMs: 0, cookElapsedMs: 0, flipped: false, stirs: 0, burnCounted: false, quality: 100, cookQuality: 0, cookCount: 0 });
}
function nextStep(o: Order) {
  o.step++; o.startedAt = null; o.node = 0; o.work = 0; o.offHeatMs = 0; o.cookElapsedMs = 0; o.flipped = false; o.stirs = 0; o.lastStirAt = -1000; o.burnCounted = false;
}
export function cookForm(o: Order): "unprepared" | "prepared" | "cooking" | "perfect" | "overcooked" | "burnt" {
  const step = currentStep(o);
  if (step?.kind !== "cook" || o.startedAt === null) return o.step > 0 ? "prepared" : "unprepared";
  if (o.work < step.ms * 10) return "cooking";
  if (o.work < (step.ms + 2000) * 10) return "perfect";
  if (o.work < (step.ms + 5000) * 10) return "overcooked";
  return "burnt";
}
/** Piecewise integer heat integration: 10 work units == 1ms at recipe heat. */
function integrate(s: QuestState, delta: number) {
  for (const o of s.orders) {
    const step = currentStep(o);
    if (o.status !== "waiting" || step?.kind !== "cook" || o.startedAt === null) continue;
    const rate = o.heat === step.heat ? 10 : o.heat < step.heat ? 6 : 14;
    o.work += delta * rate; o.cookElapsedMs += delta;
    if (o.heat !== step.heat) o.offHeatMs += delta;
    if (cookForm(o) === "burnt" && !o.burnCounted) {
      o.burnCounted = true; s.burnt++;
      notify(s, "A batch burnt. Restart that ticket for a fresh batch; its customer is still waiting.", "error", "burnt");
    }
  }
}
/** Timed arrivals, patience and cooking advance without frame-rate dependence. */
export function advanceQuest(s: QuestState, to: number) {
  if (to < s.t || !Number.isInteger(to) || to > MAX_SHIFT_MS || s.finished) return;
  while (!s.finished) {
    if (s.orders.slice(0, 4).every(o => o.status === "served" || o.status === "left")) {
      for (const o of s.orders.slice(4)) if (o.scheduledAt === MAX_SHIFT_MS) o.scheduledAt = s.t;
    }
    let next = to;
    for (const o of s.orders) if (o.status === "waiting") next = Math.min(next, o.arrivedAt! + o.patienceMs);
    const free = s.orders.filter(o => o.status === "waiting").length < 3;
    const queued = s.orders.find(o => o.status === "queued" && o.scheduledAt < MAX_SHIFT_MS);
    if (free && queued) next = Math.min(next, Math.max(s.t, queued.scheduledAt));
    integrate(s, next - s.t); s.t = next;
    let changed = false;
    for (const o of s.orders) {
      if (o.status === "waiting" && s.t >= o.arrivedAt! + o.patienceMs) {
        o.status = "left"; o.resolvedAt = s.t; o.startedAt = null; o.batchActive = false; s.missed += o.wanted - o.delivered; changed = true;
        notify(s, "A guest left. Prioritize the remaining patience meters; the next guest gets a fresh timer.", "error", "left");
      }
    }
    if (free && queued && queued.scheduledAt <= s.t) {
      queued.status = "waiting"; queued.arrivedAt = s.t; changed = true;
      notify(s, queued.id >= 4 ? "Service rush! Two final guests. Choose your stations and finish the shift." : "A new guest has arrived.", "info", "arrive");
    }
    if (s.orders.every(o => o.status === "served" || o.status === "left")) { s.finished = true; s.finishedAt = s.t; break; }
    if (s.t >= to && !changed) break;
    if (s.t === to && changed) {
      // Process other same-timestamp arrivals, then stop once stable.
      const more = s.orders.some(o => o.status === "queued" && o.scheduledAt <= s.t) && s.orders.filter(o => o.status === "waiting").length < 3;
      const rush = s.orders.slice(0, 4).every(o => o.status === "served" || o.status === "left") && s.orders[4]!.scheduledAt === MAX_SHIFT_MS;
      if (!more && !rush) break;
    }
  }
}

export function applyQuest(s: QuestState, a: QuestAction): { ok: boolean; error?: string } {
  if (s.sealed || a.t < s.t || a.t > MAX_SHIFT_MS) return { ok: false, error: "Invalid action timing" };
  advanceQuest(s, a.t);
  if (a.kind === "finish") {
    if (!s.finished) return { ok: false, error: "The shift is not finished" };
    s.sealed = true; return { ok: true };
  }
  if (s.finished) return a.kind === "wait" ? { ok: true } : { ok: false, error: "The shift has finished" };
  if (a.kind === "wait") return { ok: true };
  const o = s.orders[a.order];
  if (!o || o.status !== "waiting") return { ok: false, error: "That guest is not waiting" };
  const step = currentStep(o);
  if (a.kind === "restart") {
    if (!o.batchActive) return { ok: false, error: "No batch to restart" };
    resetBatch(o); s.mistakes++; notify(s, "Fresh ingredients. The old batch is discarded; customer patience continues.", "info", "restart"); return { ok: true };
  }
  if (a.kind === "serve") {
    if (step || !o.batchActive) return { ok: false, error: "Finish and plate the recipe first" };
    if (a.recipient !== undefined && a.recipient !== o.id) { mistake(s, o, "That plate belongs to a different ticket. Bring it to the correct guest."); return { ok: true }; }
    if (a.garnish !== o.garnish) { mistake(s, o, `This guest asked for ${o.garnish}. Change the finish and serve again.`); return { ok: true }; }
    const quality = Math.max(10, o.quality - (o.cookCount ? 100 - Math.round(o.cookQuality / o.cookCount) : 0));
    const patience = Math.max(0, 1 - (s.t - o.arrivedAt!) / o.patienceMs);
    const satisfaction = Math.round(quality * 0.7 + patience * 30);
    const earned = Math.round(100 + quality + patience * 50);
    s.served++; o.delivered++; s.qualitySum += quality; s.satisfactionSum += satisfaction; o.earned += earned;
    if (quality >= 95) s.perfect++;
    if (o.delivered >= o.wanted) { o.status = "served"; o.resolvedAt = s.t; o.batchActive = false; o.startedAt = null; }
    else resetBatch(o);
    notify(s, quality >= 95 ? "Beautifully cooked! A perfect plate and a happy guest." : "Order served. Your guest appreciates the care.", "good", "serve");
    advanceQuest(s, s.t); return { ok: true };
  }
  if (!step) return { ok: false, error: "This plate is ready to serve" };
  if (a.kind === "ingredient") {
    if (step.kind !== "ingredient") return { ok: false, error: "Prepare the current recipe step first" };
    if (!o.batchActive && s.orders.filter(x => x.batchActive && x.status === "waiting").length >= 2) return { ok: false, error: "Two batches are active. Finish one before opening another." };
    if (a.ingredient !== step.ingredient || a.portions !== step.portions) { mistake(s, o, `Recipe needs ${step.portions} portion${step.portions > 1 ? "s" : ""} of ${step.ingredient.replaceAll("-", " ")}. Try again.`); return { ok: true }; }
    o.batchActive = true; nextStep(o); notify(s, `${step.ingredient.replaceAll("-", " ")} added.`, "good", "ingredient"); return { ok: true };
  }
  if (a.kind === "heat") {
    if (step.kind !== "cook") return { ok: false, error: "Choose a cooking step before setting its heat" };
    o.heat = a.value; notify(s, `Heat ${a.value}. Recipe heat is ${step.heat}.`, "info", "heat"); return { ok: true };
  }
  if (a.kind === "begin") {
    if (step.kind === "ingredient" || o.startedAt !== null) return { ok: false, error: "That station cannot start now" };
    const occupied = s.orders.find(x => x !== o && x.status === "waiting" && x.startedAt !== null && currentStep(x)?.station === step.station);
    if (occupied) return { ok: false, error: `Station busy with ticket ${occupied.id + 1}. Work on another step.` };
    o.startedAt = s.t; o.lastGestureAt = s.t - GESTURE_GAP_MS; notify(s, step.label, "info", step.kind === "cook" ? step.method : step.technique); return { ok: true };
  }
  if (a.kind === "gesture") {
    if (step.kind !== "technique" || o.startedAt === null) return { ok: false, error: "Start the preparation station first" };
    if (s.t - o.lastGestureAt < GESTURE_GAP_MS) return { ok: false, error: "Slow, steady movements. Follow the next marker." };
    const target = PATHS[step.technique][o.node];
    if (!target) return { ok: false, error: "Preparation already complete" };
    const distance = Math.hypot(a.x - target[0], a.y - target[1]);
    o.lastGestureAt = s.t;
    if (a.node !== o.node || distance > 160) { mistake(s, o, "Follow the numbered marker. You can correct the next movement.", 3); return { ok: true }; }
    o.quality = Math.max(10, o.quality - Math.floor(distance / 55));
    o.node++;
    notify(s, `${step.technique === "plate" ? "Plating" : "Technique"} ${o.node}/${PATHS[step.technique].length}`, "good", step.technique);
    if (o.node === PATHS[step.technique].length) { nextStep(o); notify(s, `${step.label} — complete.`, "good", "prepared"); }
    return { ok: true };
  }
  if (step.kind !== "cook" || o.startedAt === null) return { ok: false, error: "There is no active cooking batch" };
  const progress = o.work / (step.ms * 10);
  if (a.kind === "flip") {
    if (!step.flip || o.flipped) return { ok: false, error: "This batch does not need another flip" };
    if (progress < 0.25) { mistake(s, o, "Too early to flip. Wait for the marked cooking window.", 3); return { ok: true }; }
    o.flipped = true;
    if (progress < 0.4 || progress > 0.85) mistake(s, o, "Flip landed outside the ideal window. The dish can still be finished.", 6);
    else notify(s, "A clean flip!", "good", "flip");
    return { ok: true };
  }
  if (a.kind === "stir") {
    if (!step.stirs || o.stirs >= step.stirs) return { ok: false, error: "Enough stirring for this step" };
    if (s.t - o.lastStirAt < 600 || progress < 0.15 || progress > 1.1) return { ok: false, error: "Stir in the marked window, with a short gap between tosses" };
    o.stirs++; o.lastStirAt = s.t; notify(s, `Stir ${o.stirs}/${step.stirs} — keep ingredients moving.`, "good", "stir"); return { ok: true };
  }
  if (a.kind === "lift") {
    const form = cookForm(o);
    if (form === "cooking") return { ok: false, error: "Food is still cooking. Wait for the green window." };
    const penalty = Math.round(o.offHeatMs / Math.max(1, o.cookElapsedMs) * 35) + (step.flip && !o.flipped ? 15 : 0) + Math.max(0, step.stirs - o.stirs) * 8 + (form === "overcooked" ? 30 : form === "burnt" ? 80 : 0);
    o.cookQuality += Math.max(10, 100 - penalty); o.cookCount++;
    nextStep(o); notify(s, form === "perfect" ? "Perfectly cooked. Finish the next step." : "The food is overdone. Restart for a better plate, or finish with a lower quality score.", form === "perfect" ? "good" : "error", "lift"); return { ok: true };
  }
  return { ok: false, error: "Unknown cooking action" };
}

export function questResult(s: QuestState): SoloRunResult {
  const wanted = wantedPlates(s);
  const quality = s.qualitySum / wanted;
  const satisfaction = s.satisfactionSum / wanted;
  const accuracy = Math.max(0, 1 - s.mistakes / (wanted * 3));
  const score = Math.max(0, Math.round(10_000 * (0.45 * s.served / wanted + 0.30 * quality / 100 + 0.15 * satisfaction / 100 + 0.10 * accuracy * s.served / wanted)));
  const stars = starRating(s.finished, s.served, wanted, score, quality);
  return { score, completed: stars >= 1, durationMs: s.finishedAt ?? s.t, details: { level: s.level, cuisine: CUISINES[s.level - 1]!.id, stars, served: s.served, wanted, missed: s.missed, mistakes: s.mistakes, burnt: s.burnt, perfect: s.perfect, precision: Math.round(quality), satisfaction: Math.round(satisfaction), durationMs: s.finishedAt ?? s.t } };
}
export const starRating = (finished: boolean, served: number, wanted: number, score: number, precision: number): 0 | 1 | 2 | 3 =>
  !finished || served < 5 || score < 5200 ? 0 : served === wanted && precision >= 85 && score >= 8500 ? 3 : served >= 6 && score >= 7000 ? 2 : 1;
export const cuisineQuest: SoloGameDefinition<QuestConfig, QuestAction[]> = {
  id: "cuisine-quest", configSchema: questConfigSchema, logSchema: questLogSchema,
  verify(seed, config, log) {
    const timing = checkTimeline(log.map(a => a.t), MAX_SHIFT_MS);
    if (timing) return { ok: false, reason: timing };
    const s = createQuest(seed, config);
    for (const a of log) {
      const result = applyQuest(s, a);
      if (!result.ok) return { ok: false, reason: result.error ?? "Invalid cooking action" };
    }
    if (!s.finished || !s.sealed || log.at(-1)?.kind !== "finish") return { ok: false, reason: "Finish the entire service before submitting" };
    return { ok: true, result: questResult(s) };
  },
};

/** Public coaching, not autoplay: a player still performs and times every intent. */
export function questHint(s: QuestState, id: number): { text: string; action: QuestIntent | null } {
  const o = s.orders[id];
  if (!o || o.status !== "waiting") return { text: "Choose a waiting guest.", action: null };
  const step = currentStep(o);
  if (!step) return { text: `Serve with ${o.garnish}.`, action: { kind: "serve", order: id, garnish: o.garnish } };
  if (step.kind === "ingredient") return { text: `${step.label}: ${step.portions} portion${step.portions > 1 ? "s" : ""}.`, action: { kind: "ingredient", order: id, ingredient: step.ingredient, portions: step.portions } };
  if (step.kind === "cook" && o.heat !== step.heat) return { text: `Set heat to ${step.heat}.`, action: { kind: "heat", order: id, value: step.heat } };
  if (o.startedAt === null) return { text: step.label, action: { kind: "begin", order: id } };
  if (step.kind === "technique") {
    const p = PATHS[step.technique][o.node]!;
    return { text: `${step.label}. Follow marker ${o.node + 1}.`, action: { kind: "gesture", order: id, node: o.node, x: p[0], y: p[1] } };
  }
  const p = o.work / (step.ms * 10);
  if (step.flip && !o.flipped && p >= 0.45) return { text: "Flip now, inside the green window.", action: { kind: "flip", order: id } };
  if (o.stirs < step.stirs && p >= 0.2 + o.stirs * 0.22 && s.t - o.lastStirAt >= 600) return { text: "Stir or toss the pan now.", action: { kind: "stir", order: id } };
  if (p >= 1) return { text: "Lift the food before the green window closes.", action: { kind: "lift", order: id } };
  return { text: "Watch the heat and cooking window. You can prepare another ticket while this cooks.", action: null };
}
