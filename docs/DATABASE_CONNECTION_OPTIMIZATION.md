# Database connections on Workers: one client per request

**Implemented locally:** commit `a861588` (`packages/db/src/client.ts`). There's no schema change, no Hyperdrive, and Node (Railway, tests) is unchanged.

## What happened before

- On workerd, `getDb()` created **a new `PrismaClient` with its own `pg` pool on every call**. A cached pool can't be reused across Worker requests, because sockets belong to the request that opened them.
- Each client opens its own TCP + TLS + Postgres connection to Neon's pooler on its first query.
- There are 30 `getDb()` call sites in 22 web files. `getSession()` (`lib/server/session.ts`) calls it on most requests, and routes call it again.

**Verified for a cricket result submission:**
- `getSession()` creates one client to look up the account session or guest player;
- `/api/solo/submit` creates another for the duplicate check and `recordMatch`;
- so **two clients, two connections.**

(Commit `afe2289` had already merged the route's own two calls into one.) Pages that read the session plus other data opened more.

## What happens now

- **The request scope.** OpenNext runs every request inside an `AsyncLocalStorage`. Its store, a **new object per request** (`{ env, ctx, cf }`), is exposed on the global `Symbol.for("__cloudflare-context__")`. This is in `@opennextjs/cloudflare` 1.20.14, `dist/cli/templates/init.js`, which `getCloudflareContext()` also reads.
- **Keyed by that object.** `getDb()` reads that object and keeps **one client per request** in a `WeakMap` keyed by it:
  - The same request reuses its client.
  - Another request, even a concurrent one on the same isolate, gets its own.
  - When the request ends, its client is garbage with its scope; Workers close the sockets as before.
- **Outside a request** (build, prerender), there's no scope, so every call gets its own client, exactly as before.
- **Pool size.**
  - The per-request pool is `max: 2`, where it used to be 1 per client. `pg` opens a second connection only if two queries are genuinely in flight at once, so normally there's one.
  - The second slot rules out deadlock if code ever queries through `getDb()` while a transaction holds the first connection. An audit found no such code: every `$transaction` callback uses its `tx`. But the margin is cheap.

## Correctness requirements

| Requirement | How it holds |
|---|---|
| No global mutable transaction state | Transactions are `db.$transaction(cb)` scoped to the callback, unchanged. Only the client is shared, within one request |
| No cross-request or cross-user leakage | The cache key is the per-request ALS store object. Requests never share it. A test runs 50 concurrent "requests" through the same mechanism: each reuses one client across its awaits, and all 50 are distinct |
| No stale wallet or session reads | Prisma has no query cache; every query goes to the database. No result is cached |
| No stale match writes | `recordMatch` is unchanged (one transaction, row locks, unique match id) |
| Worker compatibility | Only reads a global property, with a safe fallback if it's absent. No new import from OpenNext |
| Cleanup | The same as before: sockets close with the request. The `WeakMap` releases the client |

## Tests

`apps/realtime/test/db-scope.test.ts` (4 tests, in `pnpm test`):
- `scopedClient` keys by scope;
- 50 concurrent scoped requests stay isolated;
- `getDb()` under a simulated Workers runtime (navigator user agent, plus OpenNext's ALS getter) returns one client per request and distinct clients across requests, and still a new one per call outside a request;
- null without `DATABASE_URL`; one shared client on Node.

These reproduce OpenNext's mechanism in Node. **They don't run inside real workerd.** The Linux OpenNext build passes (final report), but the per-request behaviour on Cloudflare should be confirmed after deploy: Neon's connection count per request in its monitoring, or no change in error rates.

## Effect

- **Connections:** one per request, not one per call site. That's half the connection set-ups for a result submission, and fewer still for pages that read the session and other data.
- **Speed:** each saved set-up is a TCP + TLS + authentication handshake to Neon, a few round trips (milliseconds with smart placement), plus the client construction's CPU on the Worker.
- **Neon CU-hours:** unchanged. Compute is awake while anything queries; this reduces connections, not wake time.
