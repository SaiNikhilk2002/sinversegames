import { NextResponse } from "next/server";
import { isSoloGameId } from "@platform/shared";
import { getDailyBest, getDb, getPersonalBest } from "@platform/db";
import { getSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Personal best and today's top scores for a single-player game. */
export async function GET(req: Request) {
  const gameId = new URL(req.url).searchParams.get("game");
  if (!isSoloGameId(gameId)) return NextResponse.json({ error: "Unknown game" }, { status: 400 });
  const db = getDb();
  if (!db) return NextResponse.json({ available: false, personal: null, daily: [] });
  const player = await getSession();
  try {
    const [personal, daily] = await Promise.all([player ? getPersonalBest(db, player.id, gameId) : null, getDailyBest(db, gameId, 10)]);
    return NextResponse.json({ available: true, personal, daily });
  } catch {
    return NextResponse.json({ available: false, personal: null, daily: [] });
  }
}
