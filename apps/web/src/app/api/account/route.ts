import { z } from "zod";
import { AccountError, claimUsername } from "@platform/db";
import { usernameSchema } from "@platform/shared";
import {
  accountContext,
  accountJson,
  googleConfig,
  smallJson,
} from "@/lib/server/account";
import { avatarStorageAvailable } from "@/lib/server/avatar-storage";
export const dynamic = "force-dynamic";
export async function GET() {
  const ctx = await accountContext("account-read", false, false);
  if (ctx.error) return ctx.error;
  const { db, player } = ctx;
  try {
    const row = await db.player.findUniqueOrThrow({
      where: { id: player.id },
      include: {
        identities: { select: { provider: true } },
        sessions: {
          where: { expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
          select: { tokenHash: true, createdAt: true, expiresAt: true },
        },
      },
    });
    return accountJson({
      googleAvailable: !!googleConfig(),
      avatarAvailable: await avatarStorageAvailable(),
      linked: row.identities.some((i) => i.provider === "google"),
      username: row.username,
      usernameChangedAt: row.usernameChangedAt,
      onboardingAt: row.onboardingAt,
      avatarKey: row.avatarKey,
      sessions: row.sessions.map((s) => ({
        current: s.tokenHash === player.sid,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      })),
    });
  } catch {
    return accountJson({ error: "Account details couldn't be loaded." }, 503);
  }
}
const edit = z
  .object({
    username: usernameSchema.optional(),
    finishOnboarding: z.boolean().optional(),
  })
  .strict();
export async function PATCH(request: Request) {
  const ctx = await accountContext("account-edit");
  if (ctx.error) return ctx.error;
  const parsed = edit.safeParse(await smallJson(request));
  if (!parsed.success)
    return accountJson(
      { error: parsed.error.issues[0]?.message ?? "Invalid account changes." },
      400,
    );
  try {
    if (parsed.data.username)
      await claimUsername(ctx.db, ctx.player.id, parsed.data.username);
    if (parsed.data.finishOnboarding) {
      const row = await ctx.db.player.findUniqueOrThrow({
        where: { id: ctx.player.id },
      });
      if (!row.username)
        return accountJson({ error: "Choose a username first." }, 400);
      await ctx.db.player.update({
        where: { id: ctx.player.id },
        data: { onboardingAt: new Date() },
      });
    }
    return accountJson({ ok: true });
  } catch (error) {
    return accountJson(
      {
        error:
          error instanceof AccountError
            ? ({
                username_taken: "That username is taken.",
                rename_cooldown: "Usernames can change once every 30 days.",
              }[error.code] ?? "Account couldn't be updated.")
            : "Account couldn't be updated.",
      },
      409,
    );
  }
}
