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
 * The homepage marquee: one game at a time, large, in its own colours, with
 * a strip of the other covers to jump between them. Cycles every 6 s unless
 * the player is interacting with it (or prefers reduced motion).
 */
export function HeroSpotlight({ games }: { games: GameMeta[] }) {
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (hold || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((n) => (n + 1) % games.length), 6000);
    return () => clearInterval(id);
  }, [hold, games.length]);
  const g = games[i]!;
  const theme = GAME_THEME[g.id];
  return (
    <div className="relative min-w-0" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocusCapture={() => setHold(true)} onBlurCapture={() => setHold(false)}>
      <div className="relative overflow-hidden rounded-[28px] border-[3px] shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)] transition-colors duration-500" style={{ borderColor: theme.accent, background: theme.deep }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={g.id} initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: [0.2, 0.8, 0.3, 1] }}>
            <GameCover gameId={g.id} className="block aspect-[16/10] w-full" />
          </motion.div>
        </AnimatePresence>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5" style={{ color: theme.ink }}>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black tracking-[0.2em] uppercase opacity-70">{playerRange(g)}</p>
            <p className="truncate text-sm font-semibold opacity-90">{g.tagline}</p>
          </div>
          <Link href={`/play/${g.slug}`} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-display text-sm font-black text-[#17142b] shadow-[0_4px_0_rgb(0_0_0/0.35)] transition hover:-translate-y-0.5 active:translate-y-0.5" style={{ background: theme.accent }}>
            <Play className="size-4 fill-current" /> Play {g.name}
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
            className={cn("relative w-20 shrink-0 overflow-hidden rounded-xl border-2 transition sm:w-24", k === i ? "scale-105" : "border-transparent opacity-60 hover:opacity-100")}
            style={{ borderColor: k === i ? GAME_THEME[x.id].accent : undefined }}
          >
            <GameCover gameId={x.id} className="block aspect-[16/10] w-full" />
            {k === i && !hold && <span key={i} className="absolute inset-x-0 bottom-0 h-1 origin-left animate-[spot_6s_linear]" style={{ background: GAME_THEME[x.id].accent }} />}
          </button>
        ))}
      </div>
    </div>
  );
}
