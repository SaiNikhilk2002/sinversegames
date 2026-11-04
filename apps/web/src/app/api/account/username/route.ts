import { usernameSchema } from "@platform/shared";
import { accountContext, accountJson } from "@/lib/server/account";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const ctx = await accountContext("username-check", false);
  if (ctx.error) return ctx.error;
  const parsed = usernameSchema.safeParse(
    new URL(request.url).searchParams.get("username"),
  );
  if (!parsed.success)
    return accountJson(
      { available: false, error: parsed.error.issues[0]?.message },
      400,
    );
  const row = await ctx.db.player.findUnique({
    where: { username: parsed.data },
    select: { id: true },
  });
  return accountJson({
    username: parsed.data,
    available: !row || row.id === ctx.player.id,
  });
}
