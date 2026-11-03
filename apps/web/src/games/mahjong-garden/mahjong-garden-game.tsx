"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Flag, Lightbulb, Shuffle, Timer, Undo2 } from "lucide-react";
import {
  LAYOUTS,
  LAYOUT_IDS,
  MahjongGame,
  availablePairs,
  freeTiles,
  isDeadEnd,
  safeHint,
  tilesMatch,
  totalScore,
  type LayoutId,
  type MahjongConfig,
  type MahjongMove,
} from "@platform/engines/mahjong-garden";
import { Button, cn } from "@/components/ui/primitives";
import { createLoop, sfx } from "@/lib/sound";
import { TileFace } from "./tile-art";
import type { SoloGameProps, SoloSetupProps } from "../solo-types";

export function MahjongSetup({ onStart, busy }: SoloSetupProps) {
  const [layout, setLayout] = useState<LayoutId>("pebble");
  return (
    <div>
      <h2 className="font-display text-xl font-bold">Choose a garden</h2>
      <p className="mt-1 text-sm text-ink-muted">Every board can be cleared. Fewer hints and faster clears score higher.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Layout">
        {LAYOUT_IDS.map((id) => {
          const def = LAYOUTS[id];
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={layout === id}
              onClick={() => setLayout(id)}
              data-testid={`layout-${id}`}
              className={cn("mj-scene relative overflow-hidden rounded-2xl border-2 p-4 text-left text-[#fff6ea] transition", layout === id ? "border-[#f2c76b] shadow-[0_0_0_3px_rgb(242_199_107/0.35)]" : "border-white/10 opacity-80 hover:opacity-100")}
            >
              <span className="absolute -right-3 -bottom-4 flex gap-1 opacity-80" aria-hidden>
                {[0, 1, 2].map((k) => (
                  <span key={k} className="mj-tile block h-10 w-8 rounded-md" style={{ transform: `translateY(${-k * 5}px)` }}>
                    <TileFace kind={[34, 9, 31][k]!} />
                  </span>
                ))}
              </span>
              <p className="font-display text-lg font-bold">{def.name}</p>
              <p className="text-sm text-[#fff6ea]/75">
                {def.difficulty} · {def.slots.length} tiles
              </p>
            </button>
          );
        })}
      </div>
      <Button size="lg" className="mt-6" disabled={busy} onClick={() => onStart({ layout })} data-testid="start-run">
        Start
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export function MahjongGardenGame({ seed, config, onFinish, onQuit }: SoloGameProps<MahjongConfig>) {
  const gameRef = useRef(new MahjongGame(seed, config));
  const logRef = useRef<MahjongMove[]>([]);
  const startRef = useRef(Date.now());
  const doneRef = useRef(false);
  const [, setFrame] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [hint, setHint] = useState<[number, number] | null>(null);
  const [shake, setShake] = useState<number | null>(null);
  /** Just-matched tiles, drawn as a short non-interactive fade so they can't be clicked mid-animation. */
  const [vanishing, setVanishing] = useState<{ i: number; kind: number }[]>([]);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [petals, setPetals] = useState<{ id: number; left: string; top: string }[]>([]);
  const [cleared, setCleared] = useState(false);
  const combo = useRef({ n: 0, at: 0 });
  const g = gameRef.current;
  const s = g.state;

  useEffect(() => {
    const id = setInterval(() => !doneRef.current && setElapsed(Date.now() - startRef.current), 1000);
    // A soft wind in the garden while you play.
    const wind = createLoop("wind");
    const kick = setTimeout(() => wind.set(1), 300);
    return () => {
      clearInterval(id);
      clearTimeout(kick);
      wind.stop();
    };
  }, []);

  const now = () => Math.max(logRef.current[logRef.current.length - 1]?.t ?? 0, Date.now() - startRef.current);

  const end = useCallback(
    (won: boolean) => {
      if (doneRef.current) return;
      doneRef.current = true;
      const t = now();
      onFinish(logRef.current, { score: totalScore(gameRef.current.state, t), completed: won, headline: won ? "Garden cleared! 🌸" : "Game over" });
    },
    [onFinish],
  );

  const apply = useCallback(
    (move: MahjongMove) => {
      if (doneRef.current) return false;
      const m = { ...move, t: now() } as MahjongMove;
      if (!gameRef.current.apply(m)) return false;
      logRef.current.push(m);
      setFrame((n) => n + 1);
      if (gameRef.current.state.won) {
        setTimeout(() => {
          sfx.gardenFanfare();
          setCleared(true);
        }, 350);
        setTimeout(() => end(true), 2800);
      }
      return true;
    },
    [end],
  );

  const free = new Set(freeTiles(s));
  const pairsLeft = availablePairs(s).length;
  const stuck = !s.won && pairsLeft === 0;
  const dead = stuck && isDeadEnd(s);

  const click = (i: number) => {
    if (!free.has(i)) {
      sfx.stoneTap();
      setShake(i);
      setTimeout(() => setShake(null), 350);
      return;
    }
    if (selected === null || selected === i) {
      sfx.stoneTap();
      return setSelected(selected === i ? null : i);
    }
    const pair = [
      { i: selected, kind: s.tiles[selected]! },
      { i, kind: s.tiles[i]! },
    ];
    if (tilesMatch(pair[0]!.kind, pair[1]!.kind) && apply({ k: "match", a: selected, b: i, t: 0 })) {
      // Climbing chime for quick successive matches (same 4 s window the score uses).
      const t = Date.now();
      combo.current.n = t - combo.current.at < 4000 ? combo.current.n + 1 : 0;
      combo.current.at = t;
      sfx.gardenChime(combo.current.n);
      setVanishing((v) => [...v, ...pair]);
      setTimeout(() => setVanishing((v) => v.filter((x) => !pair.some((p) => p.i === x.i))), 420);
      const a = tilePos(pair[0]!.i);
      const b = tilePos(pair[1]!.i);
      const id = t;
      setPetals((list) => [...list, { id, left: `${(a.left + b.left) / 2 + tileW / 2}%`, top: `${(a.top + b.top) / 2 + 4}%` }]);
      setTimeout(() => setPetals((list) => list.filter((x) => x.id !== id)), 1000);
      setSelected(null);
      setHint(null);
      return;
    }
    setSelected(i);
  };

  const useHint = () => {
    const pair = safeHint(s);
    if (!pair) return;
    apply({ k: "hint", t: 0 });
    setHint(pair);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 3000);
  };

  // Board geometry: half-tile units → percentages of the board's width.
  const geo = useMemo(() => {
    const xs = s.slots.map((p) => p.x);
    const ys = s.slots.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const cols = (Math.max(...xs) - minX) / 2 + 1.25;
    const rows = (Math.max(...ys) - minY) / 2 + 1.25;
    return { minX, minY, cols, rows };
  }, [s.slots]);
  const tileW = 100 / geo.cols;
  const aspect = (geo.rows * 1.3) / geo.cols;
  const order = s.slots.map((p, i) => ({ p, i })).sort((a, b) => a.p.z - b.p.z || a.p.x - b.p.x || a.p.y - b.p.y);
  const tilePos = (i: number) => {
    const p = s.slots[i]!;
    const depth = p.z * 1.1;
    return { left: ((p.x - geo.minX) / 2) * tileW - depth, top: (((p.y - geo.minY) / 2) * 1.3 * tileW - depth) / aspect };
  };
  const tileStyle = (i: number): React.CSSProperties => {
    const p = s.slots[i]!;
    return {
      left: `${tilePos(i).left}%`,
      top: `${tilePos(i).top}%`,
      width: `${tileW * 0.96}%`,
      height: `${((tileW * 1.3) / aspect) * 0.96}%`,
      zIndex: p.z * 100 + Math.round(p.x),
    };
  };
  const tileClass = "mj-tile absolute rounded-[14%]";
  /** Where a matched pair meets: halfway between the two tiles (pairs are stored next to each other). */
  const midpoint = (i: number) => {
    const k = vanishing.findIndex((v) => v.i === i);
    const partner = vanishing[k ^ 1];
    const a = tilePos(i);
    const b = partner ? tilePos(partner.i) : a;
    return { left: `${(a.left + b.left) / 2}%`, top: `${(a.top + b.top) / 2}%` };
  };

  return (
    <div data-testid="mahjong-garden">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-surface px-3 py-1.5 text-sm font-bold tabular-nums shadow-card" data-testid="mj-score">
          {totalScore(s, elapsed).toLocaleString()} pts
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm font-semibold tabular-nums shadow-card">
          <Timer className="size-4" /> {Math.floor(elapsed / 60000)}:{String(Math.floor(elapsed / 1000) % 60).padStart(2, "0")}
        </span>
        <span className="rounded-full bg-surface px-3 py-1.5 text-sm font-semibold shadow-card" data-testid="mj-left">
          {s.tiles.filter((t) => t !== null).length} tiles · {pairsLeft} moves
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={useHint} disabled={!pairsLeft} data-testid="mj-hint">
            <Lightbulb className="size-4" /> Hint
          </Button>
          <Button size="sm" variant="secondary" onClick={() => apply({ k: "shuffle", t: 0 }) && setSelected(null)} data-testid="mj-shuffle">
            <Shuffle className="size-4" /> Shuffle
          </Button>
          <Button size="sm" variant="secondary" onClick={() => apply({ k: "undo", t: 0 }) && setSelected(null)} disabled={!g.canUndo} data-testid="mj-undo">
            <Undo2 className="size-4" /> Undo
          </Button>
          <Button size="sm" variant="ghost" onClick={() => end(false)} data-testid="mj-end">
            <Flag className="size-4" /> End game
          </Button>
          <Button size="sm" variant="ghost" onClick={onQuit}>
            Quit
          </Button>
        </div>
      </div>

      <div className="mj-scene relative overflow-hidden rounded-[28px] p-3 shadow-card sm:p-6">
        <GardenBackdrop />
        <div className="relative mx-auto w-full max-w-4xl" style={{ paddingBottom: `${aspect * 100}%` }}>
          {order.map(({ i }) => {
            const kind = s.tiles[i];
            if (kind === null || kind === undefined) return null;
            const isFree = free.has(i);
            return (
              <motion.button
                key={i}
                type="button"
                initial={{ opacity: 0, scale: 0.8, y: -12 }}
                animate={{ opacity: 1, scale: 1, y: selected === i ? -7 : 0, x: shake === i ? [0, -4, 4, -3, 0] : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 26, opacity: { duration: 0.3, delay: Math.min(1.2, (s.slots[i]!.z * 40 + i) * 0.006) }, scale: { delay: Math.min(1.2, (s.slots[i]!.z * 40 + i) * 0.006) } }}
                onClick={() => click(i)}
                data-testid={`tile-${i}`}
                data-free={isFree}
                data-hinted={hint?.includes(i) || undefined}
                data-kind={kind}
                aria-label={`Tile ${i}${isFree ? "" : " (blocked)"}`}
                aria-pressed={selected === i}
                className={cn(tileClass, "transition-[filter]", isFree ? "mj-free" : "brightness-[0.78] saturate-[0.85]", selected === i && "mj-selected", hint?.includes(i) && "mj-hinted")}
                style={tileStyle(i)}
              >
                <TileFace kind={kind} />
              </motion.button>
            );
          })}
          {vanishing.map(({ i, kind }) => (
            <motion.div
              key={`gone-${i}`}
              aria-hidden
              initial={{ opacity: 1, scale: 1, left: `${tilePos(i).left}%`, top: `${tilePos(i).top}%` }}
              animate={{ opacity: [1, 1, 0], scale: [1, 1.08, 0.6], left: midpoint(i).left as string, top: midpoint(i).top as string }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              className={cn(tileClass, "pointer-events-none mj-selected")}
              style={{ ...tileStyle(i), zIndex: 9999 }}
            >
              <TileFace kind={kind} />
            </motion.div>
          ))}
          {petals.map((p) => (
            <span key={p.id} className="pointer-events-none absolute z-[10000]" style={{ left: p.left, top: p.top }} aria-hidden>
              {Array.from({ length: 12 }, (_, k) => {
                const a = (k / 12) * Math.PI * 2;
                return (
                  <motion.span
                    key={k}
                    className="absolute block size-3 rounded-[60%_0] bg-[#f6a5c0]"
                    initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
                    animate={{ x: Math.cos(a) * (50 + (k % 3) * 18), y: Math.sin(a) * (40 + (k % 2) * 20) + 30, opacity: 0, rotate: 220, scale: 1 }}
                    transition={{ duration: 0.95, ease: "easeOut" }}
                    style={{ background: k % 3 === 0 ? "#fff0f5" : k % 3 === 1 ? "#f6a5c0" : "#f2c76b" }}
                  />
                );
              })}
            </span>
          ))}
        </div>
        <AnimatePresence>
          {cleared && (
            <motion.div className="pointer-events-none absolute inset-0 z-[20000] flex items-center justify-center overflow-hidden rounded-[28px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid="mj-cleared">
              {Array.from({ length: 9 }, (_, k) => (
                <motion.span
                  key={k}
                  className="absolute bottom-0 block h-12 w-9 rounded-[45%] border-2 border-[#7a2a1a] bg-[#e85d3a] shadow-[0_0_24px_8px_rgb(255_170_80/0.55)]"
                  style={{ left: `${8 + k * 10.5}%` }}
                  initial={{ y: 60, opacity: 0 }}
                  animate={{ y: -700, opacity: [0, 1, 1, 0], x: [0, k % 2 ? 12 : -12, 0] }}
                  transition={{ duration: 3.2, delay: k * 0.12, ease: "easeOut" }}
                />
              ))}
              <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.3 }} className="rounded-2xl bg-[#1d1530]/70 px-6 py-3 font-display text-3xl font-black text-[#fff6ea] backdrop-blur-sm">
                Garden cleared
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
        {stuck && (
          <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-black/45 p-4 backdrop-blur-sm" role="status" data-testid="mj-stuck">
            <div className="rounded-3xl bg-surface p-6 text-center shadow-xl">
              <p className="font-display text-2xl font-bold">No moves left</p>
              <p className="mt-1 text-sm text-ink-muted">{dead ? "These tiles can't be cleared any more — undo a few matches or end the game." : "Shuffle the remaining tiles to keep going."}</p>
              <div className="mt-4 flex justify-center gap-2">
                {!dead && <Button onClick={() => apply({ k: "shuffle", t: 0 })}>Shuffle</Button>}
                <Button variant="secondary" onClick={() => apply({ k: "undo", t: 0 })} disabled={!g.canUndo}>
                  Undo
                </Button>
                <Button variant="ghost" onClick={() => end(false)}>
                  End game
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-ink-muted">Tap two matching free tiles. Free tiles have nothing on top and an open left or right side.</p>
    </div>
  );
}

/** Dusk garden behind the board: sky, hills, a pagoda, a moonlit pond and drifting petals. */
function GardenBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <svg className="absolute inset-0 size-full" preserveAspectRatio="xMidYMax slice" viewBox="0 0 800 500">
        <circle cx="640" cy="90" r="38" fill="#fff1d6" opacity="0.9" />
        <circle cx="640" cy="90" r="60" fill="#fff1d6" opacity="0.12" />
        <path d="M0 330 C 120 260, 220 300, 330 250 C 450 200, 560 270, 800 220 V 500 H 0 Z" fill="#4a3561" opacity="0.65" />
        <path d="M0 380 C 160 330, 300 370, 420 330 C 560 290, 680 350, 800 320 V 500 H 0 Z" fill="#33244a" />
        <g transform="translate(110 250)" fill="#241a36">
          <path d="M-30 80 h60 v-30 h-60z M-38 50 h76 l-10 -14 h-56z M-24 36 h48 v-22 h-48z M-32 14 h64 l-10 -14 h-44z M-16 0 h32 v-20 h-32z M-24 -20 h48 l-24 -22z" />
        </g>
        <path d="M0 440 C 200 420, 600 430, 800 445 V 500 H 0 Z" fill="#2a3f5c" opacity="0.7" />
        <ellipse cx="640" cy="465" rx="40" ry="5" fill="#fff1d6" opacity="0.35" />
        <path d="M800 0 C 700 40, 640 30, 560 70" stroke="#3a2418" strokeWidth="7" fill="none" />
        {[[700, 34], [640, 46], [600, 58], [740, 22], [672, 56]].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            {[0, 1, 2, 3, 4].map((k) => (
              <circle key={k} cx={Math.cos((k / 5) * 6.283) * 5} cy={Math.sin((k / 5) * 6.283) * 5} r="4.5" fill="#f6a5c0" />
            ))}
          </g>
        ))}
      </svg>
      {Array.from({ length: 10 }, (_, k) => (
        <span key={k} className="mj-petal" style={{ left: `${(k * 37) % 100}%`, animationDelay: `${-k * 1.7}s`, animationDuration: `${11 + (k % 4) * 2.5}s` }} />
      ))}
    </div>
  );
}
