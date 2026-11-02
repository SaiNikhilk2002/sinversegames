"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Flag, Lightbulb, Shuffle, Timer, Undo2 } from "lucide-react";
import {
  LAYOUTS,
  LAYOUT_IDS,
  MahjongGame,
  availablePairs,
  freeTiles,
  isDeadEnd,
  tilesMatch,
  totalScore,
  type LayoutId,
  type MahjongConfig,
  type MahjongMove,
} from "@platform/engines/mahjong-garden";
import { Button, cn } from "@/components/ui/primitives";
import { sfx } from "@/lib/sound";
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
              className={cn("rounded-2xl border-2 p-4 text-left transition", layout === id ? "border-brand-500 bg-brand-500/10" : "border-line hover:border-brand-400/60")}
            >
              <p className="font-display text-lg font-bold">{def.name}</p>
              <p className="text-sm text-ink-muted">
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
// Tile faces
// ---------------------------------------------------------------------------

const NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const HONORS = ["東", "南", "西", "北", "中", "發", "白"];
const FLOWERS = ["梅", "蘭", "菊", "竹"];
const SEASONS = ["春", "夏", "秋", "冬"];
const DOT_POS: [number, number][][] = [
  [[20, 26]],
  [[20, 15], [20, 37]],
  [[11, 13], [20, 26], [29, 39]],
  [[12, 15], [28, 15], [12, 37], [28, 37]],
  [[12, 13], [28, 13], [20, 26], [12, 39], [28, 39]],
  [[13, 12], [27, 12], [13, 26], [27, 26], [13, 40], [27, 40]],
  [[11, 10], [20, 15], [29, 20], [13, 30], [27, 30], [13, 41], [27, 41]],
  [[13, 9], [27, 9], [13, 20], [27, 20], [13, 31], [27, 31], [13, 42], [27, 42]],
  [[10, 12], [20, 12], [30, 12], [10, 26], [20, 26], [30, 26], [10, 40], [20, 40], [30, 40]],
];

function TileFace({ kind }: { kind: number }) {
  if (kind < 9) {
    const n = kind;
    return (
      <svg viewBox="0 0 40 52" className="size-full">
        {DOT_POS[n]!.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={n > 6 ? 4.2 : 5} fill={i % 3 === 0 ? "#2f6fd6" : i % 3 === 1 ? "#e0314b" : "#1f9d55"} />
            <circle cx={x} cy={y} r={n > 6 ? 1.6 : 2} fill="#fff" />
          </g>
        ))}
      </svg>
    );
  }
  if (kind < 18) {
    const n = kind - 9 + 1;
    const cols = n <= 3 ? n : n <= 6 ? 3 : 3;
    const rows = Math.ceil(n / cols);
    return (
      <svg viewBox="0 0 40 52" className="size-full">
        {Array.from({ length: n }, (_, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          const x = 20 + (c - (Math.min(cols, n - r * cols) - 1) / 2) * 11;
          const y = 26 + (r - (rows - 1) / 2) * (40 / rows);
          return (
            <g key={i}>
              <rect x={x - 3} y={y - 40 / rows / 2 + 2} width="6" height={40 / rows - 4} rx="3" fill={i % 2 ? "#1f9d55" : "#2fb36b"} />
              <rect x={x - 3.5} y={y - 1} width="7" height="2" fill="#0f6b3a" />
            </g>
          );
        })}
      </svg>
    );
  }
  const glyph = (text: string, color: string, sub?: string) => (
    <span className="flex size-full flex-col items-center justify-center leading-none font-bold" style={{ color }}>
      <span className="text-[clamp(10px,3.4vw,22px)]">{text}</span>
      {sub && <span className="mt-0.5 text-[clamp(8px,2.6vw,16px)] text-[#e0314b]">{sub}</span>}
    </span>
  );
  if (kind < 27) return glyph(NUMERALS[kind - 18]!, "#17142b", "萬");
  if (kind < 31) return glyph(HONORS[kind - 27]!, "#17142b");
  if (kind === 31) return glyph("中", "#e0314b");
  if (kind === 32) return glyph("發", "#1f9d55");
  if (kind === 33) return <span className="m-[18%] block size-[64%] rounded-md border-[3px] border-[#2f6fd6]" />;
  if (kind < 38) return glyph(FLOWERS[kind - 34]!, "#d6336c", "✿");
  return glyph(SEASONS[kind - 38]!, "#e8590c", "☀");
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
        sfx.win();
        setTimeout(() => end(true), 800);
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
      sfx.tick();
      setShake(i);
      setTimeout(() => setShake(null), 350);
      return;
    }
    if (selected === null || selected === i) return setSelected(selected === i ? null : i);
    const pair = [
      { i: selected, kind: s.tiles[selected]! },
      { i, kind: s.tiles[i]! },
    ];
    if (tilesMatch(pair[0]!.kind, pair[1]!.kind) && apply({ k: "match", a: selected, b: i, t: 0 })) {
      sfx.match();
      setVanishing((v) => [...v, ...pair]);
      setTimeout(() => setVanishing((v) => v.filter((x) => !pair.some((p) => p.i === x.i))), 300);
      setSelected(null);
      setHint(null);
      return;
    }
    setSelected(i);
  };

  const useHint = () => {
    const pair = availablePairs(s)[0];
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
  const tileStyle = (i: number): React.CSSProperties => {
    const p = s.slots[i]!;
    const depth = p.z * 1.1;
    return {
      left: `${((p.x - geo.minX) / 2) * tileW - depth}%`,
      top: `${(((p.y - geo.minY) / 2) * 1.3 * tileW - depth) / aspect}%`,
      width: `${tileW * 0.96}%`,
      height: `${((tileW * 1.3) / aspect) * 0.96}%`,
      zIndex: p.z * 100 + Math.round(p.x),
    };
  };
  const tileClass = "absolute rounded-[14%] border border-[#cdbfa8] bg-[#fffdf7] shadow-[3px_4px_0_#c9b48f,5px_7px_0_#a8916a,6px_9px_8px_rgb(0_0_0/0.3)]";

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

      <div className="relative rounded-3xl bg-gradient-to-br from-[#ffe3ea] via-[#ffd6c9] to-[#f7c6d9] p-3 shadow-card sm:p-6 dark:from-[#3a1f33] dark:via-[#2e1d33] dark:to-[#22173a]">
        <div className="relative mx-auto w-full max-w-4xl" style={{ paddingBottom: `${aspect * 100}%` }}>
          {order.map(({ i }) => {
            const kind = s.tiles[i];
            if (kind === null || kind === undefined) return null;
            const isFree = free.has(i);
            return (
              <motion.button
                key={i}
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1, x: shake === i ? [0, -4, 4, -3, 0] : 0 }}
                onClick={() => click(i)}
                data-testid={`tile-${i}`}
                data-free={isFree}
                data-hinted={hint?.includes(i) || undefined}
                data-kind={kind}
                aria-label={`Tile ${i}${isFree ? "" : " (blocked)"}`}
                aria-pressed={selected === i}
                className={cn(tileClass, "transition-[filter]", !isFree && "brightness-[0.82]", selected === i && "bg-[#fff1a8] ring-4 ring-sun", hint?.includes(i) && "ring-4 ring-mint")}
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
              initial={{ opacity: 1, scale: 1 }}
              animate={{ opacity: 0, scale: 1.25 }}
              transition={{ duration: 0.25 }}
              className={cn(tileClass, "pointer-events-none")}
              style={tileStyle(i)}
            >
              <TileFace kind={kind} />
            </motion.div>
          ))}
        </div>
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
