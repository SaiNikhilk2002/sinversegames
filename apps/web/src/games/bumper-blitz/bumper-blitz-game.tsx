"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Shield, Weight, Zap } from "lucide-react";
import { POD_RADIUS, type BBEvent, type BBPodView, type BBView } from "@platform/engines/bumper-blitz";
import { Avatar, cn } from "@/components/ui/primitives";
import { realtime } from "@/lib/realtime/connection";
import { useRoomEvent } from "@/lib/realtime/use-room";
import { sfx } from "@/lib/sound";
import type { GameClientProps } from "../types";

/** Render this far behind the newest snapshot so there are always two to interpolate between. */
const INTERP_DELAY_MS = 100;
const SEND_INTERVAL_MS = 66;
const WORLD = 560;

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
      className="relative size-32 touch-none rounded-full border-2 border-white/30 bg-white/10 backdrop-blur"
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
      <div className="absolute size-12 rounded-full bg-white/80 shadow-lg" style={{ left: `calc(50% - 24px + ${knob.x * 40}px)`, top: `calc(50% - 24px + ${knob.y * 40}px)` }} />
    </div>
  );
}

export function BumperBlitzGame({ code, game, selfId, send }: GameClientProps<BBView>) {
  const view = game.view;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const snaps = useRef<Snapshot[]>([]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [feed, setFeed] = useState<{ id: number; text: string }[]>([]);
  const [now, setNow] = useState(() => realtime.serverNow());
  const me = view.pods.find((p) => p.id === selfId);
  const input = usePodInput(send, view.status !== "finished" && !!me && !me.left);

  // Keep a short history of snapshots for interpolation.
  useEffect(() => {
    const list = snaps.current;
    if (list.length && list[list.length - 1]!.t >= view.serverTime) return;
    list.push({ t: view.serverTime, pods: new Map(view.pods.map((p) => [p.id, p])) });
    if (list.length > 20) list.shift();
  }, [view]);

  useRoomEvent<{ events: BBEvent[] }>(code, "game:action", ({ events }) => {
    const name = (id: string | null) => (id === selfId ? "You" : (viewRef.current.pods.find((p) => p.id === id)?.name ?? "Someone"));
    for (const e of events) {
      if (e.kind === "bump" && (e.a === selfId || e.b === selfId)) sfx.bump();
      if (e.kind === "powerup") {
        if (e.playerId === selfId) sfx.pop();
        setFeed((f) => [{ id: Math.random(), text: `${name(e.playerId)} grabbed ${POWERUP_STYLE[e.powerup].label}` }, ...f].slice(0, 4));
      }
      if (e.kind === "ko") {
        if (e.playerId === selfId) sfx.error();
        else if (e.by === selfId) sfx.correct();
        setFeed((f) => [{ id: Math.random(), text: e.by ? `${name(e.by)} knocked out ${name(e.playerId)}!` : `${name(e.playerId)} fell off` }, ...f].slice(0, 4));
      }
    }
  });

  // Render loop.
  useEffect(() => {
    let frame = 0;
    let lastHud = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const size = Math.min(wrap.clientWidth, 720);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(size * dpr)) {
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
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
        return { ...pb, x: pa.x + (pb.x - pa.x) * f, y: pa.y + (pb.y - pa.y) * f };
      };

      const scale = (size * dpr) / (WORLD * 2);
      ctx.setTransform(scale, 0, 0, scale, (size * dpr) / 2, (size * dpr) / 2);
      ctx.clearRect(-WORLD, -WORLD, WORLD * 2, WORLD * 2);

      // Void and arena.
      const grad = ctx.createRadialGradient(0, 0, 50, 0, 0, WORLD);
      grad.addColorStop(0, "#2a1452");
      grad.addColorStop(1, "#0b0620");
      ctx.fillStyle = grad;
      ctx.fillRect(-WORLD, -WORLD, WORLD * 2, WORLD * 2);
      ctx.beginPath();
      ctx.arc(0, 0, v.arenaRadius, 0, Math.PI * 2);
      const floor = ctx.createRadialGradient(0, 0, 40, 0, 0, v.arenaRadius);
      floor.addColorStop(0, "#5b2bd8");
      floor.addColorStop(1, "#3a1690");
      ctx.fillStyle = floor;
      ctx.fill();
      ctx.lineWidth = 10;
      ctx.strokeStyle = v.arenaRadius < 500 ? "#ff4f8b" : "#f107a3";
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 2;
      for (let r = 100; r < v.arenaRadius; r += 100) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Hazards: dashed while warning, glowing while active.
      for (const h of v.hazards) {
        const active = serverNow >= h.activeAt;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fillStyle = active ? "rgba(255,90,60,0.45)" : "rgba(255,200,60,0.15)";
        ctx.fill();
        ctx.setLineDash(active ? [] : [14, 10]);
        ctx.lineWidth = 5;
        ctx.strokeStyle = active ? "#ff5a3c" : "#ffc83d";
        ctx.stroke();
        ctx.setLineDash([]);
      }

      for (const bm of v.bumpers) {
        ctx.beginPath();
        ctx.arc(bm.x, bm.y, bm.r, 0, Math.PI * 2);
        ctx.fillStyle = "#1b1333";
        ctx.fill();
        ctx.lineWidth = 8;
        ctx.strokeStyle = "#e6e1ff";
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(bm.x, bm.y, bm.r * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = "#ff4f8b";
        ctx.fill();
      }

      for (const u of v.powerups) {
        const pulse = 16 + Math.sin(serverNow / 180) * 2;
        ctx.beginPath();
        ctx.arc(u.x, u.y, pulse, 0, Math.PI * 2);
        ctx.fillStyle = POWERUP_STYLE[u.kind].color;
        ctx.fill();
        ctx.fillStyle = "#17142b";
        ctx.font = "bold 18px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(u.kind === "turbo" ? "⚡" : u.kind === "heavy" ? "W" : "◆", u.x, u.y + 1);
      }

      for (const pod of v.pods) {
        if (pod.left) continue;
        const p = posOf(pod.id);
        if (!p || p.out) continue;
        ctx.globalAlpha = p.ghost ? 0.45 : 1;
        if (p.shield) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, POD_RADIUS + 9, 0, Math.PI * 2);
          ctx.strokeStyle = "#2fd6c2";
          ctx.lineWidth = 5;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, POD_RADIUS * (p.heavy ? 1.12 : 1), 0, Math.PI * 2);
        ctx.fillStyle = pod.color;
        ctx.fill();
        ctx.lineWidth = pod.id === selfId ? 7 : 4;
        ctx.strokeStyle = pod.id === selfId ? "#ffffff" : "rgba(255,255,255,0.6)";
        ctx.stroke();
        // Facing indicator from velocity.
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 20) {
          ctx.beginPath();
          ctx.arc(p.x + (p.vx / sp) * 14, p.y + (p.vy / sp) * 14, 6, 0, Math.PI * 2);
          ctx.fillStyle = "#fff";
          ctx.fill();
        }
        if (p.turbo) {
          ctx.beginPath();
          ctx.arc(p.x - (p.vx / (sp || 1)) * 30, p.y - (p.vy / (sp || 1)) * 30, 9, 0, Math.PI * 2);
          ctx.fillStyle = "#ffcf3d";
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#fff";
        ctx.font = "600 20px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(pod.id === selfId ? "You" : pod.name.slice(0, 12), p.x, p.y - POD_RADIUS - 8);
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [selfId]);

  const countdown = view.status === "countdown" ? Math.max(1, Math.ceil((view.playAt - now) / 1000)) : null;
  const timeLeft = Math.max(0, Math.ceil((view.endsAt - now) / 1000));
  const boostReady = me ? now >= me.boostReadyAt : false;
  const board = [...view.pods].filter((p) => !p.left).sort((a, b) => b.knockouts - a.knockouts || a.falls - b.falls);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]" data-testid="bumper-blitz">
      <div ref={wrapRef} className="relative mx-auto w-full max-w-[720px] select-none">
        <canvas ref={canvasRef} className="block w-full rounded-3xl shadow-card" aria-label="Bumper Blitz arena" role="img" data-testid="arena-canvas" />
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <span className="rounded-full bg-black/55 px-4 py-1.5 font-display text-lg font-bold text-white tabular-nums" data-testid="arena-timer">
            {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
          </span>
        </div>
        {countdown !== null && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="font-display text-8xl font-black text-white drop-shadow-[0_6px_0_rgb(0_0_0/0.4)]" data-testid="arena-countdown">
              {countdown}
            </span>
          </div>
        )}
        {me?.out && view.status === "playing" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-2xl bg-black/60 px-5 py-3 font-display text-2xl font-bold text-white">Knocked out — respawning…</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 space-y-1" aria-live="polite">
          {feed.map((f) => (
            <p key={f.id} className="w-fit rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white">
              {f.text}
            </p>
          ))}
        </div>
        {/* Touch controls (shown on coarse pointers) */}
        <div className="pointer-coarse:flex absolute inset-x-4 bottom-4 hidden items-end justify-between">
          <Joystick onChange={input.setStick} />
          <button
            type="button"
            onPointerDown={input.boost}
            className={cn("size-24 rounded-full font-display text-lg font-black text-white shadow-lg", boostReady ? "bg-hot" : "bg-white/20")}
            aria-label="Boost"
          >
            BOOST
          </button>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-3xl border border-line bg-surface p-4 shadow-card">
          <p className="mb-3 font-display text-lg font-bold">Knockouts</p>
          <ol className="space-y-2" data-testid="arena-scores">
            {board.map((p, i) => (
              <li key={p.id} className={cn("flex items-center gap-3 rounded-xl px-2 py-1.5", p.id === selfId && "bg-brand-500/10")}>
                <span className="w-4 text-sm font-bold text-ink-muted">{i + 1}</span>
                <Avatar name={p.name} color={p.color} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.id === selfId ? "You" : p.name}</span>
                <span className="text-sm font-bold tabular-nums">{p.knockouts}</span>
                <span className="text-xs text-ink-faint tabular-nums" title="Falls">
                  ↓{p.falls}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-3xl border border-line bg-surface p-4 text-sm">
          <p className="font-semibold">Controls</p>
          <p className="mt-1 text-ink-muted">WASD or arrow keys to steer, Space to boost. On a phone, use the stick and the boost button.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1 rounded-full bg-sun/20 px-2 py-1"><Zap className="size-3.5" /> Turbo</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-1"><Weight className="size-3.5" /> Heavy</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-mint/20 px-2 py-1"><Shield className="size-3.5" /> Shield</span>
          </div>
          {me && <p className={cn("mt-3 text-xs font-semibold", boostReady ? "text-mint" : "text-ink-faint")}>{boostReady ? "Boost ready" : "Boost recharging…"}</p>}
        </div>
      </aside>
    </div>
  );
}
