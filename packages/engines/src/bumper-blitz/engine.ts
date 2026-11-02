import { z } from "zod";
import type { MatchResults } from "@platform/shared";
import type { Rng } from "../core/seeded";
import { fail, toAll, type EngineResult, type EngineSuccess, type GameEngine, type OutboundMessage, type PlayerRef } from "../core/types";

/**
 * Bumper Blitz: a top-down arena brawler simulated entirely on the server.
 * Clients send only their stick direction and boost button; the server runs a
 * fixed-step physics simulation and broadcasts positions every tick.
 *
 * Units are arena units (the arena radius starts at 500); time is in ms.
 */

export const TICK_MS = 50;
export const ARENA_RADIUS = 500;
const ARENA_MIN_RADIUS = 360;
export const POD_RADIUS = 26;
const ACCEL = 1500; // units/s²
const DRAG = 2.4; // 1/s
const MAX_SPEED = 430;
const BOOST_IMPULSE = 380;
const BOOST_COOLDOWN_MS = 2500;
const COUNTDOWN_MS = 3000;
const RESPAWN_MS = 2000;
const SPAWN_GHOST_MS = 1500;
const KO_CREDIT_MS = 4000;
const RESTITUTION = 1.15;
const POWERUP_EVERY_MS = 7000;
const POWERUP_DURATION_MS = 6000;
const SHIELD_DURATION_MS = 10_000;
const HAZARD_EVERY_MS = 11_000;
const HAZARD_WARN_MS = 1500;
const HAZARD_ACTIVE_MS = 3500;
const HAZARD_RADIUS = 80;
const DISCONNECTED_DRIFT = 0;

export const BUMPERS: readonly { x: number; y: number; r: number }[] = [
  { x: 0, y: -210, r: 34 },
  { x: 182, y: 105, r: 34 },
  { x: -182, y: 105, r: 34 },
];

export const POWERUP_KINDS = ["turbo", "heavy", "shield"] as const;
export type PowerupKind = (typeof POWERUP_KINDS)[number];

export const bumperBlitzConfigSchema = z.object({
  /** Match length in seconds. */
  durationSeconds: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120), z.literal(180)]).default(90),
  powerups: z.boolean().default(true),
  hazards: z.boolean().default(true),
});
export type BumperBlitzConfig = z.infer<typeof bumperBlitzConfigSchema>;

export const bumperBlitzActionSchema = z.object({
  type: z.literal("arena:input"),
  x: z.number().min(-1).max(1),
  y: z.number().min(-1).max(1),
  boost: z.boolean().default(false),
});
export type BumperBlitzAction = z.infer<typeof bumperBlitzActionSchema>;

export interface Pod extends PlayerRef {
  x: number;
  y: number;
  vx: number;
  vy: number;
  inputX: number;
  inputY: number;
  boostQueued: boolean;
  boostReadyAt: number;
  connected: boolean;
  left: boolean;
  /** Fell off; respawns at `respawnAt`. */
  outUntil: number | null;
  ghostUntil: number;
  lastHitBy: { id: string; at: number } | null;
  knockouts: number;
  falls: number;
  turboUntil: number;
  heavyUntil: number;
  shieldUntil: number;
}

export interface Powerup {
  id: number;
  kind: PowerupKind;
  x: number;
  y: number;
}

export interface Hazard {
  x: number;
  y: number;
  r: number;
  activeAt: number;
  endsAt: number;
}

export type BBEvent =
  | { kind: "ko"; playerId: string; by: string | null }
  | { kind: "powerup"; playerId: string; powerup: PowerupKind }
  | { kind: "bump"; a: string; b: string; strength: number };

export interface BBState {
  config: BumperBlitzConfig;
  pods: Pod[];
  powerups: Powerup[];
  hazards: Hazard[];
  nextPowerupAt: number;
  nextHazardAt: number;
  powerupSeq: number;
  startedAt: number;
  playAt: number;
  endsAt: number;
  lastTickAt: number;
  arenaRadius: number;
  status: "countdown" | "playing" | "finished";
  endReason: MatchResults["reason"] | null;
  endedAt: number | null;
  tick: number;
}

