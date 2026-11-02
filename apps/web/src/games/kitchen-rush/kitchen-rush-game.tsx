"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChefHat, Coins, Lock, Pause, Play, Star, Trash2, X } from "lucide-react";
import {
  CUSTOMER_TYPES,
  ITEMS,
  LEVELS,
  RECIPES,
  SOLO_COOK,
  STATION_NAMES,
  advance,
  createKitchen,
  starsFor,
  stationForm,
  tap,
  type KitchenConfig,
  type KitchenState,
  type KitchenTap,
} from "@platform/engines/kitchen-rush";
import { Button, cn } from "@/components/ui/primitives";
import { readLocal, writeLocal } from "@/lib/recent";
import { sfx } from "@/lib/sound";
import type { SoloGameProps, SoloSetupProps } from "../solo-types";
import { CustomerFace, FoodIcon, PlateIcon } from "./food-icons";

const PROGRESS_KEY = "kr.progress";
type Progress = Record<number, number>;

// ---------------------------------------------------------------------------
// Level select
// ---------------------------------------------------------------------------

export function KitchenRushSetup({ onStart, busy }: SoloSetupProps) {
  const [progress, setProgress] = useState<Progress>({});
  const [level, setLevel] = useState(1);
  useEffect(() => {
    const p = readLocal<Progress>(PROGRESS_KEY, {});
    setProgress(p);
    const firstUnplayed = LEVELS.find((l) => !p[l.number] && (l.number === 1 || (p[l.number - 1] ?? 0) >= 1));
    setLevel(firstUnplayed?.number ?? 1);
  }, []);
  const unlocked = (n: number) => n === 1 || (progress[n - 1] ?? 0) >= 1;
  const def = LEVELS[level - 1]!;
  return (
    <div>
      <h2 className="font-display text-xl font-bold">Choose a level</h2>
      <p className="mt-1 text-sm text-ink-muted">Earn at least one star to unlock the next level.</p>
      <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6" role="radiogroup" aria-label="Level">
        {LEVELS.map((l) => {
          const open = unlocked(l.number);
          const stars = progress[l.number] ?? 0;
          return (
            <button
              key={l.number}
              type="button"
              role="radio"
              aria-checked={level === l.number}
              disabled={!open}
              onClick={() => setLevel(l.number)}
              data-testid={`level-${l.number}`}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-2xl border-2 font-display font-bold transition",
                level === l.number ? "border-brand-500 bg-brand-500/10" : "border-line bg-surface hover:border-brand-400/60",
                !open && "cursor-not-allowed opacity-45",
              )}
            >
              {open ? <span className="text-2xl">{l.number}</span> : <Lock className="size-5" aria-label="Locked" />}
              <span className="mt-1 flex gap-0.5" aria-label={`${stars} stars`}>
                {[1, 2, 3].map((s) => (
                  <Star key={s} className={cn("size-3", s <= stars ? "fill-sun text-sun" : "text-ink-faint")} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-6 rounded-2xl bg-surface-2 p-4">
        <p className="font-display text-lg font-bold">
          Level {def.number}: {def.name}
        </p>
        {def.intro && <p className="mt-1 text-sm text-ink-muted">{def.intro}</p>}
        <div className="mt-3 flex flex-wrap gap-3">
          {def.recipes.map((r) => (
            <span key={r} className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-semibold">
              <FoodIcon item={RECIPES[r].parts[RECIPES[r].parts.length > 1 ? 1 : 0]!} size={18} /> {RECIPES[r].name}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          {def.customers} customers · {Object.entries(def.stations).map(([k, n]) => `${n} ${STATION_NAMES[k as keyof typeof STATION_NAMES].toLowerCase()}${n! > 1 ? "s" : ""}`).join(" · ")}
        </p>
      </div>
      <Button size="lg" className="mt-6 w-full sm:w-auto" disabled={busy || !unlocked(level)} onClick={() => onStart({ level })} data-testid="start-run">
        <ChefHat className="size-5" /> {level === 1 && !progress[1] ? "Start the tutorial" : `Play level ${level}`}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tutorial
// ---------------------------------------------------------------------------

/** The next step to suggest on level 1: a target to highlight and what to say. */
function tutorialStep(s: KitchenState): { target: string; text: string } | null {
  const hand = s.hands[SOLO_COOK];
  const grill = s.stations.find((x) => x.type === "grill")!;
  const g = stationForm(grill, s.t);
  const plate = s.plates[0]!;
  const seat = s.customers.find((c) => c.status === "waiting")?.seat;
  const plateReady = plate.includes("bun") && plate.includes("patty-cooked");
  if (hand?.kind === "plate") return seat === undefined ? { target: "", text: "Wait for a customer to arrive…" } : { target: `seat:${seat}`, text: "Tap the customer to serve the burger!" };
  if (plateReady) return { target: "plate:0", text: "Burger's ready! Tap the plate to pick it up." };
  if (hand?.kind === "item") {
    if (hand.item === "patty-raw") return { target: "st:grill:0", text: "Put the raw patty on the grill." };
    if (hand.item === "burnt") return { target: "trash", text: "Oops, it burnt! Throw it in the bin." };
    return { target: "plate:0", text: `Put the ${ITEMS[hand.item].name.toLowerCase()} on the plate.` };
  }
  if (g.state === "done" || g.state === "burning") return { target: "st:grill:0", text: "The patty is cooked. Take it off the grill before it burns!" };
  if (g.state === "burnt") return { target: "st:grill:0", text: "That one burnt. Pick it up and bin it." };
  if (g.state === "working" && !plate.includes("bun")) return { target: "crate:bun", text: "While it grills, grab a bun." };
  if (g.state === "working") return { target: "", text: "Cooking… watch the timer." };
  if (!plate.includes("patty-cooked")) return { target: "crate:patty-raw", text: "Tap the raw patties to pick one up." };
  return { target: "crate:bun", text: "Grab a bun." };
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

interface Popup {
  id: number;
  seat: number;
  text: string;
  good: boolean;
}

export function KitchenRushGame({ seed, config, onFinish, onQuit }: SoloGameProps<KitchenConfig>) {
  const stateRef = useRef<KitchenState>(createKitchen(seed, config));
  const logRef = useRef<KitchenTap[]>([]);
  const clock = useRef({ start: 0, pausedTotal: 0, pausedAt: 0 as number | 0 });
  const lastSeq = useRef(0);
  const doneRef = useRef(false);
  const dragFrom = useRef<string | null>(null);
  const [, setFrame] = useState(0);
  const [paused, setPaused] = useState(false);
  const [popups, setPopups] = useState<Popup[]>([]);
  const s = stateRef.current;
  const level = s.level;

  const gameTime = useCallback(() => {
    const c = clock.current;
    const now = c.pausedAt || performance.now();
    return Math.max(0, Math.floor(now - c.start - c.pausedTotal));
  }, []);

  /** Plays sounds and pop-ups for new engine events. */
  const react = useCallback(() => {
    for (const { seq, e } of stateRef.current.events) {
      if (seq <= lastSeq.current) continue;
      lastSeq.current = seq;
      if (e.kind === "served") {
        sfx.serve();
        setPopups((p) => [...p, { id: seq, seat: e.seat, text: `+${e.points + e.tip}`, good: true }]);
      } else if (e.kind === "wrong") {
        sfx.error();
        setPopups((p) => [...p, { id: seq, seat: e.seat, text: `Wrong order −${e.penalty}`, good: false }]);
      } else if (e.kind === "left") {
        sfx.error();
        setPopups((p) => [...p, { id: seq, seat: e.seat, text: `Walked out −${e.penalty}`, good: false }]);
      } else if (e.kind === "burnt") sfx.burn();
      else if (e.kind === "arrive") sfx.join();
      else if (e.kind === "pickup" || e.kind === "plate") sfx.pop();
      else if (e.kind === "place") sfx.chop();
      else if (e.kind === "nope") sfx.tick();
    }
  }, []);

  const finishIfDone = useCallback(() => {
    const st = stateRef.current;
    if (!st.finished || doneRef.current) return;
    doneRef.current = true;
    const score = Math.max(0, st.score);
    const stars = starsFor(st, score);
    const progress = readLocal<Progress>(PROGRESS_KEY, {});
    progress[st.level.number] = Math.max(progress[st.level.number] ?? 0, stars);
    writeLocal(PROGRESS_KEY, progress);
    const hasNext = stars >= 1 && st.level.number < LEVELS.length;
    setTimeout(
      () =>
        onFinish(logRef.current, {
          score,
          completed: stars >= 1,
          headline: stars >= 1 ? `${"★".repeat(stars)}${"☆".repeat(3 - stars)} · ${st.level.name} complete!` : `${st.level.name} — try again for a star`,
          nextConfig: hasNext ? { level: st.level.number + 1 } : undefined,
          nextLabel: hasNext ? `Level ${st.level.number + 1}` : undefined,
        }),
      900,
    );
  }, [onFinish]);

  // Main loop: advance time, re-render ~20 times a second.
  useEffect(() => {
    clock.current.start = performance.now();
    const id = setInterval(() => {
      if (clock.current.pausedAt || doneRef.current) return;
      advance(stateRef.current, gameTime());
      react();
      finishIfDone();
      setFrame((n) => n + 1);
    }, 50);
    return () => clearInterval(id);
  }, [gameTime, react, finishIfDone]);

  const setPausedState = useCallback((p: boolean) => {
    const c = clock.current;
    if (p && !c.pausedAt) c.pausedAt = performance.now();
    if (!p && c.pausedAt) {
      c.pausedTotal += performance.now() - c.pausedAt;
      c.pausedAt = 0;
    }
    setPaused(p);
  }, []);

  useEffect(() => {
    const onVis = () => document.hidden && setPausedState(true);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [setPausedState]);

  const doTap = useCallback(
    (target: string) => {
      if (clock.current.pausedAt || doneRef.current) return;
      const last = logRef.current[logRef.current.length - 1]?.t ?? 0;
      const t = Math.max(last, gameTime());
      tap(stateRef.current, SOLO_COOK, target, t);
      logRef.current.push({ t, target });
      react();
      finishIfDone();
      setFrame((n) => n + 1);
    },
    [gameTime, react, finishIfDone],
  );

  // Drag and drop: pressing a source taps it; releasing over a different target taps that too.
  const targetProps = (target: string) => ({
    tabIndex: 0,
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      dragFrom.current = target;
      doTap(target);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      doTap(target);
    },
  });
  useEffect(() => {
    const up = (e: PointerEvent) => {
      const from = dragFrom.current;
      dragFrom.current = null;
      if (!from) return;
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-target]");
      const to = el?.dataset.target;
      if (to && to !== from) doTap(to);
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [doTap]);

  useEffect(() => {
    if (!popups.length) return;
    const id = setTimeout(() => setPopups((p) => p.slice(1)), 1400);
    return () => clearTimeout(id);
  }, [popups]);

  const hand = s.hands[SOLO_COOK];
  const hint = level.number === 1 ? tutorialStep(s) : null;
  const glow = (target: string) => (hint?.target === target ? "ring-4 ring-sun ring-offset-2 ring-offset-transparent animate-pulse" : "");
  const remaining = s.customers.filter((c) => c.status === "queued" || c.status === "waiting").length;
  const t = s.t;

  return (
    <div className="select-none" data-testid="kitchen-rush">
      {/* HUD */}
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl bg-gradient-to-r from-[#ff8a3d] to-[#ffc83d] px-4 py-2.5 text-[#3a1700] shadow-card">
        <ChefHat className="size-6" />
        <p className="font-display text-lg font-extrabold">
          {level.number}. {level.name}
        </p>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1 font-display font-bold tabular-nums" data-testid="kr-score">
          <Coins className="size-4" /> {s.score}
        </span>
        <span className="rounded-full bg-white/60 px-3 py-1 text-sm font-bold tabular-nums" data-testid="kr-remaining">
          {s.served} served · {remaining} to go
        </span>
        <button type="button" className="rounded-full bg-white/60 p-2" onClick={() => setPausedState(!paused)} aria-label={paused ? "Resume" : "Pause"} data-testid="kr-pause">
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
        </button>
        <button type="button" className="rounded-full bg-white/60 p-2" onClick={onQuit} aria-label="Quit level">
          <X className="size-4" />
        </button>
      </div>

      {hint && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border-2 border-sun bg-sun/15 px-4 py-2 font-semibold" role="status" data-testid="kr-hint" data-hint-target={hint.target}>
          <ChefHat className="size-5 shrink-0 text-sun" /> {hint.text}
        </div>
      )}

      <div className="relative overflow-hidden rounded-3xl border border-line bg-[#fff6e8] p-3 shadow-card sm:p-4 dark:bg-[#2a2238]">
        {/* Dining counter */}
        <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${level.seats}, minmax(0, 1fr))` }}>
          {Array.from({ length: level.seats }, (_, seat) => {
            const c = s.customers.find((x) => x.status === "waiting" && x.seat === seat);
            const left = c ? Math.max(0, (c.arrivedAt! + c.patienceMs - t) / c.patienceMs) : 0;
            const mood = left > 0.55 ? "happy" : left > 0.25 ? "ok" : "upset";
            const servable = hand?.kind === "plate" && !!c;
            return (
              <div
                key={seat}
                data-target={`seat:${seat}`}
                {...targetProps(`seat:${seat}`)}
                role="button"
                aria-label={c ? `Customer at seat ${seat + 1} wants ${RECIPES[c.recipe].name}` : `Empty seat ${seat + 1}`}
                data-testid={`seat-${seat}`}
                className={cn(
                  "relative flex min-h-36 flex-col items-center rounded-2xl border-2 border-dashed border-[#e9c79a] bg-white/70 p-2 dark:bg-white/5",
                  servable && "border-solid border-mint bg-mint/10",
                  glow(`seat:${seat}`),
                )}
              >
                <AnimatePresence>
                  {c && (
                    <motion.div key={c.id} initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="flex w-full flex-col items-center">
                      <div className="mb-1 w-full rounded-xl bg-white px-2 py-1 shadow-sm dark:bg-[#1c1730]">
                        <p className="truncate text-center text-[11px] font-bold sm:text-xs">{RECIPES[c.recipe].name}</p>
                        <div className="flex flex-wrap justify-center">
                          {RECIPES[c.recipe].parts.map((p) => (
                            <FoodIcon key={p} item={p} size={28} />
                          ))}
                        </div>
                      </div>
                      <CustomerFace type={c.type} mood={mood} seed={c.id} />
                      {c.type !== "regular" && <span className="rounded-full bg-[#3a1700] px-2 text-[10px] font-bold text-white">{CUSTOMER_TYPES[c.type].name}</span>}
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/10" role="progressbar" aria-label="Patience" aria-valuenow={Math.round(left * 100)}>
                        <div className={cn("h-full rounded-full transition-[width] duration-200", left > 0.55 ? "bg-mint" : left > 0.25 ? "bg-sun" : "bg-hot")} style={{ width: `${left * 100}%` }} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <AnimatePresence>
                  {popups
                    .filter((p) => p.seat === seat)
                    .map((p) => (
                      <motion.span
                        key={p.id}
                        initial={{ y: 10, opacity: 0, scale: 0.8 }}
                        animate={{ y: -10, opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className={cn("absolute top-1/3 z-10 rounded-full px-3 py-1 font-display text-lg font-black text-white shadow-lg", p.good ? "bg-mint" : "bg-hot")}
                      >
                        {p.text}
                      </motion.span>
                    ))}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Stations */}
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
          {s.stations.map((st) => {
            const key = `st:${st.type}:${st.index}`;
            const form = stationForm(st, t);
            const tone =
              form.state === "working" ? "bg-sky-400" : form.state === "done" ? "bg-mint" : form.state === "burning" ? "bg-sun" : form.state === "burnt" ? "bg-ink" : "bg-transparent";
            return (
              <div
                key={key}
                data-target={key}
                {...targetProps(key)}
                role="button"
                aria-label={`${STATION_NAMES[st.type]} ${st.index + 1}${form.item ? `: ${ITEMS[form.item].name}, ${form.state}` : ", empty"}`}
                data-testid={`station-${st.type}-${st.index}`}
                data-state={form.state}
                className={cn(
                  "relative flex h-28 flex-col items-center justify-center rounded-2xl border-b-4 text-white shadow-md transition active:translate-y-0.5",
                  st.type === "board" && "border-[#9b6b3d] bg-[#c99a62]",
                  st.type === "grill" && "border-[#1f1d2b] bg-[#3a3850]",
                  st.type === "fryer" && "border-[#a86d00] bg-[#e0a326]",
                  st.type === "pot" && "border-[#3a5a8c] bg-[#5d82bd]",
                  form.state === "burning" && "animate-pulse",
                  glow(key),
                )}
              >
                <span className="absolute top-1.5 left-2 text-[10px] font-bold uppercase opacity-80">{STATION_NAMES[st.type]}</span>
                {form.item ? <FoodIcon item={form.item} size={48} /> : <span className="text-xs opacity-60">empty</span>}
                {form.item && form.state !== "idle" && (
                  <div className="absolute inset-x-2 bottom-2 h-1.5 overflow-hidden rounded-full bg-black/25">
                    <div className={cn("h-full", tone)} style={{ width: `${Math.round((form.state === "working" ? form.progress : form.state === "burnt" ? 1 : form.progress) * 100)}%` }} />
                  </div>
                )}
                {(form.state === "burning" || form.state === "burnt") && <span className="absolute top-1 right-2 text-sm">🔥</span>}
              </div>
            );
          })}
        </div>

        {/* Plates and bin */}
        <div className="mt-4 flex flex-wrap items-stretch gap-2 sm:gap-3">
          {s.plates.map((parts, i) => {
            const selected = hand?.kind === "plate" && hand.plate === i;
            return (
              <div
                key={i}
                data-target={`plate:${i}`}
                {...targetProps(`plate:${i}`)}
                role="button"
                aria-label={`Plate ${i + 1}: ${parts.length ? parts.map((p) => ITEMS[p].name).join(", ") : "empty"}`}
                aria-pressed={selected}
                data-testid={`plate-${i}`}
                className={cn("relative flex h-24 w-28 items-center justify-center rounded-2xl bg-white/60 transition dark:bg-white/10", selected && "-translate-y-1 ring-4 ring-brand-500", glow(`plate:${i}`))}
              >
                <PlateIcon size={88} />
                <div className="absolute inset-0 flex flex-wrap content-center items-center justify-center p-4">
                  {parts.map((p) => (
                    <FoodIcon key={p} item={p} size={parts.length > 3 ? 28 : 36} className="-m-1" />
                  ))}
                </div>
              </div>
            );
          })}
          <button
            type="button"
            data-target="trash"
            {...targetProps("trash")}
            className={cn("flex h-24 w-20 flex-col items-center justify-center rounded-2xl bg-[#6b6880] text-white", glow("trash"))}
            aria-label="Bin"
            data-testid="trash"
          >
            <Trash2 className="size-7" />
            <span className="text-xs font-bold">Bin</span>
          </button>
          <div className="ml-auto flex min-w-36 items-center gap-2 rounded-2xl bg-white/70 px-3 py-2 dark:bg-white/10" aria-live="polite" data-testid="kr-hand">
            <span className="text-xs font-bold text-ink-muted uppercase">Holding</span>
            {hand?.kind === "item" ? (
              <>
                <FoodIcon item={hand.item} size={36} />
                <span className="text-sm font-semibold">{ITEMS[hand.item].name}</span>
              </>
            ) : hand?.kind === "plate" ? (
              <span className="text-sm font-semibold">Plate {hand.plate + 1} — tap a customer</span>
            ) : (
              <span className="text-sm text-ink-muted">nothing</span>
            )}
          </div>
        </div>

        {/* Pantry */}
        <div className="mt-4 flex flex-wrap gap-2 rounded-2xl bg-[#e9c79a]/50 p-2 sm:gap-3 sm:p-3">
          {s.crates.map((item) => (
            <button
              key={item}
              type="button"
              data-target={`crate:${item}`}
              {...targetProps(`crate:${item}`)}
              className={cn("flex w-20 flex-col items-center rounded-xl border-b-4 border-[#9b6b3d] bg-[#d8a86c] px-1 py-1.5 text-[#3a1700] transition active:translate-y-0.5", glow(`crate:${item}`))}
              aria-label={`Take ${ITEMS[item].name}`}
              data-testid={`crate-${item}`}
            >
              <FoodIcon item={item} size={40} />
              <span className="text-[10px] leading-tight font-bold">{ITEMS[item].name}</span>
            </button>
          ))}
        </div>

        {paused && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/55 backdrop-blur-sm">
            <p className="font-display text-4xl font-black text-white">Paused</p>
            <Button size="lg" onClick={() => setPausedState(false)}>
              <Play className="size-5" /> Resume
            </Button>
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-ink-muted">Tap a food then a station, or drag between them. Hold a plate and tap a customer to serve.</p>
    </div>
  );
}
