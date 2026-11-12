"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CricketMatch,
  configSchema,
  CREASE_Z,
  Delivery,
  oversText,
  RELEASE_TICK,
  SHOTS,
  STEP,
  TEAMS,
  VARIATIONS,
  VENUES,
  type BallLog,
  type BowlingInput,
  type CricketConfig,
  type Frame,
  type Innings,
  type ShotInput,
} from "@platform/engines/sinverse-cricket";
import type { SoloGameProps, SoloSetupProps } from "../solo-types";
import {
  audioReady,
  createLoop,
  playMusic,
  sfx,
  stopMusic,
  unlockAudio,
  type Loop,
  type Song,
} from "@/lib/sound";
import { getSettings, updateSettings, useSettings } from "@/lib/settings";
import { CAMERA_LABELS, QualityGovernor, crowdEnergy, presentationRate, ropeRatio, type CameraName } from "./director";
import type { Lighting, Quality, SceneDriver, SceneFeed } from "./scene";
import { TossSequence, type CoinFace } from "./ceremony";
import { BroadcastGraphics, broadcastCards, newIntroMemo, standouts, type IntroMemo } from "./broadcast";
import { CATEGORIES, choiceFor, deliveryRead, shotChoice, shotsIn, stepChoice, type ShotChoice } from "./shots";
import { DEFAULT_BINDINGS, INPUT_STORAGE, acceptsGameplayKey, finishGesture, gestureBowl, gestureShot, keyboardIntent, keyLabel, parseBindings, rebind, type Bindings, type BindingName, type GestureStart } from "./input";
import "./cricket.css";

