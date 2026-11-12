"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowDown, Check, Crown, RotateCcw } from "lucide-react";
import type { Ack, MatchResults, RoomSnapshot } from "@platform/shared";
import { sfx } from "@/lib/sound";
import { GAME_THEME } from "../game-theme";
import { Avatar, cn } from "../ui/primitives";

/**
 * The end-of-match sequence for multiplayer games. Everything shown comes
 * from the server's MatchResults; this only presents it: a headline for this
 * player (victory, placement or defeat), a podium, scores that count up,
 * game-specific stats, and a rematch button wired to the room's ready/start.
 */

const REASON_COPY: Record<MatchResults["reason"], string> = {
  completed: "Match complete",
  "players-left": "Match ended — the other players left",
  aborted: "Match ended",
};

const DETAIL_LABEL: Record<string, string> = {
  cardsLeft: "cards left",
  knockouts: "knockouts",
  falls: "falls",
  home: "tokens home",
  captures: "captures",
};

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

function CountUp({ value, delay, tick }: { value: number; delay: number; tick?: boolean }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0;
    let lastTick = 0;
    const start = performance.now() + delay * 1000;
    const step = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - start) / 900));
      setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (tick && k > 0 && k < 1 && now - lastTick > 70) {
        lastTick = now;
        sfx.countTick();
      }
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, delay, tick]);
  return <>{shown}</>;
}

function Confetti({ colors }: { colors: string[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: 46 }, (_, i) => {
        const x = (i * 37) % 100;
        return (
          <motion.span
            key={i}
            className="absolute top-0 block h-3 w-2 rounded-[2px]"
            style={{ left: `${x}%`, background: colors[i % colors.length] }}
            initial={{ y: -30, rotate: 0, opacity: 1 }}
            animate={{ y: 420 + (i % 5) * 40, rotate: 360 * ((i % 3) + 1) * (i % 2 ? 1 : -1), x: ((i % 7) - 3) * 18, opacity: [1, 1, 0] }}
            transition={{ duration: 2.4 + (i % 4) * 0.3, delay: 0.25 + (i % 10) * 0.05, ease: "easeIn" }}
          />
        );
      })}
    </div>
  );
}

