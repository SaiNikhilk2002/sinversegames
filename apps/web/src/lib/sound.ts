"use client";

import { getSettings, subscribeSettings } from "./settings";

/**
 * Synthesized audio (WebAudio, no audio files, so every sound is original).
 *
 *   master ─┬─ effects bus  (one-shot sounds and ambient loops)
 *           └─ music bus    (the background music sequencer)
 *
 * The two buses follow the "Effects volume" and "Music volume" settings.
 * Nothing makes a sound until the player has interacted with the page:
 * browsers keep the context suspended until a gesture, and we stay silent
 * until then.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let fxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function applyVolumes() {
  if (!ctx || !fxBus || !musicBus) return;
  const s = getSettings();
  const t = ctx.currentTime;
  fxBus.gain.setTargetAtTime(s.sound ? s.volume : 0, t, 0.05);
  musicBus.gain.setTargetAtTime(s.sound && s.music ? s.musicVolume * 0.55 : 0, t, 0.08);
}

function graph(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    fxBus = ctx.createGain();
    musicBus = ctx.createGain();
    fxBus.connect(master);
    musicBus.connect(master);
    applyVolumes();
    subscribeSettings(applyVolumes);
  }
  return ctx;
}

/** The running context, or null while it is still locked (before a gesture). */
function audio(): AudioContext | null {
  const ac = graph();
  if (!ac) return null;
  if (ac.state !== "running") {
    void ac.resume().catch(() => {});
    return null;
  }
  return ac;
}

function noise(ac: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

const effectsOn = () => {
  const s = getSettings();
  return s.sound && s.volume > 0;
};

// ---------------------------------------------------------------------------
// One-shot building blocks
// ---------------------------------------------------------------------------

type Note = [freq: number, at: number, dur: number];

function tone(notes: Note[], type: OscillatorType = "sine", gainScale = 1, bus = fxBus) {
  if (!effectsOn()) return;
  const ac = audio();
  if (!ac || !bus) return;
  const t0 = ac.currentTime;
  for (const [freq, at, dur] of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const peak = 0.14 * gainScale;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    osc.connect(gain).connect(bus);
    osc.start(t0 + at);
    osc.stop(t0 + at + dur + 0.02);
  }
}

/** A filtered noise burst: sizzles, chops, splashes, card slides, thuds. */
function burst(opts: { at?: number; dur: number; filter: BiquadFilterType; freq: number; q?: number; gain: number; sweepTo?: number; attack?: number }) {
  if (!effectsOn()) return;
  const ac = audio();
  if (!ac || !fxBus) return;
  const t0 = ac.currentTime + (opts.at ?? 0);
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ac.createBiquadFilter();
  f.type = opts.filter;
  f.frequency.setValueAtTime(opts.freq, t0);
  if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t0 + opts.dur);
  f.Q.value = opts.q ?? 1;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain, t0 + (opts.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  src.connect(f).connect(g).connect(fxBus);
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + opts.dur + 0.05);
}

/** A bell-like partial stack (counter bell, perfect-cook ding, stars). */
function bell(freq: number, at = 0, gainScale = 1, dur = 0.9) {
  tone([[freq, at, dur], [freq * 2.76, at, dur * 0.4], [freq * 5.4, at, dur * 0.2]], "sine", 0.7 * gainScale);
}

