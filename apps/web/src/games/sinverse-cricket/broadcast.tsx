import { oversText, type BatterCard, type BowlerCard, type Innings, type Outcome } from "@platform/engines/sinverse-cricket";

/**
 * Broadcast graphics: the cards a television director would put up between
 * deliveries. Everything shown is the match's own scorebook (names, runs,
 * balls, figures, fall of wicket) or measured from the simulated ball; nothing
 * is invented. Cards appear only while the ball is dead, never over live play,
 * one event card and one lower third at most, and they leave on their own.
 */

export interface HistoryEntry {
  innings: number;
  ball: string;
  label: string;
  runs: number;
  wicket: string | null;
}

export type Card =
  | { kind: "wicket"; batter: string; how: string; runs: number; balls: number; fall: string; enter: number }
  | { kind: "four" | "six"; batter: string; runs: number; balls: number; carry: number | null; enter: number }
  | { kind: "over"; over: number; balls: string[]; runs: number; score: string; bowler: string; figures: string; enter: number }
  | { kind: "batter"; name: string; order: number; team: string; enter: number }
  | { kind: "bowler"; name: string; figures: string; team: string; enter: number };

export interface IntroMemo {
  batter: string;
  batterAt: number;
  bowler: string;
  bowlerAt: number;
}
export const newIntroMemo = (): IntroMemo => ({ batter: "", batterAt: -1e9, bowler: "", bowlerAt: -1e9 });

export interface BroadcastInput {
  /** Milliseconds of match time now, and when the last ball was settled. */
  now: number;
  endedAt: number;
  /** The last ball is over and the next hasn't started. */
  settled: boolean;
  live: boolean;
  replay: boolean;
  ready: boolean;
  innings: Innings | undefined;
  inningsNo: number;
  history: readonly HistoryEntry[];
  outcome: Outcome | null;
  /** Metres the ball carried to the rope (a six), measured from the simulation. */
  carry: number | null;
  /** The batting and fielding sides' names. */
  batting: string;
  fielding: string;
}

/** Scorebook labels of a dismissal (a dot ball is "DOT"). */
const WICKETS = /^(BOWLED|CAUGHT|LBW|STUMPED|RUN-OUT)$/;
const EVENT_MS = 3400,
  OVER_MS = 4200,
  INTRO_MS = 3800;

/** Bowling figures as a scorecard prints them: overs-runs-wickets. */
export const figures = (b: BowlerCard | undefined) => (b ? `${oversText(b.balls)}-${b.runs}-${b.wickets}` : "");

const HOW: Record<NonNullable<Outcome["wicket"]>, string> = { bowled: "Bowled", caught: "Caught", lbw: "Leg before wicket", "run-out": "Run out", stumped: "Stumped" };

/** Which cards are up at `now`, with how long each has been showing. Updates `memo` for lower-thirds. */
export function broadcastCards(i: BroadcastInput, memo: IntroMemo): Card[] {
  const cards: Card[] = [],
    inn = i.innings;
  if (!inn || i.replay) return cards;
  const since = i.now - i.endedAt;
  const o = i.settled ? i.outcome : null;
  let eventEnds = 0;
  // ---- the event: a wicket, a four, a six ------------------------------------
  if (o && i.ready && since < EVENT_MS) {
    const fall = inn.fall.at(-1);
    if (o.wicket && fall) {
      const card = inn.batsmen.find((b) => b.name === fall.batter) as BatterCard | undefined;
      cards.push({ kind: "wicket", batter: fall.batter, how: HOW[o.wicket], runs: card?.runs ?? 0, balls: card?.balls ?? 0, fall: `${fall.score}/${fall.wicket} · ${fall.ball} ov`, enter: since });
    } else if (o.boundary && o.bat) {
      // A boundary never changes ends by itself; only the end of an over does.
      const hitter = inn.batsmen[o.legal && inn.balls % 6 === 0 ? inn.nonStriker : inn.striker];
      cards.push({ kind: o.boundary === 6 ? "six" : "four", batter: hitter?.name ?? "", runs: hitter?.runs ?? 0, balls: hitter?.balls ?? 0, carry: o.boundary === 6 ? i.carry : null, enter: since });
    }
    if (cards.length) eventEnds = EVENT_MS;
  }
  // ---- end of an over ------------------------------------------------------------
  const overDone = o && i.ready && inn.balls > 0 && inn.balls % 6 === 0 && o.legal;
  if (overDone) {
    const start = eventEnds ? eventEnds - 600 : 300,
      t = since - start;
    if (t >= 0 && t < OVER_MS) {
      const over = inn.balls / 6 - 1,
        entries = i.history.filter((h) => h.innings === i.inningsNo && Number(h.ball.split(".")[0]) === over),
        bowler = inn.bowlers[over];
      cards.push({ kind: "over", over: over + 1, balls: entries.map((h) => h.label), runs: entries.reduce((n, h) => n + h.runs, 0), score: `${inn.runs}/${inn.wickets}`, bowler: bowler?.name ?? "", figures: figures(bowler), enter: t });
    }
  }
  // ---- lower thirds: who's new to the crease, who's bowling this over ---------------
  if (i.ready && !i.live) {
    const striker = inn.batsmen[inn.striker];
    const busyUntil = Math.max(eventEnds, overDone ? (eventEnds ? eventEnds - 600 : 300) + OVER_MS : 0);
    if (striker && striker.balls === 0 && !striker.dismissal) {
      const key = `${i.inningsNo}-${striker.name}`;
      if (memo.batter !== key) {
        memo.batter = key;
        memo.batterAt = i.now + (i.settled ? Math.max(0, busyUntil - since) : 0);
      }
    }
    const t = i.now - memo.batterAt;
    if (striker && memo.batter === `${i.inningsNo}-${striker.name}` && t >= 0 && t < INTRO_MS)
      cards.push({ kind: "batter", name: striker.name, order: inn.batsmen.indexOf(striker) + 1, team: i.batting, enter: t });
    else if (inn.balls % 6 === 0 && inn.balls < inn.bowlers.length * 6) {
      const bowler = inn.bowlers[inn.balls / 6],
        key = `${i.inningsNo}-${inn.balls / 6}`;
      if (bowler && memo.bowler !== key) {
        memo.bowler = key;
        memo.bowlerAt = Math.max(i.now + (i.settled ? Math.max(0, busyUntil - since) : 0), memo.batterAt + INTRO_MS);
      }
      const tb = i.now - memo.bowlerAt;
      if (bowler && memo.bowler === key && tb >= 0 && tb < INTRO_MS) cards.push({ kind: "bowler", name: bowler.name, figures: figures(bowler), team: i.fielding, enter: tb });
    }
  }
  return cards;
}

