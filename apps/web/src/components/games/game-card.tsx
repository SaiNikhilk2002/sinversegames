import Link from "next/link";
import { Clock, Play, Users } from "lucide-react";
import { GAME_CATEGORIES, type GameMeta } from "@platform/shared";
import { GameArt } from "../brand";
import { GAME_THEME } from "../game-theme";
import { cn } from "../ui/primitives";

export const playerRange = (g: GameMeta) => (g.kind === "solo" ? "Single player" : `${g.minPlayers}–${g.maxPlayers} players`);
const NEW_FOR_DAYS = 30;
export const isNew = (g: GameMeta, now = Date.now()) => now - Date.parse(g.addedAt) < NEW_FOR_DAYS * 86_400_000;
export const durationRange = (g: GameMeta) => `${g.avgDurationMinutes[0]}–${g.avgDurationMinutes[1]} min`;

/**
 * The game tile. The cover art leads: it carries the game's own wordmark and
 * world, so the text below stays quiet. Hover lifts the card a little, eases
 * the art in and reveals the play cue; on touch screens the cue is always shown.
 */
export function GameCard({ game, size = "md", className, fill }: { game: GameMeta; size?: "md" | "lg"; className?: string; fill?: boolean }) {
  const theme = GAME_THEME[game.id];
  const category = game.categories.map((c) => GAME_CATEGORIES[c])[0];
  return (
    <Link
      href={`/games/${game.slug}`}
      aria-label={`${game.name} — ${game.tagline}`}
      style={{ "--accent": theme.accent } as React.CSSProperties}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card",
        "transition-[transform,box-shadow,border-color] duration-300 ease-out",
        "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift focus-visible:-translate-y-0.5 active:translate-y-0 active:duration-100",
        className,
      )}
    >
      <div className={cn("relative overflow-hidden", size === "lg" ? "aspect-[16/9]" : "aspect-[16/10]")} style={{ background: theme.deep }}>
        <GameArt gameId={game.id} className="size-full transition-transform duration-700 ease-out group-hover:scale-[1.035]" />
        {/* A soft floor under the art so the play cue reads on any cover. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 [@media(hover:none)]:opacity-100" />
        <span
          className={cn(
            "absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#0f0f1a] shadow-sm",
            "translate-y-1 opacity-0 transition duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100",
            "[@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100",
          )}
          aria-hidden
        >
          <Play className="size-3 fill-current" /> Play
        </span>
      </div>
      <div className={cn("flex flex-1 flex-col px-4 pt-3.5 pb-4", fill && "sm:px-6 sm:pt-5 sm:pb-6")}>
        <div className="flex items-center gap-2">
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: theme.accent }} aria-hidden />
          <h3 className={cn("min-w-0 truncate font-display font-semibold tracking-tight", size === "lg" ? "text-xl" : "text-[17px]")}>{game.name}</h3>
        </div>
        <p className={cn("mt-1 text-sm text-ink-muted", size === "lg" ? "line-clamp-2" : "line-clamp-1")}>{game.tagline}</p>
        {/* A tall feature cell gets the game's own pitch, not stretched art. */}
        {fill && <p className="mt-3 line-clamp-4 hidden text-sm leading-relaxed text-ink-muted lg:block">{game.longDescription[0]}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-ink-faint">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden /> {playerRange(game)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden /> {durationRange(game)}
          </span>
          {category && <span className="truncate">{category}</span>}
          {isNew(game) && <span className="font-medium text-mint">New</span>}
        </div>
        {fill && (
          <span className="mt-5 hidden w-fit items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#0f0f1a] transition-[filter] group-hover:brightness-105 lg:inline-flex" style={{ background: theme.accent }} aria-hidden>
            <Play className="size-3.5 fill-current" /> Play {game.name}
          </span>
        )}
      </div>
    </Link>
  );
}
