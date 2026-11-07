"use client";

import { useSyncExternalStore } from "react";

/** Per-device player preferences, kept in localStorage (never sent to the server). */
export interface Settings {
  theme: "system" | "light" | "dark";
  sound: boolean;
  /** Overall level; existing installations default to full master gain. */
  masterVolume: number;
  /** Effects volume, 0–1. */
  volume: number;
  music: boolean;
  musicVolume: number;
  reducedMotion: boolean;
  /** Calmer visuals. Null means decide from the device: data saver or very low memory. */
  lowEffects: boolean | null;
}

const KEY = "platform:settings";
const DEFAULTS: Settings = { theme: "dark", sound: true, masterVolume: 1, volume: 0.6, music: true, musicVolume: 0.5, reducedMotion: false, lowEffects: null };

let current: Settings = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) current = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // storage unavailable (private mode) — keep defaults
  }
}

export function resolveLowEffects(s: Settings): boolean {
  if (s.lowEffects !== null) return s.lowEffects;
  if (typeof navigator === "undefined") return false;
  const device = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  return !!device.connection?.saveData || (device.deviceMemory !== undefined && device.deviceMemory <= 2);
}

export function applySettingsToDocument(s: Settings) {
  const root = document.documentElement;
  const dark = s.theme === "dark" || (s.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.classList.toggle("reduce-motion", s.reducedMotion);
  root.classList.toggle("low-effects", resolveLowEffects(s));
}

export function getSettings(): Settings {
  load();
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  load();
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
  applySettingsToDocument(current);
  listeners.forEach((l) => l());
}

/** Runs `fn` whenever settings change; returns an unsubscribe function. */
export function subscribeSettings(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSettings,
    () => DEFAULTS,
  );
}

/** Inline script run before paint to avoid a theme flash. Kept tiny and dependency-free. */
export const themeBootScript = `try{var s=JSON.parse(localStorage.getItem("${KEY}")||"{}");var t=s.theme||"${DEFAULTS.theme}";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);if(s.reducedMotion)document.documentElement.classList.add("reduce-motion");var l=s.lowEffects,n=navigator;if(l===undefined||l===null)l=!!(n.connection&&n.connection.saveData)||(n.deviceMemory!==undefined&&n.deviceMemory<=2);document.documentElement.classList.toggle("low-effects",!!l)}catch(e){document.documentElement.classList.add("dark")}`;
