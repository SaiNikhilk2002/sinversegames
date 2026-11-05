import { NextResponse } from "next/server";
import { z } from "zod";
import { anyGameIdSchema } from "@platform/shared";
import { getDb, toggleFavorite, upsertPlayer } from "@platform/db";
import { jsonRoute } from "@/lib/server/api-route";
import { getSession, isSameOrigin } from "@/lib/server/session";

async function handlePOST(req: Request) {
  if (!(await isSameOrigin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const player = await getSession();
  if (!player) return NextResponse.json({ error: "Join with a name first" }, { status: 401 });
  const parsed = z.object({ gameId: anyGameIdSchema }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid game" }, { status: 400 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Favourites are unavailable right now" }, { status: 503 });
  await upsertPlayer(db, player);
  return NextResponse.json({ favorite: await toggleFavorite(db, player.id, parsed.data.gameId) });
}

export const POST = jsonRoute("favorites POST", handlePOST);
