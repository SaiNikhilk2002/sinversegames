"use client";

import { Star } from "lucide-react";
import type { MatchResults } from "@platform/shared";
import { ChefCharacter } from "../chef-rivals/chef";
import "../chef-rivals/chef-rivals.css";
import "./kitchen-rush-coop.css";

/** A team result: one shared score, and stats that celebrate working together. Everything comes from the server. */
export function CoopResults({ results, selfId }: { results: MatchResults; selfId: string }) {
  if (results.reason === "aborted") return null;
  const first = results.entries[0];
  const d = first?.details ?? {};
  const stars = Number(d.stars ?? 0);
  const won = stars >= 1;
  const stats: [string, string | number][] = [["Orders served", String(d.served ?? 0)], ["Wrong dishes", String(d.wrong ?? 0)], ["Guests lost", String(d.missed ?? 0)], ["Burnt food", String(d.burnt ?? 0)], ["Food wasted", String(d.wasted ?? 0)], ["Food passed between chefs", String(d.handoffs ?? 0)], ["Best combo", `×${Math.max(1, Number(d.bestCombo ?? 1))}`]];
  return (
    <section className="kc-results" data-testid="kc-results" aria-labelledby="kc-results-title">
      <p className="kc-results-eyebrow">{String(d.kitchen ?? "Kitchen")}</p>
      <h2 id="kc-results-title" data-testid="kc-results-title">{won ? "Service complete. Nice work, team!" : "Tough shift. Regroup and go again."}</h2>
      <div className="kc-results-stars" aria-label={`${stars} of 3 stars`} data-testid="kc-results-stars">{[1, 2, 3].map((n) => <Star key={n} size={30} fill={n <= stars ? "currentColor" : "none"} opacity={n <= stars ? 1 : 0.3} />)}</div>
      <p className="kc-results-score"><strong data-testid="kc-team-score">{Number(d.teamScore ?? first?.score ?? 0).toLocaleString()}</strong> team points</p>
      <div className="kc-crew kc-results-crew">{results.entries.map((entry) => <div key={entry.playerId}><ChefCharacter id={entry.playerId} color={entry.color} mood={entry.details?.left ? "calm" : won ? "win" : "lose"} /><strong>{entry.playerId === selfId ? "You" : entry.name}</strong>{entry.details?.left ? <small>Left early</small> : null}</div>)}</div>
      <dl className="kc-results-stats">{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </section>
  );
}
