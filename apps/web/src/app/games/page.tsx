import type { Metadata } from "next";
import Link from "next/link";
import { Search, SearchX } from "lucide-react";
import { GAME_CATEGORIES, GAMES, type GameCategory } from "@platform/shared";
import { GameCard } from "@/components/games/game-card";
import { RecentlyPlayed } from "@/components/games/recently-played";
import { Button, ButtonLink, EmptyState, cn } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "All games",
  description: "Browse free browser games: cooking, puzzle, card, board, arcade and party games you can play instantly, solo or with friends.",
  alternates: { canonical: "/games" },
};

type SearchParams = Promise<{ q?: string; category?: string; sort?: string; type?: string }>;

// "popular" sorts by the editorial flags in the registry, so it is labelled as a pick, not a measure.
const SORTS = { popular: "Featured", new: "Newest", name: "A–Z" } as const;
const TYPES = { all: "All", multiplayer: "Multiplayer", solo: "Single player" } as const;

export default async function GamesPage({ searchParams }: { searchParams: SearchParams }) {
  const { q = "", category = "", sort = "popular", type = "all" } = await searchParams;
  const sortKey = (sort in SORTS ? sort : "popular") as keyof typeof SORTS;
  const typeKey = (type in TYPES ? type : "all") as keyof typeof TYPES;
  const query = q.trim().toLowerCase().slice(0, 60);
  const cat = category in GAME_CATEGORIES ? (category as GameCategory) : null;

  const results = GAMES.filter((g) => {
    if (cat && !g.categories.includes(cat)) return false;
    if (typeKey !== "all" && g.kind !== typeKey) return false;
    if (!query) return true;
    return [g.name, g.tagline, g.description, ...g.keywords].join(" ").toLowerCase().includes(query);
  }).sort((a, b) =>
    sortKey === "name"
      ? a.name.localeCompare(b.name)
      : sortKey === "new"
        ? b.addedAt.localeCompare(a.addedAt) || a.name.localeCompare(b.name)
        : Number(b.popular) - Number(a.popular) || Number(b.featured) - Number(a.featured) || b.addedAt.localeCompare(a.addedAt),
  );

  const href = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const merged = { q: query || null, category: cat, sort: sortKey === "popular" ? null : sortKey, type: typeKey === "all" ? null : typeKey, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return `/games${params.size ? `?${params}` : ""}`;
  };
  const pill = (key: string, label: string, active: boolean, to: string) => (
    <Link
      key={key}
      href={to}
      aria-current={active ? "true" : undefined}
      className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", active ? "bg-surface-3 text-ink shadow-sm" : "text-ink-muted hover:text-ink")}
    >
      {label}
    </Link>
  );

  const chip = (key: string | null, label: string) => {
    const active = (key ?? null) === cat;
    return (
      <Link
        key={label}
        href={href({ category: key })}
        aria-current={active ? "true" : undefined}
        className={cn(
          "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
          active ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink",
        )}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="page-x pt-10 pb-4 sm:pt-14">
      <header className="sg-page">
        <p className="type-eyebrow mb-3">Catalogue</p>
        <h1 className="type-title">All games</h1>
        <p className="type-lead mt-2">Every game is free and runs in your browser, with no downloads and no sign-up.</p>
      </header>
      <div className="mt-8">
        <RecentlyPlayed title="Recently played" />
      </div>

      <div className="sticky top-16 z-20 -mx-4 mt-10 border-b border-line bg-bg/85 px-4 py-4 backdrop-blur-xl sm:-mx-6 sm:px-6 xl:-mx-8 xl:px-8">
        <form id="search" method="get" role="search" className="flex max-w-xl scroll-mt-28 gap-2">
          {cat && <input type="hidden" name="category" value={cat} />}
          {sortKey !== "popular" && <input type="hidden" name="sort" value={sortKey} />}
          {typeKey !== "all" && <input type="hidden" name="type" value={typeKey} />}
          <label className="relative flex-1">
            <span className="sr-only">Search games</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-ink-faint" aria-hidden />
            <input
              name="q"
              defaultValue={q}
              type="search"
              placeholder="Search by name, genre or feel"
              className="h-11 w-full rounded-xl border border-line bg-surface pr-4 pl-11 text-[15px] outline-none transition hover:border-line-strong focus:border-brand-400 focus:ring-4 focus:ring-brand-500/15"
            />
          </label>
          <Button type="submit">Search</Button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <nav aria-label="Play type" className="flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1">
            {Object.entries(TYPES).map(([k, label]) => pill(k, label, k === typeKey, href({ type: k === "all" ? null : k })))}
          </nav>
          <nav aria-label="Sort" className="flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1">
            {Object.entries(SORTS).map(([k, label]) => pill(k, label, k === sortKey, href({ sort: k === "popular" ? null : k })))}
          </nav>
        </div>
      </div>

      <nav aria-label="Categories" className="mt-5 flex gap-2 overflow-x-auto pb-1 scrollbar-none sm:flex-wrap">
        {chip(null, "All")}
        {Object.entries(GAME_CATEGORIES).map(([key, label]) => chip(key, label))}
      </nav>

      <p className="mt-6 text-sm text-ink-muted" aria-live="polite">
        {results.length} {results.length === 1 ? "game" : "games"}
        {cat ? ` in ${GAME_CATEGORIES[cat]}` : ""}
        {query ? ` matching “${q.trim()}”` : ""}
      </p>
      {results.length ? (
        <div className="sg-stagger mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {results.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      ) : (
        <EmptyState
          className="mt-6"
          icon={<SearchX />}
          title="No games match that"
          body="Try another word, or clear the filters to see everything."
          action={
            <ButtonLink href="/games" variant="secondary">
              Clear filters
            </ButtonLink>
          }
        />
      )}
    </div>
  );
}
