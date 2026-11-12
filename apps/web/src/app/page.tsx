import Link from "next/link";
import { ArrowRight, Gamepad2, Link2, Play, Trophy, UserPlus } from "lucide-react";
import { brand, GAME_CATEGORIES, GAMES, type GameCategory } from "@platform/shared";
import { GameArt } from "@/components/brand";
import { GAME_THEME } from "@/components/game-theme";
import { GameCard } from "@/components/games/game-card";
import { HeroSpotlight } from "@/components/games/hero-spotlight";
import { JoinCodeForm } from "@/components/games/join-code-form";
import { RecentlyPlayed } from "@/components/games/recently-played";
import { ButtonLink, SectionHeading } from "@/components/ui/primitives";

// The flagship leads; then the editorially featured games; then the rest.
const LEAD = "sinverse-cricket";
const spotlight = [...GAMES].sort((a, b) => Number(b.id === LEAD) - Number(a.id === LEAD) || Number(b.featured) - Number(a.featured) || Number(b.popular) - Number(a.popular));
// One large card and four smaller ones: the featured games, topped up by the next in line.
const featured = [...spotlight.filter((g) => g.featured), ...spotlight.filter((g) => !g.featured)].slice(0, 5);
const multiplayer = GAMES.filter((g) => g.kind === "multiplayer");
const solo = GAMES.filter((g) => g.kind === "solo");
const usedCategories = Object.entries(GAME_CATEGORIES).filter(([key]) => GAMES.some((g) => g.categories.includes(key as GameCategory)));
const lead = spotlight[0]!;

function AllGames() {
  return (
    <Link href="/games" className="group inline-flex items-center gap-1 text-sm font-medium text-ink-muted transition-colors hover:text-ink">
      All games <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export default function HomePage() {
  return (
    <>
      {/* Hero: the promise on the left, the games themselves on the right. */}
      <section className="relative overflow-x-clip">
        <div className="page-x grid grid-cols-1 items-center gap-10 pt-10 pb-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14 lg:pt-16 lg:pb-20">
          <div className="sg-page">
            <p className="type-eyebrow mb-5 flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-mint" aria-hidden /> {GAMES.length} original games · Free in your browser
            </p>
            <h1 className="type-hero">
              Pick a game.
              <br />
              <span className="text-primary">Send the link.</span>
              <br />
              Play.
            </h1>
            <p className="type-lead mt-6 max-w-md">
              {brand.name} is a collection of original games that run right here. No downloads and no account needed: choose a name and you&apos;re in.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href={`/play/${lead.slug}`} size="lg">
                <Play className="size-4 fill-current" /> Play now
              </ButtonLink>
              <ButtonLink href="/games" variant="secondary" size="lg">
                <Gamepad2 className="size-4" /> Browse games
              </ButtonLink>
            </div>
            <div className="mt-8 max-w-md border-t border-line pt-6">
              <p className="mb-2.5 text-sm font-medium text-ink-muted">Got a room code from a friend?</p>
              <JoinCodeForm />
            </div>
          </div>
          <HeroSpotlight games={spotlight} />
        </div>
      </section>

      <div className="page-x space-y-20 pb-8 sm:space-y-24">
        <RecentlyPlayed />

        <section aria-labelledby="featured">
          <SectionHeading id="featured" eyebrow="Featured" title="Start here" subtitle="Our flagship games, chosen by the team." action={<AllGames />} />
          <div className="sg-stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr] lg:grid-rows-2">
            {featured.map((g, i) => (
              <GameCard key={g.id} game={g} size={i === 0 ? "lg" : "md"} fill={i === 0} className={i === 0 ? "sm:col-span-2 lg:col-span-1 lg:row-span-2" : undefined} />
            ))}
          </div>
        </section>

        <section aria-labelledby="friends">
          <SectionHeading id="friends" eyebrow="Multiplayer" title="Play with friends" subtitle="Private rooms with an invite link, or a quick public match." action={<AllGames />} />
          <div className="sg-stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {multiplayer.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </section>

        <section aria-labelledby="solo">
          <SectionHeading id="solo" eyebrow="Single player" title="Play solo" subtitle="Campaigns, verified high scores and a fresh daily leaderboard." action={<AllGames />} />
          <div className="sg-stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {solo.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </section>

        <section aria-labelledby="categories">
          <SectionHeading id="categories" title="Browse by kind" />
          <div className="flex flex-wrap gap-2.5">
            {usedCategories.map(([key, label]) => {
              const sample = GAMES.find((g) => g.categories.includes(key as GameCategory))!;
              return (
                <Link
                  key={key}
                  href={`/games?category=${key}`}
                  className="group flex items-center gap-3 rounded-full border border-line bg-surface py-1 pr-4 pl-1 text-sm font-medium transition-colors hover:border-line-strong hover:bg-surface-2"
                >
                  <span className="block h-8 w-12 overflow-hidden rounded-full" style={{ background: GAME_THEME[sample.id].deep }}>
                    <GameArt gameId={sample.id} className="size-full" />
                  </span>
                  {label}
                </Link>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="how" className="overflow-hidden rounded-3xl border border-line bg-surface">
          <div className="grid gap-10 p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:p-14">
            <div>
              <p className="type-eyebrow mb-3">How it works</p>
              <h2 id="how" className="type-title max-w-md">From link to first move in seconds</h2>
              <ol className="mt-8 grid gap-6 sm:grid-cols-2">
                {[
                  { icon: Gamepad2, title: "Pick a game", body: "Solo or with friends, everything runs in the browser." },
                  { icon: UserPlus, title: "Choose a name", body: "No account needed. Your stats follow you on this device." },
                  { icon: Link2, title: "Share the room link", body: "Friends tap it and land in your lobby." },
                  { icon: Trophy, title: "Climb the boards", body: "Achievements, profiles and daily leaderboards." },
                ].map((s, i) => (
                  <li key={s.title} className="flex gap-3.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-muted">
                      <s.icon className="size-4" aria-hidden />
                    </span>
                    <div>
                      <p className="font-semibold">
                        <span className="mr-1.5 text-ink-faint tabular-nums">{i + 1}.</span>
                        {s.title}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-muted">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-9 flex flex-wrap gap-3">
                <ButtonLink href="/games">Explore all {GAMES.length} games</ButtonLink>
                <ButtonLink href="/leaderboard" variant="ghost">
                  See the leaderboards
                </ButtonLink>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3" aria-hidden>
              {multiplayer.slice(0, 4).map((g) => (
                <div key={g.id} className="overflow-hidden rounded-2xl border border-line" style={{ background: GAME_THEME[g.id].deep }}>
                  <GameArt gameId={g.id} className="block aspect-[16/10] w-full" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
