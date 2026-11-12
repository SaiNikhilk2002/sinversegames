import { createHash } from "node:crypto";
import { seededRng } from "../../src/core/seeded";
import { applyQuest, createQuest, currentStep, questHint, questResult, type QuestAction, type QuestState } from "../../src/cuisine-quest";

export type BotProfile = "clean" | "human" | "messy" | "offheat";

/**
 * Plays a campaign shift through public intents only. Rejected actions are not
 * logged, exactly as the browser client behaves.
 *
 * - clean: first waiting ticket, fixed 160 ms pace.
 * - human: seeded pacing, moves between tickets.
 * - messy: long pauses, wrong ingredients and finishes, early flips and restarts.
 * - offheat: otherwise careful, but keeps nudging active batches off their recipe heat.
 */
export function playBot(level: number, seed: number, profile: BotProfile) {
  const state = createQuest(seed, { level });
  const log: QuestAction[] = [];
  const errors: string[] = [];
  const rng = seededRng(seed * 31 + level * 7 + (profile === "clean" ? 0 : profile === "human" ? 1 : profile === "messy" ? 2 : 3));
  const send = (action: QuestAction) => {
    const result = applyQuest(state, action);
    if (result.ok) log.push(action);
    else errors.push(result.error ?? "");
    return result.ok;
  };
  const pace = () => (profile === "clean" ? 160 : profile === "human" || profile === "offheat" ? 160 + rng.int(740) : 160 + rng.int(rng.int(8) === 0 ? 14_000 : 1_400));
  let guard = 0;
  while (!state.finished && guard++ < 6000) {
    const waiting = state.orders.filter((o) => o.status === "waiting");
    const order = profile === "clean" ? waiting[0] : waiting[rng.int(waiting.length)];
    const t = state.t + pace();
    if (!order) { send({ kind: "wait", t }); continue; }
    if (profile === "offheat") {
      const step = currentStep(order);
      if (step?.kind === "cook" && order.startedAt !== null && order.heat === step.heat && rng.int(3) === 0) { send({ kind: "heat", order: order.id, value: step.heat === 1 ? 2 : step.heat === 5 ? 4 : step.heat + (rng.int(2) ? 1 : -1), t }); continue; }
      if (step?.kind === "cook" && order.startedAt !== null && order.heat !== step.heat && rng.int(3) !== 0) { send({ kind: "wait", t }); continue; }
    }
    if (profile === "messy") {
      const roll = rng.int(40);
      const step = currentStep(order);
      if (roll === 0) { send({ kind: "ingredient", order: order.id, ingredient: "water", portions: 3, t }); continue; }
      if (roll === 1) { send({ kind: "serve", order: order.id, garnish: "sesame", t }); continue; }
      if (roll === 2) { send({ kind: "flip", order: order.id, t }); continue; }
      if (roll === 3 && order.batchActive) { send({ kind: "restart", order: order.id, t }); continue; }
      if (roll === 4 && step?.kind === "cook") { send({ kind: "heat", order: order.id, value: 1 + rng.int(5), t }); continue; }
      if (roll === 5) { send({ kind: "gesture", order: order.id, node: rng.int(8), x: rng.int(1001), y: rng.int(1001), t }); continue; }
    }
    const action = questHint(state, order.id).action;
    send(action ? { ...action, t } : { kind: "wait", t });
  }
  if (!state.finished) throw new Error(`Bot did not finish level ${level}, seed ${seed}, ${profile}`);
  send({ kind: "finish", t: state.t });
  return { state, log, errors, result: questResult(state) };
}

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
const digestState = (s: QuestState) => ({ t: s.t, finishedAt: s.finishedAt, served: s.served, missed: s.missed, mistakes: s.mistakes, burnt: s.burnt, perfect: s.perfect, qualitySum: s.qualitySum, satisfactionSum: s.satisfactionSum, orders: s.orders.map((o) => [o.recipe, o.type, o.garnish, o.status, o.arrivedAt, o.resolvedAt, o.delivered, o.earned]) });

/** The behaviour a refactor must preserve: same intents, same rejections, same outcome. */
export function goldenCase(level: number, seed: number, profile: BotProfile) {
  const { state, log, errors, result } = playBot(level, seed, profile);
  const { score, completed, durationMs, details } = result;
  return { level, seed, profile, actions: log.length, log: sha(log), rejected: errors.length, errors: sha(errors), state: sha(digestState(state)), score, completed, durationMs, details };
}
