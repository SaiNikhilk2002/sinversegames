"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RotateCcw, RotateCw, WifiOff } from "lucide-react";
import { CARD_COLORS, COLOR_META, describeCard, type CardColor, type CCPublicAction, type CCView } from "@platform/engines/color-clash/client";
import { Avatar, Button, cn } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useCountdown } from "@/lib/realtime/use-countdown";
import { useRoomEvent } from "@/lib/realtime/use-room";
import { sfx } from "@/lib/sound";
import type { GameClientProps } from "../types";
import { CardBack, PlayingCard } from "./playing-card";

type Seat = "top" | "left" | "right";
const SEATS: Record<number, Seat[]> = { 1: ["top"], 2: ["left", "right"], 3: ["left", "top", "right"] };

function describeAction(a: CCPublicAction, name: (id: string) => string): string | null {
  switch (a.kind) {
    case "play":
      return `${name(a.playerId)} played ${describeCard(a.card)}${a.chosenColor ? ` → ${COLOR_META[a.chosenColor].label}` : ""}`;
    case "draw":
      return a.penalty ? `${name(a.playerId)} draws ${a.count}!` : `${name(a.playerId)} drew ${a.count === 1 ? "a card" : `${a.count} cards`}`;
    case "skipped":
      return `${name(a.playerId)} is blocked`;
    case "flip":
      return "Direction flipped";
    case "timeout":
      return `${name(a.playerId)} ran out of time`;
    case "reshuffle":
      return "Discard pile reshuffled into the deck";
    case "left":
      return `${name(a.playerId)} left the game`;
    default:
      return null;
  }
}

