"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Dice5, Star, WifiOff } from "lucide-react";
import { HOME, SAFE_SQUARES, type TTEvent, type TTView } from "@platform/engines/token-trail";
import { Avatar, Button, cn } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useCountdown } from "@/lib/realtime/use-countdown";
import { useRoomEvent } from "@/lib/realtime/use-room";
import { sfx } from "@/lib/sound";
import type { GameClientProps } from "../types";
import { BASES, HOME_LANES, SEAT_COLORS, TRACK, tokenCell } from "./board";

const CELL = 40;
const SIZE = CELL * 15;

const DIE_PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

function Die({ value, rolling }: { value: number | null; rolling: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 100 100"
      className="size-16 drop-shadow-lg"
      animate={rolling ? { rotate: [0, 90, 180, 270, 360], scale: [1, 1.1, 1] } : { rotate: 0 }}
      transition={{ duration: 0.5 }}
      aria-label={value ? `Die shows ${value}` : "Die"}
      role="img"
    >
      <rect x="4" y="4" width="92" height="92" rx="20" fill="#fff" stroke="#17142b" strokeOpacity="0.15" strokeWidth="3" />
      {(DIE_PIPS[value ?? 5] ?? []).map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="9" fill={value ? "#17142b" : "#c9c6d8"} />
      ))}
    </motion.svg>
  );
}

function describe(e: TTEvent, name: (id: string) => string): string | null {
  switch (e.kind) {
    case "roll":
      return `${name(e.playerId)} rolled a ${e.value}`;
    case "no-move":
      return `${name(e.playerId)} can't move`;
    case "three-sixes":
      return `Three 6s! ${name(e.playerId)}'s turn ends`;
    case "move":
      return e.captured.length ? `${name(e.playerId)} captured ${e.captured.map((c) => name(c.playerId)).join(", ")}!` : e.to === HOME ? `${name(e.playerId)} brought a token home!` : null;
    case "timeout":
      return `${name(e.playerId)} ran out of time`;
    case "left":
      return `${name(e.playerId)} left the game`;
    case "win":
      return `${name(e.playerId)} wins!`;
  }
}

