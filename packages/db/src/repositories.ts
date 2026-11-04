import { COIN_REWARD_REASONS, COIN_RULES, type MatchResults } from "@platform/shared";
import type { PrismaClient } from "./generated/prisma/client";
import { ACHIEVEMENTS, levelForXp, REWARD_RULES, rewardsEnabled, XP_RULES } from "./progression";
import { lockPlayer } from "./wallet";

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export interface PlayerIdentity {
  id: string;
  name: string;
  color: string;
}

export async function upsertPlayer(db: PrismaClient, p: PlayerIdentity) {
  return db.player.upsert({
    where: { id: p.id },
    create: { id: p.id, displayName: p.name, avatarColor: p.color },
    update: { displayName: p.name, avatarColor: p.color, lastSeenAt: new Date() },
  });
}

/** Returns the ban expiry if the player is currently banned. */
export async function activeBan(db: PrismaClient, playerId: string): Promise<{ until: Date; reason: string | null } | null> {
  const p = await db.player.findUnique({ where: { id: playerId }, select: { bannedUntil: true, bannedReason: true } });
  if (!p?.bannedUntil || p.bannedUntil.getTime() <= Date.now()) return null;
  return { until: p.bannedUntil, reason: p.bannedReason };
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

export interface RecordMatchInput {
  /** Fixed match id. Single-player runs use their run token id, which makes each run recordable once. */
  id?: string;
  /** Single-player run: one entry is allowed. */
  solo?: boolean;
  results: MatchResults;
  roomCode: string;
  visibility: string;
  config: unknown;
  startedAt: number;
  players: PlayerIdentity[];
}

export interface RecordMatchOutput {
  matchId: string;
  unlocked: Record<string, string[]>;
  earned: Record<string, number>;
}

/**
 * Persists a finished match and updates aggregate stats, XP, rewards and
 * achievements atomically. Reward and achievement inserts are idempotent.
 */
export async function recordMatch(db: PrismaClient, input: RecordMatchInput): Promise<RecordMatchOutput | null> {
  const { results } = input;
  if (results.reason === "aborted" || results.entries.length < (input.solo ? 1 : 2)) return null;
  const grantRewards = rewardsEnabled();

  return db.$transaction(async (tx) => {
    for (const p of [...input.players].sort((a, b) => a.id.localeCompare(b.id))) {
      await tx.player.upsert({
        where: { id: p.id },
        create: { id: p.id, displayName: p.name, avatarColor: p.color },
        update: { lastSeenAt: new Date() },
      });
      await lockPlayer(tx, p.id);
    }

    const match = await tx.match.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        gameId: results.gameId,
        roomCode: input.roomCode,
        visibility: input.visibility,
        playerCount: results.entries.length,
        config: (input.config ?? {}) as object,
        endReason: results.reason,
        startedAt: new Date(input.startedAt),
        endedAt: new Date(results.endedAt),
        durationMs: Math.max(0, results.endedAt - input.startedAt),
        participants: {
          create: results.entries.map((e) => ({
            playerId: e.playerId,
            displayName: e.name,
            placement: e.placement,
            score: e.score,
            isWinner: e.isWinner,
            details: e.details ?? {},
          })),
        },
      },
    });

    const unlocked: Record<string, string[]> = {};
    const earnedCoins: Record<string, number> = {};
    for (const e of results.entries) {
      const prev = await tx.playerGameStats.findUnique({ where: { playerId_gameId: { playerId: e.playerId, gameId: results.gameId } } });
      await tx.playerGameStats.upsert({
        where: { playerId_gameId: { playerId: e.playerId, gameId: results.gameId } },
        create: {
          playerId: e.playerId,
          gameId: results.gameId,
          gamesPlayed: 1,
          wins: e.isWinner ? 1 : 0,
          losses: e.isWinner ? 0 : 1,
          totalPoints: e.score,
          bestScore: e.score,
        },
        update: {
          gamesPlayed: { increment: 1 },
          wins: { increment: e.isWinner ? 1 : 0 },
          losses: { increment: e.isWinner ? 0 : 1 },
          totalPoints: { increment: e.score },
          bestScore: Math.max(prev?.bestScore ?? 0, e.score),
          lastPlayedAt: new Date(),
        },
      });

      const player = await tx.player.findUniqueOrThrow({ where: { id: e.playerId }, select: { xp: true } });
      const xp = player.xp + XP_RULES.matchPlayed + (e.isWinner ? XP_RULES.matchWon : 0);
      await tx.player.update({ where: { id: e.playerId }, data: { xp, level: levelForXp(xp) } });

      const stats = await tx.playerGameStats.findMany({ where: { playerId: e.playerId } });
      const have = new Set(
        (await tx.playerAchievement.findMany({ where: { playerId: e.playerId }, select: { achievementKey: true } })).map((a) => a.achievementKey),
      );
      const fresh = ACHIEVEMENTS.filter(
        (a) => !have.has(a.key) && a.unlocked(stats, { gameId: results.gameId, score: e.score, isWinner: e.isWinner, details: e.details ?? {} }),
      ).map((a) => a.key);
      if (fresh.length) {
        await tx.playerAchievement.createMany({
          data: fresh.map((key) => ({ playerId: e.playerId, achievementKey: key })),
          skipDuplicates: true,
        });
        unlocked[e.playerId] = fresh;
      }
      const eligible = results.reason === "completed" && match.durationMs >= COIN_RULES.minimumDurationMs && e.score > 0 && (!input.solo || e.isWinner);
      if (grantRewards && eligible) {
        const now = new Date();
        const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const until = new Date(since.getTime() + 86_400_000);
        const earned = await tx.rewardLedgerEntry.aggregate({
          where: { playerId: e.playerId, amount: { gt: 0 }, reason: { in: [...COIN_REWARD_REASONS] }, createdAt: { gte: since, lt: until } }, _sum: { amount: true },
        });
        let remaining = Math.max(0, COIN_RULES.dailyCap - (earned._sum.amount ?? 0));
        const grants = [
          { amount: REWARD_RULES.matchPlayed, reason: "match_played", refType: "match", refId: match.id },
          ...(e.isWinner ? [{ amount: REWARD_RULES.matchWon, reason: "match_won", refType: "match", refId: match.id }] : []),
          ...(prev && prev.bestScore > 0 && e.score > prev.bestScore ? [{ amount: COIN_RULES.personalBest, reason: "personal_best", refType: "match", refId: match.id }] : []),
          ...fresh.map((key) => ({ amount: COIN_RULES.achievement, reason: "achievement", refType: "achievement", refId: key })),
        ];
        for (const grant of grants) {
          const amount = Math.min(grant.amount, remaining);
          if (!amount) break;
          await tx.rewardLedgerEntry.create({ data: { ...grant, amount, playerId: e.playerId, createdAt: now } });
          earnedCoins[e.playerId] = (earnedCoins[e.playerId] ?? 0) + amount;
          remaining -= amount;
        }
      }
    }
    return { matchId: match.id, unlocked, earned: earnedCoins };
  }, { maxWait: 5_000, timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Profiles & leaderboards
// ---------------------------------------------------------------------------

export async function getProfile(db: PrismaClient, playerId: string) {
  const player = await db.player.findUnique({
    where: { id: playerId },
    include: {
      stats: true,
      achievements: { orderBy: { unlockedAt: "desc" } },
      favorites: true,
      inventory: true,
      equipment: true,
      participations: {
        orderBy: { createdAt: "desc" },
        take: 15,
        include: { match: { include: { participants: { orderBy: { placement: "asc" } } } } },
      },
    },
  });
  if (!player) return null;
  const balance = await db.rewardLedgerEntry.aggregate({ where: { playerId }, _sum: { amount: true } });
  return { ...player, rewardBalance: balance._sum.amount ?? 0 };
}

export type LeaderboardMetric = "totalPoints" | "wins" | "bestScore";

export async function getLeaderboard(db: PrismaClient, gameId: string, metric: LeaderboardMetric = "totalPoints", limit = 25) {
  const rows = await db.playerGameStats.findMany({
    where: { gameId, gamesPlayed: { gt: 0 }, player: { OR: [{ bannedUntil: null }, { bannedUntil: { lte: new Date() } }] } },
    orderBy: [{ [metric]: "desc" }, { gamesPlayed: "asc" }, { playerId: "asc" }],
    take: Math.min(100, limit),
    include: { player: { select: { displayName: true, avatarColor: true, level: true } } },
  });
  return rows.map((r, i) => ({
    rank: i + 1,
    playerId: r.playerId,
    name: r.player.displayName,
    color: r.player.avatarColor,
    level: r.player.level,
    gamesPlayed: r.gamesPlayed,
    wins: r.wins,
    totalPoints: r.totalPoints,
    bestScore: r.bestScore,
  }));
}

/** Best single score per player today (UTC), for single-player daily leaderboards. */
export async function getDailyBest(db: PrismaClient, gameId: string, limit = 25, now = new Date()) {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const until = new Date(since.getTime() + 86_400_000);
  const count = Math.max(1, Math.min(100, Math.floor(limit)));
  // Deduplicate before limiting: one prolific player must not crowd others
  // out of an arbitrary 500-row pre-sample. Ties use first achievement then ID.
  const best = await db.$queryRaw<{ playerId: string; displayName: string; avatarColor: string; level: number; score: number; details: unknown }[]>`
    SELECT best.* FROM (
      SELECT DISTINCT ON (mp."playerId") mp."playerId", p."displayName", p."avatarColor", p."level", mp."score", mp."details", mp."createdAt"
      FROM "MatchParticipant" mp JOIN "Match" m ON m."id" = mp."matchId" JOIN "Player" p ON p."id" = mp."playerId"
      WHERE m."gameId" = ${gameId} AND m."endedAt" >= ${since} AND m."endedAt" < ${until}
        AND (p."bannedUntil" IS NULL OR p."bannedUntil" <= ${now})
      ORDER BY mp."playerId", mp."score" DESC, mp."createdAt" ASC, mp."id" ASC
    ) best ORDER BY best."score" DESC, best."createdAt" ASC, best."playerId" ASC LIMIT ${count}`;
  return best.map((r, i) => ({
    rank: i + 1,
    playerId: r.playerId,
    name: r.displayName,
    color: r.avatarColor,
    level: r.level,
    score: r.score,
    details: (r.details ?? {}) as Record<string, number | string>,
  }));
}

/** Best score for one player in one game (all-time and today). */
export async function getPersonalBest(db: PrismaClient, playerId: string, gameId: string, now = new Date()) {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [stats, today] = await Promise.all([
    db.playerGameStats.findUnique({ where: { playerId_gameId: { playerId, gameId } }, select: { bestScore: true, gamesPlayed: true } }),
    db.matchParticipant.findFirst({ where: { playerId, match: { gameId, endedAt: { gte: since } } }, orderBy: { score: "desc" }, select: { score: true } }),
  ]);
  return { best: stats?.bestScore ?? 0, played: stats?.gamesPlayed ?? 0, today: today?.score ?? 0 };
}

export async function toggleFavorite(db: PrismaClient, playerId: string, gameId: string): Promise<boolean> {
  const existing = await db.favoriteGame.findUnique({ where: { playerId_gameId: { playerId, gameId } } });
  if (existing) {
    await db.favoriteGame.delete({ where: { playerId_gameId: { playerId, gameId } } });
    return false;
  }
  await db.favoriteGame.create({ data: { playerId, gameId } });
  return true;
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

export const REPORT_REASONS = ["cheating", "harassment", "offensive-name", "offensive-drawing", "spam", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export async function createReport(
  db: PrismaClient,
  input: { reporterId: string; targetPlayerId?: string; roomCode?: string; gameId?: string; reason: ReportReason; details?: string },
) {
  // Unknown target ids are stored as null rather than failing the report.
  const target = input.targetPlayerId
    ? await db.player.findUnique({ where: { id: input.targetPlayerId }, select: { id: true } })
    : null;
  return db.abuseReport.create({
    data: {
      reporterId: input.reporterId,
      targetPlayerId: target?.id ?? null,
      roomCode: input.roomCode ?? null,
      gameId: input.gameId ?? null,
      reason: input.reason,
      details: input.details ?? null,
    },
  });
}

export async function listReports(db: PrismaClient, status: "OPEN" | "RESOLVED" | "DISMISSED" = "OPEN") {
  return db.abuseReport.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      reporter: { select: { displayName: true } },
      target: { select: { displayName: true, bannedUntil: true } },
    },
  });
}

