import { describe, expect, it } from "vitest";
import { CricketMatch, FORMATS, fieldAllowed, internationalSide, type FormatConfig, type FormatRules } from "../src/sinverse-cricket";
import { cfg } from "./cricket-format-helpers";

/**
 * The AI opposition (docs/CRICKET_AI_OPPONENT_REPORT.md): it plays through the
 * same legal inputs as the player, and the difficulty changes how well it
 * decides and executes, never an outcome. Deterministic: fixed seeds.
 */
function walk(seed: number, config: FormatConfig, each: (m: CricketMatch) => void) {
  const m = new CricketMatch(seed, config);
  m.toss({ k: "toss", call: m.tossFace, decision: seed % 2 ? "bat" : "bowl", t: 0 });
  let t = 0;
  while (m.phase !== "finished") {
    if (m.phase === "interval") m.nextInnings();
    each(m);
    m.simulate({ k: "sim", seq: m.seq, balls: 1, t: (t += 10) });
  }
  return m;
}
function simulated(seed: number, config: FormatConfig) {
  const m = new CricketMatch(seed, config);
  m.toss({ k: "toss", call: m.tossFace, decision: seed % 2 ? "bat" : "bowl", t: 0 });
  let t = 0;
  while (m.phase !== "finished") {
    if (m.phase === "interval") m.nextInnings();
    m.simulate({ k: "sim", seq: m.seq, balls: 600, t: (t += 10) });
  }
  return m;
}

describe("the AI opposition plays by the rules", () => {
  for (const format of ["t20", "odi"] as const)
    it(`${format}: every AI field is legal for its over and every AI bowler is a legal choice`, () => {
      const rules = FORMATS[format];
      let checked = 0;
      for (const difficulty of ["club", "elite"] as const)
        walk(format === "t20" ? 31 : 32, cfg(format, 4, 11, { difficulty }), (m) => {
          const over = Math.floor(m.current.balls / 6);
          expect(fieldAllowed(rules, over, m.fieldForAI())).toBe(true);
          if (m.current.balls % 6 === 0 && m.current.overBowlers![over] === undefined) expect(m.bowlerOptions()).toContain(m.bowlerForAI());
          checked++;
        });
      expect(checked).toBeGreaterThan(format === "t20" ? 300 : 800);
    }, 300_000);

  it("protects the boundary at the death and attacks only where the restrictions allow", () => {
    const m = new CricketMatch(5, cfg("t20", 0, 1, { difficulty: "elite" }));
    m.toss({ k: "toss", call: m.tossFace, decision: "bowl", t: 0 });
    expect(m.fieldForAI()).toBe("attack");
    m.simulate({ k: "sim", seq: m.seq, balls: 96, t: 1 });
    if (m.phase === "ready" && m.current.balls >= 96) expect(m.fieldForAI()).toBe("deep");
  });

  it("elite captains keep overs from their best seamers for the death", () => {
    // Over the first 16 overs of a T20, an elite captain uses his two best seamers less than a club captain does.
    const deathOvers = (difficulty: FormatConfig["difficulty"]) => {
      let saved = 0;
      for (const seed of [3, 5, 7, 9]) {
        const m = new CricketMatch(seed, cfg("t20", 2, 6, { difficulty }));
        m.toss({ k: "toss", call: m.tossFace, decision: "bat", t: 0 });
        // The opposition must bowl the first innings for its captain to be measured.
        if (!m.humanBatting) continue;
        m.simulate({ k: "sim", seq: m.seq, balls: 600, t: 1 });
        const i = m.innings[0]!,
          side = m.sides[1]!;
        const seamers = side.players
          .map((p, slot) => ({ p, slot }))
          .filter(({ p, slot }) => p.bowls && !p.bowls.includes("spin") && slot !== side.keeper)
          .sort((a, b) => b.p.bowling - a.p.bowling || a.slot - b.slot)
          .slice(0, 2)
          .map(({ slot }) => slot);
        saved += i.overBowlers!.slice(16).filter((card) => seamers.includes(i.bowlers[card]!.slot!)).length;
      }
      return saved;
    };
    expect(deathOvers("elite")).toBeGreaterThan(deathOvers("club"));
  }, 120_000);
});