export function TokenTrailGame({ code, game, selfId, send }: GameClientProps<TTView>) {
  const view = game.view;
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [feed, setFeed] = useState<string[]>([]);
  const me = view.players.find((p) => p.id === selfId);
  const myTurn = view.currentPlayerId === selfId && view.status === "playing";
  const current = view.players.find((p) => p.id === view.currentPlayerId);
  const remaining = useCountdown(view.deadline);
  const nameOf = useMemo(() => {
    const names = new Map(view.players.map((p) => [p.id, p.id === selfId ? "You" : p.name]));
    return (id: string) => names.get(id) ?? "Someone";
  }, [view.players, selfId]);

  useRoomEvent<{ events: TTEvent[] }>(code, "game:action", ({ events }) => {
    for (const e of events) {
      if (e.kind === "roll") {
        setRolling(true);
        setTimeout(() => setRolling(false), 500);
        sfx.dice();
      }
      if (e.kind === "move") (e.captured.length ? sfx.correct : sfx.card)();
      if (e.kind === "win") sfx.win();
      const line = describe(e, nameOf);
      if (line) setFeed((f) => [line, ...f].slice(0, 5));
    }
  });

  const lastTurn = useRef(view.turnNumber);
  useEffect(() => {
    if (view.turnNumber !== lastTurn.current && myTurn) sfx.yourTurn();
    lastTurn.current = view.turnNumber;
  }, [view.turnNumber, myTurn]);

  async function act(event: string, payload: object = {}) {
    if (busy) return;
    setBusy(true);
    const ack = await send(event, payload, true);
    setBusy(false);
    if (!ack.ok && ack.error.code !== "STALE_STATE") toast(ack.error.message, "error");
  }

  const movable = new Set(myTurn && view.phase === "move" ? view.movable : []);

  // Tokens sharing a cell are offset slightly so all of them stay visible and tappable.
  const placed = view.players.flatMap((p) =>
    p.left ? [] : p.tokens.map((progress, i) => ({ player: p, i, progress, cell: tokenCell(p.seat, progress, i) })),
  );
  const stackIndex = new Map<string, number>();
  const offsets = placed.map((t) => {
    const key = `${t.cell[0]},${t.cell[1]}`;
    const n = stackIndex.get(key) ?? 0;
    stackIndex.set(key, n + 1);
    return t.progress >= 0 && t.progress < HOME ? n : 0;
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]" data-testid="token-trail">
      <div className="mx-auto w-full max-w-[640px]">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full rounded-3xl border border-line bg-[#fffaf0] shadow-card dark:bg-[#211d36]" role="img" aria-label="Token Trail board">
          {/* Base yards */}
          {BASES.map(([r, c], seat) => (
            <g key={seat}>
              <rect x={c * CELL + 4} y={r * CELL + 4} width={CELL * 6 - 8} height={CELL * 6 - 8} rx="22" fill={SEAT_COLORS[seat]!.fill} />
              <rect x={c * CELL + CELL} y={r * CELL + CELL} width={CELL * 4} height={CELL * 4} rx="18" fill="#fff" opacity="0.92" />
            </g>
          ))}
          {/* Track */}
          {TRACK.map(([r, c], i) => {
            const startSeat = i % 13 === 0 ? i / 13 : -1;
            return (
              <g key={i}>
                <rect
                  x={c * CELL + 1.5}
                  y={r * CELL + 1.5}
                  width={CELL - 3}
                  height={CELL - 3}
                  rx="7"
                  fill={startSeat >= 0 ? SEAT_COLORS[startSeat]!.soft : "#fff"}
                  stroke="#17142b"
                  strokeOpacity="0.12"
                />
                {SAFE_SQUARES.has(i) && (
                  <path
                    transform={`translate(${c * CELL + CELL / 2} ${r * CELL + CELL / 2}) scale(0.8)`}
                    d="M0,-13 L3.8,-4.2 13,-4 5.8,2.4 8,12 0,6.6 -8,12 -5.8,2.4 -13,-4 -3.8,-4.2Z"
                    fill={startSeat >= 0 ? SEAT_COLORS[startSeat]!.fill : "#c9c6d8"}
                  />
                )}
              </g>
            );
          })}
          {/* Home lanes */}
          {HOME_LANES.map((lane, seat) =>
            lane.map(([r, c], i) => (
              <rect key={`${seat}-${i}`} x={c * CELL + 1.5} y={r * CELL + 1.5} width={CELL - 3} height={CELL - 3} rx="7" fill={SEAT_COLORS[seat]!.fill} opacity="0.85" />
            )),
          )}
          {/* Centre */}
          <g transform={`translate(${CELL * 6} ${CELL * 6})`}>
            {[0, 1, 2, 3].map((seat) => {
              const tri = ["0,0 0,120 60,60", "0,0 120,0 60,60", "120,0 120,120 60,60", "0,120 120,120 60,60"][seat]!;
              return <polygon key={seat} points={tri} fill={SEAT_COLORS[seat]!.fill} />;
            })}
          </g>
          {/* Tokens */}
          {placed.map((t, k) => {
            const seat = SEAT_COLORS[t.player.seat]!;
            const off = offsets[k]! * 6;
            const canMove = t.player.id === selfId && movable.has(t.i);
            const cx = t.cell[1] * CELL + CELL / 2 + off;
            const cy = t.cell[0] * CELL + CELL / 2 - off;
            return (
              <motion.g
                key={`${t.player.id}-${t.i}`}
                initial={false}
                animate={{ x: cx, y: cy }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                onClick={canMove ? () => act("trail:move", { token: t.i }) : undefined}
                style={{ cursor: canMove ? "pointer" : "default" }}
                role={canMove ? "button" : undefined}
                aria-label={canMove ? `Move token ${t.i + 1}` : undefined}
                data-testid={canMove ? `move-token-${t.i}` : undefined}
              >
                {canMove && <circle r="19" fill="none" stroke={seat.deep} strokeWidth="3" className="animate-pulse" />}
                <circle r="14" fill={seat.fill} stroke="#fff" strokeWidth="3" />
                <circle r="6" fill="#fff" opacity="0.85" />
              </motion.g>
            );
          })}
        </svg>
      </div>

      <aside className="space-y-4">
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center gap-4">
            <Die value={view.roll} rolling={rolling} />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold" aria-live="polite">
                {view.status !== "playing" ? "Game over" : myTurn ? (view.phase === "roll" ? "Your roll!" : "Pick a token") : `${current?.name ?? "…"}'s turn`}
              </p>
              {view.deadline && remaining !== null && <p className="text-sm text-ink-muted">{Math.ceil(remaining / 1000)}s left</p>}
            </div>
          </div>
          <Button
            className="mt-4 w-full"
            size="lg"
            disabled={!myTurn || view.phase !== "roll" || busy}
            onClick={() => act("trail:roll")}
            data-testid="roll-button"
          >
            <Dice5 className="size-5" /> Roll the die
          </Button>
        </div>

        <ul className="space-y-2" aria-label="Players">
          {view.players.map((p) => {
            const seat = SEAT_COLORS[p.seat]!;
            const home = p.tokens.filter((t) => t === HOME).length;
            return (
              <li
                key={p.id}
                className={cn("flex items-center gap-3 rounded-2xl border px-3 py-2", p.id === view.currentPlayerId ? "border-brand-400 bg-brand-500/10" : "border-line bg-surface", p.left && "opacity-40")}
              >
                <span className="size-3 rounded-full" style={{ background: seat.fill }} aria-label={`${seat.name} tokens`} />
                <Avatar name={p.name} color={p.color} size={30} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {p.name}
                  {p.id === selfId && " (you)"}
                </span>
                {!p.connected && !p.left && <WifiOff className="size-4 text-sun" aria-label="Offline" />}
                <span className="inline-flex items-center gap-1 text-xs font-bold text-ink-muted" title="Tokens home">
                  <Star className="size-3.5" /> {home}/{p.tokens.length}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="rounded-2xl border border-line bg-surface p-4 text-sm" aria-live="polite">
          <p className="mb-2 font-semibold">Latest</p>
          {feed.length ? (
            <ul className="space-y-1 text-ink-muted">
              {feed.map((line, i) => (
                <li key={i} className={i === 0 ? "font-semibold text-ink" : undefined}>
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-muted">Roll a 6 to bring your first token out.</p>
          )}
          {me && <p className="mt-3 text-xs text-ink-faint">You play {SEAT_COLORS[me.seat]!.name}. Stars are safe squares.</p>}
        </div>
      </aside>
    </div>
  );
}
