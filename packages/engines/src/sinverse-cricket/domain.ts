import { z } from "zod";
import { internationalTeam, validateSelection } from "./teams";

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
/** The duel's named fields (version 1). */
export const FIELD_NAMES = ["balanced", "attack", "boundary"] as const;
/**
 * Fields for the international formats (version 2). Each respects the limit on
 * fielders outside the 30-yard circle: attack 2, balanced 4, deep 5. (The duel's
 * "boundary" field puts 7 out, which no real fielding restriction allows.)
 */
export const FIELD_NAMES_V2 = ["attack", "balanced", "deep"] as const;
export type FieldName = (typeof FIELD_NAMES)[number] | (typeof FIELD_NAMES_V2)[number];
/** The 1- and 2-over duel. Frozen: stored records and replays depend on it exactly. */
export const duelConfigSchema = z
  .object({
    version: z.literal(1).default(1),
    format: z.literal("duel").default("duel"),
    overs: z.union([z.literal(1), z.literal(2)]).default(1),
    team: z.union([z.literal(0), z.literal(1)]).default(0),
    venue: z.enum(["lantern", "tideglass"]).default("lantern"),
    difficulty: z.enum(["club", "county", "elite"]).default("club"),
  })
  .strict();
export type DuelConfig = z.infer<typeof duelConfigSchema>;
/** Limited-overs formats playable end to end. Test cricket is engine-only (see `formats.ts`). */
export const PLAYABLE_FORMATS = ["t20", "odi"] as const;
export type PlayableFormat = (typeof PLAYABLE_FORMATS)[number];
const playerId = z.string().regex(/^[a-z-]{2,24}-\d{1,2}$/);
/**
 * An international match (version 2): the player's side and the opposition from
 * the team catalogue, the player's own XI in batting order with a captain and a
 * keeper. The opposition plays its catalogue XI.
 */
export const formatConfigSchema = z
  .object({
    version: z.literal(2),
    format: z.enum(PLAYABLE_FORMATS),
    team: z.string().min(2).max(24),
    opponent: z.string().min(2).max(24),
    xi: z.array(playerId).length(11),
    captain: playerId,
    keeper: playerId,
    venue: z.enum(["lantern", "tideglass"]).default("lantern"),
    difficulty: z.enum(["club", "county", "elite"]).default("club"),
  })
  .strict()
  .superRefine((c, ctx) => {
    // Both sides must exist, differ, and the player's XI must be a legal pick from their own squad.
    const team = internationalTeam(c.team);
    if (!team) return ctx.addIssue({ code: "custom", message: "Unknown team", path: ["team"] });
    if (!internationalTeam(c.opponent)) ctx.addIssue({ code: "custom", message: "Unknown opposition", path: ["opponent"] });
    if (c.opponent === c.team) ctx.addIssue({ code: "custom", message: "Choose two different teams", path: ["opponent"] });
    for (const problem of validateSelection(team, c)) ctx.addIssue({ code: "custom", message: problem, path: ["xi"] });
  });
export type FormatConfig = z.infer<typeof formatConfigSchema>;
/** Version 1 first, so a bare `{}` still means the default duel. */
export const configSchema = z.union([duelConfigSchema, formatConfigSchema]);
export type CricketConfig = DuelConfig | FormatConfig;
export const isFormatConfig = (c: CricketConfig): c is FormatConfig => c.version === 2;
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
export const duelLogSchema = z
  .array(z.discriminatedUnion("k", [tossSchema, ballLogSchema]))
  .min(1)
  .max(129);
/** Six hours: the run token's lifetime, and enough for an ODI with simulated passages. */
export const FORMAT_MAX_MS = 6 * 60 * 60 * 1000;
export const MAX_FORMAT_SEQ = 5999;
/** A delivery in an international match: as the duel's, plus the bowler chosen at an over's start. */
export const formatBallSchema = z
  .object({
    k: z.literal("ball"),
    seq: z.number().int().min(0).max(MAX_FORMAT_SEQ),
    bowling: bowlingSchema.nullable(),
    shot: shotSchema.nullable(),
    runAt: z.array(z.number().int().min(RELEASE_TICK).max(1679)).max(3),
    field: z.enum(FIELD_NAMES_V2),
    /** Index in the fielding XI of the bowler for a new over; only the player's own side chooses. */
    bowler: z.number().int().min(0).max(10).optional(),
    digest: z.string().regex(/^[a-f0-9]{8}$/),
    t: z.number().int().min(0).max(FORMAT_MAX_MS),
  })
  .strict();
/**
 * A simulated passage: both sides' captains (the AI) play `balls` legal
 * deliveries (extras are bowled again), stopping early at the end of the innings. Deterministic from the seed, so
 * the server replays it exactly. Simulated balls never count as the player's own.
 */
export const simSchema = z
  .object({
    k: z.literal("sim"),
    seq: z.number().int().min(0).max(MAX_FORMAT_SEQ),
    balls: z.number().int().min(1).max(600),
    t: z.number().int().min(0).max(FORMAT_MAX_MS),
  })
  .strict();
/** Test cricket only: the batting side closes its innings. */
export const declareSchema = z.object({ k: z.literal("declare"), t: z.number().int().min(0).max(FORMAT_MAX_MS) }).strict();
/** Test cricket only: the side with a big enough first-innings lead decides whether to enforce the follow-on. */
export const followOnSchema = z.object({ k: z.literal("follow-on"), enforce: z.boolean(), t: z.number().int().min(0).max(FORMAT_MAX_MS) }).strict();
export const formatLogSchema = z
  .array(z.discriminatedUnion("k", [tossSchema, formatBallSchema, simSchema, declareSchema, followOnSchema]))
  .min(1)
  .max(4000);
/** Either log shape; `verify` checks that it matches the config's version. */
export const logSchema = z.union([duelLogSchema, formatLogSchema]);
export type BallLog = z.infer<typeof ballLogSchema>;
export type FormatBallLog = z.infer<typeof formatBallSchema>;
export type SimLog = z.infer<typeof simSchema>;
/** One entry of either log shape. */
export type CricketLogEntry = z.infer<typeof duelLogSchema>[number] | z.infer<typeof formatLogSchema>[number];
export type CricketLog = CricketLogEntry[];
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
  /** Catalogue player id (international matches only). */
  id?: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dismissal: string | null;
};
export type BowlerCard = {
  name: string;
  /** Catalogue player id and index in the fielding XI (international matches only). */
  id?: string;
  slot?: number;
  maidens?: number;
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
  /** International matches only (absent from duel records): */
  /** The bowler card bowling each over, by over index. */
  overBowlers?: number[];
  /** Every partnership: the two batters (batting-order indices), runs and balls. */
  partnerships?: { a: number; b: number; runs: number; balls: number }[];
  /** Runs conceded in the over so far, for maidens. */
  overRuns?: number;
  /** Why the innings closed: all out, overs, target, declared. */
  closed?: "all-out" | "overs" | "target" | "declared" | "time";
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
