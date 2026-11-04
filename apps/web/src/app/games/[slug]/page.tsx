import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, Gamepad2, Play, Users } from "lucide-react";
import { brand, GAME_CATEGORIES, GAME_MODE_LABELS, GAMES, getGameBySlug } from "@platform/shared";
import { GameArt } from "@/components/brand";
import { GAME_THEME } from "@/components/game-theme";
import { durationRange, GameCard, playerRange } from "@/components/games/game-card";
import { FavoriteButton } from "@/components/games/favorite-button";
import { Card } from "@/components/ui/primitives";
import { CuisineJourney } from "@/components/cuisine-journey";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return GAMES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const game = getGameBySlug((await params).slug);
  if (!game) return {};
  const title = game.kind === "solo" ? `${game.name} — play free online` : `${game.name} — play free online with friends`;
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
  // Related games: those sharing the most categories first.
  const others = GAMES.filter((g) => g.id !== game.id)
    .map((g) => ({ g, shared: g.categories.filter((c) => game.categories.includes(c)).length }))
    .sort((a, b) => b.shared - a.shared || Number(b.g.popular) - Number(a.g.popular))
    .slice(0, 3)
    .map(({ g }) => g);

  // Only facts we can stand behind: no ratings, reviews or age claims.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.name,
    description: game.description,
    url: `${brand.siteUrl}/games/${game.slug}`,
    genre: game.categories.map((c) => GAME_CATEGORIES[c]),
    playMode: game.kind === "solo" ? "SinglePlayer" : "MultiPlayer",
    numberOfPlayers: { "@type": "QuantitativeValue", minValue: game.minPlayers, maxValue: game.maxPlayers },
    gamePlatform: "Web browser",
    applicationCategory: "Game",
    operatingSystem: "Any (web browser)",
    offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
    publisher: { "@type": "Organization", name: brand.name },
  };

  const theme = GAME_THEME[game.id];
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {/* Hero band in the game's own colours */}
      <section className="relative overflow-hidden border-b-[3px]" style={{ background: theme.deep, borderColor: theme.accent, color: theme.ink }}>
        <div className="pointer-events-none absolute inset-0 opacity-25" aria-hidden>
          <GameArt gameId={game.id} className="size-full scale-125 blur-2xl" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
          <Link href="/games" className="inline-flex items-center gap-1 text-sm font-bold opacity-75 hover:opacity-100">
            <ChevronLeft className="size-4" /> All games
          </Link>
          <div className="mt-5 grid items-center gap-8 lg:grid-cols-[1.15fr_1fr]">
            <div className="overflow-hidden rounded-[24px] border-[3px] shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)]" style={{ borderColor: theme.accent }}>
              <GameArt gameId={game.id} className="block aspect-[16/10] w-full" />
            </div>
            <div className="flex flex-col">
              <div className="flex flex-wrap gap-2">
                {game.categories.map((c) => (
                  <span key={c} className="rounded-md px-2 py-0.5 text-xs font-black tracking-wider uppercase" style={{ background: `${theme.accent}26`, color: theme.accent }}>
                    {GAME_CATEGORIES[c]}
                  </span>
                ))}
              </div>
              <h1 className="mt-3 font-display text-4xl font-black tracking-tight sm:text-6xl">{game.name}</h1>
              <p className="mt-3 text-lg opacity-85">{game.tagline}</p>
              <dl className="mt-6 grid grid-cols-3 gap-2.5">
                {[
                  { icon: Users, label: "Players", value: playerRange(game) },
                  { icon: Clock, label: "Game length", value: durationRange(game) },
                  { icon: Gamepad2, label: "Modes", value: `${game.modes.length} modes` },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl border-2 border-white/10 bg-black/25 p-3">
                    <s.icon className="size-5" style={{ color: theme.accent }} aria-hidden />
                    <dt className="mt-1.5 text-xs opacity-60">{s.label}</dt>
                    <dd className="text-sm font-bold">{s.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href={`/play/${game.slug}`}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full px-8 py-3.5 font-display text-lg font-black text-[#17142b] shadow-[0_5px_0_rgb(0_0_0/0.4)] transition hover:-translate-y-0.5 active:translate-y-0.5 sm:flex-none"
                  style={{ background: theme.accent }}
                  data-testid="play-now"
                >
                  <Play className="size-5 fill-current" /> Play now
                </Link>
                <FavoriteButton gameId={game.id} />
              </div>
              <ul className="mt-5 flex flex-wrap gap-2" aria-label="Supported modes">
                {game.modes.map((m) => (
                  <li key={m} className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold opacity-80">
                    {GAME_MODE_LABELS[m]}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {game.id === "cuisine-quest" && <CuisineJourney />}
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
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border-2 border-[#17142b] font-display font-black text-[#17142b] shadow-[0_3px_0_#17142b]" style={{ background: theme.accent }}>
                  {i + 1}
                </span>
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
    </div>
  );
}
