"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, WifiOff } from "lucide-react";
import { getGame, ROOM_CLOSE_REASONS, type RoomCloseReason, type RoomNoticePayload } from "@platform/shared";
import { GAME_CLIENTS } from "@/games/registry";
import { recordRecentlyPlayed } from "@/lib/recent";
import { usePlayer } from "@/lib/player";
import { realtime } from "@/lib/realtime/connection";
import { useRoom, useRoomEvent } from "@/lib/realtime/use-room";
import { ButtonLink, Card, Spinner, Tooltip } from "../ui/primitives";
import { useToast } from "../ui/toast";
import { ConnectionBadge } from "./connection-badge";
import { Lobby } from "./lobby";
import { ResultsPanel } from "./results-panel";

const ERROR_COPY: Record<string, { title: string; body: string }> = {
  ROOM_NOT_FOUND: { title: "Room not found", body: "This room doesn't exist or has expired. Check the code, or start a new game." },
  ROOM_FULL: { title: "This room is full", body: "Every seat is taken. Ask the host for a new room, or start your own." },
  ROOM_IN_PROGRESS: { title: "Game in progress", body: "This room is in the middle of a game. You can join once it's back in the lobby." },
};

function StatusScreen({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <Card className="p-8">
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-ink-muted">{body}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {children ?? (
            <>
              <ButtonLink href="/games">Browse games</ButtonLink>
              <ButtonLink href="/" variant="secondary">
                Home
              </ButtonLink>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

export function RoomView({ code }: { code: string }) {
  const { player } = usePlayer();
  const router = useRouter();
  const toast = useToast();
  const { state, status, send, retry } = useRoom(code, !!player);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useRoomEvent<RoomNoticePayload>(code, "room:notice", (n) => toast(n.message, n.kind === "error" ? "error" : n.kind === "warning" ? "warning" : "success"));

  // The lobby is taller than the game screen, so bring the game into view when a match starts.
  const roomStatus = state.room?.status;
  useEffect(() => {
    if (roomStatus === "playing") containerRef.current?.scrollIntoView({ block: "start" });
  }, [roomStatus]);

  const roomGame = state.room?.gameId;
  useEffect(() => {
    if (roomGame) recordRecentlyPlayed(roomGame);
  }, [roomGame]);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void containerRef.current?.requestFullscreen?.().catch(() => toast("Fullscreen isn't available on this device", "warning"));
  }, [toast]);

  const leave = useCallback(async () => {
    await realtime.emit("room:leave");
    router.push(state.room ? `/play/${getGame(state.room.gameId).slug}` : "/games");
  }, [router, state.room]);

  if (!player) return null;
  if (status === "banned") return <StatusScreen title="Account suspended" body="Your account can't join games right now. Contact support if you think this is a mistake." />;
  if (state.phase === "replaced") {
    return (
      <StatusScreen title="Opened somewhere else" body="You joined this room from another tab or device, so this one was disconnected.">
        <button type="button" onClick={retry} className="font-semibold text-brand-500 hover:underline">
          Use this tab instead
        </button>
      </StatusScreen>
    );
  }
  if (state.phase === "closed") {
    const reason = (state.closedReason ?? "expired") as RoomCloseReason;
    return <StatusScreen title="Room closed" body={ROOM_CLOSE_REASONS[reason] ?? "This room is no longer available."} />;
  }
  if (state.phase === "error" && state.error) {
    const copy = ERROR_COPY[state.error.code] ?? { title: "Couldn't join", body: state.error.message };
    return (
      <StatusScreen title={copy.title} body={copy.body}>
        <button type="button" onClick={retry} className="font-semibold text-brand-500 hover:underline">
          Try again
        </button>
        <ButtonLink href="/games" variant="secondary">
          Browse games
        </ButtonLink>
      </StatusScreen>
    );
  }
  if (!state.room) {
    return (
      <div className="flex flex-col items-center gap-4 py-24">
        <Spinner label="Joining room" />
        <p className="text-ink-muted">{status === "offline" ? "Can't reach the game server — retrying…" : "Joining room…"}</p>
      </div>
    );
  }

  const room = state.room;
  const game = getGame(room.gameId);
  const client = GAME_CLIENTS[room.gameId];
  const playing = room.status === "playing" && state.game;

  return (
    <div ref={containerRef} className="mx-auto max-w-7xl overflow-y-auto bg-bg px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href={`/games/${game.slug}`} className="font-display text-lg font-bold hover:text-brand-500">
          {game.name}
        </Link>
        <span className="font-mono text-sm text-ink-faint">#{room.code}</span>
        <div className="ml-auto flex items-center gap-2">
          <ConnectionBadge status={status} />
          <Tooltip label={fullscreen ? "Exit fullscreen" : "Fullscreen"} side="bottom">
            <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"} className="rounded-xl border border-line bg-surface p-2 text-ink-muted hover:text-ink">
              {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
          </Tooltip>
        </div>
      </div>

      {status === "reconnecting" && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-2xl border border-sun/40 bg-sun/15 px-4 py-3 text-sm font-semibold">
          <WifiOff className="size-4" /> Connection lost — reconnecting. Your seat is saved.
        </div>
      )}

      {playing ? (
        <client.Game code={code} room={room} game={state.game!} selfId={player.id} send={send} />
      ) : (
        <>
          {room.status === "finished" && (state.results ?? room.lastResults) && <ResultsPanel results={(state.results ?? room.lastResults)!} selfId={player.id} />}
          <Lobby room={room} selfId={player.id} send={send} onLeave={leave} />
        </>
      )}
    </div>
  );
}
