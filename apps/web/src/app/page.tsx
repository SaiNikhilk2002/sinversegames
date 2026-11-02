import Link from "next/link";
import { Gamepad2, Link2, Sparkles, Trophy, UserPlus, Zap } from "lucide-react";
import { brand, GAME_CATEGORIES, GAMES, type GameCategory } from "@platform/shared";
import { GameArt } from "@/components/brand";
import { GameCard } from "@/components/games/game-card";
import { JoinCodeForm } from "@/components/games/join-code-form";
import { RecentlyPlayed } from "@/components/games/recently-played";
import { ButtonLink, SectionHeading } from "@/components/ui/primitives";

const featured = GAMES.filter((g) => g.featured).slice(0, 4);
const popular = GAMES.filter((g) => g.popular).slice(0, 4);
const recent = [...GAMES].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 4);
const multiplayer = GAMES.filter((g) => g.kind === "multiplayer");
const solo = GAMES.filter((g) => g.kind === "solo");
const usedCategories = Object.entries(GAME_CATEGORIES).filter(([key]) => GAMES.some((g) => g.categories.includes(key as GameCategory)));

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20 lg:pb-24">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-sm font-semibold text-brand-600 dark:text-brand-300">
              <Sparkles className="size-4" /> No downloads · No sign-up · Free
            </p>
            <h1 className="font-display text-5xl leading-[1.02] font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
              Play together, <span className="text-gradient">instantly.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-muted">
              {brand.name} is home to fast, social browser games. Start a private room, send the link to your friends and be playing in seconds — on any device.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/games" size="lg">
                <Gamepad2 className="size-5" /> Browse games
              </ButtonLink>
              <ButtonLink href="/play/kitchen-rush" size="lg" variant="secondary">
                Quick play Kitchen Rush
              </ButtonLink>
            </div>
            <div className="mt-8 max-w-md">
              <p className="mb-2 text-sm font-semibold text-ink-muted">Got an invite code?</p>
              <JoinCodeForm />
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-xl lg:max-w-none" aria-hidden>
            <div className="absolute -inset-10 -z-10 rounded-full bg-brand-500/25 blur-3xl" />
            <div className="grid grid-cols-6 gap-4">
              <div className="col-span-4 overflow-hidden rounded-3xl border border-white/10 shadow-2xl animate-float [--r:-3deg]">
                <GameArt gameId="color-clash" className="block w-full" />
              </div>
              <div className="col-span-4 col-start-3 -mt-10 overflow-hidden rounded-3xl border border-white/10 shadow-2xl animate-float [--r:2deg] [animation-delay:-3s]">
                <GameArt gameId="doodle-duel" className="block w-full" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-20 px-4 sm:px-6">
        <RecentlyPlayed />

        <section aria-labelledby="featured">
          <SectionHeading id="featured" title="Featured games" subtitle="Hand-picked favourites, solo and multiplayer." action={<Link href="/games" className="text-sm font-semibold text-brand-500 hover:underline">See all</Link>} />
          <div className="grid gap-6 md:grid-cols-2">
            {featured.map((g) => (
              <GameCard key={g.id} game={g} size="lg" />
            ))}
          </div>
        </section>

        <section aria-labelledby="categories">
          <SectionHeading id="categories" title="Browse by category" />
          <div className="flex flex-wrap gap-3">
            {usedCategories.map(([key, label]) => (
              <Link
                key={key}
                href={`/games?category=${key}`}
                className="rounded-2xl border border-line bg-surface px-5 py-3 font-semibold shadow-card transition hover:-translate-y-0.5 hover:border-brand-400/60"
              >
                {label}
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="popular" className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading id="popular" title="Popular right now" />
            <div className="grid gap-6 sm:grid-cols-2">
              {popular.map((g) => (
                <GameCard key={g.id} game={g} />
              ))}
            </div>
          </div>
          <div>
            <SectionHeading title="Recently added" />
            <div className="grid gap-6 sm:grid-cols-2">
              {recent.map((g) => (
                <GameCard key={g.id} game={g} />
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="multiplayer">
          <SectionHeading id="multiplayer" title="Multiplayer games" subtitle="Every game supports private rooms with invite links and public matchmaking." />
          <ul className="grid gap-4 sm:grid-cols-2">
            {multiplayer.map((g) => (
              <li key={g.id}>
                <Link href={`/play/${g.slug}`} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-3 shadow-card transition hover:border-brand-400/60">
                  <GameArt gameId={g.id} className="h-16 w-24 shrink-0 rounded-xl object-cover" />
                  <div className="min-w-0">
                    <p className="font-display text-lg font-bold">{g.name}</p>
                    <p className="text-sm text-ink-muted">
                      {g.minPlayers}–{g.maxPlayers} players · private rooms · matchmaking
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="solo">
          <SectionHeading id="solo" title="Play solo" subtitle="Single-player games with levels, verified high scores and daily leaderboards." />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {solo.map((g) => (
              <li key={g.id}>
                <Link href={`/play/${g.slug}`} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-3 shadow-card transition hover:border-brand-400/60">
                  <GameArt gameId={g.id} className="h-16 w-24 shrink-0 rounded-xl object-cover" />
                  <div className="min-w-0">
                    <p className="font-display text-lg font-bold">{g.name}</p>
                    <p className="line-clamp-2 text-sm text-ink-muted">{g.tagline}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how" className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-10">
          <h2 id="how" className="font-display text-3xl font-bold tracking-tight">How it works</h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-4">
            {[
              { icon: Gamepad2, title: "Pick a game", body: "Choose from our original games, solo or multiplayer." },
              { icon: UserPlus, title: "Choose a name", body: "No account needed — just a display name." },
              { icon: Link2, title: "Invite friends", body: "Share your room link or code, or find a public match." },
              { icon: Trophy, title: "Play & climb", body: "Earn points, track stats and top the leaderboard." },
            ].map((s, i) => (
              <li key={s.title}>
                <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-lg">
                  <s.icon className="size-6" />
                </span>
                <p className="mt-4 text-sm font-bold text-brand-500">Step {i + 1}</p>
                <h3 className="font-display text-xl font-bold">{s.title}</h3>
                <p className="mt-1 text-ink-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="relative overflow-hidden rounded-3xl bg-brand-gradient p-8 text-white sm:p-12">
          <Zap className="absolute -right-6 -bottom-6 size-48 opacity-15" aria-hidden />
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl">Ready for a round?</h2>
          <p className="mt-2 max-w-lg text-white/85">Rooms are free, games are quick, and everyone joins from a single link.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/play/color-clash" variant="secondary" size="lg" className="border-0 bg-white text-[#17142b] hover:bg-white/90">
              Play Color Clash
            </ButtonLink>
            <ButtonLink href="/play/doodle-duel" variant="outline" size="lg" className="border-white/50 text-white hover:bg-white/10">
              Play Doodle Duel
            </ButtonLink>
          </div>
        </section>
      </div>
    </>
  );
}
