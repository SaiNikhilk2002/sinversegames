import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb, identityLimit, upsertPlayer } from "@platform/db";
import {
  authorizationUrl,
  hashSecret,
  randomSecret,
} from "@platform/shared/identity";
import { accountJson, googleConfig } from "@/lib/server/account";
import {
  getSession,
  isSameOrigin,
  sessionFingerprint,
} from "@/lib/server/session";
import { clientIp } from "@/lib/server/rate-limit";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!(await isSameOrigin())) return accountJson({ error: "Forbidden" }, 403);
  const config = googleConfig();
  const db = getDb();
  if (!config || !db)
    return accountJson(
      {
        error:
          "Google connection is not configured yet. Guest play remains available.",
      },
      503,
    );
  if (new URL(request.url).origin !== config.origin)
    return accountJson(
      { error: `Open ${config.origin}/account to connect Google.` },
      400,
    );
  try {
    if (!(await identityLimit(db, "oauth-start", await clientIp(), 10, 60000)))
      return accountJson({ error: "Try again in a minute." }, 429);
    const mode = new URL(request.url).searchParams.get("mode");
    if (mode !== "link" && mode !== "signin")
      return accountJson({ error: "Choose link or sign in." }, 400);
    const player = await getSession();
    if (mode === "link" && !player)
      return accountJson(
        { error: "Your player session changed. Please try again." },
        401,
      );
    if (mode === "link" && player?.kind === "registered")
      return accountJson(
        { error: "This player already has Google connected." },
        409,
      );
    if (player) await upsertPlayer(db, player);
    const state = randomSecret(),
      browser = randomSecret(),
      verifier = randomSecret(),
      nonce = randomSecret();
    await db.oAuthAttempt.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await db.oAuthAttempt.create({
      data: {
        stateHash: await hashSecret(state),
        browserHash: await hashSecret(browser),
        actorId: mode === "link" ? player!.id : null,
        actorSessionHash: await sessionFingerprint(),
        mode,
        verifier,
        nonce,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    (await cookies()).set("sg_oauth", browser, {
      httpOnly: true,
      secure: config.origin.startsWith("https:"),
      sameSite: "lax",
      path: "/api/auth/google",
      maxAge: 600,
    });
    return accountJson({
      url: await authorizationUrl(config, state, verifier, nonce),
    });
  } catch {
    return accountJson(
      { error: "Google connection couldn't start. Please try again." },
      503,
    );
  }
}
