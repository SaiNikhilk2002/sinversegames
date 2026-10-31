"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Ack, GameStatePayload, MatchResults, ProtocolError, RoomSnapshot, ServerEnvelope, ServerEventName } from "@platform/shared";
import { realtime, type ConnectionStatus } from "./connection";

export interface RoomClientState {
  phase: "joining" | "joined" | "error" | "closed" | "replaced";
  error: ProtocolError | null;
  room: RoomSnapshot | null;
  game: GameStatePayload | null;
  results: MatchResults | null;
  closedReason: string | null;
}

const SEQ_ONLY_EVENTS: ServerEventName[] = [
  "room:notice",
  "game:action",
  "game:reconnected",
  "doodle:word-options",
  "doodle:stroke",
  "doodle:undo",
  "doodle:clear",
  "doodle:canvas",
  "doodle:guess",
  "doodle:hint",
  "doodle:round-ended",
];

const initial: RoomClientState ={ phase: "joining", error: null, room: null, game: null, results: null, closedReason: null };

export function useConnectionStatus(): ConnectionStatus {
  return useSyncExternalStore(
    (cb) => realtime.onStatus(cb),
    () => realtime.status,
    () => "idle" as ConnectionStatus,
  );
}

/**
 * Joins a room over the shared realtime connection and keeps its state in sync.
 * Rejoins automatically after reconnects; requests a full resync if it detects
 * a gap in the per-connection sequence numbers.
 */
export function useRoom(code: string, enabled: boolean) {
  const [state, setState] = useState<RoomClientState>(initial);
  const lastSeq = useRef(0);
  const status = useConnectionStatus();

  useEffect(() => {
    if (!enabled) return;
    realtime.connect();
    const offs: (() => void)[] = [];

    const track = (env: ServerEnvelope) => {
      if (env.roomId !== code || env.seq === 0) return;
      if (lastSeq.current > 0 && env.seq > lastSeq.current + 1) void realtime.emit("room:sync");
      lastSeq.current = Math.max(lastSeq.current, env.seq);
    };
    const handle = (event: ServerEventName, fn: (env: ServerEnvelope<any>) => void) =>
      offs.push(
        realtime.on(event, (env) => {
          if (env.roomId !== code) return;
          track(env);
          fn(env);
        }),
      );

    handle("room:state", (env) => setState((s) => ({ ...s, phase: s.phase === "joining" ? "joined" : s.phase, room: env.payload as RoomSnapshot })));
    handle("game:state", (env) =>
      setState((s) => {
        const next = env.payload as GameStatePayload;
        // Never let an older state overwrite a newer one.
        if (s.game && next.version < s.game.version && s.room?.status === "playing") return s;
        return { ...s, game: next };
      }),
    );
    handle("game:ended", (env) => setState((s) => ({ ...s, results: env.payload as MatchResults })));
    handle("room:closed", (env) => setState((s) => ({ ...s, phase: "closed", closedReason: (env.payload as { reason: string }).reason })));
    handle("session:replaced", () => setState((s) => ({ ...s, phase: "replaced" })));
    // Every other room-scoped event still counts towards sequence tracking.
    for (const event of SEQ_ONLY_EVENTS) handle(event, () => {});

    offs.push(
      realtime.onConnect(() => {
        lastSeq.current = 0;
        void realtime.emit<{ code: string }>("room:join", { code }).then((ack) => {
          if (!ack.ok) setState((s) => ({ ...s, phase: "error", error: ack.error }));
        });
      }),
    );
    return () => offs.forEach((off) => off());
  }, [code, enabled]);

  // A new match clears the previous results.
  useEffect(() => {
    if (state.room?.status === "playing" && state.results) setState((s) => ({ ...s, results: null }));
  }, [state.room?.status, state.results]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const send = useCallback(
    <T = unknown>(event: string, payload: unknown = {}, versioned = false): Promise<Ack<T>> =>
      realtime.emit<T>(event, payload, { roomId: code, v: versioned ? stateRef.current.game?.version : undefined }),
    [code],
  );

  const retry = useCallback(() => {
    setState(initial);
    lastSeq.current = 0;
    void realtime.emit("room:join", { code }).then((ack) => {
      if (!ack.ok) setState((s) => ({ ...s, phase: "error", error: ack.error }));
    });
  }, [code]);

  return { state, status, send, retry };
}

/** Subscribe to a room-scoped realtime event without re-rendering (e.g. drawing strokes). */
export function useRoomEvent<P>(code: string, event: ServerEventName, handler: (payload: P, env: ServerEnvelope<P>) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(
    () =>
      realtime.on(event, (env) => {
        if (env.roomId === code) ref.current(env.payload as P, env as ServerEnvelope<P>);
      }),
    [code, event],
  );
}