export const sfx = {
  // Shared across games.
  yourTurn: () => tone([[660, 0, 0.12], [880, 0.1, 0.18]], "triangle"),
  card: () => {
    burst({ dur: 0.07, filter: "bandpass", freq: 2600, q: 0.8, gain: 0.25, sweepTo: 1200 });
    tone([[320, 0, 0.05]], "triangle", 0.25);
  },
  draw: () => burst({ dur: 0.12, filter: "bandpass", freq: 1800, q: 0.7, gain: 0.2, sweepTo: 3200 }),
  correct: () => tone([[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.24]], "triangle"),
  tick: () => tone([[1200, 0, 0.03]], "square", 0.2),
  win: () => tone([[523, 0, 0.15], [659, 0.15, 0.15], [784, 0.3, 0.15], [1046, 0.45, 0.35]], "triangle"),
  join: () => tone([[440, 0, 0.08], [554, 0.07, 0.1]], "sine", 0.7),
  pop: () => tone([[520, 0, 0.05], [780, 0.04, 0.06]], "sine", 0.5),
  chop: () => {
    burst({ dur: 0.05, filter: "highpass", freq: 1800, gain: 0.35 });
    tone([[150, 0, 0.06]], "triangle", 0.6);
  },
  serve: () => tone([[660, 0, 0.08], [990, 0.08, 0.14]], "triangle", 0.8),
  burn: () => tone([[140, 0, 0.2], [110, 0.12, 0.25]], "sawtooth", 0.3),
  error: () => tone([[200, 0, 0.1], [150, 0.08, 0.12]], "square", 0.25),
  bump: () => tone([[120, 0, 0.07]], "triangle", 0.8),
  dice: () => tone([[300, 0, 0.03], [420, 0.05, 0.03], [360, 0.1, 0.03], [520, 0.15, 0.05]], "square", 0.3),
  match: () => tone([[740, 0, 0.06], [988, 0.05, 0.1]], "sine", 0.6),

  // Kitchen.
  pickup: () => burst({ dur: 0.08, filter: "bandpass", freq: 900, q: 1.2, gain: 0.22, sweepTo: 1600 }),
  plateClink: () => {
    tone([[2350, 0, 0.18], [3120, 0.005, 0.12]], "sine", 0.35);
    burst({ dur: 0.04, filter: "highpass", freq: 4000, gain: 0.12 });
  },
  sizzleHit: () => burst({ dur: 0.9, filter: "highpass", freq: 3200, gain: 0.32, attack: 0.01 }),
  splash: () => {
    burst({ dur: 0.35, filter: "lowpass", freq: 1400, gain: 0.35, sweepTo: 400 });
    burst({ at: 0.05, dur: 0.6, filter: "highpass", freq: 2800, gain: 0.18 });
  },
  plop: () => tone([[420, 0, 0.12]], "sine", 0.5),
  flip: () => {
    burst({ dur: 0.14, filter: "bandpass", freq: 700, q: 0.8, gain: 0.25, sweepTo: 2000 });
    burst({ at: 0.13, dur: 0.4, filter: "highpass", freq: 3000, gain: 0.25 });
  },
  knife: () => {
    burst({ dur: 0.035, filter: "highpass", freq: 2500, gain: 0.3 });
    tone([[110, 0, 0.05]], "triangle", 0.55);
  },
  ding: () => bell(1568, 0, 0.6, 0.7),
  warn: () => tone([[880, 0, 0.07], [880, 0.14, 0.07]], "square", 0.12),
  trash: () => {
    burst({ dur: 0.18, filter: "lowpass", freq: 500, gain: 0.45 });
    tone([[90, 0, 0.12]], "triangle", 0.6);
  },
  doorChime: () => {
    bell(1318, 0, 0.45, 0.8);
    bell(1046, 0.16, 0.45, 1.0);
  },
  counterBell: () => bell(2093, 0, 0.8, 1.1),
  coins: () => {
    for (let i = 0; i < 5; i++) tone([[1900 + i * 180, i * 0.045, 0.09]], "triangle", 0.25);
  },
  happy: () => tone([[587, 0, 0.09], [784, 0.08, 0.09], [988, 0.16, 0.16]], "sine", 0.45),
  grumble: () => tone([[160, 0, 0.18], [130, 0.14, 0.22]], "sawtooth", 0.18),
  star: (i: number) => bell(880 * Math.pow(1.26, i), 0, 0.7, 0.9),
  fanfare: () => tone([[523, 0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.14], [1046, 0.38, 0.5], [784, 0.38, 0.5]], "triangle", 0.8),
  // Garden.
  stoneTap: () => {
    burst({ dur: 0.04, filter: "bandpass", freq: 2800, q: 2.2, gain: 0.3 });
    tone([[1100 + Math.random() * 120, 0, 0.05]], "sine", 0.25);
  },
  /** A pentatonic chime that climbs with the combo count. */
  gardenChime: (step: number) => {
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
    bell(scale[Math.min(step, scale.length - 1)]!, 0, 0.55, 1.2);
  },
  gardenFanfare: () => [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => bell(f, i * 0.12, 0.6, 1.4)),

  // Cards.
  flipCard: () => burst({ dur: 0.06, filter: "bandpass", freq: 3200, q: 1.2, gain: 0.22, sweepTo: 1800 }),
  cardPlace: () => {
    burst({ dur: 0.05, filter: "lowpass", freq: 1600, gain: 0.3 });
    burst({ at: 0.01, dur: 0.08, filter: "bandpass", freq: 2400, q: 0.8, gain: 0.12 });
  },
  foundation: (rank: number) => tone([[523 * Math.pow(2, (rank - 1) / 12), 0, 0.18], [784 * Math.pow(2, (rank - 1) / 12), 0.04, 0.22]], "sine", 0.4),
  shuffle: () => {
    for (let i = 0; i < 14; i++) burst({ at: i * 0.035, dur: 0.04, filter: "bandpass", freq: 2600 + Math.random() * 800, q: 1, gain: 0.12 });
  },
  pickupCard: () => burst({ dur: 0.05, filter: "highpass", freq: 3000, gain: 0.12 }),

  // Tabletop.
  clack: () => {
    burst({ dur: 0.05, filter: "bandpass", freq: 1900, q: 3, gain: 0.35 });
    tone([[620 + Math.random() * 80, 0, 0.05]], "triangle", 0.35);
  },
  diceRattle: () => {
    for (let i = 0; i < 6; i++) burst({ at: i * 0.07 + Math.random() * 0.03, dur: 0.04, filter: "bandpass", freq: 2200 + Math.random() * 900, q: 2.5, gain: 0.3 - i * 0.03 });
  },
  knock: () => {
    burst({ dur: 0.12, filter: "lowpass", freq: 900, gain: 0.5, sweepTo: 200 });
    tone([[180, 0, 0.1], [120, 0.05, 0.16]], "square", 0.35);
  },
  homeChime: () => {
    bell(1046, 0, 0.6, 0.8);
    bell(1318, 0.12, 0.6, 0.8);
    bell(1568, 0.24, 0.6, 1.1);
  },

  // Arena.
  impact: (strength: number) => {
    const k = Math.max(0.25, Math.min(1, strength));
    burst({ dur: 0.18 + k * 0.12, filter: "lowpass", freq: 700 + k * 900, gain: 0.25 + k * 0.35, sweepTo: 180 });
    tone([[90 + k * 40, 0, 0.14]], "triangle", 0.5 + k * 0.4);
  },
  whoosh: () => burst({ dur: 0.35, filter: "bandpass", freq: 600, q: 0.7, gain: 0.3, sweepTo: 3200, attack: 0.06 }),
  fall: () => {
    const ac = audio();
    if (!ac || !fxBus || !effectsOn()) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(1400, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(220, ac.currentTime + 0.7);
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.1, ac.currentTime + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.75);
    o.connect(g).connect(fxBus);
    o.start();
    o.stop(ac.currentTime + 0.8);
  },
  cheer: () => {
    burst({ dur: 1.1, filter: "bandpass", freq: 1500, q: 0.4, gain: 0.22, attack: 0.15 });
    burst({ at: 0.05, dur: 0.9, filter: "bandpass", freq: 2600, q: 0.6, gain: 0.12, attack: 0.2 });
  },
  beep: () => tone([[880, 0, 0.12]], "square", 0.25),
  go: () => tone([[523, 0, 0.35], [659, 0, 0.35], [784, 0, 0.45]], "sawtooth", 0.3),
  powerup: () => tone([[880, 0, 0.07], [1320, 0.06, 0.07], [1760, 0.12, 0.14]], "triangle", 0.45),
  defeat: () => tone([[392, 0, 0.22], [370, 0.2, 0.22], [349, 0.4, 0.22], [311, 0.62, 0.6]], "triangle", 0.45),
  countTick: () => tone([[1400 + Math.random() * 200, 0, 0.025]], "sine", 0.12),
  streak: () => tone([[784, 0, 0.08], [988, 0.07, 0.08], [1175, 0.14, 0.08], [1568, 0.21, 0.25]], "triangle", 0.55),
};

