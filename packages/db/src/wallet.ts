import { getCosmetic, type CosmeticCategory } from "@platform/shared";
import type { Prisma, PrismaClient } from "./generated/prisma/client";

export class WalletError extends Error {
  constructor(readonly code: "UNKNOWN_ITEM" | "INSUFFICIENT_FUNDS" | "NOT_OWNED" | "NO_PLAYER") {
    super({ UNKNOWN_ITEM: "That item is not in the store.", INSUFFICIENT_FUNDS: "You need more Sin Coins for this item.", NOT_OWNED: "Unlock this item before equipping it.", NO_PLAYER: "Create a player profile first." }[code]);
  }
}

/** Every ledger/stats/inventory writer locks the same player row first. */
export async function lockPlayer(tx: Prisma.TransactionClient, playerId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Player" WHERE "id" = ${playerId} FOR UPDATE`;
  if (!rows.length) throw new WalletError("NO_PLAYER");
}

export const walletBalance = async (db: Pick<Prisma.TransactionClient, "rewardLedgerEntry">, playerId: string) =>
  (await db.rewardLedgerEntry.aggregate({ where: { playerId }, _sum: { amount: true } }))._sum.amount ?? 0;

export async function getWallet(db: PrismaClient, playerId: string, cursor?: string) {
  // Repeatable snapshot: history, ownership and balance reflect the same commit.
  return db.$transaction(async (tx) => {
    const [balance, inventory, equipment, transactions] = await Promise.all([
      walletBalance(tx, playerId),
      tx.cosmeticInventory.findMany({ where: { playerId }, orderBy: [{ acquiredAt: "desc" }, { itemId: "asc" }] }),
      tx.cosmeticEquipment.findMany({ where: { playerId }, orderBy: { category: "asc" } }),
      tx.rewardLedgerEntry.findMany({
        where: { playerId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    ]);
    return { balance, inventory, equipment, transactions: transactions.slice(0, 20), nextCursor: transactions.length > 20 ? transactions[19]!.id : null };
  }, { isolationLevel: "RepeatableRead" });
}

/** A repeated purchase returns ownership without a second debit. */
export async function purchaseCosmetic(db: PrismaClient, playerId: string, itemId: string) {
  const item = getCosmetic(itemId);
  if (!item) throw new WalletError("UNKNOWN_ITEM");
  return db.$transaction(async (tx) => {
    await lockPlayer(tx, playerId);
    const owned = await tx.cosmeticInventory.findUnique({ where: { playerId_itemId: { playerId, itemId } } });
    const balance = await walletBalance(tx, playerId);
    if (owned) return { purchased: false, balance };
    if (balance < item.price) throw new WalletError("INSUFFICIENT_FUNDS");
    await tx.rewardLedgerEntry.create({ data: { playerId, amount: -item.price, reason: "cosmetic_purchase", refType: "cosmetic", refId: item.id } });
    await tx.cosmeticInventory.create({ data: { playerId, itemId } });
    return { purchased: true, balance: balance - item.price };
  });
}

export async function equipCosmetic(db: PrismaClient, playerId: string, category: CosmeticCategory, itemId: string | null) {
  const item = itemId ? getCosmetic(itemId) : undefined;
  if (itemId && (!item || item.category !== category)) throw new WalletError("UNKNOWN_ITEM");
  return db.$transaction(async (tx) => {
    await lockPlayer(tx, playerId);
    if (!itemId) {
      await tx.cosmeticEquipment.deleteMany({ where: { playerId, category } });
      return;
    }
    const owned = await tx.cosmeticInventory.findUnique({ where: { playerId_itemId: { playerId, itemId } } });
    if (!owned) throw new WalletError("NOT_OWNED");
    await tx.cosmeticEquipment.upsert({ where: { playerId_category: { playerId, category } }, create: { playerId, category, itemId }, update: { itemId } });
  });
}
