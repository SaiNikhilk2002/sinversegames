/**
 * Canvas 2D particle layer for Kitchen Rush: smoke, steam, grease sparks,
 * confetti and coins. One canvas covers the kitchen (pointer-events: none),
 * emitters are attached to DOM elements and positioned from their bounding
 * boxes, and everything runs in a single requestAnimationFrame loop that
 * stops when nothing is alive. Purely presentational: it never touches game
 * state.
 */

export type EmitKind = "smoke" | "darkSmoke" | "steam" | "sparks" | "heat";
export type BurstKind = "confetti" | "coins" | "crumbs" | "puff" | "stars";

interface P {
  kind: EmitKind | BurstKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
}

interface Emitter {
  el: HTMLElement;
  kind: EmitKind;
  /** Particles per second. */
  rate: number;
  /** Emission point inside the element, as fractions of its box. */
  ox: number;
  oy: number;
  spread: number;
  acc: number;
}

const CONFETTI = ["#ff4f8b", "#ffb23d", "#2fd6a8", "#5b8cff", "#ffd13f", "#c04dff"];

export class Fx {
  private ctx: CanvasRenderingContext2D | null;
  private ps: P[] = [];
  private emitters = new Map<string, Emitter>();
  private raf = 0;
  private last = 0;
  private origin = { x: 0, y: 0, w: 0, h: 0 };
  private rectCache = new Map<HTMLElement, { r: DOMRect; at: number }>();
  private cap: number;
  private paused = false;
  private ro: ResizeObserver | null = null;
  private rateScale = 1;