export interface BBPodView {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  out: boolean;
  ghost: boolean;
  connected: boolean;
  left: boolean;
  knockouts: number;
  falls: number;
  turbo: boolean;
  heavy: boolean;
  shield: boolean;
  boostReadyAt: number;
}

export interface BBView {
  status: BBState["status"];
  tick: number;
  serverTime: number;
  playAt: number;
  endsAt: number;
  arenaRadius: number;
  pods: BBPodView[];
  powerups: Powerup[];
  hazards: Hazard[];
  bumpers: typeof BUMPERS;
  config: BumperBlitzConfig;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

const massOf = (p: Pod, now: number) => (p.heavyUntil > now ? 2.2 : 1) * (p.shieldUntil > now ? 1.6 : 1);
const alive = (p: Pod) => !p.left && p.outUntil === null;

function randomPoint(rng: Rng, maxR: number): { x: number; y: number } {
  const a = (rng.int(3600) / 3600) * Math.PI * 2;
  const r = Math.sqrt(rng.int(1000) / 1000) * maxR;
  return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r) };
}

function spawnPoint(index: number, count: number) {
  const a = (index / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.round(Math.cos(a) * 300), y: Math.round(Math.sin(a) * 300) };
}

function freeSpawn(s: BBState, rng: Rng) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const p = randomPoint(rng, 200);
    const clear = s.pods.every((o) => !alive(o) || Math.hypot(o.x - p.x, o.y - p.y) > POD_RADIUS * 3);
    const offBumper = BUMPERS.every((b) => Math.hypot(b.x - p.x, b.y - p.y) > b.r + POD_RADIUS * 2);
    if (clear && offBumper) return p;
  }
  return { x: 0, y: 0 };
}

