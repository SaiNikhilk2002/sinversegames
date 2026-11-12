import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, Gamepad2, Play, Users } from "lucide-react";
import { brand, GAME_CATEGORIES, GAME_MODE_LABELS, GAMES, getGameBySlug } from "@platform/shared";
import { GameArt } from "@/components/brand";
import { GAME_THEME } from "@/components/game-theme";
import { durationRange, GameCard, playerRange } from "@/components/games/game-card";
import { FavoriteButton } from "@/components/games/favorite-button";
import { SectionHeading } from "@/components/ui/primitives";
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
      {/* Hero in the game's own colours: the cover, the facts and one action. */}
      <section className="relative overflow-hidden" style={{ background: theme.deep, color: theme.ink }}>
        <div className="pointer-events-none absolute inset-0 opacity-30" aria-hidden>
          <GameArt gameId={game.id} className="size-full scale-125 blur-3xl" />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/30" aria-hidden />
        <div className="page-x relative py-8 lg:py-14">
          <Link href="/games" className="inline-flex items-center gap-1 rounded-lg text-sm font-medium opacity-70 transition-opacity hover:opacity-100">
            <ChevronLeft className="size-4" /> All games
          </Link>
          <div className="mt-6 grid items-center gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
            <div className="sg-page overflow-hidden rounded-3xl border border-white/15 shadow-[0_40px_80px_-40px_rgb(0_0_0/0.9)]">
              <GameArt gameId={game.id} className="block aspect-[16/10] w-full" />
            </div>
            <div className="flex flex-col">
              <p className="text-xs font-semibold tracking-[0.14em] uppercase opacity-70">{game.categories.map((c) => GAME_CATEGORIES[c]).join(" · ")}</p>
              <h1 className="type-title mt-3">{game.name}</h1>
              <p className="mt-3 text-lg leading-relaxed opacity-85">{game.tagline}</p>
              <dl className="mt-7 grid grid-cols-3 divide-x divide-white/15 overflow-hidden rounded-2xl border border-white/15 bg-black/20 backdrop-blur-sm">
                {[
                  { icon: Users, label: "Players", value: playerRange(game) },
                  { icon: Clock, label: "Game length", value: durationRange(game) },
                  { icon: Gamepad2, label: "Modes", value: `${game.modes.length} ${game.modes.length === 1 ? "mode" : "modes"}` },
                ].map((s) => (
                  <div key={s.label} className="p-3.5 sm:p-4">
                    <dt className="flex items-center gap-1.5 text-xs opacity-65">
                      <s.icon className="size-3.5" aria-hidden /> {s.label}
                    </dt>
                    <dd className="mt-1 text-sm font-semibold sm:text-[15px]">{s.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href={`/play/${game.slug}`}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl px-7 text-base font-semibold text-[#0f0f1a] shadow-[0_14px_30px_-14px_var(--accent)] transition-[filter,transform] hover:brightness-105 active:scale-[0.98] sm:flex-none"
                  style={{ background: theme.accent, "--accent": theme.accent } as React.CSSProperties}
                  data-testid="play-now"
                >
                  <Play className="size-4 fill-current" /> Play now
                </Link>
                <FavoriteButton gameId={game.id} />
              </div>
              <ul className="mt-5 flex flex-wrap gap-2" aria-label="Supported modes">
                {game.modes.map((m) => (
                  <li key={m} className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium opacity-80">
                    {GAME_MODE_LABELS[m]}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <div className="page-x py-10">
        {game.id === "cuisine-quest" && <CuisineJourney />}
        <div className="mt-10 grid gap-12 lg:grid-cols-[1.2fr_1fr]">
          <section aria-labelledby="about-game">
            <h2 id="about-game" className="type-section">About {game.name}</h2>
            {game.longDescription.map((p) => (
              <p key={p.slice(0, 20)} className="mt-4 leading-relaxed text-ink-muted">
                {p}
              </p>
            ))}
          </section>
          <section aria-labelledby="how-to-play">
            <h2 id="how-to-play" className="type-section">How to play</h2>
            <ol className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {game.howToPlay.map((step, i) => (
                <li key={step.title} className="flex gap-4 p-4 sm:p-5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg text-sm font-semibold tabular-nums" style={{ background: `${theme.accent}22`, color: theme.accent }}>
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold">{step.title}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {others.length > 0 && (
          <section className="mt-20" aria-labelledby="more-games">
            <SectionHeading id="more-games" eyebrow="Related" title="More like this" />
            <div className="sg-stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
