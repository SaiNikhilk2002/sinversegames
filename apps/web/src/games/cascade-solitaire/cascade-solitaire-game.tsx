"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Flag, Lightbulb, RotateCcw, Sparkles, Timer, Undo2 } from "lucide-react";
import {
  SolitaireGame,
  canAutoComplete,
  hints,
  isLegal,
  rankOf,
  suitOf,
  totalScore,
  type PileRef,
  type SolitaireConfig,
  type SolitaireMove,
} from "@platform/engines/cascade-solitaire";
import { Button, Segmented, cn } from "@/components/ui/primitives";
import { sfx } from "@/lib/sound";
import type { SoloGameProps, SoloSetupProps } from "../solo-types";
import { CardBack, CardFace } from "./card-art";

/**
 * Cascade Solitaire on a card-room table: felt, a wooden rail, real cards that
 * flip in 3D, a dealt opening, drag-and-drop with lift (tap still works) and
 * the bouncing-cards finish. The engine and the move log are unchanged.
 */

const RANK_LABEL = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUIT_NAME = ["spades", "hearts", "diamonds", "clubs"];

export function SolitaireSetup({ onStart, busy }: SoloSetupProps) {
  const [draw, setDraw] = useState<1 | 3>(1);
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative h-36 w-40 shrink-0" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.div key={i} className="absolute top-2 left-8 w-20 drop-shadow-[0_6px_8px_rgb(0_0_0/0.35)]" initial={{ rotate: 0, x: 0 }} animate={{ rotate: (i - 1) * 14, x: (i - 1) * 22 }} transition={{ delay: 0.15 + i * 0.08, type: "spring", stiffness: 200, damping: 16 }}>
            {i === 2 ? <CardFace card={12} /> : i === 1 ? <CardFace card={13} /> : <CardBack />}
          </motion.div>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-xl font-bold">New game</h2>
        <p className="mt-1 text-sm text-ink-muted">Build each suit from Ace to King. Your best score today goes on the daily board.</p>
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold">Draw from the stock</p>
          <Segmented
            label="Draw"
            value={draw}
            onChange={setDraw}
            options={[
              { value: 1, label: "Draw 1 · Relaxed" },
              { value: 3, label: "Draw 3 · Classic challenge" },
            ]}
          />
        </div>
        <Button size="lg" className="mt-6" disabled={busy} onClick={() => onStart({ draw })} data-testid="start-run">
          Deal cards
        </Button>
      </div>
    </div>
  );
}

interface CardProps {
  card: number;
  faceUp: boolean;
  selected?: boolean;
  hinted?: boolean;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  style?: React.CSSProperties;
  testId?: string;
  dealDelay?: number;
}

function Card({ card, faceUp, selected, hinted, onClick, onPointerDown, style, testId, dealDelay }: CardProps) {
  return (
    <motion.button
      type="button"
      layout
      layoutId={`card-${card}`}
      transition={{ type: "spring", stiffness: 520, damping: 40, delay: dealDelay ?? 0 }}
      initial={dealDelay !== undefined ? { opacity: 0, y: -60, x: -40, rotate: -12 } : false}
      animate={{ opacity: 1, y: selected ? -6 : 0, x: 0, rotate: 0 }}
      onClick={onClick}
      onPointerDown={onPointerDown}
      disabled={!onClick}
      style={{ ...style, perspective: 600 }}
      data-testid={testId}
      aria-label={faceUp ? `${RANK_LABEL[rankOf(card)]} of ${SUIT_NAME[suitOf(card)]}` : "Face-down card"}
      className={cn(
        "absolute inset-x-0 aspect-[5/7] w-full touch-none rounded-[10%] select-none",
        selected ? "z-50 drop-shadow-[0_10px_10px_rgb(0_0_0/0.45)]" : "drop-shadow-[0_1.5px_1.5px_rgb(0_0_0/0.35)]",
        onClick ? "cursor-grab active:cursor-grabbing" : "cursor-default",
      )}
    >
      <motion.span
        className="relative block size-full [transform-style:preserve-3d]"
        initial={dealDelay !== undefined && faceUp ? { rotateY: 180 } : false}
        animate={{ rotateY: faceUp ? 0 : 180 }}
        transition={{ duration: 0.38, ease: [0.3, 0.7, 0.3, 1], delay: dealDelay ? dealDelay + 0.2 : 0 }}
      >
        <span className="absolute inset-0 [backface-visibility:hidden]">
          <CardFace card={card} />
        </span>
        <span className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <CardBack />
        </span>
      </motion.span>
      {hinted && <span className="sol-hint pointer-events-none absolute -inset-1 rounded-[12%] border-[3px] border-[#7dffcf]" />}
    </motion.button>
  );
}

