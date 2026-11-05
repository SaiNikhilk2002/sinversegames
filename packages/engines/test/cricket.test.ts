import { calibratedShot, playMatch } from "./cricket-fixtures";
import { describe, expect, it } from "vitest";
import {
  adjudicate,
  BALL_RADIUS,
  ballLogSchema,
  batContact,
  boundaryCrossed,
  configSchema,
  CricketMatch,
  Delivery,
  integrateBall,
  licensedContent,
  logSchema,
  ORIGINAL_CONTENT,
  RELEASE_TICK,
  RUN_DISTANCE,
  sinverseCricket,
  scoreDelivery,
  STUMPS_Z,
  STEP,
  stumpIntersection,
  TEAMS,
  totalExtras,
  vec,
  type BallLog,
  type BowlingInput,
  type CricketLog,
  type Outcome,
  type ShotInput,
} from "../src/sinverse-cricket";

const config = configSchema.parse({});
const bowling: BowlingInput = {
  variation: "seam",
  line: 0,
  length: 4,
  speed: 0.2,
  release: 0,
};
const shot: ShotInput = {
  kind: "loft",
  direction: 0,
  power: 1,
  foot: 0,
  face: 0,
  tick: 165,
};
const raw = {
  bat: 0,
  wides: 0,
  noBalls: 0,
  byes: 0,
  legByes: 0,
  wicket: null,
  dismissed: "striker",
  boundary: 0,
  completedRuns: 0,
  timing: 0,
} as const;

