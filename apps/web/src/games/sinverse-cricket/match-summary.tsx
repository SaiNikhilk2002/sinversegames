"use client";

import { matchAwards, oversText, runRate, type Innings } from "@platform/engines/sinverse-cricket";

/**
 * Innings-break and match-result summaries for international matches
 * (version 2). Read-only views of the scorebook: the engine decides
 * everything shown here, and nothing here feeds back into play or rewards.
 */
type SideName = { name: string; short: string };
const fallText = (i: Innings) => i.fall.map((f) => `${f.score}-${f.wicket} (${f.batter.split(" ").at(-1)}, ${f.ball})`).join(" · ");
const extrasOf = (i: Innings) => i.extras.wides + i.extras.noBalls + i.extras.byes + i.extras.legByes;
const surname = (name: string) => name.split(" ").at(-1) ?? name;

export function InningsBreak({ first, batting, chasing, limit, format, onBegin }: { first: Innings; batting: SideName; chasing: SideName; limit: number; format: string; onBegin: () => void }) {
  const target = first.runs + 1,
    { sides } = matchAwards([first]),
    own = sides[first.team]!,
    their = sides[1 - first.team]!;
  return (
    <div className="cr-transition cr-break" data-testid="cricket-innings-break" role="dialog" aria-label="Innings break">
      <p className="cr-eyebrow">INNINGS BREAK · {format.toUpperCase()}</p>
      <h2>
        {batting.name} <b>{first.runs}/{first.wickets}</b> <small>({oversText(first.balls)} ov)</small>
      </h2>
      <p className="cr-break-target" data-testid="cricket-target">
        <b>{chasing.name}</b> need <b>{target}</b> from {limit} balls · required rate <b>{runRate(target, limit).toFixed(2)}</b>
      </p>
      <dl className="cr-break-facts">
        {own.batting && (
          <div>
            <dt>Top score</dt>
            <dd>{own.batting.name} {own.batting.runs} ({own.batting.balls})</dd>
          </div>
        )}
        {their.bowling && (
          <div>
            <dt>Best bowling</dt>
            <dd>{their.bowling.name} {their.bowling.wickets}/{their.bowling.runs} ({oversText(their.bowling.balls)})</dd>
          </div>
        )}
        {own.partnership && own.partnership.runs > 0 && (
          <div>
            <dt>Best stand</dt>
            <dd>{surname(own.partnership.names[0])}–{surname(own.partnership.names[1])} {own.partnership.runs} ({own.partnership.balls})</dd>
          </div>
        )}
        <div>
          <dt>Run rate · extras</dt>
          <dd>{runRate(first.runs, first.balls).toFixed(2)} · {extrasOf(first)}</dd>
        </div>
      </dl>
      <p className="cr-break-fall"><small>Fall of wickets</small> {first.fall.length ? fallText(first) : "No wickets fell"}</p>
      <button className="cr-button cr-primary" data-testid="cricket-begin-chase" onClick={onBegin}>Start the chase</button>
    </div>
  );
}

/** The figures under the result: top performer, each side's best batting and bowling, and the player's own part. */
export function MatchAwards({ innings, sideOf, own }: { innings: Innings[]; sideOf: (team: number) => SideName; own?: { controlled: number; needed: number; won: boolean; counts: boolean; runs: number; wickets: number; simulated: number } }) {
  const { top, sides } = matchAwards(innings);
  return (
    <div className="cr-awards" data-testid="cricket-awards">
      {top && (
        <p className="cr-potm" data-testid="cricket-top-performer">
          <small>Top performer</small>
          <b>{top.name}</b> <span>{sideOf(top.team).short}</span>
          <em>
            {[top.balls || top.runs ? `${top.runs} (${top.balls})` : null, top.overs ? `${top.wickets}/${top.conceded}` : null, top.dismissalsTaken ? `${top.dismissalsTaken} in the field` : null].filter(Boolean).join(" · ")}
          </em>
          <i>Runs, plus 20 a wicket and 8 a catch, stumping or run-out</i>
        </p>
      )}
      <div className="cr-awards-sides">
        {[0, 1].map((team) => {
          const s = sides[team]!;
          return (
            <dl key={team}>
              <dt>{sideOf(team).name}</dt>
              {s.batting && <dd><small>Bat</small> {s.batting.name} {s.batting.runs} ({s.batting.balls})</dd>}
              {s.bowling && <dd><small>Bowl</small> {s.bowling.name} {s.bowling.wickets}/{s.bowling.runs}</dd>}
              {s.partnership && s.partnership.runs > 0 && <dd><small>Stand</small> {surname(s.partnership.names[0])}–{surname(s.partnership.names[1])} {s.partnership.runs}</dd>}
            </dl>
          );
        })}
      </div>
      {own && (
        <p className="cr-your-part" data-testid="cricket-your-part">
          You played <b>{own.controlled}</b> ball{own.controlled === 1 ? "" : "s"} yourself ({own.runs} runs, {own.wickets} wicket{own.wickets === 1 ? "" : "s"}); {own.simulated} were simulated.{" "}
          {own.won
            ? own.counts
              ? "This win counts towards your record."
              : `A win counts towards your record once you play ${own.needed} balls yourself, so this one is saved but counts as neither a win nor a loss.`
            : "Only the balls you played earn points and achievements."}
        </p>
      )}
    </div>
  );
}
