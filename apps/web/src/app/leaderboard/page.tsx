import type { Metadata } from "next";
import Link from "next/link";
import { Crown } from "lucide-react";
import { GAMES, getGame, isGameId } from "@platform/shared";
import { getDb, getLeaderboard, type LeaderboardMetric } from "@platform/db";
import { Avatar, Card, cn } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Top players across our multiplayer games, ranked by points and wins.",
  alternates: { canonical: "/leaderboard" },
};
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ game?: string; by?: string }>;

export default async function LeaderboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const gameId = isGameId(sp.game) ? sp.game : GAMES[0]!.id;
  const metric: LeaderboardMetric = sp.by === "wins" ? "wins" : "totalPoints";
  const db = getDb();
  const rows = db ? await getLeaderboard(db, gameId, metric).catch(() => null) : null;

  const tab = (href: string, active: boolean, label: string) => (
    <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("rounded-full px-4 py-2 text-sm font-semibold", active ? "bg-brand-gradient text-white" : "border border-line bg-surface text-ink-muted hover:text-ink")}>
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Leaderboard</h1>
      <p className="mt-2 text-ink-muted">All-time rankings for {getGame(gameId).name}.</p>
      <nav aria-label="Game" className="mt-6 flex flex-wrap gap-2">
        {GAMES.map((g) => tab(`/leaderboard?game=${g.id}&by=${metric}`, g.id === gameId, g.name))}
      </nav>
      <nav aria-label="Rank by" className="mt-3 flex flex-wrap gap-2">
        {tab(`/leaderboard?game=${gameId}&by=totalPoints`, metric === "totalPoints", "Points")}
        {tab(`/leaderboard?game=${gameId}&by=wins`, metric === "wins", "Wins")}
      </nav>

      <Card className="mt-6 overflow-hidden">
        {!rows ? (
          <p className="p-8 text-center text-ink-muted">The leaderboard is unavailable right now.</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-ink-muted">
            No ranked matches yet. <Link className="font-semibold text-brand-500 hover:underline" href={`/play/${gameId}`}>Be the first!</Link>
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-ink-muted uppercase">
              <tr>
                <th scope="col" className="px-4 py-3">#</th>
                <th scope="col" className="px-4 py-3">Player</th>
                <th scope="col" className="hidden px-4 py-3 text-right sm:table-cell">Played</th>
                <th scope="col" className="px-4 py-3 text-right">Wins</th>
                <th scope="col" className="px-4 py-3 text-right">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.playerId}>
                  <td className="px-4 py-3 font-display font-bold">{r.rank === 1 ? <Crown className="size-5 text-sun" aria-label="1st" /> : r.rank}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      <Avatar name={r.name} color={r.color} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{r.name}</span>
                        <span className="text-xs text-ink-faint">Level {r.level}</span>
                      </span>
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-right sm:table-cell">{r.gamesPlayed}</td>
                  <td className="px-4 py-3 text-right">{r.wins}</td>
                  <td className="px-4 py-3 text-right font-bold">{r.totalPoints.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
