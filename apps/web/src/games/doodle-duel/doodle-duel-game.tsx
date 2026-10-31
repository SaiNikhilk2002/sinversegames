"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, Eraser, Lightbulb, Pencil, Send, Trash2, Undo2, WifiOff } from "lucide-react";
import { BRUSH_SIZES, PALETTE, type DoodleChatMessage, type DoodleView } from "@platform/engines/doodle-duel/client";
import { Avatar, Button, cn, Tooltip } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useCountdown } from "@/lib/realtime/use-countdown";
import { useRoomEvent } from "@/lib/realtime/use-room";
import { sfx } from "@/lib/sound";
import type { GameClientProps } from "../types";
import { DrawingCanvas, type Brush, type CanvasHandle } from "./drawing-canvas";

const REASON_COPY = { time: "Time's up!", "all-guessed": "Everyone got it!", "drawer-left": "The drawer left" } as const;

export function DoodleDuelGame({ code, game, send, selfId }: GameClientProps<DoodleView>) {
  const view = game.view;
  const toast = useToast();
  const isDrawer = !!view.you?.isDrawer;
  const drawer = view.players.find((p) => p.id === view.drawerId);
  const remaining = useCountdown(view.phaseEndsAt);
  const seconds = remaining === null ? null : Math.ceil(remaining / 1000);
  const [brush, setBrush] = useState<Brush>({ tool: "pen", color: PALETTE[0], size: BRUSH_SIZES[1] });
  const canvas = useRef<CanvasHandle>(null);
  const [chat, setChat] = useState<DoodleChatMessage[]>([]);

  useRoomEvent<DoodleChatMessage>(code, "doodle:guess", (m) => {
    setChat((c) => [...c.slice(-80), m]);
    if (m.kind === "correct") {
      sfx.correct();
      if (m.playerId === selfId) toast(`You guessed it! +${m.points} points`, "success");
    }
  });
  useRoomEvent<{ kind: "letter" | "text" }>(code, "doodle:hint", (h) => {
    if (!isDrawer && h.kind === "letter") sfx.tick();
  });

  // Countdown ticks in the last five seconds of drawing.
  useEffect(() => {
    if (view.phase === "drawing" && seconds !== null && seconds <= 5 && seconds > 0) sfx.tick();
  }, [seconds, view.phase]);
  useEffect(() => {
    if (isDrawer && view.phase === "choosing") sfx.yourTurn();
  }, [isDrawer, view.phase, view.turnNumber]);

  const ranked = useMemo(() => [...view.players].sort((a, b) => b.score - a.score), [view.players]);
  const timeLow = view.phase === "drawing" && seconds !== null && seconds <= 10;

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr_320px]" data-testid="doodle-duel">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 lg:col-span-3">
        <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold">
          Round {view.round}/{view.totalRounds}
        </span>
        <div className="flex min-w-0 flex-1 flex-col items-center" data-testid="word-display">
          {view.phase === "drawing" && isDrawer && view.word && (
            <p className="font-display text-xl font-extrabold tracking-wide sm:text-2xl">
              Draw: <span className="text-gradient" data-testid="secret-word">{view.word}</span>
            </p>
          )}
          {view.phase === "drawing" && !isDrawer && (
            view.word ? (
              <p className="font-display text-xl font-extrabold text-mint">You got it: {view.word}</p>
            ) : (
              <p className="font-mono text-xl font-bold tracking-[0.35em] sm:text-2xl" aria-label={`Word with ${view.mask?.filter((c) => c === "_").length} hidden letters`} data-testid="word-mask">
                {view.mask?.map((c, i) => (c === " " ? "  " : c)).join("")}
              </p>
            )
          )}
          {view.phase === "choosing" && <p className="font-semibold text-ink-muted">{isDrawer ? "Pick a word to draw" : `${drawer?.name ?? "The drawer"} is choosing a word…`}</p>}
          {view.phase === "reveal" && view.lastTurn && <p className="font-semibold">The word was <strong className="text-gradient font-display text-xl">{view.lastTurn.word}</strong></p>}
          <div className="mt-0.5 flex flex-wrap justify-center gap-x-3 text-xs text-ink-muted">
            {view.phase === "drawing" && view.mask && <span>{view.mask.filter((c) => c !== " ").length} letters</span>}
            {view.category && view.phase === "drawing" && <span>Category: {view.category}</span>}
            {view.textHint && (
              <span className="inline-flex items-center gap-1 text-sun">
                <Lightbulb className="size-3" /> {view.textHint}
              </span>
            )}
          </div>
        </div>
        <span
          className={cn("min-w-16 rounded-full px-3 py-1 text-center font-mono text-lg font-bold", timeLow ? "bg-danger text-white" : "bg-surface-2")}
          role="timer"
          aria-label={`${seconds ?? 0} seconds left`}
        >
          {seconds ?? "–"}s
        </span>
        {timeLow && !isDrawer && !view.you?.hasGuessed && <p className="w-full text-center text-sm font-semibold text-danger">Time is running out!</p>}
      </div>

      {/* Scoreboard */}
      <aside aria-label="Scores" className="order-3 rounded-2xl border border-line bg-surface p-3 lg:order-none">
        <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible" data-testid="scoreboard">
          {ranked.map((p, i) => (
            <li
              key={p.id}
              className={cn(
                "flex min-w-36 items-center gap-2 rounded-xl px-2 py-2",
                p.guessed && view.phase === "drawing" ? "bg-mint/15" : "bg-surface-2",
                p.left && "opacity-40",
              )}
            >
              <span className="w-4 text-xs font-bold text-ink-faint">{i + 1}</span>
              <Avatar name={p.name} color={p.color} size={30} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {p.name}
                  {p.id === selfId && " (you)"}
                </p>
                <p className="text-xs text-ink-muted" data-testid={`doodle-score-${p.id}`}>{p.score} pts</p>
              </div>
              {p.id === view.drawerId && <Pencil className="size-4 text-brand-500" aria-label="Drawing" />}
              {p.guessed && <Check className="size-4 text-mint" aria-label="Guessed" />}
              {!p.connected && !p.left && <WifiOff className="size-4 text-sun" aria-label="Offline" />}
            </li>
          ))}
        </ol>
      </aside>

      {/* Canvas + tools */}
      <div className="relative min-w-0 space-y-3">
        <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-1 shadow-card">
          <DrawingCanvas ref={canvas} code={code} turn={view.turnNumber} isDrawer={isDrawer && view.phase === "drawing"} brush={brush} />
            {view.phase === "choosing" && (
              <Overlay key="choose">
                {isDrawer && view.wordOptions ? (
                  <div className="w-full max-w-md" data-testid="word-options">
                    <p className="mb-1 text-center font-display text-2xl font-bold text-white">Choose a word</p>
                    <p className="mb-4 text-center text-sm text-white/75">Auto-picks in {seconds ?? 0}s</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {view.wordOptions.map((w, i) => (
                        <button
                          key={w.text}
                          type="button"
                          onClick={async () => {
                            const ack = await send("doodle:select-word", { index: i });
                            if (!ack.ok) toast(ack.error.message, "warning");
                          }}
                          className="rounded-2xl bg-white px-4 py-3 text-center text-[#17142b] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
                        >
                          <span className="block font-display text-lg font-bold capitalize">{w.text}</span>
                          <span className="text-xs text-[#5b5775]">
                            {w.category} · {w.difficulty}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-center font-display text-2xl font-bold text-white">{drawer?.name ?? "The drawer"} is choosing a word…</p>
                )}
              </Overlay>
            )}
            {view.phase === "reveal" && view.lastTurn && (
              <Overlay key="reveal">
                <div className="w-full max-w-sm text-center text-white" data-testid="turn-results">
                  <p className="text-sm font-semibold text-white/75">{REASON_COPY[view.lastTurn.reason]}</p>
                  <p className="font-display text-3xl font-extrabold capitalize">{view.lastTurn.word}</p>
                  <ul className="mt-4 space-y-1 text-left">
                    {view.players
                      .filter((p) => !p.left)
                      .sort((a, b) => (view.lastTurn!.points[b.id] ?? 0) - (view.lastTurn!.points[a.id] ?? 0))
                      .map((p) => (
                        <li key={p.id} className="flex justify-between rounded-lg bg-white/10 px-3 py-1.5 text-sm">
                          <span>
                            {p.name}
                            {p.id === view.lastTurn!.drawerId && " ✏️"}
                          </span>
                          <span className={cn("font-bold", (view.lastTurn!.points[p.id] ?? 0) > 0 ? "text-mint" : "text-white/50")}>+{view.lastTurn!.points[p.id] ?? 0}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              </Overlay>
            )}
        </div>
        {isDrawer && view.phase === "drawing" && <Toolbar brush={brush} setBrush={setBrush} onUndo={() => canvas.current?.undo()} onClear={() => canvas.current?.clear()} />}
      </div>

      {/* Guesses */}
      <GuessPanel chat={chat} view={view} selfId={selfId} isDrawer={isDrawer} send={send} />
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    // Fades in, but disappears instantly so it never covers the canvas when drawing starts.
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b0a18]/80 p-4 backdrop-blur-sm">
      {children}
    </motion.div>
  );
}

function Toolbar({ brush, setBrush, onUndo, onClear }: { brush: Brush; setBrush: (b: Brush) => void; onUndo: () => void; onClear: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3" role="toolbar" aria-label="Drawing tools">
      <div className="flex gap-1">
        <ToolButton label="Pencil" active={brush.tool === "pen"} onClick={() => setBrush({ ...brush, tool: "pen" })}>
          <Pencil className="size-4" />
        </ToolButton>
        <ToolButton label="Eraser" active={brush.tool === "eraser"} onClick={() => setBrush({ ...brush, tool: "eraser" })}>
          <Eraser className="size-4" />
        </ToolButton>
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colour">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={brush.color === c && brush.tool === "pen"}
            aria-label={`Colour ${c}`}
            onClick={() => setBrush({ ...brush, color: c, tool: "pen" })}
            className={cn("size-7 rounded-full border border-black/15 transition hover:scale-110", brush.color === c && brush.tool === "pen" && "ring-4 ring-brand-400/70")}
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Brush size">
        {BRUSH_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={brush.size === s}
            aria-label={`Brush size ${s}`}
            onClick={() => setBrush({ ...brush, size: s })}
            className={cn("flex size-9 items-center justify-center rounded-lg", brush.size === s ? "bg-brand-500/20" : "hover:bg-surface-2")}
          >
            <span className="rounded-full bg-ink" style={{ width: Math.min(24, s), height: Math.min(24, s) }} />
          </button>
        ))}
      </div>
      <div className="ml-auto flex gap-1">
        <ToolButton label="Undo" onClick={onUndo}>
          <Undo2 className="size-4" />
        </ToolButton>
        <ToolButton label="Clear canvas" onClick={onClear}>
          <Trash2 className="size-4" />
        </ToolButton>
      </div>
    </div>
  );
}

function ToolButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip label={label}>
      <button type="button" aria-label={label} aria-pressed={active} onClick={onClick} className={cn("flex size-10 items-center justify-center rounded-xl border border-line", active ? "bg-brand-500 text-white" : "bg-surface-2 hover:bg-surface-3")}>
        {children}
      </button>
    </Tooltip>
  );
}

