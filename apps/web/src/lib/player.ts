"use client";

import { useEffect, useSyncExternalStore } from "react";

export interface Player {
  id: string;
  name: string;
  color: string;
  kind: "guest" | "registered";
  cosmetics?: { frame: string | null; nameplate: string | null };
}

interface PlayerState {
  player: Player | null;
  loading: boolean;
}

// Keep hydration's snapshot identical to server HTML even if the header's
// session fetch finishes before a later streamed profile component hydrates.
const serverState: PlayerState = { player: null, loading: true };
let state: PlayerState = serverState;
let fetched: Promise<void> | null = null;
const listeners = new Set<() => void>();
const set = (s: PlayerState) => {
  state = s;
  listeners.forEach((l) => l());
};

function load() {
  fetched ??= fetch("/api/session", { cache: "no-store" })
    .then((r) => r.json())
    .then((d: { player: Player | null }) => set({ player: d.player, loading: false }))
    .catch(() => set({ player: null, loading: false }));
  return fetched;
}

/** Creates the guest identity (or renames it). Server validates and sanitizes the name. */
export async function savePlayer(displayName: string, color?: string): Promise<Player> {
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName, color }),
  });
  const data = (await res.json().catch(() => ({}))) as { player?: Player; error?: string };
  if (!res.ok || !data.player) throw new Error(data.error ?? "Couldn't save your name");
  set({ player: data.player, loading: false });
  return data.player;
}

export function usePlayer(): PlayerState {
  useEffect(() => {
    void load();
  }, []);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => serverState,
  );
}

export async function reloadPlayer() {
  fetched = null;
  await load();
}
