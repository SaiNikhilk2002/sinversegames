import { NextResponse } from "next/server";
import { getCuisineCampaign, getCuisineRunDetails, getDb } from "@platform/db";
import { summariseJourney } from "@platform/engines/cuisine-quest";
import { jsonRoute } from "@/lib/server/api-route";
import { getSession } from "@/lib/server/session";
import { rateLimit } from "@/lib/server/rate-limit";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "cache-control": "no-store" } });
async function handleGET() {
  const player = await getSession();
  if (!player) return json({ available: false, error: "Choose a player name to save your campaign." }, 401);
  if (!(await rateLimit("cq-campaign", 90, 60_000))) return json({ available: false, error: "Please try again shortly." }, 429);
  const db = getDb();
  if (!db) return json({ available: false, error: "Campaign saving is unavailable. The first kitchen is available for practice." }, 503);
  try {
    const campaign = await getCuisineCampaign(db, player.id);
    // Replay goals are extras: losing them must not block the campaign itself.
    const journey = await getCuisineRunDetails(db, player.id).then(summariseJourney).catch(() => null);
    return json({ available: true, ...campaign, journey });
  } catch { return json({ available: false, error: "Your campaign couldn't be loaded. Retry before starting another cuisine." }, 503); }
}

export const GET = jsonRoute("cuisine campaign GET", handleGET);
