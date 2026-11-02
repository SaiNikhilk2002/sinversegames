import type { Metadata } from "next";
import Link from "next/link";
import { Crown } from "lucide-react";
import { GAMES, getGame, isGameId } from "@platform/shared";
import { getDailyBest, getDb, getLeaderboard, type LeaderboardMetric } from "@platform/db";
import { Avatar, Card, cn } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Top players across our games: all-time points and wins, best scores and today's daily leaderboards.",
  alternates: { canonical: "/leaderboard" },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ game?: string; by?: string }>;

interface Row {
  rank: number;
  playerId: string;
  name: string;
  color: string;
  level: number;
  cells: (string | number)[];
}

export default async function LeaderboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const gameId = isGameId(sp.game) ? sp.game : GAMES[0]!.id;
  const game = getGame(gameId);
  const solo = game.kind === "solo";
  // Multiplayer games rank by points or wins; single-player games by best score or today's best.
  const tabs = solo
    ? ([
        ["bestScore", "Best score"],
        ["today", "Today"],
      ] as const)
    : ([
        ["totalPoints", "Points"],
        ["wins", "Wins"],
      ] as const);
  const by = (tabs.find(([k]) => k === sp.by)?.[0] ?? tabs[0][0]) as LeaderboardMetric | "today";

  const db = getDb();
  let rows: Row[] | null = null;
  let headers: string[] = [];
  if (db) {
    try {
      if (by === "today") {
        headers = ["Score"];
        rows = (await getDailyBest(db, gameId, 25)).map((r) => ({ ...r, cells: [r.score.toLocaleString()] }));
      } else {
        const board = await getLeaderboard(db, gameId, by);
        headers = solo ? ["Played", "Best"] : ["Played", "Wins", "Points"];
        rows = board.map((r) => ({
          ...r,
          cells: solo ? [r.gamesPlayed, r.bestScore.toLocaleString()] : [r.gamesPlayed, r.wins, r.totalPoints.toLocaleString()],
        }));
      }
    } catch {
      rows = null;
    }
  }

  const tab = (href: string, active: boolean, label: string) => (
    <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("rounded-full px-4 py-2 text-sm font-semibold", active ? "bg-brand-gradient text-white" : "border border-line bg-surface text-ink-muted hover:text-ink")}>
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Leaderboard</h1>
      <p className="mt-2 text-ink-muted">
        {by === "today" ? "Today's best scores (UTC)" : "All-time rankings"} for {game.name}.
      </p>
      <nav aria-label="Game" className="mt-6 flex flex-wrap gap-2">
        {GAMES.map((g) => tab(`/leaderboard?game=${g.id}`, g.id === gameId, g.name))}
      </nav>
      <nav aria-label="Rank by" className="mt-3 flex flex-wrap gap-2">
        {tabs.map(([k, label]) => tab(`/leaderboard?game=${gameId}&by=${k}`, by === k, label))}
      </nav>

      <Card className="mt-6 overflow-hidden">
        {!rows ? (
          <p className="p-8 text-center text-ink-muted">The leaderboard is unavailable right now.</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-ink-muted">
            {by === "today" ? "No scores yet today." : "No ranked games yet."}{" "}
            <Link className="font-semibold text-brand-500 hover:underline" href={`/play/${game.slug}`}>
              Be the first!
            </Link>
          </p>
        ) : (
          <table className="w-full text-sm" data-testid="leaderboard-table">
            <thead className="bg-surface-2 text-left text-xs text-ink-muted uppercase">
              <tr>
                <th scope="col" className="px-4 py-3">
                  #
                </th>
                <th scope="col" className="px-4 py-3">
                  Player
                </th>
                {headers.map((h, i) => (
                  <th key={h} scope="col" className={cn("px-4 py-3 text-right", i === 0 && headers.length > 1 && "hidden sm:table-cell")}>
                    {h}
                  </th>
                ))}
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
                  {r.cells.map((c, i) => (
                    <td key={i} className={cn("px-4 py-3 text-right", i === r.cells.length - 1 && "font-bold", i === 0 && r.cells.length > 1 && "hidden sm:table-cell")}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
