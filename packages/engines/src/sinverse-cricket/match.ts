import { scoreDelivery } from "./rules";
import { seededRng } from "../core/seeded";
import type { SoloGameDefinition } from "../core/solo";
import { checkTimeline } from "../core/solo";
import { TEAMS, fieldPositions } from "./content";
import {
  ballLogSchema,
  configSchema,
  declareSchema,
  duelLogSchema,
  followOnSchema,
  formatBallSchema,
  formatLogSchema,
  FORMAT_MAX_MS,
  isFormatConfig,
  logSchema,
  oversText,
  simSchema,
  tossSchema,
  VARIATIONS,
  type BallLog,
  type BowlingInput,
  type CricketConfig,
  type CricketLog,
  type CricketLogEntry,
  type FieldName,
  type FormatBallLog,
  type FormatConfig,
  type Innings,
  type Outcome,
  type ShotInput,
  type Variation,
} from "./domain";
import { Delivery, integrateBall } from "./physics";
import { copy } from "./domain";
import { FORMATS, dayAndSession, fieldAllowed, matchOvers, powerplayFor, type FormatRules } from "./formats";
import { internationalTeam, validateSelection, type BowlingType, type CricketPlayer, type CricketTeam } from "./teams";

/** One player in a side, in batting order. Duel sides have names only; attributes default to the middle. */
export interface SidePlayer {
  id?: string;
  name: string;
  role?: CricketPlayer["role"];
  bowls: BowlingType | null;
  batting: number;
  power: number;
  bowling: number;
  fielding: number;
  keeping: number;
}
/** A team as it plays this match. */
export interface Side {
  id: string;
  name: string;
  short: string;
  color: string;
  dark: string;
  accent: string;
  /** Eleven players in batting order. */
  players: SidePlayer[];
  /** Batting-order indices of the captain and wicketkeeper. */
  captain: number;
  keeper: number;
  team?: CricketTeam;
}

/** Bowling variations each bowling type can deliver. */
export const VARIATIONS_FOR: Record<BowlingType, readonly Variation[]> = {
  fast: ["seam", "inswing", "outswing", "slower"],
  medium: ["seam", "inswing", "outswing", "slower"],
  "off-spin": ["offbreak", "topspin"],
  "leg-spin": ["legbreak", "googly", "topspin"],
  "left-arm-spin": ["legbreak", "topspin"],
};

const duelSide = (team: 0 | 1): Side => {
  const t = TEAMS[team]!;
  return {
    id: t.id,
    name: t.name,
    short: t.short,
    color: t.color,
    dark: t.dark,
    accent: t.accent,
    players: t.players.map((name, n) => ({ name, bowls: n === 6 || n === 7 ? "medium" : null, batting: 60, power: 60, bowling: 60, fielding: 60, keeping: 60 })),
    captain: 0,
    keeper: 5,
  };
};
/** Builds an international side from the catalogue and a chosen XI. Throws if the pick is invalid. */
export function internationalSide(teamId: string, pick?: { xi: string[]; captain: string; keeper: string }): Side {
  const team = internationalTeam(teamId);
  if (!team) throw Error(`Unknown team ${teamId}`);
  const selection = pick ?? { xi: team.xi, captain: team.captain, keeper: team.keeper };
  const problems = validateSelection(team, selection);
  if (problems.length) throw Error(problems[0]);
  const byId = new Map(team.squad.map((p) => [p.id, p]));
  const players = selection.xi.map((id) => {
    const p = byId.get(id)!;
    return { id: p.id, name: p.name, role: p.role, bowls: p.bowls, batting: p.batting, power: p.power, bowling: p.bowling, fielding: p.fielding, keeping: p.keeping };
  });
  return {
    id: team.id,
    name: team.name,
    short: team.short,
    color: team.kits.home.shirt,
    dark: team.kits.home.trousers,
    accent: team.kits.home.trim,
    players,
    captain: selection.xi.indexOf(selection.captain),
    keeper: selection.xi.indexOf(selection.keeper),
    team,
  };
}

/**
 * Whether `overs` more overs can still be bowled, none by two bowlers in a row,
 * from bowlers with the given overs left, when `last` bowled the previous over.
 * (A multiset with no two equal neighbours exists when no bowler needs more
 * than half the slots; the previous bowler can't open, so gets one fewer.)
 */
export function overPlanFeasible(left: number[], overs: number, last: number) {
  if (overs <= 0) return true;
  let room = 0;
  for (const [k, q] of left.entries()) room += Math.min(q, k === last ? Math.floor(overs / 2) : Math.ceil(overs / 2));
  return room >= overs;
}

