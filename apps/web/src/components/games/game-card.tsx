import Link from "next/link";
import { Clock, Users } from "lucide-react";
import { GAME_CATEGORIES, type GameMeta } from "@platform/shared";
import { GameArt } from "../brand";
import { GAME_THEME } from "../game-theme";
import { cn } from "../ui/primitives";

export const playerRange = (g: GameMeta) => (g.kind === "solo" ? "Single player" : `${g.minPlayers}–${g.maxPlayers} players`);
const NEW_FOR_DAYS = 30;
export const isNew = (g: GameMeta, now = Date.now()) => now - Date.parse(g.addedAt) < NEW_FOR_DAYS * 86_400_000;
export const durationRange = (g: GameMeta) => `${g.avgDurationMinutes[0]}–${g.avgDurationMinutes[1]} min`;

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="rounded-md px-2 py-0.5 text-[11px] font-black tracking-wider text-[#17142b] uppercase shadow-[0_2px_0_rgb(0_0_0/0.35)]" style={{ background: color }}>
      {children}
    </span>
  );
}

/**
 * An art-first game tile: the cover fills the card (it already carries the
 * game's wordmark), with a strip in the game's own colours underneath.
 */
export function GameCard({ game, size = "md", className }: { game: GameMeta; size?: "md" | "lg"; className?: string }) {
  const theme = GAME_THEME[game.id];
  return (
    <Link
      href={`/games/${game.slug}`}
      aria-label={`${game.name} — ${game.tagline}`}
      style={{ "--accent": theme.accent } as React.CSSProperties}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[22px] border-2 border-white/5 bg-[#120f24] shadow-[0_12px_30px_-18px_rgb(0_0_0/0.9)] transition duration-300",
        "hover:-translate-y-1.5 hover:border-[var(--accent)] hover:shadow-[0_22px_44px_-20px_var(--accent)] focus-visible:border-[var(--accent)]",
        className,
      )}
    >
      <div className={cn("relative overflow-hidden", size === "lg" ? "aspect-[16/9]" : "aspect-[16/10]")}>
        <GameArt gameId={game.id} className="size-full transition duration-500 group-hover:scale-[1.05]" />
      </div>
      <div className="relative flex flex-1 flex-col gap-1.5 px-4 pt-3 pb-4" style={{ background: theme.deep }}>
        <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: theme.accent }} aria-hidden />
        <div className="flex items-center justify-between gap-3">
          <h3 className={cn("flex min-w-0 items-center gap-1.5 font-display font-black tracking-tight", size === "lg" ? "text-2xl" : "text-lg")} style={{ color: theme.ink }}>
            <span className="truncate">{game.name}</span>
            {isNew(game) && <Tag color="#2fd6a8">New</Tag>}
            {game.popular && <Tag color="#ffb23d">Hot</Tag>}
          </h3>
          <span className="rounded-full px-3 py-1 text-xs font-black text-[#17142b] transition group-hover:scale-105" style={{ background: theme.accent }}>
            PLAY
          </span>
        </div>
        {size === "lg" && <p className="line-clamp-2 text-sm" style={{ color: `${theme.ink}cc` }}>{game.tagline}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs font-semibold" style={{ color: `${theme.ink}b3` }}>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" /> {playerRange(game)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" /> {durationRange(game)}
          </span>
          <span className="truncate">{game.categories.map((c) => GAME_CATEGORIES[c]).slice(0, 2).join(" · ")}</span>
        </div>
      </div>
    </Link>
  );
}
