import { POD_RADIUS, type BBEvent, type BBPodView, type BBView } from "@platform/engines/bumper-blitz";

/**
 * Bumper Blitz presentation: a neon rooftop arena drawn with Canvas 2D.
 *
 * The server owns the simulation. This renderer only reads interpolated pod
 * positions and the event stream, and adds presentation on top: car heading
 * and squash, skid marks, dust, collision sparks and shockwaves, falling into
 * the void, respawn drops, power-up pickups and camera shake.
 */

export const WORLD = 560;

interface PodFx {
  angle: number;
  speed: number;
  out: boolean;
  fall: { x: number; y: number; vx: number; vy: number; angle: number; at: number } | null;
  spawnAt: number;
  squashAt: number;
  squash: number;
  boostAt: number;
  boostReadyAt: number;
  lastX: number;
  lastY: number;
}

interface Particle {
  kind: "dust" | "spark" | "flame" | "ring" | "smoke" | "pickup";
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

interface Skid {
  x: number;
  y: number;
  a: number;
  age: number;
}

type Pos = BBPodView;

const TAU = Math.PI * 2;
const lerpAngle = (a: number, b: number, t: number) => {
  const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
};

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export class ArenaRenderer {
  private fx = new Map<string, PodFx>();
  private ps: Particle[] = [];
  private skids: Skid[] = [];
  private shake = 0;
  private flash = new Map<number, number>();
  private bg: { canvas: HTMLCanvasElement; size: number } | null = null;
  private floor: { canvas: HTMLCanvasElement; size: number; r: number } | null = null;
  private cam = { x: 0, y: 0 };
  private lastNow = 0;

  constructor(
    private selfId: string,
    private reduced: boolean,
  ) {}

  /** Reacts to server events with presentation only. */
  onEvent(e: BBEvent, posOf: (id: string) => Pos | undefined, now: number) {
    if (e.kind === "bump") {
      const a = posOf(e.a);
      const b = posOf(e.b);
      if (!a || !b) return;
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      const k = Math.min(1, e.strength / 700);
      for (let i = 0; i < 8 + k * 18; i++) {
        const ang = Math.random() * TAU;
        const sp = 120 + Math.random() * 380 * k;
        this.add({ kind: "spark", x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0, max: 0.25 + Math.random() * 0.35, size: 2 + Math.random() * 3, color: Math.random() < 0.5 ? "#fff3b0" : "#ff9d3d" });
      }
      this.add({ kind: "ring", x, y, vx: 0, vy: 0, life: 0, max: 0.35, size: 20 + k * 40, color: "#ffffff" });
      for (const id of [e.a, e.b]) {
        const f = this.fx.get(id);
        if (f) {
          f.squashAt = now;
          f.squash = 0.12 + k * 0.18;
        }
      }
      if (e.a === this.selfId || e.b === this.selfId) this.shake = Math.max(this.shake, 6 + k * 16);
      else this.shake = Math.max(this.shake, k * 4);
    } else if (e.kind === "powerup") {
      const p = posOf(e.playerId);
      if (!p) return;
      const color = e.powerup === "turbo" ? "#ffcf3d" : e.powerup === "heavy" ? "#a393ff" : "#2fd6c2";
      for (let i = 0; i < 18; i++) {
        const ang = (i / 18) * TAU;
        this.add({ kind: "pickup", x: p.x, y: p.y, vx: Math.cos(ang) * 240, vy: Math.sin(ang) * 240, life: 0, max: 0.5, size: 5, color });
      }
      this.add({ kind: "ring", x: p.x, y: p.y, vx: 0, vy: 0, life: 0, max: 0.45, size: 70, color });
    }
  }

  private add(p: Particle) {
    if (this.ps.length > (this.reduced ? 120 : 600)) return;
    this.ps.push(p);
  }

  private background(size: number) {
    if (this.bg?.size === size) return this.bg.canvas;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    const sky = g.createLinearGradient(0, 0, 0, size);
    sky.addColorStop(0, "#07051a");
    sky.addColorStop(1, "#160a2e");
    g.fillStyle = sky;
    g.fillRect(0, 0, size, size);
    // City lights far below, deterministic so they don't shimmer between resizes.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = rnd() * 1.6 + 0.4;
      const hue = rnd();
      g.fillStyle = hue < 0.5 ? `rgba(255,190,110,${0.25 + rnd() * 0.5})` : hue < 0.8 ? `rgba(120,200,255,${0.2 + rnd() * 0.4})` : `rgba(255,80,160,${0.25 + rnd() * 0.4})`;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    const fog = g.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.75);
    fog.addColorStop(0, "rgba(120,40,200,0.25)");
    fog.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = fog;
    g.fillRect(0, 0, size, size);
    this.bg = { canvas: c, size };
    return c;
  }

