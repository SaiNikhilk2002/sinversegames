import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Heart, Link2, Smartphone, Sparkles } from "lucide-react";
import { collectionsFor, discoveryCategory, gamesInCategory, getGame, visibleCategories } from "@platform/shared";
import { GameArt } from "@/components/brand";
import { CategoryNav, categoryHref } from "@/components/games/category-nav";
import { GameCard, durationRange } from "@/components/games/game-card";
import { ButtonLink } from "@/components/ui/primitives";

const category = discoveryCategory("couples")!;

export const metadata: Metadata = {
  title: category.landing.title,
  description: category.landing.metaDescription,
  alternates: { canonical: "/couples" },
  openGraph: { title: category.landing.title, description: category.landing.metaDescription },
};

/** Why each couples game works for two, from its real mechanics. */
const WHY: Partial<Record<string, string>> = {
  "same-wavelength": "Answer the same prompt in secret, then reveal together. Couples mode is made for two.",
  "doodle-duel": "Take turns drawing and guessing. With two of you, every round is a duet.",
  "color-clash": "A quick card duel with two players: block, flip and +2 each other.",
  "chef-rivals": "Strictly one against one: same ingredients, three minutes, one winner.",
  "kitchen-rush-coop": "Share one chaotic kitchen and serve every guest as a team.",
};

/**
 * The Couples landing page (docs/COUPLES_EXPERIENCE.md): two-player games and curated collections,
 * each pointing at the one canonical game. Built from the discovery model, so only playable games
 * genuinely assigned to Couples appear.
 */
export default function CouplesPage() {
  const games = gamesInCategory("couples");
  const collections = collectionsFor("couples");
  return (
    <div data-testid="couples-page">
      <section className="relative overflow-hidden border-b border-white/10" style={{ background: "linear-gradient(135deg, #3d1830 0%, #2a1748 55%, #1d2350 100%)", color: "#fff8f4" }}>
        <div className="pointer-events-none absolute -top-24 -left-16 size-80 rounded-full opacity-35 blur-3xl" style={{ background: "#ff7a9c" }} aria-hidden />
        <div className="pointer-events-none absolute -right-20 -bottom-24 size-80 rounded-full opacity-30 blur-3xl" style={{ background: "#9d8cff" }} aria-hidden />
        <div className="page-x relative mx-auto grid max-w-6xl items-center gap-8 py-12 sm:py-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] uppercase" style={{ color: "#ffb3c6" }}>
              <Heart className="size-4 fill-current" aria-hidden /> Games for two
            </p>
            <h1 className="mt-3 font-display text-4xl leading-[1.05] font-semibold sm:text-5xl">{category.landing.heading}</h1>
            <p className="mt-4 max-w-xl text-lg opacity-85">{category.landing.intro}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/play/same-wavelength?preset=couples" size="lg" data-testid="couples-start">
                Start a Same Wavelength room <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href="#collections" size="lg" variant="secondary">
                Browse couples games
              </ButtonLink>
            </div>
            <p className="mt-3 text-sm opacity-70">Free, in the browser. Your partner joins from their own phone or laptop as a guest.</p>
          </div>
          <div className="relative mx-auto w-full max-w-md">
            <div className="overflow-hidden rounded-3xl border border-white/15 shadow-[0_30px_70px_-30px_rgb(0_0_0/.9)] motion-safe:transition-transform motion-safe:duration-700 motion-safe:hover:-rotate-1">
              <GameArt gameId="same-wavelength" className="block aspect-[16/10] w-full" />
            </div>
            <div className="absolute -bottom-5 -left-4 rounded-2xl bg-[#fff8f4] px-4 py-2.5 text-sm font-bold text-[#3d1830] shadow-lg">Same brain moment! ✨</div>
          </div>
        </div>
      </section>

      <div className="page-x mx-auto max-w-6xl space-y-14 py-12">
        <CategoryNav active="couples" />

        <section aria-labelledby="how" className="grid gap-4 sm:grid-cols-3">
          <h2 id="how" className="sr-only">
            How to play together
          </h2>
          {[
            { icon: Sparkles, title: "Pick a game", body: "Each one here genuinely works with two players." },
            { icon: Link2, title: "Send one link", body: "Create a private room and share the invite. No account needed." },
            { icon: Smartphone, title: "Play from anywhere", body: "Same sofa or different cities: refresh or reconnect and you're back in." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-line bg-surface p-5">
              <Icon className="size-6" style={{ color: "#ff7a9c" }} aria-hidden />
              <h3 className="mt-3 font-display text-lg font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-ink-muted">{body}</p>
            </div>
          ))}
        </section>

        <section aria-labelledby="featured">
          <h2 id="featured" className="type-title">
            Featured couples games
          </h2>
          <p className="type-lead mt-1">Start with these. Every result stays on your profile, whichever page you found the game on.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="couples-games">
            {games.map((g) => (
              <div key={g.id} className="flex flex-col gap-2">
                <GameCard game={g} />
                {WHY[g.id] && <p className="px-1 text-sm text-ink-muted">{WHY[g.id]}</p>}
              </div>
            ))}
          </div>
        </section>

        <section id="collections" aria-labelledby="collections-title" className="scroll-mt-20">
          <h2 id="collections-title" className="type-title">
            Collections for two
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2" data-testid="couples-collections">
            {collections.map((c) => (
              <article key={c.id} className="rounded-3xl border border-line bg-surface p-6" data-testid={`collection-${c.id}`}>
                <h3 className="font-display text-xl font-semibold">{c.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{c.blurb}</p>
                <ul className="mt-4 space-y-2">
                  {c.items.map((item) => {
                    const g = getGame(item.gameId);
                    return (
                      <li key={item.gameId}>
                        <Link href={`/play/${g.slug}${item.preset ? `?preset=${item.preset}` : ""}`} className="group flex items-center gap-3 rounded-2xl border border-line p-2 pr-3 transition hover:border-line-strong">
                          <span className="w-20 shrink-0 overflow-hidden rounded-xl">
                            <GameArt gameId={g.id} className="block aspect-[16/10] w-full" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{g.name}</span>
                            <span className="block text-xs text-ink-muted">
                              {item.note} · {durationRange(g)}
                            </span>
                          </span>
                          <ArrowRight className="size-4 text-ink-muted transition group-hover:translate-x-0.5" aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-line bg-surface p-6 text-center">
          <h2 className="font-display text-2xl font-semibold">Discover how well you think alike</h2>
          <p className="mx-auto mt-2 max-w-xl text-ink-muted">Same Wavelength scores how often your answers match, with funny insights and a card to share. It's a game, not a compatibility test.</p>
          <ButtonLink href="/play/same-wavelength?preset=couples" size="lg" className="mt-5">
            Play Same Wavelength
          </ButtonLink>
        </section>

        <nav aria-label="More ways to play" className="flex flex-wrap justify-center gap-2 text-sm">
          {visibleCategories()
            .filter((c) => c.id !== "couples")
            .map((c) => (
              <Link key={c.id} href={categoryHref(c)} className="rounded-xl border border-line bg-surface px-3 py-2 hover:border-line-strong">
                {c.name} games
              </Link>
            ))}
        </nav>
      </div>
    </div>
  );
}
