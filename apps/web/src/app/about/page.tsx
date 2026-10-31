import type { Metadata } from "next";
import Link from "next/link";
import { brand, GAMES } from "@platform/shared";
import { ProsePage } from "@/components/layout/prose-page";

export const metadata: Metadata = { title: "About", description: `What ${brand.name} is and how it works.`, alternates: { canonical: "/about" } };

export default function AboutPage() {
  return (
    <ProsePage title={`About ${brand.name}`} intro={`${brand.name} is a home for quick, social games that run right in your browser.`}>
      <p>
        We build original multiplayer games designed for playing with friends: create a room, share a link, and everyone is in the game within seconds — on a phone, tablet or computer. There's nothing to install and you don't need an account to play.
      </p>
      <h2>Our games</h2>
      <ul>
        {GAMES.map((g) => (
          <li key={g.id}>
            <Link href={`/games/${g.slug}`}>{g.name}</Link> — {g.tagline}
          </li>
        ))}
      </ul>
      <h2>Fair play</h2>
      <p>
        Every game runs on our servers: they deal the cards, pick the secret words, check every move and calculate every score. Your device only shows you what you're allowed to see, so nobody can peek at another player's hand or the word being drawn.
      </p>
      <h2>Get in touch</h2>
      <p>
        Questions, ideas or bug reports? Visit our <Link href="/contact">contact page</Link>.
      </p>
    </ProsePage>
  );
}
