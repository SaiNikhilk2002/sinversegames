"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Dice5, Star, WifiOff } from "lucide-react";
import { HOME, SAFE_SQUARES, type TTEvent, type TTView } from "@platform/engines/token-trail";
import { Avatar, Button, cn } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useCountdown } from "@/lib/realtime/use-countdown";
import { useRoomEvent } from "@/lib/realtime/use-room";
import { sfx } from "@/lib/sound";
import type { GameClientProps } from "../types";
import { BASES, HOME_LANES, SEAT_COLORS, TRACK, tokenCell, type Cell } from "./board";

/**
 * Token Trail: a tabletop board under a warm lamp. Walnut frame, painted
 * squares, felt base yards, pawns that hop square by square and a 3D die that
 * tumbles onto the value the server rolled. All moves come from the server;
 * the hop animation only replays the path between two server states.
 */

const CELL = 40;
const SIZE = CELL * 15;
const FRAME = 18;
const HOP_MS = 150;
const INK = "#2b1a10";

const DIE_PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

/** Cube rotation that shows each value on the front face. */
const FACE_ROT: Record<number, [number, number]> = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [180, 0] };

function DieFace({ value, transform }: { value: number; transform: string }) {
  return (
    <div className="absolute inset-0 rounded-[18%] border border-[#e6dccb] bg-[#fffdf7] shadow-[inset_0_-6px_10px_rgb(0_0_0/0.10),inset_0_4px_6px_rgb(255_255_255/0.9)] [backface-visibility:hidden]" style={{ transform }}>
      <svg viewBox="0 0 100 100" className="size-full">
        {DIE_PIPS[value]!.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="9" fill={value === 1 ? "#d23a4f" : "#22161f"} />
        ))}
      </svg>
    </div>
  );
}