export async function resolveReport(db: PrismaClient, id: string, status: "RESOLVED" | "DISMISSED", note?: string) {
  return db.abuseReport.update({ where: { id }, data: { status, resolutionNote: note ?? null, resolvedAt: new Date() } });
}

export async function banPlayer(db: PrismaClient, playerId: string, hours: number, reason: string, actor: string) {
  const until = new Date(Date.now() + hours * 3600_000);
  await db.$transaction([
    db.player.update({ where: { id: playerId }, data: { bannedUntil: until, bannedReason: reason } }),
    db.moderationAction.create({ data: { playerId, action: "BAN", reason, actor, expiresAt: until } }),
  ]);
  return until;
}

export async function unbanPlayer(db: PrismaClient, playerId: string, actor: string) {
  await db.$transaction([
    db.player.update({ where: { id: playerId }, data: { bannedUntil: null, bannedReason: null } }),
    db.moderationAction.create({ data: { playerId, action: "UNBAN", actor } }),
  ]);
}

export async function platformCounts(db: PrismaClient) {
  const since = new Date(Date.now() - 24 * 3600_000);
  const [players, matches, matches24h, openReports] = await Promise.all([
    db.player.count(),
    db.match.count(),
    db.match.count({ where: { endedAt: { gte: since } } }),
    db.abuseReport.count({ where: { status: "OPEN" } }),
  ]);
  return { players, matches, matches24h, openReports };
}
