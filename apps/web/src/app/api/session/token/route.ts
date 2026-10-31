import { NextResponse } from "next/server";
import { activeBan, getDb } from "@platform/db";
import { getSession, isSameOrigin, realtimeToken } from "@/lib/server/session";
import { rateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

/** Exchanges the httpOnly session cookie for a short-lived realtime token. */
export async function POST() {
  if (!(await isSameOrigin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await rateLimit("rt-token", 60, 60_000))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const player = await getSession();
  if (!player) return NextResponse.json({ error: "No session" }, { status: 401 });
  const db = getDb();
  if (db) {
    const ban = await activeBan(db, player.id).catch(() => null);
    if (ban) return NextResponse.json({ error: "This account is suspended", until: ban.until }, { status: 403 });
  }
  return NextResponse.json(
    { token: await realtimeToken(player), url: process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4200" },
    { headers: { "cache-control": "no-store" } },
  );
}
