import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Star, Trophy } from "lucide-react";
import { brand, GAMES, getGame, isGameId } from "@platform/shared";
import { ACHIEVEMENTS, getDb, getProfile, levelForXp, xpForLevel } from "@platform/db";
import { GameArt } from "@/components/brand";
import { CreateProfile, RenameCard } from "@/components/play/rename-card";
import { Avatar, Badge, Card, cn } from "@/components/ui/primitives";
import { getSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Your profile", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) return <CreateProfile />;
  const db = getDb();
  const profile = db ? await getProfile(db, session.id).catch(() => null) : null;
  const xp = profile?.xp ?? 0;
  const level = levelForXp(xp);
  const nextAt = xpForLevel(level + 1);
  const progress = Math.min(1, (xp - xpForLevel(level)) / Math.max(1, nextAt - xpForLevel(level)));
  const totals = (profile?.stats ?? []).reduce((t, s) => ({ played: t.played + s.gamesPlayed, wins: t.wins + s.wins, points: t.points + s.totalPoints }), { played: 0, wins: 0, points: 0 });
  const unlocked = new Set(profile?.achievements.map((a) => a.achievementKey));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Card className="overflow-hidden">
        <div className="bg-brand-gradient h-24" />
        <div className="-mt-12 flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end">
          <Avatar name={session.name} color={session.color} size={96} className="border-4 border-surface" />
          <div className="flex-1">
            <h1 className="font-display text-3xl font-extrabold">{session.name}</h1>
            <p className="text-sm text-ink-muted">{session.kind === "guest" ? "Guest player" : "Player"} · Level {level}</p>
          </div>
          <div className="w-full sm:w-64">
            <div className="flex justify-between text-xs font-semibold text-ink-muted">
              <span>Level {level}</span>
              <span>
                {xp} / {nextAt} XP
              </span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next level">
              <div className="bg-brand-gradient h-full rounded-full" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        </div>
      </Card>

      {!db && (
        <p className="mt-6 rounded-2xl border border-sun/40 bg-sun/10 p-4 text-sm">
          Stats aren't available right now because the player database isn't connected. You can still play every game.
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {[
          { label: "Games played", value: totals.played },
          { label: "Wins", value: totals.wins },
          { label: "Losses", value: totals.played - totals.wins },
          { label: brand.rewardCurrencyName, value: profile?.rewardBalance ?? 0, icon: Star },
        ].map((s) => (
          <Card key={s.label} className="p-5">
            <p className="text-sm text-ink-muted">{s.label}</p>
            <p className="mt-1 flex items-center gap-2 font-display text-3xl font-extrabold">
              {s.icon && <s.icon className="size-6 fill-sun text-sun" aria-hidden />}
              {s.value.toLocaleString()}
            </p>
          </Card>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        {brand.rewardCurrencyName} are a just-for-fun reward for playing. They can't be bought, sold, transferred or exchanged, and have no monetary value.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="per-game">
          <h2 id="per-game" className="mb-4 font-display text-2xl font-bold">By game</h2>
          <div className="space-y-3">
            {GAMES.map((g) => {
              const s = profile?.stats.find((x) => x.gameId === g.id);
              const fav = profile?.favorites.some((f) => f.gameId === g.id);
              return (
                <Card key={g.id} className="flex items-center gap-4 p-3">
                  <GameArt gameId={g.id} className="h-14 w-20 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      {g.name} {fav && <Badge tone="hot">Favourite</Badge>}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {s ? `${s.gamesPlayed} played · ${s.wins} wins · ${s.totalPoints.toLocaleString()} pts · best ${s.bestScore}` : "Not played yet"}
                    </p>
                  </div>
                  <Link href={`/play/${g.slug}`} className="text-sm font-semibold text-brand-500 hover:underline">
                    Play
                  </Link>
                </Card>
              );
            })}
          </div>

          <h2 className="mt-10 mb-4 font-display text-2xl font-bold">Recent matches</h2>
          {profile?.participations.length ? (
            <ul className="space-y-2">
              {profile.participations.map((p) => (
                <li key={p.id}>
                  <Card className="flex items-center gap-3 p-3 text-sm">
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl font-display font-bold", p.isWinner ? "bg-sun/20 text-amber-600 dark:text-sun" : "bg-surface-2 text-ink-muted")}>
                      #{p.placement}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{isGameId(p.match.gameId) ? getGame(p.match.gameId).name : p.match.gameId}</p>
                      <p className="truncate text-ink-muted">vs {p.match.participants.filter((x) => x.playerId !== session.id).map((x) => x.displayName).join(", ")}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{p.score} pts</p>
                      <p className="text-xs text-ink-faint">{p.match.endedAt.toLocaleDateString()}</p>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-muted">No matches yet — finish a game and it will show up here.</p>
          )}
        </section>

        <div className="space-y-8">
          <RenameCard name={session.name} color={session.color} />
          <section aria-labelledby="achievements">
            <h2 id="achievements" className="mb-4 font-display text-2xl font-bold">Achievements</h2>
            <ul className="grid gap-2">
              {ACHIEVEMENTS.map((a) => {
                const got = unlocked.has(a.key);
                return (
                  <li key={a.key} className={cn("flex items-center gap-3 rounded-2xl border border-line p-3", got ? "bg-surface" : "bg-surface-2 opacity-70")}>
                    <span className={cn("flex size-10 items-center justify-center rounded-xl", got ? "bg-brand-gradient text-white" : "bg-surface-3 text-ink-faint")}>
                      {got ? <Trophy className="size-5" /> : <Lock className="size-4" />}
                    </span>
                    <div>
                      <p className="font-semibold">{a.title}</p>
                      <p className="text-xs text-ink-muted">{a.description}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
