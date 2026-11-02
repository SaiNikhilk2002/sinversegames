"use client";

import { isGameId, type GameId } from "@platform/shared";

/**
 * "Recently played" is a per-browser convenience, kept in localStorage. Reads
 * and writes are wrapped because storage can be unavailable (private windows,
 * blocked site data), in which case the feature simply stays empty.
 */
const KEY = "pw.recent";
const MAX = 8;
export const RECENT_EVENT = "pw:recent";

export function getRecentlyPlayed(): GameId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter(isGameId).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function recordRecentlyPlayed(gameId: GameId) {
  try {
    const next = [gameId, ...getRecentlyPlayed().filter((g) => g !== gameId)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(RECENT_EVENT));
  } catch {
    // Storage unavailable: nothing to remember.
  }
}

/** Per-browser key/value storage for game progress (e.g. unlocked levels). */
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}
