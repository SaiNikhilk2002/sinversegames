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
import type { CameraName, Quality, SceneDriver, SceneFeed } from "./scene";
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
  "side",
  "aerial",
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
    <div className="cricket cr-setup">
      <div className="cr-intro">
        <div>
          <p className="cr-eyebrow">THE FINAL OVER IS YOURS</p>
          <h2>
            Read the ball.
            <br />
            <em>Own the moment.</em>
          </h2>
          <p>
            Bat. Bowl. Defend the rope. An original cricket duel with real ball
            flight and replays of the match you played.
          </p>
          <div className="cr-tags">
            <span>Two innings</span>
            <span>Original teams</span>
            <span>3D + tactical view</span>
          </div>
        </div>
        <img
          src="/sinverse-cricket/cover.svg"
          alt="Original floodlit cricket ground with a rising ball"
          width="320"
          height="200"
        />
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
            Space to swing or release · R to run · P to replay · Escape to
            pause. Touch controls are always available.
          </p>
        </div>
        <button
          className="cr-button cr-primary"
          data-testid="start-run"
          disabled={busy}
          onClick={() =>
            onStart(configSchema.parse({ team, venue, overs, difficulty }))
          }
        >
          {busy ? "Preparing fixture…" : "Walk out to the middle"}
          <span aria-hidden>↗</span>
        </button>
      </div>
    </div>
  );
}

