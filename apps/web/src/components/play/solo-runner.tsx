"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Award, CalendarDays, CheckCircle2, RotateCcw, Settings2, Trophy } from "lucide-react";
import { getGame, type SoloGameId } from "@platform/shared";
import { SOLO_CLIENTS } from "@/games/solo-registry";
import type { SoloSummary } from "@/games/solo-types";
import { recordRecentlyPlayed } from "@/lib/recent";
import { sfx } from "@/lib/sound";
import { GameArt } from "../brand";
import { GAME_THEME } from "../game-theme";
import { Avatar, Button, Card, Spinner, cn } from "../ui/primitives";
import { useToast } from "../ui/toast";
import { usePlayer } from "@/lib/player";
import { readSoloSnapshot, removeSoloSnapshot, saveSoloSnapshot, type SoloSnapshot } from "@/lib/solo-recovery";

interface Run {
  token: string;
  seed: number;
  config: Record<string, unknown>;
  runId: string;
}

interface SubmitResponse {
  score: number;
  completed: boolean;
  details: Record<string, number | string>;
  saved: boolean;
  earnedCoins: number;
  unlocked: { key: string; title: string }[];
  best: { best: number; today: number; played: number } | null;
  error?: string;
}

interface BestResponse {
  available: boolean;
  personal: { best: number; today: number; played: number } | null;
  daily: { rank: number; playerId: string; name: string; color: string; score: number }[];
}

type Phase = { kind: "setup" } | { kind: "playing"; run: Run; initialLog?: unknown[] } | { kind: "submitting"; summary: SoloSummary } | { kind: "done"; summary: SoloSummary; result: SubmitResponse | null; error: string | null };

