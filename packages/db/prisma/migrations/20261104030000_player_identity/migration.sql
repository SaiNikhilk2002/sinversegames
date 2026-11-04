-- Additive identity extension; no player IDs, wallet or progress rows are rewritten.
ALTER TABLE "Player" ADD COLUMN "username" VARCHAR(20), ADD COLUMN "usernameChangedAt" TIMESTAMP(3), ADD COLUMN "avatarKey" VARCHAR(128), ADD COLUMN "onboardingAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Player_username_key" ON "Player"("username");
ALTER TABLE "Player" ADD CONSTRAINT "Player_username_format" CHECK ("username" IS NULL OR ("username" = lower("username") AND "username" ~ '^[a-z0-9]+(_[a-z0-9]+)*$' AND char_length("username") BETWEEN 3 AND 20));
CREATE TABLE "ExternalIdentity" (
  "provider" VARCHAR(16) NOT NULL, "subject" VARCHAR(255) NOT NULL, "playerId" VARCHAR(64) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("provider","subject"),
  CONSTRAINT "ExternalIdentity_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExternalIdentity_playerId_provider_key" ON "ExternalIdentity"("playerId","provider");
CREATE TABLE "AccountSession" (
  "tokenHash" VARCHAR(64) NOT NULL PRIMARY KEY, "playerId" VARCHAR(64) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountSession_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AccountSession_playerId_expiresAt_idx" ON "AccountSession"("playerId","expiresAt");
CREATE TABLE "OAuthAttempt" (
  "stateHash" VARCHAR(64) NOT NULL PRIMARY KEY, "browserHash" VARCHAR(64) NOT NULL, "actorId" VARCHAR(64), "actorSessionHash" VARCHAR(64), "mode" VARCHAR(8) NOT NULL,
  "verifier" VARCHAR(128) NOT NULL, "nonce" VARCHAR(128) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3),
  CONSTRAINT "OAuthAttempt_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OAuthAttempt_expiresAt_idx" ON "OAuthAttempt"("expiresAt");
CREATE TABLE "IdentityRateLimit" ("key" VARCHAR(64) NOT NULL PRIMARY KEY, "count" INTEGER NOT NULL, "resetAt" TIMESTAMP(3) NOT NULL);
