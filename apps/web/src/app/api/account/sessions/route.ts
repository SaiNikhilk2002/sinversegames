import { cookies } from "next/headers";
import { z } from "zod";
import { accountContext, accountJson, smallJson } from "@/lib/server/account";
import { SESSION_COOKIE } from "@/lib/server/session";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const ctx = await accountContext("session-revoke", true, false);
  if (ctx.error) return ctx.error;
  const parsed = z
    .object({ action: z.enum(["signout", "revoke-others", "revoke-all"]) })
    .strict()
    .safeParse(await smallJson(request));
  if (!parsed.success)
    return accountJson({ error: "Choose a session action." }, 400);
  if (ctx.player.sid) {
    await ctx.db.accountSession.deleteMany({
      where: {
        playerId: ctx.player.id,
        ...(parsed.data.action === "signout"
          ? { tokenHash: ctx.player.sid }
          : parsed.data.action === "revoke-others"
            ? { tokenHash: { not: ctx.player.sid } }
            : {}),
      },
    });
  }
  if (parsed.data.action !== "revoke-others")
    (await cookies()).set(SESSION_COOKIE, "", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://"),
      maxAge: 0,
    });
  return accountJson({ ok: true });
}
