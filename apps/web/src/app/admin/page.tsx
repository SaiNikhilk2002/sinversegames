import type { Metadata } from "next";
import { getDb, listReports, platformCounts } from "@platform/db";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { adminConfigured, isAdmin, realtimeAdmin } from "@/lib/server/admin";
import { banAction, closeRoomAction, logout, moderateReport, unbanAction } from "./actions";
import { AdminLogin } from "./login-form";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface RealtimeMetrics {
  uptimeSeconds: number;
  connections: number;
  connectionsTotal: number;
  rejectedConnections: number;
  rateLimited: number;
  errors: number;
  database: string;
  memoryMb: number;
  rooms: number;
  playing: number;
  players: number;
  matchesCompleted: number;
  queues: Record<string, number>;
  byGame: Record<string, { rooms: number; playing: number; players: number }>;
  list: { code: string; gameId: string; visibility: string; status: string; players: number; connected: number; lastActivityAt: number }[];
}

export default async function AdminPage() {
  if (!adminConfigured()) {
    return <p className="mx-auto max-w-md px-4 py-20 text-center text-ink-muted">The admin area is disabled. Set ADMIN_TOKEN to enable it.</p>;
  }
  if (!(await isAdmin())) return <AdminLogin />;

  const db = getDb();
  const [metrics, counts, reports] = await Promise.all([
    realtimeAdmin<RealtimeMetrics>("/admin/metrics"),
    db ? platformCounts(db).catch(() => null) : null,
    db ? listReports(db).catch(() => []) : [],
  ]);

  const stat = (label: string, value: string | number, tone?: "danger" | "ok") => (
    <Card className="p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${tone === "danger" ? "text-danger" : tone === "ok" ? "text-mint" : ""}`}>{value}</p>
    </Card>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-extrabold">Admin</h1>
        <form action={logout}>
          <Button type="submit" variant="secondary" size="sm">
            Sign out
          </Button>
        </form>
      </div>

      <section>
        <h2 className="mb-3 font-display text-xl font-bold">System status</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {stat("Game server", metrics ? "Online" : "Unreachable", metrics ? "ok" : "danger")}
          {stat("Database", db ? (counts ? "Online" : "Error") : "Not configured", db && counts ? "ok" : "danger")}
          {stat("Connections", metrics?.connections ?? "–")}
          {stat("Active rooms", metrics?.rooms ?? "–")}
          {stat("Games in progress", metrics?.playing ?? "–")}
          {stat("Matches (since boot)", metrics?.matchesCompleted ?? "–")}
          {stat("Rate-limited events", metrics?.rateLimited ?? "–", metrics?.rateLimited ? "danger" : undefined)}
          {stat("Rejected connections", metrics?.rejectedConnections ?? "–")}
          {stat("Server errors", metrics?.errors ?? "–", metrics?.errors ? "danger" : undefined)}
          {stat("Memory", metrics ? `${metrics.memoryMb} MB` : "–")}
          {stat("Players (all time)", counts?.players ?? "–")}
          {stat("Matches (24h)", counts?.matches24h ?? "–")}
        </div>
        {metrics && (
          <p className="mt-3 text-sm text-ink-muted">
            Uptime {Math.round(metrics.uptimeSeconds / 60)} min · Matchmaking queues:{" "}
            {Object.entries(metrics.queues)
              .map(([g, n]) => `${g} ${n}`)
              .join(", ")}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl font-bold">Open reports {reports.length > 0 && <Badge tone="hot">{reports.length}</Badge>}</h2>
        {reports.length === 0 ? (
          <p className="text-ink-muted">No open reports.</p>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone="sun">{r.reason}</Badge>
                  <span>
                    <strong>{r.reporter.displayName}</strong> reported <strong>{r.target?.displayName ?? "unknown player"}</strong>
                  </span>
                  {r.roomCode && <span className="font-mono text-ink-faint">#{r.roomCode}</span>}
                  <span className="ml-auto text-xs text-ink-faint">{r.createdAt.toLocaleString()}</span>
                </div>
                {r.details && <p className="mt-2 rounded-xl bg-surface-2 p-3 text-sm">{r.details}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={moderateReport}>
                    <input type="hidden" name="reportId" value={r.id} />
                    <input type="hidden" name="action" value="resolve" />
                    <Button type="submit" size="sm" variant="secondary">Resolve</Button>
                  </form>
                  <form action={moderateReport}>
                    <input type="hidden" name="reportId" value={r.id} />
                    <input type="hidden" name="action" value="dismiss" />
                    <Button type="submit" size="sm" variant="ghost">Dismiss</Button>
                  </form>
                  {r.targetPlayerId && (
                    r.target?.bannedUntil && r.target.bannedUntil > new Date() ? (
                      <form action={unbanAction}>
                        <input type="hidden" name="playerId" value={r.targetPlayerId} />
                        <Button type="submit" size="sm" variant="secondary">Lift ban</Button>
                      </form>
                    ) : (
                      [24, 24 * 7].map((h) => (
                        <form key={h} action={banAction}>
                          <input type="hidden" name="playerId" value={r.targetPlayerId!} />
                          <input type="hidden" name="hours" value={h} />
                          <input type="hidden" name="reason" value={`Report: ${r.reason}`} />
                          <Button type="submit" size="sm" variant="danger">Ban {h === 24 ? "24h" : "7 days"}</Button>
                        </form>
                      ))
                    )
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl font-bold">Live rooms</h2>
        {!metrics?.list.length ? (
          <p className="text-ink-muted">No active rooms.</p>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs text-ink-muted uppercase">
                <tr>
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Game</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Players</th>
                  <th className="px-4 py-2">Last activity</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {metrics.list.map((r) => (
                  <tr key={r.code}>
                    <td className="px-4 py-2 font-mono">{r.code}</td>
                    <td className="px-4 py-2">{r.gameId} <span className="text-ink-faint">({r.visibility})</span></td>
                    <td className="px-4 py-2">{r.status}</td>
                    <td className="px-4 py-2">{r.connected}/{r.players}</td>
                    <td className="px-4 py-2">{new Date(r.lastActivityAt).toLocaleTimeString()}</td>
                    <td className="px-4 py-2 text-right">
                      <form action={closeRoomAction}>
                        <input type="hidden" name="code" value={r.code} />
                        <Button type="submit" size="sm" variant="ghost">Close</Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
