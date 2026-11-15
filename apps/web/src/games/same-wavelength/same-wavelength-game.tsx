"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Clock, Lock, Sparkles } from "lucide-react";
import type { SameWavelengthView, RoundReveal } from "@platform/engines/same-wavelength";
import { Avatar, Button, cn, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { GameClientProps } from "../types";
import { MODE_LABEL } from "./settings";

const ACCENT = "#ff7a9c";
const VIOLET = "#9d8cff";

export const VERDICT: Record<RoundReveal["verdict"], { title: string; line: string }> = {
  "same-brain": { title: "Same brain moment!", line: "Everyone picked the same answer." },
  close: { title: "Close enough!", line: "Not identical, but definitely the same vibe." },
  mixed: { title: "Mixed signals", line: "Some of you are in sync. Some of you… are not." },
  different: { title: "Different wavelengths!", line: "Different opinions, great chemistry." },
  quiet: { title: "Nobody to compare", line: "Not enough answers came in this round." },
};
const KIND_LABEL: Record<string, string> = { choice: "Pick one", scenario: "Scenario", preference: "Preference", emoji: "Emoji pick", who: "Who's more likely?", predict: "Predict", text: "Write it in" };
const LEVEL_LABEL = { match: "Match · +2", close: "Close · +1", different: "Different · 0" } as const;

/** Seconds left in the current phase, against the server's clock. */
function useCountdown(view: SameWavelengthView) {
  const [offset] = useState(() => view.now - Date.now());
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(t);
  }, [offset]);
  if (!view.phaseEndsAt) return 0;
  return Math.max(0, Math.ceil((view.phaseEndsAt - now) / 1000));
}

