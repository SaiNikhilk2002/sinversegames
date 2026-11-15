import { expect, test } from "@playwright/test";

/**
 * Health endpoints (docs/REALTIME_HEALTH_MONITORING.md): /api/health/live is the cheap target for
 * uptime monitors (no database query, no realtime call); /api/health is the readiness check that
 * reports each dependency and should be polled rarely.
 */
test("liveness answers without dependencies; readiness reports each one", async ({ request }) => {
  const live = await request.get("/api/health/live");
  expect(live.status()).toBe(200);
  expect(live.headers()["cache-control"]).toContain("no-store");
  expect(await live.json()).toEqual({ status: "ok", web: "ok" });

  const ready = await request.get("/api/health");
  expect([200, 503]).toContain(ready.status());
  const body = await ready.json();
  expect(body).toMatchObject({ web: "ok" });
  expect(["ok", "down", "disabled"]).toContain(body.database);
  expect(["ok", "down"]).toContain(body.realtime);
});
