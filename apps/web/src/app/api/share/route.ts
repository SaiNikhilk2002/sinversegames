import { NextResponse } from "next/server";
import { z } from "zod";
import { isMultiplayerGameId, sharePayloadFor, type MatchResults } from "@platform/shared";
import { signShareToken } from "@platform/shared/identity";
import { getDb } from "@platform/db";
import { jsonRoute } from "@/lib/server/api-route";
import { authSecret, getSession, isSameOrigin } from "@/lib/server/session";
import { rateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const body = z.object({ matchId: z.string().uuid(), names: z.boolean().default(false) });

/**
 * Creates a share link for a finished multiplayer match the caller played (docs/FUN_INSIGHTS_SYSTEM.md).
 * The card is built here from the recorded match, never from what the browser says, and signed so
 * it can't be edited. It holds the game, headline numbers, up to two Fun Insights and, only if
 * asked, display names: no answers, emails, player ids or room codes.
 */
async function handlePOST(req: Request) {
  if (!(await isSameOrigin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await rateLimit("share", 20, 60_000))) return NextResponse.json({ error: "Too many share links. Try again in a minute." }, { status: 429 });
  const player = await getSession();
  if (!player) return NextResponse.json({ error: "Join with a name first" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Sharing is unavailable right now" }, { status: 503 });
  const match = await db.match.findUnique({ where: { id: parsed.data.matchId }, include: { participants: true } });
  // A missing match and someone else's match answer the same, so ids can't be probed.
  if (!match || !match.participants.some((p) => p.playerId === player.id)) return NextResponse.json({ error: "That match wasn't found" }, { status: 404 });
  if (!isMultiplayerGameId(match.gameId) || match.endReason !== "completed") return NextResponse.json({ error: "Only finished multiplayer matches can be shared" }, { status: 400 });
  const results: MatchResults = {
    gameId: match.gameId,
    endedAt: match.endedAt.getTime(),
    reason: "completed",
    entries: [...match.participants]
      .sort((a, b) => a.placement - b.placement || b.score - a.score)
      .map((p) => ({ playerId: p.playerId, name: p.displayName, color: "#ffffff", placement: p.placement, score: p.score, isWinner: p.isWinner, details: (p.details ?? {}) as Record<string, number | string> })),
  };
  const token = await signShareToken(sharePayloadFor(results, { seed: match.id, includeNames: parsed.data.names }), authSecret());
  return NextResponse.json({ url: `/share/${token}` });
}

export const POST = jsonRoute("share POST", handlePOST);
