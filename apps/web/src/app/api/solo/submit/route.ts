import { NextResponse } from "next/server";
import { z } from "zod";
import { isSoloGameId } from "@platform/shared";
import { InvalidTokenError, verifyRunToken } from "@platform/shared/identity";
import { SOLO_GAMES } from "@platform/engines/solo";
import { activeBan, achievementByKey, getCuisineReceipt, getDb, getPersonalBest, recordMatch, upsertPlayer } from "@platform/db";
import { authSecret, getSession, isSameOrigin } from "@/lib/server/session";
import { rateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 512 * 1024;
/** Allowance for clock differences and network time when comparing game time to real time. */
const TIMING_SLACK_MS = 10_000;

const body = z.object({ token: z.string().min(20).max(4096), log: z.unknown() });

/**
 * Verifies and records a finished single-player run. The client sends only
 * its move log; the score is computed here by replaying the log through the
 * game's rules with the seed from the signed run token. A run can be recorded
 * once (its id is the stored match id) and can't claim more game time than
 * has actually passed since it started.
 */
export async function POST(req: Request) {
  if (!(await isSameOrigin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await rateLimit("solo-submit", 30, 60_000))) return NextResponse.json({ error: "Too many submissions" }, { status: 429 });
  const player = await getSession();
  if (!player) return NextResponse.json({ error: "Join with a name first" }, { status: 401 });

  const reader = req.body?.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.length; if (bytes > MAX_BODY_BYTES) { await reader.cancel(); return NextResponse.json({ error: "That game log is too large" }, { status: 413 }); }
      chunks.push(value);
    }
  } finally { reader?.releaseLock(); }
  const buffer = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  const raw = new TextDecoder().decode(buffer);
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // handled below
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid submission" }, { status: 400 });

  let run;
  try {
    run = await verifyRunToken(parsed.data.token, authSecret());
  } catch (e) {
    const expired = e instanceof InvalidTokenError && e.reason === "expired";
    return NextResponse.json({ error: expired ? "This game is too old to submit" : "Invalid game token" }, { status: 400 });
  }
  if (run.sub !== player.id) return NextResponse.json({ error: "This game belongs to another player" }, { status: 403 });
  if (!isSoloGameId(run.gameId)) return NextResponse.json({ error: "Unknown game" }, { status: 400 });

  const game = SOLO_GAMES[run.gameId];
  const config = game.configSchema.safeParse(run.config);
  const log = game.logSchema.safeParse(parsed.data.log);
  if (!config.success || !log.success) return NextResponse.json({ error: "Invalid game log" }, { status: 400 });

  const verified = game.verify(run.seed, config.data, log.data);
  if (!verified.ok) return NextResponse.json({ error: verified.reason }, { status: 422 });
  const { result } = verified;
  const now = Date.now();
  if (result.durationMs > now - run.issuedAt + TIMING_SLACK_MS) {
    return NextResponse.json({ error: "That game finished faster than real time allows" }, { status: 422 });
  }

  const response = { score: result.score, completed: result.completed, details: result.details, saved: false, earnedCoins: 0, unlocked: [] as { key: string; title: string }[], best: null as null | { best: number; today: number; played: number } };
  const db = getDb();
  if (!db) return NextResponse.json(response);
  try {
    if ((run.gameId as string) === "cuisine-quest" && await activeBan(db, player.id)) return NextResponse.json({ error: "Your account is suspended." }, { status: 403 });
    await upsertPlayer(db, player);
    const recorded = await recordMatch(db, {
      id: run.jti,
      solo: true,
      roomCode: "SOLO",
      visibility: "solo",
      config: config.data,
      startedAt: Math.max(run.issuedAt, now - result.durationMs),
      players: [{ id: player.id, name: player.name, color: player.color }],
      results: {
        gameId: run.gameId,
        endedAt: now,
        reason: "completed",
        entries: [
          { playerId: player.id, name: player.name, color: player.color, placement: 1, score: result.score, isWinner: result.completed, details: result.details },
        ],
      },
    });
    response.saved = !!recorded;
    response.earnedCoins = recorded?.earned[player.id] ?? 0;
    response.unlocked = (recorded?.unlocked[player.id] ?? []).map((key) => ({ key, title: achievementByKey.get(key)?.title ?? key }));
    if ((run.gameId as string) === "cuisine-quest") {
      const receipt = await getCuisineReceipt(db, player.id, run.jti);
      if (receipt) return NextResponse.json(receipt);
    }
  } catch (e) {
    // A unique-id conflict means this run was already recorded.
    if ((e as { code?: string }).code === "P2002") {
      if ((run.gameId as string) === "cuisine-quest") {
        const receipt = await getCuisineReceipt(db, player.id, run.jti).catch(() => null);
        if (receipt) return NextResponse.json({ ...receipt, alreadySaved: true });
      }
      return NextResponse.json({ error: "This game was already submitted" }, { status: 409 });
    }
    console.error("solo submit failed", e);
    return NextResponse.json({ ...response, error: "Your score couldn't be saved right now" }, { status: 503 });
  }
  response.best = await getPersonalBest(db, player.id, run.gameId).catch(() => null);
  return NextResponse.json(response);
}
