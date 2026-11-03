"use client";

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import {
  CANVAS_BACKGROUND,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAX_POINTS_PER_CHUNK,
  type StrokeSnapshot,
} from "@platform/engines/doodle-duel/client";
import { realtime } from "@/lib/realtime/connection";
import { useRoomEvent } from "@/lib/realtime/use-room";

type Pt = [number, number];
interface LocalStroke {
  id: string;
  tool: "pen" | "eraser";
  color: string;
  size: number;
  chunks: Map<number, Pt[]>;
}

export interface Brush {
  tool: "pen" | "eraser";
  color: string;
  size: number;
}

export interface CanvasHandle {
  undo(): void;
  clear(): void;
}

const FLUSH_MS = 40;

let strokeCounter = 0;
const newStrokeId = () => `${Date.now().toString(36)}${(strokeCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 24);

/**
 * Drawing surface. Strokes live in refs and are rendered imperatively, so
 * drawing never triggers React renders. Coordinates are in a fixed logical
 * space (1000×750) and scaled to the element, so every screen shows the same picture.
 */
export const DrawingCanvas = memo(
  forwardRef<CanvasHandle, { code: string; turn: number; isDrawer: boolean; brush: Brush }>(function DrawingCanvas({ code, turn, isDrawer, brush }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const strokes = useRef(new Map<string, LocalStroke>());
    const order = useRef<string[]>([]);
    const scale = useRef(1);
    const turnRef = useRef(turn);
    const brushRef = useRef(brush);
    brushRef.current = brush;

    // Active local stroke state (drawer only).
    const active = useRef<{ stroke: LocalStroke; seq: number; pending: Pt[]; last: Pt | null; timer: number | null } | null>(null);

    const ctx2d = () => canvasRef.current?.getContext("2d") ?? null;

    const drawChunk = useCallback((s: Pick<LocalStroke, "tool" | "color" | "size">, pts: Pt[]) => {
      const ctx = ctx2d();
      if (!ctx || pts.length === 0) return;
      const k = scale.current;
      ctx.strokeStyle = ctx.fillStyle = s.tool === "eraser" ? CANVAS_BACKGROUND : s.color;
      ctx.lineWidth = s.size * k;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0]![0] * k, pts[0]![1] * k, (s.size * k) / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      // Quadratic curves through the midpoints of successive points: smooth, ink-like lines
      // instead of a polyline. Each chunk still starts and ends on its exact end points, so
      // chunks drawn separately (or replayed later) join without gaps.
      ctx.beginPath();
      ctx.moveTo(pts[0]![0] * k, pts[0]![1] * k);
      if (pts.length === 2) ctx.lineTo(pts[1]![0] * k, pts[1]![1] * k);
      else {
        for (let i = 1; i < pts.length - 1; i++) {
          const [x, y] = pts[i]!;
          const [nx, ny] = pts[i + 1]!;
          ctx.quadraticCurveTo(x * k, y * k, ((x + nx) / 2) * k, ((y + ny) / 2) * k);
        }
        const last = pts[pts.length - 1]!;
        ctx.lineTo(last[0] * k, last[1] * k);
      }
      ctx.stroke();
    }, []);

    const redraw = useCallback(() => {
      const c = canvasRef.current;
      const ctx = ctx2d();
      if (!c || !ctx) return;
      ctx.fillStyle = CANVAS_BACKGROUND;
      ctx.fillRect(0, 0, c.width, c.height);
      c.dataset.strokes = String(order.current.length);
      for (const id of order.current) {
        const s = strokes.current.get(id);
        if (!s) continue;
        for (const seq of [...s.chunks.keys()].sort((a, b) => a - b)) drawChunk(s, s.chunks.get(seq)!);
      }
    }, [drawChunk]);

    const reset = useCallback(() => {
      strokes.current.clear();
      order.current = [];
      active.current = null;
      redraw();
    }, [redraw]);

    const addChunk = useCallback(
      (id: string, meta: Pick<LocalStroke, "tool" | "color" | "size">, seq: number, pts: Pt[]) => {
        let s = strokes.current.get(id);
        if (!s) {
          s = { id, ...meta, chunks: new Map() };
          strokes.current.set(id, s);
          order.current.push(id);
        }
        if (s.chunks.has(seq)) return;
        s.chunks.set(seq, pts);
        // Chunks overlap by one point, so drawing them independently is order-safe —
        // except relative to later strokes, which a full redraw fixes.
        if (order.current[order.current.length - 1] === id) drawChunk(s, pts);
        else redraw();
      },
      [drawChunk, redraw],
    );

    // Size the backing store to the element (crisp on high-DPI screens).
    useEffect(() => {
      const c = canvasRef.current;
      if (!c) return;
      const ro = new ResizeObserver(() => {
        const w = c.clientWidth;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        c.width = Math.round(w * dpr);
        c.height = Math.round(w * (CANVAS_HEIGHT / CANVAS_WIDTH) * dpr);
        scale.current = c.width / CANVAS_WIDTH;
        redraw();
      });
      ro.observe(c);
      return () => ro.disconnect();
    }, [redraw]);

    useEffect(() => {
      if (turnRef.current !== turn) {
        turnRef.current = turn;
        reset();
      }
    }, [turn, reset]);

    // ---------------------------------------------------------------- receive
    useRoomEvent<{ turn: number; strokeId: string; seq: number; tool: "pen" | "eraser"; color: string; size: number; points: Pt[] }>(code, "doodle:stroke", (p) => {
      if (p.turn === turnRef.current) addChunk(p.strokeId, p, p.seq, p.points);
    });
    useRoomEvent<{ turn: number; strokeId: string }>(code, "doodle:undo", (p) => {
      if (p.turn !== turnRef.current) return;
      strokes.current.delete(p.strokeId);
      order.current = order.current.filter((x) => x !== p.strokeId);
      redraw();
    });
    useRoomEvent<{ turn: number }>(code, "doodle:clear", (p) => {
      turnRef.current = p.turn;
      reset();
    });
    useRoomEvent<{ turn: number; strokes: StrokeSnapshot[] }>(code, "doodle:canvas", (p) => {
      turnRef.current = p.turn;
      strokes.current.clear();
      order.current = [];
      for (const s of p.strokes) {
        strokes.current.set(s.id, { id: s.id, tool: s.tool, color: s.color, size: s.size, chunks: new Map(s.chunks.map((pts, i) => [i, pts as Pt[]])) });
        order.current.push(s.id);
      }
      redraw();
    });

    // ------------------------------------------------------------------- send
    const flush = useCallback(() => {
      const a = active.current;
      if (!a || a.pending.length === 0) return;
      while (a.pending.length) {
        // Prefix with the previous chunk's last point so segments connect.
        const room = MAX_POINTS_PER_CHUNK - (a.last ? 1 : 0);
        const take = a.pending.splice(0, room);
        const pts = a.last ? [a.last, ...take] : take;
        a.last = take[take.length - 1]!;
        const seq = a.seq++;
        a.stroke.chunks.set(seq, pts);
        drawChunk(a.stroke, pts);
        realtime.send("doodle:stroke", { strokeId: a.stroke.id, seq, tool: a.stroke.tool, color: a.stroke.color, size: a.stroke.size, points: pts });
      }
    }, [drawChunk]);

    const toLogical = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.round(((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH);
      const y = Math.round(((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT);
      return [Math.min(CANVAS_WIDTH, Math.max(0, x)), Math.min(CANVAS_HEIGHT, Math.max(0, y))];
    };

    const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawer || (e.pointerType === "mouse" && e.button !== 0)) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Capture is a nicety (keeps strokes going outside the canvas); drawing works without it.
      }
      const b = brushRef.current;
      const stroke: LocalStroke = { id: newStrokeId(), tool: b.tool, color: b.color, size: b.size, chunks: new Map() };
      strokes.current.set(stroke.id, stroke);
      order.current.push(stroke.id);
      e.currentTarget.dataset.strokes = String(order.current.length);
      active.current = { stroke, seq: 0, pending: [toLogical(e)], last: null, timer: window.setInterval(flush, FLUSH_MS) };
      flush();
    };
    const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const a = active.current;
      if (!a) return;
      // Coalesced events give smoother lines on fast pointer movement.
      // Some browsers return an empty list rather than including the event itself.
      const coalesced = e.nativeEvent.getCoalescedEvents?.();
      const events = coalesced && coalesced.length > 0 ? coalesced : [e.nativeEvent];
      const rect = e.currentTarget.getBoundingClientRect();
      for (const ev of events) {
        const p: Pt = [
          Math.min(CANVAS_WIDTH, Math.max(0, Math.round(((ev.clientX - rect.left) / rect.width) * CANVAS_WIDTH))),
          Math.min(CANVAS_HEIGHT, Math.max(0, Math.round(((ev.clientY - rect.top) / rect.height) * CANVAS_HEIGHT))),
        ];
        const prev = a.pending[a.pending.length - 1] ?? a.last;
        if (prev && Math.abs(prev[0] - p[0]) + Math.abs(prev[1] - p[1]) < 3) continue;
        a.pending.push(p);
      }
    };
    const onUp = () => {
      const a = active.current;
      if (!a) return;
      flush();
      if (a.timer) clearInterval(a.timer);
      active.current = null;
    };

    useImperativeHandle(
      ref,
      () => ({
        undo() {
          const id = order.current.pop();
          if (!id) return;
          strokes.current.delete(id);
          redraw();
          realtime.send("doodle:undo", {});
        },
        clear() {
          strokes.current.clear();
          order.current = [];
          redraw();
          realtime.send("doodle:clear", {});
        },
      }),
      [redraw],
    );

    useEffect(() => () => {
      if (active.current?.timer) clearInterval(active.current.timer);
    }, []);

    return (
      <canvas
        ref={canvasRef}
        data-testid="doodle-canvas"
        aria-label={isDrawer ? "Drawing canvas — draw your word here" : "The drawer's canvas"}
        role="img"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="block aspect-[4/3] w-full touch-none rounded-[4px] bg-white select-none"
        style={{ cursor: isDrawer ? (brush.tool === "eraser" ? "cell" : "crosshair") : "default" }}
      />
    );
  }),
);
