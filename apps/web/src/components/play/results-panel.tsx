"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { Medal, Trophy } from "lucide-react";
import type { MatchResults } from "@platform/shared";
import { Avatar, Card, cn } from "../ui/primitives";
import { sfx } from "@/lib/sound";

const REASON_COPY: Record<MatchResults["reason"], string> = {
  completed: "Match complete",
  "players-left": "Match ended — other players left",
  aborted: "Match ended",
};

export function ResultsPanel({ results, selfId }: { results: MatchResults; selfId: string }) {
  const winners = results.entries.filter((e) => e.isWinner);
  const iWon = winners.some((w) => w.playerId === selfId);
  useEffect(() => {
    if (iWon) sfx.win();
  }, [iWon]);

  return (
    <Card className="mb-6 overflow-hidden" data-testid="results">
      <div className="relative bg-brand-gradient px-6 py-8 text-center text-white">
        <Trophy className="mx-auto size-12" aria-hidden />
        <p className="mt-2 text-sm font-semibold text-white/80">{REASON_COPY[results.reason]}</p>
        <h2 className="font-display text-3xl font-extrabold">
          {iWon ? "You win! 🎉" : winners.length ? `${winners.map((w) => w.name).join(" & ")} ${winners.length > 1 ? "win" : "wins"}!` : "Game over"}
        </h2>
      </div>
      <ol className="divide-y divide-line">
        {results.entries.map((e, i) => (
          <motion.li
            key={e.playerId}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className={cn("flex items-center gap-4 px-5 py-3", e.playerId === selfId && "bg-brand-500/8")}
          >
            <span className={cn("w-8 text-center font-display text-xl font-extrabold", e.placement === 1 ? "text-sun" : "text-ink-faint")}>
              {e.placement === 1 ? <Medal className="mx-auto size-6" aria-label="1st" /> : `${e.placement}`}
            </span>
            <Avatar name={e.name} color={e.color} size={36} />
            <span className="flex-1 truncate font-semibold">
              {e.name} {e.playerId === selfId && <span className="text-ink-faint">(you)</span>}
            </span>
            {typeof e.details?.cardsLeft === "number" && <span className="text-sm text-ink-muted">{e.details.cardsLeft} cards left</span>}
            <span className="min-w-16 text-right font-display text-lg font-bold" data-testid={`score-${e.playerId}`}>
              {e.score} pts
            </span>
          </motion.li>
        ))}
      </ol>
    </Card>
  );
}
