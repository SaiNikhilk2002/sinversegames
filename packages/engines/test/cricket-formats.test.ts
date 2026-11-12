import { describe, expect, it } from "vitest";
import {
  configSchema,
  CricketMatch,
  FORMATS,
  INTERNATIONAL_TEAMS,
  internationalSide,
  outsideCircle,
  powerplayFor,
  sinverseCricket,
  STEP,
  VARIATIONS_FOR,
  type CricketLog,
  type FormatBallLog,
  type FormatConfig,
  type FormatRules,
} from "../src/sinverse-cricket";
import { cfg, checkInnings, play, team } from "./cricket-format-helpers";

describe("International teams and playing elevens", () => {
  it("offers all 20 teams, each with a legal default XI, captain and keeper, playable on both sides", () => {
    expect(INTERNATIONAL_TEAMS.map((t) => t.name)).toEqual([
      "India", "Australia", "England", "Pakistan", "South Africa", "New Zealand", "Sri Lanka", "Bangladesh", "Afghanistan", "West Indies",
      "Ireland", "Zimbabwe", "Netherlands", "Scotland", "Nepal", "United Arab Emirates", "United States", "Namibia", "Oman", "Canada",
    ]);
    for (let n = 0; n < 20; n++) {
      const config = cfg("t20", n, (n + 7) % 20);
      expect(configSchema.safeParse(config).success, team(n).name).toBe(true);
      const m = new CricketMatch(n + 1, config);
      expect(m.sides[0].name).toBe(team(n).name);
      expect(m.sides[1].name).toBe(team((n + 7) % 20).name);
      expect(m.sides[0].players.map((p) => p.id)).toEqual(team(n).xi);
      expect(m.sides[0].players[m.sides[0].keeper]!.id).toBe(team(n).keeper);
      expect(m.sides[0].players[m.sides[0].captain]!.id).toBe(team(n).captain);
    }
  });
  it("plays the player's chosen XI in its batting order, and only those eleven", () => {
    const t = team(2),
      bench = t.squad.map((p) => p.id).filter((id) => !t.xi.includes(id));
    // Bring in the reserve batter for the No. 3, open with the No. 4, bat the keeper at 7.
    const xi = [t.xi[3]!, t.xi[1]!, bench.find((id) => t.squad.find((p) => p.id === id)!.role === "batter")!, t.xi[0]!, t.xi[4]!, t.xi[6]!, t.xi[5]!, t.xi[7]!, t.xi[8]!, t.xi[9]!, t.xi[10]!];
    const config = cfg("t20", 2, 5, { xi, captain: xi[0]!, keeper: t.keeper });
    expect(configSchema.safeParse(config).success).toBe(true);
    const m = play(77, config, 0, "bat");
    const mine = m.innings.find((i) => i.team === 0)!;
    expect(mine.batsmen.map((b) => b.id)).toEqual(xi);
    const theirs = m.innings.find((i) => i.team === 1)!;
    for (const b of theirs.bowlers) expect(xi).toContain(b.id);
    expect(m.sides[0].players[m.sides[0].captain]!.id).toBe(xi[0]);
  }, 120_000);
  it("rejects illegal selections and settings before a match can start", () => {
    const t = team(0);
    const bad: [string, Partial<FormatConfig>][] = [
      ["ten players", { xi: t.xi.slice(0, 10) }],
      ["a duplicate", { xi: [...t.xi.slice(0, 10), t.xi[0]!] }],
      ["another team's player", { xi: [...t.xi.slice(0, 10), team(1).xi[0]!] }],
      ["captain not playing", { captain: t.squad.find((p) => !t.xi.includes(p.id))!.id }],
      ["keeper not playing", { keeper: t.squad.find((p) => !t.xi.includes(p.id))!.id }],
      ["too few bowlers", { xi: [...t.squad.filter((p) => !p.bowls).map((p) => p.id), ...t.squad.filter((p) => p.bowls).map((p) => p.id)].slice(0, 11) }],
      ["the same opponent", { opponent: t.id }],
      ["an unknown opponent", { opponent: "atlantis" }],
    ];
    for (const [why, extra] of bad) {
      const config = { ...cfg("t20"), ...extra };
      expect(configSchema.safeParse(config).success, why).toBe(false);
      expect(sinverseCricket.verify(1, config as FormatConfig, [{ k: "toss", call: "heads", decision: "bat", t: 0 }]).ok, why).toBe(false);
    }
    expect(configSchema.safeParse({ ...cfg("t20"), format: "test" }).success).toBe(false);
    expect(configSchema.safeParse({ ...cfg("t20"), format: "t10" }).success).toBe(false);
    expect(configSchema.safeParse({ ...cfg("t20"), coins: 99 }).success).toBe(false);
    // The duel still means exactly what it meant.
    expect(configSchema.parse({})).toEqual({ version: 1, format: "duel", overs: 1, team: 0, venue: "lantern", difficulty: "club" });
  });
  it("builds sides from the catalogue: kits, fielding skills and bowlers come from the chosen players", () => {
    const side = internationalSide("new-zealand");
    expect(side.color).toBe(team(5).kits.home.shirt);
    expect(side.players.filter((p) => p.bowls).length).toBeGreaterThanOrEqual(5);
    expect(() => internationalSide("india", { xi: team(0).xi.slice(0, 10), captain: team(0).captain, keeper: team(0).keeper })).toThrow();
  });
});

