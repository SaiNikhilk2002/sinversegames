-- CreateEnum
CREATE TYPE "PlayerKind" AS ENUM ('GUEST', 'REGISTERED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "Player" (
    "id" VARCHAR(64) NOT NULL,
    "displayName" VARCHAR(32) NOT NULL,
    "avatarColor" VARCHAR(16) NOT NULL,
    "kind" "PlayerKind" NOT NULL DEFAULT 'GUEST',
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "bannedUntil" TIMESTAMP(3),
    "bannedReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerGameStats" (
    "playerId" VARCHAR(64) NOT NULL,
    "gameId" VARCHAR(32) NOT NULL,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerGameStats_pkey" PRIMARY KEY ("playerId","gameId")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" UUID NOT NULL,
    "gameId" VARCHAR(32) NOT NULL,
    "roomCode" VARCHAR(16) NOT NULL,
    "visibility" VARCHAR(16) NOT NULL,
    "playerCount" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "endReason" VARCHAR(32) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchParticipant" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "playerId" VARCHAR(64) NOT NULL,
    "displayName" VARCHAR(32) NOT NULL,
    "placement" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "isWinner" BOOLEAN NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerAchievement" (
    "playerId" VARCHAR(64) NOT NULL,
    "achievementKey" VARCHAR(64) NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerAchievement_pkey" PRIMARY KEY ("playerId","achievementKey")
);

-- CreateTable
CREATE TABLE "RewardLedgerEntry" (
    "id" UUID NOT NULL,
    "playerId" VARCHAR(64) NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" VARCHAR(64) NOT NULL,
    "refType" VARCHAR(32),
    "refId" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FavoriteGame" (
    "playerId" VARCHAR(64) NOT NULL,
    "gameId" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteGame_pkey" PRIMARY KEY ("playerId","gameId")
);

-- CreateTable
CREATE TABLE "AbuseReport" (
    "id" UUID NOT NULL,
    "reporterId" VARCHAR(64) NOT NULL,
    "targetPlayerId" VARCHAR(64),
    "roomCode" VARCHAR(16),
    "gameId" VARCHAR(32),
    "reason" VARCHAR(32) NOT NULL,
    "details" VARCHAR(1000),
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "AbuseReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" UUID NOT NULL,
    "playerId" VARCHAR(64) NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(500),
    "actor" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerGameStats_gameId_totalPoints_idx" ON "PlayerGameStats"("gameId", "totalPoints" DESC);

-- CreateIndex
CREATE INDEX "PlayerGameStats_gameId_wins_idx" ON "PlayerGameStats"("gameId", "wins" DESC);

-- CreateIndex
CREATE INDEX "Match_gameId_endedAt_idx" ON "Match"("gameId", "endedAt" DESC);

-- CreateIndex
CREATE INDEX "MatchParticipant_playerId_createdAt_idx" ON "MatchParticipant"("playerId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MatchParticipant_matchId_playerId_key" ON "MatchParticipant"("matchId", "playerId");

-- CreateIndex
CREATE INDEX "RewardLedgerEntry_playerId_createdAt_idx" ON "RewardLedgerEntry"("playerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RewardLedgerEntry_playerId_reason_refId_key" ON "RewardLedgerEntry"("playerId", "reason", "refId");

-- CreateIndex
CREATE INDEX "AbuseReport_status_createdAt_idx" ON "AbuseReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationAction_playerId_createdAt_idx" ON "ModerationAction"("playerId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlayerGameStats" ADD CONSTRAINT "PlayerGameStats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerAchievement" ADD CONSTRAINT "PlayerAchievement_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardLedgerEntry" ADD CONSTRAINT "RewardLedgerEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteGame" ADD CONSTRAINT "FavoriteGame_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbuseReport" ADD CONSTRAINT "AbuseReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbuseReport" ADD CONSTRAINT "AbuseReport_targetPlayerId_fkey" FOREIGN KEY ("targetPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