/** True once the browser has let audio start (after the first interaction). */
export const audioReady = () => ctx?.state === "running";

/** Call from a click/keypress handler so later sounds are allowed to play. */
export function unlockAudio() {
  const ac = graph();
  void ac?.resume().catch(() => {});
}

// ---------------------------------------------------------------------------
// Loops: continuous sounds whose loudness follows the game (sizzling, frying)
// ---------------------------------------------------------------------------

export interface Loop {
  /** 0 silences the loop; values above 1 are clamped. */
  set(level: number): void;
  stop(): void;
}

type LoopKind = "sizzle" | "fry" | "simmer" | "room" | "wind";

const LOOP_GAIN: Record<LoopKind, number> = { sizzle: 0.18, fry: 0.14, simmer: 0.1, room: 0.05, wind: 0.06 };

/**
 * Creates a looping noise texture on the effects bus. Silent (and cheap)
 * until the context is unlocked; it attaches itself on the first `set` after.
 */
export function createLoop(kind: LoopKind): Loop {
  let gain: GainNode | null = null;
  let nodes: AudioScheduledSourceNode[] = [];
  let level = 0;
  const build = (ac: AudioContext) => {
    gain = ac.createGain();
    gain.gain.value = 0;
    gain.connect(fxBus!);
    const src = ac.createBufferSource();
    src.buffer = noise(ac);
    src.loop = true;
    const f = ac.createBiquadFilter();
    if (kind === "sizzle") {
      f.type = "highpass";
      f.frequency.value = 3500;
    } else if (kind === "fry") {
      f.type = "bandpass";
      f.frequency.value = 2200;
      f.Q.value = 0.6;
    } else if (kind === "simmer") {
      f.type = "lowpass";
      f.frequency.value = 600;
    } else if (kind === "wind") {
      f.type = "lowpass";
      f.frequency.value = 380;
    } else {
      f.type = "bandpass";
      f.frequency.value = 450;
      f.Q.value = 0.5;
    }
    // Crackle: a fast random-ish tremolo makes noise read as oil and fat rather than hiss.
    const trem = ac.createGain();
    const smooth = kind === "room" || kind === "wind";
    trem.gain.value = smooth ? 0.8 : 0.55;
    const lfo = ac.createOscillator();
    lfo.type = smooth ? "sine" : "square";
    lfo.frequency.value = kind === "sizzle" ? 23 : kind === "fry" ? 11 : kind === "simmer" ? 4 : kind === "wind" ? 0.09 : 0.15;
    const depth = ac.createGain();
    depth.gain.value = kind === "wind" ? 0.55 : kind === "room" ? 0.2 : 0.45;
    lfo.connect(depth).connect(trem.gain);
    src.connect(f).connect(trem).connect(gain);
    src.start(0, Math.random() * 1.5);
    lfo.start();
    nodes = [src, lfo];
  };
  return {
    set(next) {
      level = Math.max(0, Math.min(1, next));
      const ac = audio();
      if (!ac) return;
      if (!gain && level > 0) build(ac);
      gain?.gain.setTargetAtTime(level * LOOP_GAIN[kind], ac.currentTime, 0.12);
    },
    stop() {
      level = 0;
      const ac = ctx;
      if (gain && ac) gain.gain.setTargetAtTime(0, ac.currentTime, 0.05);
      const dying = nodes;
      nodes = [];
      setTimeout(() => dying.forEach((n) => n.stop()), 300);
      gain = null;
    },
  };
}

