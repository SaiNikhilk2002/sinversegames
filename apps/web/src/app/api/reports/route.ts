import { NextResponse } from "next/server";
import { z } from "zod";
import { gameIdSchema, roomCodeSchema } from "@platform/shared";
import { createReport, getDb, REPORT_REASONS, upsertPlayer } from "@platform/db";
import { getSession, isSameOrigin } from "@/lib/server/session";
import { rateLimit } from "@/lib/server/rate-limit";

const schema = z.object({
  targetPlayerId: z.string().max(64).optional(),
  roomCode: roomCodeSchema.optional(),
  gameId: gameIdSchema.optional(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).optional(),
});

export async function POST(req: Request) {
  if (!(await isSameOrigin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const player = await getSession();
  if (!player) return NextResponse.json({ error: "Join with a name first" }, { status: 401 });
  if (!(await rateLimit("report", 5, 10 * 60_000))) return NextResponse.json({ error: "You've sent several reports — please wait a few minutes" }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Reporting is unavailable right now" }, { status: 503 });
  await upsertPlayer(db, player);
  await createReport(db, { reporterId: player.id, ...parsed.data });
  return NextResponse.json({ ok: true });
}