  constructor(
    private canvas: HTMLCanvasElement,
    private reduced: boolean,
  ) {
    this.ctx = canvas.getContext("2d");
    const lowEnd = typeof navigator !== "undefined" && (navigator.hardwareConcurrency ?? 8) <= 4;
    this.cap = reduced ? 60 : lowEnd ? 180 : 420;
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement ?? canvas);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.emitters.clear();
    this.ps = [];
  }

  /** Fewer particles for devices that can't keep up. */
  setLite() {
    this.cap = Math.min(this.cap, 110);
    this.rateScale = 0.45;
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (!p) this.wake();
  }

  private resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.rectCache.clear();
  }

  private rectOf(el: HTMLElement, now: number) {
    const hit = this.rectCache.get(el);
    if (hit && now - hit.at < 400) return hit.r;
    const r = el.getBoundingClientRect();
    this.rectCache.set(el, { r, at: now });
    return r;
  }

  /** Position of a point inside `el`, in canvas coordinates. */
  pointIn(el: HTMLElement, fx = 0.5, fy = 0.5) {
    const c = this.canvas.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - c.left + r.width * fx, y: r.top - c.top + r.height * fy };
  }

  /** Adds, updates or (with rate 0) removes a continuous emitter. */
  emit(id: string, el: HTMLElement | null, kind: EmitKind, rate: number, ox = 0.5, oy = 0.35, spread = 0.25) {
    if (!el || rate <= 0) {
      this.emitters.delete(id);
      return;
    }
    const cur = this.emitters.get(id);
    const scaled = (this.reduced ? rate * 0.3 : rate) * this.rateScale;
    if (cur && cur.kind === kind) Object.assign(cur, { el, rate: scaled, ox, oy, spread });
    else this.emitters.set(id, { el, kind, rate: scaled, ox, oy, spread, acc: 0 });
    this.wake();
  }

  burst(kind: BurstKind | EmitKind, x: number, y: number, n: number) {
    const count = Math.ceil(this.reduced ? n * 0.3 : n);
    for (let i = 0; i < count; i++) this.spawn(kind, x, y, 1);
    this.wake();
  }

  burstAt(kind: BurstKind | EmitKind, el: HTMLElement | null, n: number, fx = 0.5, fy = 0.4) {
    if (!el) return;
    const p = this.pointIn(el, fx, fy);
    this.burst(kind, p.x, p.y, n);
  }

  private spawn(kind: EmitKind | BurstKind, x: number, y: number, spread: number) {
    if (this.ps.length >= this.cap) return;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const p: P = { kind, x, y, vx: 0, vy: 0, life: 0, max: 1, size: 4, rot: rnd(0, 6.28), vr: 0, color: "#fff" };
    switch (kind) {
      case "smoke":
        Object.assign(p, { x: x + rnd(-1, 1) * spread, vx: rnd(-6, 6), vy: rnd(-34, -22), max: rnd(1.4, 2.2), size: rnd(5, 9), color: "200,200,210" });
        break;
      case "darkSmoke":
        Object.assign(p, { x: x + rnd(-1, 1) * spread, vx: rnd(-8, 8), vy: rnd(-46, -30), max: rnd(1.6, 2.6), size: rnd(8, 13), color: "60,56,60" });
        break;
      case "steam":
        Object.assign(p, { x: x + rnd(-1, 1) * spread, vx: rnd(-5, 5), vy: rnd(-42, -28), max: rnd(0.9, 1.5), size: rnd(4, 8), color: "255,255,255" });
        break;
      case "heat":
        Object.assign(p, { x: x + rnd(-1, 1) * spread, vx: rnd(-3, 3), vy: rnd(-26, -16), max: rnd(0.6, 1), size: rnd(10, 16), color: "255,160,90" });
        break;
      case "sparks":
        Object.assign(p, { x: x + rnd(-1, 1) * spread, vx: rnd(-50, 50), vy: rnd(-110, -60), max: rnd(0.35, 0.6), size: rnd(1.2, 2.4), color: Math.random() < 0.5 ? "#ffd27a" : "#fff2c4" });
        break;
      case "confetti":
        Object.assign(p, { vx: rnd(-160, 160), vy: rnd(-320, -140), max: rnd(1.2, 2), size: rnd(4, 7), vr: rnd(-10, 10), color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)]! });
        break;
      case "coins":
        Object.assign(p, { vx: rnd(-90, 90), vy: rnd(-220, -120), max: rnd(0.8, 1.1), size: rnd(4, 6), vr: rnd(-8, 8), color: "#ffcc33" });
        break;
      case "stars":
        Object.assign(p, { vx: rnd(-120, 120), vy: rnd(-200, -60), max: rnd(0.7, 1.1), size: rnd(4, 7), vr: rnd(-4, 4), color: "#ffe066" });
        break;
      case "crumbs":
        Object.assign(p, { vx: rnd(-70, 70), vy: rnd(-120, -50), max: rnd(0.4, 0.7), size: rnd(1.5, 3), color: Math.random() < 0.5 ? "#7fdc89" : "#ffb27a" });
        break;
      case "puff":
        Object.assign(p, { vx: rnd(-40, 40), vy: rnd(-40, 0), max: rnd(0.4, 0.7), size: rnd(6, 11), color: "230,230,240" });
        break;
    }
    this.ps.push(p);
  }

  private wake() {
    if (this.raf || this.paused) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.paused || document.hidden) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const c = this.canvas.getBoundingClientRect();
    this.origin = { x: c.left, y: c.top, w: c.width, h: c.height };

    for (const em of this.emitters.values()) {
      if (!em.el.isConnected) continue;
      em.acc += em.rate * dt;
      if (em.acc < 1) continue;
      const r = this.rectOf(em.el, now);
      const x = r.left - this.origin.x + r.width * em.ox;
      const y = r.top - this.origin.y + r.height * em.oy;
      while (em.acc >= 1) {
        em.acc -= 1;
        this.spawn(em.kind, x, y, r.width * em.spread);
      }
    }

    const g = this.ctx;
    if (g) {
      g.clearRect(0, 0, this.origin.w, this.origin.h);
      const next: P[] = [];
      for (const p of this.ps) {
        p.life += dt;
        if (p.life >= p.max) continue;
        const k = p.life / p.max;
        const gravity = p.kind === "confetti" ? 520 : p.kind === "coins" || p.kind === "stars" ? 600 : p.kind === "sparks" ? 360 : p.kind === "crumbs" ? 500 : 0;
        p.vy += gravity * dt;
        if (p.kind === "smoke" || p.kind === "darkSmoke" || p.kind === "steam") p.vx += Math.sin((p.life + p.rot) * 3) * 12 * dt;
        if (p.kind === "confetti") p.vx *= 0.985;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        this.draw(g, p, k);
        next.push(p);
      }
      this.ps = next;
    }
    if (this.ps.length || this.emitters.size) this.raf = requestAnimationFrame(this.frame);
  };

  private draw(g: CanvasRenderingContext2D, p: P, k: number) {
    switch (p.kind) {
      case "smoke":
      case "darkSmoke":
      case "steam":
      case "puff": {
        const a = (p.kind === "steam" ? 0.5 : p.kind === "darkSmoke" ? 0.55 : p.kind === "puff" ? 0.7 : 0.35) * (k < 0.15 ? k / 0.15 : 1 - k);
        g.fillStyle = `rgba(${p.color},${a.toFixed(3)})`;
        g.beginPath();
        g.arc(p.x, p.y, p.size * (1 + k * 1.8), 0, Math.PI * 2);
        g.fill();
        break;
      }
      case "heat": {
        g.fillStyle = `rgba(${p.color},${(0.12 * (1 - k)).toFixed(3)})`;
        g.beginPath();
        g.ellipse(p.x, p.y, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case "sparks":
      case "crumbs":
        g.fillStyle = p.color;
        g.globalAlpha = 1 - k;
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
        break;
      case "confetti":
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.scale(1, Math.cos(p.rot * 2));
        g.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
        g.fillStyle = p.color;
        g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        g.restore();
        break;
      case "coins":
        g.save();
        g.translate(p.x, p.y);
        g.scale(Math.abs(Math.cos(p.rot)) * 0.8 + 0.2, 1);
        g.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
        g.fillStyle = "#e8a40c";
        g.beginPath();
        g.arc(0, 0, p.size + 1, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(0, 0, p.size, 0, Math.PI * 2);
        g.fill();
        g.restore();
        break;
      case "stars": {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.globalAlpha = 1 - k;
        g.fillStyle = p.color;
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? p.size * 0.45 : p.size;
          const a = (i * Math.PI) / 5;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.fill();
        g.restore();
        break;
      }
    }
  }
}
