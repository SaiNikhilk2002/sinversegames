import { describe, expect, it } from "vitest";
import {
  adjudicate,
  CricketMatch,
  Delivery,
  FORMATS,
  fieldAllowed,
  formatConfigSchema,
  internationalTeam,
  powerplayFor,
  RUN_DISTANCE,
  scoreDelivery,
  STEP,
  validateSelection,
  type Innings,
  type Outcome,
} from "../src/sinverse-cricket";
import { cfg } from "./cricket-format-helpers";

/**
 * Laws the release-readiness audit checked by hand (docs/CRICKET_RULES_VALIDATION.md),
 * each pinned with a regression test. International (version 2) only: the duel's
 * record is frozen by cricket-v1-golden.test.ts.
 */
const raw = (o: Partial<Omit<Outcome, "total" | "legal" | "label">> = {}, freeHit = false) =>
  adjudicate({ bat: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, wicket: null, dismissed: "striker", boundary: 0, completedRuns: 0, timing: 0, ...o }, freeHit);
function innings(): Innings {
  const m = new CricketMatch(7, cfg("t20", 0, 1));
  m.toss({ k: "toss", call: m.tossFace, decision: "bat", t: 0 });
  const i = m.current;
  // The over's bowler card, as applyFormat sets it before scoring.
  i.bowlers.push({ name: "B", slot: 8, balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0, maidens: 0 });
  i.overBowlers![0] = 0;
  return i;
}
const duelInnings = (): Innings => {
  const m = new CricketMatch(7, { version: 1, format: "duel", overs: 1, team: 0, venue: "lantern", difficulty: "club" });
  m.toss({ k: "toss", call: m.tossFace, decision: "bat", t: 0 });
  return m.current;
};
const skills = Array(11).fill(0.8);
const conditions = { difficulty: "county", venue: "lantern" } as const;

