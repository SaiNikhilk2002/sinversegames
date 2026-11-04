import { NextResponse } from "next/server";
import { z } from "zod";
import { avatarColorSchema, displayNameSchema } from "@platform/shared";
import { getDb, upsertPlayer } from "@platform/db";
import { getSession, isSameOrigin, writeSession } from "@/lib/server/session";
import { rateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const player = await getSession();
  const db = player ? getDb() : null;
  const equipment = db && player ? await db.cosmeticEquipment.findMany({ where: { playerId: player.id } }).catch(() => []) : [];
  const cosmetics = { frame: equipment.find((item) => item.category === "profile-frame")?.itemId ?? null, nameplate: equipment.find((item) => item.category === "nameplate")?.itemId ?? null };
  return NextResponse.json({ player: player ? { ...player, cosmetics } : null }, { headers: { "cache-control": "no-store" } });
}

const bodySchema = z.object({ displayName: displayNameSchema, color: avatarColorSchema.optional() });

/** Creates a guest identity, or renames the current one (the player id never changes). */
export async function POST(req: Request) {
  if (!(await isSameOrigin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await rateLimit("session", 20, 60_000))) {
    return NextResponse.json({ error: "Too many requests — try again in a minute" }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid name" }, { status: 400 });
  }
  const existing = await getSession();
  const player = await writeSession(parsed.data.displayName, parsed.data.color, existing);
  const db = getDb();
  if (db) {
    try {
      await upsertPlayer(db, player);
    } catch (e) {
      // Profiles are optional; never block play because the database is down.
      console.error("upsertPlayer failed", e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ player });
}
