-- Additive campaign state. Existing players, outcomes and ledgers are unchanged.
CREATE TABLE "CuisineProgress" (
  "playerId" VARCHAR(64) NOT NULL,
  "level" INTEGER NOT NULL,
  "stars" INTEGER NOT NULL DEFAULT 0,
  "bestScore" INTEGER NOT NULL DEFAULT 0,
  "completedRuns" INTEGER NOT NULL DEFAULT 0,
  "perfectRuns" INTEGER NOT NULL DEFAULT 0,
  "lastPlayedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CuisineProgress_pkey" PRIMARY KEY ("playerId", "level"),
  CONSTRAINT "CuisineProgress_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CuisineProgress_level_check" CHECK ("level" BETWEEN 1 AND 7),
  CONSTRAINT "CuisineProgress_stars_check" CHECK ("stars" BETWEEN 0 AND 3),
  CONSTRAINT "CuisineProgress_score_check" CHECK ("bestScore" BETWEEN 0 AND 10000)
);
CREATE INDEX "CuisineProgress_level_bestScore_playerId_idx" ON "CuisineProgress"("level", "bestScore" DESC, "playerId");
