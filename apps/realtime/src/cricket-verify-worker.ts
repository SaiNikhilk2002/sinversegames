/**
 * Worker thread that replays a cricket match (docs/CRICKET_RAILWAY_VERIFICATION_DESIGN.md).
 *
 * A T20 or ODI replay takes 0.1-0.5 s of CPU, and a crafted log up to a few seconds. Running it here
 * keeps the realtime server's event loop, and every live multiplayer room, responsive meanwhile.
 * Input: the run token's seed and config (already verified by the main thread) and the raw log JSON.
 * Output: exactly what the web app's own verification returns: the server-computed result, or why
 * the log was refused. Nothing from the client is trusted; the log is parsed and replayed from scratch.
 */
import { parentPort } from "node:worker_threads";
import { sinverseCricket } from "@platform/engines/sinverse-cricket";

export interface VerifyTask {
  id: number;
  seed: number;
  config: unknown;
  log: string;
}
export type VerifyOutcome =
  | { id: number; ok: true; result: { score: number; completed: boolean; durationMs: number; details: Record<string, number | string> } }
  | { id: number; ok: false; reason: string }
  /** An unexpected exception: not a verdict on the log, so it is retried, never remembered as a refusal. */
  | { id: number; ok: false; error: true };

export function verifyTask(task: VerifyTask): VerifyOutcome {
  const { id } = task;
  let raw: unknown;
  try {
    raw = JSON.parse(task.log);
  } catch {
    return { id, ok: false, reason: "Invalid game log" };
  }
  const config = sinverseCricket.configSchema.safeParse(task.config);
  const log = sinverseCricket.logSchema.safeParse(raw);
  if (!config.success || !log.success) return { id, ok: false, reason: "Invalid game log" };
  const verified = sinverseCricket.verify(task.seed, config.data, log.data);
  return verified.ok ? { id, ok: true, result: verified.result } : { id, ok: false, reason: verified.reason };
}

parentPort?.on("message", (task: VerifyTask) => {
  let outcome: VerifyOutcome;
  try {
    outcome = verifyTask(task);
  } catch {
    // verify() already turns impossible game states into refusals, so this is a fault, not a verdict.
    outcome = { id: task.id, ok: false, error: true };
  }
  parentPort!.postMessage(outcome);
});
