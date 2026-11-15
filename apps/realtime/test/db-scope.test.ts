import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Request-scoped database clients on Cloudflare Workers (docs/DATABASE_CONNECTION_OPTIMIZATION.md).
 * OpenNext runs every request inside an AsyncLocalStorage and exposes the store on a global symbol;
 * these tests install the same mechanism to check that one request reuses one client and that no
 * two requests ever share one.
 */
const SCOPE = Symbol.for("__cloudflare-context__");
const als = new AsyncLocalStorage<object>();
const installScope = () =>
  Object.defineProperty(globalThis, SCOPE, { configurable: true, get: () => als.getStore() });
afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[SCOPE];
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});
const tick = () => new Promise((r) => setTimeout(r, Math.random() * 5));

describe("scopedClient", () => {
  it("returns one client per scope, a new one per call without a scope", async () => {
    const { scopedClient } = await import("@platform/db");
    const cache = new WeakMap<object, { n: number }>();
    let made = 0;
    const create = () => ({ n: ++made });
    const a = {}, b = {};
    expect(scopedClient(a, cache, create)).toBe(scopedClient(a, cache, create));
    expect(scopedClient(a, cache, create)).not.toBe(scopedClient(b, cache, create));
    expect(scopedClient(undefined, cache, create)).not.toBe(scopedClient(undefined, cache, create));
    expect(made).toBe(4);
  });

  it("keeps 50 concurrent requests on 50 separate clients, each reused across its awaits", async () => {
    installScope();
    const { requestScope, scopedClient } = await import("@platform/db");
    const cache = new WeakMap<object, { request: number }>();
    const seen = await Promise.all(
      Array.from({ length: 50 }, (_, request) =>
        als.run({ env: {}, ctx: {}, cf: undefined }, async () => {
          const clients = [];
          for (let k = 0; k < 4; k++) {
            await tick();
            clients.push(scopedClient(requestScope(), cache, () => ({ request })));
          }
          return clients;
        }),
      ),
    );
    for (const [request, clients] of seen.entries()) {
      expect(new Set(clients).size).toBe(1);
      expect(clients[0]!.request).toBe(request);
    }
    expect(new Set(seen.map((c) => c[0])).size).toBe(50);
  });
});

describe("getDb on Workers", () => {
  it("gives a request one client (it used to give one per call), and a fresh one to every other request", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    // Never connected: creating a client doesn't open a connection.
    vi.stubEnv("DATABASE_URL", "postgresql://user:password@127.0.0.1:1/never_used_test");
    installScope();
    const { getDb } = await import("@platform/db");
    const [one, two] = await Promise.all(
      [0, 1].map(() =>
        als.run({ env: {}, ctx: {} }, async () => {
          const first = getDb();
          await tick();
          const second = getDb();
          expect(first).not.toBeNull();
          expect(second).toBe(first);
          return first;
        }),
      ),
    );
    expect(one).not.toBe(two);
    // Outside a request (a build or prerender), every call still gets its own client, as before.
    expect(getDb()).not.toBe(getDb());
  });

  it("still returns null without DATABASE_URL, and one shared client on Node", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    vi.stubEnv("DATABASE_URL", "");
    installScope();
    const workerd = await import("@platform/db");
    expect(als.run({}, () => workerd.getDb())).toBeNull();
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubEnv("DATABASE_URL", "postgresql://user:password@127.0.0.1:1/never_used_test");
    (globalThis as { __platformDb?: unknown }).__platformDb = undefined;
    const node = await import("@platform/db");
    expect(node.getDb()).toBe(node.getDb());
    (globalThis as { __platformDb?: unknown }).__platformDb = undefined;
  });
});