describe("international scorebook laws", () => {
  it("a no-ball counts as a ball faced; a wide doesn't (the duel keeps its original count)", () => {
    const i = innings();
    scoreDelivery(i, raw({ noBalls: 1, bat: 2, completedRuns: 2 }));
    expect(i.batsmen[0]!.balls).toBe(1);
    expect(i.batsmen[0]!.runs).toBe(2);
    scoreDelivery(i, raw({ wides: 1 }));
    expect(i.batsmen[0]!.balls).toBe(1);
    expect(i.balls).toBe(0);
    const d = duelInnings();
    scoreDelivery(d, raw({ noBalls: 1 }));
    expect(d.batsmen[0]!.balls).toBe(0);
  });

  it("strike changes on odd runs and at the end of each over", () => {
    const i = innings();
    scoreDelivery(i, raw({ bat: 1, completedRuns: 1 }));
    expect([i.striker, i.nonStriker]).toEqual([1, 0]);
    scoreDelivery(i, raw({ byes: 2, completedRuns: 2 }));
    expect([i.striker, i.nonStriker]).toEqual([1, 0]);
    scoreDelivery(i, raw({ wides: 2, completedRuns: 1 }));
    expect([i.striker, i.nonStriker]).toEqual([0, 1]);
    scoreDelivery(i, raw({ bat: 4, boundary: 4 }));
    expect([i.striker, i.nonStriker]).toEqual([0, 1]);
    // Three legal balls so far (the wide is bowled again); two dots make five.
    for (let n = 0; n < 2; n++) scoreDelivery(i, raw());
    expect(i.balls).toBe(5);
    scoreDelivery(i, raw());
    // End of the over: the batters stay put, the bowling end changes, so the other batter faces.
    expect(i.balls).toBe(6);
    expect([i.striker, i.nonStriker]).toEqual([1, 0]);
  });

  it("a maiden is a complete over with no runs charged to the bowler (byes and leg-byes don't count)", () => {
    const i = innings();
    scoreDelivery(i, raw({ byes: 1, completedRuns: 1 }));
    for (let n = 0; n < 4; n++) scoreDelivery(i, raw());
    scoreDelivery(i, raw({ legByes: 4, boundary: 4 }));
    expect(i.bowlers[0]).toMatchObject({ balls: 6, runs: 0, maidens: 1 });
    // A wide is charged to the bowler, so the next over isn't a maiden.
    i.bowlers.push({ name: "C", slot: 9, balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0, maidens: 0 });
    i.overBowlers![1] = 1;
    scoreDelivery(i, raw({ wides: 1 }));
    for (let n = 0; n < 6; n++) scoreDelivery(i, raw());
    expect(i.bowlers[1]).toMatchObject({ balls: 6, runs: 1, wides: 1, maidens: 0 });
  });

  it("extras: wides and no-balls are charged to the bowler, byes and leg-byes are not", () => {
    const i = innings();
    scoreDelivery(i, raw({ wides: 5, boundary: 4 }));
    scoreDelivery(i, raw({ noBalls: 1, bat: 6, boundary: 6 }));
    scoreDelivery(i, raw({ noBalls: 1, byes: 2, completedRuns: 2 }));
    scoreDelivery(i, raw({ legByes: 1, completedRuns: 1 }));
    expect(i.extras).toEqual({ wides: 5, noBalls: 2, byes: 2, legByes: 1 });
    expect(i.runs).toBe(5 + 7 + 3 + 1);
    expect(i.bowlers[0]!.runs).toBe(5 + 7 + 1);
    expect(i.balls).toBe(1);
  });

  it("a free hit follows a no-ball, survives a wide, and allows only a run-out", () => {
    const i = innings();
    scoreDelivery(i, raw({ noBalls: 1 }));
    expect(i.freeHit).toBe(true);
    scoreDelivery(i, raw({ wides: 1 }));
    expect(i.freeHit).toBe(true);
    expect(raw({ wicket: "caught" }, true).wicket).toBeNull();
    expect(raw({ wicket: "bowled" }, true).wicket).toBeNull();
    expect(raw({ wicket: "lbw" }, true).wicket).toBeNull();
    expect(raw({ wicket: "stumped" }, true).wicket).toBeNull();
    expect(raw({ wicket: "run-out", dismissed: "non-striker" }, true).wicket).toBe("run-out");
    scoreDelivery(i, raw());
    expect(i.freeHit).toBe(false);
    // Off a wide, only stumping and run-out stand.
    expect(raw({ wides: 1, wicket: "stumped" }).wicket).toBe("stumped");
    expect(raw({ wides: 1, wicket: "bowled" }).wicket).toBeNull();
  });

  it("after a caught dismissal the new batter takes strike, unless the over has ended", () => {
    const i = innings();
    scoreDelivery(i, raw({ wicket: "caught" }));
    expect([i.striker, i.nonStriker]).toEqual([2, 1]);
    for (let n = 0; n < 4; n++) scoreDelivery(i, raw());
    scoreDelivery(i, raw({ wicket: "caught" }));
    expect(i.balls).toBe(6);
    expect([i.striker, i.nonStriker]).toEqual([1, 3]);
  });

  it("after a run-out the new batter comes in at the broken wicket (the striker's end), on strike", () => {
    const i = innings();
    // Non-striker run out going for a second run, after one was completed: the striker, now at the bowler's end, stays there.
    scoreDelivery(i, raw({ wicket: "run-out", dismissed: "non-striker", bat: 1, completedRuns: 1 }));
    expect(i.batsmen[1]!.dismissal).toBeTruthy();
    expect([i.striker, i.nonStriker]).toEqual([2, 0]);
    expect(i.runs).toBe(1);
    expect(i.partnerships!.at(-1)).toMatchObject({ a: 2, b: 0 });
  });

  it("a run-out before the batters cross dismisses the batter who left the wicket that was broken", () => {
    // A soft push and a late call: the throw beats the non-striker's partner before they cross.
    const bowling = { variation: "seam", line: 0, length: 4, speed: 0.4, release: 0 } as const,
      shot = { kind: "straight", direction: -30, power: 0.15, foot: 0, face: 0, tick: 153 } as const;
    const d = new Delivery(2, bowling, "attack", conditions, false, shot, [360], false, 1, skills);
    const o = d.complete();
    expect(o.wicket).toBe("run-out");
    expect(d.runProgress).toBeLessThan(RUN_DISTANCE / 2);
    expect(o.dismissed).toBe("striker");
    // The duel keeps its original simplification (always the batter running to that end).
    const duel = new Delivery(2, bowling, "attack", conditions, false, shot, [360], false, 1);
    expect(duel.complete().dismissed).toBe("non-striker");
  });

  it("runs taken off a ball that is both wide and a no-ball are no-ball extras plus byes (Law 21.14)", () => {
    const d = new Delivery(1, { variation: "seam", line: 1.5, length: 8.5, speed: 0, release: 1 }, "attack", conditions, false, null, [300], false, 1, skills);
    const o = d.complete();
    expect(d.wide && d.noBall).toBe(true);
    expect(d.runs).toBeGreaterThan(0);
    expect(o).toMatchObject({ noBalls: 1, wides: 0, byes: d.runs, total: 1 + d.runs, legal: false });
  });
});

