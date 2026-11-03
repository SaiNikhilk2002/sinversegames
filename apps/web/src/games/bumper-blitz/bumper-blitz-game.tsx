"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Shield, Weight, Zap } from "lucide-react";
import type { BBEvent, BBPodView, BBView } from "@platform/engines/bumper-blitz";
import { Avatar, cn } from "@/components/ui/primitives";
import { realtime } from "@/lib/realtime/connection";
import { useRoomEvent } from "@/lib/realtime/use-room";
import { useSettings } from "@/lib/settings";
import { createMotor, sfx } from "@/lib/sound";
import type { GameClientProps } from "../types";
import { ArenaRenderer } from "./arena-renderer";

/** Render this far behind the newest snapshot so there are always two to interpolate between. */
const INTERP_DELAY_MS = 100;
const SEND_INTERVAL_MS = 66;

interface Snapshot {
  t: number;
  pods: Map<string, BBPodView>;
}

const POWERUP_STYLE = { turbo: { color: "#ffcf3d", label: "Turbo" }, heavy: { color: "#9b8cff", label: "Heavy" }, shield: { color: "#2fd6c2", label: "Shield" } } as const;

function usePodInput(send: GameClientProps["send"], enabled: boolean) {
  const keys = useRef(new Set<string>());
  const stick = useRef<{ x: number; y: number } | null>(null);
  const last = useRef({ x: 0, y: 0, at: 0 });
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(
    (boost = false) => {
      if (!enabled) return;
      let x = 0;
      let y = 0;
      if (stick.current) ({ x, y } = stick.current);
      else {
        const k = keys.current;
        x = (k.has("right") ? 1 : 0) - (k.has("left") ? 1 : 0);
        y = (k.has("down") ? 1 : 0) - (k.has("up") ? 1 : 0);
        const len = Math.hypot(x, y);
        if (len > 1) {
          x /= len;
          y /= len;
        }
      }
      x = Math.round(x * 100) / 100;
      y = Math.round(y * 100) / 100;
      const now = performance.now();
      if (!boost && x === last.current.x && y === last.current.y) return;
      // Throttle to ~15 messages a second, always delivering the latest input.
      const wait = SEND_INTERVAL_MS - (now - last.current.at);
      if (!boost && wait > 0) {
        if (!pending.current) pending.current = setTimeout(() => ((pending.current = null), flush()), wait);
        return;
      }
      last.current = { x, y, at: now };
      void send("arena:input", { x, y, boost });
    },
    [send, enabled],
  );

  useEffect(() => {
    const map: Record<string, string> = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) flush(true);
        return;
      }
      const dir = map[e.code];
      if (!dir) return;
      e.preventDefault();
      keys.current.add(dir);
      flush();
    };
    const up = (e: KeyboardEvent) => {
      const dir = map[e.code];
      if (!dir) return;
      keys.current.delete(dir);
      flush();
    };
    const blur = () => {
      keys.current.clear();
      flush();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [flush]);

  return {
    setStick: (v: { x: number; y: number } | null) => {
      stick.current = v;
      flush();
    },
    boost: () => flush(true),
  };
}

