import Link from "next/link";
import { Gamepad2, Link2, Trophy, UserPlus } from "lucide-react";
import { brand, GAME_CATEGORIES, GAMES, type GameCategory } from "@platform/shared";
import { GameArt } from "@/components/brand";
import { GAME_THEME } from "@/components/game-theme";
import { GameCard } from "@/components/games/game-card";
import { HeroSpotlight } from "@/components/games/hero-spotlight";
import { JoinCodeForm } from "@/components/games/join-code-form";
import { RecentlyPlayed } from "@/components/games/recently-played";

// Kitchen Rush leads the spotlight; then the rest by popularity.
const spotlight = [...GAMES].sort((a, b) => (a.id === "cuisine-quest" ? -1 : b.id === "cuisine-quest" ? 1 : a.id === "kitchen-rush" ? -1 : b.id === "kitchen-rush" ? 1 : Number(b.popular) - Number(a.popular)));
const multiplayer = GAMES.filter((g) => g.kind === "multiplayer");
const solo = GAMES.filter((g) => g.kind === "solo");
const usedCategories = Object.entries(GAME_CATEGORIES).filter(([key]) => GAMES.some((g) => g.categories.includes(key as GameCategory)));

function Shelf({ id, title, subtitle, children }: { id: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={id} className="font-display text-3xl font-black tracking-tight">
            {title}
          </h2>
          <p className="mt-1 text-ink-muted">{subtitle}</p>
        </div>
        <Link href="/games" className="text-sm font-bold text-brand-400 hover:underline">
          All games →
        </Link>
      </div>
      {children}
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      {/* Marquee */}
      <section className="relative overflow-hidden">
        <div className="home-stage absolute inset-0 -z-10" aria-hidden />
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 pt-10 pb-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:pt-16 lg:pb-20">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 font-display text-sm font-black tracking-[0.25em] text-[#ffb23d] uppercase">
              <span className="size-2 rounded-full bg-[#2fd6a8] shadow-[0_0_10px_#2fd6a8]" /> {GAMES.length} original games · free
            </p>
            <h1 className="font-display text-5xl leading-[0.98] font-black tracking-tight sm:text-6xl lg:text-7xl">
              Pick a game.
              <br />
              <span className="text-[#ff4f8b]">Send the link.</span>
              <br />
              Play.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-ink-muted">
              {brand.name} is a little arcade of original games that run in your browser. No downloads, no accounts — choose a name and you&apos;re in.
            </p>
            <Link href="/games" className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#ff4f8b] px-6 py-3 font-display font-black text-white shadow-[0_4px_0_#a3194f] transition hover:-translate-y-0.5 active:translate-y-0.5">
              <Gamepad2 className="size-5" /> Browse games
            </Link>
            <div className="mt-6 max-w-md rounded-2xl border-2 border-dashed border-line p-4">
              <p className="mb-2 text-sm font-bold">Got a room code from a friend?</p>
              <JoinCodeForm />
            </div>
          </div>
          <HeroSpotlight games={spotlight} />
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-16 px-4 pb-8 sm:px-6">
        <RecentlyPlayed />

        <Shelf id="friends" title="Play with friends" subtitle="Private rooms with an invite link, or jump into a public match.">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {multiplayer.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </Shelf>

        <Shelf id="solo" title="Play solo" subtitle="Levels, verified high scores and a fresh daily leaderboard.">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {solo.map((g) => (
              <GameCard key={g.id} game={g} size="lg" />
            ))}
          </div>
        </Shelf>

        <section aria-labelledby="categories">
          <h2 id="categories" className="mb-4 font-display text-2xl font-black tracking-tight">
            Browse by kind
          </h2>
          <div className="flex flex-wrap gap-2.5">
            {usedCategories.map(([key, label]) => {
              const sample = GAMES.find((g) => g.categories.includes(key as GameCategory))!;
              return (
                <Link
                  key={key}
                  href={`/games?category=${key}`}
                  className="group flex items-center gap-2.5 rounded-full border-2 border-line bg-surface py-1 pr-4 pl-1 font-bold transition hover:-translate-y-0.5"
                  style={{ "--accent": GAME_THEME[sample.id].accent } as React.CSSProperties}
                >
                  <span className="block h-8 w-12 overflow-hidden rounded-full border-2 border-[var(--accent)]">
                    <GameArt gameId={sample.id} className="size-full" />
                  </span>
                  <span className="group-hover:text-[var(--accent)]">{label}</span>
                </Link>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="how" className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <h2 id="how" className="font-display text-3xl font-black tracking-tight">
              From link to first move in seconds
            </h2>
            <ol className="mt-6 space-y-4">
              {[
                { icon: Gamepad2, title: "Pick a game", body: "Solo or with friends — every game runs right here in the browser." },
                { icon: UserPlus, title: "Choose a name", body: "No account. Your stats follow you on this device." },
                { icon: Link2, title: "Share the room link", body: "Friends tap it and land in your lobby. Or find a public match." },
                { icon: Trophy, title: "Climb the boards", body: "Achievements, profiles and daily leaderboards for every game." },
              ].map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[#17142b] font-display text-lg font-black text-[#17142b] shadow-[0_3px_0_#17142b]" style={{ background: ["#ffb23d", "#2fd6a8", "#ff4f8b", "#3d8bff"][i] }}>
                    {i + 1}
                  </span>
                  <div>
                    <p className="flex items-center gap-2 font-display text-lg font-black">
                      <s.icon className="size-4 text-ink-muted" /> {s.title}
                    </p>
                    <p className="text-ink-muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="relative grid grid-cols-2 gap-3" aria-hidden>
            {multiplayer.map((g, i) => (
              <div key={g.id} className="overflow-hidden rounded-2xl border-[3px] shadow-[0_18px_30px_-18px_rgb(0_0_0/0.9)]" style={{ borderColor: GAME_THEME[g.id].accent, rotate: `${[-3, 2, 2, -2][i]}deg` }}>
                <GameArt gameId={g.id} className="block aspect-[16/10] w-full" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