export class CricketMatch {
  readonly config: CricketConfig;
  /** Format rules; null for the duel. */
  readonly rules: FormatRules | null;
  readonly sides: [Side, Side];
  /** Which side the player controls. */
  readonly human: number;
  innings: Innings[] = [];
  phase: "toss" | "ready" | "interval" | "finished" = "toss";
  firstBat = 0;
  tossWinner = 0;
  tossFace: "heads" | "tails";
  seq = 0;
  lastTime = 0;
  winner: number | null = null;
  result = "";
  lastDelivery: Delivery | null = null;
  history: {
    innings: number;
    ball: string;
    label: string;
    runs: number;
    wicket: string | null;
  }[] = [];
  inputLog: CricketLogEntry[] = [];
  recentVariations: string[] = [];
  recentDirections: number[] = [];
  /** International matches: deliveries the player controlled, and simulated ones. */
  controlled = 0;
  simulated = 0;
  /** Runs the player scored and wickets the player took on deliveries they controlled. */
  controlledRuns = 0;
  controlledWickets = 0;
  controlledFours = 0;
  controlledSixes = 0;
  /** Test cricket: legal balls bowled in the match, the follow-on, and a pending decision. */
  matchBalls = 0;
  followOnEnforced = false;
  followOnPending: number | null = null;
  constructor(
    readonly seed: number,
    config: CricketConfig,
    /** Engine-only formats (Test cricket) that the public config can't select yet. */
    internal?: { rules: FormatRules; sides: [Side, Side] },
  ) {
    this.config = configSchema.parse(config);
    if (internal) {
      this.rules = internal.rules;
      this.sides = internal.sides;
      this.human = 0;
    } else if (isFormatConfig(this.config)) {
      const c = this.config;
      if (c.team === c.opponent) throw Error("Choose two different teams");
      this.rules = FORMATS[c.format];
      this.sides = [internationalSide(c.team, c), internationalSide(c.opponent)];
      this.human = 0;
    } else {
      this.rules = null;
      this.sides = [duelSide(0), duelSide(1)];
      this.human = this.config.team;
    }
    this.tossFace = seededRng(seed ^ 0x51a7).int(2) ? "heads" : "tails";
  }
  get isDuel() {
    return this.rules === null;
  }
  get current() {
    return this.innings[this.innings.length - 1]!;
  }
  get humanBatting() {
    return this.current.team === this.human;
  }
  /** Legal balls an innings may last; null when unlimited (Test cricket). */
  get ballsLimit(): number | null {
    if (!this.rules) return (this.config as { overs: number }).overs * 6;
    return this.rules.overs === null ? null : this.rules.overs * 6;
  }
  get target() {
    if (!this.rules || this.rules.inningsPerSide === 1) return this.innings.length === 2 ? this.innings[0]!.runs + 1 : null;
    if (this.innings.length !== 4) return null;
    const batting = this.current.team,
      theirs = this.innings.filter((i) => i.team !== batting).reduce((n, i) => n + i.runs, 0),
      ours = this.innings.slice(0, -1).filter((i) => i.team === batting).reduce((n, i) => n + i.runs, 0);
    return theirs - ours + 1;
  }
  get bowlerIndex() {
    const i = this.current;
    return i.overBowlers ? i.overBowlers[Math.floor(i.balls / 6)] ?? -1 : Math.floor(i.balls / 6);
  }
  /** The powerplay in force for the coming ball (limited overs). */
  get powerplay() {
    return this.rules && this.innings.length ? powerplayFor(this.rules, Math.floor(this.current.balls / 6)) : null;
  }
  /** Test cricket: the day and session of the coming ball. */
  get dayAndSession() {
    return this.rules?.days ? dayAndSession(this.rules, Math.floor(this.matchBalls / 6)) : null;
  }
  toss(input: unknown) {
    const parsed = tossSchema.safeParse(input);
    if (!parsed.success || this.phase !== "toss") return false;
    const move = parsed.data;
    this.tossWinner =
      move.call === this.tossFace ? this.human : 1 - this.human;
    const decision =
      this.tossWinner === this.human
        ? move.decision
        : seededRng(this.seed ^ 0x77b1).int(2)
          ? "bat"
          : "bowl";
    this.firstBat = decision === "bat" ? this.tossWinner : 1 - this.tossWinner;
    this.inputLog.push(move);
    this.lastTime = move.t;
    this.openInnings(this.firstBat);
    return true;
  }
  private openInnings(team: number) {
    if (this.isDuel) {
      // The duel's record shape, unchanged.
      this.innings.push({
        team,
        runs: 0,
        wickets: 0,
        balls: 0,
        striker: 0,
        nonStriker: 1,
        nextBatter: 2,
        batsmen: TEAMS[team]!.players.map((name) => ({
          name,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          dismissal: null,
        })),
        bowlers: TEAMS[1 - team]!.players.slice(6, 8).map((name) => ({
          name,
          balls: 0,
          runs: 0,
          wickets: 0,
          wides: 0,
          noBalls: 0,
        })),
        extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0 },
        fall: [],
        over: [],
        partnership: 0,
        freeHit: false,
      });
    } else {
      this.innings.push({
        team,
        runs: 0,
        wickets: 0,
        balls: 0,
        striker: 0,
        nonStriker: 1,
        nextBatter: 2,
        batsmen: this.sides[team]!.players.map((p) => ({ name: p.name, id: p.id, runs: 0, balls: 0, fours: 0, sixes: 0, dismissal: null })),
        bowlers: [],
        extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0 },
        fall: [],
        over: [],
        partnership: 0,
        freeHit: false,
        overBowlers: [],
        partnerships: [{ a: 0, b: 1, runs: 0, balls: 0 }],
        overRuns: 0,
      });
    }
    this.phase = "ready";
  }
  /** The side that bats the next innings (international formats). */
  private nextBattingSide() {
    const n = this.innings.length,
      first = this.innings[0]!.team;
    if (n === 1) return 1 - first;
    if (n === 2) return this.followOnEnforced ? 1 - first : first;
    return 1 - this.current.team;
  }
  nextInnings() {
    if (this.phase !== "interval" || this.followOnPending !== null) return false;
    this.openInnings(this.isDuel ? 1 - this.firstBat : this.nextBattingSide());
    return true;
  }
  /** Test cricket: the leading side decides whether to make the other follow on. */
  followOn(input: unknown) {
    const parsed = followOnSchema.safeParse(input);
    if (!parsed.success || this.phase !== "interval" || this.followOnPending !== this.human || parsed.data.t < this.lastTime) return false;
    this.followOnEnforced = parsed.data.enforce;
    this.followOnPending = null;
    this.lastTime = parsed.data.t;
    this.inputLog.push(parsed.data);
    return true;
  }
  /** Test cricket: the player's side closes its innings. */
  declare(input: unknown) {
    const parsed = declareSchema.safeParse(input);
    if (!parsed.success || this.phase !== "ready" || !this.rules || this.rules.overs !== null || !this.humanBatting || parsed.data.t < this.lastTime) return false;
    this.lastTime = parsed.data.t;
    this.inputLog.push(parsed.data);
    this.closeInnings("declared");
    return true;
  }

  // ---- bowlers --------------------------------------------------------------------------
  private bowlerCard(i: Innings, slot: number) {
    let k = i.bowlers.findIndex((b) => b.slot === slot);
    if (k < 0) {
      const p = this.sides[1 - i.team]!.players[slot]!;
      i.bowlers.push({ name: p.name, id: p.id, slot, balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0, maidens: 0 });
      k = i.bowlers.length - 1;
    }
    return k;
  }
  private oversBowledBy(i: Innings, slot: number) {
    const card = i.bowlers.find((b) => b.slot === slot);
    return card ? Math.ceil(card.balls / 6) : 0;
  }
  /**
   * Fielding-side XI slots that may bowl the coming over: bowlers (never the
   * keeper), not the previous over's bowler, inside their quota, and leaving a
   * schedule that can still finish the innings within everyone's quota.
   */
  bowlerOptions(): number[] {
    const i = this.current;
    if (!i.overBowlers) return [];
    const side = this.sides[1 - i.team]!,
      over = Math.floor(i.balls / 6),
      lastCard = i.overBowlers[over - 1],
      last = lastCard === undefined ? -1 : i.bowlers[lastCard]!.slot!;
    const quota = this.rules!.bowlerOvers ?? Infinity,
      remaining = this.ballsLimit === null ? 0 : this.ballsLimit / 6 - over - 1;
    let pool = side.players.map((p, slot) => ({ p, slot })).filter(({ p, slot }) => p.bowls && slot !== side.keeper);
    if (pool.length < 2) pool = side.players.map((p, slot) => ({ p, slot })).filter(({ slot }) => slot !== side.keeper);
    const left = (slot: number) => Math.max(0, quota - this.oversBowledBy(i, slot));
    return pool
      .filter(({ slot }) => slot !== last && left(slot) > 0)
      .filter(({ slot }) => quota === Infinity || overPlanFeasible(pool.map((b) => left(b.slot) - (b.slot === slot ? 1 : 0)), remaining, pool.findIndex((b) => b.slot === slot)))
      .map(({ slot }) => slot);
  }
  /** The captain's (AI's) choice for the coming over: the best fresh option, spin through the middle overs. */
  bowlerForAI(): number {
    const options = this.bowlerOptions(),
      i = this.current,
      side = this.sides[1 - i.team]!,
      over = Math.floor(i.balls / 6),
      quota = this.rules!.bowlerOvers ?? 30,
      overs = this.rules!.overs ?? 90,
      middle = over >= Math.round(overs * 0.3) && over < Math.round(overs * 0.8);
    const score = (slot: number) => {
      const p = side.players[slot]!,
        spinner = !!p.bowls && p.bowls.includes("spin");
      return p.bowling + (middle === spinner ? 6 : 0) - (this.oversBowledBy(i, slot) / quota) * 14 + (slot % 7) * 0.01;
    };
    if (!options.length) {
      // Unreachable with a valid XI (five bowlers cover any quota); never let the match stall.
      const lastCard = i.overBowlers![over - 1],
        last = lastCard === undefined ? -1 : i.bowlers[lastCard]!.slot!;
      return side.players.findIndex((_, slot) => slot !== side.keeper && slot !== last);
    }
    return options.reduce((best, slot) => (score(slot) > score(best) ? slot : best), options[0]!);
  }
  /** The XI slot bowling the coming ball, given an optional choice for a new over. Null if the choice is illegal. */
  private bowlerForBall(requested: number | undefined, humanChoice: boolean): number | null {
    const i = this.current,
      over = Math.floor(i.balls / 6),
      set = i.overBowlers![over];
    if (set !== undefined) return requested === undefined ? i.bowlers[set]!.slot! : null;
    if (requested === undefined) return this.bowlerForAI();
    if (!humanChoice || !this.bowlerOptions().includes(requested)) return null;
    return requested;
  }
  /** Fielding skills by Delivery slot: nine fielders, the bowler (9) and the keeper (10). */
  private fieldingSkills(bowlerSlot: number) {
    const side = this.sides[1 - this.current.team]!,
      others = side.players.map((p, slot) => ({ p, slot })).filter(({ slot }) => slot !== bowlerSlot && slot !== side.keeper);
    const skill = (n: number) => 0.62 + (n / 100) * 0.3;
    return [...others.map(({ p }) => skill(p.fielding)), skill(side.players[bowlerSlot]!.fielding), skill(side.players[side.keeper]!.keeping)];
  }
  /** Name of the fielder in a Delivery slot, for the scorecard. */
  private fielderName(bowlerSlot: number, deliverySlot: number) {
    const side = this.sides[1 - this.current.team]!;
    if (deliverySlot === 9) return side.players[bowlerSlot]!.name;
    if (deliverySlot === 10) return side.players[side.keeper]!.name;
    const others = side.players.map((p, slot) => ({ p, slot })).filter(({ slot }) => slot !== bowlerSlot && slot !== side.keeper);
    return others[deliverySlot]?.p.name ?? "sub";
  }

  // ---- the AI ---------------------------------------------------------------------------
  /**
   * The difficulty describes the opposition. When the AI plays for the player's
   * own side (a simulated passage), it plays at the neutral county level.
   */
  private skillFor(team: number) {
    return team === this.human ? "county" : this.config.difficulty;
  }
  fieldForAI(): FieldName {
    if (this.isDuel)
      return this.current.balls >= (this.config as { overs: number }).overs * 6 - 2
        ? "boundary"
        : this.current.wickets > 1
          ? "attack"
          : "balanced";
    const i = this.current,
      over = Math.floor(i.balls / 6),
      overs = this.rules!.overs;
    const wanted: FieldName = overs !== null && over >= overs - 4 ? "deep" : i.wickets >= 7 || (overs === null && i.balls < 60) ? "attack" : "balanced";
    for (const f of [wanted, "balanced", "attack"] as FieldName[]) if (fieldAllowed(this.rules!, over, f)) return f;
    return "attack";
  }
  /** The AI's delivery: a pure function of the seed, the sequence and (international) the bowler. */
  bowlingForAI(bowlerSlot?: number): BowlingInput {
    const rng = seededRng(this.seed ^ Math.imul(this.seq + 1, 374761393));
    if (!this.isDuel) {
      const i = this.current,
        slot = bowlerSlot ?? this.bowlerForBall(undefined, false) ?? 0,
        p = this.sides[1 - i.team]!.players[slot]!,
        types = VARIATIONS_FOR[p.bowls ?? "medium"],
        variation = types[rng.int(types.length)]!,
        spinner = variation === "offbreak" || variation === "legbreak" || variation === "googly" || variation === "topspin";
      const level = this.skillFor(1 - i.team),
        base = level === "club" ? 0.2 : level === "county" ? 0.55 : 0.9;
      // Now and then a bowler oversteps (a no-ball) or strays down the leg side (a wide): less often the better he is.
      const slip = (100 - p.bowling) / 100,
        overstep = rng.int(1000) < 12 * slip,
        stray = rng.int(1000) < 40 * slip;
      return {
        variation,
        length: spinner ? 3.4 + rng.int(9) / 10 : 1.6 + rng.int(52) / 10,
        line: stray ? (rng.int(2) ? 1.25 : -1.25) : (rng.int(7) - 3) / 10,
        speed: Math.max(0, Math.min(1, base + (p.bowling - 65) / 120)),
        release: overstep ? 0.95 : (rng.int(21) - 10) / 100,
      };
    }
    const variant =
      this.seq === 0
        ? "seam"
        : VARIATIONS[
            (rng.int(VARIATIONS.length - 1) +
              (this.recentVariations.at(-1) === "seam" ? 1 : 0)) %
              VARIATIONS.length
          ]!;
    const length =
      this.seq === 0
        ? 4
        : variant === "googly" || variant === "legbreak"
          ? 3.8
          : 1.2 + rng.int(58) / 10;
    const lastDirection = this.recentDirections.at(-1) ?? 0;
    return {
      variation: variant,
      length,
      line:
        this.seq === 0
          ? 0
          : (rng.int(7) - 3) / 10 - Math.sign(lastDirection) * 0.06,
      speed:
        this.config.difficulty === "club"
          ? 0.2
          : this.config.difficulty === "county"
            ? 0.55
            : 0.95,
      release: (rng.int(21) - 10) / 100,
    };
  }
  /** How hard the AI batter goes for runs, 0 (survive) to 1 (all out attack). */
  private aggression() {
    const i = this.current,
      limit = this.ballsLimit;
    if (limit === null) {
      // Test cricket: steady; quicker when setting up a declaration or chasing late.
      return this.innings.length === 4 && this.target ? Math.min(0.8, ((this.target - i.runs) / Math.max(30, (matchOvers(this.rules!)! * 6 - this.matchBalls) / 1.2)) * 0.9) : 0.2;
    }
    const left = limit - i.balls,
      overs = limit / 6,
      over = i.balls / 6,
      // T20 batters go harder in every phase than ODI batters, who build an innings.
      phase = overs <= 20 ? (over < 6 ? 0.68 : over >= 16 ? 0.95 : 0.55) : over < overs * 0.2 ? 0.5 : over >= overs * 0.8 ? 0.85 : 0.3,
      wickets = (10 - i.wickets) / 10;
    let a = phase * (0.55 + wickets * 0.45);
    if (this.target) {
      const need = this.target - i.runs,
        required = (need * 6) / Math.max(1, left),
        par = overs <= 20 ? 8 : 5.5;
      a = Math.max(a, Math.min(1, 0.35 + (required - par) / 6));
    }
    return Math.max(0.05, Math.min(1, a));
  }
  private battingForAI(
    bowling: BowlingInput,
    delivery: Delivery,
    field: FieldName,
  ): ShotInput {
    const rng = seededRng(this.seed ^ Math.imul(this.seq + 3, 668265263));
    const duel = this.isDuel;
    const remaining = (this.ballsLimit ?? 600) - this.current.balls;
    const needed = this.target
      ? this.target - this.current.runs
      : remaining * 1.7;
    const batter = this.sides[this.current.team]!.players[this.current.striker]!;
    const aggression = duel ? 0 : this.aggression();
    const attack = duel ? needed / Math.max(1, remaining) > 1.8 || remaining < 3 : rng.int(100) < aggression * 70;
    const directions = [-70, -30, 0, 30, 70];
    const positions = fieldPositions(field);
    const direction = directions
      .map((a) => ({
        a,
        gap: Math.min(
          ...positions.map((p) =>
            Math.abs((Math.atan2(p.x, 8.8 - p.z) * 180) / Math.PI - a),
          ),
        ),
      }))
      .sort((a, b) => b.gap - a.gap)[
      this.config.difficulty === "elite" ? 0 : rng.int(3)
    ]!.a;
    let kind: ShotInput["kind"] =
      bowling.length > 6
        ? "pull"
        : attack && bowling.length > 1.5
          ? "loft"
          : Math.abs(direction) > 50
            ? "cut"
            : direction > 10
              ? "cover"
              : "straight";
    // International batters defend more when the match asks for it.
    if (!duel && !attack && rng.int(100) < (1 - aggression) * 45) kind = "defend";
    const noise =
      (this.config.difficulty === "club"
        ? 13
        : this.config.difficulty === "county"
          ? 8
          : 4) * (duel ? 1 : 1.55 - batter.batting / 100);
    // Predict flight from the visible release only. This does not read a future
    // player action or choose a delivery outcome; execution noise still applies.
    const position = copy(delivery.pos),
      velocity = copy(delivery.velocity);
    let estimate = 100;
    while (position.z < 8.7 && estimate < 400) {
      integrateBall(
        position,
        velocity,
        delivery.spin,
        delivery.swing,
        this.config.venue,
        false,
        bowling.variation === "topspin" ? 2.5 : 0,
      );
      estimate++;
    }
    const observedKind = position.y > 0.95 ? "pull" : kind;
    const spread = Math.round(noise);
    return {
      kind: observedKind,
      direction,
      power: duel ? (attack ? 0.87 : 0.62) : Math.min(1, (attack ? 0.82 : 0.55) + (batter.power - 60) / 200),
      foot: 0,
      face: Math.max(
        -0.6,
        Math.min(
          0.6,
          (position.x - Math.sin((direction * Math.PI) / 180) * 0.45) / 0.55,
        ),
      ),
      tick: Math.max(100, estimate - 8 + rng.int(spread * 2 + 1) - spread),
    };
  }

  /**
   * The international batter's AI. Reads only what a batter sees: the ball out of
   * the hand (its predicted line and height at the bat) and the match situation.
   * It picks the shot whose bat height suits the ball, a direction that suits its
   * line, and a timing error set by the batter's skill and the difficulty; it may
   * leave a wide ball. Running is judged from where the struck ball goes, with an
   * occasional risky extra run. Deterministic from the seed and sequence.
   */
  private formatBattingForAI(
    bowling: BowlingInput,
    delivery: Delivery,
    field: FieldName,
    probe: (shot: ShotInput | null, runAt: number[]) => Delivery,
  ): { shot: ShotInput | null; runAt: number[] } {
    const rng = seededRng(this.seed ^ Math.imul(this.seq + 3, 668265263));
    const i = this.current,
      batter = this.sides[i.team]!.players[i.striker]!,
      aggression = this.aggression();
    // Where the ball will be as it reaches the batter.
    const position = copy(delivery.pos),
      velocity = copy(delivery.velocity);
    let estimate = 100;
    while (position.z < 8.7 && estimate < 400) {
      integrateBall(position, velocity, delivery.spin, delivery.swing, this.config.venue, false, bowling.variation === "topspin" ? 2.5 : 0);
      estimate++;
    }
    // Hard drives grow with aggression; lofts mostly come at the death or under a big chase.
    const short = (this.ballsLimit ?? 600) <= 120;
    const x = position.x,
      y = position.y,
      attack = rng.int(1000) < aggression * 750,
      loftChance = aggression ** 3 * (short ? 0.42 : 0.3);
    // Leave it: well outside the line, unless chasing hard.
    if (Math.abs(x) > 0.62 && !attack && rng.int(100) < 80) return { shot: null, runAt: [] };
    // The shot whose bat height suits the ball, then a direction along its line.
    // (A block, the "defend" shot, carries on to the slips and keeper in this physics
    // model, so a careful batter pushes with a soft drive instead.)
    const lofted = rng.int(1000) < loftChance * 1000,
      careful = !attack && rng.int(100) < (1 - aggression) * 70;
    const heights: [ShotInput["kind"], number][] = lofted
      ? [["loft", 0.55], ["pull", 1.25], ["cut", 1.12], ["sweep", 0.18]]
      : [["straight", 0.48], ["cover", 0.55], ["on-drive", 0.5], ["cut", 1.12], ["pull", 1.25], ["sweep", 0.18]];
    const fits = heights.filter(([kind]) => kind !== "sweep" || bowling.variation === "offbreak" || bowling.variation === "legbreak" || bowling.variation === "googly");
    const [kind] = fits.reduce((best, h) => (Math.abs(h[1] - y) < Math.abs(best[1] - y) ? h : best), fits[0]!);
    const natural = (Math.asin(Math.max(-1, Math.min(1, x / 0.45))) * 180) / Math.PI;
    // A lofted shot goes over the infield: what matters is the gap between the boundary riders.
    const positions = fieldPositions(field).filter((p) => !lofted || Math.hypot(p.x, p.z) > 30);
    const options = [-60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60].filter((a) => Math.abs(a - natural) <= (lofted ? 50 : 35));
    const gap = (a: number) => (positions.length ? Math.min(...positions.map((p) => Math.abs((Math.atan2(p.x, 8.8 - p.z) * 180) / Math.PI - a))) : 90);
    const ranked = (options.length ? options : [Math.round(natural / 20) * 20]).sort((a, b) => gap(b) - gap(a));
    const level = this.skillFor(i.team);
    const direction = ranked[level === "elite" || rng.int(2) ? 0 : Math.min(1, ranked.length - 1)]!;
    const skill = batter.batting / 100,
      noise = Math.round((level === "club" ? 7 : level === "county" ? 5 : 3.5) * (1.45 - skill)),
      lateral = (rng.int(21) - 10) / 100 * (1.2 - skill);
    const shot: ShotInput = {
      kind,
      direction,
      power: Math.max(0.15, Math.min(1, (kind === "loft" ? 0.97 : careful ? 0.5 : attack ? 1 : 0.78) + (batter.power - 60) / 220)),
      foot: 0,
      face: Math.max(-0.6, Math.min(0.6, (x - Math.sin((direction * Math.PI) / 180) * 0.45) / 0.55 + lateral)),
      tick: Math.max(100, estimate - 8 + rng.int(noise * 2 + 1) - noise),
    };
    // Running: look where the ball goes, take the runs that are there, and now and then one more.
    const struck = probe(shot, []);
    if (!struck.hit || struck.outcome?.wicket || struck.outcome?.boundary) return { shot, runAt: [] };
    const start = struck.contactTick + 18,
      plans = [[start], [start, start + 150], [start, start + 150, start + 300]];
    let safe: number[] = [];
    for (const plan of plans) {
      if (plan.at(-1)! >= struck.tick) break;
      const tried = probe(shot, plan);
      if (tried.outcome?.wicket || tried.invalidInput) break;
      safe = plan;
    }
    const greedy = plans[safe.length];
    // A risky extra run: it may end in a run-out, but it must be a run the batters can actually call.
    if (greedy && rng.int(1000) < aggression * 160 && greedy.at(-1)! < struck.tick && !probe(shot, greedy).invalidInput) return { shot, runAt: greedy };
    return { shot, runAt: safe };
  }

  // ---- deliveries ------------------------------------------------------------------------
  createDelivery(
    input: Pick<BallLog, "bowling" | "shot" | "runAt"> & { field: FieldName; bowler?: number },
    capture = true,
  ) {
    if (this.phase !== "ready") throw Error("Delivery is not ready");
    if (
      this.humanBatting
        ? input.bowling !== null || input.field !== this.fieldForAI()
        : input.bowling === null ||
          input.shot !== null ||
          input.runAt.length !== 0
    )
      throw Error("Wrong team's input");
    if (this.isDuel) {
      const bowling = this.humanBatting ? this.bowlingForAI() : input.bowling!;
      const seed = (this.seed ^ Math.imul(this.seq + 1, 2654435761)) >>> 0;
      const delivery = new Delivery(
        seed,
        bowling,
        input.field,
        this.config,
        this.current.freeHit,
        this.humanBatting ? input.shot : null,
        this.humanBatting ? input.runAt : [],
        capture,
        Math.max(0.82, 1 - this.current.balls * 0.007),
      );
      if (!this.humanBatting) {
        delivery.shot = this.battingForAI(bowling, delivery, input.field);
        delivery.autoRun = true;
      }
      return delivery;
    }
    return this.formatDelivery(input, capture, false);
  }
  /** An international delivery: the human's inputs for their side, the AI's for the other (or both, simulated). */
  private formatDelivery(input: { bowling: BowlingInput | null; shot: ShotInput | null; runAt: number[]; field: FieldName; bowler?: number }, capture: boolean, simulated: boolean) {
    const i = this.current,
      over = Math.floor(i.balls / 6);
    if (!fieldAllowed(this.rules!, over, input.field)) throw Error("That field breaks the fielding restrictions");
    const humanFielding = !simulated && !this.humanBatting;
    const slot = this.bowlerForBall(input.bowler, humanFielding);
    if (slot === null) throw Error("That bowler can't bowl this over");
    const bowler = this.sides[1 - i.team]!.players[slot]!;
    let bowling = input.bowling;
    if (!bowling || simulated || this.humanBatting) bowling = this.bowlingForAI(slot);
    else if (!VARIATIONS_FOR[bowler.bowls ?? "medium"].includes(bowling.variation)) throw Error(`${bowler.name} can't bowl that`);
    const seed = (this.seed ^ Math.imul(this.seq + 1, 2654435761)) >>> 0,
      fatigue = Math.max(0.82, 1 - this.oversBowledBy(i, slot) * 6 * 0.003);
    const humanBats = !simulated && this.humanBatting;
    const delivery = new Delivery(seed, bowling, input.field, this.config, i.freeHit, humanBats ? input.shot : null, humanBats ? input.runAt : [], capture, fatigue, this.fieldingSkills(slot));
    if (!humanBats) {
      const plan = this.formatBattingForAI(bowling, delivery, input.field, (shot, runAt) => {
        const probe = new Delivery(seed, bowling!, input.field, this.config, i.freeHit, shot, runAt, false, fatigue, this.fieldingSkills(slot));
        probe.complete();
        return probe;
      });
      delivery.shot = plan.shot;
      delivery.runAt = plan.runAt;
    }
    return Object.assign(delivery, { bowlerSlot: slot });
  }
  record(input: unknown, observed?: Delivery) {
    if (!this.isDuel) return this.recordFormat(input, observed);
    const parsed = ballLogSchema.safeParse(input);
    if (!parsed.success) return false;
    const log = parsed.data;
    if (
      this.phase !== "ready" ||
      log.seq !== this.seq ||
      log.t < this.lastTime ||
      this.seq >= 128
    )
      return false;
    let delivery: Delivery;
    try {
      delivery = this.createDelivery(log, false);
    } catch {
      return false;
    }
    const outcome = delivery.complete();
    if (log.shot && log.shot.tick >= delivery.tick) return false;
    if (
      log.runAt.some(
        (tick, n) =>
          tick > delivery.tick || (n > 0 && tick <= log.runAt[n - 1]!),
      )
    )
      return false;
    if (
      delivery.invalidInput ||
      delivery.digest !== log.digest ||
      log.t - this.lastTime < Math.floor((delivery.tick / 120) * 1000 * 0.45)
    )
      return false;
    this.lastDelivery =
      observed?.digest === delivery.digest ? observed : delivery;
    this.applyOutcome(outcome);
    this.recentDirections.push(delivery.shot?.direction ?? 0);
    this.recentVariations.push(delivery.bowling.variation);
    this.seq++;
    this.lastTime = log.t;
    this.inputLog.push(log);
    return true;
  }
  private recordFormat(input: unknown, observed?: Delivery) {
    const parsed = formatBallSchema.safeParse(input);
    if (!parsed.success) return false;
    const log: FormatBallLog = parsed.data;
    if (this.phase !== "ready" || log.seq !== this.seq || log.t < this.lastTime) return false;
    let delivery: Delivery & { bowlerSlot?: number };
    try {
      delivery = this.createDelivery(log, false);
    } catch {
      return false;
    }
    const outcome = delivery.complete();
    if (log.shot && log.shot.tick >= delivery.tick) return false;
    if (log.runAt.some((tick, n) => tick > delivery.tick || (n > 0 && tick <= log.runAt[n - 1]!))) return false;
    if (delivery.invalidInput || delivery.digest !== log.digest || log.t - this.lastTime < Math.floor((delivery.tick / 120) * 1000 * 0.45)) return false;
    this.lastDelivery = observed?.digest === delivery.digest ? observed : delivery;
    const batting = this.humanBatting;
    this.applyFormat(outcome, delivery, delivery.bowlerSlot!);
    this.controlled++;
    if (batting) {
      this.controlledRuns += outcome.bat;
      if (outcome.bat && outcome.boundary === 4) this.controlledFours++;
      if (outcome.bat && outcome.boundary === 6) this.controlledSixes++;
    } else if (outcome.wicket && outcome.wicket !== "run-out") this.controlledWickets++;
    this.seq++;
    this.lastTime = log.t;
    this.inputLog.push(log);
    return true;
  }
  /**
   * Plays `balls` legal deliveries with the AI on both sides (a simulated
   * passage), stopping early at the end of the innings. Returns the deliveries played.
   */
  simulate(input: unknown) {
    const parsed = simSchema.safeParse(input);
    if (!parsed.success || this.isDuel || this.phase !== "ready" || parsed.data.seq !== this.seq || parsed.data.t < this.lastTime) return null;
    const played: Delivery[] = [];
    // `balls` counts legal deliveries (an over is six); wides and no-balls are bowled again.
    for (let legal = 0, n = 0; legal < parsed.data.balls && this.phase === "ready" && n < parsed.data.balls * 3 + 12; n++) {
      const delivery = this.formatDelivery({ bowling: null, shot: null, runAt: [], field: this.fieldForAI() }, false, true);
      const outcome = delivery.complete();
      if (delivery.invalidInput) throw Error("Simulated delivery made an invalid call");
      this.applyFormat(outcome, delivery, delivery.bowlerSlot!);
      this.simulated++;
      this.seq++;
      if (outcome.legal) legal++;
      played.push(delivery);
    }
    this.lastDelivery = played.at(-1) ?? this.lastDelivery;
    this.lastTime = parsed.data.t;
    this.inputLog.push(parsed.data);
    return played;
  }
  private dismissalText(o: Outcome, delivery: Delivery, slot: number) {
    const bowler = this.sides[1 - this.current.team]!.players[slot]!.name,
      fielder = delivery.chaser >= 0 ? this.fielderName(slot, delivery.chaser) : null,
      keeper = this.fielderName(slot, 10);
    switch (o.wicket) {
      case "bowled":
        return `b ${bowler}`;
      case "lbw":
        return `lbw b ${bowler}`;
      case "caught":
        return fielder === bowler ? `c & b ${bowler}` : `c ${fielder ?? keeper} b ${bowler}`;
      case "stumped":
        return `st ${keeper} b ${bowler}`;
      case "run-out":
        return `run out (${fielder ?? keeper})`;
      default:
        return null;
    }
  }
  private applyFormat(o: Outcome, delivery: Delivery, slot: number) {
    const i = this.current,
      over = Math.floor(i.balls / 6);
    if (i.overBowlers![over] === undefined) i.overBowlers![over] = this.bowlerCard(i, slot);
    const dismissed = o.dismissed === "striker" ? i.striker : i.nonStriker;
    const ball = scoreDelivery(i, o);
    if (o.wicket) i.batsmen[dismissed]!.dismissal = this.dismissalText(o, delivery, slot);
    if (o.legal) this.matchBalls++;
    this.history.push({ innings: this.innings.length, ball, label: o.label, runs: o.total, wicket: o.wicket });
    this.recentDirections.push(delivery.shot?.direction ?? 0);
    this.recentVariations.push(delivery.bowling.variation);
    const limit = this.ballsLimit,
      all = matchOvers(this.rules!);
    if (i.wickets >= 10) this.closeInnings("all-out");
    else if (this.target && i.runs >= this.target) this.closeInnings("target");
    else if (limit !== null && i.balls >= limit) this.closeInnings("overs");
    else if (all !== null && this.matchBalls >= all * 6) this.closeInnings("time");
    else if (o.legal && i.balls % 6 === 0 && this.aiDeclares()) this.closeInnings("declared");
  }
  /** Test cricket: the AI captain declares with a big first-innings total or a lead it can defend. */
  private aiDeclares() {
    if (!this.rules || this.rules.overs !== null || this.humanBatting) return false;
    const i = this.current,
      n = this.innings.length,
      lead = this.innings.reduce((s, x) => s + (x.team === i.team ? x.runs : -x.runs), 0),
      oversLeft = (matchOvers(this.rules)! * 6 - this.matchBalls) / 6;
    if (n <= 2) return i.runs >= 550;
    if (n === 3) return lead >= 380 || (lead >= 240 && oversLeft < 110);
    return false;
  }
  private closeInnings(why: NonNullable<Innings["closed"]>) {
    const i = this.current;
    i.closed = why;
    const rules = this.rules!;
    const names = (t: number) => this.sides[t]!.name;
    const finish = (winner: number | null, text: string) => {
      this.phase = "finished";
      this.winner = winner;
      this.result = text;
    };
    if (why === "time") return finish(null, "Match drawn");
    if (rules.inningsPerSide === 1) {
      if (this.innings.length === 1) {
        this.phase = "interval";
        return;
      }
      const first = this.innings[0]!;
      if (i.runs > first.runs) {
        const left = this.ballsLimit! - i.balls;
        return finish(i.team, `${names(i.team)} won by ${10 - i.wickets} wicket${10 - i.wickets === 1 ? "" : "s"}${left ? ` (${left} ball${left === 1 ? "" : "s"} left)` : ""}`);
      }
      if (i.runs < first.runs) return finish(first.team, `${names(first.team)} won by ${first.runs - i.runs} run${first.runs - i.runs === 1 ? "" : "s"}`);
      return finish(null, "Match tied");
    }
    // Test cricket.
    const total = (t: number) => this.innings.filter((x) => x.team === t).reduce((s, x) => s + x.runs, 0);
    const n = this.innings.length;
    if (n === 1) {
      this.phase = "interval";
      return;
    }
    if (n === 2) {
      const lead = total(this.innings[0]!.team) - total(this.innings[1]!.team),
        leader = this.innings[0]!.team;
      this.phase = "interval";
      if (lead >= (rules.followOn ?? Infinity)) {
        if (leader === this.human) this.followOnPending = leader;
        else this.followOnEnforced = true;
      }
      return;
    }
    if (n === 3) {
      const twice = i.team,
        other = 1 - twice;
      if (total(twice) < total(other)) return finish(other, `${names(other)} won by an innings and ${total(other) - total(twice)} run${total(other) - total(twice) === 1 ? "" : "s"}`);
      this.phase = "interval";
      return;
    }
    const chaser = i.team,
      other = 1 - chaser;
    if (total(chaser) > total(other)) return finish(chaser, `${names(chaser)} won by ${10 - i.wickets} wicket${10 - i.wickets === 1 ? "" : "s"}`);
    if (total(chaser) < total(other)) return finish(other, `${names(other)} won by ${total(other) - total(chaser)} run${total(other) - total(chaser) === 1 ? "" : "s"}`);
    return finish(null, "Match tied");
  }
  private applyOutcome(o: Outcome) {
    const i = this.current;
    const ball = scoreDelivery(i, o);
    this.history.push({
      innings: this.innings.length,
      ball,
      label: o.label,
      runs: o.total,
      wicket: o.wicket,
    });
    const overs = (this.config as { overs: number }).overs;
    if (
      i.balls >= overs * 6 ||
      i.wickets >= 10 ||
      (this.target && i.runs >= this.target)
    ) {
      if (this.innings.length === 1) this.phase = "interval";
      else {
        this.phase = "finished";
        const first = this.innings[0]!;
        this.winner =
          i.runs > first.runs
            ? i.team
            : i.runs < first.runs
              ? first.team
              : null;
        this.result =
          this.winner === null
            ? "Match tied"
            : `${TEAMS[this.winner]!.name} won by ${this.winner === i.team ? `${10 - i.wickets} wickets` : `${first.runs - i.runs} run${first.runs - i.runs === 1 ? "" : "s"}`}`;
      }
    }
  }
  summary() {
    if (!this.isDuel) return this.formatSummary();
    const config = this.config as { team: number; overs: number };
    const human = this.innings.find((i) => i.team === config.team),
      opposition = this.innings.find((i) => i.team !== config.team);
    const sixes = human?.batsmen.reduce((n, b) => n + b.sixes, 0) ?? 0;
    const fours = human?.batsmen.reduce((n, b) => n + b.fours, 0) ?? 0;
    const won = this.phase === "finished" && this.winner === config.team;
    const score = Math.max(
      0,
      Math.round(
        ((human?.runs ?? 0) * 15 + (opposition?.wickets ?? 0) * 45) /
          config.overs,
      ) + (won ? 200 : 0),
    );
    return {
      score,
      completed: won,
      durationMs: this.lastTime,
      details: {
        format: "duel",
        matchFinished: this.phase === "finished" ? 1 : 0,
        result:
          this.phase === "finished"
            ? this.winner === null
              ? "tie"
              : won
                ? "win"
                : "loss"
            : "unfinished",
        runs: human?.runs ?? 0,
        wicketsTaken: opposition?.wickets ?? 0,
        sixes,
        fours,
        balls: human?.balls ?? 0,
        overs: oversText(human?.balls ?? 0),
        scorecard: JSON.stringify(this.innings),
        simulation: 1,
      },
    };
  }
  private formatSummary() {
    const rules = this.rules!,
      mine = this.innings.filter((i) => i.team === this.human),
      theirs = this.innings.filter((i) => i.team !== this.human);
    const sum = (xs: Innings[], f: (i: Innings) => number) => xs.reduce((n, i) => n + f(i), 0);
    const sixes = sum(mine, (i) => i.batsmen.reduce((n, b) => n + b.sixes, 0)),
      fours = sum(mine, (i) => i.batsmen.reduce((n, b) => n + b.fours, 0));
    const finished = this.phase === "finished",
      won = finished && this.winner === this.human,
      // A win counts as the player's only when they played enough of it themselves.
      earned = won && this.controlled >= rules.minControlledBalls;
    const perRun = rules.id === "t20" ? 4 : rules.id === "odi" ? 2 : 1,
      perWicket = rules.id === "t20" ? 30 : rules.id === "odi" ? 20 : 12;
    const score = Math.max(0, this.controlledRuns * perRun + this.controlledWickets * perWicket + (earned ? 300 : 0));
    const balls = sum(mine, (i) => i.balls);
    return {
      score,
      completed: earned,
      durationMs: this.lastTime,
      details: {
        format: rules.id,
        engine: 2,
        team: this.sides[this.human]!.id,
        opponent: this.sides[1 - this.human]!.id,
        matchFinished: finished ? 1 : 0,
        result: finished ? (this.winner === null ? (this.result === "Match drawn" ? "draw" : "tie") : won ? "win" : "loss") : "unfinished",
        resultText: this.result,
        // Team totals, for the scorebook.
        runs: sum(mine, (i) => i.runs),
        teamWickets: sum(theirs, (i) => i.wickets),
        teamSixes: sixes,
        teamFours: fours,
        // Achievements read these: only what the player did on deliveries they controlled.
        wicketsTaken: this.controlledWickets,
        sixes: this.controlledSixes,
        fours: this.controlledFours,
        controlledRuns: this.controlledRuns,
        balls,
        overs: oversText(balls),
        controlledBalls: this.controlled,
        simulatedBalls: this.simulated,
        // A win the player didn't play enough of: recorded, but neither a win nor a loss.
        uncounted: won && !earned ? 1 : 0,
        scorecard: JSON.stringify(this.innings),
      },
    };
  }
}

