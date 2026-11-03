"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChefHat, Lock, Music, Music2, Pause, Play, Star, Trash2, Volume2, VolumeX, X } from "lucide-react";
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
  type Customer,
  type CustomerTypeId,
  type ItemId,
  type KitchenConfig,
  type KitchenState,
  type KitchenTap,
  type RecipeId,
  type StationType,
} from "@platform/engines/kitchen-rush";
import { Button, cn } from "@/components/ui/primitives";
import { readLocal, writeLocal } from "@/lib/recent";
import { updateSettings, useSettings } from "@/lib/settings";
import { audioReady, createLoop, playMusic, sfx, stopMusic, unlockAudio, type Loop } from "@/lib/sound";
import type { SoloGameProps, SoloSetupProps } from "../solo-types";
import { CustomerFigure, customerName, type Mood } from "./art/customer";
import { Dish, FoodSprite } from "./art/food";
import { StationArt, type StationState } from "./art/stations";
import { DINER_SONG } from "./music";
import { Fx } from "./fx";

const PROGRESS_KEY = "kr.progress";
type Progress = Record<number, number>;

const sameDish = (parts: readonly ItemId[], recipe: RecipeId) => {
  const want = [...RECIPES[recipe].parts].sort();
  const have = [...parts].sort();
  return want.length === have.length && want.every((p, i) => p === have[i]);
};

