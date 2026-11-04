-- Additive: preserve every existing reward entry and balance one-for-one.
CREATE TABLE "CosmeticInventory" (
  "playerId" VARCHAR(64) NOT NULL,
  "itemId" VARCHAR(64) NOT NULL,
  "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CosmeticInventory_pkey" PRIMARY KEY ("playerId", "itemId"),
  CONSTRAINT "CosmeticInventory_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CosmeticEquipment" (
  "playerId" VARCHAR(64) NOT NULL,
  "category" VARCHAR(32) NOT NULL,
  "itemId" VARCHAR(64) NOT NULL,
  CONSTRAINT "CosmeticEquipment_pkey" PRIMARY KEY ("playerId", "category"),
  CONSTRAINT "CosmeticEquipment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CosmeticEquipment_playerId_itemId_fkey" FOREIGN KEY ("playerId", "itemId") REFERENCES "CosmeticInventory"("playerId", "itemId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RewardLedgerEntry_playerId_createdAt_id_idx" ON "RewardLedgerEntry"("playerId", "createdAt" DESC, "id" DESC);