/** Builds the match a config and log describe, replaying every entry. Returns the reason if any entry is invalid. */
export function replayMatch(seed: number, config: CricketConfig, log: CricketLog): { match: CricketMatch } | { reason: string } {
  let match: CricketMatch;
  try {
    match = new CricketMatch(seed, config);
  } catch (e) {
    return { reason: (e as Error).message || "Invalid match settings" };
  }
  for (const input of log as CricketLogEntry[]) {
    if ((input.k === "ball" || input.k === "sim") && match.phase === "interval") match.nextInnings();
    let ok = false;
    try {
      ok =
      input.k === "toss"
        ? match.toss(input)
        : input.k === "ball"
          ? match.record(input)
          : input.k === "sim"
            ? match.simulate(input) !== null
            : input.k === "declare"
              ? match.declare(input)
              : match.followOn(input);
    } catch {
      // Any impossible state during a replay is a rejected log, never a server error.
      ok = false;
    }
    if (!ok) return { reason: "Invalid cricket action, sequence or trajectory" };
  }
  return { match };
}

export const sinverseCricket: SoloGameDefinition<CricketConfig, CricketLog> = {
  id: "sinverse-cricket",
  configSchema,
  logSchema,
  verify(seed, config, log) {
    const v2 = isFormatConfig(config);
    // Each version accepts only its own log shape and time limit.
    if (!(v2 ? formatLogSchema : duelLogSchema).safeParse(log).success) return { ok: false, reason: "Invalid cricket action, sequence or trajectory" };
    const timeline = checkTimeline(
      log.map((m) => m.t),
      v2 ? FORMAT_MAX_MS : 1800000,
    );
    if (timeline) return { ok: false, reason: timeline };
    const replayed = replayMatch(seed, config, log);
    if ("reason" in replayed) return { ok: false, reason: replayed.reason };
    const match = replayed.match;
    if (match.phase !== "finished")
      return { ok: false, reason: "Finish both innings before submitting" };
    return { ok: true, result: match.summary() };
  },
};
export type { FormatConfig };