function useReducedMotion() {
  const s = useSettings();
  const [os, setOs] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setOs(mq.matches);
    const on = () => setOs(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return s.reducedMotion || os;
}

// ---------------------------------------------------------------------------
// Level select: a diner menu board of order tickets
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
  const totalStars = Object.values(progress).reduce((n, s) => n + s, 0);
  return (
    <div className="kr">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-black tracking-tight">Tonight&apos;s shifts</h2>
          <p className="mt-1 text-sm text-ink-muted">Earn a star to unlock the next shift.</p>
        </div>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-[#2a1a12] px-3 py-1 font-display text-sm font-bold text-[#ffcf3f]">
          <Star className="size-4 fill-current" /> {totalStars} / {LEVELS.length * 3}
        </p>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6" role="radiogroup" aria-label="Level">
        {LEVELS.map((l, i) => {
          const open = unlocked(l.number);
          const stars = progress[l.number] ?? 0;
          const active = level === l.number;
          return (
            <button
              key={l.number}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!open}
              onClick={() => {
                unlockAudio();
                sfx.pickup();
                setLevel(l.number);
              }}
              data-testid={`level-${l.number}`}
              style={{ rotate: `${((i * 37) % 7) - 3}deg` }}
              className={cn(
                "kr-press relative flex aspect-[4/5] flex-col items-center justify-center bg-[#fffaf0] text-[#3a1d12] shadow-[0_6px_0_-2px_rgb(0_0_0/0.18),0_10px_18px_-8px_rgb(0_0_0/0.45)] transition-[translate,box-shadow]",
                "[clip-path:polygon(0_0,100%_0,100%_92%,92%_100%,84%_92%,76%_100%,68%_92%,60%_100%,52%_92%,44%_100%,36%_92%,28%_100%,20%_92%,12%_100%,4%_92%,0_100%)]",
                active && "-translate-y-1.5 bg-[#fff2c6]",
                !open && "cursor-not-allowed opacity-50 grayscale",
              )}
            >
              <span className="absolute top-1.5 size-2.5 rounded-full bg-[#e0533c] shadow-[inset_0_-2px_0_rgb(0_0_0/0.25)]" />
              <span className="text-[10px] font-bold tracking-[0.2em] text-[#a0705a] uppercase">Shift</span>
              {open ? <span className="font-display text-3xl font-black leading-none">{l.number}</span> : <Lock className="my-1 size-6" aria-label="Locked" />}
              <span className="mt-1.5 flex gap-0.5" aria-label={`${stars} stars`}>
                {[1, 2, 3].map((s) => (
                  <Star key={s} className={cn("size-3.5", s <= stars ? "fill-[#ffb81f] text-[#c98a12]" : "text-[#d8c7b0]")} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-7 overflow-hidden rounded-[22px] border-4 border-[#5a3a24] bg-[#2b3a33] text-[#f4efe6] shadow-[inset_0_0_40px_rgb(0_0_0/0.35)]">
        <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold tracking-[0.25em] text-[#ffcf3f] uppercase">Shift {def.number}</p>
            <p className="font-display text-2xl font-black">{def.name}</p>
            {def.intro && <p className="mt-1 text-sm text-[#d6dccf]">{def.intro}</p>}
            <p className="mt-2 text-xs text-[#aab5a8]">
              {def.customers} guests · {def.seats} seats · {Object.entries(def.stations).map(([k, n]) => `${n} ${STATION_NAMES[k as keyof typeof STATION_NAMES].toLowerCase()}${n! > 1 ? "s" : ""}`).join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {def.recipes.map((r) => (
              <div key={r} className="flex w-24 flex-col items-center rounded-xl bg-white/5 px-1 py-1.5 text-center">
                <Dish parts={RECIPES[r].parts} animate={false} className="h-14 w-full" />
                <span className="text-[11px] leading-tight font-semibold">{RECIPES[r].name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Button
        size="lg"
        className="mt-6 w-full sm:w-auto"
        disabled={busy || !unlocked(level)}
        onClick={() => {
          unlockAudio();
          onStart({ level });
        }}
        data-testid="start-run"
      >
        <ChefHat className="size-5" /> {level === 1 && !progress[1] ? "Start the tutorial" : `Open shift ${level}`}
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
  if (hand?.kind === "plate") return seat === undefined ? { target: "", text: "Wait for a guest to come in…" } : { target: `seat:${seat}`, text: "Tap the guest to serve the burger!" };
  if (plateReady) return { target: "plate:0", text: "Burger's ready! Tap the plate to pick it up." };
  if (hand?.kind === "item") {
    if (hand.item === "patty-raw") return { target: "st:grill:0", text: "Slap the raw patty on the grill." };
    if (hand.item === "burnt") return { target: "trash", text: "Oops, it burnt! Throw it in the bin." };
    return { target: "plate:0", text: `Put the ${ITEMS[hand.item].name.toLowerCase()} on the plate.` };
  }
  if (g.state === "done" || g.state === "burning") return { target: "st:grill:0", text: "Perfectly grilled! Take it off before it burns." };
  if (g.state === "burnt") return { target: "st:grill:0", text: "That one burnt. Pick it up and bin it." };
  if (g.state === "working" && !plate.includes("bun")) return { target: "crate:bun", text: "While it sizzles, grab a bun." };
  if (g.state === "working") return { target: "", text: "Sizzling… watch the gauge reach green." };
  if (!plate.includes("patty-cooked")) return { target: "crate:patty-raw", text: "Tap the raw patties to pick one up." };
  return { target: "crate:bun", text: "Grab a bun." };
}

// ---------------------------------------------------------------------------
// Scene pieces
// ---------------------------------------------------------------------------

interface Popup {
  id: number;
  anchor: string;
  text: string;
  tone: "good" | "tip" | "bad" | "info";
}

interface Flight {
  id: number;
  item?: ItemId;
  parts?: ItemId[];
  from: { x: number; y: number };
  to: { x: number; y: number };
}

function moodFor(c: Customer, t: number, holding: ItemId[] | null): Mood {
  if (c.status === "served") return "delighted";
  if (c.status === "wrong") return "sad";
  if (c.status === "left") return "storming";
  if (holding && sameDish(holding, c.recipe)) return "excited";
  const left = (c.arrivedAt! + c.patienceMs - t) / c.patienceMs;
  if (t - c.arrivedAt! < 700) return "happy";
  return left > 0.6 ? "happy" : left > 0.35 ? "neutral" : left > 0.15 ? "impatient" : "angry";
}

const Guest = memo(function Guest({ type, seed, mood }: { type: CustomerTypeId; seed: number; mood: Mood }) {
  return <CustomerFigure type={type} seed={seed} mood={mood} />;
});

const PlatedDish = memo(
  function PlatedDish({ parts, className }: { parts: ItemId[]; className?: string }) {
    return <Dish parts={parts} className={className} />;
  },
  // Callers pass copies: the engine mutates plate arrays in place.
  (a, b) => a.parts.join() === b.parts.join() && a.className === b.className,
);

function PatienceRing({ left }: { left: number }) {
  const r = 13;
  const c = 2 * Math.PI * r;
  const color = left > 0.6 ? "#2fbf6f" : left > 0.35 ? "#ffb81f" : "#e8343f";
  return (
    <svg viewBox="0 0 34 34" className={cn("size-8 shrink-0", left <= 0.2 && "kr-ready")} role="progressbar" aria-label="Patience" aria-valuenow={Math.round(left * 100)} aria-valuemin={0} aria-valuemax={100}>
      <circle cx="17" cy="17" r="15.5" fill="#fff" stroke="#3a1d12" strokeWidth="2" />
      <circle cx="17" cy="17" r={r} fill="none" stroke="#eee4d6" strokeWidth="4" />
      <circle cx="17" cy="17" r={r} fill="none" stroke={color} strokeWidth="4" strokeDasharray={c} strokeDashoffset={c * (1 - left)} strokeLinecap="round" transform="rotate(-90 17 17)" style={{ transition: "stroke-dashoffset 120ms linear, stroke 300ms" }} />
      <path d="M17 17 v-6 M17 17 l4 2" stroke="#3a1d12" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const TYPE_TAG: Partial<Record<CustomerTypeId, { label: string; cls: string }>> = {
  hurried: { label: "In a hurry", cls: "bg-[#3b4a63]" },
  vip: { label: "VIP", cls: "bg-[#7c4dff]" },
  critic: { label: "Critic", cls: "bg-[#7a1f3d]" },
};

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export function KitchenRushGame({ seed, config, onFinish, onQuit }: SoloGameProps<KitchenConfig>) {
  const stateRef = useRef<KitchenState>(createKitchen(seed, config));
  const logRef = useRef<KitchenTap[]>([]);
  const clock = useRef({ start: 0, pausedTotal: 0, pausedAt: 0 });
  const lastSeq = useRef(0);
  const doneRef = useRef(false);
  const dragFrom = useRef<string | null>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const followRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<Fx | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const stationPhase = useRef(new Map<string, string>());
  const chopAt = useRef(new Map<string, number>());
  const angryWarned = useRef(new Set<number>());
  const loops = useRef<Record<"sizzle" | "fry" | "simmer" | "room", Loop> | null>(null);
  const musicOn = useRef(false);
  const streak = useRef({ n: 0, lastAt: -1e9 });
  const nextId = useRef(1);
  const [, setFrame] = useState(0);
  const [paused, setPaused] = useState(false);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [banner, setBanner] = useState<{ id: number; text: string } | null>(null);
  const [complete, setComplete] = useState<{ stars: number; score: number } | null>(null);
  const [fine, setFine] = useState(false);
  const [lite, setLite] = useState(false);
  const settings = useSettings();
  const reduced = useReducedMotion();
  const s = stateRef.current;
  const level = s.level;

  const refFns = useRef(new Map<string, (el: HTMLElement | null) => void>());
  /** A stable callback ref per target key, so elements can be found for effects and flights. */
  const ref = useCallback((key: string) => {
    let fn = refFns.current.get(key);
    if (!fn) {
      fn = (el) => {
        if (el) els.current.set(key, el);
        else els.current.delete(key);
      };
      refFns.current.set(key, fn);
    }
    return fn;
  }, []);

  const gameTime = useCallback(() => {
    const c = clock.current;
    const now = c.pausedAt || performance.now();
    return Math.max(0, Math.floor(now - c.start - c.pausedTotal));
  }, []);

  const popup = useCallback((anchor: string, text: string, tone: Popup["tone"]) => {
    const id = nextId.current++;
    setPopups((p) => [...p.slice(-6), { id, anchor, text, tone }]);
    setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 1500);
  }, []);

  const centerOf = useCallback((key: string) => {
    const el = els.current.get(key);
    const scene = sceneRef.current;
    if (!el || !scene) return null;
    const r = el.getBoundingClientRect();
    const c = scene.getBoundingClientRect();
    return { x: r.left - c.left + r.width / 2, y: r.top - c.top + r.height / 2 };
  }, []);

  const fly = useCallback(
    (from: { x: number; y: number } | null, toKey: string, what: { item?: ItemId; parts?: ItemId[] }) => {
      if (reduced || !from) return;
      const to = centerOf(toKey);
      if (!to) return;
      const id = nextId.current++;
      setFlights((f) => [...f, { id, from, to, ...what }]);
      setTimeout(() => setFlights((f) => f.filter((x) => x.id !== id)), 420);
    },
    [centerOf, reduced],
  );

  /** A short camera shake for mistakes. */
  const kick = useCallback(() => {
    if (reduced) return;
    sceneRef.current?.animate(
      [{ transform: "none" }, { transform: "translate(-5px, 2px)" }, { transform: "translate(4px, -2px)" }, { transform: "translate(-3px, 1px)" }, { transform: "translate(2px, 0)" }, { transform: "none" }],
      { duration: 320, easing: "linear" },
    );
  }, [reduced]);

  /** Sounds, particles and pop-ups for new engine events. */
  const react = useCallback(() => {
    const st = stateRef.current;
    const fx = fxRef.current;
    for (const { seq, e } of st.events) {
      if (seq <= lastSeq.current) continue;
      lastSeq.current = seq;
      if (e.kind === "served") {
        sfx.counterBell();
        setTimeout(() => sfx.coins(), 180);
        setTimeout(() => sfx.happy(), 320);
        fx?.burstAt("coins", els.current.get(`seat:${e.seat}`) ?? null, 14, 0.5, 0.45);
        fx?.burstAt("stars", els.current.get(`seat:${e.seat}`) ?? null, 8, 0.5, 0.35);
        popup(`seat:${e.seat}`, `+${e.points}`, "good");
        if (e.tip > 0) setTimeout(() => popup(`seat:${e.seat}`, `+${e.tip} tip`, "tip"), 260);
        const k = streak.current;
        k.n = st.t - k.lastAt < 12000 ? k.n + 1 : 1;
        k.lastAt = st.t;
        if (k.n >= 2) {
          sfx.streak();
          setBanner({ id: seq, text: k.n >= 4 ? `On fire! ×${k.n}` : `Hot streak ×${k.n}` });
          const scene = sceneRef.current;
          if (scene && fx) fx.burst("confetti", scene.clientWidth / 2, scene.clientHeight * 0.3, 26 + k.n * 6);
        }
      } else if (e.kind === "wrong") {
        sfx.error();
        sfx.grumble();
        streak.current.n = 0;
        popup(`seat:${e.seat}`, `Wrong order −${e.penalty}`, "bad");
        kick();
      } else if (e.kind === "left") {
        sfx.grumble();
        streak.current.n = 0;
        popup(`seat:${e.seat}`, `Walked out −${e.penalty}`, "bad");
        kick();
      } else if (e.kind === "burnt") {
        sfx.burn();
        fx?.burstAt("puff", els.current.get(e.station) ?? null, 10, 0.5, 0.3);
        popup(e.station, "Burnt! −5", "bad");
        kick();
      } else if (e.kind === "arrive") sfx.doorChime();
      else if (e.kind === "pickup") sfx.pickup();
      else if (e.kind === "plate") {
        sfx.plateClink();
        fx?.burstAt("crumbs", els.current.get(`plate:${e.plate}`) ?? null, 5, 0.5, 0.4);
      } else if (e.kind === "place") {
        const type = e.target.split(":")[1];
        if (type === "grill") {
          sfx.sizzleHit();
          fx?.burstAt("sparks", els.current.get(e.target) ?? null, 12, 0.5, 0.35);
        } else if (type === "fryer") sfx.splash();
        else if (type === "pot") sfx.plop();
        else sfx.knife();
      } else if (e.kind === "trash") sfx.trash();
      else if (e.kind === "nope") sfx.tick();
    }
  }, [kick, popup]);

  /** Per-frame presentation: emitters, cooking loops, flip/ready/warning cues. */
  const ambience = useCallback(() => {
    const st = stateRef.current;
    const fx = fxRef.current;
    let grills = 0;
    let fryers = 0;
    let pots = 0;
    for (const station of st.stations) {
      const key = `st:${station.type}:${station.index}`;
      const el = els.current.get(key) ?? null;
      const f = stationForm(station, st.t);
      const on = f.state === "working" || f.state === "done" || f.state === "burning";
      if (on && station.type === "grill") grills++;
      if (on && station.type === "fryer") fryers++;
      if (on && station.type === "pot") pots++;
      // Phase changes: flip at half-time on the grill, "ready" ding, burn warning.
      const phase = f.state === "working" && station.type === "grill" && f.progress >= 0.5 ? "flipped" : f.state;
      const prev = stationPhase.current.get(key);
      if (phase !== prev) {
        stationPhase.current.set(key, phase);
        if (prev) {
          if (phase === "flipped") {
            sfx.flip();
            fx?.burstAt("sparks", el, 10, 0.5, 0.3);
          } else if (phase === "done") {
            sfx.ding();
            popup(key, station.type === "board" ? "Chopped!" : "Perfect!", "good");
          } else if (phase === "burning") {
            sfx.warn();
            popup(key, "Burning!", "bad");
          }
        }
      }
      if (station.type === "board" && f.state === "working") {
        const last = chopAt.current.get(key) ?? 0;
        if (st.t - last > 300) {
          chopAt.current.set(key, st.t);
          sfx.knife();
          fx?.burstAt("crumbs", el, 3, 0.45, 0.4);
        }
      }
      if (!fx) continue;
      const smoke = f.state === "burnt" ? ["darkSmoke", 14] : f.state === "burning" ? ["darkSmoke", 9] : null;
      if (station.type === "grill") {
        fx.emit(key, el, (smoke?.[0] ?? "smoke") as "smoke", smoke ? (smoke[1] as number) : on ? (f.state === "done" ? 7 : 5) : 0, 0.5, 0.32, 0.25);
        fx.emit(`${key}:s`, el, "sparks", f.state === "working" ? 5 : 0, 0.5, 0.36, 0.2);
        fx.emit(`${key}:h`, el, "heat", on ? 6 : 0, 0.5, 0.3, 0.3);
      } else if (station.type === "fryer") {
        fx.emit(key, el, (smoke?.[0] ?? "steam") as "steam", smoke ? (smoke[1] as number) : on ? 6 : 0, 0.5, 0.36, 0.3);
        fx.emit(`${key}:s`, el, "sparks", f.state === "working" ? 3 : 0, 0.5, 0.4, 0.3);
      } else if (station.type === "pot") {
        fx.emit(key, el, (smoke?.[0] ?? "steam") as "steam", smoke ? (smoke[1] as number) : on ? (f.state === "working" ? 11 : 6) : 0, 0.5, 0.3, 0.28);
      }
    }
    // Warn once when a guest gets close to leaving.
    for (const c of st.customers) {
      if (c.status !== "waiting" || angryWarned.current.has(c.id)) continue;
      if ((c.arrivedAt! + c.patienceMs - st.t) / c.patienceMs < 0.15) {
        angryWarned.current.add(c.id);
        sfx.grumble();
      }
    }
    const l = loops.current;
    if (l) {
      l.sizzle.set(grills ? 0.55 + 0.25 * grills : 0);
      l.fry.set(fryers ? 0.6 + 0.2 * fryers : 0);
      l.simmer.set(pots ? 0.6 + 0.2 * pots : 0);
      l.room.set(1);
    }
    if (!musicOn.current && audioReady()) {
      musicOn.current = true;
      playMusic(DINER_SONG);
    }
  }, [popup]);

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
    stopMusic();
    if (loops.current) Object.values(loops.current).forEach((l) => l.set(0));
    setTimeout(() => {
      setComplete({ stars, score });
      if (stars >= 1) sfx.fanfare();
      else sfx.grumble();
      for (let i = 0; i < stars; i++) setTimeout(() => sfx.star(i), 650 + i * 380);
      const scene = sceneRef.current;
      if (stars >= 1 && scene) setTimeout(() => fxRef.current?.burst("confetti", scene.clientWidth / 2, scene.clientHeight * 0.35, 90), 600 + stars * 380);
    }, 500);
    setTimeout(
      () =>
        onFinish(logRef.current, {
          score,
          completed: stars >= 1,
          headline: stars >= 1 ? `${"★".repeat(stars)}${"☆".repeat(3 - stars)} · ${st.level.name} complete!` : `${st.level.name} — try again for a star`,
          nextConfig: hasNext ? { level: st.level.number + 1 } : undefined,
          nextLabel: hasNext ? `Level ${st.level.number + 1}` : undefined,
        }),
      3300,
    );
  }, [onFinish]);

  // Particles, audio loops and pointer type.
  useEffect(() => {
    if (canvasRef.current) fxRef.current = new Fx(canvasRef.current, reduced);
    loops.current = { sizzle: createLoop("sizzle"), fry: createLoop("fry"), simmer: createLoop("simmer"), room: createLoop("room") };
    setFine(window.matchMedia("(pointer: fine)").matches);
    unlockAudio();
    return () => {
      fxRef.current?.destroy();
      fxRef.current = null;
      if (loops.current) Object.values(loops.current).forEach((l) => l.stop());
      loops.current = null;
      stopMusic();
      musicOn.current = false;
    };
  }, [reduced]);

  // Graceful fallback: if frames keep running long, drop decorative loops and redraw less often.
  useEffect(() => {
    if (lite) return;
    let raf = 0;
    let last = performance.now();
    let slow = 0;
    let seen = 0;
    const sample = (now: number) => {
      const dt = now - last;
      last = now;
      if (!document.hidden && !clock.current.pausedAt) {
        seen++;
        slow = dt > 28 ? slow + 1 : Math.max(0, slow - 1);
        if (seen > 60 && slow > 45) {
          setLite(true);
          fxRef.current?.setLite();
          return;
        }
      }
      raf = requestAnimationFrame(sample);
    };
    raf = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(raf);
  }, [lite]);

  // Main loop: advance time and re-render about 20 times a second (12 in lite mode).
  useEffect(() => {
    if (!clock.current.start) clock.current.start = performance.now();
    const id = setInterval(() => {
      if (clock.current.pausedAt || doneRef.current) return;
      advance(stateRef.current, gameTime());
      react();
      ambience();
      finishIfDone();
      setFrame((n) => n + 1);
    }, lite ? 80 : 50);
    return () => clearInterval(id);
  }, [gameTime, react, ambience, finishIfDone, lite]);

  const setPausedState = useCallback((p: boolean) => {
    const c = clock.current;
    if (p && !c.pausedAt) c.pausedAt = performance.now();
    if (!p && c.pausedAt) {
      c.pausedTotal += performance.now() - c.pausedAt;
      c.pausedAt = 0;
    }
    fxRef.current?.setPaused(p);
    if (loops.current) Object.values(loops.current).forEach((l) => l.set(0));
    if (p) {
      stopMusic();
      musicOn.current = false;
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
      unlockAudio();
      const st = stateRef.current;
      const before = st.hands[SOLO_COOK];
      const beforePlate = before?.kind === "plate" ? [...st.plates[before.plate]!] : null;
      const last = logRef.current[logRef.current.length - 1]?.t ?? 0;
      const t = Math.max(last, gameTime());
      tap(st, SOLO_COOK, target, t);
      logRef.current.push({ t, target });
      const after = st.hands[SOLO_COOK];
      // Fly what left the chef's hands to where it went.
      if (before?.kind === "item" && !after && target !== "trash") fly(pointer.current ?? centerOf("hand"), target, { item: before.item });
      if (before?.kind === "plate" && !after && target.startsWith("seat:") && beforePlate) fly(centerOf(`plate:${before.plate}`), target, { parts: beforePlate });
      react();
      finishIfDone();
      setFrame((n) => n + 1);
    },
    [gameTime, react, finishIfDone, fly, centerOf],
  );

  // Drag and drop: pressing a source taps it; releasing over a different target taps that too.
  // Handlers are cached per target (and call the latest doTap through a ref) so memoised tiles stay memoised.
  const doTapRef = useRef(doTap);
  doTapRef.current = doTap;
  const handlerCache = useRef(new Map<string, TargetProps>());
  const targetProps = (target: string): TargetProps => {
    let h = handlerCache.current.get(target);
    if (!h) {
      h = {
        tabIndex: 0,
        "data-target": target,
        ref: ref(target),
        onPointerDown: (e) => {
          e.preventDefault();
          dragFrom.current = target;
          doTapRef.current(target);
        },
        onKeyDown: (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          doTapRef.current(target);
        },
      };
      handlerCache.current.set(target, h);
    }
    return h;
  };
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

  const onScenePointer = (e: React.PointerEvent) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const r = scene.getBoundingClientRect();
    const p = { x: e.clientX - r.left, y: e.clientY - r.top };
    pointer.current = p;
    const f = followRef.current;
    if (f) f.style.transform = `translate(${p.x + 10}px, ${p.y - 46}px)`;
  };

  const hand = s.hands[SOLO_COOK];
  const holdingParts = hand?.kind === "plate" ? [...s.plates[hand.plate]!] : null;
  const hint = level.number === 1 ? tutorialStep(s) : null;
  const glow = (target: string) => (hint?.target === target ? "kr-glow" : "");
  const remaining = s.customers.filter((c) => c.status === "queued" || c.status === "waiting").length;
  const t = s.t;
  const stationCols = Math.min(s.stations.length, 5);

  const seatGuests = Array.from({ length: level.seats }, (_, seat) => ({
    waiting: s.customers.find((x) => x.status === "waiting" && x.seat === seat),
    // Guests who just left stay on screen while they react and walk away.
    leaving: s.customers.filter((x) => x.seat === seat && x.status !== "waiting" && x.status !== "queued" && t - (x.resolvedAt ?? 0) < 2000),
  }));

  const toggleMusic = () => {
    unlockAudio();
    updateSettings({ music: !settings.music });
  };
  const toggleSound = () => {
    unlockAudio();
    updateSettings({ sound: !settings.sound });
  };

  return (
    <div className={cn("kr select-none", lite && "kr-lite")} data-testid="kitchen-rush" data-quality={lite ? "lite" : "full"}>
      {/* HUD: an enamel diner sign with a cash-register score */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[18px] border-[3px] border-[#3a1d12] bg-[#e0533c] p-1.5 pr-2 text-white shadow-[0_5px_0_#3a1d12]">
        <div className="flex items-center gap-2 rounded-[12px] bg-[#fffaf0] px-3 py-1.5 text-[#3a1d12]">
          <ChefHat className="size-5" />
          <p className="font-display text-base leading-none font-black sm:text-lg">
            <span className="mr-1.5 text-xs font-bold tracking-widest text-[#c0533c] uppercase">Shift {level.number}</span>
            {level.name}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <span className="rounded-[10px] border-2 border-[#3a1d12] bg-[#1b2a22] px-2.5 py-1 font-mono whitespace-nowrap text-lg leading-none font-bold text-[#8dffb0] tabular-nums shadow-[inset_0_2px_6px_rgb(0_0_0/0.6)]" data-testid="kr-score" aria-label={`Score ${s.score}`}>
            ${String(Math.max(-999, s.score)).padStart(4, " ")}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-black/20 px-2.5 py-1 text-xs font-bold whitespace-nowrap" data-testid="kr-remaining" aria-label={`${s.served} served, ${remaining} to go`}>
            <span className="sm:hidden">
              {s.served}/{s.served + remaining}
            </span>
            <span className="hidden sm:inline">
              {s.served} served · {remaining} to go
            </span>
          </span>
          <HudButton label={settings.music ? "Music off" : "Music on"} onClick={toggleMusic}>
            {settings.music ? <Music className="size-4" /> : <Music2 className="size-4 opacity-50" />}
          </HudButton>
          <HudButton label={settings.sound ? "Mute" : "Unmute"} onClick={toggleSound}>
            {settings.sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </HudButton>
          <HudButton label={paused ? "Resume" : "Pause"} onClick={() => setPausedState(!paused)} testId="kr-pause">
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </HudButton>
          <HudButton label="Quit level" onClick={onQuit}>
            <X className="size-4" />
          </HudButton>
        </div>
      </div>

      {hint && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border-2 border-[#3a1d12] bg-[#fff2c6] px-3 py-2 font-semibold text-[#3a1d12] shadow-[0_3px_0_#3a1d12]" role="status" data-testid="kr-hint" data-hint-target={hint.target}>
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#e0533c] text-white">
            <ChefHat className="size-4" />
          </span>
          <AnimatePresence mode="wait">
            <motion.span key={hint.text} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
              {hint.text}
            </motion.span>
          </AnimatePresence>
        </div>
      )}

      <motion.div
        ref={sceneRef}
        initial={{ scale: 1.04, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.2, 0.8, 0.3, 1] }}
        onPointerMove={onScenePointer}
        onPointerDown={onScenePointer}
        className={cn("relative overflow-hidden rounded-[26px] border-[3px] border-[#3a1d12] bg-[#2a1a12] shadow-[0_8px_0_#3a1d12]")}
      >
        {/* Dining room */}
        <div className="kr-wall relative px-2 pt-3 sm:px-4">
          <Backdrop recipes={level.recipes} />
          <div className="relative grid gap-2 sm:gap-4" style={{ gridTemplateColumns: `repeat(${level.seats}, minmax(0, 1fr))` }}>
            {seatGuests.map(({ waiting: c, leaving }, seat) => {
              const left = c ? Math.max(0, (c.arrivedAt! + c.patienceMs - t) / c.patienceMs) : 0;
              const servable = hand?.kind === "plate" && !!c;
              return (
                <div
                  key={seat}
                  {...targetProps(`seat:${seat}`)}
                  role="button"
                  aria-label={c ? `${customerName(c.id)} at seat ${seat + 1} wants ${RECIPES[c.recipe].name}` : `Empty seat ${seat + 1}`}
                  data-testid={`seat-${seat}`}
                  className={cn("relative h-52 cursor-pointer rounded-2xl outline-offset-2 sm:h-64", servable && "bg-[#2fbf6f]/15", glow(`seat:${seat}`))}
                >
                  {leaving.map((x) => (
                    <div key={`l${x.id}`} className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-[66%]", x.status === "served" ? "kr-leave-happy" : x.status === "wrong" ? "kr-leave-sad" : "kr-leave-angry")}>
                      <Guest type={x.type} seed={(x.id + seed) >>> 0} mood={moodFor(x, t, null)} />
                    </div>
                  ))}
                  {c && (
                    <div key={c.id} className="kr-arrive absolute inset-0 flex flex-col items-center">
                      {/* Order ticket */}
                      <div className="relative z-10 flex w-full max-w-[150px] items-center gap-1 rounded-[14px] border-2 border-[#3a1d12] bg-[#fffaf0] p-1 shadow-[0_3px_0_#3a1d12] sm:p-1.5">
                        <div className="min-w-0 flex-1">
                          <PlatedDish parts={[...RECIPES[c.recipe].parts]} className="mx-auto h-9 w-full sm:h-12" />
                          <p className="truncate text-center text-[10px] leading-tight font-bold text-[#3a1d12] sm:text-[11px]">{RECIPES[c.recipe].name}</p>
                        </div>
                        <PatienceRing left={left} />
                        <span className="absolute -bottom-[9px] left-1/2 size-3.5 -translate-x-1/2 rotate-45 border-r-2 border-b-2 border-[#3a1d12] bg-[#fffaf0]" />
                      </div>
                      {TYPE_TAG[c.type] && <span className={cn("relative z-10 mt-2.5 rounded-full px-2 text-[10px] font-bold text-white", TYPE_TAG[c.type]!.cls)}>{TYPE_TAG[c.type]!.label}</span>}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[66%]">
                        <Guest type={c.type} seed={(c.id + seed) >>> 0} mood={moodFor(c, t, holdingParts)} />
                      </div>
                    </div>
                  )}
                  <Popups list={popups} anchor={`seat:${seat}`} />
                </div>
              );
            })}
          </div>
        </div>

        {/* The pass: wooden counter with plates, the bell and the bin */}
        <div className="kr-wood relative z-10 border-y-[3px] border-[#3a1d12] px-2 py-2 sm:px-4">
          <div className="flex flex-wrap items-end gap-2 sm:gap-3">
            {s.plates.map((parts, i) => {
              const selected = hand?.kind === "plate" && hand.plate === i;
              return (
                <div
                  key={i}
                  {...targetProps(`plate:${i}`)}
                  role="button"
                  aria-label={`Plate ${i + 1}: ${parts.length ? parts.map((p) => ITEMS[p].name).join(", ") : "empty"}`}
                  aria-pressed={selected}
                  data-testid={`plate-${i}`}
                  className={cn("kr-press relative h-20 w-[6.5rem] cursor-pointer rounded-2xl transition-transform sm:h-24 sm:w-32", selected && "kr-lifted", glow(`plate:${i}`))}
                >
                  <PlatedDish parts={[...parts]} className="h-full w-full" />
                </div>
              );
            })}
            <div className="ml-auto flex items-end gap-2">
              <div ref={ref("hand")} className="flex h-14 min-w-28 items-center gap-1.5 rounded-xl border-2 border-[#3a1d12] bg-[#fffaf0] px-2 text-[#3a1d12]" aria-live="polite" data-testid="kr-hand">
                <span className="text-[10px] font-black tracking-wider text-[#a0705a] uppercase">Hands</span>
                {hand?.kind === "item" ? (
                  <>
                    <FoodSprite item={hand.item} size={34} cook={1} />
                    <span className="max-w-24 text-xs leading-tight font-bold">{ITEMS[hand.item].name}</span>
                  </>
                ) : hand?.kind === "plate" ? (
                  <span className="text-xs leading-tight font-bold">Plate {hand.plate + 1} → a guest</span>
                ) : (
                  <span className="text-xs text-[#a0705a]">empty</span>
                )}
              </div>
              <button type="button" {...targetProps("trash")} className={cn("kr-press flex h-16 w-14 flex-col items-center justify-end rounded-b-xl rounded-t-md border-2 border-[#3a1d12] bg-[#5e6372] pb-1 text-white shadow-[inset_0_6px_0_#7a8090]", glow("trash"))} aria-label="Bin" data-testid="trash">
                <Trash2 className="size-6" />
                <span className="text-[10px] font-bold">Bin</span>
              </button>
            </div>
          </div>
        </div>

        {/* The line: stations on a stainless counter in front of tiles */}
        <div className="kr-tile px-2 pt-3 pb-2 sm:px-4">
          <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${stationCols}, minmax(0, 1fr))` }}>
            {s.stations.map((st) => {
              const key = `st:${st.type}:${st.index}`;
              const form = stationForm(st, t);
              return (
                <StationTile
                  key={key}
                  tp={targetProps(key)}
                  type={st.type}
                  index={st.index}
                  item={form.item}
                  state={form.state as StationState}
                  // Quantised so a tile only redraws when its food visibly changes.
                  progress={Math.round(form.progress * 50) / 50}
                  accepts={hand?.kind === "item" && !st.item && (STATION_ACCEPTS[st.type] as readonly string[]).includes(hand.item)}
                  glowing={hint?.target === key}
                  popups={popups.filter((p) => p.anchor === key)}
                />
              );
            })}
          </div>
          <div className="mt-2 h-3 rounded-full border-2 border-[#3a1d12] bg-[#b9c0cc] shadow-[inset_0_-3px_0_#8d95a3]" />
        </div>

        {/* Pantry shelf */}
        <div className="kr-wood flex flex-wrap justify-center gap-2 border-t-[3px] border-[#3a1d12] p-2 sm:gap-3 sm:p-3">
          {s.crates.map((item) => (
            <Crate key={item} item={item} tp={targetProps(`crate:${item}`)} glowing={hint?.target === `crate:${item}`} />
          ))}
        </div>

        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-20" aria-hidden />

        {/* The held item follows the mouse */}
        {fine && hand && (
          <div ref={followRef} className="pointer-events-none absolute top-0 left-0 z-30 will-change-transform" style={{ transform: pointer.current ? `translate(${pointer.current.x + 10}px, ${pointer.current.y - 46}px)` : "translate(-200px,-200px)" }} aria-hidden>
            <div className="drop-shadow-[0_8px_6px_rgb(0_0_0/0.35)]">{hand.kind === "item" ? <FoodSprite item={hand.item} size={52} cook={1} /> : <PlatedDish parts={holdingParts!} className="h-16 w-20" />}</div>
          </div>
        )}

        {flights.map((f) => (
          <motion.div
            key={f.id}
            className="pointer-events-none absolute top-0 left-0 z-30"
            initial={{ x: f.from.x - 26, y: f.from.y - 26, scale: 1 }}
            animate={{ x: [f.from.x - 26, (f.from.x + f.to.x) / 2 - 26, f.to.x - 26], y: [f.from.y - 26, Math.min(f.from.y, f.to.y) - 70, f.to.y - 26], scale: [1, 1.15, 0.8], opacity: [1, 1, 0] }}
            transition={{ duration: 0.4, ease: "easeInOut", times: [0, 0.5, 1] }}
          >
            {f.item ? <FoodSprite item={f.item} size={52} cook={1} /> : <Dish parts={f.parts ?? []} animate={false} className="h-14 w-16" />}
          </motion.div>
        ))}

        <AnimatePresence>
          {banner && (
            <motion.div
              key={banner.id}
              className="pointer-events-none absolute inset-x-0 top-[34%] z-30 flex justify-center"
              initial={{ scale: 0.4, opacity: 0, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, rotate: -3 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ type: "spring", stiffness: 380, damping: 16 }}
              onAnimationComplete={() => setTimeout(() => setBanner((b) => (b?.id === banner.id ? null : b)), 900)}
            >
              <span className="rounded-2xl border-[3px] border-[#3a1d12] bg-[#ffcf3f] px-5 py-2 font-display text-2xl font-black text-[#3a1d12] shadow-[0_5px_0_#3a1d12] sm:text-3xl">{banner.text}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <LevelIntro number={level.number} name={level.name} />

        {paused && !complete && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#1b100b]/70 backdrop-blur-sm">
            <p className="font-display text-5xl font-black text-[#fffaf0]">Paused</p>
            <Button size="lg" onClick={() => setPausedState(false)}>
              <Play className="size-5" /> Back to the kitchen
            </Button>
          </div>
        )}

        {complete && <ShiftComplete stars={complete.stars} score={complete.score} served={s.served} tips={s.tips} missed={s.missed + s.wrong} name={level.name} />}
      </motion.div>
      <p className="mt-3 text-center text-xs text-ink-muted">Tap an ingredient, then where it goes, or drag it there. Pick up a finished plate and tap a guest to serve.</p>
    </div>
  );
}

const STATION_ACCEPTS = {
  board: ["lettuce", "tomato", "cucumber", "onion", "potato"],
  grill: ["patty-raw", "egg"],
  fryer: ["potato-chopped", "fish"],
  pot: ["rice", "noodles"],
} as const;

interface TargetProps {
  tabIndex: number;
  "data-target": string;
  ref: (el: HTMLElement | null) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

const samePopups = (a: Popup[], b: Popup[]) => a.length === b.length && a.every((p, i) => p.id === b[i]!.id);

const StationTile = memo(
  function StationTile({ tp, type, index, item, state, progress, accepts, glowing, popups }: { tp: TargetProps; type: StationType; index: number; item: ItemId | null; state: StationState; progress: number; accepts: boolean; glowing: boolean; popups: Popup[] }) {
    const flipped = type === "grill" && (state !== "working" || progress >= 0.5);
    return (
      <div
        {...tp}
        role="button"
        aria-label={`${STATION_NAMES[type]} ${index + 1}${item ? `: ${ITEMS[item].name}, ${state}` : ", empty"}`}
        data-testid={`station-${type}-${index}`}
        data-state={state}
        className={cn("kr-press relative aspect-[12/11] max-h-40 cursor-pointer rounded-2xl", accepts && "bg-[#2fbf6f]/20", glowing && "kr-glow")}
      >
        <StationArt type={type} item={item} state={state} progress={progress} flipped={flipped} />
        {state === "done" && <span className="kr-ready absolute top-0 right-1 grid size-6 place-items-center rounded-full border-2 border-[#3a1d12] bg-[#2fbf6f] text-xs font-black text-white">✓</span>}
        {state === "burning" && <span className="kr-ready absolute top-0 right-1 grid size-6 place-items-center rounded-full border-2 border-[#3a1d12] bg-[#e8343f] text-xs font-black text-white">!</span>}
        <Popups list={popups} anchor={`st:${type}:${index}`} />
      </div>
    );
  },
  (a, b) => a.tp === b.tp && a.item === b.item && a.state === b.state && a.progress === b.progress && a.accepts === b.accepts && a.glowing === b.glowing && samePopups(a.popups, b.popups),
);

const Crate = memo(function Crate({ item, tp, glowing }: { item: ItemId; tp: TargetProps; glowing: boolean }) {
  return (
    <button
      type="button"
      {...tp}
      className={cn("kr-press relative flex w-[4.5rem] flex-col items-center rounded-lg border-2 border-[#3a1d12] bg-[#d8a86c] px-1 pt-0.5 pb-1 text-[#3a1d12] shadow-[0_3px_0_#3a1d12] sm:w-20", glowing && "kr-glow")}
      aria-label={`Take ${ITEMS[item].name}`}
      data-testid={`crate-${item}`}
    >
      <span className="relative -mb-2 flex h-10 items-end justify-center sm:h-11">
        <FoodSprite item={item} size={30} className="absolute -left-2 bottom-1 -rotate-12" />
        <FoodSprite item={item} size={30} className="absolute -right-2 bottom-1 rotate-12" />
        <FoodSprite item={item} size={38} className="relative" />
      </span>
      <span className="relative z-10 w-full rounded-sm border-2 border-[#3a1d12] bg-[#b97d44] py-0.5 text-[9px] leading-tight font-black text-[#fff2dc] uppercase sm:text-[10px]">{ITEMS[item].name}</span>
    </button>
  );
});

function HudButton({ label, onClick, children, testId }: { label: string; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} data-testid={testId} className="kr-press grid size-8 place-items-center rounded-full sm:size-9 border-2 border-[#3a1d12] bg-[#fffaf0] text-[#3a1d12] shadow-[0_2px_0_#3a1d12]">
      {children}
    </button>
  );
}

function Popups({ list, anchor }: { list: Popup[]; anchor: string }) {
  const mine = list.filter((p) => p.anchor === anchor);
  return (
    <AnimatePresence>
      {mine.map((p, i) => (
        <motion.span
          key={p.id}
          initial={{ y: 12, opacity: 0, scale: 0.6 }}
          animate={{ y: -28 - i * 26, opacity: 1, scale: 1 }}
          exit={{ opacity: 0, y: -60 - i * 26 }}
          transition={{ type: "spring", stiffness: 420, damping: 18 }}
          className={cn(
            "pointer-events-none absolute top-1/3 left-1/2 z-30 -translate-x-1/2 rounded-full border-2 border-[#3a1d12] px-3 py-0.5 font-display text-base font-black whitespace-nowrap shadow-[0_3px_0_#3a1d12] sm:text-lg",
            p.tone === "good" && "bg-[#2fbf6f] text-white",
            p.tone === "tip" && "bg-[#ffcf3f] text-[#3a1d12]",
            p.tone === "bad" && "bg-[#e8343f] text-white",
            p.tone === "info" && "bg-white text-[#3a1d12]",
          )}
        >
          {p.text}
        </motion.span>
      ))}
    </AnimatePresence>
  );
}

/** Wall decor behind the guests: a sunset window, a lamp and tonight's menu. */
function DinerBackdrop({ recipes }: { recipes: RecipeId[] }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMax slice" viewBox="0 0 800 260">
        <rect x="0" y="196" width="800" height="64" fill="#2e8c8a" />
        <rect x="0" y="192" width="800" height="8" fill="#3a1d12" />
        <path d="M0 214 h800 M0 236 h800" stroke="#277a78" strokeWidth="3" />
        <g transform="translate(70 40)">
          <rect width="170" height="118" rx="12" fill="#3a1d12" />
          <rect x="7" y="7" width="156" height="104" rx="7" fill="#ffb36b" />
          <circle cx="92" cy="72" r="24" fill="#ffe08a" />
          <rect x="7" y="74" width="156" height="37" fill="#6a4c93" opacity="0.55" />
          <path d="M20 84 h30 v-10 h16 v10 h24 v-18 h14 v18 h40" stroke="#3d2c5c" strokeWidth="6" fill="none" opacity="0.6" />
          <path d="M85 7 v104 M7 58 h156" stroke="#3a1d12" strokeWidth="7" />
        </g>
        <g transform="translate(400 0)">
          <path d="M0 0 v30" stroke="#3a1d12" strokeWidth="3" />
          <path d="M-26 58 q26 -34 52 0z" fill="#e0533c" stroke="#3a1d12" strokeWidth="3" />
          <ellipse cx="0" cy="60" rx="12" ry="5" fill="#fff2c6" />
          <path d="M-60 140 L-14 62 h28 L60 140z" fill="#fff2c6" opacity="0.16" />
        </g>
      </svg>
      <div className="absolute top-4 right-[5%] hidden w-56 rotate-1 rounded-lg border-[5px] border-[#5a3a24] bg-[#2b3a33] px-3 py-2 text-[#eef3ea] shadow-[0_4px_0_rgb(0_0_0/0.25)] md:block">
        <p className="text-center font-display text-sm font-black tracking-[0.25em] text-[#ffcf3f]">TONIGHT</p>
        <ul className="mt-1 space-y-0.5 text-[11px] font-semibold">
          {recipes.map((r) => (
            <li key={r} className="flex items-baseline gap-1">
              <span className="truncate">{RECIPES[r].name}</span>
              <span className="flex-1 border-b border-dotted border-[#eef3ea]/30" />
              <span className="font-mono text-[#ffcf3f]">${RECIPES[r].value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const Backdrop = memo(DinerBackdrop);

function LevelIntro({ number, name }: { number: number; name: string }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setShow(false), 1700);
    return () => clearTimeout(id);
  }, []);
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
          <motion.div initial={{ scale: 0.6, rotate: -10, y: 40 }} animate={{ scale: 1, rotate: -3, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 15 }} className="rounded-[20px] border-[3px] border-[#3a1d12] bg-[#fffaf0] px-8 py-4 text-center text-[#3a1d12] shadow-[0_8px_0_#3a1d12]">
            <p className="text-xs font-black tracking-[0.3em] text-[#c0533c] uppercase">Shift {number}</p>
            <p className="font-display text-3xl font-black sm:text-4xl">{name}</p>
            <p className="mt-1 text-sm font-bold text-[#a0705a]">Doors open!</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ShiftComplete({ stars, score, served, tips, missed, name }: { stars: number; score: number; served: number; tips: number; missed: number; name: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 1100);
      setShown(Math.round(score * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score]);
  return (
    <motion.div className="absolute inset-0 z-40 flex items-center justify-center bg-[#1b100b]/65 p-4 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid="kr-complete">
      <motion.div initial={{ y: 60, scale: 0.8 }} animate={{ y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="w-full max-w-sm rounded-[24px] border-[3px] border-[#3a1d12] bg-[#fffaf0] p-5 text-center text-[#3a1d12] shadow-[0_8px_0_#3a1d12]">
        <p className="text-xs font-black tracking-[0.3em] text-[#c0533c] uppercase">{stars ? "Shift complete" : "Shift over"}</p>
        <p className="font-display text-3xl font-black">{name}</p>
        <div className="my-3 flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <motion.span key={i} initial={{ scale: 0, rotate: -90 }} animate={{ scale: i < stars ? 1 : 0.8, rotate: 0 }} transition={{ delay: 0.65 + i * 0.38, type: "spring", stiffness: 400, damping: 12 }}>
              <Star className={cn("size-12", i < stars ? "fill-[#ffb81f] text-[#3a1d12]" : "fill-[#eadfcd] text-[#cbb89c]")} strokeWidth={1.6} />
            </motion.span>
          ))}
        </div>
        <p className="font-mono text-4xl font-black tabular-nums">${shown}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-bold">
          <span className="rounded-xl bg-[#2fbf6f]/15 py-1.5">{served} served</span>
          <span className="rounded-xl bg-[#ffcf3f]/30 py-1.5">${tips} tips</span>
          <span className="rounded-xl bg-[#e8343f]/12 py-1.5">{missed} lost</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
