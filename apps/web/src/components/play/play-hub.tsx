"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Globe2, Lock, Radar, X } from "lucide-react";
import { getGame, type GameId, type MatchStatusPayload, type RoomVisibility } from "@platform/shared";
import { GameArt } from "../brand";
import { JoinCodeForm } from "../games/join-code-form";
import { Button, Card, Spinner } from "../ui/primitives";
import { useToast } from "../ui/toast";
import { ConnectionBadge } from "./connection-badge";
import { realtime } from "@/lib/realtime/connection";
import { useConnectionStatus } from "@/lib/realtime/use-room";

function useConnected() {
  const status = useConnectionStatus();
  useEffect(() => realtime.connect(), []);
  return status;
}

export function PlayHub({ gameId }: { gameId: GameId }) {
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <GameArt gameId={gameId} className="h-28 w-44 shrink-0 rounded-2xl border border-line object-cover shadow-card" />
        <div className="flex-1">
          <h1 className="font-display text-4xl font-extrabold tracking-tight">{game.name}</h1>
          <p className="mt-1 text-ink-muted">{game.tagline}</p>
        </div>
        <ConnectionBadge status={status} />
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <Card className="flex flex-col p-6">
          <Lock className="size-7 text-brand-500" aria-hidden />
          <h2 className="mt-3 font-display text-xl font-bold">Play with friends</h2>
          <p className="mt-1 text-sm text-ink-muted">Create a private room and share the invite link. Only people with the link or code can join.</p>
          <Button className="mt-5" size="lg" onClick={() => createRoom("private")} loading={busy === "private"} disabled={!connected}>
            Create private room
          </Button>
          <div className="mt-5 border-t border-line pt-5">
            <p className="mb-2 text-sm font-semibold">Have a code?</p>
            <JoinCodeForm compact />
          </div>
        </Card>

        <Card className="flex flex-col p-6">
          <Globe2 className="size-7 text-hot" aria-hidden />
          <h2 className="mt-3 font-display text-xl font-bold">Play with anyone</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Find a public match with other players. Public games start automatically once everyone is ready.
          </p>
          {match.state === "searching" ? (
            <div className="mt-5 rounded-2xl border border-brand-500/30 bg-brand-500/10 p-4" role="status" aria-live="polite">
              <div className="flex items-center gap-3">
                <span className="relative flex size-10 items-center justify-center rounded-full bg-brand-500 text-white animate-pulse-ring">
                  <Radar className="size-5" />
                </span>
                <div className="flex-1">
                  <p className="font-semibold">Finding players…</p>
                  <p className="text-sm text-ink-muted">
                    {match.queued ?? 1} in queue · {Math.max(0, Math.round((now - (match.since ?? now)) / 1000))}s
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => realtime.emit("match:cancel").then(() => setMatch({ state: "idle" }))} icon={<X className="size-4" />}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button className="mt-5" size="lg" variant="secondary" onClick={quickMatch} disabled={!connected}>
              Quick match
            </Button>
          )}
          <Button className="mt-3" variant="ghost" onClick={() => createRoom("public")} loading={busy === "public"} disabled={!connected || match.state === "searching"}>
            Or host a public room
          </Button>
        </Card>
      </div>
      {!connected && status !== "unauthorized" && (
        <div className="mt-6 flex justify-center">
          <Spinner label="Connecting to the game server" />
        </div>
      )}
    </div>
  );
}
