import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { GAME_CATEGORIES, GAMES, type GameCategory } from "@platform/shared";
import { GameCard } from "@/components/games/game-card";
import { RecentlyPlayed } from "@/components/games/recently-played";
import { Button, cn } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "All games",
  description: "Browse free browser games: cooking, puzzle, card, board, arcade and party games you can play instantly, solo or with friends.",
  alternates: { canonical: "/games" },
};

type SearchParams = Promise<{ q?: string; category?: string; sort?: string; type?: string }>;

const SORTS = { popular: "Popular", new: "Newest", name: "A–Z" } as const;
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
      className={cn("rounded-full px-3 py-1.5 text-sm font-semibold transition", active ? "bg-ink text-surface" : "text-ink-muted hover:text-ink")}
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
          "rounded-full border px-4 py-2 text-sm font-semibold transition",
          active ? "border-[#17142b] bg-[#ffb23d] text-[#17142b] shadow-[0_3px_0_#17142b]" : "border-line bg-surface text-ink-muted hover:text-ink",
        )}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">All games</h1>
      <p className="mt-2 text-ink-muted">Every game is free and runs in your browser — no downloads, no sign-up.</p>
      <div className="mt-6">
        <RecentlyPlayed title="Recently played" />
      </div>

      <form method="get" role="search" className="mt-8 flex max-w-xl gap-2">
        {cat && <input type="hidden" name="category" value={cat} />}
        {sortKey !== "popular" && <input type="hidden" name="sort" value={sortKey} />}
        {typeKey !== "all" && <input type="hidden" name="type" value={typeKey} />}
        <label className="relative flex-1">
          <span className="sr-only">Search games</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input
            name="q"
            defaultValue={q}
            type="search"
            placeholder="Search games…"
            className="h-12 w-full rounded-xl border border-line bg-surface pr-4 pl-12 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/20"
          />
        </label>
        <Button type="submit">Search</Button>
      </form>

      <nav aria-label="Categories" className="mt-5 flex flex-wrap gap-2">
        {chip(null, "All")}
        {Object.entries(GAME_CATEGORIES).map(([key, label]) => chip(key, label))}
      </nav>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <nav aria-label="Play type" className="flex flex-wrap items-center gap-1 rounded-full border border-line bg-surface p-1">
          {Object.entries(TYPES).map(([k, label]) => pill(k, label, k === typeKey, href({ type: k === "all" ? null : k })))}
        </nav>
        <nav aria-label="Sort" className="flex flex-wrap items-center gap-1 rounded-full border border-line bg-surface p-1">
          {Object.entries(SORTS).map(([k, label]) => pill(k, label, k === sortKey, href({ sort: k === "popular" ? null : k })))}
        </nav>
      </div>

      <p className="mt-8 text-sm text-ink-muted" aria-live="polite">
        {results.length} {results.length === 1 ? "game" : "games"}
        {cat ? ` in ${GAME_CATEGORIES[cat]}` : ""}
        {query ? ` matching “${q.trim()}”` : ""}
      </p>
      {results.length ? (
        <div className="sg-stagger mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-3xl border border-dashed border-line p-12 text-center">
          <p className="font-display text-xl font-bold">No games found</p>
          <p className="mt-1 text-ink-muted">Try a different search or category. More games are on the way!</p>
          <Link href="/games" className="mt-4 inline-block font-semibold text-brand-500 hover:underline">
            Clear filters
          </Link>
        </div>
      )}
    </div>
  );
}