describe("Cricket explicit duel rules and scorekeeping", () => {
  it("completes a two-over duel with separate six-ball bowler quotas and verified result", () => {
    const rules = {...config,overs:2 as const}, game = playMatch(5,true,rules);
    expect(game.phase).toBe("finished");
    expect(game.innings[0]!.balls).toBe(12);
    expect(game.innings[0]!.bowlers.map(b=>b.balls)).toEqual([6,6]);
    for(const i of game.innings)expect(i.bowlers.every(b=>b.balls<=6)).toBe(true);
    const checked=sinverseCricket.verify(5,rules,game.inputLog);expect(checked.ok).toBe(true);
    if(checked.ok)expect(checked.result).toEqual(game.summary());
  });
  it("rotates odd runs and over ends separately, then uses the next bowler", () => {
    const m = new CricketMatch(1, { ...config, overs: 2 });
    m.toss({ k: "toss", call: m.tossFace, decision: "bat", t: 0 });
    const i = m.current;
    scoreDelivery(i, adjudicate({ ...raw, bat: 1, completedRuns: 1 }, false));
    expect([i.striker, i.nonStriker]).toEqual([1, 0]);
    for (let n = 0; n < 5; n++) scoreDelivery(i, adjudicate(raw, false));
    expect([i.balls, i.striker, i.nonStriker]).toEqual([6, 0, 1]);
    expect(i.over).toEqual([]);
    scoreDelivery(i, adjudicate({ ...raw, bat: 4, boundary: 4 }, false));
    expect(i.bowlers.map((b) => b.balls)).toEqual([6, 1]);
    expect(i.bowlers.map((b) => b.runs)).toEqual([1, 4]);
  });
  it("replaces the actual run-out batter after completed odd runs and never credits the bowler", () => {
    const m = new CricketMatch(1, config);
    m.toss({ k: "toss", call: m.tossFace, decision: "bat", t: 0 });
    scoreDelivery(
      m.current,
      adjudicate(
        {
          ...raw,
          bat: 1,
          completedRuns: 1,
          wicket: "run-out",
          dismissed: "non-striker",
        },
        false,
      ),
    );
    expect([m.current.striker, m.current.nonStriker]).toEqual([2, 0]);
    expect(m.current.batsmen[1]!.dismissal).toBe("run-out");
    expect(m.current.bowlers[0]!.wickets).toBe(0);
  });
  it("accounts extras independently and preserves the free hit until a legal ball", () => {
    const m = new CricketMatch(1, config);
    m.toss({ k: "toss", call: m.tossFace, decision: "bat", t: 0 });
    const i = m.current;
    scoreDelivery(i, adjudicate({ ...raw, noBalls: 1 }, false));
    scoreDelivery(i, adjudicate({ ...raw, wides: 1 }, true));
    expect(i.freeHit).toBe(true);
    scoreDelivery(i, adjudicate({ ...raw, byes: 2, completedRuns: 2 }, true));
    expect(i.freeHit).toBe(false);
    scoreDelivery(
      i,
      adjudicate({ ...raw, legByes: 1, completedRuns: 1 }, false),
    );
    expect(i.extras).toEqual({ wides: 1, noBalls: 1, byes: 2, legByes: 1 });
    expect(i.runs).toBe(5);
    expect(i.bowlers[0]!.runs).toBe(2);
    expect(i.balls).toBe(2);
  });
  it("puts a caught incoming batter on strike before the end-of-over change", () => {
    const m = new CricketMatch(1, config);
    m.toss({ k: "toss", call: m.tossFace, decision: "bat", t: 0 });
    const i = m.current;
    for (let n = 0; n < 5; n++) scoreDelivery(i, adjudicate(raw, false));
    scoreDelivery(i, adjudicate({ ...raw, wicket: "caught" }, false));
    expect([i.striker, i.nonStriker]).toEqual([1, 2]);
    expect(i.batsmen[0]!.dismissal).toBe("caught");
    expect(i.bowlers[0]!.wickets).toBe(1);
  });
  it("accepts only the implemented versioned duel formats", () => {
    expect(config.overs).toBe(1);
    expect(configSchema.safeParse({ format: "test", overs: 20 }).success).toBe(
      false,
    );
    expect(configSchema.safeParse({ overs: 50 }).success).toBe(false);
    expect(configSchema.safeParse({ money: 999 }).success).toBe(false);
  });
  it("makes no-ball take precedence over wide and carries its penalty", () => {
    expect(
      adjudicate({ ...raw, bat: 6, boundary: 6, noBalls: 1, wides: 1 }, false),
    ).toMatchObject({ total: 7, legal: false, wides: 0 });
  });
  it.each(["bowled", "caught", "lbw", "stumped"] as const)(
    "protects %s on a no-ball and on a free hit",
    (wicket) => {
      expect(
        adjudicate({ ...raw, wicket, noBalls: 1 }, false).wicket,
      ).toBeNull();
      expect(adjudicate({ ...raw, wicket }, true).wicket).toBeNull();
    },
  );
  it("allows a real run-out on a free hit and credits only completed runs", () => {
    expect(
      adjudicate(
        { ...raw, bat: 1, completedRuns: 1, wicket: "run-out", noBalls: 1 },
        true,
      ),
    ).toMatchObject({ total: 2, wicket: "run-out", completedRuns: 1 });
  });
  it("does not credit batting runs or crossed runs for a completed catch", () => {
    expect(
      adjudicate({ ...raw, wicket: "caught", bat: 2, completedRuns: 2 }, false),
    ).toMatchObject({ bat: 0, total: 0, completedRuns: 0 });
  });
  it("plays two complete innings and conserves scorecard totals", () => {
    const match = playMatch(91);
    expect(match.phase).toBe("finished");
    expect(match.innings).toHaveLength(2);
    expect(match.innings[0]!.balls).toBe(6);
    for (const innings of match.innings) {
      expect(innings.runs).toBe(
        innings.batsmen.reduce((n, b) => n + b.runs, 0) + totalExtras(innings),
      );
      expect(innings.bowlers.reduce((n, b) => n + b.balls, 0)).toBe(
        innings.balls,
      );
      expect(
        innings.bowlers.reduce((n, b) => n + b.runs, 0) +
          innings.extras.byes +
          innings.extras.legByes,
      ).toBe(innings.runs);
      expect(innings.fall).toHaveLength(innings.wickets);
    }
    expect(match.result).toMatch(/won|tied/);
  });
  it("is fair at the toss, preserves the two original team identities and decides the chase", () => {
    const m = playMatch(8);
    expect(m.firstBat).toBe(config.team);
    expect(m.target).toBe(m.innings[0]!.runs + 1);
    expect(TEAMS.map((t) => t.players.length)).toEqual([11, 11]);
    const other = new CricketMatch(8, config);
    other.toss({
      k: "toss",
      call: other.tossFace === "heads" ? "tails" : "heads",
      decision: "bat",
      t: 0,
    });
    expect(other.tossWinner).toBe(1);
  });
  it("rejects stale, wrong-team, extra-field, duplicate and unfinished logs", () => {
    const m = playMatch(12),
      log = m.inputLog;
    expect(sinverseCricket.verify(12, config, log).ok).toBe(true);
    expect(sinverseCricket.verify(12, config, log.slice(0, -1)).ok).toBe(false);
    expect(sinverseCricket.verify(12, config, [...log, log.at(-1)!]).ok).toBe(
      false,
    );
    const forged = structuredClone(log);
    (forged[1] as BallLog).seq = 9;
    expect(sinverseCricket.verify(12, config, forged).ok).toBe(false);
    expect(ballLogSchema.safeParse({ ...log[1], score: 99999 }).success).toBe(
      false,
    );
    expect(logSchema.safeParse([{ ...log[0], t: Infinity }]).success).toBe(
      false,
    );
  });
  it("does not count wides as one of six legal balls", () => {
    const m = new CricketMatch(5, config);
    m.toss({ k: "toss", call: m.tossFace, decision: "bowl", t: 0 });
    const input = {
      bowling: { ...bowling, line: 1.5 },
      shot: null,
      runAt: [],
      field: "balanced" as const,
    };
    const d = m.createDelivery(input);
    d.complete();
    expect(d.outcome!.wides).toBeGreaterThan(0);
    expect(
      m.record({ k: "ball", seq: 0, ...input, digest: d.digest, t: 20000 }),
    ).toBe(true);
    expect(m.current.balls).toBe(0);
    expect(m.current.runs).toBe(d.outcome!.total);
  });
  it("records an overstep and keeps the free hit through a following wide", () => {
    const m = new CricketMatch(5, config);
    m.toss({ k: "toss", call: m.tossFace, decision: "bowl", t: 0 });
    for (const [seq, plan] of [
      { ...bowling, release: 1 },
      { ...bowling, line: 1.5 },
    ].entries()) {
      const input = {
        bowling: plan,
        shot: null,
        runAt: [],
        field: "balanced" as const,
      };
      const d = m.createDelivery(input);
      d.complete();
      expect(
        m.record({
          k: "ball",
          seq,
          ...input,
          digest: d.digest,
          t: (seq + 1) * 20000,
        }),
      ).toBe(true);
      expect(m.current.freeHit).toBe(true);
    }
    expect(m.current.balls).toBe(0);
  });
});