function GuessPanel({ chat, view, selfId, isDrawer, send }: { chat: DoodleChatMessage[]; view: DoodleView; selfId: string; isDrawer: boolean; send: GameClientProps["send"] }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const drawingLocked = isDrawer && view.phase === "drawing";

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.length]);

  return (
    <section aria-label="Guesses and chat" className="flex h-[22rem] flex-col rounded-2xl border border-line bg-surface lg:h-auto lg:max-h-[42rem]">
      <ol ref={listRef} className="flex-1 space-y-1 overflow-y-auto p-3 text-sm" aria-live="polite" data-testid="guess-log">
        {chat.length === 0 && <li className="text-ink-faint">Guesses appear here. Type your answer below!</li>}
        {chat.map((m) => (
          <li key={m.id} className={cn("rounded-lg px-2 py-1", m.kind === "correct" && "bg-mint/15 font-semibold text-emerald-700 dark:text-mint", m.kind === "close" && "bg-sun/15 text-amber-700 dark:text-sun", m.kind === "guessed-chat" && "bg-mint/8 text-ink-muted", m.kind === "system" && "text-ink-faint italic")}>
            {m.kind === "chat" && (
              <>
                <strong>{m.playerId === selfId ? "You" : m.name}:</strong> {m.text}
              </>
            )}
            {m.kind === "guessed-chat" && (
              <>
                <strong>{m.playerId === selfId ? "You" : m.name}</strong> <span className="text-xs">(solved)</span>: {m.text}
              </>
            )}
            {m.kind === "correct" && `${m.playerId === selfId ? "You" : m.name} guessed the word! +${m.points}${m.first ? " (first!)" : ""}`}
            {m.kind === "close" && `“${m.text}” is close!`}
            {m.kind === "system" && m.text}
          </li>
        ))}
      </ol>
      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const value = text.trim();
          if (!value) return;
          setText("");
          const ack = await send("doodle:guess", { text: value });
          if (!ack.ok) toast(ack.error.message, "warning");
        }}
      >
        <label htmlFor="guess-input" className="sr-only">
          Your guess
        </label>
        <input
          id="guess-input"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 80))}
          disabled={drawingLocked}
          placeholder={drawingLocked ? "You're drawing — no hints!" : view.you?.hasGuessed ? "Chat with other solvers…" : "Type your guess…"}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 outline-none focus:border-brand-400 disabled:opacity-60"
        />
        <Button type="submit" aria-label="Send guess" disabled={drawingLocked || !text.trim()} icon={<Send className="size-4" />} />
      </form>
    </section>
  );
}