export function SameWavelengthGame({ game, selfId, send }: GameClientProps<SameWavelengthView>) {
  const view = game.view;
  const toast = useToast();
  const left = useCountdown(view);
  const [busy, setBusy] = useState(false);
  const names = useMemo(() => new Map(view.players.map((p) => [p.id, p])), [view.players]);

  async function answer(payload: Record<string, unknown>) {
    setBusy(true);
    const ack = await send("wave:answer", { round: view.round, ...payload });
    setBusy(false);
    if (!ack.ok) toast(ack.error.message, "error");
  }

  return (
    <div className="mx-auto max-w-3xl" data-testid="same-wavelength" data-phase={view.phase} data-round={view.round}>
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <span className="rounded-full px-3 py-1 text-xs font-bold tracking-wide text-[#231640] uppercase" style={{ background: ACCENT }}>
          {MODE_LABEL[view.mode]}
        </span>
        <span className="text-sm font-semibold text-ink-muted" aria-label={`Round ${view.round} of ${view.totalRounds}`}>
          Round {Math.max(1, view.round)} / {view.totalRounds}
        </span>
        <span className="flex gap-1" aria-hidden>
          {Array.from({ length: view.totalRounds }, (_, k) => {
            const done = view.history[k];
            return <span key={k} className="h-1.5 w-5 rounded-full" style={{ background: done ? (done.allMatched ? ACCENT : done.pct > 0 ? VIOLET : "rgb(255 255 255 / .25)") : k === view.round - 1 ? "rgb(255 255 255 / .6)" : "rgb(255 255 255 / .12)" }} />;
          })}
        </span>
        {view.phase !== "intro" && (
          <span className="ml-auto flex items-center gap-1.5 text-sm font-semibold tabular-nums" data-testid="wave-timer">
            <Clock className="size-4" aria-hidden /> {left}s
          </span>
        )}
      </header>

      <AnimatePresence mode="wait">
        {view.phase === "intro" && (
          <motion.section key="intro" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="rounded-3xl border border-white/10 p-8 text-center" style={{ background: "linear-gradient(135deg, #3a1d4f, #231640)" }}>
            <Sparkles className="mx-auto size-10" style={{ color: ACCENT }} aria-hidden />
            <h2 className="mt-3 font-display text-3xl font-semibold">Tune in…</h2>
            <p className="mt-2 opacity-80">Same prompt for everyone. Answer on your own. Reveal together.</p>
            <div className="mt-5 flex justify-center gap-3">
              {view.players.map((p) => (
                <span key={p.id} className="flex flex-col items-center gap-1 text-sm">
                  <Avatar name={p.name} color={p.color} size={44} />
                  {p.id === selfId ? "You" : p.name}
                </span>
              ))}
            </div>
          </motion.section>
        )}

        {view.phase === "answering" && view.prompt && (
          <motion.section key={`ask-${view.round}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            <PromptCard view={view} selfId={selfId} />
            {view.you?.answer ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5" data-testid="wave-locked">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Lock className="size-4" style={{ color: ACCENT }} aria-hidden /> Locked in: <span className="font-display text-lg">{view.you.answer.label}</span>
                </p>
                <p className="mt-1 text-sm opacity-70">Only you can see your answer until the reveal.</p>
              </div>
            ) : (
              <AnswerPad view={view} selfId={selfId} busy={busy} onAnswer={answer} />
            )}
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Who has answered">
              {view.players.filter((p) => !p.left).map((p) => (
                <li key={p.id} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm", p.answered ? "border-transparent" : "border-white/15 opacity-70")} style={p.answered ? { background: "rgb(255 122 156 / .18)" } : undefined} data-testid={`answered-${p.id}`} data-answered={p.answered}>
                  <Avatar name={p.name} color={p.color} size={22} />
                  {p.id === selfId ? "You" : p.name}
                  {p.answered ? <Check className="size-4" style={{ color: ACCENT }} aria-label="answered" /> : <span className="text-xs">thinking…</span>}
                  {!p.connected && <span className="text-xs opacity-70">(away)</span>}
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        {view.phase === "reveal" && view.reveal && (
          <motion.section key={`reveal-${view.round}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Reveal reveal={view.reveal} names={names} selfId={selfId} />
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button onClick={() => send("wave:next", { round: view.round })} disabled={!!view.you?.ready} data-testid="wave-next">
                {view.round >= view.totalRounds ? "See our wavelength" : view.you?.ready ? "Waiting for the others…" : "Next round"}
              </Button>
              <span className="text-sm opacity-70">
                {view.players.filter((p) => p.ready).length}/{view.players.filter((p) => !p.left && p.connected).length} ready · moves on in {left}s
              </span>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function PromptCard({ view, selfId }: { view: SameWavelengthView; selfId: string }) {
  const p = view.prompt!;
  const subject = p.subjectId ? view.players.find((x) => x.id === p.subjectId) : null;
  return (
    <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8" style={{ background: "linear-gradient(135deg, #3a1d4f 0%, #231640 70%)" }}>
      <div className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full opacity-30 blur-2xl" style={{ background: ACCENT }} aria-hidden />
      <p className="relative text-xs font-bold tracking-[0.16em] uppercase" style={{ color: ACCENT }}>
        {KIND_LABEL[p.kind]} · {p.topic}
      </p>
      <h2 className="relative mt-2 font-display text-2xl leading-tight font-semibold sm:text-3xl" data-testid="wave-prompt">
        {p.text}
      </h2>
      {p.kind === "predict" && subject && (
        <p className="relative mt-2 text-sm opacity-80">{subject.id === selfId ? "Answer for yourself. The others are guessing what you'll pick." : `Guess what ${subject.name} will pick about themselves.`}</p>
      )}
      <p className="relative mt-3 flex items-center gap-1.5 text-xs opacity-70">
        <Lock className="size-3.5" aria-hidden /> Answers stay secret until everyone has locked in.
      </p>
    </div>
  );
}

function AnswerPad({ view, selfId, busy, onAnswer }: { view: SameWavelengthView; selfId: string; busy: boolean; onAnswer: (p: Record<string, unknown>) => void }) {
  const p = view.prompt!;
  const [text, setText] = useState("");
  if (p.kind === "text")
    return (
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onAnswer({ text: text.trim() });
        }}
      >
        <Input aria-label="Your answer" value={text} maxLength={40} onChange={(e) => setText(e.target.value)} placeholder="Type a short answer" autoFocus data-testid="wave-text" />
        <Button type="submit" loading={busy} disabled={!text.trim()}>
          Lock in
        </Button>
      </form>
    );
  const emoji = p.kind === "emoji";
  return (
    <div className={cn("mt-4 grid gap-2.5", emoji ? "grid-cols-3 sm:grid-cols-5" : p.options.length > 4 ? "sm:grid-cols-2" : "sm:grid-cols-2")} role="group" aria-label="Answers">
      {p.options.map((o) => {
        const player = p.kind === "who" ? view.players.find((x) => x.id === o.id) : null;
        return (
          <motion.button
            key={o.id}
            type="button"
            whileTap={{ scale: 0.96 }}
            disabled={busy}
            onClick={() => onAnswer(p.kind === "who" ? { player: o.id } : { option: o.id })}
            className={cn("flex items-center gap-3 rounded-2xl border border-white/12 bg-white/5 px-4 py-3.5 text-left font-semibold transition hover:border-white/40 hover:bg-white/10 focus-visible:outline-2", emoji && "justify-center text-4xl")}
            data-testid={`wave-option-${o.id}`}
          >
            {player && <Avatar name={player.name} color={player.color} size={30} />}
            <span>{player ? (player.id === selfId ? `${player.name} (you)` : player.name) : o.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

export function Reveal({ reveal, names, selfId }: { reveal: RoundReveal; names: Map<string, { name: string; color: string }>; selfId: string }) {
  const reduce = useReducedMotion();
  const verdict = VERDICT[reveal.verdict];
  const matched = new Set(reveal.pairs.filter((x) => x.level === "match").flatMap((x) => [x.a, x.b]));
  const who = (id: string) => (id === selfId ? "You" : (names.get(id)?.name ?? "Someone"));
  return (
    <div data-testid="wave-reveal" data-verdict={reveal.verdict}>
      <motion.div initial={reduce ? false : { scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-3xl p-6 text-center" style={{ background: reveal.verdict === "same-brain" ? `linear-gradient(135deg, ${ACCENT}, ${VIOLET})` : "linear-gradient(135deg, #3a1d4f, #231640)" }}>
        <p className="text-xs font-bold tracking-[0.16em] uppercase opacity-80">{reveal.text}</p>
        <h2 className="mt-2 font-display text-3xl font-semibold" data-testid="wave-verdict">
          {verdict.title}
        </h2>
        <p className="mt-1 opacity-85">{verdict.line}</p>
      </motion.div>
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {reveal.answers.map((a, i) => (
          <motion.li
            key={a.playerId}
            initial={reduce ? false : { rotateX: 90, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            transition={{ delay: 0.25 + i * 0.18, type: "spring", stiffness: 180, damping: 18 }}
            className={cn("flex items-center gap-3 rounded-2xl border px-4 py-3", matched.has(a.playerId) ? "border-transparent shadow-[0_0_24px_-6px_rgb(255_122_156/.8)]" : "border-white/12 bg-white/5")}
            style={matched.has(a.playerId) ? { background: "rgb(255 122 156 / .2)" } : undefined}
            data-testid={`wave-answer-${a.playerId}`}
          >
            <Avatar name={names.get(a.playerId)?.name ?? "?"} color={names.get(a.playerId)?.color ?? "#999"} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block text-xs opacity-70">{who(a.playerId)}</span>
              <span className="block truncate font-display text-xl font-semibold">{a.label}</span>
            </span>
            {matched.has(a.playerId) && <Sparkles className="size-5" style={{ color: ACCENT }} aria-label="matched" />}
          </motion.li>
        ))}
        {reveal.missed.map((id) => (
          <li key={id} className="flex items-center gap-3 rounded-2xl border border-dashed border-white/15 px-4 py-3 text-sm opacity-70">
            {who(id)} didn&apos;t answer in time
          </li>
        ))}
      </ul>
      {reveal.pairs.length > 0 && (
        <details className="mt-3 text-sm opacity-85">
          <summary className="cursor-pointer font-semibold">How this round scored ({reveal.pct}%)</summary>
          <ul className="mt-2 space-y-1">
            {reveal.pairs.map((x) => (
              <li key={`${x.a}-${x.b}`}>
                {who(x.a)} &amp; {who(x.b)}: {LEVEL_LABEL[x.level]}
              </li>
            ))}
          </ul>
          <p className="mt-2 opacity-75">Exact matches score 2 points per pair; answers this prompt counts as close score 1. {reveal.subjectId ? "In predict rounds only guesses about the subject count." : ""}</p>
        </details>
      )}
    </div>
  );
}
