import { brand, type GameId } from "@platform/shared";
import { GameCover } from "./covers";
import { cn } from "./ui/primitives";

/**
 * Platform mark: an ink tile with a two-tone "S" swirl and a spark — the
 * arcade-cabinet coin slot read as a letter. The wordmark comes from brand config.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="11" fill="#17142b" />
      <rect x="1.5" y="1.5" width="37" height="37" rx="9.5" fill="none" stroke="#2e2a52" strokeWidth="1.5" />
      <path d="M27 12.5 C 24 9.5, 14.5 9.5, 13.5 15 C 12.6 20, 27.4 19.8, 26.5 25.5 C 25.6 31, 15.5 31, 12.5 27.5" fill="none" stroke="#ff4f8b" strokeWidth="4.6" strokeLinecap="round" />
      <path d="M27 12.5 C 24 9.5, 14.5 9.5, 13.5 15" fill="none" stroke="#ffb23d" strokeWidth="4.6" strokeLinecap="round" />
      <path d="M31 7.5 l1 2.6 l2.6 1 l-2.6 1 l-1 2.6 l-1 -2.6 l-2.6 -1 l2.6 -1z" fill="#2fd6a8" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-[19px] font-semibold tracking-[-0.02em]">{brand.name}</span>
    </span>
  );
}

/** A game's cover art (see covers.tsx), used for every thumbnail on the site. */
export function GameArt({ gameId, className }: { gameId: GameId; className?: string }) {
  return <GameCover gameId={gameId} className={className} />;
}
