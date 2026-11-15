"use client";

import { motion, useReducedMotion } from "motion/react";
import { Heart, Sparkles, Zap } from "lucide-react";
import { TOPIC_LABELS, type GameStatePayload, type MatchResults } from "@platform/shared";
import type { SameWavelengthView } from "@platform/engines/same-wavelength";

const ACCENT = "#ff7a9c";
const VIOLET = "#9d8cff";

/** Entertainment labels for the overall match, never a verdict on anyone. */
export function wavelengthLabel(pct: number) {
  if (pct >= 80) return "Same brain energy";
  if (pct >= 60) return "Strong shared vibe";
  if (pct >= 40) return "Tuned to nearby stations";
  if (pct >= 20) return "Different opinions, great chemistry";
  return "Gloriously different wavelengths";
}

/**
 * Same Wavelength's end-of-game reveal, above the shared results panel. With the last game state
 * (this tab saw the game end) it shows the shared picks and funniest disagreements; after a refresh
 * only the recorded aggregates exist, and it shows those.
 */
export function SameWavelengthResults({ results, game }: { results: MatchResults; selfId: string; game?: GameStatePayload | null }) {
  const reduce = useReducedMotion();
  const view = (game?.view ?? null) as SameWavelengthView | null;
  const summary = view?.summary ?? null;
  const d = results.entries[0]?.details ?? {};
  const pct = summary?.matchPct ?? Number(d.matchPct ?? 0);
  const exact = summary?.exactPairs ?? Number(d.exactMatches ?? 0);
  const comparisons = summary?.totalPairs ?? Number(d.comparisons ?? 0);
  const perfect = summary?.perfectRounds ?? Number(d.perfectRounds ?? 0);
  const best = summary?.bestRound ?? (Number(d.bestRound) || null);
  const agree = String(d.agreeTopics ?? "").split(",").filter(Boolean);
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <section className="mb-5 overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-8" style={{ background: "linear-gradient(140deg, #3a1d4f, #231640 60%, #2b2160)" }} data-testid="wave-summary">
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <svg viewBox="0 0 130 130" className="size-36 shrink-0" role="img" aria-label={`${pct}% matched`}>
          <circle cx="65" cy="65" r={r} fill="none" stroke="rgb(255 255 255 / .14)" strokeWidth="12" />
          <motion.circle cx="65" cy="65" r={r} fill="none" stroke={ACCENT} strokeWidth="12" strokeLinecap="round" transform="rotate(-90 65 65)" strokeDasharray={c} initial={reduce ? false : { strokeDashoffset: c }} animate={{ strokeDashoffset: c - (pct / 100) * c }} transition={{ duration: 1.2, ease: "easeOut" }} />
          <text x="65" y="72" textAnchor="middle" fontSize="28" fontWeight="800" fill="currentColor" data-testid="wave-match-pct">
            {pct}%
          </text>
        </svg>
        <div className="text-center sm:text-left">
          <p className="text-xs font-bold tracking-[0.16em] uppercase" style={{ color: ACCENT }}>
            Your shared wavelength
          </p>
          <h2 className="mt-1 font-display text-3xl font-semibold">{wavelengthLabel(pct)}</h2>
          <p className="mt-2 opacity-85">
            {exact} exact {exact === 1 ? "match" : "matches"} out of {comparisons} · {perfect} perfect {perfect === 1 ? "round" : "rounds"}
            {best ? ` · best round: ${best}` : ""}
          </p>
          <p className="mt-1 text-xs opacity-65">Just for fun: it shows how often your answers matched in this game, not how compatible anyone is.</p>
        </div>
      </div>

      {summary && (summary.sharedPicks.length > 0 || summary.disagreements.length > 0) && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {summary.sharedPicks.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 font-semibold">
                <Heart className="size-4" style={{ color: ACCENT }} aria-hidden /> Same brain moments
              </h3>
              <ul className="mt-2 space-y-2" data-testid="wave-shared-picks">
                {summary.sharedPicks.map((p) => (
                  <li key={p.round} className="rounded-2xl bg-white/8 px-4 py-2.5">
                    <span className="block text-xs opacity-70">{p.text}</span>
                    <span className="font-display text-lg font-semibold">{p.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary.disagreements.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 font-semibold">
                <Zap className="size-4" style={{ color: VIOLET }} aria-hidden /> Funniest disagreements
              </h3>
              <ul className="mt-2 space-y-2" data-testid="wave-disagreements">
                {summary.disagreements.map((p) => (
                  <li key={p.round} className="rounded-2xl bg-white/8 px-4 py-2.5">
                    <span className="block text-xs opacity-70">{p.text}</span>
                    <span className="font-semibold">{p.labels.join(" vs ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {agree.length > 0 && (
        <p className="mt-5 flex items-center gap-2 text-sm">
          <Sparkles className="size-4" style={{ color: ACCENT }} aria-hidden /> In sync on {agree.map((t) => TOPIC_LABELS[t] ?? t).join(", ")}.
        </p>
      )}
    </section>
  );
}
