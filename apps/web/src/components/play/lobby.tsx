"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Check, Copy, Crown, Flag, LogOut, Share2, UserX, WifiOff } from "lucide-react";
import { brand, getGame, type Ack, type RoomSnapshot } from "@platform/shared";
import { GAME_CLIENTS } from "@/games/registry";
import { GameArt } from "../brand";
import { GAME_THEME } from "../game-theme";
import { Avatar, Badge, Button, Card, cn, Tooltip } from "../ui/primitives";
import { useToast } from "../ui/toast";
import { ReportDialog } from "./report-dialog";

export function Lobby({
  room,
  selfId,
  send,
  onLeave,
}: {
  room: RoomSnapshot;
  selfId: string;
  send: (event: string, payload?: unknown) => Promise<Ack>;
  onLeave: () => void;
}) {
  const toast = useToast();
  const game = getGame(room.gameId);
  const client = GAME_CLIENTS[room.gameId];
  const isHost = room.hostId === selfId;
  const theme = GAME_THEME[room.gameId];
  const me = room.players.find((p) => p.id === selfId);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [starting, setStarting] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null);
  const inviteUrl = `${typeof window === "undefined" ? brand.siteUrl : window.location.origin}/room/${room.code}`;
  const others = room.players.filter((p) => p.id !== room.hostId);
  const allReady = others.every((p) => p.ready && p.connected);
  const enough = room.players.length >= room.minPlayers;
  const run = async (p: Promise<Ack>) => {
    const ack = await p;
    if (!ack.ok) toast(ack.error.message, "error");
    return ack;
  };

  const copy = async (what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(what === "code" ? room.code : inviteUrl);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast("Couldn't copy — select the text and copy it manually", "warning");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-6">
        <Card className="overflow-hidden">
          <div className="relative overflow-hidden p-6" style={{ background: theme.deep, color: theme.ink }}>
            <div className="pointer-events-none absolute inset-0 opacity-30" aria-hidden>
              <GameArt gameId={room.gameId} className="size-full scale-125 blur-xl" />
            </div>
            <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: theme.accent }} aria-hidden />
            <p className="relative text-xs font-black tracking-[0.25em] uppercase opacity-75">{room.visibility === "public" ? "Public room" : "Private room"} · {game.name}</p>
            <div className="relative mt-2 flex flex-wrap items-center gap-4">
              <p className="font-mono text-4xl font-black tracking-[0.2em] sm:text-5xl" style={{ color: theme.accent, textShadow: "0 3px 0 rgb(0 0 0 / 0.4)" }} data-testid="room-code">
                {room.code}
              </p>
              <Button variant="secondary" size="sm" className="border-0 bg-white/15 text-inherit hover:bg-white/25" onClick={() => copy("code")} icon={copied === "code" ? <Check className="size-4" /> : <Copy className="size-4" />}>
                {copied === "code" ? "Copied" : "Copy code"}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <input readOnly value={inviteUrl} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 font-mono text-sm text-ink-muted" />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => copy("link")} icon={copied === "link" ? <Check className="size-4" /> : <Copy className="size-4" />}>
                {copied === "link" ? "Copied!" : "Copy invite link"}
              </Button>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <Button variant="secondary" aria-label="Share invite" onClick={() => navigator.share({ title: `Join my ${game.name} game`, url: inviteUrl }).catch(() => {})} icon={<Share2 className="size-4" />} />
              )}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">
              Players <span className="text-ink-faint">{room.players.length}/{room.maxPlayers}</span>
            </h2>
            {!enough && <Badge tone="sun">Need {room.minPlayers - room.players.length} more</Badge>}
          </div>
          <ul className="space-y-2" data-testid="player-list">
            {room.players.map((p) => (
              <motion.li
                layout
                key={p.id}
                initial={{ opacity: 0, x: -24, scale: 0.96 }}
                animate={{ opacity: !p.connected ? 0.6 : 1, x: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
                className="flex items-center gap-3 rounded-2xl border-2 bg-surface-2 p-3 transition-colors"
                style={{ borderColor: p.ready || p.isHost ? theme.accent : "var(--line)", boxShadow: p.ready ? `0 0 0 3px ${theme.accent}22` : undefined }}
              >
                <Avatar name={p.name} color={p.color} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {p.name} {p.id === selfId && <span className="text-ink-faint">(you)</span>}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {!p.connected ? (
                      <span className="inline-flex items-center gap-1 text-sun">
                        <WifiOff className="size-3" /> Reconnecting…
                      </span>
                    ) : p.isHost ? (
                      "Host"
                    ) : p.ready ? (
                      "Ready"
                    ) : (
                      "Not ready"
                    )}
                  </p>
                </div>
                {p.isHost ? (
                  <Tooltip label="Host">
                    <Crown className="size-5 text-sun" aria-label="Host" />
                  </Tooltip>
                ) : (
                  <Badge tone={p.ready ? "mint" : "neutral"}>{p.ready ? "Ready" : "Waiting"}</Badge>
                )}
                {p.id !== selfId && (
                  <div className="flex gap-1">
                    <Tooltip label="Report player">
                      <button type="button" aria-label={`Report ${p.name}`} onClick={() => setReportTarget({ id: p.id, name: p.name })} className="rounded-lg p-1.5 text-ink-faint hover:bg-surface-3 hover:text-ink">
                        <Flag className="size-4" />
                      </button>
                    </Tooltip>
                    {isHost && (
                      <Tooltip label="Remove from room">
                        <button type="button" aria-label={`Remove ${p.name}`} onClick={() => run(send("room:kick", { playerId: p.id }))} className="rounded-lg p-1.5 text-ink-faint hover:bg-danger/15 hover:text-danger">
                          <UserX className="size-4" />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                )}
              </motion.li>
            ))}
            {Array.from({ length: Math.max(0, Math.min(room.maxPlayers, 6) - room.players.length) }, (_, i) => (
              <li key={`empty-${i}`} className="flex items-center gap-3 rounded-2xl border border-dashed border-line p-3 text-sm text-ink-faint">
                <span className="size-10 rounded-full border-2 border-dashed border-line" /> Waiting for player…
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="mb-1 font-display text-lg font-bold">Game settings</h2>
          <p className="mb-4 text-sm text-ink-muted">{isHost ? "You're the host — choose how you want to play." : "Only the host can change these."}</p>
          {isHost ? (
            <client.Settings config={room.config} editable={isHost} onChange={(patch) => void run(send("room:configure", { config: patch }))} />
          ) : (
            <ul className="flex flex-wrap gap-2">
              {client.summarize(room.config).map((s) => (
                <li key={s}>
                  <Badge>{s}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-3 p-5">
          {room.autoStartAt && <p className="rounded-xl bg-mint/15 p-3 text-center text-sm font-semibold">Everyone's ready — starting in a moment…</p>}
          {isHost ? (
            <>
              <Button
                size="lg"
                className="w-full"
                loading={starting}
                disabled={!enough || !allReady}
                onClick={async () => {
                  setStarting(true);
                  await run(send("game:start"));
                  setStarting(false);
                }}
              >
                {room.status === "finished" ? "Play again" : "Start game"}
              </Button>
              <p className="text-center text-xs text-ink-muted">
                {!enough ? `Waiting for at least ${room.minPlayers} players` : !allReady ? "Waiting for everyone to be ready" : "Everyone is ready!"}
              </p>
            </>
          ) : (
            <Button size="lg" variant={me?.ready ? "secondary" : "primary"} className="w-full" onClick={() => run(send("room:ready", { ready: !me?.ready }))}>
              {me?.ready ? "I'm not ready" : room.status === "finished" ? "Ready for a rematch" : "I'm ready"}
            </Button>
          )}
          {room.visibility === "public" && isHost && (
            <Button variant="secondary" className="w-full" onClick={() => run(send("room:ready", { ready: !me?.ready }))}>
              {me?.ready ? "Unready" : "Mark me ready (auto-start)"}
            </Button>
          )}
          <Button variant="ghost" className="w-full" onClick={onLeave} icon={<LogOut className="size-4" />}>
            Leave room
          </Button>
        </Card>
      </div>
      <ReportDialog target={reportTarget} roomCode={room.code} gameId={room.gameId} onClose={() => setReportTarget(null)} />
    </div>
  );
}
