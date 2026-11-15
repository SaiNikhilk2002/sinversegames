import Link from "next/link";
import { Coffee, Heart, House, PartyPopper, Sparkles, Trophy, User, Users, type LucideIcon } from "lucide-react";
import { gamesInCategory, visibleCategories, type DiscoveryCategory, type DiscoveryCategoryId } from "@platform/shared";
import { GameArt } from "../brand";
import { cn } from "../ui/primitives";

export const CATEGORY_ICON: Record<DiscoveryCategory["icon"], LucideIcon> = {
  users: Users,
  user: User,
  heart: Heart,
  "party-popper": PartyPopper,
  house: House,
  sparkles: Sparkles,
  trophy: Trophy,
  coffee: Coffee,
};
/** Couples has its own landing page; every other category uses /categories/<slug>. */
export const categoryHref = (c: DiscoveryCategory) => c.href ?? `/categories/${c.slug}`;

/**
 * Category navigation: "All games" plus every visible category that has games
 * (docs/GAME_CATEGORY_DISCOVERY.md). Scrolls sideways on narrow screens.
 */
export function CategoryNav({ active }: { active?: DiscoveryCategoryId | "all" }) {
  const pill = (key: string, href: string, label: string, Icon: LucideIcon | null, on: boolean) => (
    <Link
      key={key}
      href={href}
      aria-current={on ? "page" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        on ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink",
      )}
    >
      {Icon && <Icon className="size-4" aria-hidden />}
      {label}
    </Link>
  );
  return (
    <nav aria-label="Game categories" className="-mx-4 overflow-x-auto px-4 pb-1" data-testid="category-nav">
      <div className="flex w-max gap-2">
        {pill("all", "/games", "All games", null, active === "all")}
        {visibleCategories().map((c) => pill(c.id, categoryHref(c), c.name, CATEGORY_ICON[c.icon], active === c.id))}
      </div>
    </nav>
  );
}

/** Category tiles for the homepage: name, line, game count and a cover from the category. */
export function CategoryTiles() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="category-tiles">
      {visibleCategories().map((c) => {
        const games = gamesInCategory(c.id);
        const Icon = CATEGORY_ICON[c.icon];
        return (
          <Link key={c.id} href={categoryHref(c)} className="group relative flex min-h-36 flex-col justify-end overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-line-strong">
            <div className="pointer-events-none absolute inset-0 opacity-25 transition-opacity group-hover:opacity-40" aria-hidden>
              <GameArt gameId={games[0]!.id} className="size-full" />
            </div>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface via-surface/70 to-transparent" aria-hidden />
            <Icon className="relative size-5" aria-hidden />
            <span className="relative mt-2 font-display text-lg font-semibold">{c.name}</span>
            <span className="relative text-xs text-ink-muted">
              {games.length} {games.length === 1 ? "game" : "games"} · {c.description}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