function Joystick({ onChange }: { onChange: (v: { x: number; y: number } | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const move = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const r = rect.width / 2;
    let x = (e.clientX - rect.left - r) / r;
    let y = (e.clientY - rect.top - r) / r;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    setKnob({ x, y });
    onChange(len < 0.15 ? { x: 0, y: 0 } : { x, y });
  };
  const end = () => {
    setKnob({ x: 0, y: 0 });
    onChange(null);
  };
  return (
    <div
      ref={ref}
      className="relative size-32 touch-none rounded-full border-2 border-[#7a6cff]/60 bg-[#0b0620]/50 shadow-[0_0_20px_-4px_#7a6cff] backdrop-blur"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => e.buttons && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="Steering stick"
      role="slider"
      aria-valuetext="Drag to steer"
    >
      <div className="absolute size-12 rounded-full border-2 border-white bg-[#ff4f8b] shadow-[0_0_14px_#ff4f8b]" style={{ left: `calc(50% - 24px + ${knob.x * 40}px)`, top: `calc(50% - 24px + ${knob.y * 40}px)` }} />
    </div>
  );
}

type FeedTone = "ko" | "info" | "self";

const POD_PALETTE = ["#ff5d73", "#3d8bff", "#ffcf3d", "#2fc28a", "#c04dff", "#ff8f3d"];

/**
 * Pods use each player's profile colour, but two players can pick the same
 * one. Later seats that clash get the next free palette colour; the pod list
 * is in the same order for everyone, so every screen agrees.
 */
function distinctColors(pods: BBPodView[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const p of pods) {
    let c = p.color.toLowerCase();
    if (used.has(c)) c = POD_PALETTE.find((x) => !used.has(x)) ?? c;
    used.add(c);
    out.set(p.id, c);
  }
  return out;
}

export function BumperBlitzGame({ code, game, selfId, send }: GameClientProps<BBView>) {
  const view = game.view;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const snaps = useRef<Snapshot[]>([]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const rendererRef = useRef<ArenaRenderer | null>(null);
  const posRef = useRef<(id: string) => BBPodView | undefined>(() => undefined);
  const [feed, setFeed] = useState<{ id: number; text: string; tone: FeedTone }[]>([]);
  const [now, setNow] = useState(() => realtime.serverNow());
  const [koBy, setKoBy] = useState<{ by: string | null; at: number } | null>(null);
  const me = view.pods.find((p) => p.id === selfId);
  const input = usePodInput(send, view.status !== "finished" && !!me && !me.left);
  const reduced = useSettings().reducedMotion;

  // Keep a short history of snapshots for interpolation.
  useEffect(() => {
    const list = snaps.current;
    if (list.length && list[list.length - 1]!.t >= view.serverTime) return;
    list.push({ t: view.serverTime, pods: new Map(view.pods.map((p) => [p.id, p])) });
    if (list.length > 20) list.shift();
  }, [view]);

  const nameOf = useCallback((id: string | null) => (id === selfId ? "You" : (viewRef.current.pods.find((p) => p.id === id)?.name ?? "Someone")), [selfId]);
  const pushFeed = useCallback((text: string, tone: FeedTone) => {
    const id = Math.random();
    setFeed((f) => [{ id, text, tone }, ...f].slice(0, 4));
    setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 4500);
  }, []);

  useRoomEvent<{ events: BBEvent[] }>(code, "game:action", ({ events }) => {
    const r = rendererRef.current;
    for (const e of events) {
      r?.onEvent(e, posRef.current, realtime.serverNow());
      if (e.kind === "bump") {
        if (e.a === selfId || e.b === selfId) sfx.impact(e.strength / 700);
        else if (e.strength > 450) sfx.impact(0.2);
      }
      if (e.kind === "powerup") {
        if (e.playerId === selfId) sfx.powerup();
        pushFeed(`${nameOf(e.playerId)} grabbed ${POWERUP_STYLE[e.powerup].label}`, e.playerId === selfId ? "self" : "info");
      }
      if (e.kind === "ko") {
        if (e.playerId === selfId) setKoBy({ by: e.by, at: realtime.serverNow() });
        else if (e.by === selfId) {
          sfx.cheer();
          sfx.correct();
        }
        pushFeed(e.by ? `${nameOf(e.by)} knocked out ${nameOf(e.playerId)}` : `${nameOf(e.playerId)} fell off`, e.by === selfId ? "self" : "ko");
      }
    }
  });

  // Countdown beeps and the start horn.
  const countdown = view.status === "countdown" ? Math.max(1, Math.ceil((view.playAt - now) / 1000)) : null;
  const lastCount = useRef<number | null>(null);
  useEffect(() => {
    if (countdown !== null && countdown !== lastCount.current) sfx.beep();
    if (countdown === null && lastCount.current !== null && view.status === "playing") sfx.go();
    lastCount.current = countdown;
  }, [countdown, view.status]);

  // Render loop.
  useEffect(() => {
    rendererRef.current = new ArenaRenderer(selfId, reduced);
    const motor = createMotor();
    let frame = 0;
    let lastHud = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      const r = rendererRef.current;
      if (!canvas || !wrap || !r) return;
      const size = Math.min(wrap.clientWidth, 720);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const px = Math.round(size * dpr);
      if (canvas.width !== px) {
        canvas.width = px;
        canvas.height = px;
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const v = viewRef.current;
      const serverNow = realtime.serverNow();
      if (serverNow - lastHud > 200) {
        lastHud = serverNow;
        setNow(serverNow);
      }

      // Interpolate pod positions between the two snapshots around the render time.
      const renderT = serverNow - INTERP_DELAY_MS;
      const list = snaps.current;
      let a = list[0];
      let b = list[list.length - 1];
      for (let i = list.length - 1; i > 0; i--) {
        if (list[i - 1]!.t <= renderT) {
          a = list[i - 1];
          b = list[i];
          break;
        }
      }
      const f = a && b && b.t > a.t ? Math.max(0, Math.min(1, (renderT - a.t) / (b.t - a.t))) : 1;
      const posOf = (id: string) => {
        const pa = a?.pods.get(id);
        const pb = b?.pods.get(id);
        if (!pa || !pb || pa.out !== pb.out) return pb ?? pa;
        return { ...pb, x: pa.x + (pb.x - pa.x) * f, y: pa.y + (pb.y - pa.y) * f, vx: pa.vx + (pb.vx - pa.vx) * f, vy: pa.vy + (pb.vy - pa.vy) * f };
      };
      posRef.current = posOf;
      const colors = distinctColors(v.pods);
      const pods = v.pods
        .filter((p) => !p.left)
        .map((p) => {
          const q = posOf(p.id);
          return q && { ...q, color: colors.get(p.id) ?? q.color };
        });
      const out = r.frame(ctx, px, v, pods, serverNow);
      if (out.boosted.includes(selfId)) sfx.whoosh();
      if (out.fell.some((x) => x.id === selfId)) sfx.fall();
      const mine = pods.find((p) => p?.id === selfId);
      motor.set(v.status === "playing" && mine && !mine.out ? 1 : 0, mine ? Math.hypot(mine.vx, mine.vy) / 430 : 0);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      motor.stop();
    };
  }, [selfId, reduced]);

  const timeLeft = Math.max(0, Math.ceil((view.endsAt - now) / 1000));
  const boostReadyIn = me ? Math.max(0, me.boostReadyAt - now) : 0;
  const boostReady = !!me && boostReadyIn === 0;
  const podColors = distinctColors(view.pods);
  const board = [...view.pods].filter((p) => !p.left).sort((a, b) => b.knockouts - a.knockouts || a.falls - b.falls);
  const respawnLeft = koBy ? Math.max(0, 2000 - (now - koBy.at)) : 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_270px]" data-testid="bumper-blitz">
      <div ref={wrapRef} className="relative mx-auto w-full max-w-[720px] select-none">
        <canvas ref={canvasRef} className="block w-full rounded-[28px] border-2 border-[#ff4f8b]/40 shadow-[0_0_40px_-8px_rgb(255_79_139/0.55)]" aria-label="Bumper Blitz arena" role="img" data-testid="arena-canvas" />
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <span
            className={cn(
              "rounded-xl border-2 bg-[#0b0620]/80 px-4 py-1 font-mono text-2xl font-black tracking-wider tabular-nums",
              timeLeft <= 10 && view.status === "playing" ? "animate-pulse border-[#ff4f8b] text-[#ff4f8b]" : "border-[#7a6cff] text-[#e9e4ff]",
            )}
            style={{ textShadow: "0 0 12px currentColor" }}
            data-testid="arena-timer"
          >
            {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
          </span>
        </div>
        {/* Each number pops in; no exit animation, so the count never lingers past "GO". */}
        {countdown !== null && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <motion.div key={countdown} initial={{ scale: 2.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}>
              <span className="font-display text-9xl font-black text-white" style={{ textShadow: "0 0 30px #ff4f8b, 0 6px 0 rgb(0 0 0 / 0.5)" }} data-testid="arena-countdown">
                {countdown}
              </span>
            </motion.div>
          </div>
        )}
        {me?.out && view.status === "playing" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <motion.div initial={{ scale: 0.5, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: -3, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 14 }} className="flex items-center gap-3 rounded-2xl border-2 border-[#ff4f8b] bg-[#0b0620]/85 px-5 py-3 text-white shadow-[0_0_30px_rgb(255_79_139/0.5)]">
              <svg viewBox="0 0 36 36" className="size-10 -rotate-90" aria-hidden>
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgb(255 255 255 / 0.15)" strokeWidth="4" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="#ff4f8b" strokeWidth="4" strokeDasharray={94.2} strokeDashoffset={94.2 * (respawnLeft / 2000)} strokeLinecap="round" />
              </svg>
              <div>
                <p className="font-display text-2xl leading-none font-black">KNOCKED OUT</p>
                <p className="text-sm text-[#e9e4ff]/80">{koBy?.by ? `by ${nameOf(koBy.by)} · ` : ""}respawning…</p>
              </div>
            </motion.div>
          </div>
        )}
        <div className="pointer-events-none absolute top-14 right-3 space-y-1 text-right" aria-live="polite">
          <AnimatePresence>
            {feed.map((f) => (
              <motion.p
                key={f.id}
                layout
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn("ml-auto w-fit rounded-lg px-2.5 py-1 text-xs font-bold text-white backdrop-blur", f.tone === "self" ? "bg-[#ff4f8b]/85" : f.tone === "ko" ? "bg-[#0b0620]/80 ring-1 ring-[#ff4f8b]/60" : "bg-[#0b0620]/70")}
              >
                {f.text}
              </motion.p>
            ))}
          </AnimatePresence>
        </div>
        {/* Touch controls (shown on coarse pointers) */}
        <div className="pointer-coarse:flex mt-3 hidden items-center justify-between px-2 select-none">
          <Joystick onChange={input.setStick} />
          <button
            type="button"
            onPointerDown={input.boost}
            className={cn("relative grid size-24 place-items-center rounded-full border-4 font-display text-lg font-black text-white transition active:scale-90", boostReady ? "border-white bg-[#ff4f8b] shadow-[0_0_24px_#ff4f8b]" : "border-white/30 bg-white/10")}
            aria-label="Boost"
          >
            BOOST
          </button>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-[22px] border-2 border-[#7a6cff]/40 bg-[#0d0822] p-4 text-[#e9e4ff] shadow-[0_0_30px_-12px_#7a6cff]">
          <p className="mb-3 font-display text-lg font-black tracking-wide">KNOCKOUTS</p>
          <ol className="space-y-2" data-testid="arena-scores">
            {board.map((p, i) => (
              <motion.li layout key={p.id} className={cn("flex items-center gap-3 rounded-xl px-2 py-1.5", p.id === selfId && "bg-[#ff4f8b]/15 ring-1 ring-[#ff4f8b]/50")}>
                <span className="w-4 font-mono text-sm font-bold text-[#a49ccc]">{i + 1}</span>
                <Avatar name={p.name} color={podColors.get(p.id) ?? p.color} size={26} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.id === selfId ? "You" : p.name}</span>
                <span className="font-mono text-base font-black tabular-nums">{p.knockouts}</span>
                <span className="font-mono text-xs text-[#a49ccc] tabular-nums" title="Falls">
                  ↓{p.falls}
                </span>
              </motion.li>
            ))}
          </ol>
        </div>
        <div className="rounded-[22px] border border-[#7a6cff]/25 bg-[#0d0822] p-4 text-sm text-[#e9e4ff]">
          {me && (
            <div className="mb-3">
              <div className="mb-1 flex justify-between text-xs font-bold">
                <span>BOOST</span>
                <span className={boostReady ? "text-[#2fd6c2]" : "text-[#a49ccc]"}>{boostReady ? "READY" : `${(boostReadyIn / 1000).toFixed(1)}s`}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className={cn("h-full rounded-full transition-[width] duration-200", boostReady ? "bg-[#2fd6c2] shadow-[0_0_10px_#2fd6c2]" : "bg-[#ff4f8b]")} style={{ width: `${Math.max(0, 1 - boostReadyIn / 2500) * 100}%` }} />
              </div>
            </div>
          )}
          <p className="text-[#a49ccc]">WASD or arrow keys to steer, Space to boost. On a phone, use the stick and the boost button.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#ffcf3d]/15 px-2 py-1 text-[#ffcf3d]">
              <Zap className="size-3.5" /> Turbo
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#a393ff]/15 px-2 py-1 text-[#a393ff]">
              <Weight className="size-3.5" /> Heavy
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#2fd6c2]/15 px-2 py-1 text-[#2fd6c2]">
              <Shield className="size-3.5" /> Shield
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}
