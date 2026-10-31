import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { GAME_CATEGORIES, GAMES, type GameCategory } from "@platform/shared";
import { GameCard } from "@/components/games/game-card";
import { Button, cn } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "All games",
  description: "Browse free multiplayer browser games — card games, drawing games and party games you can play instantly with friends.",
  alternates: { canonical: "/games" },
};

type SearchParams = Promise<{ q?: string; category?: string }>;

export default async function GamesPage({ searchParams }: { searchParams: SearchParams }) {
  const { q = "", category = "" } = await searchParams;
  const query = q.trim().toLowerCase().slice(0, 60);
  const cat = category in GAME_CATEGORIES ? (category as GameCategory) : null;

  const results = GAMES.filter((g) => {
    if (cat && !g.categories.includes(cat)) return false;
    if (!query) return true;
    return [g.name, g.tagline, g.description, ...g.keywords].join(" ").toLowerCase().includes(query);
  });

  const chip = (key: string | null, label: string) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (key) params.set("category", key);
    const active = (key ?? null) === cat;
    return (
      <Link
        key={label}
        href={`/games${params.size ? `?${params}` : ""}`}
        aria-current={active ? "true" : undefined}
        className={cn(
          "rounded-full border px-4 py-2 text-sm font-semibold transition",
          active ? "border-transparent bg-brand-gradient text-white" : "border-line bg-surface text-ink-muted hover:text-ink",
        )}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">All games</h1>
      <p className="mt-2 text-ink-muted">Every game is free, runs in your browser and supports playing with friends.</p>

      <form method="get" role="search" className="mt-8 flex max-w-xl gap-2">
        {cat && <input type="hidden" name="category" value={cat} />}
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

      <p className="mt-8 text-sm text-ink-muted" aria-live="polite">
        {results.length} {results.length === 1 ? "game" : "games"}
        {cat ? ` in ${GAME_CATEGORIES[cat]}` : ""}
        {query ? ` matching “${q.trim()}”` : ""}
      </p>
      {results.length ? (
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
