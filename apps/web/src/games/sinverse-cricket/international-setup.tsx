"use client";

import { useMemo, useState } from "react";
import {
  FORMATS,
  INTERNATIONAL_TEAMS,
  VENUES,
  configSchema,
  internationalTeam,
  validateSelection,
  xiProfile,
  type XiProfile,
  type CricketPlayer,
  type CricketTeam,
  type FormatConfig,
  type PlayableFormat,
} from "@platform/engines/sinverse-cricket";
import { TeamCrest } from "./crest";

/**
 * The international match setup: format, both teams, the player's own playing
 * XI (batting order, captain, keeper), the ground and difficulty, then a
 * summary. Everything chosen here goes into the signed match config; the
 * engine plays exactly these eleven (see packages/engines/.../match.ts).
 */
const ROLE: Record<CricketPlayer["role"], string> = { batter: "Batter", keeper: "Wicketkeeper", "all-rounder": "All-rounder", pace: "Pace bowler", spin: "Spin bowler" };
const BOWLS: Record<NonNullable<CricketPlayer["bowls"]>, string> = { fast: "Right-arm fast", medium: "Right-arm medium", "off-spin": "Off-spin", "leg-spin": "Leg-spin", "left-arm-spin": "Left-arm spin" };
type Step = "teams" | "xi" | "match";

/** Side-by-side strength of the two elevens that will play (the player's chosen XI and the opposition's), from the catalogue attributes. */
function Comparison({ mine, theirs, mineName, theirName }: { mine: XiProfile; theirs: XiProfile; mineName: string; theirName: string }) {
  return (
    <div className="cr-compare" role="group" aria-label="Strength of the two elevens" data-testid="team-comparison">
      <div className="cr-compare-head" aria-hidden>
        <span>{mineName} · your XI</span>
        <span>{theirName}</span>
      </div>
      {(["batting", "bowling", "fielding"] as const).map((k) => (
        <div key={k} className="cr-compare-row" role="img" aria-label={`${k}: ${mineName} ${mine[k]}, ${theirName} ${theirs[k]}`}>
          <b className={mine[k] > theirs[k] ? "is-ahead" : undefined}>{mine[k]}</b>
          <span className="cr-compare-bars">
            <i style={{ width: `${mine[k]}%` }} />
            <small>{k}</small>
            <i style={{ width: `${theirs[k]}%` }} />
          </span>
          <b className={theirs[k] > mine[k] ? "is-ahead" : undefined}>{theirs[k]}</b>
        </div>
      ))}
    </div>
  );
}

function Ratings({ team }: { team: CricketTeam }) {
  return (
    <span className="cr-ratings" aria-label={`Batting ${team.ratings.batting}, bowling ${team.ratings.bowling}, fielding ${team.ratings.fielding}`}>
      {(["batting", "bowling", "fielding"] as const).map((k) => (
        <span key={k}>
          <small>{k.slice(0, 3).toUpperCase()}</small>
          <i style={{ width: `${team.ratings[k]}%` }} />
        </span>
      ))}
    </span>
  );
}

function TeamGrid({ chosen, other, onChoose, label }: { chosen: string; other: string; onChoose: (id: string) => void; label: string }) {
  return (
    <div className="cr-team-grid" role="radiogroup" aria-label={label}>
      {INTERNATIONAL_TEAMS.map((t) => {
        const taken = t.id === other;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={chosen === t.id}
            disabled={taken}
            title={taken ? "Already the other side" : t.name}
            className="cr-team-card"
            data-team={t.id}
            style={{ "--team": t.palette.primary, "--team-2": t.palette.accent } as React.CSSProperties}
            onClick={() => onChoose(t.id)}
          >
            <TeamCrest team={t} size={40} />
            <span>
              <strong>{t.name}</strong>
              <small>{t.short} · {t.tier === "full" ? "Full member" : "Associate"}</small>
            </span>
            <Ratings team={t} />
          </button>
        );
      })}
    </div>
  );
}