describe("Cricket deterministic flight, contact and fielding", () => {
  it("replays a live run on the next tick and ignores repeat calls while running", () => {
    const match = new CricketMatch(5, config);
    match.toss({ k: "toss", call: match.tossFace, decision: "bat", t: 0 });
    const intent = calibratedShot(match),
      live = match.createDelivery({
        bowling: null,
        shot: intent,
        runAt: [],
        field: match.fieldForAI(),
      });
    while (!live.outcome && !live.hit) live.step();
    expect(live.hit).toBe(true);
    const tick = live.tick;
    expect(live.requestRun()).toBe(true);
    expect(live.requestRun()).toBe(false);
    live.step();
    expect(live.requestRun()).toBe(false);
    live.complete();
    const replay = match.createDelivery({
      bowling: null,
      shot: intent,
      runAt: [tick],
      field: match.fieldForAI(),
    });
    replay.complete();
    expect(replay.digest).toBe(live.digest);
    expect(replay.frames).toEqual(live.frames);
    expect(replay.invalidInput).toBe(false);
  });
  it("changes dip and bounce for top-spin, using the same gravity and pitch", () => {
    const plain = vec(0, 2, -8),
      spinning = vec(0, 2, -8),
      a = vec(0, -1, 20),
      b = vec(0, -1, 20);
    for (let n = 0; n < 45; n++) {
      integrateBall(plain, a, 0, 0, "lantern", false);
      integrateBall(spinning, b, 0, 0, "lantern", false, 2.5);
    }
    expect(spinning.y).toBeLessThan(plain.y);
  });
  it("conserves scores, stays finite and verifies diverse seeded games and difficulties", () => {
    for (const seed of [1, 5, 12, 33, 91, 999]) {
      const game = playMatch(seed);
      expect(game.phase).toBe("finished");
      const checked = sinverseCricket.verify(seed, config, game.inputLog);
      expect(checked.ok).toBe(true);
      if (checked.ok) expect(checked.result).toEqual(game.summary());
      expect(game.lastDelivery!.tick).toBeLessThanOrEqual(1680);
    }
    for (const difficulty of ["club", "county", "elite"] as const) {
      const game = new CricketMatch(1, { ...config, difficulty });
      game.toss({ k: "toss", call: game.tossFace, decision: "bowl", t: 0 });
      const ball = game.createDelivery({
        bowling,
        shot: null,
        runAt: [],
        field: "balanced",
      });
      ball.complete();
      expect(ball.frames.every((frame) => Number.isFinite(frame.ball.y))).toBe(
        true,
      );
    }
  });
  it("uses gravity and a fixed step, bounces from the actual pitch and dissipates roll", () => {
    const p = vec(0, 1, 0),
      v = vec(0, 0, 12);
    for (let n = 0; n < 80; n++) integrateBall(p, v, 0, 0, "lantern", false);
    expect(p.y).toBeGreaterThanOrEqual(BALL_RADIUS);
    expect(p.z).toBeGreaterThan(0);
    const roll = vec(4, 0, 0),
      ground = vec(0, BALL_RADIUS, 0);
    for (let n = 0; n < 300; n++)
      integrateBall(ground, roll, 0, 0, "lantern", true);
    expect(roll.x).toBe(0);
  });
  it("models opposite leg-break/googly deviation with the same release", () => {
    const left = new Delivery(
        7,
        { ...bowling, variation: "legbreak" },
        "balanced",
        config,
      ),
      right = new Delivery(
        7,
        { ...bowling, variation: "googly" },
        "balanced",
        config,
      );
    for (let n = 0; n < 175; n++) {
      left.step();
      right.step();
    }
    expect(Math.abs(left.pos.x - right.pos.x)).toBeGreaterThan(0.25);
  });
  it("changes flight for swing, length and pace rather than just changing labels", () => {
    const a = new Delivery(
        7,
        { ...bowling, variation: "inswing" },
        "balanced",
        config,
      ),
      b = new Delivery(
        7,
        { ...bowling, variation: "outswing" },
        "balanced",
        config,
      );
    for (let n = 0; n < 160; n++) {
      a.step();
      b.step();
    }
    expect(a.pos.x).not.toBe(b.pos.x);
    expect(
      new Delivery(7, { ...bowling, variation: "slower" }, "balanced", config)
        .velocity.z,
    ).toBeLessThan(a.velocity.z);
    expect(
      new Delivery(7, { ...bowling, length: 0.7 }, "balanced", config).velocity
        .y,
    ).not.toBe(a.velocity.y);
  });
  it("earns impulse contact from bat position, face, power and timing", () => {
    const p = vec(0, 0.55, 8.8),
      incoming = vec(0, 1, 34);
    const perfect = batContact(p, incoming, { ...shot, tick: 160 }, 168, 1)!;
    const late = batContact(p, incoming, { ...shot, tick: 160 }, 180, 1)!;
    const defence = batContact(
      p,
      incoming,
      { ...shot, kind: "defend", tick: 160 },
      168,
      1,
    )!;
    expect(perfect.quality).toBeGreaterThan(late.quality);
    expect(perfect.velocity.z).toBeLessThan(0);
    expect(Math.hypot(perfect.velocity.y, perfect.velocity.z)).toBeGreaterThan(
      Math.hypot(defence.velocity.y, defence.velocity.z),
    );
    expect(batContact(vec(1.3, 0.55, 8.8), incoming, shot, 173, 1)).toBeNull();
  });
  it("produces an edge near the blade and a genuine missed swing outside its window", () => {
    expect(
      batContact(vec(0.3, 0.55, 8.8), vec(0, 0, 30), shot, 173, 1)?.edge,
    ).toBe(true);
    expect(
      batContact(vec(0, 0.55, 8.8), vec(0, 0, 30), shot, 220, 1),
    ).toBeNull();
  });
  it("detects swept stump collisions and rejects balls outside the stumps", () => {
    expect(stumpIntersection(vec(0, 0.3, 9), vec(0, 0.2, 11))).toBe(true);
    expect(stumpIntersection(vec(1, 0.3, 9), vec(1, 0.2, 11))).toBe(false);
    expect(stumpIntersection(vec(0, 1.5, 9), vec(0, 1.4, 11))).toBe(false);
  });
  it("awards six only on a bat-struck flight before any post-contact ground touch", () => {
    for (const grounded of [false, true]) {
      const d = new Delivery(7, bowling, "balanced", config);
      d.tick = 200;
      d.hit = true;
      d.mode = "struck";
      d.groundAfterHit = grounded;
      d.pos = vec(57.99, 2, 0);
      d.velocity = vec(30, 1, 0);
      d.step();
      expect(d.outcome!.boundary).toBe(grounded ? 4 : 6);
    }
    expect(boundaryCrossed(vec(0, 0, 0), "lantern")).toBe(false);
  });
  it("breaks the wicket only while a running batter is short of their ground", () => {
    for (const safe of [false, true]) {
      const d = new Delivery(7, bowling, "balanced", config);
      d.tick = 500;
      d.mode = "throw";
      d.throwDirect = true;
      d.throwEnd = 501;
      d.running = true;
      d.runProgress = safe ? RUN_DISTANCE - 0.1 : RUN_DISTANCE / 2;
      d.step();
      expect(d.outcome?.wicket ?? null).toBe(safe ? null : "run-out");
    }
  });
  it("makes a stumping depend on keeper collection and an advancing batter", () => {
    const d = new Delivery(7, bowling, "balanced", config, false, {
      ...shot,
      foot: 0.8,
      tick: 180,
    });
    d.tick = 200;
    d.pos = vec(0, 0.8, 10.9);
    d.velocity = vec(0, 0, 15);
    d.step();
    expect(d.outcome?.wicket).toBe("stumped");
  });
  it("reconstructs every recorded trajectory frame and outcome exactly", () => {
    const one = new Delivery(33, bowling, "attack", config, false, shot, [350]);
    one.complete();
    const two = new Delivery(33, bowling, "attack", config, false, shot, [350]);
    two.complete();
    expect(two.frames).toEqual(one.frames);
    expect(two.digest).toBe(one.digest);
    expect(two.outcome).toEqual(one.outcome);
    expect(one.frames.length).toBeLessThanOrEqual(565);
  });
  it("replays a live-inserted swing without letting future footwork affect earlier ticks", () => {
    const input = { ...shot, tick: 156, foot: 0.8 };
    const live = new Delivery(33, bowling, "attack", config);
    while (live.tick < 156 && !live.outcome) live.step();
    if (!live.outcome) live.shot = input;
    live.complete();
    const recorded = new Delivery(33, bowling, "attack", config, false, input);
    recorded.complete();
    expect(recorded.frames).toEqual(live.frames);
    expect(recorded.digest).toEqual(live.digest);
    expect(recorded.outcome).toEqual(live.outcome);
  });
  it("detects altered trajectory digests and impossible time claims", () => {
    const m = playMatch(33),
      log = structuredClone(m.inputLog);
    (log[1] as BallLog).digest = "ffffffff";
    expect(sinverseCricket.verify(33, config, log).ok).toBe(false);
    const early = structuredClone(m.inputLog);
    early[1]!.t = 1;
    expect(sinverseCricket.verify(33, config, early).ok).toBe(false);
  });
  it("keeps field assignments bounded rather than sending all fielders to the ball", () => {
    const d = new Delivery(33, bowling, "balanced", config, false, {
      ...shot,
      tick: 163,
    });
    d.complete();
    expect(d.fielders).toHaveLength(11);
    expect(d.fielders.filter((f) => f.travel > 0).length).toBeLessThanOrEqual(
      3,
    );
    expect(
      d.frames.every((f) =>
        [f.ball.x, f.ball.y, f.ball.z].every(Number.isFinite),
      ),
    ).toBe(true);
  });
});

describe("Original content and explicit licensing", () => {
  it("ships only original fictional manifests and falls back on missing rights", () => {
    expect(
      ORIGINAL_CONTENT.every((a) => a.origin === "original" && !a.realIdentity),
    ).toBe(true);
    const real = {
      id: "licensed-player",
      origin: "licensed" as const,
      source: "owner-controlled",
      owner: "rights holder",
      realIdentity: true,
      licenseId: "grant",
    };
    expect(licensedContent(real, [], 100).realIdentity).toBe(false);
    const grant = {
      id: "grant",
      enabled: true,
      startsAt: 0,
      expiresAt: 200,
      scopes: ["commercial-interactive", real.id],
      permissionReference: "owner-document-reference",
    };
    expect(licensedContent(real, [grant], 100)).toEqual(real);
    expect(licensedContent(real, [grant], 201).realIdentity).toBe(false);
    expect(
      licensedContent(real, [{ ...grant, scopes: [] }], 100).realIdentity,
    ).toBe(false);
  });
});
