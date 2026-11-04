import { getDb } from "@platform/db";
import { readAvatar } from "@/lib/server/avatar-storage";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string; size: string }> },
) {
  const { key, size } = await params;
  if (!/^[a-f0-9]{32}$/.test(key) || !["small", "full"].includes(size))
    return new Response(null, { status: 404 });
  const db = getDb();
  if (!db) return new Response(null, { status: 503 });
  try {
    if (
      !(await db.player.findFirst({
        where: { avatarKey: key },
        select: { id: true },
      }))
    )
      return new Response(null, { status: 404 });
    const bytes = await readAvatar(`${key}/${size}.webp`);
    if (!bytes) return new Response(null, { status: 404 });
    return new Response(bytes as BodyInit, {
      headers: {
        "content-type": "image/webp",
        "content-length": String(bytes.length),
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        "cache-control": "public, max-age=300",
        "cross-origin-resource-policy": "same-origin",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
