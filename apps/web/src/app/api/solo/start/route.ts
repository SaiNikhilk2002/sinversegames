import { NextResponse } from "next/server";
import { z } from "zod";
import { isSoloGameId } from "@platform/shared";
import { signRunToken } from "@platform/shared/identity";
import { SOLO_GAMES } from "@platform/engines/solo";
import { authSecret, getSession, isSameOrigin } from "@/lib/server/session";
import { rateLimit } from "@/lib/server/rate-limit";
import { activeBan, getCuisineCampaign, getDb } from "@platform/db";

export const dynamic = "force-dynamic";

const body = z.object({ gameId: z.string().max(40), config: z.record(z.string(), z.unknown()).optional() });

/**
 * Starts a single-player run: picks the seed on the server and signs it into a
 * run token. The browser deals from the same seed; the score is later computed
 * by replaying the player's moves against it (see /api/solo/submit).
 */
export async function POST(req: Request) {
  if (!(await isSameOrigin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await rateLimit("solo-start", 60, 60_000))) return NextResponse.json({ error: "Too many new games — slow down a little" }, { status: 429 });
  const player = await getSession();
  if (!player) return NextResponse.json({ error: "Join with a name first" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isSoloGameId(parsed.data.gameId)) return NextResponse.json({ error: "Unknown game" }, { status: 400 });
  const game = SOLO_GAMES[parsed.data.gameId];
  const config = game.configSchema.safeParse(parsed.data.config ?? {});
  if (!config.success) return NextResponse.json({ error: "Invalid game settings" }, { status: 400 });

  if ((parsed.data.gameId as string) === "cuisine-quest") {
    const db = getDb(); const level = Number((config.data as { level: number }).level);
    if (!db && level > 1) return NextResponse.json({ error: "Campaign saving must be available to unlock the next cuisine." }, { status: 503 });
    if (db) try {
      if (await activeBan(db, player.id)) return NextResponse.json({ error: "Your account is suspended." }, { status: 403 });
      const campaign = await getCuisineCampaign(db, player.id);
      if (!campaign.levels[level - 1]?.unlocked) return NextResponse.json({ error: "Complete the earlier cuisine levels first." }, { status: 403 });
    } catch { return NextResponse.json({ error: "Your campaign couldn't be checked. Please retry." }, { status: 503 }); }
  }

  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const runId = crypto.randomUUID();
  const token = await signRunToken({ sub: player.id, gameId: parsed.data.gameId, seed, config: config.data as Record<string, unknown>, jti: runId }, authSecret());
  return NextResponse.json({ token, seed, config: config.data, runId });
}
