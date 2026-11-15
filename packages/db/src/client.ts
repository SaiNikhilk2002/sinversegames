import { PrismaPg } from "@prisma/adapter-pg";
// "#prisma-client" is the Node client; the web app's Cloudflare build aliases it
// to the workerd variant (see apps/web/next.config.ts).
import { PrismaClient } from "#prisma-client";

export { PrismaClient };
export type * from "#prisma-client";

const globalForDb = globalThis as unknown as { __platformDb?: PrismaClient | null };

/**
 * Cloudflare Workers tie sockets to the request that opened them, so a pool
 * cached in a global breaks on the next request. There, each request gets its
 * own client (see {@link getDb}); Workers close its sockets when the request ends.
 */
const isWorkerd = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

/**
 * The current request's scope on Workers: OpenNext runs every request inside an AsyncLocalStorage
 * and exposes its store, a fresh object per request, on this global (see
 * @opennextjs/cloudflare's cli/templates/init.js). Undefined outside a request (build, prerender).
 */
const REQUEST_SCOPE = Symbol.for("__cloudflare-context__");
export const requestScope = (): object | undefined => {
  const scope = (globalThis as Record<symbol, unknown>)[REQUEST_SCOPE];
  return scope && typeof scope === "object" ? scope : undefined;
};
const requestClients = new WeakMap<object, PrismaClient>();

/**
 * One client per request scope, created on first use. A scope is never shared between requests,
 * so no connection, transaction or query result crosses from one request (or player) to another,
 * and the WeakMap lets the client go with its request. Without a scope, a new client every call.
 */
export function scopedClient<T extends object>(scope: object | undefined, cache: WeakMap<object, T>, create: () => T): T {
  if (!scope) return create();
  let client = cache.get(scope);
  if (!client) {
    client = create();
    cache.set(scope, client);
  }
  return client;
}

function createClient(url: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: url,
    // Serverless-friendly pool: small, with short idle timeouts. On Workers the client serves one
    // request: one connection normally, a second only if two queries are in flight at once.
    max: isWorkerd ? 2 : Number(process.env.DATABASE_POOL_MAX ?? 5),
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
  // Workers: one client per request (it used to be one per call: two or more connections a request).
  if (isWorkerd) return url ? scopedClient(requestScope(), requestClients, () => createClient(url)) : null;
  if (globalForDb.__platformDb !== undefined) return globalForDb.__platformDb;
  globalForDb.__platformDb = url ? createClient(url) : null;
  return globalForDb.__platformDb;
}

export const isDbConfigured = (): boolean => !!process.env.DATABASE_URL;
