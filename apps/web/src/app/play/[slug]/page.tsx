import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GAMES, getGameBySlug } from "@platform/shared";
import { NameGate } from "@/components/play/name-gate";
import { PlayHub } from "@/components/play/play-hub";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return GAMES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const game = getGameBySlug((await params).slug);
  return game ? { title: `Play ${game.name}`, description: game.description, robots: { index: false } } : {};
}

export default async function PlayPage({ params }: { params: Params }) {
  const game = getGameBySlug((await params).slug);
  if (!game) notFound();
  return (
    <NameGate title={`Play ${game.name}`}>
      <PlayHub gameId={game.id} />
    </NameGate>
  );
}
