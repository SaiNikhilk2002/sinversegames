import { jwtVerify, SignJWT } from "jose";
import { randomSecret } from "./profile";

/**
 * Internal tokens for verifying cricket on the realtime service (docs/CRICKET_RAILWAY_VERIFICATION_DESIGN.md).
 *
 * - A **job** authorises one verification. The web app issues it after authenticating the player
 *   and checking their run; it names the player and run, is bound to a hash of the exact request
 *   (run token + log), lasts 60 seconds and is single-use.
 * - A **verdict** is the realtime service's signed answer, bound to that job, run and request hash,
 *   so the web app only persists a result produced for the request it sent.
 *
 * Both use HS256 with the shared AUTH_SECRET, with their own audience and purpose, like the avatar
 * job. Neither carries anything a client can use: the client never sees them.
 */
const ISSUER = "platform";
export const CRICKET_VERIFY_JOB_TTL_SECONDS = 60;
const key = (secret: string) => {
  if (!secret || secret.length < 32) throw Error("AUTH_SECRET must be set and at least 32 characters long");
  return new TextEncoder().encode(secret);
};

/** SHA-256 (hex) of the run token and the exact log body, the binding between job, request and verdict. */
export async function cricketRequestHash(runToken: string, body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${runToken}\n${body}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CricketVerifyJob {
  /** The authenticated player (the run token's subject). */
  sub: string;
  /** The run id (the run token's jti, also the future match id). */
  run: string;
  /** {@link cricketRequestHash} of the request this job authorises. */
  hash: string;
  /** The job's own one-use id. */
  jti: string;
}

export async function signCricketVerifyJob(job: Omit<CricketVerifyJob, "jti">, secret: string) {
  const jti = randomSecret();
  const token = await new SignJWT({ purpose: "cricket-verify", run: job.run, hash: job.hash })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(job.sub)
    .setIssuer(ISSUER)
    .setAudience("cricket-verifier")
    .setIssuedAt()
    .setExpirationTime(`${CRICKET_VERIFY_JOB_TTL_SECONDS}s`)
    .setJti(jti)
    .sign(key(secret));
  return { token, jti };
}

export async function verifyCricketVerifyJob(token: string, secret: string): Promise<CricketVerifyJob> {
  const { payload } = await jwtVerify(token, key(secret), {
    issuer: ISSUER,
    audience: "cricket-verifier",
    algorithms: ["HS256"],
    maxTokenAge: `${CRICKET_VERIFY_JOB_TTL_SECONDS}s`,
  });
  if (
    payload.purpose !== "cricket-verify" ||
    typeof payload.sub !== "string" ||
    typeof payload.run !== "string" ||
    typeof payload.hash !== "string" ||
    !/^[a-f0-9]{64}$/.test(payload.hash) ||
    typeof payload.jti !== "string"
  )
    throw Error("invalid_job");
  return { sub: payload.sub, run: payload.run, hash: payload.hash, jti: payload.jti };
}

export interface CricketVerdictBinding {
  job: string;
  run: string;
  hash: string;
}

export async function signCricketVerdict(binding: CricketVerdictBinding, result: unknown, secret: string) {
  return new SignJWT({ purpose: "cricket-verdict", job: binding.job, run: binding.run, hash: binding.hash, result: result as Record<string, unknown> })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience("cricket-verdict")
    .setIssuedAt()
    .setExpirationTime(`${CRICKET_VERIFY_JOB_TTL_SECONDS}s`)
    .sign(key(secret));
}

/** Returns the verified result, only if the verdict was signed for exactly this job, run and request. */
export async function verifyCricketVerdict(token: string, secret: string, expected: CricketVerdictBinding): Promise<unknown> {
  const { payload } = await jwtVerify(token, key(secret), {
    issuer: ISSUER,
    audience: "cricket-verdict",
    algorithms: ["HS256"],
    maxTokenAge: `${CRICKET_VERIFY_JOB_TTL_SECONDS}s`,
  });
  if (payload.purpose !== "cricket-verdict" || payload.job !== expected.job || payload.run !== expected.run || payload.hash !== expected.hash || typeof payload.result !== "object" || payload.result === null)
    throw Error("invalid_verdict");
  return payload.result;
}
