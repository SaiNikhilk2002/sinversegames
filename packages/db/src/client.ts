import { PrismaPg } from "@prisma/adapter-pg";
// "#prisma-client" is the Node client; the web app's Cloudflare build aliases it
// to the workerd variant (see apps/web/next.config.ts).
import { PrismaClient } from "#prisma-client";

export { PrismaClient };
export type * from "#prisma-client";

const globalForDb = globalThis as unknown as { __platformDb?: PrismaClient | null };

/**
 * Cloudflare Workers tie sockets to the request that opened them, so a pool
 * cached in a global breaks on the next request. There, every call gets its
 * own single-connection client; Workers close its socket when the request ends.
 */
const isWorkerd = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

function createClient(url: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: url,
    // Serverless-friendly pool: small, with short idle timeouts.
    max: isWorkerd ? 1 : Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 2_500,
    statement_timeout: 5_000,
    query_timeout: 6_000,
  });
  return new PrismaClient({ adapter });
}

/**
 * Returns a Prisma client, or null when DATABASE_URL is not configured.
 * Gameplay works without a database; persistence features (profiles, stats,
 * leaderboards) degrade gracefully.
 */
export function getDb(): PrismaClient | null {
  const url = process.env.DATABASE_URL;
  if (isWorkerd) return url ? createClient(url) : null;
  if (globalForDb.__platformDb !== undefined) return globalForDb.__platformDb;
  globalForDb.__platformDb = url ? createClient(url) : null;
  return globalForDb.__platformDb;
}

export const isDbConfigured = (): boolean => !!process.env.DATABASE_URL;
