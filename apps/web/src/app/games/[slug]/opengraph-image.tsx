import { ImageResponse } from "next/og";
import { brand, GAMES, getGameBySlug } from "@platform/shared";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Game preview";

export function generateStaticParams() {
  return GAMES.map((g) => ({ slug: g.slug }));
}

export default async function GameOgImage({ params }: { params: Promise<{ slug: string }> }) {
  const game = getGameBySlug((await params).slug) ?? GAMES[0]!;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 80, background: `linear-gradient(135deg, ${game.theme.from}, ${game.theme.to})`, color: "white" }}>
        <div style={{ fontSize: 34, opacity: 0.85 }}>{brand.name}</div>
        <div style={{ fontSize: 110, fontWeight: 800, lineHeight: 1 }}>{game.name}</div>
        <div style={{ fontSize: 40, marginTop: 20, maxWidth: 950 }}>{game.tagline}</div>
        <div style={{ fontSize: 30, marginTop: 24, opacity: 0.85 }}>{`${game.minPlayers}–${game.maxPlayers} players · Free · No download`}</div>
      </div>
    ),
    size,
  );
}
