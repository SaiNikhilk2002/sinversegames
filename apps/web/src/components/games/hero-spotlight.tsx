"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Play } from "lucide-react";
import type { GameMeta } from "@platform/shared";
import { GameCover } from "../covers";
import { GAME_THEME } from "../game-theme";
import { cn } from "../ui/primitives";
import { playerRange } from "./game-card";

/**
 * The homepage marquee: one game at a time, large, with a soft wash of its own
 * colour behind it and a strip of the other covers to switch between. Advances
 * every 7 s unless the player is interacting with it or prefers reduced motion.
 */
export function HeroSpotlight({ games }: { games: GameMeta[] }) {
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (hold || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((n) => (n + 1) % games.length), 7000);
    return () => clearInterval(id);
  }, [hold, games.length]);
  const g = games[i]!;
  const theme = GAME_THEME[g.id];
  return (
    <div
      className="relative min-w-0"
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocusCapture={() => setHold(true)}
      onBlurCapture={() => setHold(false)}
    >
      {/* The current game's colour, very softly, behind the stage. */}
      <div className="home-stage pointer-events-none absolute -inset-x-16 -inset-y-20 -z-10" style={{ "--stage": theme.accent } as React.CSSProperties} aria-hidden />
      <div className="relative overflow-hidden rounded-3xl border border-white/10 shadow-lift" style={{ background: theme.deep }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={g.id} initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.3, 1] }}>
            <GameCover gameId={g.id} className="block aspect-[16/10] w-full" />
          </motion.div>
        </AnimatePresence>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-white/10 px-5 py-4" style={{ color: theme.ink }}>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-semibold tracking-tight">{g.name}</p>
            <p className="truncate text-sm opacity-75">
              {playerRange(g)} · {g.tagline}
            </p>
          </div>
          <Link
            href={`/play/${g.slug}`}
            className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-[#0f0f1a] transition-[filter,transform] hover:brightness-105 active:scale-[0.98]"
            style={{ background: theme.accent }}
          >
            <Play className="size-3.5 fill-current" /> Play {g.name}
          </Link>
        </div>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label="Spotlight">
        {games.map((x, k) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={k === i}
            aria-label={x.name}
            onClick={() => setI(k)}
            className={cn("relative w-20 shrink-0 overflow-hidden rounded-lg border transition-[opacity,border-color] duration-300 sm:w-24", k === i ? "border-white/40" : "border-transparent opacity-50 hover:opacity-90")}
            style={{ background: GAME_THEME[x.id].deep }}
          >
            <GameCover gameId={x.id} className="block aspect-[16/10] w-full" />
            {k === i && !hold && <span key={i} className="absolute inset-x-0 bottom-0 h-0.5 origin-left animate-[spot_7s_linear] bg-white/80" />}
          </button>
        ))}
      </div>
    </div>
  );
}
