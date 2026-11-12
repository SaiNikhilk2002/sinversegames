import type { Metadata } from "next";
import Link from "next/link";
import { GameArt } from "@/components/brand";
import { GAME_THEME } from "@/components/game-theme";
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
  username?:string|null;avatarKey?:string|null;
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

  const theme = GAME_THEME[gameId];
  const medal = ["#ffc83d", "#cfd6e4", "#e0975a"];
  const tab = (href: string, active: boolean, label: string) => (
    <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("rounded-full px-4 py-2 text-sm font-bold", active ? "text-[#17142b]" : "border border-white/15 opacity-75 hover:opacity-100")} style={active ? { background: theme.accent } : undefined}>
      {label}
    </Link>
  );

  return (
    <div>
      <section className="relative overflow-hidden border-b border-white/10" style={{ background: theme.deep, color: theme.ink }}>
        <div className="pointer-events-none absolute inset-0 opacity-25" aria-hidden>
          <GameArt gameId={gameId} className="size-full scale-125 blur-2xl" />
        </div>
        <div className="relative mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <p className="text-xs font-semibold tracking-[0.3em] uppercase opacity-70">Leaderboard</p>
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{game.name}</h1>
          <p className="mt-1 opacity-80">{by === "today" ? "Today's best scores (UTC)" : "All-time rankings"}</p>
          <nav aria-label="Game" className="scrollbar-none -mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1">
            {GAMES.map((g) => (
              <Link
                key={g.id}
                href={`/leaderboard?game=${g.id}`}
                aria-current={g.id === gameId ? "page" : undefined}
                aria-label={g.name}
                className={cn("w-24 shrink-0 overflow-hidden rounded-xl border transition", g.id === gameId ? "scale-105" : "border-transparent opacity-55 hover:opacity-100")}
                style={{ borderColor: g.id === gameId ? GAME_THEME[g.id].accent : undefined }}
              >
                <GameArt gameId={g.id} className="block aspect-[16/10] w-full" />
              </Link>
            ))}
          </nav>
          <nav aria-label="Rank by" className="mt-4 flex flex-wrap gap-2">
            {tabs.map(([k, label]) => tab(`/leaderboard?game=${gameId}&by=${k}`, by === k, label))}
          </nav>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {rows && rows.length > 0 && (
        <ol className="mb-6 grid grid-cols-3 items-end gap-3" aria-label="Top three">
          {[rows[1], rows[0], rows[2]].map((r, slot) =>
            r ? (
              <li key={r.playerId} className="flex flex-col items-center rounded-2xl border bg-surface p-3 text-center" style={{ borderColor: medal[r.rank - 1], paddingTop: r.rank === 1 ? 20 : 12 }}>
                <span className="grid size-8 place-items-center rounded-full font-display text-sm font-semibold text-[#17142b]" style={{ background: medal[r.rank - 1] }}>
                  {r.rank}
                </span>
                <Avatar name={r.name} color={r.color} avatarKey={r.avatarKey} size={r.rank === 1 ? 56 : 44} className="mt-2" />
                <p className="mt-1 max-w-full truncate text-sm font-bold">{r.name}</p>
                {r.username&&<p className="max-w-full truncate text-xs text-ink-muted">@{r.username}</p>}
                <p className="font-display text-lg font-semibold tabular-nums">{r.cells[r.cells.length - 1]}</p>
              </li>
            ) : (
              <li key={slot} />
            ),
          )}
        </ol>
      )}
      <Card className="overflow-hidden border">
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
                  <td className="px-4 py-3 font-display font-semibold">
                    {r.rank <= 3 ? (
                      <span className="grid size-7 place-items-center rounded-full text-xs text-[#17142b]" style={{ background: medal[r.rank - 1] }} aria-label={r.rank === 1 ? "1st" : `${r.rank}`}>
                        {r.rank === 1 ? <Crown className="size-3.5" /> : r.rank}
                      </span>
                    ) : (
                      r.rank
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      <Avatar name={r.name} color={r.color} avatarKey={r.avatarKey} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{r.name}</span>
                        {r.username&&<span className="block truncate text-xs text-ink-muted">@{r.username}</span>}
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
    </div>
  );
}