export function InternationalSetup({ format, onFormat, onStart, busy }: { format: PlayableFormat; onFormat: (f: PlayableFormat) => void; onStart: (config: FormatConfig) => void; busy: boolean }) {
  const [step, setStep] = useState<Step>("teams");
  const [teamId, setTeamId] = useState("india"),
    [opponentId, setOpponentId] = useState("australia"),
    [picking, setPicking] = useState<"team" | "opponent">("team");
  const team = internationalTeam(teamId)!,
    opponent = internationalTeam(opponentId)!;
  const [xi, setXi] = useState<string[]>(team.xi),
    [captain, setCaptain] = useState(team.captain),
    [keeper, setKeeper] = useState(team.keeper);
  const [venue, setVenue] = useState<FormatConfig["venue"]>("lantern"),
    [difficulty, setDifficulty] = useState<FormatConfig["difficulty"]>("club");
  const byId = useMemo(() => new Map(team.squad.map((p) => [p.id, p])), [team]);
  const chooseTeam = (id: string) => {
    if (picking === "team") {
      const t = internationalTeam(id)!;
      setTeamId(id);
      setXi(t.xi);
      setCaptain(t.captain);
      setKeeper(t.keeper);
      setPicking("opponent");
    } else setOpponentId(id);
  };
  const problems = validateSelection(team, { xi, captain, keeper });
  const mine = xiProfile(team, { xi, keeper }),
    theirs = xiProfile(opponent, opponent);
  const config: FormatConfig = { version: 2, format, team: teamId, opponent: opponentId, xi, captain, keeper, venue, difficulty };
  const valid = !problems.length && configSchema.safeParse(config).success;
  const rules = FORMATS[format];
  const move = (n: number, by: number) => {
    const next = [...xi],
      [p] = next.splice(n, 1);
    next.splice(Math.max(0, Math.min(next.length, n + by)), 0, p!);
    setXi(next);
  };
  const bench = team.squad.filter((p) => !xi.includes(p.id));
  const steps: [Step, string][] = [["teams", "Teams"], ["xi", "Playing XI"], ["match", "Match"]];

  return (
    <div className="cr-intl" data-testid="international-setup">
      <nav className="cr-steps" aria-label="Match setup steps">
        {steps.map(([id, name], n) => (
          <button key={id} type="button" aria-current={step === id ? "step" : undefined} onClick={() => setStep(id)}>
            <b>{n + 1}</b> {name}
          </button>
        ))}
      </nav>

      <div className="cr-fixture-preview" aria-label="Fixture preview">
        <div><TeamCrest team={team} /><span><small>YOUR XI</small><strong data-testid="your-team">{team.name}</strong><small>Captain · {byId.get(captain)?.name ?? "—"}</small></span></div>
        <b className="cr-versus">VS</b>
        <div><TeamCrest team={opponent} /><span><small>THE OPPOSITION</small><strong data-testid="opposition-team">{opponent.name}</strong><small>{difficulty === "club" ? "Club" : difficulty === "county" ? "County" : "Elite"} challenge</small></span></div>
        <p>{VENUES[venue].name}<br /><b>{rules.short} · {rules.overs} overs a side</b></p>
      </div>
      <Comparison mine={mine} theirs={theirs} mineName={team.name} theirName={opponent.name} />

      {step === "teams" && (
        <section className="cr-intl-section">
          <div className="cr-intl-head">
            <h3>{picking === "team" ? "Choose your team" : "Choose the opposition"}</h3>
            <div className="cr-segment" role="group" aria-label="Which side to choose">
              <button type="button" aria-pressed={picking === "team"} onClick={() => setPicking("team")}>Your team · {team.short}</button>
              <button type="button" aria-pressed={picking === "opponent"} onClick={() => setPicking("opponent")}>Opposition · {opponent.short}</button>
            </div>
          </div>
          <TeamGrid chosen={picking === "team" ? teamId : opponentId} other={picking === "team" ? opponentId : teamId} onChoose={chooseTeam} label={picking === "team" ? "Your team" : "Opposition"} />
          <p className="cr-note">Twenty fictional international sides. Every player, kit and emblem is original; no real cricketer is depicted.</p>
          <div className="cr-intl-nav"><span /><button type="button" className="cr-button cr-primary" onClick={() => setStep("xi")}>Pick your XI <span aria-hidden>→</span></button></div>
        </section>
      )}

      {step === "xi" && (
        <section className="cr-intl-section">
          <div className="cr-intl-head">
            <h3>{team.name} · playing XI</h3>
            <button type="button" className="cr-button" onClick={() => { setXi(team.xi); setCaptain(team.captain); setKeeper(team.keeper); }}>Reset to default XI</button>
          </div>
          <div className="cr-squad">
            <div>
              <h4>Batting order <small>{xi.length}/11</small></h4>
              <ol className="cr-xi" aria-label="Playing eleven in batting order">
                {xi.map((id, n) => {
                  const p = byId.get(id)!;
                  return (
                    <li key={id} data-player={id}>
                      <b>{n + 1}</b>
                      <span className="cr-player">
                        <strong>{p.name}{captain === id ? " (c)" : ""}{keeper === id ? " †" : ""}</strong>
                        <small>{ROLE[p.role]}{p.bowls ? ` · ${BOWLS[p.bowls]}` : ""} · bats {p.bats}</small>
                      </span>
                      <span className="cr-attrs" aria-label={`Batting ${p.batting}, power ${p.power}, bowling ${p.bowling}, fielding ${p.fielding}`}>
                        <i>BAT {p.batting}</i><i>BWL {p.bowling}</i>
                      </span>
                      <span className="cr-row-actions">
                        <button type="button" aria-label={`Make ${p.name} captain`} aria-pressed={captain === id} onClick={() => setCaptain(id)}>C</button>
                        <button type="button" aria-label={`Make ${p.name} wicketkeeper`} aria-pressed={keeper === id} onClick={() => setKeeper(id)}>WK</button>
                        <button type="button" aria-label={`Move ${p.name} up the order`} disabled={n === 0} onClick={() => move(n, -1)}>↑</button>
                        <button type="button" aria-label={`Move ${p.name} down the order`} disabled={n === xi.length - 1} onClick={() => move(n, 1)}>↓</button>
                        <button type="button" aria-label={`Drop ${p.name}`} onClick={() => setXi(xi.filter((x) => x !== id))}>✕</button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div>
              <h4>Rest of the squad</h4>
              <ul className="cr-bench" aria-label="Squad players not in the eleven">
                {bench.map((p) => (
                  <li key={p.id} data-player={p.id}>
                    <span className="cr-player"><strong>{p.name}</strong><small>{ROLE[p.role]}{p.bowls ? ` · ${BOWLS[p.bowls]}` : ""}</small></span>
                    <span className="cr-attrs"><i>BAT {p.batting}</i><i>BWL {p.bowling}</i></span>
                    <button type="button" className="cr-button" disabled={xi.length >= 11} aria-label={`Pick ${p.name}`} onClick={() => setXi([...xi, p.id])}>Pick</button>
                  </li>
                ))}
              </ul>
              <h4>{opponent.name} · their XI</h4>
              <ol className="cr-xi cr-xi-theirs" aria-label="Opposition eleven">
                {opponent.xi.map((id, n) => {
                  const p = opponent.squad.find((x) => x.id === id)!;
                  return <li key={id}><b>{n + 1}</b><span className="cr-player"><strong>{p.name}{opponent.captain === id ? " (c)" : ""}{opponent.keeper === id ? " †" : ""}</strong><small>{ROLE[p.role]}</small></span></li>;
                })}
              </ol>
            </div>
          </div>
          <div className={problems.length ? "cr-validation" : "cr-validation cr-valid"} role="status" aria-live="polite" data-testid="xi-status">
            {problems.length ? (
              problems.map((p) => <p key={p}>{p}</p>)
            ) : (
              <p>
                Eleven picked: {mine.bowlers} bowling options besides the keeper ({mine.spinners} spin) · {mine.roles.batter} batters, {mine.roles["all-rounder"]} all-rounders, {mine.roles.pace} pace, {mine.roles.spin} spin, {mine.roles.keeper} specialist keeper{mine.roles.keeper === 1 ? "" : "s"}. Ready.
              </p>
            )}
          </div>
          <div className="cr-intl-nav">
            <button type="button" className="cr-button" onClick={() => setStep("teams")}>← Teams</button>
            <button type="button" className="cr-button cr-primary" disabled={!!problems.length} onClick={() => setStep("match")}>Match settings <span aria-hidden>→</span></button>
          </div>
        </section>
      )}

      {step === "match" && (
        <section className="cr-intl-section">
          <h3>Match settings</h3>
          <div className="cr-settings-grid">
            <label>
              Format
              <select aria-label="Format" value={format} onChange={(e) => onFormat(e.target.value as PlayableFormat)}>
                <option value="t20">T20 · 20 overs a side</option>
                <option value="odi">ODI · 50 overs a side</option>
              </select>
            </label>
            <label>
              Ground
              <select aria-label="Ground" value={venue} onChange={(e) => setVenue(e.target.value as typeof venue)}>
                {Object.entries(VENUES).map(([id, v]) => <option value={id} key={id}>{v.name} · {v.night ? "Night" : "Day"}</option>)}
              </select>
            </label>
            <label>
              Opposition
              <select aria-label="Difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
                <option value="club">Club · learn the game</option>
                <option value="county">County · find the gaps</option>
                <option value="elite">Elite · earn every run</option>
              </select>
            </label>
          </div>
          <div className="cr-your-xi" data-testid="your-xi-summary">
            <h4>{team.name} will play this eleven</h4>
            <ol>
              {xi.map((id) => {
                const p = byId.get(id)!;
                return <li key={id}>{p.name}{captain === id ? " (c)" : ""}{keeper === id ? " †" : ""}</li>;
              })}
            </ol>
            <button type="button" className="cr-small" onClick={() => setStep("xi")}>Change the XI</button>
          </div>
          <dl className="cr-rules" aria-label="Playing conditions">
            <div><dt>Overs</dt><dd>{rules.overs} per side, {rules.overs! * 6} legal balls</dd></div>
            <div><dt>Bowlers</dt><dd>At most {rules.bowlerOvers} overs each; no bowler bowls two overs in a row</dd></div>
            <div><dt>Fielding</dt><dd>{rules.powerplays.map((p) => `${p.label}: overs ${p.from}–${p.to}, at most ${p.maxOutside} outside the circle`).join(". ")}. Otherwise at most {rules.maxOutside}.</dd></div>
            <div><dt>Extras</dt><dd>Wides and no-balls add a run and are bowled again; a no-ball brings a free hit</dd></div>
            <div><dt>Your part</dt><dd>Play every ball, or simulate overs when you choose. A win counts towards your record once you have played {rules.minControlledBalls} balls yourself</dd></div>
          </dl>
          {!valid && <p className="cr-validation" role="alert">{problems[0] ?? "These settings can't start a match."}</p>}
          <div className="cr-intl-nav">
            <button type="button" className="cr-button" onClick={() => setStep("xi")}>← Playing XI</button>
            <button type="button" className="cr-button cr-primary" data-testid="start-international" disabled={busy || !valid} onClick={() => onStart(config)}>
              {busy ? "Preparing the match…" : `Start the ${rules.short}`} <span aria-hidden>↗</span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