/** A real cube: tumbles a few turns and settles on `value`. */
function Die3D({ value, rollId }: { value: number | null; rollId: number }) {
  const [rx, ry] = FACE_ROT[value ?? 5]!;
  const spins = rollId * 2;
  const half = 32;
  return (
    <div className="relative size-16 [perspective:420px]" role="img" aria-label={value ? `Die shows ${value}` : "Die"}>
      <motion.div
        className="relative size-full [transform-style:preserve-3d]"
        initial={false}
        animate={{ rotateX: rx + spins * 360, rotateY: ry + spins * 360 + (rollId % 2) * 360, y: [0, -26, 0, -8, 0] }}
        transition={{ duration: rollId ? 0.95 : 0, ease: [0.2, 0.75, 0.25, 1], y: { duration: rollId ? 0.95 : 0, times: [0, 0.35, 0.65, 0.82, 1] } }}
      >
        <DieFace value={1} transform={`translateZ(${half}px)`} />
        <DieFace value={6} transform={`rotateX(180deg) translateZ(${half}px)`} />
        <DieFace value={2} transform={`rotateY(90deg) translateZ(${half}px)`} />
        <DieFace value={5} transform={`rotateY(-90deg) translateZ(${half}px)`} />
        <DieFace value={3} transform={`rotateX(90deg) translateZ(${half}px)`} />
        <DieFace value={4} transform={`rotateX(-90deg) translateZ(${half}px)`} />
      </motion.div>
      <div className="absolute -bottom-2 left-1/2 h-2.5 w-14 -translate-x-1/2 rounded-full bg-black/35 blur-[3px]" />
    </div>
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

const centre = ([r, c]: Cell) => ({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 });

/** The squares a token passes through between two progress values. */
function pathBetween(seat: number, from: number, to: number, index: number): Cell[] {
  if (to < 0) return [tokenCell(seat, to, index)];
  if (from < 0) return [tokenCell(seat, from, index), tokenCell(seat, 0, index), ...(to > 0 ? pathBetween(seat, 0, to, index).slice(1) : [])];
  const cells: Cell[] = [];
  for (let s = from; s <= to; s++) cells.push(tokenCell(seat, s, index));
  return cells;
}

/** A painted pawn seen from above at a slight angle. */
function Pawn({ fill, deep }: { fill: string; deep: string }) {
  return (
    <g>
      <ellipse cx="0" cy="9" rx="15" ry="6" fill="rgb(0 0 0 / 0.35)" />
      <ellipse cx="0" cy="5" rx="15" ry="8" fill={deep} stroke={INK} strokeWidth="2" />
      <path d="M-9 4 C -9 -8, 9 -8, 9 4 z" fill={fill} stroke={INK} strokeWidth="2" />
      <circle cx="0" cy="-11" r="8" fill={fill} stroke={INK} strokeWidth="2" />
      <circle cx="-2.6" cy="-13.5" r="2.8" fill="#fff" opacity="0.75" />
      <path d="M-6 -1 q2 -5 5 -6" stroke="#fff" strokeOpacity="0.45" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  );
}

interface TokenProps {
  seat: number;
  index: number;
  progress: number;
  offset: number;
  canMove: boolean;
  onMove: (i: number) => void;
}

const Token = memo(function Token({ seat, index, progress, offset, canMove, onMove }: TokenProps) {
  const color = SEAT_COLORS[seat]!;
  const prev = useRef(progress);
  // Keyframes for this move: hop through every square (or arc back to base when captured).
  const anim = useMemo(() => {
    const from = prev.current;
    prev.current = progress;
    const end = centre(tokenCell(seat, progress, index));
    const target = { x: end.x + offset * 6, y: end.y - offset * 6 };
    if (from === progress) return { x: target.x, y: target.y, dur: 0.25, times: undefined as number[] | undefined, captured: false };
    if (progress < 0 && from >= 0) {
      // Captured: knocked high back to the yard with a spin.
      const start = centre(tokenCell(seat, from, index));
      const mid = { x: (start.x + target.x) / 2, y: Math.min(start.y, target.y) - 140 };
      return { x: [start.x, mid.x, target.x], y: [start.y, mid.y, target.y], dur: 0.75, times: [0, 0.45, 1], captured: true };
    }
    const cells = pathBetween(seat, from, progress, index).map(centre);
    const xs: number[] = [];
    const ys: number[] = [];
    cells.forEach((p, i) => {
      if (i > 0) {
        const q = cells[i - 1]!;
        xs.push((p.x + q.x) / 2);
        ys.push((p.y + q.y) / 2 - 16);
      }
      xs.push(p.x);
      ys.push(p.y);
    });
    xs[xs.length - 1] = target.x;
    ys[ys.length - 1] = target.y;
    return { x: xs, y: ys, dur: Math.max(0.25, ((cells.length - 1) * HOP_MS) / 1000), times: xs.map((_, i) => i / (xs.length - 1)), captured: false };
  }, [progress, seat, index, offset]);

  // A wooden clack each time the pawn lands on a square.
  useEffect(() => {
    if (!Array.isArray(anim.x) || anim.captured) return;
    const hops = (anim.x.length - 1) / 2;
    const timers = Array.from({ length: hops }, (_, i) => setTimeout(() => sfx.clack(), (i + 1) * HOP_MS));
    return () => timers.forEach(clearTimeout);
  }, [anim]);

  return (
    <motion.g
      initial={false}
      animate={{ x: anim.x, y: anim.y, rotate: anim.captured ? [0, 540, 720] : 0 }}
      // A captured pawn waits for the capturer's hops (about three squares) before it is knocked home.
      transition={{ duration: anim.dur, times: anim.times, ease: "easeInOut", delay: anim.captured ? 0.45 : 0 }}
      onClick={canMove ? () => onMove(index) : undefined}
      style={{ cursor: canMove ? "pointer" : "default" }}
      role={canMove ? "button" : undefined}
      aria-label={canMove ? `Move token ${index + 1}` : undefined}
      data-testid={canMove ? `move-token-${index}` : undefined}
    >
      {canMove && (
        <g className="tt-bob">
          <circle r="21" fill={color.fill} opacity="0.25" />
          <circle r="21" fill="none" stroke="#fff6d8" strokeWidth="3" strokeDasharray="6 5" className="tt-spin" />
        </g>
      )}
      <g className={canMove ? "tt-bob" : undefined}>
        <Pawn fill={color.fill} deep={color.deep} />
      </g>
    </motion.g>
  );
});

/** The board art, which never changes during a game. */
const BoardArt = memo(function BoardArt() {
  return (
    <g>
      <defs>
        <pattern id="tt-felt" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#2f5d48" />
          <circle cx="1" cy="1" r="0.8" fill="#386b54" />
          <circle cx="4" cy="4" r="0.7" fill="#28513f" />
        </pattern>
        <pattern id="tt-wood" width="120" height="16" patternUnits="userSpaceOnUse">
          <rect width="120" height="16" fill="#6b3f22" />
          <path d="M0 5 q30 -3 60 0 t60 0 M0 12 q40 2 80 -1 t40 1" stroke="#5a331b" strokeWidth="2" fill="none" />
        </pattern>
      </defs>
      {/* Shadow on the table (drawn, not a CSS filter: a filter would repaint every animated frame) */}
      <rect x={-FRAME + 4} y={-FRAME + 14} width={SIZE + FRAME * 2 - 8} height={SIZE + FRAME * 2} rx="30" fill="rgb(0 0 0 / 0.35)" />
      {/* Walnut frame */}
      <rect x={-FRAME} y={-FRAME} width={SIZE + FRAME * 2} height={SIZE + FRAME * 2} rx="28" fill="url(#tt-wood)" stroke={INK} strokeWidth="3" />
      <rect x={-6} y={-6} width={SIZE + 12} height={SIZE + 12} rx="16" fill="#f3e6cc" stroke={INK} strokeWidth="2.5" />
      {/* Base yards: felt trays with four pawn spots */}
      {BASES.map(([r, c], seat) => {
        const col = SEAT_COLORS[seat]!;
        return (
          <g key={seat}>
            <rect x={c * CELL + 4} y={r * CELL + 4} width={CELL * 6 - 8} height={CELL * 6 - 8} rx="22" fill={col.fill} stroke={INK} strokeWidth="2.5" />
            <rect x={c * CELL + 12} y={r * CELL + 12} width={CELL * 6 - 24} height={CELL * 6 - 24} rx="16" fill={col.deep} opacity="0.35" />
            <rect x={c * CELL + CELL} y={r * CELL + CELL} width={CELL * 4} height={CELL * 4} rx="18" fill="url(#tt-felt)" stroke={INK} strokeWidth="2" />
            {[
              [1.5, 1.5],
              [1.5, 3.5],
              [3.5, 1.5],
              [3.5, 3.5],
            ].map(([dr, dc], i) => (
              <circle key={i} cx={(c + dc!) * CELL + CELL / 2} cy={(r + dr!) * CELL + CELL / 2} r="17" fill="none" stroke={col.fill} strokeWidth="3" opacity="0.7" />
            ))}
          </g>
        );
      })}
      {/* Track */}
      {TRACK.map(([r, c], i) => {
        const startSeat = i % 13 === 0 ? i / 13 : -1;
        const safe = SAFE_SQUARES.has(i);
        return (
          <g key={i}>
            <rect x={c * CELL + 2} y={r * CELL + 3.5} width={CELL - 4} height={CELL - 4} rx="7" fill="rgb(0 0 0 / 0.12)" />
            <rect x={c * CELL + 2} y={r * CELL + 2} width={CELL - 4} height={CELL - 4} rx="7" fill={startSeat >= 0 ? SEAT_COLORS[startSeat]!.soft : "#fffaf0"} stroke={INK} strokeOpacity="0.35" strokeWidth="1.5" />
            {safe && (
              <g transform={`translate(${c * CELL + CELL / 2} ${r * CELL + CELL / 2})`}>
                <circle r="15" fill={startSeat >= 0 ? SEAT_COLORS[startSeat]!.fill : "#ffcf3d"} opacity="0.25" className="tt-glow" />
                <path transform="scale(0.85)" d="M0,-13 L3.8,-4.2 13,-4 5.8,2.4 8,12 0,6.6 -8,12 -5.8,2.4 -13,-4 -3.8,-4.2Z" fill={startSeat >= 0 ? SEAT_COLORS[startSeat]!.fill : "#ffcf3d"} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
              </g>
            )}
          </g>
        );
      })}
      {/* Home lanes with arrows */}
      {HOME_LANES.map((lane, seat) =>
        lane.map(([r, c], i) => (
          <g key={`${seat}-${i}`}>
            <rect x={c * CELL + 2} y={r * CELL + 2} width={CELL - 4} height={CELL - 4} rx="7" fill={SEAT_COLORS[seat]!.fill} stroke={INK} strokeOpacity="0.5" strokeWidth="1.5" />
            <circle cx={c * CELL + CELL / 2} cy={r * CELL + CELL / 2} r="3.5" fill="#fff" opacity="0.6" />
          </g>
        )),
      )}
      {/* Centre: a pinwheel with a gold medallion */}
      <g transform={`translate(${CELL * 6} ${CELL * 6})`}>
        {[0, 1, 2, 3].map((seat) => {
          const tri = ["0,0 0,120 60,60", "0,0 120,0 60,60", "120,0 120,120 60,60", "0,120 120,120 60,60"][seat]!;
          return <polygon key={seat} points={tri} fill={SEAT_COLORS[seat]!.fill} stroke={INK} strokeWidth="2" strokeLinejoin="round" />;
        })}
        <circle cx="60" cy="60" r="20" fill="#ffcf3d" stroke={INK} strokeWidth="2.5" />
        <path transform="translate(60 60) scale(0.9)" d="M0,-13 L3.8,-4.2 13,-4 5.8,2.4 8,12 0,6.6 -8,12 -5.8,2.4 -13,-4 -3.8,-4.2Z" fill="#fff6d8" stroke={INK} strokeWidth="1.6" />
      </g>
    </g>
  );
});

interface Burst {
  id: number;
  x: number;
  y: number;
  color: string;
  big: boolean;
}

export function TokenTrailGame({ code, game, selfId, send }: GameClientProps<TTView>) {
  const view = game.view;
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [rollId, setRollId] = useState(0);
  const [feed, setFeed] = useState<{ id: number; text: string }[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const me = view.players.find((p) => p.id === selfId);
  const myTurn = view.currentPlayerId === selfId && view.status === "playing";
  const current = view.players.find((p) => p.id === view.currentPlayerId);
  const remaining = useCountdown(view.deadline);
  const nameOf = useMemo(() => {
    const names = new Map(view.players.map((p) => [p.id, p.id === selfId ? "You" : p.name]));
    return (id: string) => names.get(id) ?? "Someone";
  }, [view.players, selfId]);
  const viewRef = useRef(view);
  viewRef.current = view;

  const burst = (cell: Cell, color: string, big: boolean, delay: number) => {
    const id = Math.random();
    const { x, y } = centre(cell);
    setTimeout(() => {
      setBursts((b) => [...b, { id, x, y, color, big }]);
      setTimeout(() => setBursts((b) => b.filter((q) => q.id !== id)), 900);
    }, delay);
  };

  useRoomEvent<{ events: TTEvent[] }>(code, "game:action", ({ events }) => {
    for (const e of events) {
      if (e.kind === "roll") {
        setRollId((n) => n + 1);
        sfx.diceRattle();
        setTimeout(() => sfx.clack(), 900);
      }
      if (e.kind === "move") {
        const p = viewRef.current.players.find((x) => x.id === e.playerId);
        const hops = Math.max(1, e.to - Math.max(0, e.from));
        if (p && e.captured.length) {
          const cell = tokenCell(p.seat, e.to, e.token);
          setTimeout(() => sfx.knock(), hops * HOP_MS);
          burst(cell, SEAT_COLORS[p.seat]!.fill, true, hops * HOP_MS);
        }
        if (p && e.to === HOME) {
          setTimeout(() => sfx.homeChime(), hops * HOP_MS);
          burst([7, 7], SEAT_COLORS[p.seat]!.fill, true, hops * HOP_MS);
        }
      }
      if (e.kind === "win") sfx.win();
      const line = describe(e, nameOf);
      if (line) setFeed((f) => [{ id: Math.random(), text: line }, ...f].slice(0, 5));
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
  const placed = view.players.flatMap((p) => (p.left ? [] : p.tokens.map((progress, i) => ({ player: p, i, progress, cell: tokenCell(p.seat, progress, i) }))));
  const stackIndex = new Map<string, number>();
  const offsets = placed.map((t) => {
    const key = `${t.cell[0]},${t.cell[1]}`;
    const n = stackIndex.get(key) ?? 0;
    stackIndex.set(key, n + 1);
    return t.progress >= 0 && t.progress < HOME ? n : 0;
  });
  const onMove = (token: number) => act("trail:move", { token });
  const turnColor = current ? SEAT_COLORS[current.seat]! : SEAT_COLORS[0]!;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_290px]" data-testid="token-trail">
      <div className="mx-auto w-full max-w-[660px] rounded-[32px] bg-[radial-gradient(ellipse_at_50%_30%,#5a3a26_0%,#2a1a12_70%)] p-3 shadow-[inset_0_0_60px_rgb(0_0_0/0.5)] sm:p-5">
        <svg viewBox={`${-FRAME - 4} ${-FRAME - 4} ${SIZE + FRAME * 2 + 8} ${SIZE + FRAME * 2 + 8}`} className="w-full" role="img" aria-label="Token Trail board" overflow="visible">
          <BoardArt />
          {/* Turn spotlight on the current player's yard */}
          {current && view.status === "playing" && (
            <rect
              x={BASES[current.seat]![1] * CELL + 4}
              y={BASES[current.seat]![0] * CELL + 4}
              width={CELL * 6 - 8}
              height={CELL * 6 - 8}
              rx="22"
              fill="none"
              stroke="#fff6d8"
              strokeWidth="5"
              className="tt-glow"
            />
          )}
          {placed.map((t, k) => (
            <Token key={`${t.player.id}-${t.i}`} seat={t.player.seat} index={t.i} progress={t.progress} offset={offsets[k]!} canMove={t.player.id === selfId && movable.has(t.i)} onMove={onMove} />
          ))}
          {bursts.map((b) => (
            <g key={b.id} transform={`translate(${b.x} ${b.y})`} className="pointer-events-none">
              <motion.circle r={b.big ? 60 : 30} fill="none" stroke={b.color} strokeWidth="6" initial={{ scale: 0.2, opacity: 1 }} animate={{ scale: 1, opacity: 0 }} transition={{ duration: 0.6 }} />
              {Array.from({ length: 10 }, (_, i) => {
                const a = (i / 10) * Math.PI * 2;
                return <motion.circle key={i} r="5" fill={i % 2 ? b.color : "#fff6d8"} initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(a) * 55, y: Math.sin(a) * 55, opacity: 0 }} transition={{ duration: 0.7, ease: "easeOut" }} />;
              })}
            </g>
          ))}
        </svg>
      </div>

      <aside className="space-y-4">
        <div className="overflow-hidden rounded-[24px] border-[3px] border-[#2b1a10] bg-[#2f5d48] shadow-[0_6px_0_#2b1a10]">
          <div className="flex items-center gap-4 tt-felt p-5">
            <Die3D value={view.roll} rollId={rollId} />
            <div className="min-w-0 flex-1 text-[#f3e6cc]">
              <p className="font-display text-xl leading-tight font-black" aria-live="polite">
                {view.status !== "playing" ? "Game over" : myTurn ? (view.phase === "roll" ? "Your roll!" : "Pick a token") : `${current?.name ?? "…"}'s turn`}
              </p>
              {view.deadline && remaining !== null && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30">
                  <div className="h-full rounded-full transition-[width] duration-300 ease-linear" style={{ width: `${Math.min(100, (remaining / ((view.config.turnSeconds || 20) * 1000)) * 100)}%`, background: turnColor.fill }} />
                </div>
              )}
              {view.deadline && remaining !== null && <p className="mt-1 text-xs text-[#f3e6cc]/70">{Math.ceil(remaining / 1000)}s left</p>}
            </div>
          </div>
          <div className="border-t-[3px] border-[#2b1a10] bg-[#f3e6cc] p-3">
            <Button className={cn("w-full", myTurn && view.phase === "roll" && !busy && "animate-pulse")} size="lg" disabled={!myTurn || view.phase !== "roll" || busy} onClick={() => act("trail:roll")} data-testid="roll-button">
              <Dice5 className="size-5" /> Roll the die
            </Button>
          </div>
        </div>

        <ul className="space-y-2" aria-label="Players">
          {view.players.map((p) => {
            const seat = SEAT_COLORS[p.seat]!;
            const home = p.tokens.filter((t) => t === HOME).length;
            const active = p.id === view.currentPlayerId;
            return (
              <motion.li
                layout
                key={p.id}
                className={cn("flex items-center gap-3 rounded-2xl border-2 px-3 py-2 transition-colors", active ? "bg-surface shadow-[0_0_0_3px_var(--tt-c)]" : "border-line bg-surface", p.left && "opacity-40")}
                style={{ "--tt-c": seat.fill, borderColor: active ? seat.deep : undefined } as React.CSSProperties}
              >
                <svg viewBox="-18 -22 36 36" className="size-7 shrink-0" aria-label={`${seat.name} tokens`}>
                  <Pawn fill={seat.fill} deep={seat.deep} />
                </svg>
                <Avatar name={p.name} color={p.color} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {p.name}
                  {p.id === selfId && " (you)"}
                </span>
                {!p.connected && !p.left && <WifiOff className="size-4 text-sun" aria-label="Offline" />}
                <span className="inline-flex items-center gap-0.5" title={`${home} of ${p.tokens.length} tokens home`}>
                  {p.tokens.map((t, i) => (
                    <Star key={i} className={cn("size-3.5", t === HOME ? "fill-current" : "opacity-30")} style={{ color: seat.deep }} />
                  ))}
                </span>
              </motion.li>
            );
          })}
        </ul>

        <div className="rounded-2xl border border-line bg-surface p-4 text-sm" aria-live="polite">
          <p className="mb-2 font-semibold">Latest</p>
          {feed.length ? (
            <ul className="space-y-1 text-ink-muted">
              <AnimatePresence initial={false}>
                {feed.map((line, i) => (
                  <motion.li key={line.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className={i === 0 ? "font-semibold text-ink" : undefined}>
                    {line.text}
                  </motion.li>
                ))}
              </AnimatePresence>
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
