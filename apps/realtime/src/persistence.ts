import { activeBan, getDb, recordMatch, type RecordMatchInput } from "@platform/db";
import type { Logger } from "./logger";
import { errorFields } from "./logger";

/**
 * What the realtime server needs from storage. Active match state is never
 * written here — only finished results and moderation lookups.
 */
export interface Persistence {
  readonly enabled: boolean;
  recordMatch(input: RecordMatchInput): Promise<{ unlocked: Record<string, string[]>; earned?: Record<string, number> } | null>;
  isBanned(playerId: string): Promise<boolean>;
  healthy(): Promise<boolean>;
}

export const noopPersistence: Persistence = {
  enabled: false,
  recordMatch: async () => null,
  isBanned: async () => false,
  healthy: async () => true,
};

export function createDbPersistence(logger: Logger): Persistence {
  const db = getDb();
  if (!db) {
    logger.warn("DATABASE_URL not set — match results will not be persisted");
    return noopPersistence;
  }
  // Ban lookups happen on every connection; cache them briefly.
  const banCache = new Map<string, { banned: boolean; at: number }>();
  return {
    enabled: true,
    async recordMatch(input) {
      // Retry transient failures; results are small and the insert is atomic.
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          return await recordMatch(db, input);
        } catch (err) {
          // A previous attempt may have committed before the connection failed.
          // The stable server UUID identifies that exact match; no new rewards
          // or unlock notifications should be emitted for a duplicate insert.
          if (input.id && (err as { code?: string }).code === "P2002") {
            const existing = await db.match.findUnique({ where: { id: input.id }, select: { gameId: true } });
            if (existing?.gameId === input.results.gameId) return { unlocked: {}, earned: {} };
          }
          logger.error("recordMatch failed", { attempt, gameId: input.results.gameId, room: input.roomCode, ...errorFields(err) });
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
      return null;
    },
    async isBanned(playerId) {
      const hit = banCache.get(playerId);
      if (hit && Date.now() - hit.at < 60_000) return hit.banned;
      try {
        const banned = !!(await activeBan(db, playerId));
        banCache.set(playerId, { banned, at: Date.now() });
        return banned;
      } catch (err) {
        logger.error("ban lookup failed", errorFields(err));
        return false; // fail open: a DB outage must not lock everyone out
      }
    },
    async healthy() {
      try {
        await db.$queryRaw`SELECT 1`;
        return true;
      } catch {
        return false;
      }
    },
  };
}
