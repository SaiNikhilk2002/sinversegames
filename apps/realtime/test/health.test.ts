import { afterEach, describe, expect, it } from "vitest";
import { testConfig } from "../src/config";
import type { Persistence } from "../src/persistence";
import { createRealtimeServer, type RealtimeServer } from "../src/server";
import { seededRng } from "@platform/engines";

/**
 * The realtime service's /health is the cheap target for uptime monitors
 * (docs/REALTIME_HEALTH_MONITORING.md): process and HTTP liveness, with no database query, so
 * polling it can't keep Neon's compute awake.
 */
let server: RealtimeServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

describe("realtime health", () => {
  it("answers /health and / without touching the database", async () => {
    const calls: string[] = [];
    const persistence: Persistence = {
      enabled: true,
      recordMatch: async () => (calls.push("recordMatch"), null),
      isBanned: async () => (calls.push("isBanned"), false),
      healthy: async () => (calls.push("healthy"), true),
    };
    server = createRealtimeServer({ config: testConfig({ ADMIN_TOKEN: "admin-token-admin-token" }), persistence, rng: seededRng(1) });
    const port = await server.listen(0, "127.0.0.1");
    for (const path of ["/health", "/"]) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const body = (await res.json()) as { status: string; uptimeSeconds: number };
      expect(body.status).toBe("ok");
      expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(Object.keys(body).sort()).toEqual(["status", "uptimeSeconds"]);
    }
    expect(calls).toEqual([]);
    // The admin metrics do check the database, and need the admin token.
    expect((await fetch(`http://127.0.0.1:${port}/admin/metrics`)).status).toBe(401);
    const metrics = await fetch(`http://127.0.0.1:${port}/admin/metrics`, { headers: { authorization: "Bearer admin-token-admin-token" } });
    expect(metrics.status).toBe(200);
    expect(((await metrics.json()) as { database: string; cricketVerification: unknown }).database).toBe("ok");
    expect(calls).toEqual(["healthy"]);
  });
});