// ---------------------------------------------------------------------------
// Music: a small step sequencer playing original loops on the music bus
// ---------------------------------------------------------------------------

export interface Song {
  bpm: number;
  /** Bass notes per 8th-note step (Hz, 0 = rest); its length is the loop length. */
  bass: number[];
  /** One chord (Hz) per bar of 8 steps. */
  chords: number[][];
  /** Melody per 8th step (Hz, 0 = rest). */
  lead: number[];
  /** Hats per 8th step: 0 none, 1 closed, 2 accented. */
  hats: number[];
  swing?: number;
}

let musicTimer: ReturnType<typeof setInterval> | null = null;

/** Starts (or switches to) a looping song. Quiet if music is off; obeys the music volume live. */
export function playMusic(song: Song) {
  stopMusic();
  const ac = audio();
  if (!ac || !musicBus) return;
  const bus = musicBus;
  const stepDur = 60 / song.bpm / 2;
  let step = 0;
  let next = ac.currentTime + 0.1;
  const voice = (freq: number, at: number, dur: number, type: OscillatorType, peak: number, cutoff?: number) => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    if (cutoff) {
      const f = ac.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = cutoff;
      o.connect(f).connect(g);
    } else o.connect(g);
    g.connect(bus);
    o.start(at);
    o.stop(at + dur + 0.05);
  };
  const hat = (at: number, accent: boolean) => {
    const src = ac.createBufferSource();
    src.buffer = noise(ac);
    const f = ac.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7000;
    const g = ac.createGain();
    g.gain.setValueAtTime(accent ? 0.05 : 0.025, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + (accent ? 0.12 : 0.05));
    src.connect(f).connect(g).connect(bus);
    src.start(at, Math.random());
    src.stop(at + 0.15);
  };
  const schedule = () => {
    while (next < ac.currentTime + 0.25) {
      const i = step % song.bass.length;
      const at = next + (step % 2 ? (song.swing ?? 0) * stepDur : 0);
      if (song.bass[i]) voice(song.bass[i]!, at, stepDur * 1.7, "triangle", 0.22, 700);
      if (step % 8 === 0) {
        const chord = song.chords[Math.floor(step / 8) % song.chords.length]!;
        chord.forEach((f, k) => voice(f, at + k * 0.012, stepDur * 6, "sine", 0.045));
        chord.forEach((f) => voice(f * 2, at, stepDur * 2, "triangle", 0.012));
      }
      const lead = song.lead[step % song.lead.length];
      if (lead) voice(lead, at, stepDur * 1.4, "triangle", 0.05, 2600);
      const h = song.hats[step % song.hats.length];
      if (h) hat(at, h === 2);
      next += stepDur;
      step++;
    }
  };
  schedule();
  musicTimer = setInterval(schedule, 100);
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