function EmptySlot({ label, onClick, testId, hinted }: { label: string; onClick?: () => void; testId?: string; hinted?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-label={label}
      className={cn("flex aspect-[5/7] w-full items-center justify-center rounded-[10%] border-2 border-[#f3e6cc]/25 bg-black/10 font-serif text-[#f3e6cc]/40 shadow-[inset_0_2px_8px_rgb(0_0_0/0.35)]", hinted && "ring-4 ring-[#7dffcf]")}
    >
      <span className="text-sm font-bold sm:text-xl">{label.length < 4 ? label : ""}</span>
    </button>
  );
}

interface Drag {
  from: PileRef;
  n: number;
  cards: number[];
  dx: number;
  dy: number;
  width: number;
  gap: number;
  moved: boolean;
  startX: number;
  startY: number;
}

/** The classic finish: cards bounce off the foundations leaving trails. */
function WinCascade({ origins }: { origins: { x: number; y: number; w: number }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement!;
    const W = parent.clientWidth;
    const H = parent.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const g = canvas.getContext("2d")!;
    g.scale(dpr, dpr);
    const colors = ["#fffdf6", "#fbe9e4", "#e9ecf8"];
    const cards: { x: number; y: number; vx: number; vy: number; w: number; start: number; c: string; suit: string }[] = [];
    for (let i = 0; i < 52; i++) {
      const o = origins[i % origins.length]!;
      cards.push({ x: o.x, y: o.y, vx: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 4), vy: -Math.random() * 6, w: o.w, start: i * 45, c: colors[i % 3]!, suit: ["♠", "♥", "♦", "♣"][i % 4]! });
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = now - t0;
      for (const c of cards) {
        if (t < c.start) continue;
        c.vy += 0.45;
        c.x += c.vx;
        c.y += c.vy;
        const h = c.w * 1.4;
        if (c.y + h > H) {
          c.y = H - h;
          c.vy *= -0.72;
        }
        g.fillStyle = c.c;
        g.strokeStyle = "#b9ad97";
        g.lineWidth = 1;
        g.beginPath();
        g.roundRect(c.x, c.y, c.w, h, c.w * 0.1);
        g.fill();
        g.stroke();
        g.fillStyle = c.suit === "♥" || c.suit === "♦" ? "#c3243a" : "#1c1a2b";
        g.font = `${Math.round(c.w * 0.5)}px Georgia, serif`;
        g.fillText(c.suit, c.x + c.w * 0.25, c.y + h * 0.6);
      }
      if (t < 4200) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [origins]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 z-[60] size-full" aria-hidden />;
}

export function CascadeSolitaireGame({ seed, config, onFinish, onQuit }: SoloGameProps<SolitaireConfig>) {
  const gameRef = useRef(new SolitaireGame(seed, config));
  const logRef = useRef<SolitaireMove[]>([]);
  const startRef = useRef(Date.now());
  const doneRef = useRef(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const dragLayer = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const [, setFrame] = useState(0);
  const [selected, setSelected] = useState<{ from: PileRef; n: number } | null>(null);
  const [hint, setHint] = useState<{ from?: PileRef; to?: PileRef; draw?: boolean } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dealing, setDealing] = useState(true);
  const [cascade, setCascade] = useState<{ x: number; y: number; w: number }[] | null>(null);
  const g = gameRef.current;
  const s = g.state;

  useEffect(() => {
    const id = setInterval(() => !doneRef.current && setElapsed(Date.now() - startRef.current), 1000);
    sfx.shuffle();
    const deal = setTimeout(() => setDealing(false), 1400);
    return () => {
      clearInterval(id);
      clearTimeout(deal);
    };
  }, []);

  const now = () => Math.max(logRef.current[logRef.current.length - 1]?.t ?? 0, Date.now() - startRef.current);

  const end = useCallback(
    (won: boolean) => {
      if (doneRef.current) return;
      doneRef.current = true;
      const t = now();
      onFinish(logRef.current, { score: totalScore(gameRef.current.state, t), completed: won, headline: won ? "You won! 🎉" : "Game over" });
    },
    [onFinish],
  );

  const apply = useCallback(
    (move: SolitaireMove) => {
      if (doneRef.current) return false;
      const before = gameRef.current.state.tableau.map((c) => c.down);
      const m = { ...move, t: now() } as SolitaireMove;
      if (!gameRef.current.apply(m)) return false;
      logRef.current.push(m);
      setSelected(null);
      setHint(null);
      setFrame((n) => n + 1);
      const st = gameRef.current.state;
      if (m.k === "move") {
        if (m.to[0] === "f") {
          const f = st.foundations[Number(m.to[1])]!;
          sfx.foundation(rankOf(f[f.length - 1]!));
        } else sfx.cardPlace();
      } else if (m.k === "draw") sfx.flipCard();
      else sfx.pickupCard();
      if (st.tableau.some((c, i) => c.down < before[i]!)) setTimeout(() => sfx.flipCard(), 120);
      if (st.won) {
        sfx.win();
        // Bounce the cards off the foundations before the result screen.
        const table = tableRef.current;
        if (table) {
          const tr = table.getBoundingClientRect();
          const origins = [0, 1, 2, 3].map((i) => {
            const r = table.querySelector(`[data-testid="foundation-${i}"]`)!.getBoundingClientRect();
            return { x: r.left - tr.left, y: r.top - tr.top, w: r.width };
          });
          setCascade(origins);
        }
        setTimeout(() => end(true), 3600);
      }
      return true;
    },
    [end],
  );

  /** Best destination for a picked-up run: a foundation first, then a non-empty column, then an empty one. */
  const autoTarget = (from: PileRef, n: number): PileRef | null => {
    const dests: PileRef[] = [];
    if (n === 1) for (let f = 0; f < 4; f++) dests.push(`f${f}` as PileRef);
    const cols = [0, 1, 2, 3, 4, 5, 6].map((i) => `t${i}` as PileRef);
    dests.push(...cols.filter((c) => s.tableau[Number(c[1])]!.cards.length), ...cols.filter((c) => !s.tableau[Number(c[1])]!.cards.length));
    return dests.find((to) => to !== from && isLegal(s, from, to, n)) ?? null;
  };

  const pick = (from: PileRef, n: number) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (selected && selected.from !== from) {
      // Clicking another pile while holding cards: try to drop there.
      if (isLegal(s, selected.from, from, selected.n)) return void apply({ k: "move", from: selected.from, to: from, n: selected.n, t: 0 });
    }
    if (selected && selected.from === from && selected.n === n) return setSelected(null);
    const to = autoTarget(from, n);
    if (to) return void apply({ k: "move", from, to, n, t: 0 });
    sfx.tick();
    setSelected({ from, n });
  };

  const dropOn = (to: PileRef) => {
    if (selected && isLegal(s, selected.from, to, selected.n)) apply({ k: "move", from: selected.from, to, n: selected.n, t: 0 });
  };

  // Drag and drop. A press that moves more than a few pixels becomes a drag; otherwise it is a tap.
  const startDrag = (from: PileRef, n: number, cards: number[]) => (e: React.PointerEvent) => {
    if (e.button !== 0 || doneRef.current) return;
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    setDrag({ from, n, cards, dx: e.clientX - r.left, dy: e.clientY - r.top, width: r.width, gap: r.width * 0.336, moved: false, startX: e.clientX, startY: e.clientY });
  };
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
      if (!drag.moved) {
        sfx.pickupCard();
        setDrag({ ...drag, moved: true });
        return;
      }
      const layer = dragLayer.current;
      if (layer) {
        const tilt = Math.max(-8, Math.min(8, e.movementX * 0.6));
        layer.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px) rotate(${tilt}deg)`;
      }
    };
    const up = (e: PointerEvent) => {
      const d = drag;
      setDrag(null);
      if (!d.moved) return;
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      const layer = dragLayer.current;
      if (layer) layer.style.display = "none";
      const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-pile]")?.dataset.pile as PileRef | undefined;
      if (layer) layer.style.display = "";
      if (target && target !== d.from && isLegal(gameRef.current.state, d.from, target, d.n)) apply({ k: "move", from: d.from, to: target, n: d.n, t: 0 });
      else sfx.tick();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, apply]);

  const showHint = () => {
    const h = hints(s)[0];
    if (!h) return setHint(null);
    setHint("draw" in h ? { draw: true } : { from: h.from, to: h.to });
    setTimeout(() => setHint(null), 2500);
  };

  const autoFinish = async () => {
    while (!gameRef.current.state.won && !doneRef.current) {
      const st = gameRef.current.state;
      const move = (["w", "t0", "t1", "t2", "t3", "t4", "t5", "t6"] as PileRef[])
        .flatMap((from) => [0, 1, 2, 3].map((f) => ({ from, to: `f${f}` as PileRef })))
        .find(({ from, to }) => isLegal(st, from, to, 1));
      if (!move) break;
      apply({ k: "move", from: move.from, to: move.to, n: 1, t: 0 });
      await new Promise((r) => setTimeout(r, 90));
    }
  };

  const score = totalScore(s, elapsed);
  const wasteVisible = s.waste.slice(-(s.draw === 3 ? 3 : 1));
  const dragging = drag?.moved ? new Set(drag.cards) : null;
  // Deal order: row by row across the columns, like a real deal.
  const dealIndex = (col: number, row: number) => row * 7 + col - (row * (row + 1)) / 2;

  return (
    <div data-testid="cascade-solitaire">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm font-bold tabular-nums shadow-card" data-testid="sol-score">
          {score.toLocaleString()} pts
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm font-semibold tabular-nums shadow-card">
          <Timer className="size-4" /> {Math.floor(elapsed / 60000)}:{String(Math.floor(elapsed / 1000) % 60).padStart(2, "0")}
        </span>
        <span className="rounded-full bg-surface px-3 py-1.5 text-sm font-semibold shadow-card" data-testid="sol-moves">
          {s.moves} moves
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => apply({ k: "undo", t: 0 })} disabled={!g.canUndo} data-testid="sol-undo">
            <Undo2 className="size-4" /> Undo
          </Button>
          <Button size="sm" variant="secondary" onClick={showHint} data-testid="sol-hint">
            <Lightbulb className="size-4" /> Hint
          </Button>
          {canAutoComplete(s) && (
            <Button size="sm" onClick={autoFinish} data-testid="sol-autofinish">
              <Sparkles className="size-4" /> Finish
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => end(false)} data-testid="sol-end">
            <Flag className="size-4" /> End game
          </Button>
          <Button size="sm" variant="ghost" onClick={onQuit} aria-label="Quit without saving">
            <RotateCcw className="size-4" />
          </Button>
        </div>
      </div>

      <div ref={tableRef} className="sol-table relative mx-auto max-w-3xl rounded-[28px] border-[6px] border-[#4a2a17] p-2 shadow-[0_10px_30px_-10px_rgb(0_0_0/0.7),inset_0_0_0_2px_#6b3f22] sm:p-4">
        {/* Top row: stock, waste, foundations */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-3">
          <div className="relative">
            {s.stock.length ? (
              <button
                type="button"
                onClick={() => apply({ k: "draw", t: 0 })}
                data-testid="stock"
                aria-label={`Stock, ${s.stock.length} cards`}
                className={cn("relative block aspect-[5/7] w-full rounded-[10%] drop-shadow-[0_2px_2px_rgb(0_0_0/0.4)] transition-transform active:scale-95", hint?.draw && "ring-4 ring-[#7dffcf]")}
              >
                {s.stock.length > 2 && <span className="absolute inset-0 translate-x-[3px] translate-y-[3px]"><CardBack /></span>}
                {s.stock.length > 1 && <span className="absolute inset-0 translate-x-[1.5px] translate-y-[1.5px]"><CardBack /></span>}
                <span className="absolute inset-0">
                  <CardBack />
                </span>
                <span className="absolute right-1 bottom-1 rounded bg-black/55 px-1 text-[10px] font-bold text-white">{s.stock.length}</span>
              </button>
            ) : (
              <EmptySlot label={s.waste.length ? "↻" : ""} onClick={() => apply({ k: "draw", t: 0 })} testId="stock" hinted={hint?.draw} />
            )}
          </div>
          <div className="relative col-span-2">
            <div className="relative aspect-[5/7] w-1/2">
              {wasteVisible.map((card, i) => {
                const isTop = i === wasteVisible.length - 1;
                if (dragging?.has(card)) return null;
                return (
                  <Card
                    key={card}
                    card={card}
                    faceUp
                    style={{ left: `${i * 35}%`, zIndex: i }}
                    selected={isTop && selected?.from === "w"}
                    hinted={isTop && hint?.from === "w"}
                    onClick={isTop ? () => pick("w", 1) : undefined}
                    onPointerDown={isTop ? startDrag("w", 1, [card]) : undefined}
                    testId={isTop ? "waste-top" : undefined}
                  />
                );
              })}
            </div>
          </div>
          {s.foundations.map((f, i) => {
            const ref = `f${i}` as PileRef;
            const top = f[f.length - 1];
            return (
              <div key={i} className="relative" data-testid={`foundation-${i}`} data-count={f.length} data-pile={ref}>
                <EmptySlot label="A" onClick={() => dropOn(ref)} hinted={hint?.to === ref} />
                {f.length > 1 && !dragging?.has(f[f.length - 2]!) && <Card key={f[f.length - 2]} card={f[f.length - 2]!} faceUp style={{ top: 0 }} />}
                {top !== undefined && !dragging?.has(top) && <Card key={top} card={top} faceUp style={{ top: 0 }} selected={selected?.from === ref} hinted={hint?.to === ref} onClick={() => pick(ref, 1)} onPointerDown={startDrag(ref, 1, [top])} />}
              </div>
            );
          })}
        </div>

        {/* Tableau */}
        <div className="mt-3 grid grid-cols-7 gap-1.5 sm:mt-5 sm:gap-3">
          {s.tableau.map((col, ci) => {
            const ref = `t${ci}` as PileRef;
            // Face-down cards overlap more tightly than face-up ones.
            const offsets: number[] = [];
            let y = 0;
            col.cards.forEach((_, i) => {
              offsets.push(y);
              y += i < col.down ? 9 : 24;
            });
            // Offsets are in % of card height; card height is 140% of column width (5:7 cards).
            return (
              <div key={ci} className="w-full [container-type:inline-size]" data-testid={`column-${ci}`} data-count={col.cards.length} data-pile={ref}>
                <div className="relative w-full" style={{ height: `calc(${(y * 1.4).toFixed(1)}cqw + 140cqw)` }}>
                  <div className="absolute inset-x-0 top-0">
                    <EmptySlot label="K" onClick={() => dropOn(ref)} hinted={hint?.to === ref && !col.cards.length} />
                  </div>
                  {col.cards.map((card, i) => {
                    if (dragging?.has(card)) return null;
                    const faceUp = i >= col.down;
                    const n = col.cards.length - i;
                    const isSel = selected?.from === ref && i >= col.cards.length - selected.n;
                    return (
                      <Card
                        key={card}
                        card={card}
                        faceUp={faceUp}
                        style={{ top: `${(offsets[i]! * 1.4).toFixed(1)}cqw`, zIndex: i + 1 }}
                        selected={isSel}
                        hinted={(hint?.from === ref && i === col.cards.length - 1) || (hint?.to === ref && i === col.cards.length - 1)}
                        onClick={faceUp ? () => pick(ref, n) : undefined}
                        onPointerDown={faceUp ? startDrag(ref, n, col.cards.slice(i)) : undefined}
                        testId={faceUp ? `card-${ci}-${i}` : undefined}
                        dealDelay={dealing ? dealIndex(ci, i) * 0.045 : undefined}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {cascade && <WinCascade origins={cascade} />}
      </div>

      {/* The dragged run follows the pointer, lifted above the table. */}
      {drag?.moved && (
        <div ref={dragLayer} className="pointer-events-none fixed top-0 left-0 z-[80]" style={{ width: drag.width, transform: "translate(-999px,-999px)" }}>
          {drag.cards.map((card, i) => (
            <div key={card} className="absolute inset-x-0 aspect-[5/7] drop-shadow-[0_14px_14px_rgb(0_0_0/0.45)]" style={{ top: i * drag.gap }}>
              <motion.div layoutId={`card-${card}`} className="size-full" transition={{ type: "spring", stiffness: 520, damping: 40 }}>
                <CardFace card={card} />
              </motion.div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-center text-xs text-ink-muted">Drag cards, or tap one to move it automatically. Tap a card, then a pile, to choose where it goes.</p>
    </div>
  );
}
