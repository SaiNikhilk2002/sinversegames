import type { Prisma, PrismaClient } from "./generated/prisma/client";
import { achievementByKey } from "./progression";
import { CUISINE_IDS } from "@platform/shared";

export async function getCuisineCampaign(db: PrismaClient, playerId: string) {
  const rows = await db.cuisineProgress.findMany({ where: { playerId } });
  const levels = Array.from({ length: 7 }, (_, i) => {
    const level = i + 1; const row = rows.find(row => row.level === level);
    const unlocked = i === 0 || Array.from({ length: i }, (_, j) => rows.some(row => row.level === j + 1 && row.stars >= 1)).every(Boolean);
    return { level, cuisine: CUISINE_IDS[i]!, unlocked, stars: row?.stars ?? 0, bestScore: row?.bestScore ?? 0, completedRuns: row?.completedRuns ?? 0, perfectRuns: row?.perfectRuns ?? 0, mastered: (row?.stars ?? 0) === 3 };
  });
  return { levels, totalStars: levels.reduce((n, level) => n + level.stars, 0), completed: levels.filter(level => level.stars > 0).length, mastered: levels.filter(level => level.mastered).length };
}

/** Caller holds the Player row lock; this update participates in result atomicity. */
export async function recordCuisineProgress(tx: Prisma.TransactionClient, playerId: string, score: number, completed: boolean, details: Record<string, number | string>) {
  const level = Number(details.level); const stars = Number(details.stars);
  if (!Number.isInteger(level) || level < 1 || level > 7 || !Number.isInteger(stars) || stars < 0 || stars > 3 || completed !== (stars > 0) || score < 0 || score > 10000) throw new Error("Invalid verified cuisine result");
  const rows = await tx.cuisineProgress.findMany({ where: { playerId } });
  if (Array.from({ length: level - 1 }, (_, i) => rows.some(row => row.level === i + 1 && row.stars >= 1)).some(ok => !ok)) throw new Error("Complete the preceding cuisines first");
  const prior = rows.find(row => row.level === level);
  const perfect = completed && Number(details.served) === Number(details.wanted) && Number(details.mistakes) === 0 && Number(details.burnt) === 0 && Number(details.precision) >= 95;
  await tx.cuisineProgress.upsert({
    where: { playerId_level: { playerId, level } },
    create: { playerId, level, stars, bestScore: score, completedRuns: completed ? 1 : 0, perfectRuns: perfect ? 1 : 0 },
    update: { stars: Math.max(stars, prior?.stars ?? 0), bestScore: Math.max(score, prior?.bestScore ?? 0), completedRuns: { increment: completed ? 1 : 0 }, perfectRuns: { increment: perfect ? 1 : 0 }, lastPlayedAt: new Date() },
  });
  const current = await tx.cuisineProgress.findMany({ where: { playerId } });
  return { firstCompletion: completed && !(prior?.completedRuns), previousBest: prior?.bestScore ?? 0,
    summary: { ...details, cuisinesCompleted: current.filter(row => row.stars > 0).length, cuisinesMastered: current.filter(row => row.stars === 3).length, totalStars: current.reduce((n, row) => n + row.stars, 0) } };
}

export async function getCuisineLeaderboard(db: PrismaClient, level: number) {
  const rows = await db.cuisineProgress.findMany({ where: { level, stars: { gt: 0 }, player: { OR: [{ bannedUntil: null }, { bannedUntil: { lte: new Date() } }] } }, orderBy: [{ bestScore: "desc" }, { stars: "desc" }, { playerId: "asc" }], take: 25, include: { player: { select: { displayName: true, avatarColor: true } } } });
  return rows.map((row, i) => ({ rank: i + 1, name: row.player.displayName, color: row.player.avatarColor, score: row.bestScore, stars: row.stars }));
}

/** Details of a player's most recent completed shifts, newest first, for replay goals. */
export async function getCuisineRunDetails(db: PrismaClient, playerId: string, limit = 500): Promise<unknown[]> {
  const rows = await db.matchParticipant.findMany({ where: { playerId, isWinner: true, match: { gameId: "cuisine-quest" } }, orderBy: { createdAt: "desc" }, take: limit, select: { details: true } });
  return rows.map(row => row.details);
}

/** Owner-only saved result, including the exact awards from its original commit. */
export async function getCuisineReceipt(db: PrismaClient, playerId: string, runId: string) {
  const row = await db.matchParticipant.findFirst({ where: { matchId: runId, playerId, match: { gameId: "cuisine-quest", visibility: "solo" } }, include: { match: { select: { durationMs: true } } } });
  if (!row) return null;
  const details = (row.details ?? {}) as Record<string, number | string>;
  const keys = typeof details.unlockedKeys === "string" ? details.unlockedKeys.split(",").filter(Boolean) : [];
  const stats = await db.playerGameStats.findUnique({ where: { playerId_gameId: { playerId, gameId: "cuisine-quest" } } });
  const now = new Date(); const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const today = await db.matchParticipant.findFirst({ where: { playerId, match: { gameId: "cuisine-quest", endedAt: { gte: since } } }, orderBy: { score: "desc" }, select: { score: true } });
  return { score: row.score, completed: row.isWinner, details, saved: true, earnedCoins: Number(details.coinsEarned ?? 0), unlocked: keys.map(key => ({ key, title: achievementByKey.get(key)?.title ?? key })), best: { best: stats?.bestScore ?? row.score, today: today?.score ?? row.score, played: stats?.gamesPlayed ?? 1 }, durationMs: row.match.durationMs };
}