/** An electric-motor hum on the effects bus; `set(level, speed)` with both in 0–1. */
export function createMotor() {
  let nodes: { osc: OscillatorNode; sub: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  return {
    set(level: number, speed: number) {
      const ac = audio();
      if (!ac || !fxBus) return;
      if (!nodes && level > 0) {
        const osc = ac.createOscillator();
        osc.type = "sawtooth";
        const sub = ac.createOscillator();
        sub.type = "square";
        const filter = ac.createBiquadFilter();
        filter.type = "lowpass";
        filter.Q.value = 4;
        const gain = ac.createGain();
        gain.gain.value = 0;
        osc.connect(filter);
        sub.connect(filter);
        filter.connect(gain).connect(fxBus);
        osc.start();
        sub.start();
        nodes = { osc, sub, filter, gain };
      }
      if (!nodes) return;
      const t = ac.currentTime;
      const s = Math.max(0, Math.min(1, speed));
      nodes.osc.frequency.setTargetAtTime(70 + s * 150, t, 0.08);
      nodes.sub.frequency.setTargetAtTime(35 + s * 75, t, 0.08);
      nodes.filter.frequency.setTargetAtTime(300 + s * 1400, t, 0.08);
      nodes.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * (0.03 + s * 0.05), t, 0.1);
    },
    stop() {
      if (!nodes || !ctx) return;
      const n = nodes;
      nodes = null;
      n.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => {
        n.osc.stop();
        n.sub.stop();
      }, 300);
    },
  };
}