  /** The arena floor at the current radius, cached until the ring shrinks. */
  private floorFor(size: number, radius: number, scale: number) {
    const r = Math.round(radius / 4) * 4;
    if (this.floor && this.floor.size === size && this.floor.r === r) return this.floor.canvas;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    g.setTransform(scale, 0, 0, scale, size / 2, size / 2);
    // Concrete slab edge (seen slightly from above).
    g.beginPath();
    g.arc(0, 14, r + 6, 0, TAU);
    g.fillStyle = "#120c22";
    g.fill();
    // Asphalt.
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fillStyle = "#2a2440";
    g.fill();
    g.save();
    g.clip();
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.12)";
      g.fillRect((rnd() * 2 - 1) * r, (rnd() * 2 - 1) * r, 3, 3);
    }
    // Painted markings.
    g.strokeStyle = "rgba(255,255,255,0.10)";
    g.lineWidth = 6;
    g.setLineDash([26, 22]);
    for (const rr of [r * 0.36, r * 0.68]) {
      g.beginPath();
      g.arc(0, 0, rr, 0, TAU);
      g.stroke();
    }
    g.setLineDash([]);
    g.beginPath();
    g.arc(0, 0, 70, 0, TAU);
    g.fillStyle = "rgba(255,79,139,0.12)";
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.13)";
    g.font = "900 46px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("BLITZ", 0, 2);
    g.restore();
    // Hazard-stripe edge.
    const n = Math.round((TAU * r) / 34);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU;
      const a1 = ((i + 0.5) / n) * TAU;
      g.beginPath();
      g.arc(0, 0, r, a0, a1);
      g.arc(0, 0, r - 16, a1, a0, true);
      g.closePath();
      g.fillStyle = "#ffcf3d";
      g.fill();
    }
    this.floor = { canvas: c, size, r };
    return c;
  }

  private podFx(p: Pos, now: number): PodFx {
    let f = this.fx.get(p.id);
    if (!f) {
      f = { angle: Math.atan2(-p.y, -p.x), speed: 0, out: p.out, fall: null, spawnAt: now, squashAt: 0, squash: 0, boostAt: 0, boostReadyAt: p.boostReadyAt, lastX: p.x, lastY: p.y };
      this.fx.set(p.id, f);
    }
    return f;
  }

  /** Returns events worth a sound: boosts and falls seen this frame. */
  frame(g: CanvasRenderingContext2D, size: number, view: BBView, pods: (Pos | undefined)[], now: number): { boosted: string[]; fell: { id: string; x: number; y: number }[]; respawned: string[] } {
    const dt = Math.min(0.05, this.lastNow ? (now - this.lastNow) / 1000 : 0.016);
    this.lastNow = now;
    const result = { boosted: [] as string[], fell: [] as { id: string; x: number; y: number }[], respawned: [] as string[] };
    const scale = size / (WORLD * 2);

    // Camera: drift slightly toward the player's pod, plus shake.
    const me = pods.find((p) => p?.id === this.selfId);
    const target = me && !me.out ? { x: me.x * 0.08, y: me.y * 0.08 } : { x: 0, y: 0 };
    this.cam.x += (target.x - this.cam.x) * Math.min(1, dt * 3);
    this.cam.y += (target.y - this.cam.y) * Math.min(1, dt * 3);
    const sh = this.reduced ? 0 : this.shake;
    const sx = (Math.random() * 2 - 1) * sh;
    const sy = (Math.random() * 2 - 1) * sh;
    this.shake = Math.max(0, this.shake - dt * 60);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.background(size), 0, 0);
    g.setTransform(1, 0, 0, 1, (sx - this.cam.x) * scale, (sy - this.cam.y) * scale);
    g.drawImage(this.floorFor(size, view.arenaRadius, scale), 0, 0);
    g.setTransform(scale, 0, 0, scale, size / 2 + (sx - this.cam.x) * scale, size / 2 + (sy - this.cam.y) * scale);

    // Neon rim: pulses faster as the ring shrinks.
    const shrinking = view.arenaRadius < 498;
    const pulse = 0.5 + 0.5 * Math.sin(now / (shrinking ? 90 : 400));
    for (const [w, a] of [[34, 0.08], [18, 0.18], [6, 0.9]] as const) {
      g.beginPath();
      g.arc(0, 0, view.arenaRadius + 2, 0, TAU);
      g.lineWidth = w;
      g.strokeStyle = `rgba(255,${shrinking ? 60 : 79},${shrinking ? 110 : 160},${a * (0.7 + pulse * 0.3)})`;
      g.stroke();
    }

    // Skid marks fade over a few seconds.
    g.lineCap = "round";
    for (const s of this.skids) {
      s.age += dt;
      const a = Math.max(0, 0.35 - s.age * 0.09);
      if (a <= 0) continue;
      g.strokeStyle = `rgba(10,6,20,${a})`;
      g.lineWidth = 7;
      for (const side of [-1, 1]) {
        const ox = Math.cos(s.a + Math.PI / 2) * 16 * side;
        const oy = Math.sin(s.a + Math.PI / 2) * 16 * side;
        g.beginPath();
        g.moveTo(s.x + ox - Math.cos(s.a) * 5, s.y + oy - Math.sin(s.a) * 5);
        g.lineTo(s.x + ox + Math.cos(s.a) * 5, s.y + oy + Math.sin(s.a) * 5);
        g.stroke();
      }
    }
    this.skids = this.skids.filter((s) => s.age < 4).slice(-500);

    // Hazards: warning rings that tighten, then a blast.
    for (const h of view.hazards) {
      const active = now >= h.activeAt;
      if (!active) {
        const k = Math.max(0, Math.min(1, 1 - (h.activeAt - now) / 1800));
        g.beginPath();
        g.arc(h.x, h.y, h.r, 0, TAU);
        g.fillStyle = `rgba(255,200,60,${0.06 + k * 0.12})`;
        g.fill();
        g.save();
        g.translate(h.x, h.y);
        g.rotate(now / 600);
        g.setLineDash([18, 14]);
        g.lineWidth = 6;
        g.strokeStyle = "#ffcf3d";
        g.beginPath();
        g.arc(0, 0, h.r, 0, TAU);
        g.stroke();
        g.restore();
        g.setLineDash([]);
        g.beginPath();
        g.arc(h.x, h.y, h.r * (1 - k * 0.85), 0, TAU);
        g.lineWidth = 3;
        g.strokeStyle = "rgba(255,207,61,0.7)";
        g.stroke();
      } else {
        const t = (now - h.activeAt) / 1000;
        const glow = g.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r);
        glow.addColorStop(0, "rgba(255,240,180,0.55)");
        glow.addColorStop(0.5, "rgba(255,110,50,0.35)");
        glow.addColorStop(1, "rgba(255,60,40,0.05)");
        g.fillStyle = glow;
        g.beginPath();
        g.arc(h.x, h.y, h.r, 0, TAU);
        g.fill();
        for (let i = 0; i < 3; i++) {
          const rr = ((t * 1.6 + i / 3) % 1) * h.r;
          g.beginPath();
          g.arc(h.x, h.y, rr, 0, TAU);
          g.lineWidth = 4;
          g.strokeStyle = `rgba(255,170,80,${0.6 * (1 - rr / h.r)})`;
          g.stroke();
        }
        if (Math.random() < dt * 30) this.add({ kind: "smoke", x: h.x + (Math.random() * 2 - 1) * h.r * 0.6, y: h.y + (Math.random() * 2 - 1) * h.r * 0.6, vx: 0, vy: -30, life: 0, max: 0.8, size: 14, color: "255,140,80" });
      }
    }

    // Bumper posts: neon pylons that flash when a pod touches them.
    view.bumpers.forEach((bm, i) => {
      const touching = pods.some((p) => p && !p.out && Math.hypot(p.x - bm.x, p.y - bm.y) < bm.r + POD_RADIUS + 6);
      if (touching) this.flash.set(i, now);
      const fl = Math.max(0, 1 - (now - (this.flash.get(i) ?? 0)) / 300);
      g.beginPath();
      g.arc(bm.x, bm.y + 6, bm.r + 4, 0, TAU);
      g.fillStyle = "rgba(0,0,0,0.4)";
      g.fill();
      g.beginPath();
      g.arc(bm.x, bm.y, bm.r, 0, TAU);
      g.fillStyle = "#1b1333";
      g.fill();
      g.lineWidth = 9;
      g.strokeStyle = fl > 0 ? `rgba(255,255,255,${0.6 + fl * 0.4})` : "#7a6cff";
      g.stroke();
      g.beginPath();
      g.arc(bm.x, bm.y, bm.r * 0.55, 0, TAU);
      g.fillStyle = fl > 0 ? "#fff" : "#ff4f8b";
      g.fill();
      if (fl > 0) {
        g.beginPath();
        g.arc(bm.x, bm.y, bm.r + 10 + (1 - fl) * 24, 0, TAU);
        g.lineWidth = 4;
        g.strokeStyle = `rgba(255,79,139,${fl})`;
        g.stroke();
      }
    });

    // Power-ups: floating tokens with drawn icons.
    for (const u of view.powerups) {
      const bob = Math.sin(now / 260 + u.id) * 4;
      const color = u.kind === "turbo" ? "#ffcf3d" : u.kind === "heavy" ? "#a393ff" : "#2fd6c2";
      g.beginPath();
      g.ellipse(u.x, u.y + 18, 16, 6, 0, 0, TAU);
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fill();
      g.save();
      g.translate(u.x, u.y + bob);
      g.beginPath();
      g.arc(0, 0, 26, 0, TAU);
      g.fillStyle = `${color}33`;
      g.fill();
      g.rotate(now / 900);
      g.beginPath();
      for (let i = 0; i < 6; i++) g.lineTo(Math.cos((i / 6) * TAU) * 19, Math.sin((i / 6) * TAU) * 19);
      g.closePath();
      g.fillStyle = color;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = "#17142b";
      g.stroke();
      g.rotate(-now / 900);
      g.fillStyle = "#17142b";
      g.strokeStyle = "#17142b";
      if (u.kind === "turbo") {
        g.beginPath();
        g.moveTo(3, -12);
        g.lineTo(-7, 2);
        g.lineTo(0, 2);
        g.lineTo(-3, 12);
        g.lineTo(7, -2);
        g.lineTo(0, -2);
        g.closePath();
        g.fill();
      } else if (u.kind === "heavy") {
        roundRect(g, -9, -4, 18, 12, 3);
        g.fill();
        g.beginPath();
        g.arc(0, -6, 5, Math.PI, 0);
        g.lineWidth = 3;
        g.stroke();
      } else {
        g.beginPath();
        g.moveTo(0, -11);
        g.lineTo(9, -6);
        g.lineTo(7, 6);
        g.lineTo(0, 11);
        g.lineTo(-7, 6);
        g.lineTo(-9, -6);
        g.closePath();
        g.fill();
      }
      g.restore();
    }

    // Pods.
    for (const p of pods) {
      if (!p) continue;
      const f = this.podFx(p, now);
      if (p.out && !f.out) {
        // Tumble outward from where the pod was last seen on the platform.
        const len = Math.hypot(f.lastX, f.lastY) || 1;
        f.fall = { x: f.lastX, y: f.lastY, vx: (f.lastX / len) * 160, vy: (f.lastY / len) * 160, angle: f.angle, at: now };
        result.fell.push({ id: p.id, x: f.lastX, y: f.lastY });
      }
      if (!p.out && f.out) {
        f.spawnAt = now;
        f.fall = null;
        result.respawned.push(p.id);
        this.add({ kind: "ring", x: p.x, y: p.y, vx: 0, vy: 0, life: 0, max: 0.5, size: 60, color: p.color });
      }
      f.out = p.out;
      if (p.boostReadyAt > f.boostReadyAt + 100) {
        f.boostAt = now;
        result.boosted.push(p.id);
      }
      f.boostReadyAt = p.boostReadyAt;

      if (p.out) {
        if (f.fall) this.drawFalling(g, p, f, now);
        continue;
      }
      const sp = Math.hypot(p.vx, p.vy);
      const prevAngle = f.angle;
      if (sp > 25) f.angle = lerpAngle(f.angle, Math.atan2(p.vy, p.vx), Math.min(1, dt * 10));
      const turn = Math.abs(((f.angle - prevAngle + Math.PI) % TAU + TAU) % TAU - Math.PI) / Math.max(dt, 0.001);
      f.speed = sp;
      // Skids when turning hard at speed; dust when moving.
      if (sp > 200 && turn > 3.2 && Math.hypot(p.x - f.lastX, p.y - f.lastY) > 4) this.skids.push({ x: p.x, y: p.y, a: f.angle, age: 0 });
      if (sp > 120 && Math.random() < dt * (sp / 40)) {
        const bx = p.x - Math.cos(f.angle) * 30;
        const by = p.y - Math.sin(f.angle) * 30;
        this.add({ kind: "dust", x: bx, y: by, vx: -Math.cos(f.angle) * 40 + (Math.random() * 2 - 1) * 20, vy: -Math.sin(f.angle) * 40 + (Math.random() * 2 - 1) * 20, life: 0, max: 0.6, size: 7, color: "180,170,210" });
      }
      const boosting = now - f.boostAt < 450 || p.turbo;
      if (boosting && Math.random() < dt * 50) {
        const bx = p.x - Math.cos(f.angle) * 34;
        const by = p.y - Math.sin(f.angle) * 34;
        this.add({ kind: "flame", x: bx, y: by, vx: -Math.cos(f.angle) * 180 + (Math.random() * 2 - 1) * 40, vy: -Math.sin(f.angle) * 180 + (Math.random() * 2 - 1) * 40, life: 0, max: 0.28, size: 9, color: p.turbo ? "#ffcf3d" : "#ff7a3d" });
      }
      f.lastX = p.x;
      f.lastY = p.y;
      this.drawPod(g, p, f, now, sp);
    }

    // Particles over everything.
    const next: Particle[] = [];
    for (const q of this.ps) {
      q.life += dt;
      if (q.life >= q.max) continue;
      const k = q.life / q.max;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 0.92;
      q.vy *= 0.92;
      if (q.kind === "spark" || q.kind === "pickup") {
        g.strokeStyle = q.color;
        g.globalAlpha = 1 - k;
        g.lineWidth = q.size;
        g.beginPath();
        g.moveTo(q.x, q.y);
        g.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03);
        g.stroke();
        g.globalAlpha = 1;
      } else if (q.kind === "ring") {
        g.beginPath();
        g.arc(q.x, q.y, q.size * (0.4 + k), 0, TAU);
        g.lineWidth = 6 * (1 - k);
        g.strokeStyle = q.color;
        g.globalAlpha = 1 - k;
        g.stroke();
        g.globalAlpha = 1;
      } else if (q.kind === "flame") {
        g.beginPath();
        g.arc(q.x, q.y, q.size * (1 - k * 0.6), 0, TAU);
        g.fillStyle = q.color;
        g.globalAlpha = (1 - k) * 0.85;
        g.fill();
        g.globalAlpha = 1;
      } else {
        g.beginPath();
        g.arc(q.x, q.y, q.size * (1 + k * 1.5), 0, TAU);
        g.fillStyle = `rgba(${q.color},${(1 - k) * (q.kind === "smoke" ? 0.3 : 0.22)})`;
        g.fill();
      }
      next.push(q);
    }
    this.ps = next;
    return result;
  }

  private drawFalling(g: CanvasRenderingContext2D, p: Pos, f: PodFx, now: number) {
    const fall = f.fall!;
    const t = (now - fall.at) / 1000;
    if (t > 0.9) return;
    const k = t / 0.9;
    g.save();
    g.translate(fall.x + fall.vx * t, fall.y + fall.vy * t);
    g.rotate(fall.angle + t * 9);
    g.scale(1 - k * 0.75, 1 - k * 0.75);
    g.globalAlpha = 1 - k;
    this.drawCar(g, p, false);
    g.restore();
    g.globalAlpha = 1;
  }

  private drawPod(g: CanvasRenderingContext2D, p: Pos, f: PodFx, now: number, speed: number) {
    const self = p.id === this.selfId;
    // Respawn: drop in from above with a growing shadow.
    const sinceSpawn = (now - f.spawnAt) / 1000;
    const drop = sinceSpawn < 0.45 ? 1 - sinceSpawn / 0.45 : 0;
    const sq = now - f.squashAt < 220 ? f.squash * Math.sin(((now - f.squashAt) / 220) * Math.PI) : 0;
    const accel = Math.min(1, speed / 430);

    g.beginPath();
    g.ellipse(p.x + 5, p.y + 9, POD_RADIUS * 1.25 * (1 - drop * 0.5), POD_RADIUS * 1.05 * (1 - drop * 0.5), f.angle, 0, TAU);
    g.fillStyle = `rgba(0,0,0,${0.45 - drop * 0.3})`;
    g.fill();

    if (self) {
      g.beginPath();
      g.arc(p.x, p.y, POD_RADIUS + 18 + Math.sin(now / 200) * 2, 0, TAU);
      g.lineWidth = 3;
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.stroke();
    }

    g.save();
    g.translate(p.x, p.y - drop * 40);
    g.rotate(f.angle);
    const s = (p.heavy ? 1.14 : 1) * (1 + drop * 0.6);
    g.scale(s * (1 - sq + accel * 0.04), s * (1 + sq * 0.8));
    g.globalAlpha = p.ghost ? 0.4 + 0.3 * Math.sin(now / 60) : 1 - drop * 0.4;
    this.drawCar(g, p, p.heavy);
    g.restore();
    g.globalAlpha = 1;

    if (p.shield) {
      g.save();
      g.translate(p.x, p.y);
      g.rotate(now / 700);
      g.beginPath();
      for (let i = 0; i < 6; i++) g.lineTo(Math.cos((i / 6) * TAU) * (POD_RADIUS + 14), Math.sin((i / 6) * TAU) * (POD_RADIUS + 14));
      g.closePath();
      g.fillStyle = "rgba(47,214,194,0.15)";
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = `rgba(47,214,194,${0.6 + 0.3 * Math.sin(now / 150)})`;
      g.stroke();
      g.restore();
    }

    // Name tag.
    const label = self ? "YOU" : p.name.slice(0, 12);
    g.font = "800 17px system-ui, sans-serif";
    const w = g.measureText(label).width + 16;
    const ty = p.y - POD_RADIUS - 30 - drop * 40;
    roundRect(g, p.x - w / 2, ty - 12, w, 22, 11);
    g.fillStyle = self ? "#ffffff" : "rgba(10,6,24,0.75)";
    g.fill();
    g.fillStyle = self ? "#17142b" : "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(label, p.x, ty);
    if (!p.connected) {
      g.fillStyle = "#ffcf3d";
      g.fillText("…", p.x + w / 2 + 8, ty);
    }
  }

  /** A top-down bumper car facing +x, centred on the origin. */
  private drawCar(g: CanvasRenderingContext2D, p: Pos, heavy: boolean) {
    const L = POD_RADIUS * 1.25;
    const W = POD_RADIUS * 1.05;
    // Rubber skirt.
    roundRect(g, -L, -W, L * 2, W * 2, W * 0.85);
    g.fillStyle = "#15121f";
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = "#3c3652";
    g.stroke();
    // Body.
    roundRect(g, -L + 6, -W + 6, L * 2 - 12, W * 2 - 12, W * 0.65);
    g.fillStyle = p.color;
    g.fill();
    // Shading: darker rear, glossy highlight.
    roundRect(g, -L + 6, -W + 6, L * 0.7, W * 2 - 12, W * 0.65);
    g.fillStyle = "rgba(0,0,0,0.18)";
    g.fill();
    g.beginPath();
    g.ellipse(L * 0.25, -W * 0.38, L * 0.45, W * 0.16, 0, 0, TAU);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fill();
    if (heavy) {
      g.fillStyle = "rgba(220,220,240,0.85)";
      for (const y of [-W + 9, W - 15]) {
        roundRect(g, -L * 0.4, y, L * 0.8, 6, 3);
        g.fill();
      }
    }
    // Seat and driver.
    roundRect(g, -L * 0.55, -W * 0.45, L * 0.55, W * 0.9, 8);
    g.fillStyle = shade(p.color, -0.45);
    g.fill();
    g.beginPath();
    g.arc(-L * 0.12, 0, W * 0.36, 0, TAU);
    g.fillStyle = "#f4f2ff";
    g.fill();
    g.beginPath();
    g.arc(-L * 0.12, 0, W * 0.36, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
    g.lineWidth = 4;
    g.strokeStyle = p.color;
    g.stroke();
    // Headlights and the collector pole at the back.
    for (const y of [-W * 0.5, W * 0.5]) {
      g.beginPath();
      g.arc(L - 9, y, 3.6, 0, TAU);
      g.fillStyle = "#fff6c8";
      g.fill();
    }
    g.beginPath();
    g.arc(-L + 10, 0, 4.5, 0, TAU);
    g.fillStyle = "#ffcf3d";
    g.fill();
  }
}