/** Top performers of an innings, straight from its scorecard. */
export function standouts(inn: Innings) {
  const bat = [...inn.batsmen].filter((b) => b.balls > 0).sort((a, b) => b.runs - a.runs || a.balls - b.balls)[0];
  const bowl = [...inn.bowlers].filter((b) => b.balls > 0).sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0];
  return { bat, bowl };
}

export function BroadcastGraphics({ cards }: { cards: Card[] }) {
  return (
    <>
      {cards.map((c) => {
        const leaving = c.kind === "batter" || c.kind === "bowler" ? c.enter > INTRO_MS - 450 : c.kind === "over" ? c.enter > OVER_MS - 450 : c.enter > EVENT_MS - 450;
        const cls = `cr-gfx cr-gfx-${c.kind}${leaving ? " is-leaving" : ""}`;
        if (c.kind === "wicket")
          return (
            <div key="event" className={cls} role="status" data-testid="cricket-graphic" data-graphic="wicket">
              <small>Wicket · {c.how}</small>
              <strong>{c.batter}</strong>
              <span>
                {c.runs} <i>({c.balls})</i>
              </span>
              <em>Fall of wicket {c.fall}</em>
            </div>
          );
        if (c.kind === "four" || c.kind === "six")
          return (
            <div key="event" className={cls} role="status" data-testid="cricket-graphic" data-graphic={c.kind}>
              <small>{c.kind === "six" ? "Maximum" : "Boundary"}</small>
              <strong>{c.kind === "six" ? "SIX" : "FOUR"}</strong>
              <span>
                {c.batter} {c.runs} <i>({c.balls})</i>
              </span>
              {c.carry !== null && <em>Cleared the rope at {Math.round(c.carry)} m</em>}
            </div>
          );
        if (c.kind === "over")
          return (
            <div key="over" className={cls} role="status" data-testid="cricket-graphic" data-graphic="over">
              <small>End of over {c.over}</small>
              <div className="cr-gfx-balls">
                {c.balls.map((b, n) => (
                  <b key={n} className={b === "4" || b === "6" ? "is-boundary" : WICKETS.test(b) ? "is-wicket" : ""}>
                    {b === "0" || b === "DOT" ? "•" : WICKETS.test(b) ? "W" : b}
                  </b>
                ))}
              </div>
              <span>
                {c.runs} run{c.runs === 1 ? "" : "s"} from the over · {c.score}
              </span>
              <em>
                {c.bowler} {c.figures}
              </em>
            </div>
          );
        if (c.kind === "batter")
          return (
            <div key="third" className={cls} data-testid="cricket-graphic" data-graphic="batter">
              <small>New at the crease · No. {c.order}</small>
              <strong>{c.name}</strong>
              <span>{c.team}</span>
            </div>
          );
        if (c.kind !== "bowler") return null;
        return (
          <div key="third" className={cls} data-testid="cricket-graphic" data-graphic="bowler">
            <small>Into the attack</small>
            <strong>{c.name}</strong>
            <span>
              {c.team} · {c.figures}
            </span>
          </div>
        );
      })}
    </>
  );
}
