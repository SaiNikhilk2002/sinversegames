import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGame, shareCaption } from "@platform/shared";
import { verifyShareToken } from "@platform/shared/identity";
import { ShareCard } from "@/components/share/share-card";
import { ButtonLink } from "@/components/ui/primitives";
import { authSecret } from "@/lib/server/session";

type Params = Promise<{ token: string }>;

async function read(params: Params) {
  return verifyShareToken((await params).token, authSecret());
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await read(params);
  if (!data) return { title: "Result not found", robots: { index: false } };
  const game = getGame(data.g);
  const description = data.i[0] ?? shareCaption(game.name, { matchPct: data.m });
  // Personal results: shareable, but kept out of search engines.
  return { title: `${data.h} · ${game.name}`, description, robots: { index: false, follow: true }, openGraph: { title: data.h, description } };
}

export default async function SharePage({ params }: { params: Params }) {
  const data = await read(params);
  if (!data) notFound();
  const game = getGame(data.g);
  return (
    <div className="page-x mx-auto max-w-2xl py-10 sm:py-14">
      <ShareCard data={data} />
      <section className="mt-8 rounded-3xl border border-line bg-surface p-6 text-center">
        <h2 className="font-display text-2xl font-semibold">{data.m !== undefined ? "Think you can beat that?" : `Play ${game.name}`}</h2>
        <p className="mt-1 text-ink-muted">{game.tagline} Free in your browser, no download or sign-up.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <ButtonLink href={`/play/${game.slug}${data.g === "same-wavelength" ? "?preset=couples" : ""}`} size="lg" data-testid="share-play">
            Play {game.name}
          </ButtonLink>
          <ButtonLink href={`/games/${game.slug}`} variant="secondary" size="lg">
            How it works
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
