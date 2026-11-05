import { scoreDelivery } from "./rules";
import { seededRng } from "../core/seeded";
import type { SoloGameDefinition } from "../core/solo";
import { checkTimeline } from "../core/solo";
import { TEAMS, fieldPositions } from "./content";
import {
  ballLogSchema,
  configSchema,
  logSchema,
  oversText,
  tossSchema,
  VARIATIONS,
  type BallLog,
  type BowlingInput,
  type CricketConfig,
  type CricketLog,
  type FieldName,
  type Innings,
  type Outcome,
  type ShotInput,
} from "./domain";
import { Delivery, integrateBall } from "./physics";
import { copy } from "./domain";

export class CricketMatch {
  readonly config: CricketConfig;
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
  inputLog: CricketLog = [];
  recentVariations: string[] = [];
  recentDirections: number[] = [];
  constructor(
    readonly seed: number,
    config: CricketConfig,
  ) {
    this.config = configSchema.parse(config);
    this.tossFace = seededRng(seed ^ 0x51a7).int(2) ? "heads" : "tails";
  }
  get current() {
    return this.innings[this.innings.length - 1]!;
  }
  get humanBatting() {
    return this.current.team === this.config.team;
  }
  get target() {
    return this.innings.length === 2 ? this.innings[0]!.runs + 1 : null;
  }
  get bowlerIndex() {
    return Math.floor(this.current.balls / 6);
  }
  toss(input: unknown) {
    const parsed = tossSchema.safeParse(input);
    if (!parsed.success || this.phase !== "toss") return false;
    const move = parsed.data;
    this.tossWinner =
      move.call === this.tossFace ? this.config.team : 1 - this.config.team;
    const decision =
      this.tossWinner === this.config.team
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
    this.phase = "ready";
  }
  nextInnings() {
    if (this.phase !== "interval") return false;
    this.openInnings(1 - this.firstBat);
    return true;
  }
  fieldForAI(): FieldName {
    return this.current.balls >= this.config.overs * 6 - 2
      ? "boundary"
      : this.current.wickets > 1
        ? "attack"
        : "balanced";
  }
  bowlingForAI(): BowlingInput {
    const rng = seededRng(this.seed ^ Math.imul(this.seq + 1, 374761393));
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
  private battingForAI(
    bowling: BowlingInput,
    delivery: Delivery,
    field: FieldName,
  ): ShotInput {
    const rng = seededRng(this.seed ^ Math.imul(this.seq + 3, 668265263));
    const remaining = this.config.overs * 6 - this.current.balls;
    const needed = this.target
      ? this.target - this.current.runs
      : remaining * 1.7;
    const attack = needed / Math.max(1, remaining) > 1.8 || remaining < 3;
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
    const kind =
      bowling.length > 6
        ? "pull"
        : attack && bowling.length > 1.5
          ? "loft"
          : Math.abs(direction) > 50
            ? "cut"
            : direction > 10
              ? "cover"
              : "straight";
    const noise =
      this.config.difficulty === "club"
        ? 13
        : this.config.difficulty === "county"
          ? 8
          : 4;
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
    return {
      kind: observedKind,
      direction,
      power: attack ? 0.87 : 0.62,
      foot: 0,
      face: Math.max(
        -0.6,
        Math.min(
          0.6,
          (position.x - Math.sin((direction * Math.PI) / 180) * 0.45) / 0.55,
        ),
      ),
      tick: Math.max(100, estimate - 8 + rng.int(noise * 2 + 1) - noise),
    };
  }
  createDelivery(
    input: Pick<BallLog, "bowling" | "shot" | "runAt" | "field">,
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
  record(input: unknown, observed?: Delivery) {
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
    if (
      i.balls >= this.config.overs * 6 ||
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
    const human = this.innings.find((i) => i.team === this.config.team),
      opposition = this.innings.find((i) => i.team !== this.config.team);
    const sixes = human?.batsmen.reduce((n, b) => n + b.sixes, 0) ?? 0;
    const fours = human?.batsmen.reduce((n, b) => n + b.fours, 0) ?? 0;
    const won = this.phase === "finished" && this.winner === this.config.team;
    const score = Math.max(
      0,
      Math.round(
        ((human?.runs ?? 0) * 15 + (opposition?.wickets ?? 0) * 45) /
          this.config.overs,
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
}

export const sinverseCricket: SoloGameDefinition<CricketConfig, CricketLog> = {
  id: "sinverse-cricket",
  configSchema,
  logSchema,
  verify(seed, config, log) {
    const timeline = checkTimeline(
      log.map((m) => m.t),
      1800000,
    );
    if (timeline) return { ok: false, reason: timeline };
    const match = new CricketMatch(seed, config);
    for (const input of log) {
      if (input.k === "ball" && match.phase === "interval") match.nextInnings();
      if (input.k === "toss" ? !match.toss(input) : !match.record(input))
        return {
          ok: false,
          reason: "Invalid cricket action, sequence or trajectory",
        };
    }
    if (match.phase !== "finished")
      return { ok: false, reason: "Finish both innings before submitting" };
    return { ok: true, result: match.summary() };
  },
};