/** Advances the world by one fixed step. Returns notable events. */
export function step(s: BBState, now: number, rng: Rng): BBEvent[] {
  const events: BBEvent[] = [];
  const dt = TICK_MS / 1000;
  s.tick++;
  s.lastTickAt = now;

  if (s.status === "countdown") {
    if (now >= s.playAt) s.status = "playing";
    else return events;
  }

  // The ring shrinks over the second half of the match.
  const half = s.playAt + (s.endsAt - s.playAt) / 2;
  if (now > half) {
    const f = Math.min(1, (now - half) / (s.endsAt - half));
    s.arenaRadius = Math.round(ARENA_RADIUS - (ARENA_RADIUS - ARENA_MIN_RADIUS) * f);
  }

  // Respawns.
  for (const p of s.pods) {
    if (!p.left && p.outUntil !== null && now >= p.outUntil) {
      const at = freeSpawn(s, rng);
      Object.assign(p, { x: at.x, y: at.y, vx: 0, vy: 0, outUntil: null, ghostUntil: now + SPAWN_GHOST_MS, lastHitBy: null });
    }
  }

  // Steering, boost and drag.
  for (const p of s.pods) {
    if (!alive(p)) continue;
    const turbo = p.turboUntil > now ? 1.45 : 1;
    let ix = p.connected ? p.inputX : DISCONNECTED_DRIFT;
    let iy = p.connected ? p.inputY : DISCONNECTED_DRIFT;
    const len = Math.hypot(ix, iy);
    if (len > 1) {
      ix /= len;
      iy /= len;
    }
    p.vx += ix * ACCEL * turbo * dt;
    p.vy += iy * ACCEL * turbo * dt;
    if (p.boostQueued && now >= p.boostReadyAt) {
      const dl = Math.hypot(ix, iy) || Math.hypot(p.vx, p.vy) || 1;
      const dx = (Math.hypot(ix, iy) ? ix : p.vx) / dl;
      const dy = (Math.hypot(ix, iy) ? iy : p.vy) / dl;
      p.vx += dx * BOOST_IMPULSE;
      p.vy += dy * BOOST_IMPULSE;
      p.boostReadyAt = now + BOOST_COOLDOWN_MS;
    }
    p.boostQueued = false;
    const drag = Math.max(0, 1 - DRAG * dt);
    p.vx *= drag;
    p.vy *= drag;
    const speed = Math.hypot(p.vx, p.vy);
    const cap = MAX_SPEED * turbo * 1.9; // boosts may exceed the steering cap briefly
    if (speed > cap) {
      p.vx = (p.vx / speed) * cap;
      p.vy = (p.vy / speed) * cap;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  // Pod–pod collisions (elastic with restitution, heavier pods push harder).
  const live = s.pods.filter(alive);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      if (a.ghostUntil > now || b.ghostUntil > now) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      if (dist >= POD_RADIUS * 2) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const ma = massOf(a, now);
      const mb = massOf(b, now);
      const overlap = POD_RADIUS * 2 - dist;
      a.x -= nx * overlap * (mb / (ma + mb));
      a.y -= ny * overlap * (mb / (ma + mb));
      b.x += nx * overlap * (ma / (ma + mb));
      b.y += ny * overlap * (ma / (ma + mb));
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel <= 0) continue;
      const impulse = ((1 + RESTITUTION) * rel) / (1 / ma + 1 / mb);
      const shieldA = a.shieldUntil > now;
      const shieldB = b.shieldUntil > now;
      a.vx -= (impulse / ma) * nx * (shieldA ? 0.25 : 1);
      a.vy -= (impulse / ma) * ny * (shieldA ? 0.25 : 1);
      b.vx += (impulse / mb) * nx * (shieldB ? 0.25 : 1);
      b.vy += (impulse / mb) * ny * (shieldB ? 0.25 : 1);
      if (shieldA) a.shieldUntil = now; // a shield absorbs one big knock
      if (shieldB) b.shieldUntil = now;
      a.lastHitBy = { id: b.id, at: now };
      b.lastHitBy = { id: a.id, at: now };
      if (rel > 150) events.push({ kind: "bump", a: a.id, b: b.id, strength: Math.round(rel) });
    }
  }

  // Bumpers bounce pods away.
  for (const p of live) {
    for (const bm of BUMPERS) {
      const dx = p.x - bm.x;
      const dy = p.y - bm.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      if (dist >= bm.r + POD_RADIUS) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      p.x = bm.x + nx * (bm.r + POD_RADIUS);
      p.y = bm.y + ny * (bm.r + POD_RADIUS);
      const vn = p.vx * nx + p.vy * ny;
      const kick = Math.max(260, -vn * 1.6);
      p.vx += nx * (kick - vn);
      p.vy += ny * (kick - vn);
    }
  }

  // Hazards: telegraphed zones that blast pods outward while active.
  if (s.config.hazards) {
    s.hazards = s.hazards.filter((h) => h.endsAt > now);
    if (now >= s.nextHazardAt) {
      const at = randomPoint(rng, s.arenaRadius * 0.55);
      s.hazards.push({ ...at, r: HAZARD_RADIUS, activeAt: now + HAZARD_WARN_MS, endsAt: now + HAZARD_WARN_MS + HAZARD_ACTIVE_MS });
      s.nextHazardAt = now + HAZARD_EVERY_MS;
    }
    for (const h of s.hazards) {
      if (now < h.activeAt) continue;
      for (const p of live) {
        const dx = p.x - h.x;
        const dy = p.y - h.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        if (dist > h.r + POD_RADIUS * 0.5) continue;
        p.vx += (dx / dist) * 900 * dt;
        p.vy += (dy / dist) * 900 * dt;
      }
    }
  }

  // Power-ups.
  if (s.config.powerups) {
    if (now >= s.nextPowerupAt && s.powerups.length < 2) {
      const at = randomPoint(rng, s.arenaRadius * 0.6);
      s.powerups.push({ id: ++s.powerupSeq, kind: POWERUP_KINDS[rng.int(POWERUP_KINDS.length)]!, ...at });
      s.nextPowerupAt = now + POWERUP_EVERY_MS;
    }
    for (const p of live) {
      const hit = s.powerups.find((u) => Math.hypot(u.x - p.x, u.y - p.y) < POD_RADIUS + 18);
      if (!hit) continue;
      s.powerups = s.powerups.filter((u) => u !== hit);
      if (hit.kind === "turbo") p.turboUntil = now + POWERUP_DURATION_MS;
      if (hit.kind === "heavy") p.heavyUntil = now + POWERUP_DURATION_MS;
      if (hit.kind === "shield") p.shieldUntil = now + SHIELD_DURATION_MS;
      events.push({ kind: "powerup", playerId: p.id, powerup: hit.kind });
    }
  }

  // Knockouts: a pod whose centre leaves the ring falls.
  for (const p of live) {
    if (Math.hypot(p.x, p.y) <= s.arenaRadius) continue;
    p.falls++;
    p.outUntil = now + RESPAWN_MS;
    p.turboUntil = p.heavyUntil = p.shieldUntil = 0;
    const credit = p.lastHitBy && now - p.lastHitBy.at <= KO_CREDIT_MS ? p.lastHitBy.id : null;
    const hitter = credit ? s.pods.find((o) => o.id === credit && !o.left) : undefined;
    if (hitter) hitter.knockouts++;
    events.push({ kind: "ko", playerId: p.id, by: hitter?.id ?? null });
  }

  if (now >= s.endsAt) {
    s.status = "finished";
    s.endReason = "completed";
    s.endedAt = now;
  }
  return events;
}

