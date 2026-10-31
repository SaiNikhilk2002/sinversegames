import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, Gamepad2, Users } from "lucide-react";
import { brand, GAME_CATEGORIES, GAME_MODE_LABELS, GAMES, getGameBySlug } from "@platform/shared";
import { GameArt } from "@/components/brand";
import { durationRange, GameCard, playerRange } from "@/components/games/game-card";
import { FavoriteButton } from "@/components/games/favorite-button";
import { Badge, ButtonLink, Card } from "@/components/ui/primitives";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return GAMES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const game = getGameBySlug((await params).slug);
  if (!game) return {};
  const title = `${game.name} — play free online with friends`;
  return {
    title,
    description: game.description,
    keywords: game.keywords,
    alternates: { canonical: `/games/${game.slug}` },
    openGraph: { title, description: game.description, url: `/games/${game.slug}`, type: "website" },
  };
}

export default async function GamePage({ params }: { params: Params }) {
  const game = getGameBySlug((await params).slug);
  if (!game) notFound();
  const others = GAMES.filter((g) => g.id !== game.id);

  // Only facts we can stand behind: no ratings, reviews or age claims.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.name,
    description: game.description,
    url: `${brand.siteUrl}/games/${game.slug}`,
    genre: game.categories.map((c) => GAME_CATEGORIES[c]),
    playMode: "MultiPlayer",
    numberOfPlayers: { "@type": "QuantitativeValue", minValue: game.minPlayers, maxValue: game.maxPlayers },
    gamePlatform: "Web browser",
    applicationCategory: "Game",
    operatingSystem: "Any (web browser)",
    offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
    publisher: { "@type": "Organization", name: brand.name },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Link href="/games" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ChevronLeft className="size-4" /> All games
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div className="overflow-hidden rounded-3xl border border-line shadow-card">
          <GameArt gameId={game.id} className="block w-full" />
        </div>
        <div className="flex flex-col">
          <div className="flex flex-wrap gap-2">
            {game.categories.map((c) => (
              <Badge key={c} tone="brand">
                {GAME_CATEGORIES[c]}
              </Badge>
            ))}
            {game.popular && <Badge tone="hot">Popular</Badge>}
          </div>
          <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{game.name}</h1>
          <p className="mt-3 text-lg text-ink-muted">{game.tagline}</p>

          <dl className="mt-6 grid grid-cols-3 gap-3">
            {[
              { icon: Users, label: "Players", value: playerRange(game) },
              { icon: Clock, label: "Game length", value: durationRange(game) },
              { icon: Gamepad2, label: "Modes", value: `${game.modes.length} modes` },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-line bg-surface p-3">
                <s.icon className="size-5 text-brand-500" aria-hidden />
                <dt className="mt-2 text-xs text-ink-faint">{s.label}</dt>
                <dd className="text-sm font-bold">{s.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href={`/play/${game.slug}`} size="lg" className="flex-1 sm:flex-none">
              Play now
            </ButtonLink>
            <FavoriteButton gameId={game.id} />
          </div>
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="Supported modes">
            {game.modes.map((m) => (
              <li key={m}>
                <Badge>{GAME_MODE_LABELS[m]}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <section aria-labelledby="about-game">
          <h2 id="about-game" className="font-display text-2xl font-bold">About {game.name}</h2>
          {game.longDescription.map((p) => (
            <p key={p.slice(0, 20)} className="mt-3 leading-relaxed text-ink-muted">
              {p}
            </p>
          ))}
        </section>
        <section aria-labelledby="how-to-play">
          <h2 id="how-to-play" className="font-display text-2xl font-bold">How to play</h2>
          <ol className="mt-4 space-y-3">
            {game.howToPlay.map((step, i) => (
              <Card key={step.title} className="flex gap-4 p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient font-display font-bold text-white">{i + 1}</span>
                <div>
                  <h3 className="font-bold">{step.title}</h3>
                  <p className="text-sm text-ink-muted">{step.body}</p>
                </div>
              </Card>
            ))}
          </ol>
        </section>
      </div>

      {others.length > 0 && (
        <section className="mt-16" aria-labelledby="more-games">
          <h2 id="more-games" className="mb-5 font-display text-2xl font-bold">More games</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