function useBest(gameId: SoloGameId, refresh: number) {
  const [best, setBest] = useState<BestResponse | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/solo/best?game=${gameId}`)
      .then((r) => r.json())
      .then((b: BestResponse) => alive && setBest(b))
      .catch(() => alive && setBest(null));
    return () => {
      alive = false;
    };
  }, [gameId, refresh]);
  return best;
}

function DailyBoard({ best }: { best: BestResponse | null }) {
  if (!best) return <Spinner label="Loading scores" />;
  if (!best.available) return <p className="text-sm text-ink-muted">Scores are unavailable right now.</p>;
  return (
    <div className="space-y-4">
      {best.personal && (
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-2xl bg-surface-2 p-3">
            <p className="text-xs font-semibold text-ink-muted uppercase">Your best</p>
            <p className="font-display text-2xl font-bold tabular-nums" data-testid="personal-best">{best.personal.best.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl bg-surface-2 p-3">
            <p className="text-xs font-semibold text-ink-muted uppercase">Today</p>
            <p className="font-display text-2xl font-bold tabular-nums">{best.personal.today.toLocaleString()}</p>
          </div>
        </div>
      )}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays className="size-4" /> Today&apos;s top scores
        </p>
        {best.daily.length ? (
          <ol className="space-y-1.5" data-testid="daily-board">
            {best.daily.slice(0, 5).map((r) => (
              <li key={r.playerId} className="flex items-center gap-2 text-sm">
                <span className="w-5 font-bold text-ink-muted">{r.rank}</span>
                <Avatar name={r.name} color={r.color} size={24} />
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className="font-semibold tabular-nums">{r.score.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-muted">No scores yet today — set the first one!</p>
        )}
      </div>
    </div>
  );
}

/**
 * Runs single-player games: setup → server-seeded run → play → submit the move
 * log for verification → results. Scores shown at the end come from the server.
 */
export function SoloRunner({ gameId }: { gameId: SoloGameId }) {
  const game = getGame(gameId);
  const client = SOLO_CLIENTS[gameId];
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>({ kind: "setup" });
  const [busy, setBusy] = useState(false);
  const [lastConfig, setLastConfig] = useState<Record<string, unknown>>({});
  const [refresh, setRefresh] = useState(0);
  const best = useBest(gameId, refresh);
  const { player } = usePlayer();
  const storageKey = client.recoverable && player ? `platform:solo:${player.id}:${gameId}` : null;
  const [pending, setPending] = useState<SoloSnapshot | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(!client.recoverable);
  const restoredKey = useRef<string | null>(null);
  const checkpoint = useCallback((snapshot: SoloSnapshot) => {
    if (storageKey && !saveSoloSnapshot(storageKey, snapshot)) setStorageWarning(true);
  }, [storageKey]);
  const backToSetup = () => { if (storageKey) removeSoloSnapshot(storageKey); setPending(null); setPhase({ kind: "setup" }); setRefresh(n => n+1); };

  const start = useCallback(
    async (config: Record<string, unknown>) => {
      setBusy(true);
      try {
        const res = await fetch("/api/solo/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameId, config }), signal: AbortSignal.timeout(12_000) });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't start the game");
        setLastConfig(body.config);
        setPhase({ kind: "playing", run: body as Run });
        if (client.recoverable) { const snapshot: SoloSnapshot = { stage: "playing", run: body as Run, log: [] }; checkpoint(snapshot); setPending(snapshot); }
        recordRecentlyPlayed(gameId);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) {
        toast((e as Error).message, "error");
      } finally {
        setBusy(false);
      }
    },
    [gameId, toast, checkpoint, client.recoverable],
  );

  const finish = useCallback(
    async (run: Run, log: unknown, summary: SoloSummary) => {
      setPhase({ kind: "submitting", summary });
      const snapshot: SoloSnapshot = { stage: "pending", run, log: Array.isArray(log) ? log : [], summary };
      if (client.recoverable) { checkpoint(snapshot); setPending(snapshot); }
      try {
        const res = await fetch("/api/solo/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: run.token, log }), signal: AbortSignal.timeout(15_000) });
        const body = (await res.json()) as SubmitResponse;
        if (!res.ok && res.status !== 503) throw new Error(body.error ?? "Your score couldn't be verified");
        if (summary.completed) sfx.win();
        setPhase({ kind: "done", summary, result: body, error: body.error ?? (client.recoverable && !body.saved ? "Your score is verified, but campaign saving is unavailable. Retry saving before continuing." : null) });
        if (client.recoverable && body.saved) { checkpoint({ ...snapshot, stage: "done" }); setPending(null); }
      } catch (e) {
        setPhase({ kind: "done", summary, result: null, error: (e as Error).message });
      }
      setRefresh((n) => n + 1);
    },
    [client.recoverable, checkpoint],
  );

  useEffect(() => {
    if (!client.recoverable || !storageKey || restoredKey.current === storageKey) return;
    restoredKey.current = storageKey;
    const snapshot = readSoloSnapshot(storageKey);
    if (!snapshot) { setRecoveryChecked(true); return; }
    setLastConfig(snapshot.run.config);
    if (snapshot.stage === "playing") { setPending(snapshot); setPhase({ kind: "playing", run: snapshot.run, initialLog: snapshot.log }); setRecoveryChecked(true); return; }
    let alive = true;
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
    fetch(`/api/solo/result?runId=${encodeURIComponent(snapshot.run.runId)}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(response.status === 404 ? "This result has not been saved. Retry the original submission." : "Saved result lookup is unavailable. Retry without starting a new shift.");
      const receipt = await response.json() as SubmitResponse;
      if (alive) { setPhase({ kind: "done", summary: snapshot.summary!, result: receipt, error: null }); setPending(null); }
    }).catch(() => { if (alive) { setPending(snapshot); setPhase({ kind: "done", summary: snapshot.summary!, result: null, error: "Your saved result couldn't be confirmed. Retry saving to recover the original run." }); } }).finally(() => { clearTimeout(timeout); if (alive) setRecoveryChecked(true); });
    return () => { alive = false; clearTimeout(timeout); controller.abort(); };
  }, [client.recoverable, storageKey]);

  if (client.recoverable && !recoveryChecked) return <div className="flex justify-center p-12"><Spinner label="Checking your saved kitchen" /></div>;

  if (phase.kind === "playing") {
    const run = phase.run;
    return (
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
        <client.Game key={run.runId} seed={run.seed} config={run.config} initialLog={phase.initialLog} onCheckpoint={client.recoverable ? log => checkpoint({ stage: "playing", run, log }) : undefined} onFinish={(log, summary) => finish(run, log, summary)} onQuit={() => { if (storageKey) setPending(readSoloSnapshot(storageKey)); setPhase({ kind: "setup" }); }} />
      </div>
    );
  }

  if (phase.kind === "submitting" || phase.kind === "done") {
    const { summary } = phase;
    const result = phase.kind === "done" ? phase.result : null;
    const score = result?.score ?? summary.score;
    const questLevel = gameId === "cuisine-quest" ? Number(result?.details.level) : 0;
    const nextConfig = client.recoverable ? (result?.saved && result.completed && questLevel < 7 ? { level: questLevel + 1 } : undefined) : summary.nextConfig;
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="overflow-hidden border-[3px]" style={{ borderColor: GAME_THEME[gameId].accent }} data-testid="solo-results">
            <div className="relative overflow-hidden p-8 text-center" style={{ background: GAME_THEME[gameId].deep, color: GAME_THEME[gameId].ink }}>
              <div className="pointer-events-none absolute inset-0 opacity-30" aria-hidden>
                <GameArt gameId={gameId} className="size-full scale-125 blur-xl" />
              </div>
              <p className="relative text-xs font-black tracking-[0.3em] uppercase opacity-70">{game.name}</p>
              <p className="relative mt-1 font-display text-xl font-black">{client.recoverable && result ? (result.completed ? `Cuisine ${questLevel} complete` : "A little more practice") : summary.headline}</p>
              <motion.p
                initial={{ scale: 1.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
                className="relative mt-2 font-display text-7xl font-black tabular-nums"
                style={{ color: GAME_THEME[gameId].accent, textShadow: "0 5px 0 rgb(0 0 0 / 0.45)" }}
                data-testid="final-score"
              >
                {score.toLocaleString()}
              </motion.p>
              <p className="relative mt-1 text-sm font-bold opacity-80">points</p>
            </div>
            <div className="space-y-5 p-6">
              {phase.kind === "submitting" ? (
                <p className="flex items-center justify-center gap-2 text-ink-muted">
                  <Spinner label="Verifying score" /> Verifying your score…
                </p>
              ) : phase.error ? (
                <p className="rounded-2xl bg-sun/15 p-3 text-center text-sm font-semibold" role="status">
                  {phase.error}
                </p>
              ) : (
                <p className="flex items-center justify-center gap-2 text-sm font-semibold text-mint" data-testid="score-verified">
                  <CheckCircle2 className="size-4" /> Score verified{result?.saved ? " and saved" : ""}
                </p>
              )}
              {result?.best && (
                <p className="text-center text-sm text-ink-muted">
                  Personal best: <strong className="text-ink">{result.best.best.toLocaleString()}</strong>
                  {result.best.best === score && score > 0 ? " — new record!" : ""}
                </p>
              )}
              {!!result?.earnedCoins && <p className="text-center font-bold text-[#8a4b00] dark:text-sun" data-testid="earned-coins">+{result.earnedCoins} Sin Coins earned · <Link href="/store" className="underline">Visit the studio</Link></p>}
              {!!result?.unlocked.length && (
                <div className="flex flex-wrap justify-center gap-2">
                  {result.unlocked.map((a) => (
                    <span key={a.key} className="inline-flex items-center gap-1.5 rounded-full bg-sun/20 px-3 py-1 text-sm font-semibold">
                      <Award className="size-4" /> {a.title}
                    </span>
                  ))}
                </div>
              )}
              {result && client.ResultDetails && <client.ResultDetails details={result.details} saved={result.saved} />}
              {client.recoverable && phase.kind === "done" && phase.error && pending?.summary && <Button variant="secondary" onClick={() => finish(pending.run, pending.log, pending.summary!)} data-testid="cq-retry-save">Retry saving original run</Button>}
              {storageWarning && <p className="text-sm text-ink-muted">This browser couldn't store recovery data. Keep this tab open until your result is saved.</p>}
              <div className="flex flex-wrap justify-center gap-3">
                {nextConfig && (
                  <Button onClick={() => start(nextConfig)} disabled={busy || phase.kind === "submitting"} data-testid="next-run">
                    {summary.nextLabel ?? "Next"}
                  </Button>
                )}
                <Button variant={nextConfig ? "secondary" : "primary"} onClick={() => start(lastConfig)} disabled={busy || phase.kind === "submitting"} data-testid="play-again">
                  <RotateCcw className="size-4" /> Play again
                </Button>
                <Button variant="ghost" onClick={backToSetup} disabled={phase.kind === "submitting"}>
                  <Settings2 className="size-4" /> {client.recoverable ? "Campaign map" : "Change settings"}
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {client.recoverable && pending?.stage === "playing" && <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4"><p className="flex-1 text-sm">Your unfinished kitchen is saved in this tab.</p><Button onClick={() => setPhase({ kind: "playing", run: pending.run, initialLog: pending.log })}>Resume kitchen</Button><Button variant="ghost" onClick={backToSetup}>Discard unfinished shift</Button></div>}
      {storageWarning && <p role="status" className="mb-4 text-sm text-ink-muted">Refresh recovery is unavailable in this browser. Keep this tab open while playing.</p>}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <GameArt gameId={gameId} className="h-28 w-44 shrink-0 rounded-2xl border border-line object-cover shadow-card" />
        <div className="flex-1">
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{game.name}</h1>
          <p className="mt-1 text-ink-muted">{game.tagline}</p>
        </div>
        <Link href={`/leaderboard?game=${gameId}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-500 hover:underline">
          <Trophy className="size-4" /> Leaderboard
        </Link>
      </div>
      {client.recoverable ? <div className={cn("mt-8", busy && "opacity-80")}><client.Setup onStart={start} busy={busy} /></div> : <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className={cn("p-6", busy && "opacity-80")}>
          <client.Setup onStart={start} busy={busy} />
        </Card>
        <Card className="p-6">
          <DailyBoard best={best} />
        </Card>
      </div>}
    </div>
  );
}
