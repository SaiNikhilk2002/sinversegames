"use client";

import { getSettings } from "./settings";

/**
 * Tiny synthesized sound effects (WebAudio, no audio files). Audio is only
 * produced in response to game events after the player has interacted with
 * the page, and never when sound is switched off in settings.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // Browsers keep the context suspended until a user gesture; until then we stay silent.
  if (ctx.state !== "running") {
    void ctx.resume().catch(() => {});
    return null;
  }
  return ctx;
}

type Note = [freq: number, at: number, dur: number];

function play(notes: Note[], type: OscillatorType = "sine", gainScale = 1) {
  const s = getSettings();
  if (!s.sound || s.volume <= 0) return;
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime;
  for (const [freq, at, dur] of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const peak = 0.12 * s.volume * gainScale;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + dur + 0.02);
  }
}

export const sfx = {
  yourTurn: () => play([[660, 0, 0.12], [880, 0.1, 0.18]], "triangle"),
  card: () => play([[320, 0, 0.06]], "square", 0.4),
  draw: () => play([[220, 0, 0.08], [180, 0.05, 0.08]], "triangle", 0.6),
  correct: () => play([[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.24]], "triangle"),
  tick: () => play([[1200, 0, 0.03]], "square", 0.25),
  win: () => play([[523, 0, 0.15], [659, 0.15, 0.15], [784, 0.3, 0.15], [1046, 0.45, 0.35]], "triangle"),
  join: () => play([[440, 0, 0.08], [554, 0.07, 0.1]], "sine", 0.7),
  pop: () => play([[520, 0, 0.05], [780, 0.04, 0.06]], "sine", 0.5),
  chop: () => play([[180, 0, 0.04]], "square", 0.35),
  serve: () => play([[660, 0, 0.08], [990, 0.08, 0.14]], "triangle", 0.8),
  burn: () => play([[140, 0, 0.2], [110, 0.12, 0.25]], "sawtooth", 0.35),
  error: () => play([[200, 0, 0.1], [150, 0.08, 0.12]], "square", 0.3),
  bump: () => play([[120, 0, 0.07]], "triangle", 0.8),
  dice: () => play([[300, 0, 0.03], [420, 0.05, 0.03], [360, 0.1, 0.03], [520, 0.15, 0.05]], "square", 0.3),
  match: () => play([[740, 0, 0.06], [988, 0.05, 0.1]], "sine", 0.6),
};

/** Call from a click/keypress handler so later sounds are allowed to play. */
export function unlockAudio() {
  const ac = audio() ?? ctx;
  void ac?.resume().catch(() => {});
}