const DEFAULT_BOWL: BowlingInput = {
  variation: "seam",
  line: 0,
  length: 4,
  speed: 0.35,
  release: 0,
};
const DEFAULT_SHOT: Omit<ShotInput, "tick"> = {
  kind: "straight",
  direction: 0,
  power: 0.82,
  foot: 0,
  face: 0,
};
const CAMERAS: CameraName[] = [
  "broadcast",
  "batter",
  "bowler",
  "runup",
  "bowling",
  "side",
  "closeup",
  "behind",
  "keeper",
  "slip",
  "fielding",
  "boundary",
  "aerial",
  "stadium",
  "track",
];
const LABELS: Record<string, string> = {
  defend: "Defensive block",
  straight: "Straight drive",
  cover: "Cover drive",
  "on-drive": "On drive",
  cut: "Square cut",
  pull: "Pull",
  sweep: "Sweep",
  loft: "Lofted drive",
  seam: "Seam",
  inswing: "Inswing",
  outswing: "Outswing",
  slower: "Slower ball",
  offbreak: "Off-break",
  legbreak: "Leg-break",
  googly: "Googly",
  topspin: "Top-spinner",
};
const SHOT_AIM: Record<ShotInput["kind"], number> = {
  defend: 0,
  straight: 0,
  cover: 35,
  "on-drive": -35,
  cut: 75,
  pull: -70,
  sweep: -60,
  loft: 15,
};
const SONG: Song = {
  bpm: 86,
  bass: [110, 0, 0, 164.81, 0, 0, 146.83, 0],
  lead: [
    440, 0, 493.88, 0, 587.33, 0, 493.88, 0, 440, 0, 0, 329.63, 0, 392, 0, 0,
  ],
  chords: [
    [110, 164.81, 220],
    [146.83, 220, 293.66],
  ],
  hats: [0, 0, 1, 0, 0, 0, 1, 0],
};
const humanName = (n: number) => TEAMS[n]!.name;
function TeamSymbol({ team }: { team: number }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="cr-emblem">
      <path
        d={
          team === 0
            ? "M24 5 13 39h22L24 5Zm-3 9h6v13h-6Zm-9 24h24M7 16l9 3M41 16l-9 3M24 3v5"
            : "m24 5 17 18-17 17L7 23 24 5Zm0 0v35M7 23h34M24 40l-4 5"
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  display?: string;
}) {
  return (
    <label className="cr-range">
      <span>
        {label}
        <b>{display ?? value}</b>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function CricketSetup({ onStart, busy }: SoloSetupProps) {
  const [team, setTeam] = useState<0 | 1>(0),
    [venue, setVenue] = useState<CricketConfig["venue"]>("lantern"),
    [overs, setOvers] = useState<1 | 2>(1),
    [difficulty, setDifficulty] = useState<CricketConfig["difficulty"]>("club");
  return (
    <div className="cricket cr-setup cr-setup-v2">
      <div className="cr-matchday"><span>SINVERSE / CRICKET</span><b>THE LIGHTS. THE NOISE. YOUR MOMENT.</b><span>DUEL SERIES / 02</span></div>
      <div className="cr-intro">
        <div>
          <p className="cr-eyebrow">WELCOME TO THE MIDDLE</p>
          <h2>
            The lights are on.
            <br />
            <em>Make your mark.</em>
          </h2>
          <p>
            Two innings. Every ball in your hands. Read the flight, find the gap
            and defend your total under the Sinverse lights.
          </p>
          <div className="cr-tags">
            <span>Keyboard + swipe play</span>
            <span>Interactive toss</span>
            <span>Live match replays</span>
          </div>
        </div>
        <img
          src="/sinverse-cricket/cover.svg"
          alt="Original floodlit cricket ground with a rising ball"
          width="320"
          height="200"
        />
      </div>
      <div className="cr-fixture-preview" aria-label="Fixture preview">
        <div><TeamSymbol team={team} /><span><small>YOUR XI</small><strong>{humanName(team)}</strong><small>Captain · {TEAMS[team].players[0]}</small></span></div>
        <b className="cr-versus">VS</b>
        <div><TeamSymbol team={1 - team} /><span><small>THE OPPOSITION</small><strong>{humanName(1 - team)}</strong><small>{difficulty === "club" ? "Club" : difficulty === "county" ? "County" : "Elite"} challenge</small></span></div>
        <p>{VENUES[venue].name}<br /><b>{overs === 1 ? "Six balls" : "Twelve balls"} per innings</b></p>
      </div>
      <div className="cr-fixture">
        <section>
          <h3>Choose your colours</h3>
          <div className="cr-team-picks">
            {TEAMS.map((t, n) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={team === n}
                onClick={() => setTeam(n as 0 | 1)}
                className="cr-team-pick"
                style={{ "--team": t.color } as React.CSSProperties}
              >
                <TeamSymbol team={n} />
                <span>
                  <strong>{t.name}</strong>
                  <small>
                    {n === 0
                      ? "Composure. Craft. Light."
                      : "Energy. Angle. Fire."}
                  </small>
                </span>
                <i>{team === n ? "SELECTED" : "SELECT"}</i>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>Set the stage</h3>
          <div className="cr-settings-grid">
            <label>
              Ground
              <select
                aria-label="Ground"
                value={venue}
                onChange={(e) => setVenue(e.target.value as typeof venue)}
              >
                {Object.entries(VENUES).map(([id, v]) => (
                  <option value={id} key={id}>
                    {v.name} · {v.night ? "Night" : "Day"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Custom format
              <select
                aria-label="Custom format"
                value={overs}
                onChange={(e) => setOvers(Number(e.target.value) as 1 | 2)}
              >
                <option value={1}>One over per innings</option>
                <option value={2}>Two overs per innings</option>
              </select>
            </label>
            <label>
              Opposition
              <select
                aria-label="Opposition"
                value={difficulty}
                onChange={(e) =>
                  setDifficulty(e.target.value as typeof difficulty)
                }
              >
                <option value="club">Club · learn the game</option>
                <option value="county">County · find the gaps</option>
                <option value="elite">Elite · earn every run</option>
              </select>
            </label>
          </div>
          <p className="cr-note">
            A complete custom duel, not an abbreviated Test or an official
            tournament. All players, kits and grounds are fictional.
          </p>
        </section>
      </div>
      <div className="cr-start">
        <div>
          <strong>Every delivery is a decision.</strong>
          <p>
            Space to swing · arrows to aim and move your feet · 1–8 choose a shot.
            On touch, swipe the field as the ball arrives. Tap to defend.
          </p>
        </div>
        <button
          className="cr-button cr-primary"
          data-testid="start-run"
          disabled={busy}
          onClick={() => {
            unlockAudio();
            onStart(configSchema.parse({ team, venue, overs, difficulty }));
          }}
        >
          {busy ? "Preparing fixture…" : "Walk out to the middle"}
          <span aria-hidden>↗</span>
        </button>
      </div>
      <details className="cr-primer">
        <summary>Your first over · controls in 30 seconds</summary>
        <p>Batting: time Space just before the ball reaches your bat. Left/right aim, up/down front/back foot, Shift lofts, Ctrl defends. 1–8: block, straight, cover, on drive, cut, pull, sweep, loft. Q/E adjust power. R calls a run.</p>
        <p>Bowling: arrows set line and length, Q/E set pace, V cycles variation. Space starts the run-up; press again as the marker reaches centre. Touch: swipe to set line/length, then tap at centre to release. Swipe on a live ball to bat. Pause → Controls to remap keys or turn on assist controls.</p>
      </details>
    </div>
  );
}

function CricketViewport({
  config,
  quality,
  lighting,
  onQuality,
  driver,
}: {
  config: CricketConfig;
  quality: Quality | "tactical";
  lighting: Lighting | "ground";
  onQuality: (v: Quality | "tactical") => void;
  driver: React.RefObject<SceneDriver | null>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Preparing ground…");
  useEffect(() => {
    let cancelled = false,
      instance: SceneDriver | null = null;
    const element = canvas.current!;
    setStatus("Preparing ground…");
    const start = async () => {
      try {
        if (
          quality !== "tactical" &&
          !element.getContext("webgl2", {
            antialias: quality !== "low",
            powerPreference:
              quality === "low" ? "low-power" : "high-performance",
          })
        ) {
          if (!cancelled) {
            setStatus("WebGL2 unavailable · tactical view");
            onQuality("tactical");
          }
          return;
        }
        if (quality === "tactical") {
          const module = await import("./tactical");
          if (cancelled) return;
          instance = module.createTacticalScene(element);
          setStatus("Tactical view · same live simulation");
        } else {
          const module = await import("./scene");
          if (cancelled) return;
          instance = module.createCricketScene(
            element,
            config,
            quality,
            () => {
              if (!cancelled) onQuality("tactical");
            },
            lighting,
          );
          setStatus("3D ground ready");
        }
        driver.current = instance;
      } catch {
        if (!cancelled) {
          if (quality !== "tactical") onQuality("tactical");
          else
            setStatus(
              "Rendering unavailable. Pause and return to the fixture.",
            );
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      if (driver.current === instance) driver.current = null;
      instance?.dispose();
    };
  }, [config, quality, lighting, onQuality, driver]);
  return (
    <>
      <canvas
        key={`${quality}-${lighting}`}
        ref={canvas}
        className="cr-canvas"
        aria-label={
          quality === "tactical"
            ? "Live tactical cricket field"
            : "Live three-dimensional cricket ground"
        }
        data-testid="cricket-canvas"
      />
      <span className="cr-render-status" role="status">
        {status}
      </span>
    </>
  );
}
/**
 * When the ball reached the bat's line and how far across from the bat it was,
 * from the recorded frames (presentation only). Unknown until it has happened;
 * a finished delivery's answer is kept.
 */
const arrivals = new WeakMap<Delivery, { arrivalTick?: number; passLateral?: number }>();
function arrival(d: Delivery): { arrivalTick?: number; passLateral?: number } {
  const known = arrivals.get(d);
  if (known) return known;
  const line = 8.8 - (d.shot?.foot ?? 0) * 0.45,
    f = d.frames.find((f) => f.tick >= RELEASE_TICK && f.ball.z >= line),
    batX = d.shot ? Math.sin((d.shot.direction * Math.PI) / 180) * 0.45 + d.shot.face * 0.55 : 0;
  const result = f ? { arrivalTick: f.tick, passLateral: Math.abs(f.ball.x - batX) } : {};
  if (d.outcome) arrivals.set(d, result);
  return result;
}
/** How far a six carried from the bat before it cleared the rope, from the recorded frames (metres). */
const carries = new WeakMap<Delivery, number | null>();
function carryOf(d: Delivery | null | undefined, venue: CricketConfig["venue"]): number | null {
  if (!d?.outcome || d.outcome.boundary !== 6 || !d.hit) return null;
  if (carries.has(d)) return carries.get(d)!;
  const over = d.frames.find((f) => f.tick > d.contactTick && ropeRatio(f.ball, venue) >= 1),
    from = d.contactPoint;
  const carry = over && from ? Math.hypot(over.ball.x - from.x, over.ball.z - from.z) : null;
  carries.set(d, carry);
  return carry;
}
/**
 * The batting shot selector: shot families, then the shots in the chosen one.
 * It sits below the field so it never covers the ball or the batter. The shot
 * is only played when the player presses to play it.
 */
function ShotBar({ current, direction, locked, onChoose }: { current: ShotChoice; direction: number; locked: boolean; onChoose: (c: ShotChoice) => void }) {
  const family = current.category;
  return (
    <section className="cr-shotbar" aria-label="Shot selection" data-testid="cricket-shotbar" data-shot={current.id}>
      <div className="cr-shot-families" role="tablist" aria-label="Shot family">
        {CATEGORIES.map((c, n) => (
          <button key={c.id} role="tab" aria-selected={family === c.id} disabled={locked} onClick={() => onChoose(shotsIn(c.id)[0]!)}>
            <kbd aria-hidden>{n + 1}</kbd>
            {c.label}
          </button>
        ))}
      </div>
      <div className="cr-shot-choices" role="radiogroup" aria-label={`${CATEGORIES.find((c) => c.id === family)!.label} shots`}>
        {shotsIn(family).map((s) => (
          <button key={s.id} role="radio" aria-checked={s.id === current.id} disabled={locked} data-shot={s.id} onClick={() => onChoose(s)} title={s.hint}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="cr-shot-read" aria-live="polite">
        <b>{current.label}</b>
        <span>{current.input ? `${current.footwork === "front" ? "Front foot" : current.footwork === "back" ? "Back foot" : "Stays put"} · ${current.lofted ? "In the air" : "Along the ground"} · aim ${Math.round(direction)}°` : "No shot: let it go"}</span>
        <small>{current.hint}</small>
      </p>
    </section>
  );
}
/** Pace off the hand (from the recorded frames just after release) and the delivery's name, once it's been bowled. */
const releaseSpeeds = new WeakMap<Delivery, number>();
function SpeedRead({ d }: { d: Delivery }) {
  let speed = releaseSpeeds.get(d);
  if (speed === undefined) {
    const a = d.frames.find((f) => f.tick >= RELEASE_TICK + 1),
      b = d.frames.find((f) => f.tick >= RELEASE_TICK + 4);
    speed = a && b && b.tick > a.tick ? Math.hypot(b.ball.x - a.ball.x, b.ball.y - a.ball.y, b.ball.z - a.ball.z) / ((b.tick - a.tick) * STEP) : 0;
    releaseSpeeds.set(d, speed);
  }
  if (!speed) return null;
  const read = deliveryRead(speed, d.bowling.variation);
  return (
    <b className="cr-speed" data-testid="cricket-speed">
      {read.kmh} km/h · {read.name}
    </b>
  );
}
/** The best batting and bowling of an innings, from its scorecard. */
function Standouts({ innings, team }: { innings: Innings; team?: string }) {
  const { bat, bowl } = standouts(innings);
  return (
    <dl className="cr-standouts">
      {team && <dt>{team}</dt>}
      {bat && (
        <dd>
          <b>{bat.name}</b> {bat.runs} ({bat.balls})
        </dd>
      )}
      {bowl && (
        <dd>
          <b>{bowl.name}</b> {bowl.wickets}/{bowl.runs}
        </dd>
      )}
    </dl>
  );
}
function frameOf(d: Delivery): Frame {
  return {
    tick: d.tick,
    ball: d.pos,
    fielders: d.fielders.map((f) => f.pos),
    travel: d.fielders.map((f) => f.travel),
    bowlerFootZ: d.frontFootZ,
    batterGroundZ: d.batterGroundZ,
    actions: d.fielders.map((f) => f.action),
    runner: d.runner,
    contact: d.hit,
    bounce: d.groundAfterHit,
    mode: d.mode,
  };
}
type Replay = {
  delivery: Delivery;
  team: number;
  humanBatting: boolean;
  numbers: number[];
  label: string;
};
type Runtime = {
  match: CricketMatch;
  delivery: Delivery | null;
  initial: Delivery;
  plan: BowlingInput | null;
  field: BallLog["field"];
  settled: boolean;
  elapsed: number;
  acc: number;
  paused: boolean;
  arming: boolean;
  armedAt: number;
  replays: Replay[];
  replay: {
    index: number;
    tick: number;
    playing: boolean;
    speed: number;
    camera: CameraName;
    automatic?: boolean;
  } | null;
  music: boolean;
  crowd: Loop | null;
  contactHeard: boolean;
  lastStep: number;
  error: string;
  /** A boundary or wicket replay waits for the live reaction to play out first. */
  replayAt: number;
  endedAt: number;
  pickupHeard: boolean;
  ceremony: TossSequence;
  nextAt: number;
  replayFinishedAt: number;
  releaseHeard: boolean;
  /** Which batter and bowler have had their introduction card, and when. */
  intro: IntroMemo;
  /** Presentation seconds: wall time, slowed through a big catch. */
  presentTime: number;
};
function actorNumbers(m: CricketMatch) {
  const i = m.current;
  if (!i) return undefined;
  const bowler =
    6 + Math.min(1, Math.floor(Math.min(i.balls, m.config.overs * 6 - 1) / 6));
  const field = Array.from({ length: 10 }, (_, n) => n).filter(
    (n) => n !== bowler,
  );
  return [
    i.striker + 1,
    i.nonStriker + 1,
    ...field.map((n) => n + 1),
    bowler + 1,
    11,
  ];
}

export function CricketGame({
  seed,
  config: raw,
  onFinish,
  onQuit,
}: SoloGameProps<CricketConfig>) {
  const [config] = useState(() => configSchema.parse(raw));
  const [r] = useState<Runtime>(() => ({
    match: new CricketMatch(seed, config),
    delivery: null,
    initial: new Delivery(seed, DEFAULT_BOWL, "balanced", config),
    plan: null,
    field: "balanced",
    settled: false,
    elapsed: 0,
    acc: 0,
    paused: false,
    arming: false,
    armedAt: 0,
    replays: [],
    replay: null,
    music: false,
    crowd: null,
    contactHeard: false,
    lastStep: 0,
    error: "",
    replayAt: 0,
    endedAt: 0,
    intro: newIntroMemo(),
    presentTime: 0,
    pickupHeard: false,
    ceremony: new TossSequence(),
    nextAt: 0,
    replayFinishedAt: 0,
    releaseHeard: false,
  }));
  const [, setRevision] = useState(0),
    refresh = useCallback(() => setRevision((v) => v + 1), []),
    [quality, setQuality] = useState<Quality | "tactical">("medium"),
    [autoQuality, setAutoQuality] = useState(true),
    [lighting, setLighting] = useState<Lighting | "ground">("ground"),
    [camera, setCamera] = useState<CameraName>("broadcast"),
    [simple, setSimple] = useState(true),
    [advanced, setAdvanced] = useState(false),
    [panel, setPanel] = useState<
      "pause" | "rules" | "audio" | "scorecard" | null
    >(null),
    [shot, setShot] = useState(DEFAULT_SHOT),
    [bowl, setBowl] = useState(DEFAULT_BOWL),
    [field, setField] = useState<BallLog["field"]>("balanced"),
    [crowdVolume, setCrowdVolume] = useState(0.42),
    [cinema, setCinema] = useState(true),
    [feedback, setFeedback] = useState("Read the ball. Find your gap."),
    [fps, setFps] = useState(0);
  const [bindings, setBindings] = useState<Bindings>({ ...DEFAULT_BINDINGS });
  const [bindingTarget, setBindingTarget] = useState<BindingName | null>(null);
  const [bindingMessage, setBindingMessage] = useState("");
  const [continuous, setContinuous] = useState(true);
  // The player's chosen shot. "Leave" means a press during the ball does not swing.
  const [leaving, setLeaving] = useState(false);
  // The winning moment plays first (reactions, the result camera); the summary card follows.
  const [finishShown, setFinishShown] = useState(false);
  const [assist, setAssist] = useState(false);
  const [sensitivity, setSensitivity] = useState(1);
  const gesture = useRef<GestureStart | null>(null);
  const root = useRef<HTMLDivElement>(null),
    driver = useRef<SceneDriver | null>(null),
    pauseButton = useRef<HTMLButtonElement>(null),
    settings = useSettings(),
    preferences = useRef({
      quality,
      camera,
      simple,
      crowdVolume,
      cinema,
      reduced: false,
      autoQuality: false,
      continuous: true,
      intent: DEFAULT_SHOT,
      bowl: DEFAULT_BOWL,
    });
  const reduced =
    settings.reducedMotion ||
    (typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  preferences.current = {
    quality,
    camera,
    simple,
    crowdVolume,
    cinema,
    reduced,
    autoQuality,
    continuous,
    intent: shot,
    bowl,
  };
  const actions = useRef({
    primary: () => {},
    run: () => {},
    pause: () => {},
    replay: () => {},
    camera: () => {},
    key: (_event: KeyboardEvent): boolean => false,
    pad: (_x: number, _y: number) => {},
    chooseToss: (_face: CoinFace) => {},
    decide: (_value: "bat" | "bowl") => {},
  });
  const m = r.match,
    i = m.current,
    live = !!r.delivery && !r.settled,
    batting = i ? m.humanBatting : true;
  const finished = m.phase === "finished";
  useEffect(() => {
    if (!finished) return setFinishShown(false);
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setFinishShown(true), reduced ? 0 : 3200);
    return () => window.clearTimeout(timer);
  }, [finished]);
  const setMenu = useCallback(
    (next: typeof panel) => {
      r.paused = !!next;
      r.arming = false;
      gesture.current = null;
      setPanel(next);
      unlockAudio();
      if (!next) requestAnimationFrame(() => root.current?.focus());
      refresh();
    },
    [r, refresh],
  );
  const chooseToss = (face: CoinFace) => {
    if (!r.paused && r.ceremony.choose(face)) { unlockAudio(); refresh(); }
  };
  const commitDecision = (value: "bat" | "bowl") => {
    if (r.paused || !r.ceremony.enter() || !r.ceremony.call) return;
    m.toss({ k: "toss", call: r.ceremony.call, decision: value, t: Math.floor(r.elapsed) });
    setFeedback(`${m.tossFace.toUpperCase()}. ${humanName(m.tossWinner)} win the toss. ${humanName(m.firstBat)} bat first.`);
    r.nextAt = r.elapsed + 5200;
    requestAnimationFrame(() => root.current?.focus());
    refresh();
  };
  const chooseShot = (choice: ShotChoice) => {
    setLeaving(!choice.input);
    if (choice.input) setShot((s) => ({ ...s, ...choice.input! }));
  };
  const primary = (shotOverride?: typeof shot, bowlOverride?: BowlingInput) => {
    unlockAudio();
    if (r.paused || r.error) return;
    if (r.replay) {
      // The primary action always moves the match on, so a replay can be skipped at once.
      r.replay = null;
      r.nextAt = r.elapsed + 1800;
      refresh();
      return;
    }
    if (m.phase === "toss") {
      if (r.ceremony.stage === "flight" && !r.ceremony.call) setFeedback("Choose Heads or Tails with H / T, or tap a side.");
      else if (r.ceremony.stage === "decision") commitDecision("bat");
      else r.ceremony.skip();
      refresh();
      return;
    }
    if (r.ceremony.stage !== "done") { r.ceremony.skip(); refresh(); return; }
    if (m.phase === "interval") {
      m.nextInnings();
      r.delivery = null;
      r.settled = false;
      r.arming = false;
      r.nextAt = r.elapsed + 2500;
      setFeedback(
        `${humanName(m.current.team)} need ${m.target} to win. A new innings, a new plan.`,
      );
      refresh();
      return;
    }
    if (m.phase !== "ready") return;
    r.replayAt = 0;
    if (r.delivery && !r.settled) {
      // Leave selected: the ball goes by unless the player deliberately gestures a shot.
      if (m.humanBatting && !(leaving && !shotOverride) && r.delivery.swingBat(shotOverride ?? shot)) {
        sfx.whoosh();
        refresh();
      }
      return;
    }
    let plan: BowlingInput | null = null;
    if (!m.humanBatting) {
      if (!r.arming) {
        r.arming = true;
        r.armedAt = r.elapsed;
        r.lastStep = 0;
        refresh();
        return;
      }
      if (r.elapsed - r.armedAt < 300) return;
      plan = {
        ...(bowlOverride ?? bowl),
        release: Math.max(-1, Math.min(1, (r.elapsed - r.armedAt - 2500) / 700)),
      };
      r.arming = false;
    }
    const nextField = m.humanBatting ? m.fieldForAI() : field;
    try {
      r.delivery = m.createDelivery({
        bowling: plan,
        shot: null,
        runAt: [],
        field: nextField,
      });
      if (plan) {
        const approachTick = Math.min(RELEASE_TICK - 1, Math.floor((r.elapsed - r.armedAt) * 0.0336));
        while (r.delivery.tick < approachTick) r.delivery.step();
      }
      r.plan = plan;
      r.field = nextField;
      r.settled = false;
      r.contactHeard = false;
      r.pickupHeard = false;
      r.releaseHeard = false;
      r.nextAt = 0;
      r.lastStep = 0;
      r.acc = 0;
      setFeedback(
        m.humanBatting
          ? "Watch the release. Set your feet."
          : "Release committed. Back your field.",
      );
      refresh();
    } catch {
      r.error =
        "This delivery couldn't start. Return to the fixture to try again.";
      refresh();
    }
  };
  const run = () => {
    if (!r.paused && !r.replay && r.delivery?.requestRun()) {
      sfx.tick();
      setFeedback("Run called. Make your ground before the throw.");
      refresh();
    }
  };
  const replay = () => {
    if (r.paused || live || !r.replays.length) return;
    r.replay = {
      index: r.replays.length - 1,
      tick: 0,
      playing: true,
      speed: 0.5,
      camera: "director",
    };
    r.replayAt = 0;
    r.replayFinishedAt = 0;
    refresh();
  };
  actions.current = {
    primary,
    run,
    pause: () => setMenu(panel ? null : "pause"),
    replay,
    chooseToss,
    decide: commitDecision,
    camera: () =>
      setCamera((c) => CAMERAS[(CAMERAS.indexOf(c) + 1) % CAMERAS.length]!),
    key: (event) => {
      if (bindingTarget) {
        if (event.code === "Escape") { setBindingTarget(null); setBindingMessage("Remapping cancelled."); return true; }
        const next = rebind(bindings, bindingTarget, event.code);
        if (next) {
          setBindings(next); setBindingTarget(null); setBindingMessage("Binding saved.");
          try { localStorage.setItem(INPUT_STORAGE, JSON.stringify(next)); } catch {}
        } else setBindingMessage("That key is reserved or already assigned. Choose another key.");
        return true;
      }
      if (r.paused) return false;
      if (m.phase === "toss") {
        if (event.code === "KeyH" || event.code === "KeyT") {
          const value = event.code === "KeyH" ? "heads" : "tails";
          chooseToss(value); return true;
        }
        if (r.ceremony.stage === "decision" && ["KeyB", "KeyO"].includes(event.code)) {
          commitDecision(event.code === "KeyB" ? "bat" : "bowl"); return true;
        }
      }
      if (event.code === bindings.action) { primary(); return true; }
      if (event.code === bindings.run) { run(); return true; }
      if (event.code === bindings.replay) { replay(); return true; }
      if (event.code === bindings.camera) { actions.current.camera(); return true; }
      if (r.replay || (r.delivery?.shot && live) || (!batting && live)) return false;
      // Batting: 1-7 choose a shot family; the same key again steps through it.
      if (batting && /^Digit[1-7]$/.test(event.code)) {
        chooseShot(stepChoice(leaving ? shotChoice("leave")! : choiceFor(shot), CATEGORIES[Number(event.code.slice(-1)) - 1]!.id));
        return true;
      }
      const intent = keyboardIntent(event.code, bindings, shot, bowl, batting);
      if (intent?.bat) setShot(intent.bat);
      if (intent?.bowl && !r.arming) setBowl(intent.bowl);
      return !!intent;
    },
    pad: (x, y) => {
      if (r.paused || r.replay || live && (!batting || r.delivery?.shot)) return;
      if (batting) setShot(s => ({ ...s, direction: Math.round(x * 110), foot: y < -0.4 ? 0.65 : y > 0.4 ? -0.3 : 0 }));
      else if (!r.arming) setBowl(b => ({ ...b, line: x * 1.5, length: 4.5 + y * 4 }));
    },
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow,
      previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    root.current?.focus();
    try { setBindings(parseBindings(JSON.parse(localStorage.getItem(INPUT_STORAGE) ?? "null"))); } catch {}
    if (window.innerWidth < 640 || window.matchMedia("(pointer: coarse)").matches) setQuality("low");
    r.crowd = createLoop("crowd");
    let request = 0,
      last = performance.now(),
      uiAt = last,
      drawAt = 0,
      drawMs = 0,
      drawCount = 0,
      fpsAt = last,
      frames = 0;
    let previousPad: boolean[] = [];
    const governor = new QualityGovernor();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      // The scene's own clock slows with a big catch, so the landing plays in slow motion as well.
      // Like the match clock, it stands still while the game is paused.
      if (!r.paused) r.presentTime += dt * (driver.current?.cinematic() ?? 1);
      // Only sustained slow frames change quality, and never during a menu or a hidden tab.
      if (preferences.current.autoQuality && !r.paused && !document.hidden && preferences.current.quality !== "tactical") {
        const next = governor.sample(now - last, now, preferences.current.quality as Quality);
        if (next) setQuality(next);
      }
      last = now;
      if (!r.paused) {
        r.elapsed += dt * 1000;
        const stage = r.ceremony.stage;
        if (driver.current) r.ceremony.advance(dt, false, preferences.current.reduced);
        if (stage !== r.ceremony.stage) {
          if (r.ceremony.stage === "flight") sfx.cricketToss();
          if (r.ceremony.stage === "reveal") sfx.cricketCoinLand();
          if (r.ceremony.stage === "decision") sfx.cricketAnnouncement();
          refresh();
        }
        if (r.arming && r.elapsed - r.armedAt >= 3200) actions.current.primary();
        if (r.arming) {
          const stride = Math.floor((r.elapsed - r.armedAt) / 210);
          if (stride > r.lastStep) { sfx.cricketStep(); r.lastStep = stride; }
        }
        if (r.replay) {
          const replay = r.replay,
            entry = r.replays[replay.index];
          if (entry && replay.playing) {
            replay.tick += dt * 120 * replay.speed * (driver.current?.cinematic() ?? 1);
            const end = entry.delivery.frames.at(-1)!.tick;
            if (replay.tick >= end) {
              replay.tick = end;
              replay.playing = false;
              if (!r.replayFinishedAt) r.replayFinishedAt = r.elapsed;
            }
          }
          if (preferences.current.continuous && r.replay.automatic && r.replayFinishedAt && r.elapsed - r.replayFinishedAt > 1400) {
            r.replay = null; r.replayFinishedAt = 0; r.nextAt = r.elapsed + 2000;
          }
        } else if (r.delivery && !r.settled) {
          const d = r.delivery;
          // Slow motion stretches wall-clock time only; the same ticks run either way.
          const rate = presentationRate({ hit: d.hit, groundAfterHit: d.groundAfterHit, y: d.pos.y, vy: d.velocity.y, x: d.pos.x, z: d.pos.z, venue: config.venue, finished: !!d.outcome, reduced: preferences.current.reduced });
          // A big catch slows the presentation too (wall-clock only: the same ticks run).
          r.acc += dt * (d.tick < RELEASE_TICK ? 0.28 : preferences.current.simple ? 0.65 : 1) * rate * (driver.current?.cinematic() ?? 1);
          let steps = 0;
          while (r.acc >= STEP && !d.outcome && steps < 14) {
            d.step();
            r.acc -= STEP;
            steps++;
          }
          if (d.tick >= RELEASE_TICK && !r.releaseHeard) { sfx.cricketRelease(); r.releaseHeard = true; }
          if (d.hit && !r.contactHeard) {
            r.contactHeard = true;
            if (d.edge) sfx.cricketEdge();
            else if (d.shot?.kind === "defend") sfx.cricketBlock();
            else sfx.cricketBat(d.contactQuality);
            setFeedback(
              `${d.edge ? "Edge" : d.contactQuality > 0.82 ? "Pure contact" : d.timing < -3 ? "Early" : d.timing > 3 ? "Late" : "Good timing"} · ${d.shot ? LABELS[d.shot.kind] : "shot"}`,
            );
          }
          if (!r.pickupHeard && d.fielders.some((f) => f.action === "pickup")) {
            r.pickupHeard = true;
            sfx.cricketPickup();
          }
          if (d.tick < RELEASE_TICK && d.tick - r.lastStep > 18) {
            sfx.cricketStep();
            r.lastStep = d.tick;
          }
          if (d.outcome) {
            const oldTeam = m.current.team,
              wasBatting = m.humanBatting,
              numbers = actorNumbers(m)!;
            const log: BallLog = {
              k: "ball",
              seq: m.seq,
              bowling: r.plan,
              shot: wasBatting ? d.shot : null,
              runAt: wasBatting ? [...d.runAt] : [],
              field: r.field,
              digest: d.digest,
              t: Math.floor(r.elapsed),
            };
            if (!m.record(log, d))
              r.error =
                "The delivery didn't pass the local integrity check. It has not been saved.";
            else {
              r.replays.push({
                delivery: d,
                team: oldTeam,
                humanBatting: wasBatting,
                numbers,
                label: `${m.innings.length}.${m.history.at(-1)!.ball} · ${d.outcome.label}`,
              });
              if (r.replays.length > 6) r.replays.shift();
              setFeedback(
                d.outcome.wicket
                  ? `${d.outcome.wicket.toUpperCase()}. ${m.result || "The wicket falls."}`
                  : d.outcome.boundary === 6
                    ? "SIX. Clean over the rope."
                    : d.outcome.boundary === 4
                      ? "FOUR. Through the field and to the rope."
                      : `${d.outcome.label} · ${m.current.runs}/${m.current.wickets} after ${oversText(m.current.balls)}`,
              );
              const w = d.outcome.wicket;
              if (w === "bowled" || w === "stumped" || w === "run-out") {
                sfx.cricketStumps();
                sfx.crowdSwell(0.8);
              } else if (w) {
                sfx.cricketAppeal();
                sfx.crowdSwell(0.7);
              } else if (d.outcome.boundary === 6) {
                sfx.crowdSwell(1);
                sfx.correct();
              } else if (d.outcome.boundary === 4) {
                sfx.cricketBoard();
                sfx.crowdSwell(0.6);
              } else if (d.fielders[10]!.action === "catch" && !d.hit) sfx.cricketGlove();
              else if (d.edge) sfx.crowdGroan();
              if (
                preferences.current.cinema &&
                !preferences.current.reduced &&
                (d.outcome.boundary || d.outcome.wicket)
              )
                r.replayAt = r.elapsed + (d.outcome.wicket ? 4200 : d.outcome.boundary === 6 ? 2300 : 1700);
            }
            r.settled = true;
            r.endedAt = r.elapsed;
            r.nextAt = r.elapsed + (d.outcome.wicket ? 6000 : d.outcome.boundary ? 5000 : 3300);
            refresh();
          }
        } else if (r.replayAt && r.elapsed >= r.replayAt) {
          // The reaction has played out; show the real delivery again from before contact.
          r.replayAt = 0;
          const entry = r.replays.at(-1);
          if (entry)
            r.replay = {
              index: r.replays.length - 1,
              tick: Math.max(0, (entry.delivery.contactTick > 0 ? entry.delivery.contactTick : entry.delivery.tick) - 90),
              playing: true,
              speed: 0.5,
              camera: "director",
              automatic: true,
            };
          refresh();
        }
        if (preferences.current.continuous && r.ceremony.stage === "done" && !r.replay && !r.replayAt && r.nextAt && r.elapsed >= r.nextAt && (m.phase === "interval" || (m.phase === "ready" && m.humanBatting && (!r.delivery || r.settled)))) {
          r.nextAt = 0;
          actions.current.primary();
        }
      }
      const settings = getSettings();
      if (!r.paused && settings.sound) {
        const live = r.delivery;
        r.crowd?.set(
          preferences.current.crowdVolume *
            Math.max(
              0.28,
              crowdEnergy({
                outcome: live?.outcome ?? null,
                deadAge: live?.outcome ? Math.max(0, (r.elapsed - r.endedAt) / 1000) : -1,
                ballRatio: live?.hit ? ropeRatio(live.pos, config.venue) : 0,
                inAir: !!live?.hit && !live.groundAfterHit,
                reduced: preferences.current.reduced,
              }),
            ),
        );
        if (settings.music && !r.music && audioReady()) {
          playMusic(SONG);
          r.music = true;
        }
      } else r.crowd?.set(0);
      if ((r.paused || !settings.music || !settings.sound) && r.music) {
        stopMusic();
        r.music = false;
      }
      let visual = frameOf(r.delivery ?? r.initial),
        visualShot = r.delivery?.shot ?? null,
        visualOutcome = r.delivery?.outcome ?? null,
        team = m.current?.team ?? config.team,
        human = m.current ? m.humanBatting : true,
        numbers = actorNumbers(m);
      let source: Delivery = r.delivery ?? r.initial;
      if (r.arming) visual = { ...frameOf(r.initial), tick: Math.min(99, (r.elapsed - r.armedAt) * 0.0336) };
      if (r.settled && !r.replay && r.replays.length) numbers = r.replays.at(-1)!.numbers;
      if (r.replay) {
        const entry = r.replays[r.replay.index];
        if (entry) {
          const frames = entry.delivery.frames;
          const at = frames.findIndex((f) => f.tick >= r.replay!.tick);
          // On a recorded tick (and at the end) show that frame itself, so the
          // replay reaches the dead ball and its reactions, not the frame before.
          const exact = at < 0 || frames[at]!.tick === r.replay.tick;
          const b = frames[at < 0 ? frames.length - 1 : at]!,
            a = exact ? b : frames[Math.max(0, at - 1)]!;
          const u =
            a.tick === b.tick
              ? 0
              : Math.max(
                  0,
                  Math.min(1, (r.replay.tick - a.tick) / (b.tick - a.tick)),
                );
          visual = {
            ...a,
            tick: r.replay.tick,
            ball: {
              x: a.ball.x + (b.ball.x - a.ball.x) * u,
              y: a.ball.y + (b.ball.y - a.ball.y) * u,
              z: a.ball.z + (b.ball.z - a.ball.z) * u,
            },
            fielders: a.fielders.map((p, n) => ({
              x: p.x + (b.fielders[n]!.x - p.x) * u,
              y: p.y + (b.fielders[n]!.y - p.y) * u,
              z: p.z + (b.fielders[n]!.z - p.z) * u,
            })),
            travel: a.travel.map(
              (value, n) => value + (b.travel[n]! - value) * u,
            ),
            runner: a.runner + (b.runner - a.runner) * u,
          };
          source = entry.delivery;
          visualShot = entry.delivery.shot;
          visualOutcome = entry.delivery.outcome;
          team = entry.team;
          human = entry.humanBatting;
          numbers = entry.numbers;
        }
      }
      const score = m.current
        ? `${TEAMS[m.current.team]!.short} ${m.current.runs}/${m.current.wickets} | ${oversText(m.current.balls)} / ${config.overs} OVERS ${m.target ? ` | TARGET ${m.target}` : ""}`
        : "THE FINAL OVER | SINVERSE CRICKET";
      if (
        now - drawAt >=
        (r.paused ? 200 : preferences.current.quality === "low" ? 30 : 15)
      ) {
        if (driver.current) {
          const drawStart = performance.now();
          driver.current.draw({
            frame: visual,
            shot: visualShot,
            outcome: visualOutcome,
            battingTeam: team,
            humanBatting: human,
            camera: r.replay ? r.replay.camera : preferences.current.reduced && preferences.current.camera === "broadcast" ? human ? "batter" : "bowler" : preferences.current.camera,
            reducedMotion: preferences.current.reduced,
            score,
            time: r.presentTime,
            actorNumbers: numbers,
            contactTick: source.hit ? source.contactTick : -1,
            contactPoint: source.hit ? source.contactPoint : null,
            edge: source.edge,
            ...arrival(source),
            variation: r.arming ? preferences.current.bowl.variation : source.bowling.variation,
            ceremony: r.ceremony.feed(m.tossFace, config.team, preferences.current.reduced),
            intent: preferences.current.intent,
            aim: !m.current || m.humanBatting ? undefined : preferences.current.bowl,
            replay: !!r.replay,
            interlude: r.replay ? null : m.phase === "finished" ? "result" : m.phase === "interval" ? "innings" : r.settled && m.phase === "ready" && !!m.current && m.current.balls > 0 && m.current.balls % 6 === 0 && !!r.delivery?.outcome?.legal ? "over" : null,
            result:
              m.phase === "finished" && !r.replay && m.current
                ? m.target && m.current.runs >= m.target
                  ? "batting-won"
                  : m.target
                    ? "fielding-won"
                    : null
                : null,
          });
          // CPU cost of one draw (animation, scene sync and command submission), for benchmarks.
          drawMs = performance.now() - drawStart;
          frames++;
          drawCount++;
        }
        drawAt = now;
      }
      const element = root.current;
      if (element) {
        element.dataset.ballTick = String(r.delivery?.tick ?? 0);
        element.dataset.draws = String(drawCount);
        element.dataset.drawMs = drawMs.toFixed(2);
        element.dataset.ballX = String(r.delivery?.pos.x ?? 0);
        element.dataset.ballY = String(r.delivery?.pos.y ?? 0);
        element.dataset.ballZ = String(r.delivery?.pos.z ?? 0);
        element.dataset.live = String(!!r.delivery && !r.settled);
        element.dataset.batting = String(m.current ? m.humanBatting : true);
        element.dataset.seq = String(m.seq);
        element.dataset.phase = m.phase;
        element.dataset.release = String(r.plan?.release ?? 0);
        element.dataset.ceremony = r.ceremony.stage;
        element.dataset.call = r.ceremony.call ?? "";
        element.dataset.intent = preferences.current.intent.kind;
        element.dataset.direction = String(preferences.current.intent.direction);
        element.dataset.foot = String(preferences.current.intent.foot);
      }
      if (now - uiAt > 100) {
        uiAt = now;
        refresh();
      }
      if (now - fpsAt > 1500) {
        setFps(Math.round((frames * 1000) / (now - fpsAt)));
        frames = 0;
        fpsAt = now;
        const metrics = driver.current?.metrics();
        if (element && metrics) {
          element.dataset.drawCalls = String(metrics.calls);
          element.dataset.triangles = String(metrics.triangles);
          element.dataset.textures = String(metrics.textures);
          element.dataset.geometries = String(metrics.geometries);
          element.dataset.dpr = String(metrics.dpr);
          element.dataset.shot = metrics.shot ?? "";
          element.dataset.contactError = metrics.contactError?.toFixed(3) ?? "";
          element.dataset.releaseError = metrics.releaseError?.toFixed(3) ?? "";
          element.dataset.gripError = metrics.gripError?.toFixed(3) ?? "";
          element.dataset.footSlip = metrics.footSlip?.toFixed(3) ?? "";
          element.dataset.takeError = metrics.takeError?.toFixed(3) ?? "";
          element.dataset.athletes = String(!!metrics.athletes);
          element.dataset.looks = metrics.looks ?? "";
          element.dataset.takeMove = metrics.takeMove ?? "";
          element.dataset.fielding = metrics.fielding ?? "";
          element.dataset.spacing = metrics.spacing !== undefined && Number.isFinite(metrics.spacing) ? metrics.spacing.toFixed(3) : "";
        }
      }
      try {
        const pad = navigator.getGamepads?.()[0];
        if (pad) {
          const pressed = pad.buttons.map((b) => b.pressed);
          if (pressed[0] && !previousPad[0]) {
            if (m.phase === "toss" && r.ceremony.stage === "decision") actions.current.decide("bat");
            else actions.current.primary();
          }
          if (pressed[1] && !previousPad[1]) {
            if (m.phase === "toss" && r.ceremony.stage === "decision") actions.current.decide("bowl");
            else actions.current.run();
          }
          if (pressed[14] && !previousPad[14]) actions.current.chooseToss("heads");
          if (pressed[15] && !previousPad[15]) actions.current.chooseToss("tails");
          if (pressed[2] && !previousPad[2]) actions.current.replay();
          if (pressed[9] && !previousPad[9]) actions.current.pause();
          const x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0;
          if (Math.hypot(x, y) > 0.2 && now - uiAt > 70) actions.current.pad(x, y);
          previousPad = pressed;
        } else previousPad = [];
      } catch {}
      request = requestAnimationFrame(frame);
    };
    request = requestAnimationFrame(frame);
    const keys = (event: KeyboardEvent) => {
      if (event.code === "Tab") {
        const scope =
          root.current?.querySelector<HTMLElement>("[data-cricket-panel]") ??
          root.current;
        const focusables = Array.from(
          scope?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex='0']",
          ) ?? [],
        ).filter((e) => e.getClientRects().length);
        const index = focusables.indexOf(document.activeElement as HTMLElement);
        if (
          index < 0 ||
          (event.shiftKey && index === 0) ||
          (!event.shiftKey && index === focusables.length - 1)
        ) {
          event.preventDefault();
          focusables[event.shiftKey ? focusables.length - 1 : 0]?.focus();
        }
        return;
      }
      if (event.code === "Escape") {
        event.preventDefault();
        if (actions.current.key(event)) return;
        actions.current.pause();
        return;
      }
      const interactive = event.target instanceof HTMLElement && (!!event.target.closest("input,select,textarea,a,[contenteditable='true']") || event.code === "Space" && !!event.target.closest("button"));
      if (!acceptsGameplayKey(event, interactive)) return;
      if (event.repeat && !event.code.startsWith("Arrow")) return;
      if (actions.current.key(event)) event.preventDefault();
    };
    const visibility = () => {
      if (document.hidden) {
        r.paused = true;
        r.arming = false;
        gesture.current = null;
        setPanel("pause");
        refresh();
      }
    };
    window.addEventListener("keydown", keys);
    const blur = () => { r.paused = true; r.arming = false; gesture.current = null; setPanel("pause"); refresh(); };
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(request);
      window.removeEventListener("keydown", keys);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      r.crowd?.stop();
      stopMusic();
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => {
        const setup = document.querySelector<HTMLElement>(
          '[data-testid="start-run"]',
        );
        if (setup) setup.focus();
        else if (previousFocus?.isConnected && previousFocus !== document.body)
          previousFocus.focus();
      });
    };
  }, [config, m, r, refresh]);
  useEffect(() => {
    if (panel)
      root.current
        ?.querySelector<HTMLElement>("[data-cricket-panel] button")
        ?.focus();
  }, [panel]);

  const primaryLabel = r.replay
    ? "Skip replay"
    : m.phase === "toss"
      ? "Call the toss"
      : m.phase === "interval"
        ? "Begin the chase"
        : live
          ? batting
            ? r.delivery?.shot
              ? "Shot committed"
              : "Swing"
            : "Ball in play"
          : r.arming
            ? "Release ball"
            : batting
              ? "Face delivery"
              : "Begin run-up";
  const bowler =
    i?.bowlers[
      Math.min(1, Math.floor(Math.min(i.balls, config.overs * 6 - 1) / 6))
    ];
  const locked = live || !!r.replay || r.paused;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={`cricket cr-stage cr-v2${assist ? " cr-assist" : ""}${advanced ? " cr-expanded" : ""}`}
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label="Sinverse Cricket match"
      tabIndex={-1}
      data-testid="sinverse-cricket"
      data-renderer={quality === "tactical" ? "tactical" : "webgl2"}
    >
      <header className="cr-top">
        <div className="cr-wordmark">
          <span aria-hidden>◈</span>
          <strong>
            SINVERSE <b>CRICKET</b>
          </strong>
          <small>{VENUES[config.venue].name}</small>
        </div>
        <div className="cr-tools">
          <button
            ref={pauseButton}
            onClick={() => setMenu("pause")}
            aria-label="Pause match"
          >
            Ⅱ
          </button>
          <button onClick={() => setMenu("scorecard")}>Scorecard</button>
          <button onClick={() => setMenu("audio")}>Audio</button>
        </div>
      </header>
      <section className="cr-score" aria-label="Live scoreboard">
        <div className="cr-score-team">
          <TeamSymbol team={i?.team ?? config.team} />
          <span>
            <strong><span className="cr-team-long">{TEAMS[i?.team ?? config.team]!.name}</span><span className="cr-team-short">{TEAMS[i?.team ?? config.team]!.short}</span></strong>
            <small>
              {m.phase === "toss"
                ? "Awaiting the toss"
                : `${m.innings.length === 1 ? "First innings" : "The chase"} · ${batting ? "YOU BAT" : "YOU BOWL"}`}
            </small>
            {m.target && <small className="cr-mobile-target" data-testid="cricket-mobile-target">{Math.max(0, m.target - i.runs)} from {Math.max(0, config.overs * 6 - i.balls)} balls</small>}
          </span>
        </div>
        <div className="cr-totals">
          <strong data-testid="cricket-score">
            <span className="cr-tick" key={`${i?.runs ?? 0}-${i?.wickets ?? 0}`}>{i?.runs ?? 0}</span>
            <i>/{i?.wickets ?? 0}</i>
          </strong>
          <span>
            {oversText(i?.balls ?? 0)} <small>/ {config.overs} ov</small>
          </span>
        </div>
        <div className="cr-target">
          {m.target ? (
            <>
              <small>TARGET {m.target}</small>
              <b>
                {Math.max(0, m.target - i.runs)} from{" "}
                {Math.max(0, config.overs * 6 - i.balls)}
              </b>
              <span>
                RRR{" "}
                {i.balls < config.overs * 6
                  ? (
                      ((m.target - i.runs) * 6) /
                      (config.overs * 6 - i.balls)
                    ).toFixed(1)
                  : "—"}
              </span>
            </>
          ) : (
            <>
              <small>BUILD THE TOTAL</small>
              <b>RR {i?.balls ? ((i.runs * 6) / i.balls).toFixed(1) : "0.0"}</b>
              <span>
                {config.overs === 1 ? "Six legal balls" : "Twelve legal balls"}
              </span>
            </>
          )}
        </div>
      </section>
      <section className="cr-field" aria-label="Match presentation"
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" || r.paused || r.replay || r.ceremony.stage !== "done" || e.target instanceof HTMLElement && e.target.closest("button,select,input,label,.cr-toss,.cr-match-finish")) return;
          if (gesture.current) { gesture.current = null; return; }
          const rect = e.currentTarget.getBoundingClientRect();
          if (e.clientX - rect.left < 16 || rect.right - e.clientX < 16) return;
          gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now(), width: rect.width, height: rect.height };
          e.currentTarget.setPointerCapture(e.pointerId); unlockAudio(); e.preventDefault();
        }}
        onPointerUp={(e) => {
          const g = finishGesture(gesture.current, e.pointerId, e.clientX, e.clientY, performance.now(), sensitivity);
          gesture.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          if (!g || r.paused || r.replay) return;
          if (!batting && live) return;
          if (batting) {
            const intent = gestureShot(g, shot); setShot(intent);
            primary(intent);
          } else {
            const intent = r.arming || g.tap ? bowl : gestureBowl(g, bowl);
            setBowl(intent); primary(undefined, intent);
          }
          e.preventDefault();
        }}
        onPointerCancel={() => { gesture.current = null; }}
        onLostPointerCapture={() => { gesture.current = null; }}
      >
        <CricketViewport
          config={config}
          quality={quality}
          lighting={lighting}
          onQuality={setQuality}
          driver={driver}
        />
        <div className="cr-field-corner">
          <span className="cr-live-dot" />
          {r.replay ? "REPLAY" : live ? "LIVE DELIVERY" : "AT THE CREASE"}
          {r.settled && !r.replay && r.delivery && <SpeedRead d={r.delivery} />}
          {i?.freeHit && <b className="cr-free-hit">FREE HIT</b>}
        </div>
        <div className={`cr-scene-options${quality === "tactical" ? " is-tactical" : ""}`}>
          <label className="sr-only" htmlFor="cr-camera">
            Camera
          </label>
          <select
            id="cr-camera"
            aria-label="Camera"
            value={r.replay?.camera ?? camera}
            onChange={(e) => {
              const value = e.target.value as CameraName;
              if (r.replay) {
                r.replay.camera = value;
                refresh();
              } else setCamera(value);
            }}
          >
            {CAMERAS.map((c) => (
              <option value={c} key={c}>
                {CAMERA_LABELS[c]} camera
              </option>
            ))}
            {r.replay && <option value="director">{CAMERA_LABELS.director}</option>}
          </select>
          <select
            aria-label="Graphics"
            value={autoQuality ? "auto" : quality}
            onChange={(e) => {
              if (e.target.value === "auto") {
                setAutoQuality(true);
                if (quality === "tactical") setQuality("medium");
              } else {
                setAutoQuality(false);
                setQuality(e.target.value as typeof quality);
              }
            }}
          >
            <option value="auto">Auto graphics{autoQuality ? ` (${quality})` : ""}</option>
            <option value="low">Low graphics</option>
            <option value="medium">Medium graphics</option>
            <option value="high">High graphics</option>
            <option value="ultra">Ultra graphics</option>
            <option value="tactical">Tactical 2D</option>
          </select>
          <select
            id="cr-lighting"
            aria-label="Lighting"
            value={lighting}
            onChange={(e) => setLighting(e.target.value as typeof lighting)}
          >
            <option value="ground">Ground default</option>
            <option value="day">Day</option>
            <option value="evening">Evening</option>
            <option value="night">Night</option>
          </select>
        </div>
        {r.ceremony.stage !== "done" && (
          <div className={`cr-toss cr-ceremony cr-ceremony-${r.ceremony.stage}`} aria-live="polite">
            <p className="cr-eyebrow">{r.ceremony.stage === "stadium" ? "SINVERSE CRICKET / MATCHDAY" : r.ceremony.stage === "entry" ? "THE STAGE IS SET" : "THE FIRST DECISION"}</p>
            <h2>{({ stadium: VENUES[config.venue].name, lineups: "Your eleven. Your moment.", captains: "Two captains. One contest.", hand: "Everything starts here.", flight: r.ceremony.call ? "The call is locked." : "Call it in the air.", landing: "Let the coin decide.", reveal: `${m.tossFace.toUpperCase()}.`, decision: `${humanName(r.ceremony.call === m.tossFace ? config.team : 1 - config.team)} win the toss.`, entry: "Take your positions.", done: "" })[r.ceremony.stage]}</h2>
            {r.ceremony.stage === "lineups" && <div className="cr-lineups">{TEAMS.map(t => <p key={t.id}><b>{t.name}</b><br />{t.players.join(" · ")}</p>)}</div>}
            {r.ceremony.stage === "captains" && <p>{TEAMS[0]!.players[0]} · {TEAMS[0]!.name}<br />{TEAMS[1]!.players[0]} · {TEAMS[1]!.name}</p>}
            {r.ceremony.stage === "flight" && !r.ceremony.call && <div className="cr-toss-choices">
              {(["heads", "tails"] as CoinFace[]).map(face => <button className="cr-button" key={face} aria-label={face === "heads" ? "Heads" : "Tails"} onClick={() => chooseToss(face)}>{face === "heads" ? "Heads" : "Tails"}<kbd aria-hidden>{face === "heads" ? "H" : "T"}</kbd></button>)}
              <small>Choose before landing. The coin waits for your call.</small>
            </div>}
            {r.ceremony.call && ["flight", "landing"].includes(r.ceremony.stage) && <p>You called {r.ceremony.call}. No changes after the call.</p>}
            {r.ceremony.stage === "decision" && <div className="cr-toss-choices">
              {r.ceremony.call === m.tossFace ? <><button className="cr-button cr-primary" aria-label="Bat first" onClick={() => commitDecision("bat")}>Bat first <kbd aria-hidden>B</kbd></button><button className="cr-button" aria-label="Bowl first" onClick={() => commitDecision("bowl")}>Bowl first <kbd aria-hidden>O</kbd></button></> : <><p>The opposition captain will set the innings order.</p><button className="cr-button cr-primary" onClick={() => commitDecision("bat")}>Continue to the middle</button></>}
            </div>}
            {r.ceremony.stage !== "decision" && <button className="cr-small cr-skip" disabled={r.ceremony.stage === "flight" && !r.ceremony.call} onClick={() => { r.ceremony.skip(); unlockAudio(); refresh(); }}>Skip cinematic <kbd>{keyLabel(bindings.action)}</kbd></button>}
          </div>
        )}
        {m.phase === "interval" && !r.replay && <div className="cr-transition"><p className="cr-eyebrow">INNINGS BREAK</p><h2>The chase begins.</h2><p>{humanName(1 - m.firstBat)} need {(m.innings[0]?.runs ?? 0) + 1} from {config.overs * 6} balls.</p>{m.innings[0] && <Standouts innings={m.innings[0]} />}<button className="cr-button" onClick={() => primary()}>Begin the chase</button></div>}
        <BroadcastGraphics
          cards={
            m.current
              ? broadcastCards(
                  {
                    now: r.elapsed,
                    endedAt: r.endedAt,
                    settled: r.settled,
                    live: !!live,
                    replay: !!r.replay,
                    ready: m.phase === "ready" && r.ceremony.stage === "done",
                    innings: m.current,
                    inningsNo: m.innings.length,
                    history: m.history,
                    outcome: r.delivery?.outcome ?? null,
                    carry: carryOf(r.delivery, config.venue),
                    batting: TEAMS[m.current.team]!.name,
                    fielding: TEAMS[1 - m.current.team]!.name,
                  },
                  r.intro,
                )
              : []
          }
        />
        {r.ceremony.stage === "done" && m.phase === "ready" && !r.replay && <div className="cr-intent" aria-label="Current intent">
          {/* Batting: the shot bar below the field already shows the chosen shot. */}
          {!batting && <span>{`${LABELS[bowl.variation]} · ${bowl.line.toFixed(1)} m · ${bowl.length.toFixed(1)} m length`}</span>}
          <small>{batting ? live ? r.delivery?.tick! < RELEASE_TICK ? "Watch the hand. Read the flight." : r.delivery?.shot ? "Shot committed" : `TIME YOUR SHOT · ${keyLabel(bindings.action)} / swipe` : continuous ? `Next delivery follows · ${keyLabel(bindings.action)} when ready` : `${keyLabel(bindings.action)} / tap to face` : r.arming ? `Release at centre · ${keyLabel(bindings.action)} / tap` : `Arrows to aim · ${keyLabel(bindings.action)} / swipe to run in`}</small>
          {batting && live && !r.delivery?.shot && r.delivery!.tick >= RELEASE_TICK && <div className="cr-flight-cue" aria-label="Delivery approaching the crease"><i style={{ width: `${Math.max(0, Math.min(100, (r.delivery!.pos.z + 8.5) / 17.3 * 100))}%` }} /></div>}
        </div>}
        {m.phase === "finished" && finishShown && !r.replay && (
          <div className="cr-match-finish">
            <p className="cr-eyebrow">MATCH COMPLETE</p>
            <h2>{m.result}</h2>
            <div className="cr-finish-standouts">
              {m.innings.map((inn) => (
                <Standouts key={inn.team} innings={inn} team={TEAMS[inn.team]!.short} />
              ))}
            </div>
            <p>
              {m.innings
                .map(
                  (i) =>
                    `${TEAMS[i.team]!.short} ${i.runs}/${i.wickets} (${oversText(i.balls)})`,
                )
                .join(" · ")}
            </p>
            <div>
              <button className="cr-button" onClick={replay}>
                Last delivery replay
              </button>
              <button
                className="cr-button cr-primary"
                data-testid="cricket-save"
                onClick={() => {
                  const summary = m.summary();
                  onFinish(m.inputLog, {
                    score: summary.score,
                    completed: summary.completed,
                    headline: m.result,
                  });
                }}
              >
                Verify &amp; save result
              </button>
            </div>
          </div>
        )}
        {r.arming && (
          <div className="cr-release">
            <strong>Release as the marker crosses centre</strong>
            <div
              role="meter"
              aria-label="Release timing"
              aria-valuemin={-1}
              aria-valuemax={1}
              aria-valuenow={Math.max(-1, Math.min(1, (r.elapsed - r.armedAt - 2500) / 700))}
            >
              <i
                style={{
                  left: `${3 + Math.min(1, (r.elapsed - r.armedAt) / 3200) * 94}%`,
                }}
              />
            </div>
            <small>Plant at the gold zone. Late releases can overstep. Space or tap.</small>
          </div>
        )}
        {r.replay && (
          <div className="cr-replay" data-playing={r.replay.playing ? "true" : "false"}>
            <div className="cr-replay-head">
              <strong>Actual delivery replay</strong>
              <select
                aria-label="Replay delivery"
                value={r.replay.index}
                onChange={(e) => {
                  r.replay = {
                    index: Number(e.target.value),
                    tick: 0,
                    playing: true,
                    speed: 0.5,
                    camera: "director",
                  };
                  refresh();
                }}
              >
                {r.replays.map((entry, n) => (
                  <option value={n} key={n}>
                    {entry.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  r.replay = null;
                  r.nextAt = r.elapsed + 1800;
                  refresh();
                }}
                data-testid="cricket-replay-close"
              >
                Return to match ×
              </button>
            </div>
            <input
              aria-label="Replay position"
              type="range"
              min={0}
              max={r.replays[r.replay.index]!.delivery.tick}
              value={Math.floor(r.replay.tick)}
              onChange={(e) => {
                r.replay!.tick = Number(e.target.value);
                r.replay!.playing = false;
                r.replay!.automatic = false;
                refresh();
              }}
            />
            <div className="cr-replay-foot">
              <div className="cr-replay-marks" role="group" aria-label="Jump to event">
                {(
                  [
                    ["Release", RELEASE_TICK],
                    ["Contact", r.replays[r.replay.index]!.delivery.hit ? r.replays[r.replay.index]!.delivery.contactTick : -1],
                    ["End", r.replays[r.replay.index]!.delivery.tick - 30],
                  ] as const
                ).map(([label, at]) =>
                  at < 0 ? null : (
                    <button
                      key={label}
                      onClick={() => {
                        r.replay!.tick = Math.max(0, at - 12);
                        r.replay!.playing = true;
                        refresh();
                      }}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
              <button
                onClick={() => {
                  r.replay!.playing = !r.replay!.playing;
                  refresh();
                }}
              >
                {r.replay.playing ? "Pause replay" : "Play replay"}
              </button>
              <select
                aria-label="Replay speed"
                value={r.replay.speed}
                onChange={(e) => {
                  r.replay!.speed = Number(e.target.value);
                  refresh();
                }}
              >
                {[0.25, 0.5, 1, 2].map((v) => (
                  <option value={v} key={v}>
                    {v}× speed
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </section>
      {m.phase !== "toss" && (
        <>
          {batting && !r.replay && (
            <ShotBar
              current={leaving ? shotChoice("leave")! : choiceFor(shot)}
              direction={shot.direction}
              locked={!!r.delivery?.shot && live}
              onChoose={chooseShot}
            />
          )}
          <div className="cr-players">
            <span>
              <b>{i.batsmen[i.striker]!.name} *</b> {i.batsmen[i.striker]!.runs}{" "}
              <small>({i.batsmen[i.striker]!.balls})</small>
              <i>
                {i.batsmen[i.nonStriker]!.name} {i.batsmen[i.nonStriker]!.runs}
              </i>
            </span>
            <span>
              <small>BOWLING</small> {bowler?.name}{" "}
              <b>
                {bowler?.wickets}/{bowler?.runs}
              </b>
            </span>
          </div>
          <section
            className="cr-controls"
            aria-label={batting ? "Batting controls" : "Bowling controls"}
          >
            {batting ? (
              <>
                <label>
                  Shot
                  <select
                    aria-label="Shot"
                    value={shot.kind}
                    disabled={locked}
                    onChange={(e) => {
                      const kind = e.target.value as ShotInput["kind"];
                      setLeaving(false);
                      setShot((s) => ({
                        ...s,
                        kind,
                        direction: SHOT_AIM[kind],
                      }));
                    }}
                  >
                    {SHOTS.map((k) => (
                      <option value={k} key={k}>
                        {LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <Range
                  label="Aim"
                  value={shot.direction}
                  min={-120}
                  max={120}
                  disabled={locked}
                  display={`${shot.direction}°`}
                  onChange={(direction) =>
                    setShot((s) => ({ ...s, direction }))
                  }
                />
                <Range
                  label="Power"
                  value={shot.power}
                  min={0.15}
                  max={1}
                  step={0.01}
                  disabled={locked}
                  display={`${Math.round(shot.power * 100)}%`}
                  onChange={(power) => setShot((s) => ({ ...s, power }))}
                />
              </>
            ) : (
              <>
                <label>
                  Variation
                  <select
                    aria-label="Variation"
                    value={bowl.variation}
                    disabled={locked || r.arming}
                    onChange={(e) =>
                      setBowl((b) => ({
                        ...b,
                        variation: e.target.value as BowlingInput["variation"],
                      }))
                    }
                  >
                    {VARIATIONS.map((v) => (
                      <option value={v} key={v}>
                        {LABELS[v]}
                      </option>
                    ))}
                  </select>
                </label>
                <Range
                  label="Line"
                  value={bowl.line}
                  min={-1.5}
                  max={1.5}
                  step={0.05}
                  disabled={locked || r.arming}
                  display={
                    bowl.line === 0 ? "Stumps" : `${bowl.line.toFixed(2)} m`
                  }
                  onChange={(line) => setBowl((b) => ({ ...b, line }))}
                />
                <Range
                  label="Length"
                  value={bowl.length}
                  min={0.5}
                  max={9}
                  step={0.1}
                  disabled={locked || r.arming}
                  display={
                    bowl.length < 1.5
                      ? "Yorker"
                      : bowl.length > 6
                        ? "Short"
                        : "Good / full"
                  }
                  onChange={(length) => setBowl((b) => ({ ...b, length }))}
                />
              </>
            )}
            <button
              className="cr-small"
              onClick={() => setAdvanced((v) => !v)}
              aria-expanded={advanced}
            >
              More control {advanced ? "−" : "+"}
            </button>
            {advanced && (
              <div className="cr-advanced">
                {batting ? (
                  <>
                    <Range
                      label="Footwork"
                      value={shot.foot}
                      min={-0.3}
                      max={0.8}
                      step={0.05}
                      disabled={locked}
                      display={
                        shot.foot > 0.55
                          ? "Advance"
                          : `${shot.foot.toFixed(2)} m`
                      }
                      onChange={(foot) => setShot((s) => ({ ...s, foot }))}
                    />
                    <Range
                      label="Bat face"
                      value={shot.face}
                      min={-0.6}
                      max={0.6}
                      step={0.02}
                      disabled={locked}
                      onChange={(face) => setShot((s) => ({ ...s, face }))}
                    />
                  </>
                ) : (
                  <>
                    <Range
                      label="Pace / flight"
                      value={bowl.speed}
                      min={0}
                      max={1}
                      step={0.05}
                      disabled={locked || r.arming}
                      onChange={(speed) => setBowl((b) => ({ ...b, speed }))}
                    />
                    <label>
                      Field
                      <select
                        aria-label="Field placement"
                        value={field}
                        disabled={locked || r.arming}
                        onChange={(e) =>
                          setField(e.target.value as typeof field)
                        }
                      >
                        <option value="balanced">Balanced ring</option>
                        <option value="attack">Attacking catchers</option>
                        <option value="boundary">Boundary protection</option>
                      </select>
                    </label>
                  </>
                )}
                <label className="cr-check">
                  <input
                    type="checkbox"
                    checked={simple}
                    disabled={locked}
                    onChange={(e) => setSimple(e.target.checked)}
                  />
                  Relaxed presentation pace
                </label>
              </div>
            )}
          </section>
          <div className="cr-actions">
            <div className="cr-ball-chips" aria-label="Current over">
              {(i.over.length ? i.over : ["—"]).slice(-8).map((value, n) => (
                <span
                  className={
                    value === "6" || value === "4" ? "cr-boundary-chip" : ""
                  }
                  key={n}
                >
                  {value}
                </span>
              ))}
              <button
                onClick={replay}
                disabled={live || !r.replays.length}
                aria-label="Replay last delivery"
              >
                ↺ Replay
              </button>
            </div>
            {m.phase !== "finished" && (
              <div className="cr-main-actions">
                <button
                  className="cr-button"
                  onClick={run}
                  disabled={
                    !live ||
                    !batting ||
                    !!r.replay ||
                    r.paused ||
                    !r.delivery ||
                    r.delivery.running ||
                    (!r.delivery.hit &&
                      !r.delivery.pad &&
                      r.delivery.pos.z < 8.8)
                  }
                  data-testid="cricket-run"
                >
                  Run <kbd>{keyLabel(bindings.run)}</kbd>
                </button>
                <button
                  className="cr-button cr-primary"
                  onClick={() => primary()}
                  disabled={
                    r.paused ||
                    !!r.error ||
                    (!r.replay && live && (!batting || !!r.delivery?.shot))
                  }
                  data-testid="cricket-primary"
                >
                  {primaryLabel}
                  <kbd>{keyLabel(bindings.action)}</kbd>
                </button>
              </div>
            )}
          </div>
        </>
      )}
      <footer className="cr-footer">
        <p role="status" aria-live="polite" data-testid="cricket-commentary">
          {r.error || feedback}
        </p>
        <span>
          {quality === "tactical" ? "2D" : quality.toUpperCase()} · {fps} fps
        </span>
      </footer>
      {panel && (
        <div className="cr-overlay">
          <section
            data-cricket-panel
            role="dialog"
            aria-modal="true"
            aria-label={panel === "pause" ? "Match paused" : panel}
            className="cr-panel"
          >
            <button
              className="cr-panel-close"
              onClick={() => setMenu(null)}
              aria-label="Close panel"
            >
              ×
            </button>
            {panel === "pause" ? (
              <>
                <p className="cr-eyebrow">TAKE YOUR TIME</p>
                <h2>Match paused.</h2>
                <p>The ball, runners and fielders wait for you.</p>
                <button
                  className="cr-button cr-primary"
                  onClick={() => setMenu(null)}
                >
                  Return to the middle
                </button>
                <button className="cr-button" onClick={() => setPanel("rules")}>
                  Controls &amp; rules
                </button>
                <label className="cr-check">
                  <input
                    type="checkbox"
                    checked={cinema}
                    onChange={(e) => setCinema(e.target.checked)}
                  />
                  Automatic event replays
                </label>
                <label className="cr-check"><input type="checkbox" checked={continuous} onChange={e => setContinuous(e.target.checked)} />Continuous match flow</label>
                <label className="cr-check"><input type="checkbox" checked={assist} onChange={e => setAssist(e.target.checked)} />Touch / assist controls</label>
                <p className="cr-note">
                  Leaving discards this unfinished duel. Saved player progress
                  stays intact.
                </p>
                <button className="cr-button" onClick={onQuit}>
                  Leave match
                </button>
              </>
            ) : panel === "rules" ? (
              <>
                <h2>Every ball is a decision.</h2>
                <p>Use arrows to aim and choose front/back foot while the bowler approaches. 1–8 select block, straight, cover, on drive, cut, pull, sweep and loft. Shift selects loft, Ctrl selects defence. Q/E adjust power or pace; V cycles bowling variation. Direction, footwork and timing change real contact.</p>
                <p>On touch: swipe the field as the ball arrives; short tap defends. A longer, quicker swipe lofts. To bowl, swipe to aim and start the run-up, then tap when the marker reaches the gold zone. Interrupted touches cancel. Turn on Touch / assist controls in Pause for button alternatives.</p>
                <Range label="Touch sensitivity" value={sensitivity} min={0.5} max={1.8} step={0.1} onChange={setSensitivity} />
                <div className="cr-bindings" aria-label="Keyboard bindings">{(Object.keys(bindings) as BindingName[]).map(name => <button key={name} aria-pressed={bindingTarget === name} onClick={() => { setBindingTarget(name); setBindingMessage("Press a key. Escape cancels."); root.current?.focus(); }}>{name}<kbd>{keyLabel(bindings[name])}</kbd></button>)}</div>
                <p role="status">{bindingMessage}</p>
                <p>
                  <b>Batting:</b> set a plan, then adjust direction and footwork
                  during the approach. Swing as the ball arrives. Footwork and
                  face angle offer finer control. A poor choice can edge or miss.
                </p>
                <p>
                  <b>Bowling:</b> choose line, length and variation. Begin the
                  run-up and commit the release at the gold zone. A late overstep
                  is a no-ball and free hit.
                </p>
                <p>
                  <b>Running:</b> R calls one run; call again after reaching
                  ground. Fielders chase, collect and throw. A direct hit can
                  catch a runner short.
                </p>
                <p>
                  Six legal balls per over. Wides/no-balls add a run and are
                  rebowled. Both innings are played. A level finish is a tie. No
                  rain adjustment, reviews or Super Over in this duel.
                </p>
                <p>
                  Keyboard: Space action, R run, P replay, C camera, Escape
                  pause. Gamepad: D-pad left/right calls heads/tails; A/B chooses
                  bat/bowl. During play: A action, B run, X replay, Start pause.
                  Reduced motion follows your platform preference.
                </p>
              </>
            ) : panel === "audio" ? (
              <>
                <h2>The sound of the middle.</h2>
                <label className="cr-check">
                  <input
                    type="checkbox"
                    checked={settings.sound}
                    onChange={(e) => {
                      unlockAudio();
                      updateSettings({ sound: e.target.checked });
                    }}
                  />
                  Sound enabled
                </label>
                <Range
                  label="Master volume"
                  value={settings.masterVolume}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(masterVolume) => updateSettings({ masterVolume })}
                />
                <Range
                  label="Crowd volume"
                  value={crowdVolume}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={setCrowdVolume}
                />
                <Range
                  label="Effects volume"
                  value={settings.volume}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(volume) => updateSettings({ volume })}
                />
                <Range
                  label="Music volume"
                  value={settings.musicVolume}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(musicVolume) => updateSettings({ musicVolume })}
                />
                <label className="cr-check">
                  <input
                    type="checkbox"
                    checked={settings.music}
                    onChange={(e) =>
                      updateSettings({ music: e.target.checked })
                    }
                  />
                  Original interlude music
                </label>
                <p className="cr-note">
                  Important reactions are also shown as text. No recorded
                  commentary is used.
                </p>
              </>
            ) : (
              <>
                <h2>The scorebook.</h2>
                <Scorecards innings={m.innings} />
                <p>
                  Partnership: {i?.partnership ?? 0}. Batter ball counts show
                  legal deliveries faced in this custom duel.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </div>,
    document.body,
  );
}

function Scorecards({ innings }: { innings: Innings[] }) {
  return (
    <div className="cr-scorecards">
      {innings.map((i, n) => (
        <section key={n}>
          <h3>
            {TEAMS[i.team]!.name}{" "}
            <b>
              {i.runs}/{i.wickets}
            </b>{" "}
            <small>({oversText(i.balls)})</small>
          </h3>
          <div className="cr-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Batter</th>
                  <th>R</th>
                  <th>B*</th>
                  <th>4</th>
                  <th>6</th>
                </tr>
              </thead>
              <tbody>
                {i.batsmen
                  .filter(
                    (b, k) =>
                      b.balls ||
                      b.runs ||
                      b.dismissal ||
                      k === i.striker ||
                      k === i.nonStriker,
                  )
                  .map((b) => (
                    <tr key={b.name}>
                      <th>
                        {b.name}
                        <small>{b.dismissal ?? "not out"}</small>
                      </th>
                      <td>{b.runs}</td>
                      <td>{b.balls}</td>
                      <td>{b.fours}</td>
                      <td>{b.sixes}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p>
              Extras {Object.values(i.extras).reduce((a, b) => a + b, 0)} · Wd{" "}
              {i.extras.wides} · Nb {i.extras.noBalls} · B {i.extras.byes} · Lb{" "}
              {i.extras.legByes}
            </p>
            <table>
              <thead>
                <tr>
                  <th>Bowler</th>
                  <th>O</th>
                  <th>R</th>
                  <th>W</th>
                </tr>
              </thead>
              <tbody>
                {i.bowlers
                  .filter((b) => b.balls || b.runs || b.wickets)
                  .map((b) => (
                    <tr key={b.name}>
                      <th>{b.name}</th>
                      <td>{oversText(b.balls)}</td>
                      <td>{b.runs}</td>
                      <td>{b.wickets}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p>
              Fall:{" "}
              {i.fall.length
                ? i.fall
                    .map(
                      (f) => `${f.score}/${f.wicket} (${f.batter}, ${f.ball})`,
                    )
                    .join(" · ")
                : "No wickets"}
            </p>
          </div>
        </section>
      ))}
    </div>
  );
}
export function CricketResultDetails({
  details,
  saved,
}: {
  details: Record<string, number | string>;
  saved: boolean;
}) {
  let innings: Innings[] = [];
  try {
    if (
      typeof details.scorecard === "string" &&
      details.scorecard.length < 20000
    )
      innings = JSON.parse(details.scorecard) as Innings[];
  } catch {}
  return (
    <div className="cricket cr-result">
      <h3>{saved ? "Verified scorebook saved" : "Verified scorebook"}</h3>
      <p>
        {details.runs} batting runs · {details.wicketsTaken} wickets taken ·{" "}
        {details.sixes} sixes · Result: {details.result}
      </p>
      <Scorecards innings={Array.isArray(innings) ? innings : []} />
      <p className="cr-note">
        Points compare batting and wickets per scheduled over, plus a win bonus.
        Replays stay in this open match; career and full-format cricket are
        future phases.
      </p>
    </div>
  );
}
