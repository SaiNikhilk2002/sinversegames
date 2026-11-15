import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { DISCOVERY_CATEGORIES, PLAYER_COUNT_FILTERS, discoveryCategory, gamesInCategory, searchGames, visibleCategories, type PlayerCountFilter } from "@platform/shared";
import { CATEGORY_ICON, CategoryNav, categoryHref } from "@/components/games/category-nav";
import { GameCard } from "@/components/games/game-card";
import { cn, EmptyState } from "@/components/ui/primitives";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ players?: string }>;

/** Every category with games gets a page at build time; Couples has its own at /couples. */
export function generateStaticParams() {
  return visibleCategories().filter((c) => !c.href).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const category = discoveryCategory((await params).slug);
  if (!category || gamesInCategory(category.id).length === 0) return { title: "Category not found", robots: { index: false } };
  return {
    title: category.landing.title,
    description: category.landing.metaDescription,
    alternates: { canonical: categoryHref(category) },
    openGraph: { title: category.landing.title, description: category.landing.metaDescription },
  };
}

export default async function CategoryPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { slug } = await params;
  const category = DISCOVERY_CATEGORIES.find((c) => c.slug === slug);
  // Unknown, hidden or empty categories don't get a page: no empty or misleading landings.
  if (!category || !category.visible || gamesInCategory(category.id).length === 0) notFound();
  if (category.href) permanentRedirect(category.href);
  const { players = "" } = await searchParams;
  const count = (players in PLAYER_COUNT_FILTERS ? players : null) as PlayerCountFilter | null;
  const games = searchGames({ category: category.id, players: count }).sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.popular) - Number(a.popular) || a.name.localeCompare(b.name));
  const lead = games.find((g) => g.featured) ?? games[0];
  const rest = games.filter((g) => g !== lead);
  const Icon = CATEGORY_ICON[category.icon];
  const counts = (Object.keys(PLAYER_COUNT_FILTERS) as PlayerCountFilter[]).filter((k) => searchGames({ category: category.id, players: k }).length > 0);

  return (
    <div className="page-x pt-10 pb-12 sm:pt-14" data-testid={`category-${category.id}`}>
      <header className="sg-page">
        <p className="type-eyebrow mb-3 flex items-center gap-2">
          <Icon className="size-4" aria-hidden /> {category.name} games
        </p>
        <h1 className="type-title">{category.landing.heading}</h1>
        <p className="type-lead mt-2 max-w-2xl">{category.landing.intro}</p>
      </header>

      <div className="sg-page mt-6 space-y-4">
        <CategoryNav active={category.id} />
        {counts.length > 1 && (
          <div className="flex flex-wrap items-center gap-2" aria-label="Filter by players">
            <span className="text-sm text-ink-muted">Players:</span>
            {[null, ...counts].map((k) => (
              <Link
                key={k ?? "any"}
                href={k ? `?players=${k}` : `/categories/${category.slug}`}
                aria-current={k === count ? "true" : undefined}
                className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", k === count ? "bg-surface-3 text-ink shadow-sm" : "text-ink-muted hover:text-ink")}
              >
                {k ? PLAYER_COUNT_FILTERS[k] : "Any"}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="sg-page mt-8">
        {games.length === 0 ? (
          <EmptyState title="No games for that many players here" body="Try another player count." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="category-games">
            {lead && <GameCard game={lead} size="lg" className="sm:col-span-2 lg:col-span-2 lg:row-span-2" fill />}
            {rest.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        )}
      </div>

      <section className="sg-page mt-12" aria-labelledby="more">
        <h2 id="more" className="font-display text-xl font-semibold">
          Other ways to play
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {visibleCategories()
            .filter((c) => c.id !== category.id)
            .map((c) => (
              <li key={c.id}>
                <Link href={categoryHref(c)} className="inline-block rounded-xl border border-line bg-surface px-3 py-2 text-sm hover:border-line-strong">
                  <span className="font-semibold">{c.name}</span> <span className="text-ink-muted">· {c.description}</span>
                </Link>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
