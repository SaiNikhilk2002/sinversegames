import {
  configSchema,
  CricketMatch,
  STEP,
  type BallLog,
  type BowlingInput,
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
/** Physics calibration fixture, never a product auto-play or claimed human input. */
export function calibratedShot(match: CricketMatch) {
  const field = match.fieldForAI();
  const probe = match.createDelivery(
    { bowling: null, shot: null, runAt: [], field },
    false,
  );
  while (probe.pos.z < 8.6 && !probe.outcome && probe.tick < 400) probe.step();
  const kind = probe.pos.y > 0.95 ? "pull" : "loft";
  return {
    ...shot,
    kind,
    tick: Math.max(100, probe.tick - 8),
    face: Math.max(-0.6, Math.min(0.6, probe.pos.x / 0.55)),
  } as ShotInput;
}
export function playMatch(seed: number, attacking = true, rules = config) {
  const match = new CricketMatch(seed, rules);
  match.toss({ k: "toss", call: match.tossFace, decision: "bat", t: 0 });
  let time = 0;
  while (match.phase !== "finished" && match.seq < 64) {
    if (match.phase === "interval") match.nextInnings();
    const batting = match.humanBatting;
    const move = {
      bowling: batting ? null : bowling,
      shot: batting && attacking ? calibratedShot(match) : null,
      runAt: [],
      field: batting ? match.fieldForAI() : ("balanced" as const),
    };
    const delivery = match.createDelivery(move);
    delivery.complete();
    time += Math.ceil(delivery.tick * STEP * 1000) + 1000;
    const log: BallLog = {
      k: "ball",
      seq: match.seq,
      ...move,
      digest: delivery.digest,
      t: time,
    };
    if (!match.record(log, delivery)) throw Error("Fixture delivery rejected");
  }
  return match;
}
