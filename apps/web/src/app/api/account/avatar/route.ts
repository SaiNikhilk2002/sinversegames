import { randomSecret } from "@platform/shared";
import { signAvatarJob } from "@platform/shared/identity";
import { accountContext, accountJson, boundedBody } from "@/lib/server/account";
import {
  avatarStorageAvailable,
  deleteAvatar,
  putAvatar,
} from "@/lib/server/avatar-storage";
import { authSecret } from "@/lib/server/session";
export const dynamic = "force-dynamic";
const cleanup = async (key: string | null) => {
  if (key)
    await deleteAvatar(key).catch(() => console.warn("avatar_cleanup_pending"));
};
export async function POST(request: Request) {
  const ctx = await accountContext("avatar-upload");
  if (ctx.error) return ctx.error;
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(
      request.headers.get("content-type") ?? "",
    )
  )
    return accountJson({ error: "Choose a JPEG, PNG or WebP image." }, 415);
  if (!(await avatarStorageAvailable()))
    return accountJson(
      { error: "Profile image storage is not configured yet." },
      503,
    );
  let bytes: Uint8Array;
  try {
    bytes = await boundedBody(request, 5 * 1024 * 1024);
  } catch {
    return accountJson({ error: "Choose an image under 5 MB." }, 413);
  }
  if (!bytes.length) return accountJson({ error: "Choose an image." }, 400);
  const key = randomSecret().slice(0, 32);
  let stored = false;
  try {
    const origin =
      process.env.REALTIME_INTERNAL_URL ??
      process.env.NEXT_PUBLIC_REALTIME_URL ??
      "http://localhost:4200";
    const processed = await fetch(`${origin}/internal/avatar`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await signAvatarJob(ctx.player.id, authSecret())}`,
        "content-type": request.headers.get("content-type")!,
      },
      body: bytes as BodyInit,
      signal: AbortSignal.timeout(12000),
      redirect: "error",
    });
    if (!processed.ok)
      return accountJson(
        {
          error:
            processed.status === 400
              ? "That image could not be decoded. Use a still JPEG, PNG or WebP up to 4096 x 4096."
              : "Image processing is unavailable. Please retry.",
        },
        processed.status === 400 ? 400 : 503,
      );
    const result = (await processed.json()) as { small: string; full: string };
    if (
      typeof result.small !== "string" ||
      typeof result.full !== "string" ||
      result.small.length > 100000 ||
      result.full.length > 400000
    )
      throw Error("invalid_processed_avatar");
    stored = true;
    await putAvatar(
      `${key}/small.webp`,
      Uint8Array.from(atob(result.small), (c) => c.charCodeAt(0)),
    );
    await putAvatar(
      `${key}/full.webp`,
      Uint8Array.from(atob(result.full), (c) => c.charCodeAt(0)),
    );
    const previous = await ctx.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Player" WHERE "id"=${ctx.player.id} FOR UPDATE`;
      const row = await tx.player.findUniqueOrThrow({
        where: { id: ctx.player.id },
        select: { avatarKey: true },
      });
      await tx.player.update({
        where: { id: ctx.player.id },
        data: { avatarKey: key },
      });
      return row.avatarKey;
    });
    await cleanup(previous);
    return accountJson({ ok: true, avatarKey: key });
  } catch {
    if (stored) await cleanup(key);
    return accountJson(
      { error: "Your profile image couldn't be saved. Try again." },
      503,
    );
  }
}
export async function DELETE() {
  const ctx = await accountContext("avatar-remove");
  if (ctx.error) return ctx.error;
  const previous = await ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Player" WHERE "id"=${ctx.player.id} FOR UPDATE`;
    const row = await tx.player.findUniqueOrThrow({
      where: { id: ctx.player.id },
      select: { avatarKey: true },
    });
    await tx.player.update({
      where: { id: ctx.player.id },
      data: { avatarKey: null },
    });
    return row.avatarKey;
  });
  await cleanup(previous);
  return accountJson({ ok: true });
}
