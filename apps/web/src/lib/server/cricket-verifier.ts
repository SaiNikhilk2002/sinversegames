import "server-only";
import { cricketRequestHash, signCricketVerifyJob, verifyCricketVerdict } from "@platform/shared/identity";
import type { SoloRunResult } from "@platform/engines/solo";

/**
 * Cricket verification on the realtime service (docs/CRICKET_RAILWAY_VERIFICATION_DESIGN.md).
 *
 * Opt-in: when `CRICKET_VERIFIER_URL` is set (the realtime service's origin, https, or http on
 * loopback for local tests), /api/solo/submit sends a cricket run's token and log there to be
 * replayed, instead of replaying it on the Worker, whose Free plan allows 10 ms of CPU where a T20
 * or ODI needs 0.1-0.5 s. Unset, nothing changes: the Worker verifies as before.
 *
 * The request carries a one-use job signed for exactly this player, run and request; the answer is
 * accepted only as a verdict signed for that same job, run and request.
 */
export type RemoteVerification =
  | { ok: true; result: SoloRunResult }
  | { ok: false; reason: string }
  /** The verifier couldn't be reached or answered unexpectedly: retry later, nothing is decided. */
  | { ok: false; unavailable: true };

export function cricketVerifierUrl(): URL | null {
  const raw = process.env.CRICKET_VERIFIER_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol === "https:" || (url.protocol === "http:" && loopback)) return url;
  } catch {
    // fall through
  }
  // A plain-http or malformed address would send run tokens in the clear: refuse to use it.
  throw Error("CRICKET_VERIFIER_URL must be an https URL (or http on loopback)");
}

const TIMEOUT_MS = 30_000;

export async function verifyCricketRemotely(base: URL, run: { sub: string; jti: string }, runToken: string, log: unknown, secret: string): Promise<RemoteVerification> {
  const body = JSON.stringify(log);
  const hash = await cricketRequestHash(runToken, body);
  const job = await signCricketVerifyJob({ sub: run.sub, run: run.jti, hash }, secret);
  let res: Response;
  try {
    res = await fetch(new URL("/internal/cricket/verify", base), {
      method: "POST",
      headers: { authorization: `Bearer ${job.token}`, "x-run-token": runToken, "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
  } catch (e) {
    console.error("cricket verifier unreachable", e instanceof Error ? e.name : "error");
    return { ok: false, unavailable: true };
  }
  const json = (await res.json().catch(() => null)) as { verdict?: unknown; error?: unknown } | null;
  if (res.status === 422 && typeof json?.error === "string") return { ok: false, reason: json.error.slice(0, 200) };
  if (res.status !== 200 || typeof json?.verdict !== "string") {
    // 401/403/400 mean a misconfiguration (e.g. different secrets), 503 a busy or failed replay.
    console.error("cricket verifier refused the request", res.status, typeof json?.error === "string" ? json.error.slice(0, 40) : "");
    return { ok: false, unavailable: true };
  }
  try {
    const result = (await verifyCricketVerdict(json.verdict, secret, { job: job.jti, run: run.jti, hash })) as SoloRunResult;
    if (typeof result.score !== "number" || typeof result.completed !== "boolean" || typeof result.durationMs !== "number" || typeof result.details !== "object") throw Error("invalid_result");
    return { ok: true, result };
  } catch {
    console.error("cricket verifier answered with an invalid verdict");
    return { ok: false, unavailable: true };
  }
}
