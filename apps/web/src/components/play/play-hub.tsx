"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Globe2, Lock, Radar, X } from "lucide-react";
import { getGame, type MatchStatusPayload, type MultiplayerGameId, type RoomVisibility } from "@platform/shared";
import { GameArt } from "../brand";
import { JoinCodeForm } from "../games/join-code-form";
import { GAME_THEME } from "../game-theme";
import { Button, cn, Spinner } from "../ui/primitives";
import { useToast } from "../ui/toast";
import { ConnectionBadge } from "./connection-badge";
import { realtime } from "@/lib/realtime/connection";
import { useConnectionStatus } from "@/lib/realtime/use-room";

function useConnected() {
  const status = useConnectionStatus();
  useEffect(() => realtime.connect(), []);
  return status;
}

export function PlayHub({ gameId }: { gameId: MultiplayerGameId }) {
  const game = getGame(gameId);
  const router = useRouter();
  const toast = useToast();
  const status = useConnected();
  const [busy, setBusy] = useState<RoomVisibility | null>(null);
  const [match, setMatch] = useState<MatchStatusPayload>({ state: "idle" });
  const [now, setNow] = useState(Date.now());

  useEffect(
    () =>
      realtime.on("match:status", (env) => {
        const p = env.payload as MatchStatusPayload;
        setMatch(p);
        if (p.state === "matched" && p.roomCode) router.push(`/room/${p.roomCode}`);
      }),
    [router],
  );
  useEffect(() => {
    if (match.state !== "searching") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [match.state]);
  // Leaving the page cancels an active search.
  useEffect(() => () => void realtime.emit("match:cancel"), []);

  const connected = status === "connected";

  async function createRoom(visibility: RoomVisibility) {
    setBusy(visibility);
    const ack = await realtime.emit<{ code: string }>("room:create", { gameId, visibility });
    setBusy(null);
    if (!ack.ok) return toast(ack.error.message, "error");
    router.push(`/room/${ack.data!.code}`);
  }

  async function quickMatch() {
    const ack = await realtime.emit<{ roomCode?: string }>("match:queue", { gameId });
    if (!ack.ok) return toast(ack.error.message, "error");
    if (ack.data?.roomCode) router.push(`/room/${ack.data.roomCode}`);
    else setMatch({ state: "searching", gameId, since: Date.now(), queued: 1 });
  }

  const theme = GAME_THEME[gameId];
  const searching = match.state === "searching";
  const waited = Math.max(0, Math.round((now - (match.since ?? now)) / 1000));
  return (
    <div style={{ "--accent": theme.accent } as React.CSSProperties}>
      <section className="relative overflow-hidden border-b-[3px]" style={{ background: theme.deep, borderColor: theme.accent, color: theme.ink }}>
        <div className="pointer-events-none absolute inset-0 opacity-25" aria-hidden>
          <GameArt gameId={gameId} className="size-full scale-125 blur-2xl" />
        </div>
        <div className="relative mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8 sm:flex-row sm:items-center sm:px-6">
          <div className="w-full max-w-xs shrink-0 overflow-hidden rounded-2xl border-[3px] shadow-[0_20px_40px_-20px_rgb(0_0_0/0.9)] sm:w-60" style={{ borderColor: theme.accent }}>
            <GameArt gameId={gameId} className="block aspect-[16/10] w-full" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-black tracking-[0.25em] uppercase opacity-70">
              {game.minPlayers}–{game.maxPlayers} players
            </p>
            <h1 className="font-display text-4xl font-black tracking-tight sm:text-5xl">{game.name}</h1>
            <p className="mt-1 opacity-80">{game.tagline}</p>
          </div>
          <ConnectionBadge status={status} />
        </div>
      </section>

      <div className="mx-auto grid max-w-5xl gap-5 px-4 py-8 sm:px-6 md:grid-cols-2">
        <div className="flex flex-col rounded-[24px] border-2 border-line bg-surface p-6">
          <span className="grid size-12 place-items-center rounded-2xl border-2 border-[#17142b] text-[#17142b] shadow-[0_3px_0_#17142b]" style={{ background: theme.accent }}>
            <Lock className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 font-display text-2xl font-black">Play with friends</h2>
          <p className="mt-1 text-sm text-ink-muted">Open a private table and send the link. Only people with the link or code can sit down.</p>
          <Button className="mt-5" size="lg" onClick={() => createRoom("private")} loading={busy === "private"} disabled={!connected}>
            Create private room
          </Button>
          <div className="mt-5 border-t-2 border-dashed border-line pt-5">
            <p className="mb-2 text-sm font-bold">Have a code?</p>
            <JoinCodeForm compact />
          </div>
        </div>

        <div className="relative flex flex-col overflow-hidden rounded-[24px] border-2 border-line bg-surface p-6">
          <span className="grid size-12 place-items-center rounded-2xl border-2 border-[#17142b] bg-[#ff4f8b] text-[#17142b] shadow-[0_3px_0_#17142b]">
            <Globe2 className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 font-display text-2xl font-black">Play with anyone</h2>
          <p className="mt-1 text-sm text-ink-muted">Quick match finds other players. Public games start automatically once everyone is ready.</p>
          {searching ? (
            <div className="mt-5 flex items-center gap-4 rounded-2xl border-2 p-4" style={{ borderColor: theme.accent }} role="status" aria-live="polite">
              <span className="relative grid size-16 shrink-0 place-items-center" aria-hidden>
                {[0, 1, 2].map((k) => (
                  <span key={k} className="hub-radar absolute inset-0 rounded-full border-2" style={{ borderColor: theme.accent, animationDelay: `${k * 0.6}s` }} />
                ))}
                <span className="grid size-9 place-items-center rounded-full text-[#17142b]" style={{ background: theme.accent }}>
                  <Radar className="size-5" />
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-black">Finding players…</p>
                <div className="mt-1 flex items-center gap-1" aria-label={`${match.queued ?? 1} in queue`}>
                  {Array.from({ length: game.maxPlayers }, (_, k) => (
                    <span key={k} className={cn("size-3 rounded-full border-2 transition", k < (match.queued ?? 1) ? "scale-110" : "opacity-40")} style={{ borderColor: theme.accent, background: k < (match.queued ?? 1) ? theme.accent : "transparent" }} />
                  ))}
                  <span className="ml-2 text-sm text-ink-muted tabular-nums">
                    {match.queued ?? 1} in queue · {waited}s
                  </span>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => realtime.emit("match:cancel").then(() => setMatch({ state: "idle" }))} icon={<X className="size-4" />}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button className="mt-5" size="lg" variant="secondary" onClick={quickMatch} disabled={!connected}>
              Quick match
            </Button>
          )}
          <Button className="mt-3" variant="ghost" onClick={() => createRoom("public")} loading={busy === "public"} disabled={!connected || searching}>
            Or host a public room
          </Button>
        </div>
      </div>
      {!connected && status !== "unauthorized" && (
        <div className="mb-8 flex justify-center">
          <Spinner label="Connecting to the game server" />
        </div>
      )}
    </div>
  );
}
