import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Star, Trophy } from "lucide-react";
import { brand, GAMES, getGame, isGameId } from "@platform/shared";
import { ACHIEVEMENTS, getDb, getProfile, levelForXp, xpForLevel } from "@platform/db";
import { GameArt } from "@/components/brand";
import { GAME_THEME } from "@/components/game-theme";
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
      <Card className="overflow-hidden border-2">
        {/* Banner: a strip of the game covers */}
        <div className="flex h-28 overflow-hidden" aria-hidden>
          {GAMES.map((g) => (
            <GameArt key={g.id} gameId={g.id} className="h-full w-auto shrink-0 opacity-70" />
          ))}
        </div>
        <div className="-mt-12 flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end">
          <div className="relative w-fit">
            <Avatar name={session.name} color={session.color} size={96} className="border-4 border-surface" />
            <span className="absolute -right-2 -bottom-1 grid size-10 place-items-center rounded-xl border-[3px] border-surface bg-[#ffb23d] font-display text-lg font-black text-[#17142b]" aria-label={`Level ${level}`}>
              {level}
            </span>
          </div>
          <div className="flex-1">
            <h1 className="font-display text-3xl font-black">{session.name}</h1>
            <p className="text-sm text-ink-muted">
              {session.kind === "guest" ? "Guest player" : "Player"} · Level {level} · {unlocked.size}/{ACHIEVEMENTS.length} achievements
            </p>
          </div>
          <div className="w-full sm:w-64">
            <div className="flex justify-between text-xs font-semibold text-ink-muted">
              <span>Level {level}</span>
              <span>
                {xp} / {nextAt} XP
              </span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next level">
              <div className="h-full rounded-full bg-[#ffb23d] shadow-[0_0_10px_#ffb23d]" style={{ width: `${progress * 100}%` }} />
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
          <Card key={s.label} className="border-2 p-5">
            <p className="text-xs font-black tracking-[0.2em] text-ink-muted uppercase">{s.label}</p>
            <p className="mt-1 flex items-center gap-2 font-mono text-3xl font-black tabular-nums">
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
                <Card key={g.id} className="flex items-center gap-4 border-2 p-3" style={{ borderLeftColor: GAME_THEME[g.id].accent, borderLeftWidth: 5 }}>
                  <GameArt gameId={g.id} className="h-14 w-[5.6rem] shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      {g.name} {fav && <Badge tone="hot">Favourite</Badge>}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {s ? `${s.gamesPlayed} played · ${s.wins} wins · ${s.totalPoints.toLocaleString()} pts · best ${s.bestScore}` : "Not played yet"}
                    </p>
                  </div>
                  <Link href={`/play/${g.slug}`} className="rounded-full px-3 py-1 text-xs font-black text-[#17142b]" style={{ background: GAME_THEME[g.id].accent }}>
                    PLAY
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
                      {p.match.visibility === "solo" ? (p.isWinner ? "✓" : "–") : `#${p.placement}`}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{isGameId(p.match.gameId) ? getGame(p.match.gameId).name : p.match.gameId}</p>
                      <p className="truncate text-ink-muted">
                        {p.match.visibility === "solo"
                          ? soloSummary(p.details as Record<string, string | number> | null, p.isWinner)
                          : `vs ${p.match.participants.filter((x) => x.playerId !== session.id).map((x) => x.displayName).join(", ")}`}
                      </p>
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
            <div className="mb-4 flex items-end justify-between gap-3">
              <h2 id="achievements" className="font-display text-2xl font-bold">
                Achievements
              </h2>
              <span className="text-sm font-bold text-ink-muted">
                {unlocked.size} / {ACHIEVEMENTS.length}
              </span>
            </div>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-[#2fd6a8]" style={{ width: `${(unlocked.size / Math.max(1, ACHIEVEMENTS.length)) * 100}%` }} />
            </div>
            <ul className="grid gap-2">
              {ACHIEVEMENTS.map((a, i) => {
                const got = unlocked.has(a.key);
                const medal = ["#ffb23d", "#2fd6a8", "#ff4f8b", "#3d8bff", "#c04dff"][i % 5]!;
                return (
                  <li key={a.key} className={cn("flex items-center gap-3 rounded-2xl border-2 p-3", got ? "bg-surface" : "border-dashed bg-surface-2 opacity-60")} style={got ? { borderColor: medal } : undefined}>
                    <span
                      className={cn("relative grid size-11 shrink-0 place-items-center rounded-full border-[3px]", got ? "text-[#17142b]" : "border-line text-ink-faint")}
                      style={got ? { background: medal, borderColor: "#17142b", boxShadow: `0 3px 0 #17142b, 0 0 14px ${medal}88` } : undefined}
                    >
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

/** One-line description of a single-player run for the match history. */
function soloSummary(d: Record<string, string | number> | null, completed: boolean): string {
  const parts: string[] = [];
  if (d?.level) parts.push(`Level ${d.level}`);
  if (d?.stars !== undefined) parts.push(`${"★".repeat(Number(d.stars))}${"☆".repeat(3 - Number(d.stars))}`);
  if (typeof d?.layout === "string") parts.push(d.layout.charAt(0).toUpperCase() + d.layout.slice(1));
  if (d?.draw) parts.push(`Draw ${d.draw}`);
  parts.push(completed ? "Completed" : "Not finished");
  return `Solo · ${parts.join(" · ")}`;
}