function CricketViewport({
  config,
  quality,
  onQuality,
  driver,
}: {
  config: CricketConfig;
  quality: Quality | "tactical";
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
          instance = module.createCricketScene(element, config, quality, () => {
            if (!cancelled) onQuality("tactical");
          });
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
  }, [config, quality, onQuality, driver]);
  return (
    <>
      <canvas
        key={quality}
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
  } | null;
  music: boolean;
  crowd: Loop | null;
  contactHeard: boolean;
  lastStep: number;
  error: string;
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
  }));
  const [, setRevision] = useState(0),
    refresh = useCallback(() => setRevision((v) => v + 1), []),
    [quality, setQuality] = useState<Quality | "tactical">("medium"),
    [camera, setCamera] = useState<CameraName>("broadcast"),
    [simple, setSimple] = useState(true),
    [advanced, setAdvanced] = useState(false),
    [panel, setPanel] = useState<
      "pause" | "rules" | "audio" | "scorecard" | null
    >(null),
    [shot, setShot] = useState(DEFAULT_SHOT),
    [bowl, setBowl] = useState(DEFAULT_BOWL),
    [field, setField] = useState<BallLog["field"]>("balanced"),
    [call, setCall] = useState<"heads" | "tails">("heads"),
    [decision, setDecision] = useState<"bat" | "bowl">("bat"),
    [crowdVolume, setCrowdVolume] = useState(0.42),
    [cinema, setCinema] = useState(true),
    [feedback, setFeedback] = useState("Read the ball. Find your gap."),
    [fps, setFps] = useState(0);
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
  };
  const actions = useRef({
    primary: () => {},
    run: () => {},
    pause: () => {},
    replay: () => {},
    camera: () => {},
  });
  const m = r.match,
    i = m.current,
    live = !!r.delivery && !r.settled,
    batting = i ? m.humanBatting : true;
  const setMenu = useCallback(
    (next: typeof panel) => {
      r.paused = !!next;
      r.arming = false;
      setPanel(next);
      unlockAudio();
      if (!next) requestAnimationFrame(() => pauseButton.current?.focus());
      refresh();
    },
    [r, refresh],
  );
  const primary = () => {
    unlockAudio();
    if (r.paused || r.error || r.replay) return;
    if (m.phase === "toss") {
      m.toss({ k: "toss", call, decision, t: Math.floor(r.elapsed) });
      setFeedback(
        `${m.tossFace.toUpperCase()}. ${humanName(m.tossWinner)} win the toss. ${humanName(m.firstBat)} bat first.`,
      );
      refresh();
      return;
    }
    if (m.phase === "interval") {
      m.nextInnings();
      r.delivery = null;
      r.settled = false;
      r.arming = false;
      setFeedback(
        `${humanName(m.current.team)} need ${m.target} to win. A new innings, a new plan.`,
      );
      refresh();
      return;
    }
    if (m.phase !== "ready") return;
    if (r.delivery && !r.settled) {
      if (m.humanBatting && r.delivery.swingBat(shot)) {
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
        refresh();
        return;
      }
      if (r.elapsed - r.armedAt < 300) return;
      plan = {
        ...bowl,
        release: Math.sin(((r.elapsed - r.armedAt) / 1000) * Math.PI * 1.8),
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
      r.plan = plan;
      r.field = nextField;
      r.settled = false;
      r.contactHeard = false;
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
    if (live || !r.replays.length) return;
    r.replay = {
      index: r.replays.length - 1,
      tick: 0,
      playing: true,
      speed: 0.5,
      camera: "track",
    };
    refresh();
  };
  actions.current = {
    primary,
    run,
    pause: () => setMenu(panel ? null : "pause"),
    replay,
    camera: () =>
      setCamera((c) => CAMERAS[(CAMERAS.indexOf(c) + 1) % CAMERAS.length]!),
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow,
      previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    root.current?.focus();
    if (window.innerWidth < 640) setQuality("low");
    r.crowd = createLoop("crowd");
    let request = 0,
      last = performance.now(),
      uiAt = last,
      drawAt = 0,
      fpsAt = last,
      frames = 0;
    let previousPad: boolean[] = [];
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!r.paused) {
        r.elapsed += dt * 1000;
        if (r.replay) {
          const replay = r.replay,
            entry = r.replays[replay.index];
          if (entry && replay.playing) {
            replay.tick += dt * 120 * replay.speed;
            const end = entry.delivery.frames.at(-1)!.tick;
            if (replay.tick >= end) {
              replay.tick = end;
              replay.playing = false;
            }
          }
        } else if (r.delivery && !r.settled) {
          const d = r.delivery;
          r.acc += dt * (preferences.current.simple ? 0.65 : 1);
          let steps = 0;
          while (r.acc >= STEP && !d.outcome && steps < 14) {
            d.step();
            r.acc -= STEP;
            steps++;
          }
          if (d.hit && !r.contactHeard) {
            r.contactHeard = true;
            sfx.cricketBat(d.contactQuality);
            setFeedback(
              `${d.edge ? "Edge" : d.contactQuality > 0.82 ? "Pure contact" : d.timing < -3 ? "Early" : d.timing > 3 ? "Late" : "Good timing"} · ${d.shot ? LABELS[d.shot.kind] : "shot"}`,
            );
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
              if (d.outcome.wicket) {
                sfx.cricketStumps();
              } else if (d.outcome.boundary) {
                sfx.correct();
              }
              if (
                preferences.current.cinema &&
                !preferences.current.reduced &&
                (d.outcome.boundary || d.outcome.wicket)
              )
                r.replay = {
                  index: r.replays.length - 1,
                  tick: Math.max(0, d.tick - 180),
                  playing: true,
                  speed: 0.5,
                  camera: "track",
                };
            }
            r.settled = true;
            refresh();
          }
        }
      }
      const settings = getSettings();
      if (!r.paused && settings.sound) {
        r.crowd?.set(
          preferences.current.crowdVolume *
            (r.delivery?.outcome?.boundary === 6 ? 1 : 0.32),
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
      if (r.replay) {
        const entry = r.replays[r.replay.index];
        if (entry) {
          const frames = entry.delivery.frames;
          const at = frames.findIndex((f) => f.tick >= r.replay!.tick);
          const b = frames[at < 0 ? frames.length - 1 : at]!,
            a = frames[Math.max(0, (at < 0 ? frames.length - 1 : at) - 1)]!;
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
          driver.current.draw({
            frame: visual,
            shot: visualShot,
            outcome: visualOutcome,
            battingTeam: team,
            humanBatting: human,
            camera: r.replay ? r.replay.camera : preferences.current.camera,
            reducedMotion: preferences.current.reduced,
            score,
            time: r.elapsed / 1000,
            actorNumbers: numbers,
          });
          frames++;
        }
        drawAt = now;
      }
      const element = root.current;
      if (element) {
        element.dataset.ballTick = String(r.delivery?.tick ?? 0);
        element.dataset.ballX = String(r.delivery?.pos.x ?? 0);
        element.dataset.ballY = String(r.delivery?.pos.y ?? 0);
        element.dataset.ballZ = String(r.delivery?.pos.z ?? 0);
        element.dataset.live = String(!!r.delivery && !r.settled);
        element.dataset.batting = String(m.current ? m.humanBatting : true);
        element.dataset.seq = String(m.seq);
        element.dataset.phase = m.phase;
        element.dataset.release = String(r.plan?.release ?? 0);
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
        }
      }
      try {
        const pad = navigator.getGamepads?.()[0];
        if (pad) {
          const pressed = pad.buttons.map((b) => b.pressed);
          if (pressed[0] && !previousPad[0]) actions.current.primary();
          if (pressed[1] && !previousPad[1]) actions.current.run();
          if (pressed[2] && !previousPad[2]) actions.current.replay();
          if (pressed[9] && !previousPad[9]) actions.current.pause();
          previousPad = pressed;
        }
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
        actions.current.pause();
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input,select,textarea")
      )
        return;
      if (event.repeat) return;
      if (event.code === "Space") {
        event.preventDefault();
        actions.current.primary();
      }
      if (event.code === "KeyR") actions.current.run();
      if (event.code === "KeyP") actions.current.replay();
      if (event.code === "KeyC") actions.current.camera();
    };
    const visibility = () => {
      if (document.hidden) {
        r.paused = true;
        r.arming = false;
        setPanel("pause");
        refresh();
      }
    };
    window.addEventListener("keydown", keys);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(request);
      window.removeEventListener("keydown", keys);
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

  const primaryLabel =
    m.phase === "toss"
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
              : "Start release meter";
  const bowler =
    i?.bowlers[
      Math.min(1, Math.floor(Math.min(i.balls, config.overs * 6 - 1) / 6))
    ];
  const locked = live || !!r.replay || r.paused;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="cricket cr-stage"
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
            <strong>{TEAMS[i?.team ?? config.team]!.name}</strong>
            <small>
              {m.phase === "toss"
                ? "Awaiting the toss"
                : `${m.innings.length === 1 ? "First innings" : "The chase"} · ${batting ? "YOU BAT" : "YOU BOWL"}`}
            </small>
          </span>
        </div>
        <div className="cr-totals">
          <strong data-testid="cricket-score">
            {i?.runs ?? 0}
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
      <section className="cr-field" aria-label="Match presentation">
        <CricketViewport
          config={config}
          quality={quality}
          onQuality={setQuality}
          driver={driver}
        />
        <div className="cr-field-corner">
          <span className="cr-live-dot" />
          {r.replay ? "REPLAY" : live ? "LIVE DELIVERY" : "AT THE CREASE"}
          {i?.freeHit && <b className="cr-free-hit">FREE HIT</b>}
        </div>
        <div className="cr-scene-options">
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
                {c[0]!.toUpperCase() + c.slice(1)} camera
              </option>
            ))}
          </select>
          <select
            aria-label="Graphics"
            value={quality}
            onChange={(e) => setQuality(e.target.value as typeof quality)}
          >
            <option value="low">Low graphics</option>
            <option value="medium">Medium graphics</option>
            <option value="high">High graphics</option>
            <option value="ultra">Ultra graphics</option>
            <option value="tactical">Tactical 2D</option>
          </select>
        </div>
        {m.phase === "toss" && (
          <div className="cr-toss">
            <p className="cr-eyebrow">THE FIRST DECISION</p>
            <h2>Call it in the air.</h2>
            <div className="cr-coin" aria-hidden>
              <TeamSymbol team={config.team} />
            </div>
            <div>
              <label>
                Call
                <select
                  aria-label="Toss call"
                  value={call}
                  onChange={(e) => setCall(e.target.value as typeof call)}
                >
                  <option value="heads">Heads</option>
                  <option value="tails">Tails</option>
                </select>
              </label>
              <label>
                If you win
                <select
                  aria-label="Toss decision"
                  value={decision}
                  onChange={(e) =>
                    setDecision(e.target.value as typeof decision)
                  }
                >
                  <option value="bat">Bat first</option>
                  <option value="bowl">Bowl first</option>
                </select>
              </label>
            </div>
            <button className="cr-button cr-primary" onClick={primary}>
              Call the toss
            </button>
          </div>
        )}
        {m.phase === "finished" && !r.replay && (
          <div className="cr-match-finish">
            <p className="cr-eyebrow">MATCH COMPLETE</p>
            <h2>{m.result}</h2>
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
              aria-valuenow={Math.sin(
                ((r.elapsed - r.armedAt) / 1000) * Math.PI * 1.8,
              )}
            >
              <i
                style={{
                  left: `${50 + Math.sin(((r.elapsed - r.armedAt) / 1000) * Math.PI * 1.8) * 47}%`,
                }}
              />
            </div>
            <small>Late releases can overstep. Space or Release ball.</small>
          </div>
        )}
        {r.replay && (
          <div className="cr-replay">
            <div>
              <strong>Actual delivery replay</strong>
              <button
                onClick={() => {
                  r.replay = null;
                  refresh();
                }}
                data-testid="cricket-replay-close"
              >
                Return to match ×
              </button>
            </div>
            <select
              aria-label="Replay delivery"
              value={r.replay.index}
              onChange={(e) => {
                r.replay = {
                  index: Number(e.target.value),
                  tick: 0,
                  playing: true,
                  speed: 0.5,
                  camera: "track",
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
            <input
              aria-label="Replay position"
              type="range"
              min={0}
              max={r.replays[r.replay.index]!.delivery.tick}
              value={Math.floor(r.replay.tick)}
              onChange={(e) => {
                r.replay!.tick = Number(e.target.value);
                r.replay!.playing = false;
                refresh();
              }}
            />
            <div>
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
                  Run <kbd>R</kbd>
                </button>
                <button
                  className="cr-button cr-primary"
                  onClick={primary}
                  disabled={
                    r.paused ||
                    !!r.replay ||
                    !!r.error ||
                    (live && (!batting || !!r.delivery?.shot))
                  }
                  data-testid="cricket-primary"
                >
                  {primaryLabel}
                  <kbd>SPACE</kbd>
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
                <p>
                  <b>Batting:</b> choose shot, aim and power before facing.
                  Swing with Space as the ball arrives. Footwork and face angle
                  offer finer control. A poor choice can edge or miss.
                </p>
                <p>
                  <b>Bowling:</b> choose line, length and variation. Start the
                  meter and release at centre. A late overstep is a no-ball and
                  free hit.
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
                  pause. Gamepad: A action, B run, X replay, Start pause.
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
