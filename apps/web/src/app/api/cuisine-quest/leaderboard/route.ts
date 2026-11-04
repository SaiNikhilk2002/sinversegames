import { NextResponse } from "next/server";
import { z } from "zod";
import { getCuisineLeaderboard, getDb } from "@platform/db";
import { rateLimit } from "@/lib/server/rate-limit";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const level = z.coerce.number().int().min(1).max(7).safeParse(new URL(request.url).searchParams.get("level") ?? "1");
  if (!level.success) return NextResponse.json({ error: "Unknown cuisine." }, { status: 400 });
  if (!(await rateLimit("cq-leaderboard", 60, 60_000))) return NextResponse.json({ error: "Please try again shortly." }, { status: 429 });
  const db = getDb();
  if (!db) return NextResponse.json({ available: false, entries: [] }, { headers: { "cache-control": "no-store" } });
  try { return NextResponse.json({ available: true, entries: await getCuisineLeaderboard(db, level.data) }, { headers: { "cache-control": "no-store" } }); }
  catch { return NextResponse.json({ available: false, entries: [] }, { status: 503, headers: { "cache-control": "no-store" } }); }
}
