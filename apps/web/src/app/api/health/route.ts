import { NextResponse } from "next/server";
import { getDb } from "@platform/db";

export const dynamic = "force-dynamic";

/**
 * Public readiness check: reports only up/down per dependency, never internals. It runs a database
 * query and calls the realtime service, so poll it no more than every 5 minutes or so: a frequent
 * poller keeps Neon awake around the clock. Uptime monitors should use /api/health/live, or the
 * realtime service's /health (docs/REALTIME_HEALTH_MONITORING.md).
 */
export async function GET() {
  const db = getDb();
  const [database, realtime] = await Promise.all([
    db
      ? db.$queryRaw`SELECT 1`.then(() => "ok" as const).catch(() => "down" as const)
      : Promise.resolve("disabled" as const),
    fetch(`${process.env.REALTIME_INTERNAL_URL ?? process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4200"}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    })
      .then((r) => (r.ok ? ("ok" as const) : ("down" as const)))
      .catch(() => "down" as const),
  ]);
  const ok = database !== "down" && realtime === "ok";
  return NextResponse.json({ status: ok ? "ok" : "degraded", web: "ok", database, realtime }, { status: ok ? 200 : 503 });
}
