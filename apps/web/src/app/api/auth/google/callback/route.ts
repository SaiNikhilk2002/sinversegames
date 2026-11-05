import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AccountError, getDb, identityLimit, linkGoogle } from "@platform/db";
import { exchangeGoogle, hashSecret } from "@platform/shared/identity";
import { accountJson, googleConfig } from "@/lib/server/account";
import {
  getSession,
  sessionFingerprint,
  writeAccountSession,
} from "@/lib/server/session";
import { clientIp } from "@/lib/server/rate-limit";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const config = googleConfig(),
    db = getDb();
  if (!config || !db)
    return accountJson({ error: "Google connection is unavailable." }, 503);
  const redirect = (status: string) => {
    const response = NextResponse.redirect(
      `${config.origin}/account?auth=${status}`,
      303,
    );
    response.headers.set("cache-control", "no-store");
    response.headers.set("referrer-policy", "no-referrer");
    return response;
  };
  try {
    if (
      !(await identityLimit(db, "oauth-callback", await clientIp(), 30, 60000))
    )
      return redirect("rate_limited");
    const url = new URL(request.url),
      state = url.searchParams.getAll("state"),
      code = url.searchParams.getAll("code");
    const browser = (await cookies()).get("sg_oauth")?.value;
    (await cookies()).set("sg_oauth", "", {
      httpOnly: true,
      secure: config.origin.startsWith("https:"),
      sameSite: "lax",
      path: "/api/auth/google",
      maxAge: 0,
    });
    if (
      url.origin !== config.origin ||
      state.length !== 1 ||
      !/^[a-f0-9]{64}$/.test(state[0]!) ||
      !browser
    )
      return redirect("invalid_state");
    const stateHash = await hashSecret(state[0]!);
    const attempt = await db.oAuthAttempt.findUnique({ where: { stateHash } });
    if (
      !attempt ||
      // This table also holds pending email sign-ins, which never complete here.
      (attempt.mode !== "link" && attempt.mode !== "signin") ||
      attempt.consumedAt ||
      attempt.expiresAt.getTime() <= Date.now() ||
      attempt.browserHash !== (await hashSecret(browser)) ||
      attempt.actorSessionHash !== (await sessionFingerprint())
    )
      return redirect("invalid_state");
    if (attempt.mode === "link" && (await getSession())?.id !== attempt.actorId)
      return redirect("session_changed");
    const consumed = await db.oAuthAttempt.updateMany({
      where: { stateHash, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) return redirect("invalid_state");
    if (url.searchParams.has("error")) return redirect("cancelled");
    if (code.length !== 1 || !code[0] || code[0].length > 4096)
      return redirect("invalid_callback");
    const identity = await exchangeGoogle(
      config,
      code[0],
      attempt.verifier,
      attempt.nonce,
    );
    const player = await linkGoogle(
      db,
      identity.subject,
      attempt.actorId,
      attempt.mode as "link" | "signin",
    );
    await writeAccountSession(player.id);
    return redirect(player.onboardingAt ? "connected" : "onboarding");
  } catch (error) {
    const status =
      error instanceof AccountError ? error.code : "provider_failed";
    // Fixed diagnostic category only: no subject, code, token, email or provider payload.
    console.warn("identity_callback", { status });
    return redirect(status);
  }
}
