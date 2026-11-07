"use client";

import { useEffect, useState } from "react";
import type { MatchResultEntry, MatchResults } from "@platform/shared";
import { useSettings } from "@/lib/settings";
import { sfx } from "@/lib/sound";
import { FoodArt } from "../cuisine-quest/art";
import "../cuisine-quest/cuisine-quest.css";
import { ChefCharacter } from "./chef";
import "./chef-rivals.css";

const CATEGORIES = [
  { key: "recipeScore", label: "Recipe correctness", max: 3000 },
  { key: "craftScore", label: "Cooking craft", max: 3000 },
  { key: "timingScore", label: "Timing and welcome", max: 1500 },
  { key: "techniqueScore", label: "Clean technique", max: 1000 },
  { key: "presentationScore", label: "Presentation", max: 500 },
  { key: "efficiencyScore", label: "Efficiency", max: 500 },
  { key: "challengeScore", label: "Secret challenge", max: 500 },
] as const;
const STEP_MS = 750;
const num = (entry: MatchResultEntry | undefined, key: string) => Number(entry?.details?.[key] ?? 0);

/** Encouragement based on what the player actually did best. */
function bestRound(entry: MatchResultEntry) {
  return [...CATEGORIES].sort((a, b) => num(entry, b.key) / b.max - num(entry, a.key) / a.max)[0]!.label;
}

/**
 * The judges' table. Every number was fixed by the server when the match ended,
 * so this sequence only reveals them. It can be skipped, and reduced motion
 * shows everything at once.
 */
export function RivalsResults({ results, selfId }: { results: MatchResults; selfId: string }) {
  const { reducedMotion } = useSettings();
  const instant = reducedMotion || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const total = CATEGORIES.length + 1;
  const [shown, setShown] = useState(instant ? total : 0);
  useEffect(() => {
    if (shown >= total) return;
    const timer = setTimeout(() => { setShown((n) => n + 1); sfx.tick(); }, shown === 0 ? 1100 : STEP_MS);
    return () => clearTimeout(timer);
  }, [shown, total]);
  const finished = shown >= total;
  const [left, right] = [results.entries.find((e) => e.playerId === selfId) ?? results.entries[0]!, results.entries.find((e) => e.playerId !== selfId) ?? results.entries[1]];
  useEffect(() => { if (finished && !instant && left.isWinner) sfx.win(); }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps
  if (results.reason === "aborted") return null;
  const tie = left.details?.result === "tie";
  const scoreSoFar = (entry: MatchResultEntry | undefined) => CATEGORIES.slice(0, Math.min(shown, CATEGORIES.length)).reduce((sum, c) => sum + num(entry, c.key), 0);
  const headline = results.reason === "players-left" ? "Your rival left the kitchen" : tie ? "A dead heat!" : left.isWinner ? "You win the duel!" : `${right?.name ?? "Your rival"} takes the duel`;
  const chef = (entry: MatchResultEntry) => <div className="cr-judge-chef" data-winner={entry.isWinner && finished}>
    <ChefCharacter id={entry.playerId} color={entry.color} mood={finished ? (entry.isWinner ? "win" : tie ? "celebrate" : "lose") : "calm"} />
    <strong>{entry.playerId === selfId ? "You" : entry.name}</strong>
    <div className="cr-judge-dish">{entry.details?.dish ? <FoodArt recipe={String(entry.details.dish)} /> : <span className="cr-no-dish">No plate served</span>}</div>
    {entry.details?.dish ? <small>{String(entry.details.dishName)} · {num(entry, "dishQuality")}%</small> : null}
    <span className="cr-total" data-testid={entry.playerId === selfId ? "cr-total-self" : "cr-total-rival"}>{scoreSoFar(entry).toLocaleString()}</span>
  </div>;
  return (
    <section className="cr-judging" data-testid="cr-judging" data-finished={finished} aria-labelledby="cr-judging-title">
      <div className="cr-judging-top"><p className="cq-eyebrow">{String(left.details?.theme ?? "")} · The judges' table</p>
        <h2 id="cr-judging-title" data-testid="cr-headline">{finished ? headline : "The judges are tasting…"}</h2>
        {!finished && <button type="button" className="cr-skip" onClick={() => setShown(total)} data-testid="cr-skip">Show all scores</button>}
      </div>
      {finished && left.isWinner && <div className="cr-confetti" aria-hidden>{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />)}</div>}
      <div className="cr-judging-chefs">{chef(left)}{right && chef(right)}</div>
      <ul className="cr-rows" aria-label="Scores by category">
        {CATEGORIES.map((category, i) => {
          const visible = i < shown; const mine = num(left, category.key); const theirs = num(right, category.key);
          return <li key={category.key} className={visible ? "cr-row-in" : "cr-row-hidden"} data-category={category.key}>
            <strong className={visible && mine > theirs ? "cr-lead" : ""}>{visible ? mine.toLocaleString() : "–"}</strong>
            <span>{category.label}{category.key === "challengeScore" && visible && <small data-testid="cr-secret">{String(left.details?.secret)}: {String(left.details?.secretText)}</small>}</span>
            <strong className={visible && theirs > mine ? "cr-lead" : ""}>{visible ? theirs.toLocaleString() : "–"}</strong>
          </li>;
        })}
      </ul>
      {finished && !left.isWinner && results.reason === "completed" && !tie && <p className="cr-encourage" data-testid="cr-encourage">Your strongest round: <strong>{bestRound(left)}</strong>. {left.score > 0 ? `Only ${Math.max(0, (right?.score ?? 0) - left.score).toLocaleString()} points between you. A rematch could change that.` : "Every chef starts somewhere. Try another basket."}</p>}
    </section>
  );
}
