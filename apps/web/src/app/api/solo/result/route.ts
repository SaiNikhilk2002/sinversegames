import { NextResponse } from "next/server";
import { z } from "zod";
import { getCuisineReceipt, getDb } from "@platform/db";
import { jsonRoute } from "@/lib/server/api-route";
import { getSession } from "@/lib/server/session";
import { rateLimit } from "@/lib/server/rate-limit";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "cache-control": "no-store" } });
async function handleGET(request: Request) {
  const player = await getSession();
  if (!player) return json({ error: "Choose your player name first." }, 401);
  const run = z.string().uuid().safeParse(new URL(request.url).searchParams.get("runId"));
  if (!run.success) return json({ error: "Invalid run." }, 400);
  if (!(await rateLimit("solo-receipt", 60, 60_000))) return json({ error: "Please try again shortly." }, 429);
  const db = getDb(); if (!db) return json({ error: "Saved results are unavailable." }, 503);
  try { const receipt = await getCuisineReceipt(db, player.id, run.data); return receipt ? json(receipt) : json({ error: "No saved result for this player and run." }, 404); }
  catch { return json({ error: "Your saved result couldn't be loaded. Try again." }, 503); }
}

export const GET = jsonRoute("solo result GET", handleGET);
