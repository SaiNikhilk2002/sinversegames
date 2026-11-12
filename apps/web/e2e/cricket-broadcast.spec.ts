import { expect, test } from "@playwright/test";
import type { Innings, Outcome } from "@platform/engines/sinverse-cricket";
import { broadcastCards, figures, newIntroMemo, standouts, type BroadcastInput } from "../src/games/sinverse-cricket/broadcast";

/** Broadcast graphics come from the scorebook, only between deliveries, and leave on their own. */

const batter = (name: string, runs = 0, balls = 0, dismissal: string | null = null) => ({ name, runs, balls, fours: 0, sixes: 0, dismissal });
function innings(over: Partial<Innings> = {}): Innings {
  return {
    team: 0,
    runs: 31,
    wickets: 1,
    balls: 6,
    striker: 2,
    nonStriker: 1,
    nextBatter: 3,
    batsmen: [batter("Ari Vale", 14, 5, "bowled"), batter("Nilan Moss", 17, 9), batter("Kai Rowe", 0, 0), ...Array.from({ length: 8 }, (_, n) => batter(`Batter ${n + 4}`))],
    bowlers: [
      { name: "Soren Pike", balls: 6, runs: 31, wickets: 1, wides: 0, noBalls: 0 },
      { name: "Neel Cedar", balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 },
    ],
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0 },
    fall: [{ score: 31, wicket: 1, ball: "0.6", batter: "Ari Vale" }],
    over: [],
    partnership: 0,
    freeHit: false,
    ...over,
  };
}
const outcome = (o: Partial<Outcome>): Outcome => ({ bat: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, total: 0, legal: true, wicket: null, dismissed: "striker", boundary: 0, completedRuns: 0, timing: 0, label: "0", ...o });
const history = ["4", "1", "6", "0", "4", "BOWLED"].map((label, n) => ({ innings: 1, ball: `0.${n + 1}`, label, runs: label === "BOWLED" ? 0 : Number(label), wicket: label === "BOWLED" ? "bowled" : null }));
const base = (o: Partial<BroadcastInput> = {}): BroadcastInput => ({ now: 10000, endedAt: 9000, settled: true, live: false, replay: false, ready: true, innings: innings(), inningsNo: 1, history, outcome: outcome({ wicket: "bowled", label: "BOWLED" }), carry: null, batting: "Harbour Lights", fielding: "Granite Comets", ...o });

test("a wicket card names the batter, how they went and the fall of wicket", () => {
  const cards = broadcastCards(base(), newIntroMemo());
  expect(cards[0]).toMatchObject({ kind: "wicket", batter: "Ari Vale", how: "Bowled", runs: 14, balls: 5, fall: "31/1 · 0.6 ov" });
});
test("the end of an over follows the event card, with every ball of the over", () => {
  const memo = newIntroMemo();
  expect(broadcastCards(base({ now: 9000 + 1000 }), memo).map((c) => c.kind)).toEqual(["wicket"]);
  const later = broadcastCards(base({ now: 9000 + 3500 }), memo).find((c) => c.kind === "over");
  expect(later).toMatchObject({ kind: "over", over: 1, balls: ["4", "1", "6", "0", "4", "BOWLED"], runs: 15, bowler: "Soren Pike", figures: "1.0-31-1" });
});
test("a six measures how far it carried; a four doesn't invent one", () => {
  const six = broadcastCards(base({ outcome: outcome({ boundary: 6, bat: 6, total: 6, label: "6" }), carry: 71.4, innings: innings({ balls: 4, fall: [] }) }), newIntroMemo());
  expect(six[0]).toMatchObject({ kind: "six", carry: 71.4, batter: "Kai Rowe" });
  const four = broadcastCards(base({ outcome: outcome({ boundary: 4, bat: 4, total: 4, label: "4" }), carry: 50, innings: innings({ balls: 4, fall: [] }) }), newIntroMemo());
  expect(four[0]).toMatchObject({ kind: "four", carry: null });
});
test("the new batter is introduced once, after the event, and never during a live ball or a replay", () => {
  const memo = newIntroMemo();
  // While the wicket card is up the lower third waits.
  expect(broadcastCards(base({ now: 9500 }), memo).some((c) => c.kind === "batter")).toBe(false);
  const shown = broadcastCards(base({ now: 9000 + 8000 }), memo).find((c) => c.kind === "batter");
  expect(shown).toMatchObject({ kind: "batter", name: "Kai Rowe", order: 3, team: "Harbour Lights" });
  // It doesn't come back.
  expect(broadcastCards(base({ now: 9000 + 30000 }), memo).some((c) => c.kind === "batter")).toBe(false);
  expect(broadcastCards(base({ live: true, settled: false, outcome: null, now: 9000 + 8000 }), newIntroMemo()).length).toBe(0);
  expect(broadcastCards(base({ replay: true }), newIntroMemo()).length).toBe(0);
});
test("at most one event card and one lower third at a time", () => {
  const memo = newIntroMemo();
  for (let t = 0; t < 20000; t += 250) {
    const cards = broadcastCards(base({ now: 9000 + t }), memo);
    expect(cards.filter((c) => c.kind === "batter" || c.kind === "bowler").length).toBeLessThanOrEqual(1);
    expect(cards.filter((c) => c.kind === "wicket" || c.kind === "four" || c.kind === "six").length).toBeLessThanOrEqual(1);
  }
});
test("standouts and figures come straight from the scorecard", () => {
  expect(figures({ name: "x", balls: 8, runs: 12, wickets: 2, wides: 0, noBalls: 0 })).toBe("1.2-12-2");
  const s = standouts(innings());
  expect(s.bat?.name).toBe("Nilan Moss");
  expect(s.bowl?.name).toBe("Soren Pike");
});