export function ColorClashGame({ code, game, send, selfId }: GameClientProps<CCView>) {
  const view = game.view;
  const toast = useToast();
  const me = view.you;
  const isMyTurn = !!me?.isTurn;
  const [pendingWild, setPendingWild] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ id: number; text: string }[]>([]);
  const [effect, setEffect] = useState<{ id: number; kind: "block" | "flip" | "plus2" | "prism" | "prism4"; color: string } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const logId = useRef(0);
  const remaining = useCountdown(view.turnDeadline);
  const playable = useMemo(() => new Set(me?.playableIds ?? []), [me?.playableIds]);
  const nameOf = (id: string) => (id === selfId ? "You" : view.players.find((p) => p.id === id)?.name ?? "Someone");

  // Opponents in turn order starting after me, placed around the table.
  const opponents = useMemo(() => {
    const myIdx = Math.max(0, view.players.findIndex((p) => p.id === selfId));
    const ordered = [...view.players.slice(myIdx + 1), ...view.players.slice(0, myIdx)].filter((p) => p.id !== selfId);
    const seats = SEATS[ordered.length] ?? [];
    return ordered.map((p, i) => ({ ...p, seat: seats[i] ?? ("top" as Seat) }));
  }, [view.players, selfId]);

  useEffect(() => {
    if (isMyTurn) sfx.yourTurn();
  }, [isMyTurn, view.turnNumber]);
  useEffect(() => {
    if (!effect) return;
    const id = setTimeout(() => setEffect(null), 1100);
    return () => clearTimeout(id);
  }, [effect]);

  useRoomEvent<{ actions: CCPublicAction[] }>(code, "game:action", ({ actions }) => {
    const play = actions.find((a) => a.kind === "play");
    if (play && play.kind === "play") {
      const k = play.card.kind;
      const color = COLOR_META[play.chosenColor ?? play.card.color ?? "ember"].hex;
      if (k === "number") sfx.cardPlace();
      else {
        setEffect({ id: Date.now(), kind: k, color });
        if (k === "block") sfx.knock();
        else if (k === "flip") sfx.whoosh();
        else if (k === "plus2" || k === "prism4") {
          sfx.impact(k === "prism4" ? 0.9 : 0.6);
          tableRef.current?.animate([{ transform: "none" }, { transform: "translate(-4px,2px)" }, { transform: "translate(4px,-2px)" }, { transform: "none" }], { duration: 260 });
        } else sfx.powerup();
      }
    } else if (actions.some((a) => a.kind === "draw")) sfx.draw();
    const lines = actions.map((a) => describeAction(a, nameOf)).filter((x): x is string => !!x);
    setLog((l) => [...l, ...lines.map((text) => ({ id: ++logId.current, text }))].slice(-4));
  });

  async function act(event: string, payload: unknown = {}) {
    setBusy(true);
    const ack = await send(event, payload, true);
    setBusy(false);
    // A stale-state rejection just means the view was a beat behind; the fresh state is already on its way.
    if (!ack.ok && ack.error.code !== "STALE_STATE") toast(ack.error.message, "warning");
  }

  function playCard(cardId: string) {
    if (!isMyTurn || busy) return;
    if (!playable.has(cardId)) return toast("That card doesn't match the pile", "warning");
    const card = me!.hand.find((c) => c.id === cardId)!;
    if (card.color === null) setPendingWild(cardId);
    else void act("card:play", { cardId });
  }

  const current = view.players.find((p) => p.id === view.currentPlayerId);
  const activeHex = COLOR_META[view.activeColor].hex;
  const secondsLeft = remaining === null ? null : Math.ceil(remaining / 1000);
  const timerFraction = remaining !== null && view.turnDeadline ? Math.min(1, remaining / Math.max(1, view.turnDeadline - view.turnStartedAt)) : null;

  return (
    <div className="flex flex-col gap-4" data-testid="color-clash">
      {/* Table */}
      <div
        ref={tableRef}
        className="cc-table relative grid min-h-[300px] grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr] gap-3 overflow-hidden rounded-[2.25rem] border-[7px] border-[#3a2216] p-3 shadow-[inset_0_0_0_2px_#5a3a24,inset_0_0_60px_rgb(0_0_0/0.55),0_14px_30px_-12px_rgb(0_0_0/0.7)] sm:min-h-[360px] sm:p-5"
        style={{ "--cc-glow": `${activeHex}55` } as React.CSSProperties}
      >
        {/* Opponents */}
        <div className="col-span-3 flex flex-wrap justify-center gap-2 sm:hidden">
          {opponents.map((p) => (
            <Opponent key={p.id} p={p} active={p.id === view.currentPlayerId} compact />
          ))}
        </div>
        <div className="col-start-2 row-start-1 hidden justify-center sm:flex">
          {opponents.filter((p) => p.seat === "top").map((p) => <Opponent key={p.id} p={p} active={p.id === view.currentPlayerId} />)}
        </div>
        <div className="col-start-1 row-start-2 hidden items-center sm:flex">
          {opponents.filter((p) => p.seat === "left").map((p) => <Opponent key={p.id} p={p} active={p.id === view.currentPlayerId} />)}
        </div>
        <div className="col-start-3 row-start-2 hidden items-center sm:flex">
          {opponents.filter((p) => p.seat === "right").map((p) => <Opponent key={p.id} p={p} active={p.id === view.currentPlayerId} />)}
        </div>

        {/* Centre: draw pile + discard */}
        <div className="col-span-3 row-start-2 flex flex-col items-center justify-center gap-4 sm:col-span-1 sm:col-start-2">
          <div className="flex items-center gap-6 sm:gap-10">
            <button
              type="button"
              onClick={() => isMyTurn && !me?.drawnCardId && act("card:draw")}
              disabled={!isMyTurn || !!me?.drawnCardId || busy}
              aria-label={`Draw a card (${view.drawPileCount} left)`}
              data-testid="draw-pile"
              className={cn("relative rounded-[14px] transition", isMyTurn && !me?.drawnCardId && "hover:-translate-y-1 animate-pulse-ring")}
            >
              <span className="absolute top-1.5 left-1.5 opacity-60" aria-hidden>
                <CardBack size="lg" />
              </span>
              <CardBack size="lg" count={view.drawPileCount} />
            </button>
            <div className="relative">
              <svg viewBox="0 0 200 200" className={cn("pointer-events-none absolute top-1/2 left-1/2 size-[230%] -translate-x-1/2 -translate-y-1/2 opacity-60", view.direction === 1 ? "cc-spin" : "cc-spin-rev")} aria-hidden>
                <circle cx="100" cy="100" r="88" fill="none" stroke={activeHex} strokeWidth="2" strokeDasharray="10 14" />
                {[0, 120, 240].map((a) => (
                  <path key={a} transform={`rotate(${a} 100 100)`} d={view.direction === 1 ? "M100 6 l9 6 l-9 6" : "M100 6 l-9 6 l9 6"} fill="none" stroke={activeHex} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                ))}
              </svg>
              <span className="absolute -inset-3 rounded-[22px] opacity-70 blur-md transition-colors duration-500" style={{ background: activeHex }} aria-hidden />
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={view.topCard.id}
                  initial={{ y: -60, rotate: -18, opacity: 0, scale: 0.8 }}
                  animate={{ y: 0, rotate: 0, opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 26 }}
                  className="relative"
                >
                  <PlayingCard card={view.topCard} size="lg" testId="top-card" />
                </motion.div>
              </AnimatePresence>
              <AnimatePresence>{effect && <CardEffect key={effect.id} kind={effect.kind} color={effect.color} />}</AnimatePresence>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-semibold text-white">
            <span className="inline-flex items-center gap-2 rounded-full bg-black/35 px-3 py-1.5" data-testid="active-color">
              <span className="size-3.5 rounded-full ring-2 ring-white" style={{ background: activeHex }} /> {COLOR_META[view.activeColor].label}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1.5" aria-label={view.direction === 1 ? "Clockwise" : "Counter-clockwise"}>
              {view.direction === 1 ? <RotateCw className="size-4" /> : <RotateCcw className="size-4" />}
              {view.direction === 1 ? "Clockwise" : "Reversed"}
            </span>
            {view.pendingDraw > 0 && <span className="rounded-full bg-danger px-3 py-1.5">+{view.pendingDraw} pending</span>}
          </div>
          <ul className="flex min-h-14 flex-col items-center gap-0.5 text-center text-xs text-white/70" aria-live="polite">
            {log.slice(-3).map((l) => (
              <li key={l.id}>{l.text}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Turn banner */}
      <div className={cn("relative overflow-hidden rounded-2xl border px-4 py-3", isMyTurn ? "border-brand-400 bg-brand-500/15" : "border-line bg-surface")} role="status" data-testid="turn-banner">
        {timerFraction !== null && (
          <span className={cn("absolute inset-y-0 left-0 transition-[width] duration-300", (secondsLeft ?? 99) <= 5 ? "bg-danger/25" : "bg-brand-500/15")} style={{ width: `${timerFraction * 100}%` }} aria-hidden />
        )}
        <div className="relative flex flex-wrap items-center gap-3">
          <p className="font-display text-lg font-bold">
            {isMyTurn ? (me?.drawnCardId ? "Play the card you drew, or pass" : view.pendingDraw ? `Stack a draw card or take ${view.pendingDraw}` : "Your turn!") : `${current?.name ?? "…"}'s turn`}
          </p>
          {secondsLeft !== null && <span className="font-mono text-sm text-ink-muted">{secondsLeft}s</span>}
          <div className="ml-auto flex gap-2">
            {isMyTurn && !me?.drawnCardId && (
              <Button variant="secondary" onClick={() => act("card:draw")} disabled={busy} data-testid="draw-button">
                {view.pendingDraw ? `Take ${view.pendingDraw}` : "Draw"}
              </Button>
            )}
            {isMyTurn && me?.drawnCardId && (
              <Button variant="secondary" onClick={() => act("card:pass")} disabled={busy} data-testid="pass-button">
                Pass
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Hand */}
      {me && (
        <section aria-label="Your hand" className="rounded-[2rem] border border-line bg-surface p-3 sm:p-4">
          <p className="mb-2 px-1 text-sm font-semibold text-ink-muted">
            Your hand · {me.hand.length} {me.hand.length === 1 ? "card" : "cards"}
          </p>
          <div className="scrollbar-none -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pt-5 pb-2 sm:flex-wrap sm:justify-center sm:overflow-visible" data-testid="hand">
            <AnimatePresence initial={false}>
              {me.hand.map((card, i) => {
                const n = me.hand.length;
                const mid = (n - 1) / 2;
                const spread = Math.min(5, 36 / Math.max(1, n));
                const lift = isMyTurn && playable.has(card.id) ? -12 : 0;
                return (
                // Layout (sliding along the hand) and the fan (tilt and lift) live on separate
                // elements: measuring layout on a rotated element never settles.
                <motion.div key={card.id} layout exit={{ y: -140, opacity: 0, scale: 0.8 }} transition={{ type: "spring", stiffness: 600, damping: 40 }} className="snap-start sm:-ml-3 sm:first:ml-0">
                  <motion.div
                    initial={{ y: -160, x: -60, opacity: 0, rotate: -20 }}
                    animate={{ y: Math.abs(i - mid) * Math.abs(i - mid) * 0.9 + lift, x: 0, opacity: 1, rotate: (i - mid) * spread }}
                    transition={{ type: "spring", stiffness: 600, damping: 36 }}
                    className="origin-bottom"
                  >
                  <PlayingCard
                    card={card}
                    size="md"
                    playable={isMyTurn && playable.has(card.id)}
                    dimmed={isMyTurn && !playable.has(card.id)}
                    selected={me.drawnCardId === card.id}
                    onClick={() => playCard(card.id)}
                    testId={`hand-card-${card.id}`}
                  />
                  </motion.div>
                </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </section>
      )}

      <Modal open={!!pendingWild} onClose={() => setPendingWild(null)} title="Choose the next colour">
        <div className="grid grid-cols-2 gap-3" data-testid="color-picker">
          {CARD_COLORS.map((c: CardColor) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                const id = pendingWild!;
                setPendingWild(null);
                void act("card:play", { cardId: id, chosenColor: c });
              }}
              className="flex h-20 items-center justify-center rounded-2xl font-display text-lg font-bold text-white shadow-lg transition hover:scale-[1.03]"
              style={{ background: `linear-gradient(150deg, ${COLOR_META[c].hex}, ${COLOR_META[c].deep})` }}
            >
              {COLOR_META[c].label}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function Opponent({ p, active, compact }: { p: CCView["players"][number]; active: boolean; compact?: boolean }) {
  const cardsLabel = p.cardCount === 1 ? "1 card" : `${p.cardCount} cards`;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-3 py-2 text-white transition",
        active ? "border-white/80 bg-white/15 shadow-[0_0_24px_rgb(255_255_255/0.25)]" : "border-white/10 bg-black/25",
        p.left && "opacity-40",
        compact ? "flex-row" : "flex-col",
      )}
      data-testid={`opponent-${p.id}`}
    >
      <div className="flex items-center gap-2">
        <Avatar name={p.name} color={p.color} size={compact ? 30 : 40} ring={active} />
        <div className="min-w-0">
          <p className="max-w-24 truncate text-sm font-bold">{p.name}</p>
          <p className="text-xs text-white/70">
            {p.left ? "Left" : !p.connected ? (
              <span className="inline-flex items-center gap-1 text-sun">
                <WifiOff className="size-3" /> Offline
              </span>
            ) : active ? `Playing… · ${cardsLabel}` : cardsLabel}
          </p>
        </div>
      </div>
      {!compact && (
        <div className="flex -space-x-8" aria-label={cardsLabel}>
          {Array.from({ length: Math.min(p.cardCount, 7) }, (_, i) => (
            <CardBack key={i} size="sm" className="!shadow-md" />
          ))}
        </div>
      )}
      {compact && <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-bold">{p.cardCount}</span>}
    </div>
  );
}

/** A short burst over the discard pile for action cards. */
function CardEffect({ kind, color }: { kind: "block" | "flip" | "plus2" | "prism" | "prism4"; color: string }) {
  return (
    <motion.div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} aria-hidden>
      <motion.span className="absolute size-40 rounded-full border-[6px]" style={{ borderColor: color }} initial={{ scale: 0.3, opacity: 1 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 0.7, ease: "easeOut" }} />
      {kind === "block" && (
        <motion.svg viewBox="0 0 100 100" className="size-28 drop-shadow-[0_4px_0_rgb(0_0_0/0.4)]" initial={{ scale: 2.4, rotate: -30, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
          <circle cx="50" cy="50" r="40" fill="#fff" stroke="#17142b" strokeWidth="6" />
          <circle cx="50" cy="50" r="28" fill="none" stroke={color} strokeWidth="10" />
          <path d="M30 70 L70 30" stroke={color} strokeWidth="10" strokeLinecap="round" />
        </motion.svg>
      )}
      {kind === "flip" && (
        <motion.svg viewBox="0 0 100 100" className="size-28" initial={{ rotate: 0, scale: 0.6 }} animate={{ rotate: 360, scale: 1 }} transition={{ duration: 0.8, ease: [0.3, 0.7, 0.3, 1] }}>
          <path d="M50 14 A36 36 0 0 1 86 50" fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" />
          <path d="M80 36 L88 52 L72 50 Z" fill="#fff" />
          <path d="M50 86 A36 36 0 0 1 14 50" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" />
          <path d="M20 64 L12 48 L28 50 Z" fill={color} />
        </motion.svg>
      )}
      {(kind === "plus2" || kind === "prism4") && (
        <motion.span
          className="font-display text-7xl font-black text-white"
          style={{ WebkitTextStroke: "3px #17142b", textShadow: `0 6px 0 #17142b, 0 0 30px ${color}` }}
          initial={{ scale: 3, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: -6, opacity: 1 }}
          transition={{ type: "spring", stiffness: 460, damping: 16 }}
        >
          {kind === "plus2" ? "+2" : "+4"}
        </motion.span>
      )}
      {(kind === "prism" || kind === "prism4") &&
        ["#ff4f5e", "#3d8bff", "#2fbf6f", "#ffc23d"].map((c, i) => (
          <motion.span
            key={c}
            className="absolute size-6 rounded-full"
            style={{ background: c }}
            initial={{ x: 0, y: 0, scale: 0.5 }}
            animate={{ x: Math.cos((i / 4) * Math.PI * 2 + 0.6) * 110, y: Math.sin((i / 4) * Math.PI * 2 + 0.6) * 80, scale: 1.2, opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        ))}
    </motion.div>
  );
}
