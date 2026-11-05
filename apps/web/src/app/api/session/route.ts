import { NextResponse } from "next/server";
import { z } from "zod";
import { avatarColorSchema, displayNameSchema } from "@platform/shared";
import { getDb, upsertPlayer } from "@platform/db";
import { getSession, isSameOrigin, writeSession, publicPlayer } from "@/lib/server/session";
import { rateLimit } from "@/lib/server/rate-limit";
import { jsonRoute } from "@/lib/server/api-route";

export const dynamic = "force-dynamic";

async function handleGET() {
  let player;try{player=await getSession();}catch{return NextResponse.json({error:"Player sessions are temporarily unavailable. Please retry."},{status:503,headers:{"cache-control":"no-store"}});}
  const db = player ? getDb() : null;
  const equipment = db && player ? await db.cosmeticEquipment.findMany({ where: { playerId: player.id } }).catch(() => []) : [];
  const cosmetics = { frame: equipment.find((item) => item.category === "profile-frame")?.itemId ?? null, nameplate: equipment.find((item) => item.category === "nameplate")?.itemId ?? null };
  return NextResponse.json({ player: player ? { ...publicPlayer(player), cosmetics } : null }, { headers: { "cache-control": "no-store" } });
}

const bodySchema = z.object({ displayName: displayNameSchema, color: avatarColorSchema.optional() });

/** Creates a guest identity, or renames the current one (the player id never changes). */
async function handlePOST(req: Request) {
  if (!(await isSameOrigin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await rateLimit("session", 20, 60_000))) {
    return NextResponse.json({ error: "Too many requests — try again in a minute" }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid name" }, { status: 400 });
  }
  let existing;try{existing=await getSession();}catch{return NextResponse.json({error:"Your existing player couldn't be checked. Retry without clearing your cookie."},{status:503});}
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
  if(db && existing?.kind!=="registered")await db.player.updateMany({where:{id:player.id,kind:"GUEST"},data:{displayName:player.name,avatarColor:player.color}}).catch(()=>{});
  return NextResponse.json({ player:publicPlayer(player) });
}

export const GET = jsonRoute("session GET", handleGET);
export const POST = jsonRoute("session POST", handlePOST);
