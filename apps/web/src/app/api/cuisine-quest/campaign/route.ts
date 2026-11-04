import { NextResponse } from "next/server";
import { getCuisineCampaign, getDb } from "@platform/db";
import { getSession } from "@/lib/server/session";
import { rateLimit } from "@/lib/server/rate-limit";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "cache-control": "no-store" } });
export async function GET() {
  const player = await getSession();
  if (!player) return json({ available: false, error: "Choose a player name to save your campaign." }, 401);
  if (!(await rateLimit("cq-campaign", 90, 60_000))) return json({ available: false, error: "Please try again shortly." }, 429);
  const db = getDb();
  if (!db) return json({ available: false, error: "Campaign saving is unavailable. The first kitchen is available for practice." }, 503);
  try { return json({ available: true, ...await getCuisineCampaign(db, player.id) }); }
  catch { return json({ available: false, error: "Your campaign couldn't be loaded. Retry before starting another cuisine." }, 503); }
}
