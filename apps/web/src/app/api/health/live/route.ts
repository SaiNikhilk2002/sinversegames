import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness for uptime monitors: the Worker is up and serving. It touches neither the database nor
 * the realtime service, so frequent polling can't keep Neon's compute awake (its Free plan has 100
 * compute-hours a month). For dependency readiness use /api/health, at most every 5 minutes or so
 * (docs/REALTIME_HEALTH_MONITORING.md).
 */
export function GET() {
  return NextResponse.json({ status: "ok", web: "ok" }, { headers: { "cache-control": "no-store" } });
}