describe("difficulty changes decision quality, not outcomes", () => {
  it("better bowling: more balls on a good length, and fewer extras, as the level rises", () => {
    const plan = (difficulty: FormatConfig["difficulty"]) => {
      const m = new CricketMatch(17, cfg("odi", 0, 1, { difficulty }));
      m.toss({ k: "toss", call: m.tossFace, decision: "bat", t: 0 });
      // The player bats, so the opposition bowls: sample its deliveries for the coming ball at many sequence numbers.
      if (!m.humanBatting) m.simulate({ k: "sim", seq: m.seq, balls: 600, t: 1 }), m.nextInnings();
      expect(m.humanBatting).toBe(true);
      const slot = m.bowlerForAI();
      let good = 0,
        extras = 0;
      for (let seq = 0; seq < 1500; seq++) {
        m.seq = seq;
        const b = m.bowlingForAI(slot);
        if (b.length >= 2.3 && b.length <= 3.8) good++;
        if (Math.abs(b.line) >= 1.2 || b.release > 0.5) extras++;
      }
      return { good, extras };
    };
    const club = plan("club"),
      county = plan("county"),
      elite = plan("elite");
    expect(elite.good).toBeGreaterThan(county.good);
    expect(county.good).toBeGreaterThan(club.good);
    expect(club.extras).toBeGreaterThan(elite.extras);
  });

  it("over whole simulated matches, a stronger opposition wins more and concedes fewer extras", () => {
    const rate = (difficulty: FormatConfig["difficulty"]) => {
      let theirWins = 0,
        extras = 0;
      for (let s = 0; s < 12; s++) {
        const m = simulated(900 + s, cfg("t20", (s * 3) % 20, (s * 3 + 7) % 20, { difficulty }));
        if (m.winner === 1) theirWins++;
        const bowled = m.innings.find((i) => i.team === 0)!;
        extras += bowled.extras.wides + bowled.extras.noBalls;
      }
      return { theirWins, extras };
    };
    const club = rate("club"),
      elite = rate("elite");
    expect(elite.theirWins).toBeGreaterThan(club.theirWins);
    expect(elite.extras).toBeLessThan(club.extras);
  }, 300_000);

  it("the player's own side is never played at the opposition's level in a simulated passage", () => {
    // Simulating the player's innings at "elite" and at "club" bowls the same opposition deliveries? No: the opposition differs,
    // but the player's side's batting AI is the neutral county level either way, so its decisions use the same precision.
    const m = new CricketMatch(4, cfg("t20", 0, 1, { difficulty: "elite" }));
    m.toss({ k: "toss", call: m.tossFace, decision: "bat", t: 0 });
    const skill = (m as unknown as { skillFor(team: number): string }).skillFor.bind(m);
    expect(skill(0)).toBe("county");
    expect(skill(1)).toBe("elite");
  });
});

describe("Test cricket clock", () => {
  it("reports the last day, not a sixth, once every over of the match is bowled", () => {
    const rules: FormatRules = { ...FORMATS.test, days: 1, oversPerDay: 30 };
    const m = new CricketMatch(6, cfg("t20", 0, 1), { rules, sides: [internationalSide("india"), internationalSide("australia")] });
    m.toss({ k: "toss", call: m.tossFace, decision: "bat", t: 0 });
    let t = 0;
    while (m.phase !== "finished") {
      if (m.phase === "interval") m.nextInnings();
      m.simulate({ k: "sim", seq: m.seq, balls: 600, t: (t += 10) });
    }
    expect(m.result).toBe("Match drawn");
    expect(m.dayAndSession).toEqual({ day: 1, session: 3 });
  }, 120_000);
});
