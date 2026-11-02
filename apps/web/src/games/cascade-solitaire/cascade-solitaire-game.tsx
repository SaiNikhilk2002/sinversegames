"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Flag, Lightbulb, RotateCcw, Sparkles, Timer, Undo2 } from "lucide-react";
import {
  SolitaireGame,
  canAutoComplete,
  hints,
  isLegal,
  isRed,
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

const SUIT_GLYPH = ["♠", "♥", "♦", "♣"];
const RANK_LABEL = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function SolitaireSetup({ onStart, busy }: SoloSetupProps) {
  const [draw, setDraw] = useState<1 | 3>(1);
  return (
    <div>
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
  );
}

function Card({ card, faceUp, selected, hinted, onClick, style, testId }: { card: number; faceUp: boolean; selected?: boolean; hinted?: boolean; onClick?: () => void; style?: React.CSSProperties; testId?: string }) {
  const red = isRed(card);
  const rank = rankOf(card);
  const suit = SUIT_GLYPH[suitOf(card)];
  return (
    <motion.button
      type="button"
      layout
      layoutId={`card-${card}`}
      transition={{ type: "spring", stiffness: 500, damping: 38 }}
      onClick={onClick}
      disabled={!onClick}
      style={style}
      data-testid={testId}
      aria-label={faceUp ? `${RANK_LABEL[rank]} of ${["spades", "hearts", "diamonds", "clubs"][suitOf(card)]}` : "Face-down card"}
      className={cn(
        "absolute inset-x-0 aspect-[5/7] w-full rounded-[10%] border shadow-[0_2px_4px_rgb(0_0_0/0.25)]",
        faceUp ? "border-black/10 bg-white" : "border-white/20 bg-[repeating-linear-gradient(45deg,#7c5cff_0_6px,#6a4be8_6px_12px)]",
        selected && "ring-4 ring-sun",
        hinted && "ring-4 ring-mint",
        onClick ? "cursor-pointer" : "cursor-default",
      )}
    >
      {faceUp ? (
        <span className={cn("absolute inset-0 flex flex-col p-[6%] text-left font-display leading-none font-bold", red ? "text-[#e0314b]" : "text-[#17142b]")}>
          <span className="text-[clamp(10px,2.8vw,18px)]">
            {RANK_LABEL[rank]}
            <span className="ml-0.5">{suit}</span>
          </span>
          <span className="flex flex-1 items-center justify-center text-[clamp(16px,6vw,40px)]">{rank > 10 ? <span className="rounded-md border-2 border-current px-1 text-[0.7em]">{RANK_LABEL[rank]}</span> : suit}</span>
        </span>
      ) : (
        <span className="absolute inset-[8%] rounded-[8%] border-2 border-white/40" />
      )}
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
      className={cn("flex aspect-[5/7] w-full items-center justify-center rounded-[10%] border-2 border-dashed border-white/35 text-white/50", hinted && "ring-4 ring-mint")}
    >
      <span className="text-xs font-bold sm:text-sm">{label.length < 4 ? label : ""}</span>
    </button>
  );
}

export function CascadeSolitaireGame({ seed, config, onFinish, onQuit }: SoloGameProps<SolitaireConfig>) {
  const gameRef = useRef(new SolitaireGame(seed, config));
  const logRef = useRef<SolitaireMove[]>([]);
  const startRef = useRef(Date.now());
  const doneRef = useRef(false);
  const [, setFrame] = useState(0);
  const [selected, setSelected] = useState<{ from: PileRef; n: number } | null>(null);
  const [hint, setHint] = useState<{ from?: PileRef; to?: PileRef; draw?: boolean } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const g = gameRef.current;
  const s = g.state;

  useEffect(() => {
    const id = setInterval(() => !doneRef.current && setElapsed(Date.now() - startRef.current), 1000);
    return () => clearInterval(id);
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
      const m = { ...move, t: now() } as SolitaireMove;
      if (!gameRef.current.apply(m)) return false;
      logRef.current.push(m);
      setSelected(null);
      setHint(null);
      setFrame((n) => n + 1);
      if (m.k === "move") (m.to[0] === "f" ? sfx.pop : sfx.card)();
      else if (m.k === "draw") sfx.draw();
      if (gameRef.current.state.won) {
        sfx.win();
        setTimeout(() => end(true), 700);
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
      await new Promise((r) => setTimeout(r, 70));
    }
  };

  const score = totalScore(s, elapsed);
  const wasteVisible = s.waste.slice(-(s.draw === 3 ? 3 : 1));

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

      <div className="mx-auto max-w-3xl rounded-3xl bg-gradient-to-b from-[#0f8a5f] to-[#0a6b49] p-2 shadow-card sm:p-4">
        {/* Top row: stock, waste, foundations */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-3">
          <div className="relative">
            {s.stock.length ? (
              <button
                type="button"
                onClick={() => apply({ k: "draw", t: 0 })}
                data-testid="stock"
                aria-label={`Stock, ${s.stock.length} cards`}
                className={cn("relative block aspect-[5/7] w-full rounded-[10%] border border-white/20 bg-[repeating-linear-gradient(45deg,#7c5cff_0_6px,#6a4be8_6px_12px)] shadow", hint?.draw && "ring-4 ring-mint")}
              >
                <span className="absolute right-1 bottom-1 rounded bg-black/40 px-1 text-[10px] font-bold text-white">{s.stock.length}</span>
              </button>
            ) : (
              <EmptySlot label={s.waste.length ? "↻" : ""} onClick={() => apply({ k: "draw", t: 0 })} testId="stock" hinted={hint?.draw} />
            )}
          </div>
          <div className="relative col-span-2">
            <div className="relative aspect-[5/7] w-1/2">
              {wasteVisible.map((card, i) => {
                const isTop = i === wasteVisible.length - 1;
                return (
                  <Card
                    key={card}
                    card={card}
                    faceUp
                    style={{ left: `${i * 35}%`, zIndex: i }}
                    selected={isTop && selected?.from === "w"}
                    hinted={isTop && hint?.from === "w"}
                    onClick={isTop ? () => pick("w", 1) : undefined}
                    testId={isTop ? "waste-top" : undefined}
                  />
                );
              })}
            </div>
          </div>
          {s.foundations.map((f, i) => {
            const ref = `f${i}` as PileRef;
            return (
              <div key={i} className="relative" data-testid={`foundation-${i}`} data-count={f.length}>
                <EmptySlot label="A" onClick={() => dropOn(ref)} hinted={hint?.to === ref} />
                {f.length > 0 && (
                  <Card card={f[f.length - 1]!} faceUp style={{ top: 0 }} selected={selected?.from === ref} hinted={hint?.to === ref} onClick={() => pick(ref, 1)} />
                )}
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
              <div key={ci} className="w-full [container-type:inline-size]" data-testid={`column-${ci}`} data-count={col.cards.length}>
                <div className="relative w-full" style={{ height: `calc(${(y * 1.4).toFixed(1)}cqw + 140cqw)` }}>
                <div className="absolute inset-x-0 top-0">
                  <EmptySlot label="K" onClick={() => dropOn(ref)} hinted={hint?.to === ref && !col.cards.length} />
                </div>
                {col.cards.map((card, i) => {
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
                      testId={faceUp ? `card-${ci}-${i}` : undefined}
                    />
                  );
                })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-ink-muted">Tap a card to move it automatically. Tap a card, then a pile, to choose where it goes.</p>
    </div>
  );
}
