import Link from "next/link";
import { Clock, Users } from "lucide-react";
import { GAME_CATEGORIES, type GameMeta } from "@platform/shared";
import { GameArt } from "../brand";
import { Badge, cn } from "../ui/primitives";

export const playerRange = (g: GameMeta) => (g.kind === "solo" ? "Single player" : `${g.minPlayers}–${g.maxPlayers} players`);
const NEW_FOR_DAYS = 30;
export const isNew = (g: GameMeta, now = Date.now()) => now - Date.parse(g.addedAt) < NEW_FOR_DAYS * 86_400_000;
export const durationRange = (g: GameMeta) => `${g.avgDurationMinutes[0]}–${g.avgDurationMinutes[1]} min`;

export function GameCard({ game, size = "md", className }: { game: GameMeta; size?: "md" | "lg"; className?: string }) {
  return (
    <Link
      href={`/games/${game.slug}`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-card transition duration-300",
        "hover:-translate-y-1 hover:border-brand-400/60 hover:shadow-[0_24px_48px_-24px_rgb(124_92_255/0.55)]",
        className,
      )}
    >
      <div className={cn("relative overflow-hidden", size === "lg" ? "aspect-[16/9]" : "aspect-[16/10]")}>
        <GameArt gameId={game.id} className="size-full object-cover transition duration-500 group-hover:scale-[1.04]" />
        <div className="absolute top-3 left-3 flex gap-1.5">
          {game.featured && <Badge className="border-white/30 bg-black/45 text-white backdrop-blur">Featured</Badge>}
          {game.popular && <Badge className="border-white/30 bg-black/45 text-white backdrop-blur">🔥 Popular</Badge>}
          {isNew(game) && <Badge className="border-white/30 bg-black/45 text-white backdrop-blur">✨ New</Badge>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className={cn("font-display font-bold tracking-tight", size === "lg" ? "text-2xl" : "text-xl")}>{game.name}</h3>
          <span className="rounded-full bg-brand-gradient px-3 py-1 text-xs font-bold text-white opacity-90 transition group-hover:opacity-100">Play</span>
        </div>
        <p className="line-clamp-2 text-sm text-ink-muted">{game.tagline}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 text-xs font-medium text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-3.5" /> {playerRange(game)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5" /> {durationRange(game)}
          </span>
          <span>{game.categories.map((c) => GAME_CATEGORIES[c]).slice(0, 2).join(" · ")}</span>
        </div>
      </div>
    </Link>
  );
}
