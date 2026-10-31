import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export { PrismaClient };
export type * from "./generated/prisma/client";

const globalForDb = globalThis as unknown as { __platformDb?: PrismaClient | null };

/**
 * Returns the shared Prisma client, or null when DATABASE_URL is not
 * configured. Gameplay works without a database; persistence features
 * (profiles, stats, leaderboards) degrade gracefully.
 */
export function getDb(): PrismaClient | null {
  if (globalForDb.__platformDb !== undefined) return globalForDb.__platformDb;
  const url = process.env.DATABASE_URL;
  if (!url) {
    globalForDb.__platformDb = null;
    return null;
  }
  const adapter = new PrismaPg({
    connectionString: url,
    // Serverless-friendly pool: small, with short idle timeouts.
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
  });
  globalForDb.__platformDb = new PrismaClient({ adapter });
  return globalForDb.__platformDb;
}

export const isDbConfigured = (): boolean => !!process.env.DATABASE_URL;