describe("server efficiency without trust", () => {
  it("a forked delivery continues exactly as a fresh one with the same running plan", () => {
    const bowling = { variation: "seam", line: 0, length: 4, speed: 0.4, release: 0 } as const,
      shot = { kind: "straight", direction: -30, power: 0.3, foot: 0, face: 0, tick: 153 } as const;
    for (const plan of [[200], [200, 350], [200, 350, 500]]) {
      const fresh = new Delivery(2, bowling, "attack", conditions, false, shot, plan, false, 1, skills);
      const base = new Delivery(2, bowling, "attack", conditions, false, shot, plan.slice(0, -1), false, 1, skills);
      while (base.tick < plan.at(-1)! && !base.outcome) base.step();
      expect(base.outcome).toBeNull();
      const forked = base.fork(plan);
      const a = fresh.complete(),
        b = forked.complete();
      expect(forked.digest).toBe(fresh.digest);
      expect(forked.tick).toBe(fresh.tick);
      expect(b).toEqual(a);
      expect(forked.chaser).toBe(fresh.chaser);
    }
    // A fork can't rewrite run calls the delivery has already processed or passed.
    const late = new Delivery(2, bowling, "attack", conditions, false, shot, [], false, 1, skills);
    while (late.tick < 260 && !late.outcome) late.step();
    expect(late.outcome).toBeNull();
    expect(() => late.fork([200])).toThrow();
    expect(() => new Delivery(2, bowling, "attack", conditions, false, shot, [], true, 1, skills).fork([200])).toThrow();
  });
});

describe("playing XI and bowling laws", () => {
  it("rejects an XI whose wicketkeeper is one of only five bowlers", () => {
    const t = internationalTeam("india")!,
      bowler = t.xi.find((id) => t.squad.find((p) => p.id === id)!.bowls)!;
    expect(validateSelection(t, { xi: t.xi, captain: t.captain, keeper: bowler })[0]).toMatch(/wicketkeeper can't bowl/);
    expect(formatConfigSchema.safeParse(cfg("t20", 0, 1, { keeper: bowler })).success).toBe(false);
    // With a sixth bowler picked, a bowling keeper is fine.
    const sixth = t.squad.find((p) => p.bowls && !t.xi.includes(p.id))!.id,
      batter = t.xi.find((id) => !t.squad.find((p) => p.id === id)!.bowls && id !== t.keeper && id !== t.captain)!;
    const xi = t.xi.map((id) => (id === batter ? sixth : id));
    expect(validateSelection(t, { xi, captain: t.captain, keeper: bowler })).toEqual([]);
  });

  it("fielding restrictions change exactly at each powerplay boundary", () => {
    const t20 = FORMATS.t20,
      odi = FORMATS.odi;
    expect(powerplayFor(t20, 5)?.label).toBe("Powerplay");
    expect(powerplayFor(t20, 6)).toBeNull();
    expect(fieldAllowed(t20, 5, "balanced")).toBe(false);
    expect(fieldAllowed(t20, 6, "balanced")).toBe(true);
    expect(fieldAllowed(t20, 19, "deep")).toBe(true);
    expect(powerplayFor(odi, 9)?.label).toBe("Powerplay 1");
    expect(powerplayFor(odi, 10)?.label).toBe("Powerplay 2");
    expect(powerplayFor(odi, 39)?.label).toBe("Powerplay 2");
    expect(powerplayFor(odi, 40)?.label).toBe("Powerplay 3");
    expect(fieldAllowed(odi, 9, "balanced")).toBe(false);
    expect(fieldAllowed(odi, 10, "balanced")).toBe(true);
    expect(fieldAllowed(odi, 39, "deep")).toBe(false);
    expect(fieldAllowed(odi, 40, "deep")).toBe(true);
  });

  it("the player's deliberate no-balls are bowled again and don't count towards the balls that make a win theirs", () => {
    const m = new CricketMatch(11, cfg("t20", 0, 1));
    m.toss({ k: "toss", call: m.tossFace, decision: "bowl", t: 0 });
    if (m.humanBatting) m.simulate({ k: "sim", seq: m.seq, balls: 600, t: 1 });
    if (m.phase === "interval") m.nextInnings();
    expect(m.humanBatting).toBe(false);
    let t = 1000;
    const slot = m.bowlerOptions()[0]!,
      bowls = m.sides[0]!.players[slot]!.bowls!;
    for (let n = 0; n < 3; n++) {
      const move = { bowling: { variation: bowls.includes("spin") ? (bowls === "off-spin" ? "offbreak" : "legbreak") : "seam", line: 0, length: 4, speed: 0.5, release: 1 } as const, shot: null, runAt: [], field: "attack" as const, ...(n === 0 ? { bowler: slot } : {}) };
      const d = m.createDelivery(move);
      const o = d.complete();
      t += Math.ceil(d.tick * STEP * 1000) + 500;
      expect(m.record({ k: "ball", seq: m.seq, ...move, digest: d.digest, t }, d)).toBe(true);
      expect(o.noBalls).toBe(1);
    }
    expect(m.controlled).toBe(0);
    expect(m.controlledExtras).toBe(3);
    expect(m.current.balls).toBe(0);
  });
});