export function ResultsPanel({ results, selfId, room, send }: { results: MatchResults; selfId: string; room?: RoomSnapshot; send?: (event: string, payload?: unknown) => Promise<Ack> }) {
  const theme = GAME_THEME[results.gameId];
  const me = results.entries.find((e) => e.playerId === selfId);
  const winners = results.entries.filter((e) => e.isWinner);
  const iWon = !!me?.isWinner;
  const sorted = [...results.entries].sort((a, b) => a.placement - b.placement);
  const podium = sorted.slice(0, 3);
  const played = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (played.current) return;
    played.current = true;
    const id = setTimeout(() => (iWon ? sfx.fanfare() : me ? sfx.defeat() : sfx.win()), 250);
    return () => clearTimeout(id);
  }, [iWon, me]);

  const headline = iWon ? (winners.length > 1 ? "Shared victory!" : "Victory!") : me ? (me.placement <= 3 && results.entries.length > 2 ? `${ORDINAL[me.placement]} place` : "Defeat") : `${winners.map((w) => w.name).join(" & ")} ${winners.length > 1 ? "win" : "wins"}!`;
  const sub = iWon ? "You win! 🎉" : winners.length ? `${winners.map((w) => (w.playerId === selfId ? "You" : w.name)).join(" & ")} ${winners.length > 1 ? "win" : "wins"}!` : REASON_COPY[results.reason];

  // Rematch: guests ready up; the host starts once everyone is ready.
  const isHost = room?.hostId === selfId;
  const meInRoom = room?.players.find((p) => p.id === selfId);
  const othersReady = room ? room.players.filter((p) => p.id !== room.hostId).every((p) => p.ready && p.connected) : false;
  const enough = room ? room.players.length >= room.minPlayers : false;
  const rematch = async () => {
    if (!send || !room) return;
    setBusy(true);
    await (isHost ? send("game:start") : send("room:ready", { ready: !meInRoom?.ready }));
    setBusy(false);
  };
  const rematchLabel = isHost ? (enough && othersReady ? "Rematch" : enough ? "Waiting for rematch votes…" : "Waiting for players…") : meInRoom?.ready ? "Ready — waiting for host" : "Rematch";

  return (
    <section className="relative mb-6 overflow-hidden rounded-[28px] border shadow-[0_24px_60px_-30px_rgb(0_0_0/0.9)]" style={{ borderColor: theme.accent, background: theme.deep, color: theme.ink }} data-testid="results">
      {iWon && <Confetti colors={[theme.accent, "#ffb23d", "#2fd6a8", "#ff4f8b", "#fff"]} />}
      <div className="relative px-5 pt-7 pb-4 text-center sm:px-8">
        <p className="text-xs font-semibold tracking-[0.3em] uppercase opacity-70">{REASON_COPY[results.reason]}</p>
        <motion.h2
          initial={{ scale: 2.2, opacity: 0, rotate: -6 }}
          animate={{ scale: 1, opacity: 1, rotate: iWon ? -2 : 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 15 }}
          className={cn("mt-1 font-display text-5xl font-semibold tracking-tight sm:text-6xl", !iWon && me && "opacity-90")}
          style={{ color: iWon ? theme.accent : theme.ink, textShadow: iWon ? `0 0 34px ${theme.accent}88, 0 5px 0 rgb(0 0 0 / 0.45)` : "0 4px 0 rgb(0 0 0 / 0.4)" }}
        >
          {headline}
        </motion.h2>
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 0.85, y: 0 }} transition={{ delay: 0.35 }} className="mt-1 font-display text-xl font-bold">
          {sub}
        </motion.p>
        {me && !iWon && (
          <p className="mt-1 text-sm opacity-70">
            You finished {ORDINAL[me.placement]} of {results.entries.length}
          </p>
        )}
      </div>

      {/* Podium */}
      {podium.length > 1 && (
        <div className="relative mx-auto flex max-w-lg items-end justify-center gap-2 px-4 sm:gap-4" aria-hidden>
          {[podium[1], podium[0], podium[2]].map((e, slot) => {
            if (!e) return <span key={slot} className="w-24" />;
            const h = e.placement === 1 ? 92 : e.placement === 2 ? 66 : 48;
            return (
              <motion.div key={e.playerId} className="flex w-24 flex-col items-center sm:w-28" initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.45 + (3 - e.placement) * 0.15, type: "spring", stiffness: 240, damping: 18 }}>
                {e.placement === 1 && <Crown className="mb-1 size-7 fill-current" style={{ color: theme.accent }} />}
                <div className={cn("rounded-full p-0.5", e.playerId === selfId && "ring-4")} style={{ "--tw-ring-color": theme.accent } as React.CSSProperties}>
                  <Avatar name={e.name} color={e.color} size={e.placement === 1 ? 52 : 42} />
                </div>
                <p className="mt-1 max-w-full truncate text-xs font-bold">{e.playerId === selfId ? "You" : e.name}</p>
                <div className="mt-1 flex w-full flex-col items-center justify-start rounded-t-xl border border-b-0 border-white/10 pt-2" style={{ height: h, background: e.placement === 1 ? `${theme.accent}40` : "rgb(255 255 255 / 0.06)" }}>
                  <span className="font-display text-2xl font-semibold">{e.placement}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Standings */}
      <ol className="relative border-t-2 border-white/10 bg-black/20">
        {sorted.map((e, i) => (
          <motion.li key={e.playerId} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7 + i * 0.08 }} className={cn("flex items-center gap-3 px-4 py-2.5 sm:px-6", e.playerId === selfId && "bg-white/8")}>
            <span className="w-8 text-center font-display text-lg font-semibold" style={{ color: e.placement === 1 ? theme.accent : undefined, opacity: e.placement === 1 ? 1 : 0.6 }}>
              {e.placement === 1 ? <Crown className="mx-auto size-5 fill-current" aria-label="1st" /> : ORDINAL[e.placement]}
            </span>
            <Avatar name={e.name} color={e.color} size={32} />
            <span className="min-w-0 flex-1 truncate font-semibold">
              {e.name} {e.playerId === selfId && <span className="opacity-60">(you)</span>}
            </span>
            <span className="hidden gap-1.5 sm:flex">
              {Object.entries(e.details ?? {})
                .filter(([k]) => DETAIL_LABEL[k])
                .map(([k, v]) => (
                  <span key={k} className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold opacity-85">
                    {v} {DETAIL_LABEL[k]}
                  </span>
                ))}
            </span>
            <span className="min-w-16 text-right font-display text-lg font-semibold tabular-nums" aria-label={`${e.score} points`}>
              <span aria-hidden>
                <CountUp value={e.score} delay={0.8 + i * 0.08} tick={e.playerId === selfId} />
              </span>
              {/* The final, server-computed score (the visible number counts up to it). */}
              <span className="sr-only" data-testid={`score-${e.playerId}`}>
                {e.score}
              </span>{" "}
              pts
            </span>
          </motion.li>
        ))}
      </ol>

      {room && send && (
        <div className="relative flex flex-wrap items-center justify-center gap-3 border-t-2 border-white/10 px-4 py-4">
          <button
            type="button"
            onClick={rematch}
            disabled={busy || (isHost && !(enough && othersReady))}
            data-testid="rematch"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-display font-semibold text-[#17142b] transition disabled:opacity-60 disabled:hover:translate-y-0"
            style={{ background: theme.accent }}
          >
            {meInRoom?.ready && !isHost ? <Check className="size-5" /> : <RotateCcw className="size-5" />} {rematchLabel}
          </button>
          <button
            type="button"
            onClick={() => document.getElementById("room-lobby")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 font-bold transition hover:border-white/50"
          >
            <ArrowDown className="size-4" /> Back to the lobby
          </button>
        </div>
      )}
    </section>
  );
}
