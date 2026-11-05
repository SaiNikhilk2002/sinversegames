import { z } from "zod";

export const STEP = 1 / 120;
export const RELEASE_TICK = 100;
export const STUMPS_Z = 10.0584;
export const CREASE_Z = STUMPS_Z - 1.22;
export const RUN_DISTANCE = CREASE_Z * 2;
export const BALL_RADIUS = 0.036;
export const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
export type Vec = { x: number; y: number; z: number };
export const vec = (x = 0, y = 0, z = 0): Vec => ({ x, y, z });
export const copy = (v: Vec) => ({ ...v });
export const distance = (a: Vec, b: Vec) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const SHOTS = [
  "defend",
  "straight",
  "cover",
  "on-drive",
  "cut",
  "pull",
  "sweep",
  "loft",
] as const;
export type ShotKind = (typeof SHOTS)[number];
export const VARIATIONS = [
  "seam",
  "inswing",
  "outswing",
  "slower",
  "offbreak",
  "legbreak",
  "googly",
  "topspin",
] as const;
export type Variation = (typeof VARIATIONS)[number];
export const shotSchema = z
  .object({
    kind: z.enum(SHOTS),
    direction: z.number().finite().min(-150).max(150),
    power: z.number().finite().min(0.15).max(1),
    foot: z.number().finite().min(-0.3).max(0.8),
    face: z.number().finite().min(-0.6).max(0.6),
    tick: z.number().int().min(RELEASE_TICK).max(400),
  })
  .strict();
export type ShotInput = z.infer<typeof shotSchema>;
export const bowlingSchema = z
  .object({
    variation: z.enum(VARIATIONS),
    line: z.number().finite().min(-1.5).max(1.5),
    length: z.number().finite().min(0.5).max(9),
    speed: z.number().finite().min(0).max(1),
    release: z.number().finite().min(-1).max(1),
  })
  .strict();
export type BowlingInput = z.infer<typeof bowlingSchema>;
export const FIELD_NAMES = ["balanced", "attack", "boundary"] as const;
export type FieldName = (typeof FIELD_NAMES)[number];
export const configSchema = z
  .object({
    version: z.literal(1).default(1),
    format: z.literal("duel").default("duel"),
    overs: z.union([z.literal(1), z.literal(2)]).default(1),
    team: z.union([z.literal(0), z.literal(1)]).default(0),
    venue: z.enum(["lantern", "tideglass"]).default("lantern"),
    difficulty: z.enum(["club", "county", "elite"]).default("club"),
  })
  .strict();
export type CricketConfig = z.infer<typeof configSchema>;
export const tossSchema = z
  .object({
    k: z.literal("toss"),
    call: z.enum(["heads", "tails"]),
    decision: z.enum(["bat", "bowl"]),
    t: z.number().int().min(0).max(1800000),
  })
  .strict();
export const ballLogSchema = z
  .object({
    k: z.literal("ball"),
    seq: z.number().int().min(0).max(127),
    bowling: bowlingSchema.nullable(),
    shot: shotSchema.nullable(),
    runAt: z.array(z.number().int().min(RELEASE_TICK).max(1679)).max(3),
    field: z.enum(FIELD_NAMES),
    digest: z.string().regex(/^[a-f0-9]{8}$/),
    t: z.number().int().min(0).max(1800000),
  })
  .strict();
export const logSchema = z
  .array(z.discriminatedUnion("k", [tossSchema, ballLogSchema]))
  .min(1)
  .max(129);
export type BallLog = z.infer<typeof ballLogSchema>;
export type CricketLog = z.infer<typeof logSchema>;
export type Dismissal = "bowled" | "caught" | "lbw" | "run-out" | "stumped";
export type Outcome = {
  bat: number;
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  total: number;
  legal: boolean;
  wicket: Dismissal | null;
  dismissed: "striker" | "non-striker";
  boundary: 0 | 4 | 6;
  completedRuns: number;
  timing: number;
  label: string;
};
export type Fielder = {
  id: number;
  pos: Vec;
  start: Vec;
  speed: number;
  skill: number;
  action: "ready" | "run" | "dive" | "catch" | "pickup" | "throw" | "drop";
  travel: number;
};
export type Frame = {
  tick: number;
  ball: Vec;
  fielders: Vec[];
  travel: number[];
  bowlerFootZ: number;
  batterGroundZ: number;
  actions: Fielder["action"][];
  runner: number;
  contact: boolean;
  bounce: boolean;
  mode: "delivery" | "struck" | "throw" | "dead";
};
export type BatterCard = {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dismissal: string | null;
};
export type BowlerCard = {
  name: string;
  balls: number;
  runs: number;
  wickets: number;
  wides: number;
  noBalls: number;
};
export type Innings = {
  team: number;
  runs: number;
  wickets: number;
  balls: number;
  striker: number;
  nonStriker: number;
  nextBatter: number;
  batsmen: BatterCard[];
  bowlers: BowlerCard[];
  extras: { wides: number; noBalls: number; byes: number; legByes: number };
  fall: { score: number; wicket: number; ball: string; batter: string }[];
  over: string[];
  partnership: number;
  freeHit: boolean;
};
export const oversText = (balls: number) =>
  `${Math.floor(balls / 6)}.${balls % 6}`;
export const totalExtras = (i: Innings) =>
  i.extras.wides + i.extras.noBalls + i.extras.byes + i.extras.legByes;

/** The duel has explicit house playing conditions; no T20/ODI/Test compliance claim. */
export function adjudicate(
  raw: Omit<Outcome, "total" | "legal" | "label">,
  freeHit: boolean,
): Outcome {
  const out = { ...raw };
  if (out.noBalls) out.wides = 0;
  if (out.wides && out.wicket !== "run-out" && out.wicket !== "stumped")
    out.wicket = null;
  if ((out.noBalls || freeHit) && out.wicket !== "run-out") out.wicket = null;
  if (
    out.wicket === "caught" ||
    out.wicket === "bowled" ||
    out.wicket === "lbw" ||
    out.wicket === "stumped"
  ) {
    out.bat = 0;
    out.completedRuns = 0;
    out.boundary = 0;
    out.byes = 0;
    out.legByes = 0;
  }
  const total = out.bat + out.wides + out.noBalls + out.byes + out.legByes;
  const label = out.wicket
    ? out.wicket.toUpperCase()
    : out.noBalls
      ? `${total} NB`
      : out.wides
        ? `${total} WD`
        : out.boundary
          ? String(out.boundary)
          : out.legByes
            ? `${total} LB`
            : out.byes
              ? `${total} B`
              : total
                ? String(total)
                : "DOT";
  return { ...out, total, legal: !out.wides && !out.noBalls, label };
}