describe("Format rules", () => {
  it("defines T20 and ODI playing conditions as data", () => {
    expect(FORMATS.t20).toMatchObject({ overs: 20, bowlerOvers: 4, inningsPerSide: 1, maxOutside: 5 });
    expect(FORMATS.odi).toMatchObject({ overs: 50, bowlerOvers: 10, inningsPerSide: 1, maxOutside: 5 });
    expect(FORMATS.t20.powerplays).toEqual([{ from: 1, to: 6, maxOutside: 2, label: "Powerplay" }]);
    expect(FORMATS.odi.powerplays.map((p) => [p.from, p.to, p.maxOutside])).toEqual([[1, 10, 2], [11, 40, 4], [41, 50, 5]]);
    expect(powerplayFor(FORMATS.t20, 5)?.label).toBe("Powerplay");
    expect(powerplayFor(FORMATS.t20, 6)).toBeNull();
    expect(powerplayFor(FORMATS.odi, 39)?.maxOutside).toBe(4);
    expect([outsideCircle("attack"), outsideCircle("balanced"), outsideCircle("deep"), outsideCircle("boundary")]).toEqual([2, 4, 5, 7]);
  });
  it("enforces fielding restrictions on the player's own field", () => {
    const m = new CricketMatch(3, cfg("t20"));
    m.toss({ k: "toss", call: m.tossFace, decision: "bowl", t: 0 });
    if (m.humanBatting) return;
    const slot = m.bowlerOptions()[0]!;
    const bowling = { variation: VARIATIONS_FOR[m.sides[1 - m.current.team]!.players[slot]!.bowls!][0]!, line: 0, length: 4, speed: 0.5, release: 0 };
    // Five out in the powerplay breaks the two-fielder limit.
    expect(() => m.createDelivery({ bowling, shot: null, runAt: [], field: "deep", bowler: slot })).toThrow(/restrictions/);
    expect(() => m.createDelivery({ bowling, shot: null, runAt: [], field: "balanced", bowler: slot })).toThrow(/restrictions/);
    expect(m.createDelivery({ bowling, shot: null, runAt: [], field: "attack", bowler: slot })).toBeTruthy();
  });
  it("lets the player choose each over's bowler, but only a legal one", () => {
    const m = new CricketMatch(4, cfg("t20"));
    m.toss({ k: "toss", call: m.tossFace === "heads" ? "tails" : "heads", decision: "bat", t: 0 });
    // Lose the toss: the AI chooses; find an innings where the player bowls.
    while (m.humanBatting) {
      m.simulate({ k: "sim", seq: m.seq, balls: 600, t: m.lastTime + 1000 });
      if (m.phase === "interval") m.nextInnings();
    }
    const side = m.sides[1 - m.current.team]!,
      options = m.bowlerOptions();
    expect(options).not.toContain(side.keeper);
    for (const slot of options) expect(side.players[slot]!.bowls).not.toBeNull();
    const first = options[0]!,
      bowls = side.players[first]!.bowls!,
      move = (bowler?: number, variation = VARIATIONS_FOR[bowls][0]!) => ({ bowling: { variation, line: 0, length: 4, speed: 0.5, release: 0 }, shot: null, runAt: [], field: "attack" as const, ...(bowler === undefined ? {} : { bowler }) });
    expect(() => m.createDelivery(move(side.keeper))).toThrow(/bowler/);
    const wrongType = bowls.includes("spin") ? "inswing" : "googly";
    expect(() => m.createDelivery(move(first, wrongType))).toThrow(/can't bowl/);
    let t = m.lastTime;
    for (let ball = 0; ball < 6 || m.current.balls % 6; ball++) {
      const d = m.createDelivery(move(ball === 0 ? first : undefined));
      d.complete();
      t += Math.ceil(d.tick * STEP * 1000) + 1000;
      expect(m.record({ k: "ball", seq: m.seq, ...move(ball === 0 ? first : undefined), digest: d.digest, t }, d)).toBe(true);
      if (m.phase !== "ready") return;
    }
    // A new over: the same bowler can't bowl it, and a bowler can't be named mid-over.
    expect(m.bowlerOptions()).not.toContain(first);
    expect(() => m.createDelivery(move(first))).toThrow(/bowler/);
    const next = m.bowlerOptions()[0]!;
    const d = m.createDelivery({ ...move(next, VARIATIONS_FOR[side.players[next]!.bowls!][0]!) });
    d.complete();
    expect(m.record({ k: "ball", seq: m.seq, ...move(next, VARIATIONS_FOR[side.players[next]!.bowls!][0]!), digest: d.digest, t: t + 20000 }, d)).toBe(true);
    if (m.phase === "ready" && m.current.balls % 6) expect(() => m.createDelivery(move(next, VARIATIONS_FOR[side.players[next]!.bowls!][0]!))).toThrow(/bowler/);
  });
});

describe("T20 and ODI matches end to end", () => {
  it("mixes the player's own deliveries with simulated overs, and verifies the result", () => {
    for (const format of ["t20", "odi"] as const) {
      const config = cfg(format, 3, 8);
      const m = play(321, config, format === "t20" ? 2 : 5);
      expect(m.controlled).toBeGreaterThan(0);
      expect(m.simulated).toBeGreaterThan(0);
      for (const i of m.innings) checkInnings(i, FORMATS[format]);
      const verified = sinverseCricket.verify(321, config, m.inputLog as CricketLog);
      expect(verified.ok).toBe(true);
      if (verified.ok) {
        expect(verified.result).toEqual(m.summary());
        expect(verified.result.details).toMatchObject({ format, engine: 2, team: team(3).id, opponent: team(8).id, controlledBalls: m.controlled, simulatedBalls: m.simulated });
      }
    }
  }, 120_000);
  it("counts a win as the player's only when they played enough of it themselves", () => {
    for (let s = 0; s < 40; s++) {
      const m = play(700 + s, cfg("t20", 0, 19));
      if (m.winner !== 0) continue;
      const summary = m.summary();
      expect(summary.details.result).toBe("win");
      expect(summary.completed).toBe(false);
      expect(summary.score).toBe(0);
      // Achievements read only what the player did themselves: nothing, in a simulated match.
      expect(summary.details).toMatchObject({ sixes: 0, fours: 0, wicketsTaken: 0, controlledRuns: 0, controlledBalls: 0 });
      expect(Number((summary.details as Record<string, unknown>).teamWickets)).toBeGreaterThan(0);
      return;
    }
    throw Error("no simulated win found to check");
  }, 120_000);
  it("rejects tampered, reordered, duplicated or unfinished logs", () => {
    const config = cfg("t20", 1, 4),
      m = play(55, config, 3),
      log = m.inputLog as CricketLog;
    expect(sinverseCricket.verify(55, config, log).ok).toBe(true);
    expect(sinverseCricket.verify(55, config, log.slice(0, -1)).ok).toBe(false);
    expect(sinverseCricket.verify(55, config, [...log, log.at(-1)!]).ok).toBe(false);
    const ball = log.findIndex((e) => e.k === "ball");
    const forged = structuredClone(log);
    (forged[ball] as FormatBallLog).digest = "ffffffff";
    expect(sinverseCricket.verify(55, config, forged).ok).toBe(false);
    const swapped = structuredClone(log);
    [swapped[1], swapped[2]] = [swapped[2]!, swapped[1]!];
    expect(sinverseCricket.verify(55, config, swapped).ok).toBe(false);
    // A different seed means different deliveries: the same log no longer verifies.
    expect(sinverseCricket.verify(56, config, log).ok).toBe(false);
    // A duel-shaped config can't take an international log, nor the reverse.
    expect(sinverseCricket.verify(55, configSchema.parse({}), log).ok).toBe(false);
  }, 120_000);
  it("is deterministic: the same seed, settings and inputs give the same match", () => {
    const a = play(4242, cfg("odi", 6, 11)),
      b = play(4242, cfg("odi", 6, 11));
    expect(JSON.stringify(b.innings)).toBe(JSON.stringify(a.innings));
    expect(b.result).toBe(a.result);
  }, 120_000);
});

describe("Test cricket (engine only)", () => {
  const sides = (a: number, b: number) => [internationalSide(team(a).id), internationalSide(team(b).id)] as [ReturnType<typeof internationalSide>, ReturnType<typeof internationalSide>];
  function testMatch(seed: number, rules: FormatRules = FORMATS.test, enforce = true) {
    const m = new CricketMatch(seed, cfg("t20", 0, 1), { rules, sides: sides(seed % 20, (seed + 3) % 20) });
    m.toss({ k: "toss", call: m.tossFace, decision: "bat", t: 0 });
    let t = 0;
    while (m.phase !== "finished") {
      if (m.phase === "interval") {
        if (m.followOnPending !== null) expect(m.followOn({ k: "follow-on", enforce, t: (t += 1000) })).toBe(true);
        expect(m.nextInnings()).toBe(true);
      }
      m.simulate({ k: "sim", seq: m.seq, balls: 600, t: (t += 1000) });
    }
    return m;
  }
  it("plays up to four innings with follow-on, declarations, innings victories and draws", () => {
    const kinds = new Set<string>();
    for (let s = 1; s <= 12; s++) {
      const m = testMatch(s);
      expect(m.innings.length).toBeGreaterThanOrEqual(3);
      expect(m.innings.length).toBeLessThanOrEqual(4);
      for (const i of m.innings) checkInnings(i, FORMATS.test);
      kinds.add(m.result.replace(/\d+/g, "N").replace(/^.*? won/, "won"));
      if (m.followOnEnforced) expect(m.innings[2]!.team).toBe(m.innings[1]!.team);
      if (/innings/.test(m.result)) expect(m.innings.length).toBe(3);
      const day = m.dayAndSession!;
      expect(day.day).toBeGreaterThanOrEqual(1);
      expect(day.day).toBeLessThanOrEqual(5);
    }
    expect(kinds.size).toBeGreaterThan(1);
  }, 600_000);
  it("draws when the match runs out of time", () => {
    const short: FormatRules = { ...FORMATS.test, days: 1, oversPerDay: 40 };
    const m = testMatch(5, short);
    expect(m.result).toBe("Match drawn");
    expect(m.winner).toBeNull();
    expect(m.matchBalls).toBe(240);
    expect(m.current.closed).toBe("time");
    expect(m.summary().details.result).toBe("draw");
  }, 120_000);
  it("lets the player decline the follow-on and declare an innings", () => {
    const rules: FormatRules = { ...FORMATS.test, followOn: 1 };
    const m = new CricketMatch(8, cfg("t20", 0, 19), { rules, sides: sides(0, 19) });
    m.toss({ k: "toss", call: m.tossFace, decision: "bat", t: 0 });
    let t = 0;
    // The player bats: declare once ahead.
    while (m.current.runs < 40 && m.phase === "ready") m.simulate({ k: "sim", seq: m.seq, balls: 6, t: (t += 500) });
    if (m.phase === "ready" && m.humanBatting) {
      expect(m.declare({ k: "declare", t: (t += 500) })).toBe(true);
      expect(m.current.closed).toBe("declared");
      expect(m.phase).toBe("interval");
      expect(m.nextInnings()).toBe(true);
    }
    // The AI can't be declared for, and a duel or limited-overs match can't declare.
    expect(m.declare({ k: "declare", t: (t += 500) })).toBe(false);
    const odi = new CricketMatch(8, cfg("odi"));
    odi.toss({ k: "toss", call: odi.tossFace, decision: "bat", t: 0 });
    expect(odi.declare({ k: "declare", t: 1 })).toBe(false);
    while (m.phase === "ready") m.simulate({ k: "sim", seq: m.seq, balls: 600, t: (t += 500) });
    if (m.followOnPending === 0) {
      expect(m.nextInnings()).toBe(false);
      expect(m.followOn({ k: "follow-on", enforce: false, t: (t += 500) })).toBe(true);
      expect(m.nextInnings()).toBe(true);
      expect(m.current.team).toBe(m.innings[0]!.team);
    }
  }, 120_000);
});
