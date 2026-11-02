"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { getGame, type GameId } from "@platform/shared";
import { getRecentlyPlayed, RECENT_EVENT } from "@/lib/recent";
import { GameArt } from "../brand";

/** Games this browser played recently. Renders nothing until there's history. */
export function RecentlyPlayed({ title = "Jump back in" }: { title?: string }) {
  const [recent, setRecent] = useState<GameId[]>([]);
  useEffect(() => {
    const load = () => setRecent(getRecentlyPlayed());
    load();
    window.addEventListener(RECENT_EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(RECENT_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);
  if (!recent.length) return null;
  return (
    <section aria-labelledby="recently-played" data-testid="recently-played">
      <h2 id="recently-played" className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
        <History className="size-5" /> {title}
      </h2>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {recent.map((id) => {
          const g = getGame(id);
          return (
            <Link key={id} href={`/play/${g.slug}`} className="group w-44 shrink-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition hover:-translate-y-0.5 hover:border-brand-400/60">
              <GameArt gameId={id} className="block aspect-[16/10] w-full object-cover" />
              <p className="truncate px-3 py-2 text-sm font-semibold">{g.name}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
