import { NextResponse } from "next/server";
import { z } from "zod";
import { isSoloGameId } from "@platform/shared";
import { InvalidTokenError, verifyRunToken } from "@platform/shared/identity";
import { SOLO_GAMES } from "@platform/engines/solo";
import { activeBan, achievementByKey, getCuisineReceipt, getDb, getPersonalBest, recordMatch, upsertPlayer } from "@platform/db";
import { jsonRoute } from "@/lib/server/api-route";
import { authSecret, getSession, isSameOrigin } from "@/lib/server/session";
import { rateLimit } from "@/lib/server/rate-limit";
import { cricketVerifierUrl, verifyCricketRemotely } from "@/lib/server/cricket-verifier";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 512 * 1024;
/** Allowance for clock differences and network time when comparing game time to real time. */
const TIMING_SLACK_MS = 10_000;

const body = z.object({ token: z.string().min(20).max(4096), log: z.unknown() });
const UNAVAILABLE = "Cricket results can't be verified right now. Please try again shortly.";

/**
 * Cricket runs whose log failed verification in this isolate. Verification is deterministic, so
 * the same log can never pass, and another log under the same run is a tampering attempt. An
 * international match's replay costs real CPU, so neither is replayed again. Best-effort: each
 * isolate keeps its own set, like the request rate limits.
 */
const rejectedCricketRuns = new Set<string>();
const MAX_REJECTED_RUNS = 10_000;
function rememberRejected(runId: string) {
  if (rejectedCricketRuns.size >= MAX_REJECTED_RUNS) rejectedCricketRuns.delete(rejectedCricketRuns.values().next().value!);
  rejectedCricketRuns.add(runId);
}

/**
 * Verifies and records a finished single-player run. The client sends only
 * its move log; the score is computed here by replaying the log through the
 * game's rules with the seed from the signed run token. A run can be recorded
 * once (its id is the stored match id) and can't claim more game time than
 * has actually passed since it started.
 */
async function handlePOST(req: Request) {
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
  // A cricket match's game time is its last entry's time (verify checks the timeline is in order), so a log
  // claiming more time than has passed is refused before the (comparatively costly) replay, not after it.
  const cricket = (run.gameId as string) === "sinverse-cricket";
  // One client for the whole request: on Workers each getDb() call opens its own connection.
  const db = getDb();
  if (cricket) {
    const last = (log.data as { t?: unknown }[]).at(-1)?.t;
    if (typeof last === "number" && last > Date.now() - run.issuedAt + TIMING_SLACK_MS)
      return NextResponse.json({ error: "That game finished faster than real time allows" }, { status: 422 });
    if (rejectedCricketRuns.has(run.jti)) return NextResponse.json({ error: "This game's log was already rejected" }, { status: 422 });
    // A run already recorded is a duplicate whatever its log says: answer as the unique id below
    // would, without replaying it first. (A primary-key read; a database outage just skips it.)
    if (db && (await db.match.findUnique({ where: { id: run.jti }, select: { id: true } }).catch(() => null)))
      return NextResponse.json({ error: "This game was already submitted" }, { status: 409 });
  }

  // Cricket replays on the realtime service when CRICKET_VERIFIER_URL is set (Workers Free can't
  // afford a T20/ODI replay); everything around the replay, and all persistence, stays here.
  let remote: URL | null = null;
  try {
    remote = cricket ? cricketVerifierUrl() : null;
  } catch (e) {
    console.error((e as Error).message);
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
  }
  let verified;
  if (remote) {
    const answer = await verifyCricketRemotely(remote, { sub: player.id, jti: run.jti }, parsed.data.token, log.data, authSecret());
    if (!answer.ok && "unavailable" in answer) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    verified = answer as Exclude<typeof answer, { unavailable: true }>;
  } else verified = game.verify(run.seed, config.data, log.data);
  if (!verified.ok) {
    if (cricket) rememberRejected(run.jti);
    return NextResponse.json({ error: verified.reason }, { status: 422 });
  }
  const { result } = verified;
  const now = Date.now();
  if (result.durationMs > now - run.issuedAt + TIMING_SLACK_MS) {
    return NextResponse.json({ error: "That game finished faster than real time allows" }, { status: 422 });
  }

  const response = { score: result.score, completed: result.completed, details: result.details, saved: false, earnedCoins: 0, unlocked: [] as { key: string; title: string }[], best: null as null | { best: number; today: number; played: number } };
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

export const POST = jsonRoute("solo submit POST", handlePOST);