const r1 = (n: number) => Math.round(n);

const ok = (state: BBState, events: BBEvent[], stateChanged = true): EngineSuccess<BBState> => {
  const messages: OutboundMessage[] = events.length ? [{ to: toAll, event: "game:action", payload: { events } }] : [];
  return { ok: true, state, stateChanged, messages };
};

export const bumperBlitzEngine: GameEngine<BBState, BumperBlitzConfig, BumperBlitzAction, BBView> = {
  id: "bumper-blitz",
  minPlayers: 2,
  maxPlayers: 6,
  configSchema: bumperBlitzConfigSchema,
  defaultConfig: () => bumperBlitzConfigSchema.parse({}),
  actionSchema: bumperBlitzActionSchema,
  actionTypes: ["arena:input"],
  requiresVersion() {
    return false; // realtime input, applied on the next tick
  },

  create(players, config, ctx) {
    const playAt = ctx.now + COUNTDOWN_MS;
    const state: BBState = {
      config,
      pods: players.map((p, i) => ({
        ...p,
        ...spawnPoint(i, players.length),
        vx: 0,
        vy: 0,
        inputX: 0,
        inputY: 0,
        boostQueued: false,
        boostReadyAt: 0,
        connected: true,
        left: false,
        outUntil: null,
        ghostUntil: 0,
        lastHitBy: null,
        knockouts: 0,
        falls: 0,
        turboUntil: 0,
        heavyUntil: 0,
        shieldUntil: 0,
      })),
      powerups: [],
      hazards: [],
      nextPowerupAt: playAt + 4000,
      nextHazardAt: playAt + 9000,
      powerupSeq: 0,
      startedAt: ctx.now,
      playAt,
      endsAt: playAt + config.durationSeconds * 1000,
      lastTickAt: ctx.now,
      arenaRadius: ARENA_RADIUS,
      status: "countdown",
      endReason: null,
      endedAt: null,
      tick: 0,
    };
    return ok(state, []);
  },

  handleAction(s, playerId, action): EngineResult<BBState> {
    if (s.status === "finished") return fail("GAME_NOT_ACTIVE", "The match is over");
    const p = s.pods.find((x) => x.id === playerId);
    if (!p || p.left) return fail("NOT_IN_ROOM", "You're not in this match");
    // Inputs only steer; the next tick applies them. No broadcast needed.
    p.inputX = action.x;
    p.inputY = action.y;
    if (action.boost) p.boostQueued = true;
    return { ok: true, state: s, stateChanged: false, messages: [] };
  },

  tick(s, ctx) {
    if (s.status === "finished") return ok(s, [], false);
    // Catch up if the timer fired late, but never simulate more than a few steps at once.
    let events: BBEvent[] = [];
    let steps = 0;
    const over = () => s.status === "finished"; // step() changes status; read it fresh each loop
    while (s.lastTickAt + TICK_MS <= ctx.now && steps < 4 && !over()) {
      events = events.concat(step(s, s.lastTickAt + TICK_MS, ctx.rng));
      steps++;
    }
    if (steps === 0) return ok(s, [], false);
    if (s.lastTickAt + TICK_MS * 4 < ctx.now) s.lastTickAt = ctx.now; // drop backlog after a long stall
    return ok(s, events);
  },

  nextDeadline: (s) => (s.status === "finished" ? null : s.lastTickAt + TICK_MS),

  viewFor(s): BBView {
    const now = s.lastTickAt;
    return {
      status: s.status,
      tick: s.tick,
      serverTime: now,
      playAt: s.playAt,
      endsAt: s.endsAt,
      arenaRadius: s.arenaRadius,
      pods: s.pods.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        x: r1(p.x),
        y: r1(p.y),
        vx: r1(p.vx),
        vy: r1(p.vy),
        out: p.outUntil !== null,
        ghost: p.ghostUntil > now,
        connected: p.connected,
        left: p.left,
        knockouts: p.knockouts,
        falls: p.falls,
        turbo: p.turboUntil > now,
        heavy: p.heavyUntil > now,
        shield: p.shieldUntil > now,
        boostReadyAt: p.boostReadyAt,
      })),
      powerups: s.powerups,
      hazards: s.hazards,
      bumpers: BUMPERS,
      config: s.config,
    };
  },

  syncMessages() {
    return [];
  },

  setConnected(s, playerId, connected) {
    const p = s.pods.find((x) => x.id === playerId);
    if (p) {
      p.connected = connected;
      p.inputX = 0;
      p.inputY = 0;
    }
    return ok(s, [], false);
  },

  removePlayer(s, playerId, ctx) {
    const p = s.pods.find((x) => x.id === playerId);
    if (!p || p.left || s.status === "finished") return ok(s, [], false);
    p.left = true;
    if (s.pods.filter((x) => !x.left).length < 2) {
      s.status = "finished";
      s.endReason = "players-left";
      s.endedAt = ctx.now;
    }
    return ok(s, []);
  },

  isFinished: (s) => s.status === "finished",

  results(s): MatchResults {
    const score = (p: Pod) => Math.max(0, p.knockouts * 100 - p.falls * 25);
    const ranked = [...s.pods].sort(
      (a, b) => Number(a.left) - Number(b.left) || score(b) - score(a) || b.knockouts - a.knockouts || a.falls - b.falls,
    );
    const top = ranked[0];
    const winners = new Set(
      ranked.filter((p) => !p.left && top && score(p) === score(top) && p.knockouts === top.knockouts && p.falls === top.falls).map((p) => p.id),
    );
    return {
      gameId: "bumper-blitz",
      endedAt: s.endedAt ?? Date.now(),
      reason: s.endReason ?? "aborted",
      entries: ranked.map((p, i) => ({
        playerId: p.id,
        name: p.name,
        color: p.color,
        placement: winners.has(p.id) ? 1 : i + 1,
        score: score(p),
        isWinner: winners.has(p.id),
        details: { knockouts: p.knockouts, falls: p.falls },
      })),
    };
  },
};
