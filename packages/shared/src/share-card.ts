import { getGame } from "./games/registry";
import type { SharePayload } from "./identity/share";
import { factsFromResults, insightsForResults } from "./insights";
import type { MatchResults } from "./realtime/protocol";

/**
 * What a share card shows for a finished match (docs/FUN_INSIGHTS_SYSTEM.md): a headline, a few
 * recorded numbers and up to two Fun Insights. Display names only when `includeNames` is set; no
 * answers, ids or other private details are ever included.
 */
export function sharePayloadFor(results: MatchResults, opts: { seed: string; includeNames: boolean }): SharePayload {
  const game = getGame(results.gameId);
  const playing = results.entries.filter((e) => !e.details?.left);
  const facts = factsFromResults(results);
  const insights = insightsForResults(results, opts.seed, 2).map((i) => i.text);
  const names = opts.includeNames ? playing.map((e) => e.name).slice(0, 6) : undefined;
  const base = { v: 1 as const, g: results.gameId, t: results.endedAt, p: playing.length, i: insights, ...(names ? { n: names } : {}) };
  if (results.gameId === "same-wavelength") {
    const pct = Math.max(0, Math.min(100, Math.round(Number(facts.matchPct ?? 0))));
    return {
      ...base,
      h: `${pct}% on the same wavelength`,
      m: pct,
      s: [
        ["Exact matches", `${Number(facts.exactMatches ?? 0)}/${Number(facts.comparisons ?? 0)}`],
        ["Perfect rounds", String(Number(facts.perfectRounds ?? 0))],
        ["Rounds", String(Number(facts.rounds ?? 0))],
      ],
    };
  }
  const sorted = [...playing].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const winner = top && top.isWinner ? (opts.includeNames ? `${top.name} won` : "A winner was crowned") : "A shared result";
  const stats: SharePayload["s"] = [["Players", String(playing.length)]];
  if (top) stats.push(["Top score", String(top.score)]);
  if (facts.margin !== undefined && playing.length > 1) stats.push(["Winning margin", String(facts.margin)]);
  return { ...base, h: `${winner} in ${game.name}`.slice(0, 80), s: stats };
}
