import { afterEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import {
  cricketRequestHash,
  signCricketVerdict,
  signCricketVerifyJob,
  verifyCricketVerdict,
  verifyCricketVerifyJob,
} from "../src/identity/cricket-verify";
import { signAvatarJob } from "../src/identity/oidc";

const SECRET = "test-secret-test-secret-test-secret-000";
const OTHER = "another-secret-another-secret-another-0";

afterEach(() => vi.useRealTimers());

describe("cricket verification jobs and verdicts", () => {
  it("binds the request hash to both the run token and the exact log", async () => {
    const a = await cricketRequestHash("run-token", '[{"k":"toss"}]');
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(await cricketRequestHash("run-token", '[{"k":"toss"}]')).toBe(a);
    expect(await cricketRequestHash("run-token", '[{"k":"toss" }]')).not.toBe(a);
    expect(await cricketRequestHash("other-run", '[{"k":"toss"}]')).not.toBe(a);
  });

  it("round-trips a job, with a fresh one-use id each time", async () => {
    const hash = await cricketRequestHash("t", "[]");
    const one = await signCricketVerifyJob({ sub: "player-1", run: "run-1", hash }, SECRET);
    const two = await signCricketVerifyJob({ sub: "player-1", run: "run-1", hash }, SECRET);
    expect(one.jti).not.toBe(two.jti);
    expect(await verifyCricketVerifyJob(one.token, SECRET)).toEqual({ sub: "player-1", run: "run-1", hash, jti: one.jti });
  });

  it("refuses a job signed with another secret, for another audience, or expired", async () => {
    const hash = await cricketRequestHash("t", "[]");
    const forged = await signCricketVerifyJob({ sub: "p", run: "r", hash }, OTHER);
    await expect(verifyCricketVerifyJob(forged.token, SECRET)).rejects.toThrow();
    // An avatar job (same secret, different audience and purpose) can't authorise a verification.
    await expect(verifyCricketVerifyJob(await signAvatarJob("p", SECRET), SECRET)).rejects.toThrow();
    const right = await signCricketVerifyJob({ sub: "p", run: "r", hash }, SECRET);
    vi.useFakeTimers({ now: Date.now() + 61_000 });
    await expect(verifyCricketVerifyJob(right.token, SECRET)).rejects.toThrow();
  });

  it("refuses a job with a missing or malformed claim", async () => {
    const bad = await new SignJWT({ purpose: "cricket-verify", run: "r", hash: "not-a-hash" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("p")
      .setIssuer("platform")
      .setAudience("cricket-verifier")
      .setIssuedAt()
      .setExpirationTime("60s")
      .setJti("j")
      .sign(new TextEncoder().encode(SECRET));
    await expect(verifyCricketVerifyJob(bad, SECRET)).rejects.toThrow("invalid_job");
  });

  it("accepts a verdict only for the job, run and request it was signed for", async () => {
    const binding = { job: "job-1", run: "run-1", hash: await cricketRequestHash("t", "[]") };
    const verdict = await signCricketVerdict(binding, { score: 42, completed: true }, SECRET);
    expect(await verifyCricketVerdict(verdict, SECRET, binding)).toEqual({ score: 42, completed: true });
    await expect(verifyCricketVerdict(verdict, SECRET, { ...binding, job: "job-2" })).rejects.toThrow("invalid_verdict");
    await expect(verifyCricketVerdict(verdict, SECRET, { ...binding, run: "run-2" })).rejects.toThrow("invalid_verdict");
    await expect(verifyCricketVerdict(verdict, SECRET, { ...binding, hash: await cricketRequestHash("t", "[1]") })).rejects.toThrow("invalid_verdict");
    await expect(verifyCricketVerdict(await signCricketVerdict(binding, { score: 1 }, OTHER), SECRET, binding)).rejects.toThrow();
    // A job token is not a verdict.
    const job = await signCricketVerifyJob({ sub: "p", run: "run-1", hash: binding.hash }, SECRET);
    await expect(verifyCricketVerdict(job.token, SECRET, binding)).rejects.toThrow();
  });
});
