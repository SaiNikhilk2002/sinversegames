import * as T from "three";
import { PEOPLE, closestPair, place, type Spot } from "./spacing";
import { KitMaterials, RealisticBody, equipmentKit, loadSquad, squadPeople } from "./realistic";
import type { Appearance } from "./athlete-look";
import { MotionPlayer, loadMotion, type MotionLibrary, type OneShot } from "./motion";
import {
  RELEASE_TICK,
  SHOT_HEIGHTS,
  STEP,
  STUMPS_Z,
  type CricketConfig,
  type Fielder,
  type Frame,
  type Outcome,
  type ShotInput,
  type Variation,
  VENUES,
} from "@platform/engines/sinverse-cricket";
import {
  BAT,
  CH,
  CLIPS,
  DELIVERY,
  RIG,
  GATHER,
  FootPlanter,
  StepFeet,
  applyGait,
  blendPose,
  bowlingStyle,
  clamp01,
  makePose,
  sampleClip,
  selectBowler,
  selectFielder,
  selectKeeper,
  selectNonStriker,
  selectStriker,
  selectUmpire,
  type ClipName,
  type MatchMoment,
  type Pose,
  type Selection,
  type Vec3,
} from "./animation";
import { FLIGHT_TICKS, batterStyle, batting, type BattingInput, type ContactKind } from "./batting";
import type { BatPose, BowlingStyle } from "./animation";
import { applyPose, batPoint, buildAthlete, handCentre, holdBat, paintKit, paintRoughness, placeBat, type Athlete, type Role } from "./character";
import { crowdEnergy, direct, ropeRatio, type CameraName } from "./director";
import { STUMPING_HIT, fielderPlan, keeperPlan, newMemo, reaction, type BallKin, type FieldMemo, type FieldPlan, type Reaction, type ReactionRole } from "./fielding";
import { LIGHTS, QUALITY, buildStadium, lightingFor, type Lighting, type QualityName } from "./stadium";
import { coinPose, type CeremonyFeed } from "./ceremony";
import { buildCoin, ceremonyCamera } from "./ceremony-scene";

export type Quality = QualityName;
export type { CameraName, Lighting };
export type SceneFeed = {
  frame: Frame;
  shot: ShotInput | null;
  outcome: Outcome | null;
  battingTeam: number;
  humanBatting: boolean;
  camera: CameraName;
  reducedMotion: boolean;
  score: string;
  time: number;
  actorNumbers?: number[];
  /** Tick of actual bat contact, known from the simulation (-1 if none yet). */
  contactTick?: number;
  /** Where the ball met the bat, so a slow frame rate cannot move the visual contact. */
  contactPoint?: { x: number; y: number; z: number } | null;
  edge?: boolean;
  /** Tick the ball reached the bat's line, and how far across from the bat it was (replays). */
  arrivalTick?: number;
  passLateral?: number;
  variation?: Variation | null;
  replay?: boolean;
  result?: MatchMoment["result"];
  ceremony?: CeremonyFeed;
  intent?: Omit<ShotInput, "tick">;
  aim?: { line: number; length: number };
  /** A break in play the broadcast covers (an over, the innings, the result). */
  interlude?: "over" | "innings" | "result" | null;
};
export interface SceneDriver {
  draw(feed: SceneFeed): void;
  dispose(): void;
  /**
   * Presentation pace for a big catch: below 1 while a fielder launches into a
   * dive or a leap (or takes one on the rope) and through the landing. The game
   * stretches wall-clock time by it; the simulation runs the same ticks.
   */
  cinematic(): number;
  metrics(): {
    calls: number;
    triangles: number;
    textures: number;
    geometries: number;
    dpr: number;
    shot?: string;
    /** Metres between the bat's sweet spot and the ball at actual contact. */
    contactError?: number;
    /** Metres between the bowling hand and the simulated release point. */
    releaseError?: number;
    /** Metres between each hand and its point on the handle (worst of the last swing). */
    gripError?: number;
    /** Metres a planted foot slid (worst recent). */
    footSlip?: number;
    excite?: number;
    /** Metres between the two closest people on the field this frame (centre to centre). */
    spacing?: number;
    /** Metres between where the hands were going and where the ball was taken, at the last take. */
    takeError?: number;
    takeMove?: string;
    /** Each fielder's current fielding move (fielders, bowler, keeper). */
    fielding?: string;
    /** The realistic athletes and their motion clips have loaded. */
    athletes?: boolean;
    /** Who each slot looks like (squad model and appearance), for checking it never changes. */
    looks?: string;
  };
}
const v3 = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const ACTORS = 14,
  STRIKER = 0,
  NON_STRIKER = 1,
  BOWLER = 11,
  KEEPER = 12,
  UMPIRE = 13;

type Actor = {
  a: Athlete;
  planter: FootPlanter;
  target: Pose;
  from: Pose;
  out: Pose;
  clip: string;
  fadeAt: number;
  action: Fielder["action"];
  actionTick: number;
  prev: T.Vector3;
  prevTick: number;
  speed: number;
  facing: number;
  number: number;
  team: number;
  kit: T.Texture | null;
  kitCanvas: HTMLCanvasElement | null;
  /** Realistic body worn over this actor once the squad has loaded. */
  body?: RealisticBody;
  /** Motion clips for the realistic body, and this frame's plan for them. */
  motion?: MotionPlayer;
  plan?: { speed: number; shot: { clip: OneShot; time: number; weight: number } | null; lower: number; upper: number; twist: number; lean: number } | null;
  /** Radians the body still has to turn, and how fast it is turning (rad/s). */
  turnLeft?: number;
  turnRate?: number;
  /** Ground speed from the simulation's positions (m/s), lightly smoothed. */
  ground?: number;
  motionLower?: number;
  motionUpper?: number;
  /** Clip time of a throw still playing out after the simulation moved on. */
  throwClock?: number;
  /** Fielding commitments for this ball, and this frame's fielding plan (presentation only). */
  memo: FieldMemo;
  field?: FieldPlan | null;
  /** Display carry: how far the body is ahead of its simulated spot, stepping into a take (x,z). */
  carry: { x: number; z: number };
  /** Planted feet for held poses, so a body moving under one steps instead of sliding. */
  steps: StepFeet;
  /** Seconds into the dead ball when this player was done with the ball (reactions start then). */
  freeAt: number;
  /** The fielding pose being blended in, and the one fading out, so a change of read never snaps. */
  planPose: { clip: ClipName; time: number; w: number } | null;
  fadePose: { clip: ClipName; time: number; w: number } | null;
  /** Each hand's eased goal (world) and weight. */
  handGoals: { x: number; y: number; z: number; w: number }[];
};

function canvasOf(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

export function createCricketScene(canvas: HTMLCanvasElement, config: CricketConfig, quality: Quality, onLoss: () => void, lightingChoice: Lighting | "ground" = "ground"): SceneDriver {
  const q = QUALITY[quality],
    light = LIGHTS[lightingFor(config.venue, lightingChoice)],
    scene = new T.Scene();
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: q.antialias,
    powerPreference: quality === "low" ? "low-power" : "high-performance",
    alpha: false,
  });
  let dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = light.exposure;
  renderer.shadowMap.enabled = !!q.shadows;
  renderer.shadowMap.type = quality === "ultra" ? T.PCFSoftShadowMap : T.PCFShadowMap;
  scene.background = new T.Color(light.fog);
  scene.fog = new T.Fog(light.fog, 150, 430);

  const camera = new T.PerspectiveCamera(40, 1, 0.08, 700);
  camera.position.set(0.8, 2.75, 15.6);
  scene.add(new T.HemisphereLight(light.hemiSky, light.hemiGround, light.hemi));
  const sun = new T.DirectionalLight(light.key, light.keyI);
  sun.position.set(...light.keyPos);
  sun.castShadow = !!q.shadows;
  if (q.shadows) {
    sun.shadow.mapSize.set(q.shadows, q.shadows);
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 30, bottom: -30, near: 1, far: 130 });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.03;
    sun.shadow.camera.updateProjectionMatrix();
  }
  scene.add(sun);

  const makeMat = (o: { color?: T.ColorRepresentation; map?: T.Texture; roughness?: number; metalness?: number; vertexColors?: boolean; side?: T.Side }) => {
    const { roughness, metalness, ...rest } = o;
    return q.standard ? new T.MeshStandardMaterial({ ...rest, roughness: roughness ?? 0.9, metalness: metalness ?? 0 }) : new T.MeshLambertMaterial(rest);
  };
  // Grass, seats and concrete fill most of the screen and gain little from physically based shading,
  // so only Ultra pays for it there. Players keep the richer material from Medium up.
  const makeEnvMat: typeof makeMat = (o) => {
    if (q.envStandard) return makeMat(o);
    const { roughness: _r, metalness: _m, ...rest } = o;
    return new T.MeshLambertMaterial(rest);
  };
  const stadium = buildStadium(config, quality, lightingChoice, renderer.capabilities.getMaxAnisotropy(), makeEnvMat);
  scene.add(stadium.group);
  const coin = buildCoin();
  scene.add(coin);
  const aim = new T.Mesh(new T.RingGeometry(0.18, 0.23, 32), new T.MeshBasicMaterial({ color: "#f3ca78", transparent: true, opacity: 0.7, depthWrite: false }));
  aim.rotation.x = -Math.PI / 2;
  scene.add(aim);

  // Kit materials. Close actors have their own named shirts; outfielders share a team kit.
  const roughnessCanvas = canvasOf(64);
  paintRoughness(roughnessCanvas.getContext("2d")!);
  const roughnessTex = new T.CanvasTexture(roughnessCanvas);
  const kitMaterial = (map: T.Texture) =>
    q.standard ? new T.MeshStandardMaterial({ map, roughnessMap: roughnessTex, roughness: 1, vertexColors: true }) : new T.MeshLambertMaterial({ map, vertexColors: true });
  const teamKits = [0, 1].map((team) => {
    const c = canvasOf(128);
    paintKit(c.getContext("2d")!, team, 7, false);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    return { tex, material: kitMaterial(tex) };
  });
  const actors: Actor[] = [];
  const spots = new Float32Array(PEOPLE * 2),
    holds = new Uint8Array(PEOPLE);
  let spacing = Infinity;
  const ballShown = new T.Vector3(),
    ballOffset = new T.Vector3();
  let ballHeld = false,
    ballTick = -1;
  for (let n = 0; n < ACTORS; n++) {
    const role: Role = n <= NON_STRIKER ? "bat" : n === BOWLER ? "bowl" : n === KEEPER ? "keeper" : n === UMPIRE ? "umpire" : "field";
    const close = n <= NON_STRIKER || n === BOWLER || n === KEEPER || n === UMPIRE;
    const team = n <= NON_STRIKER ? config.team : 1 - config.team;
    let material: T.Material, kit: T.Texture | null = null, kitCanvas: HTMLCanvasElement | null = null;
    if (close) {
      kitCanvas = canvasOf(256);
      paintKit(kitCanvas.getContext("2d")!, role === "umpire" ? -1 : team, n + 1, true);
      kit = new T.CanvasTexture(kitCanvas);
      kit.colorSpace = T.SRGBColorSpace;
      material = kitMaterial(kit);
    } else material = teamKits[team]!.material;
    const a = buildAthlete(role, n + 1, team, close ? q.closeDetail : q.detail, material);
    a.mesh.castShadow = !!q.shadows && (close || quality === "ultra");
    scene.add(a.root);
    actors.push({ a, planter: new FootPlanter(), target: makePose(), from: makePose(), out: makePose(), clip: "", fadeAt: -10, action: "ready", actionTick: 0, prev: v3(NaN), prevTick: -1, speed: 0, facing: 0, number: n + 1, team, kit, kitCanvas, memo: newMemo(), carry: { x: 0, z: 0 }, steps: new StepFeet(), freeAt: 0, planPose: null, fadePose: null, handGoals: [0, 1].map(() => ({ x: 0, y: 0, z: 0, w: 0 })) });
  }
  const captains = [0, 1].map(team => {
    const a = buildAthlete("field", 1, team, q.closeDetail, teamKits[team]!.material);
    a.root.visible = false; a.mesh.castShadow = !!q.shadows; scene.add(a.root);
    return { a, pose: makePose() } as { a: Athlete; pose: Pose; body?: RealisticBody };
  });

  // ---- realistic bodies -------------------------------------------------------
  // The procedural bodies show until the squad has loaded, and stay if it can't.
  // Close players get the detailed athletes on High and Ultra; everyone else, and
  // everyone on Low and Medium, gets the light ones.
  let kits: KitMaterials | null = null;
  const equipment = equipmentKit();
  const closeDetail = quality === "high" || quality === "ultra";
  let realisticReady = false;
  let motionLibrary: MotionLibrary | null = null;
  // Only the squad models this match shows are downloaded, at the detail each player needs.
  const isClose = (n: number) => n <= NON_STRIKER || n === BOWLER || n === KEEPER || n === UMPIRE;
  // Each slot's person (squad model and appearance) is fixed now, from the slot's
  // starting role, number and team. Numbers and teams change between innings
  // (setKit) and the models can finish loading after that, so the bodies must be
  // dressed from this record, never from the slot's current number.
  const people = squadPeople([...actors.map((actor) => ({ role: actor.a.role, number: actor.number, team: actor.team })), ...captains.map((c, team) => ({ role: c.a.role, number: 1, team }))]),
    slots = people.slice(0, actors.length),
    captainSlots = people.slice(actors.length);
  const hiNeed: number[] = [],
    loNeed: number[] = [];
  for (const [n, slot] of slots.entries()) (closeDetail && isClose(n) ? hiNeed : loNeed).push(slot.model);
  for (const slot of captainSlots) (closeDetail ? hiNeed : loNeed).push(slot.model);
  Promise.all([loadSquad("lo", loNeed), closeDetail ? loadSquad("hi", hiNeed) : Promise.resolve(null), loadMotion().catch((error) => (console.warn("motion clips unavailable; using built-in motion", error), null))])
    .then(([lo, hi, motion]) => {
      if (disposed) return;
      kits = new KitMaterials();
      const wear = (a: Athlete, slot: { model: number; identity: string; appearance: Appearance }, team: number, close: boolean, cast: boolean) => {
        const detail = close && hi ? "hi" : "lo",
          squad = detail === "hi" ? hi! : lo,
          source = squad[slot.model];
        if (!source) throw new Error(`squad model ${slot.model} (${slot.identity}) was not loaded at ${detail} detail`);
        // The same player looks the same in every match and replay.
        const body = new RealisticBody(source, a, kits!, a.role === "umpire" ? -1 : team, { appearance: slot.appearance, antialias: !!q.antialias, detail });
        equipment.dress(body, a.role, team, a.bones.bat, cast);
        body.setShadows(cast);
        return body;
      };
      for (const [n, actor] of actors.entries()) actor.body = wear(actor.a, slots[n]!, actor.team, isClose(n), actor.a.mesh.castShadow);
      for (const [team, c] of captains.entries()) c.body = wear(c.a, captainSlots[team]!, team, true, c.a.mesh.castShadow);
      if (motion) {
        motionLibrary = motion;
        for (const [n, actor] of actors.entries()) if (actor.body && actor.a.role !== "umpire") actor.motion = new MotionPlayer(motion, RIG.thigh + RIG.shin, n * 31 + actor.team);
      }
      realisticReady = true;
    })
    .catch((error) => console.warn("realistic athletes unavailable; using built-in bodies", error));

  // Ground contact shadows for everyone and the ball: one instanced draw.
  const blobTex = (() => {
    const c = canvasOf(64),
      x = c.getContext("2d")!,
      g = x.createRadialGradient(32, 32, 3, 32, 32, 31);
    g.addColorStop(0, "rgba(0,10,14,.5)");
    g.addColorStop(1, "rgba(0,10,14,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  })();
  const blobGeo = new T.PlaneGeometry(1, 1);
  blobGeo.rotateX(-Math.PI / 2);
  const blobs = new T.InstancedMesh(blobGeo, new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }), ACTORS + 1);
  blobs.frustumCulled = false;
  scene.add(blobs);
  const dummy = new T.Object3D();

  // Stumps and bails.
  const wood = makeMat({ color: "#e7d6a8", roughness: 0.6 });
  const stumpGeo = new T.CylinderGeometry(0.0165, 0.0185, 0.7112, 8);
  const nearStumps = new T.Group(),
    farStumps = new T.Group(),
    stumpMeshes: T.Mesh[] = [];
  for (const [group, z] of [[farStumps, -STUMPS_Z], [nearStumps, STUMPS_Z]] as const) {
    group.position.z = z;
    scene.add(group);
    for (const x of [-0.0762, 0, 0.0762]) {
      const m = new T.Mesh(stumpGeo, wood);
      m.position.set(x, 0.3556, 0);
      m.castShadow = !!q.shadows;
      group.add(m);
      if (z > 0) stumpMeshes.push(m);
    }
  }
  const bailGeo = new T.CylinderGeometry(0.008, 0.008, 0.081, 6);
  const bails: T.Mesh[] = [];
  for (const z of [-STUMPS_Z, STUMPS_Z])
    for (const x of [-0.038, 0.038]) {
      const bail = new T.Mesh(bailGeo, wood);
      bail.rotation.z = Math.PI / 2;
      bail.position.set(x, 0.718, z);
      scene.add(bail);
      if (z > 0) bails.push(bail);
    }

  // Ball with a real seam, plus a fading trail that doesn't glow.
  const ballTex = (() => {
    const c = canvasOf(128),
      x = c.getContext("2d")!;
    x.fillStyle = "#f5efe2";
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = "#b9b09c";
    x.fillRect(0, 58, 128, 12);
    x.fillStyle = "#3a5c46";
    for (let n = 0; n < 128; n += 6) {
      x.fillRect(n, 56, 3, 3);
      x.fillRect(n + 2, 69, 3, 3);
    }
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  })();
  const ball = new T.Mesh(new T.SphereGeometry(0.04, 14, 10), new T.MeshStandardMaterial({ map: ballTex, roughness: 0.42 }));
  const ballMesh = ball;
  ball.castShadow = !!q.shadows;
  scene.add(ball);
  const TRAIL = 22,
    trailPos = new Float32Array(TRAIL * 3),
    trailCol = new Float32Array(TRAIL * 4);
  for (let n = 0; n < TRAIL; n++) {
    trailCol.set([1, 0.96, 0.82, (n / TRAIL) ** 2 * 0.55], n * 4);
  }
  const trailGeo = new T.BufferGeometry();
  trailGeo.setAttribute("position", new T.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute("color", new T.BufferAttribute(trailCol, 4));
  const trail = new T.Line(trailGeo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
  trail.frustumCulled = false;
  scene.add(trail);
  const history: number[] = [];

  // Dust puffs: a fixed pool, nothing allocated while playing.
  const DUST = q.particles,
    dustPos = new Float32Array(DUST * 3).fill(-50),
    dustVel = new Float32Array(DUST * 3),
    dustLife = new Float32Array(DUST);
  const dustGeo = new T.BufferGeometry();
  dustGeo.setAttribute("position", new T.BufferAttribute(dustPos, 3));
  const dustTex = (() => {
    const c = canvasOf(32),
      x = c.getContext("2d")!,
      g = x.createRadialGradient(16, 16, 1, 16, 16, 15);
    g.addColorStop(0, "rgba(232,216,178,.75)");
    g.addColorStop(1, "rgba(232,216,178,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
    return new T.CanvasTexture(c);
  })();
  const dust = new T.Points(dustGeo, new T.PointsMaterial({ map: dustTex, size: 0.55, transparent: true, depthWrite: false, opacity: 0.8 }));
  dust.frustumCulled = false;
  scene.add(dust);
  let dustNext = 0;
  const puff = (x: number, y: number, z: number, n: number, spread = 1) => {
    for (let i = 0; i < n; i++) {
      const k = dustNext++ % DUST,
        a = (dustNext * 2.399) % 6.283,
        s = (0.25 + ((dustNext * 7) % 10) * 0.08) * spread;
      dustPos.set([x, y, z], k * 3);
      dustVel.set([Math.cos(a) * s, 0.5 + ((dustNext * 3) % 10) * 0.07, Math.sin(a) * s], k * 3);
      dustLife[k] = 0.7;
    }
  };

  // ---------------------------------------------------------------------------
  const camTarget = v3(0, 1, -4),
    tmp = v3(),
    tmp2 = v3();
  let lastTick = -1,
    lastTime = 0,
    disposed = false,
    width = 0,
    height = 0,
    deadAt = -1,
    wasDead = false,
    wicketKick = 0,
    contactSeen = false,
    shotName = "",
    excite = 0,
    contactError: number | undefined,
    releaseError: number | undefined,
    gripError = 0,
    footSlip = 0,
    snapCamera = true,
    frameNo = 0,
    prevBallY = 0,
    prevBallVy = 0;
  const frozenImpact: Vec3 = [0, 0, 0];
  let impactFrozen = false;
  // Batting presentation: the ball's measured approach speed, the expected arrival
  // at the bat, the closest it passed the bat, and the bat being drawn (for blends).
  let ballMemo = { tick: -1, z: 0 },
    approach = 0,
    arrivalEst = -1,
    passGap = Infinity,
    strikerBat: BatPose | null = null,
    strikerInput: BattingInput | null = null,
    batFrom: BatPose | null = null,
    batFadeAt = -10,
    lastBat: BatPose | null = null;
  const contactPose = makePose();
  // Fielding: the ball's velocity from successive ticks, where the fielders started this
  // ball, display carries, the tick the ball died, and measured hand-to-ball distances.
  const kin: BallKin = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rolling: false };
  let kinMemo = { tick: -1, x: 0, y: 0, z: 0 },
    prevBall = { x: 0, y: 0, z: 0 },
    prevBallTick = -1,
    deadTick = -1,
    takeError: number | undefined,
    takeMove = "",
    cinema = 1,
    cinemaCatch = false;
  /** One-shot clip lengths for the fielding planner (made once, not per fielder per frame). */
  const clipLength = (clip: OneShot) => motionLibrary?.info.get(clip)?.duration ?? 1;
  const starts: Spot[] = Array.from({ length: 11 }, () => ({ x: 0, z: 0 })),
    carries = new Float32Array(PEOPLE * 2),
    poseTmp = makePose(),
    goalTmp = v3();
  const planted = [v3(NaN), v3(NaN)];
  let plantResets = 0;

  const onContextLost = (event: Event) => {
    event.preventDefault();
    if (!disposed) onLoss();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  const resize = () => {
    if (disposed) return;
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h || (w === width && h === height)) return;
    width = w;
    height = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Pixels are the main cost on a slow GPU: each level caps the rendered width as well as the ratio.
    dpr = Math.min(window.devicePixelRatio || 1, q.dpr, q.maxWidth / w);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const setKit = (actor: Actor, n: number, team: number, number: number) => {
    if (n === UMPIRE || (actor.team === team && actor.number === number)) return;
    if (actor.kit && actor.kitCanvas) {
      paintKit(actor.kitCanvas.getContext("2d")!, team, number, true);
      actor.kit.needsUpdate = true;
    } else actor.a.mesh.material = teamKits[team]!.material;
    actor.body?.setTeam(team);
    actor.team = team;
    actor.number = number;
  };

  /** Writes a clip (with a short crossfade from whatever played before) into `out`. */
  /** Everything the batting animation needs about this ball, in the striker's root space. */
  const strikerFrame = (actor: Actor, px: number, pz: number, feed: SceneFeed, tick: number, hit: boolean, contactTick: number, style: BowlingStyle, preMatch: boolean): BattingInput => {
    const s = actor.a.look.scale,
      local = (wx: number, wy: number, wz: number): Vec3 => [-(wz - pz) / s, wy / s, (wx - px) / s],
      shot = feed.shot,
      // Before a human swings, their selected shot is the plan the body prepares for.
      plan = shot ?? (feed.humanBatting && !feed.replay && !preMatch ? (feed.intent ?? null) : null),
      ball = feed.frame.ball,
      line = 8.8 - (plan?.foot ?? 0) * 0.45;
    // When the ball reaches the bat: known in replays, otherwise from its measured speed.
    if (feed.arrivalTick !== undefined) arrivalEst = feed.arrivalTick;
    else if (tick > RELEASE_TICK + 2 && approach > 2 && ball.z < line) {
      const est = tick + (line - ball.z) / approach / STEP;
      arrivalEst = arrivalEst < 0 ? est : arrivalEst + (est - arrivalEst) * 0.35;
    } else if (arrivalEst < 0 || tick <= RELEASE_TICK) arrivalEst = RELEASE_TICK + FLIGHT_TICKS[style];
    const batX = plan ? Math.sin((plan.direction * Math.PI) / 180) * 0.45 + plan.face * 0.55 : 0;
    if (tick > RELEASE_TICK && Math.abs(ball.z - line) < 0.3) passGap = Math.min(passGap, Math.abs(ball.x - batX));
    const met = feed.contactPoint ?? null,
      contacted = contactTick >= 0 && !!met;
    let E = contacted ? contactTick : arrivalEst;
    if (shot && !contacted) E = Math.max(E, shot.tick + 1);
    // Where the bat meets the ball: the engine's contact point, or the line the batter chose.
    let impact: Vec3;
    if (contacted) impact = local(met!.x, met!.y, met!.z);
    else {
      const h = plan ? SHOT_HEIGHTS[plan.kind] : 0.6,
        near = clamp01(1 - Math.abs(ball.z - line) / 1.1) * 0.6;
      impact = local(batX + (ball.x - batX) * near, h + (ball.y - h) * near, line);
    }
    const gap = feed.passLateral ?? passGap,
      edgeSide: ContactKind = met && met.x > batX ? "outside-edge" : "inside-edge";
    const contact: ContactKind = contacted ? (feed.edge ? edgeSide : "clean") : shot && tick > E + 1 ? (gap < 0.45 ? "beaten" : "miss") : "pending";
    // Eyes: the bowler's hand, then the ball; after contact, off the bat after it.
    let look: Vec3;
    if (tick < RELEASE_TICK - 4) look = local(0.55, 2.0, -8.5);
    else if (contacted && tick > contactTick) {
      const u = clamp01(((tick - contactTick) * STEP) / 0.3);
      look = local(met!.x + (ball.x - met!.x) * u, met!.y + (ball.y - met!.y) * u, met!.z + (ball.z - met!.z) * u);
    } else look = local(ball.x, ball.y, ball.z);
    const number = feed.actorNumbers?.[STRIKER] ?? actor.number;
    return {
      tick,
      plan,
      shotTick: shot ? shot.tick : null,
      contactTick: E,
      contact,
      impact,
      look,
      style: batterStyle(number * 31 + feed.battingTeam * 7),
      lateLeave: !shot && feed.humanBatting && !feed.replay && tick > E + 2,
    };
  };

  const resolve = (actor: Actor, name: string, wall: number, reduced: boolean) => {
    if (actor.clip !== name) {
      actor.from.set(actor.out);
      actor.clip = name;
      actor.fadeAt = reduced ? -10 : wall;
    }
    const w = clamp01((wall - actor.fadeAt) / 0.16);
    if (w < 1) blendPose(actor.from, actor.target, w, actor.out);
    else actor.out.set(actor.target);
  };

  /** Converts a world point to root space for an actor about to be posed. */
  const toLocal = (actor: Actor, x: number, y: number, z: number) => {
    const s = actor.a.look.scale,
      dx = x - actor.a.root.position.x,
      dz = z - actor.a.root.position.z,
      c = Math.cos(actor.a.root.rotation.y),
      si = Math.sin(actor.a.root.rotation.y);
    return [(dx * c - dz * si) / s, y / s, (dx * si + dz * c) / s] as const;
  };
  const setHand = (p: Pose, left: boolean, x: number, y: number, z: number, w: number) => {
    const X = left ? CH.lHandX : CH.rHandX;
    p[X] = p[X]! + (x - p[X]!) * w;
    p[X + 1] = p[X + 1]! + (y - p[X + 1]!) * w;
    p[X + 2] = p[X + 2]! + (z - p[X + 2]!) * w;
  };
  const gaitInto = (actor: Actor) => {
    const p = actor.target,
      root = actor.a.root.position,
      s = actor.a.look.scale;
    actor.planter.update(root.x, root.z, actor.facing, actor.speed);
    applyGait(p, actor.planter.phase, actor.speed);
    const f = actor.planter.feet,
      c = Math.cos(actor.facing),
      si = Math.sin(actor.facing);
    for (let k = 0; k < 2; k++) {
      const dx = f[k]!.x - root.x,
        dz = f[k]!.z - root.z,
        X = k === 0 ? CH.lFootX : CH.rFootX;
      p[X] = (dx * c - dz * si) / s;
      p[X + 1] = RIG.ankle + f[k]!.y;
      p[X + 2] = (dx * si + dz * c) / s;
    }
    p[CH.hipZ] = 0;
    p[CH.hipX] = 0;
    p[CH.roll] = 0;
    p[CH.headY] = 0;
    p[CH.headZ] = 0;
  };

  return {
    draw(feed) {
      if (disposed) return;
      const { frame, shot, outcome } = feed;
      resize();
      const wall = feed.time,
        dt = Math.max(0, Math.min(0.1, wall - lastTime));
      lastTime = wall;
      frameNo++;
      const tick = frame.tick;
      const rewound = tick < lastTick - 0.001 || tick === 0;
      if (rewound) {
        history.length = 0;
        contactSeen = false;
        impactFrozen = false;
        approach = 0;
        arrivalEst = -1;
        passGap = Infinity;
        wicketKick = 0;
        if (tick < lastTick) for (const actor of actors) actor.prev.set(NaN, NaN, NaN);
        for (const actor of actors) {
          actor.memo = newMemo();
          actor.carry.x = actor.carry.z = 0;
          actor.planPose = actor.fadePose = null;
          for (const h of actor.handGoals) h.w = 0;
        }
        takeError = undefined;
        // Slow motion belongs to the live moment: a rewind or a scrub starts at normal pace.
        cinema = 1;
        cinemaCatch = false;
      }
      const dead = !!outcome && frame.mode === "dead";
      if (dead && !wasDead) deadAt = wall;
      if (dead && (!wasDead || deadTick < 0)) deadTick = tick;
      if (!dead) deadTick = -1;
      if (!dead) deadAt = -1;
      const deadAge = dead ? wall - deadAt : -1;
      const contactTick = feed.contactTick ?? (frame.contact ? tick : -1);
      const hit = frame.contact && (contactTick < 0 || tick >= contactTick);
      const running = frame.runner % 1 > 0.0001;
      const style = bowlingStyle(feed.variation ?? undefined);
      // The ball's approach speed, measured from successive ticks, for when it will reach the bat.
      if (tick !== ballMemo.tick) {
        const step = tick - ballMemo.tick;
        if (step > 0 && step <= 8 && tick > RELEASE_TICK + 1 && frame.ball.z > ballMemo.z) approach = (frame.ball.z - ballMemo.z) / (step * STEP);
        ballMemo = { tick, z: frame.ball.z };
      }
      // The ball's velocity from successive ticks: where it's going, for fielders to anticipate.
      if (tick !== kinMemo.tick) {
        const span = (tick - kinMemo.tick) * STEP;
        prevBall = { x: kinMemo.x, y: kinMemo.y, z: kinMemo.z };
        prevBallTick = kinMemo.tick;
        if (span > 0 && span < 0.12 && !rewound) {
          kin.vx = (frame.ball.x - kinMemo.x) / span;
          kin.vy = (frame.ball.y - kinMemo.y) / span;
          kin.vz = (frame.ball.z - kinMemo.z) / span;
        } else if (span <= 0 || rewound) kin.vx = kin.vy = kin.vz = 0;
        kinMemo = { tick, x: frame.ball.x, y: frame.ball.y, z: frame.ball.z };
      }
      kin.x = frame.ball.x;
      kin.y = frame.ball.y;
      kin.z = frame.ball.z;
      kin.rolling = frame.ball.y < 0.09 && Math.abs(kin.vy) < 0.6;
      kin.bounced = frame.bounce;
      // Where the eleven stood for this ball (they're still until it's struck).
      if (tick <= RELEASE_TICK) frame.fielders.forEach((f, k) => ((starts[k]!.x = f.x), (starts[k]!.z = f.z)));
      const returnAge = dead && !outcome?.wicket && !feed.result && deadTick >= 0 ? deadAge - 1.6 : -1;
      // Carries ease back to nothing as everyone walks back.
      for (let n = 0; n < ACTORS; n++) {
        const fade = returnAge > 0 ? Math.max(0, 1 - returnAge / 1.2) : 1;
        carries[n * 2] = actors[n]!.carry.x * fade;
        carries[n * 2 + 1] = actors[n]!.carry.z * fade;
      }
      const moment: MatchMoment = { tick, outcome: dead ? outcome : null, deadAge, contact: hit, result: feed.result ?? null };
      const wicket = dead ? (outcome?.wicket ?? null) : null;
      const ceremony = feed.ceremony;
      const preMatch = ceremony && ceremony.stage !== "done" && ceremony.stage !== "entry";
      for (const captain of captains) captain.a.root.visible = !!preMatch && ceremony.stage !== "lineups";
      coin.visible = !!preMatch && !["stadium", "lineups", "captains"].includes(ceremony.stage);
      if (coin.visible && ceremony) {
        const c = coinPose(ceremony);
        coin.position.set(c.x, c.y, c.z); coin.rotation.set(c.rx, 0, c.rz);
      }
      aim.visible = !!feed.aim && !preMatch && tick === 0;
      if (feed.aim) aim.position.set(feed.aim.line, 0.025, 10.0584 - feed.aim.length);

      // ---- where everyone stands this frame ------------------------------------
      // Display positions only: lanes and separation live in spacing.ts and never
      // write to the fielders or the match.
      place(
        {
          tick,
          style,
          runner: frame.runner,
          batterGroundZ: frame.batterGroundZ,
          bowlerFootZ: frame.bowlerFootZ,
          fielders: frame.fielders,
          actions: frame.actions,
          travel: frame.travel,
          huddleAge: dead && wicket ? deadAge - 1.1 : -1,
          dismissedStriker: outcome?.dismissed === "striker",
          entry: ceremony?.stage === "entry" ? clamp01(ceremony.age / 2.4) : -1,
          keepClear: !preMatch || ceremony?.stage === "entry",
          starts: preMatch ? undefined : starts,
          returnAge,
          offsets: carries,
        },
        spots,
        holds,
      );
      spacing = closestPair(spots, ACTORS);

      for (let n = 0; n < ACTORS; n++) {
        const actor = actors[n]!,
          a = actor.a;
        a.bones.bat.scale.setScalar(1);
        a.root.visible = !preMatch || ceremony?.stage === "lineups" && n < 11 || n === UMPIRE && ceremony?.stage !== "lineups";
        if (n < BOWLER + 2) setKit(actor, n, n <= NON_STRIKER ? feed.battingTeam : 1 - feed.battingTeam, feed.actorNumbers?.[n] ?? actor.number);
        // Outfielders can update on alternate frames on the lowest preset.
        if (q.fielderEvery > 1 && n >= 2 && n < BOWLER && n % 2 !== frameNo % 2 && actor.clip) continue;

        // ---- where this actor is: placed and kept clear of others above --------
        const px = spots[n * 2]!,
          pz = spots[n * 2 + 1]!,
          fielding = n > NON_STRIKER && n !== UMPIRE,
          simAction: Fielder["action"] = fielding ? (frame.actions[n - 2] ?? "ready") : "ready",
          travel = fielding ? (frame.travel[n - 2] ?? 0) : 0;

        // ---- movement bookkeeping ---------------------------------------------
        const dTick = tick - actor.prevTick;
        if (!Number.isFinite(actor.prev.x) || dTick < 0 || actor.prev.distanceTo(tmp.set(px, 0, pz)) > 4) {
          actor.prev.set(px, 0, pz);
          actor.speed = 0;
          actor.planter.reset(px, pz, actor.facing);
        }
        const dx = px - actor.prev.x,
          dz = pz - actor.prev.z,
          moved = Math.hypot(dx, dz);
        if ((ceremony?.stage === "entry" || dead && wicket && deadAge > 1.1) && dt > 0) actor.speed = moved / dt;
        else if (dTick > 0) {
          const measured = moved / (dTick * STEP) * (n === BOWLER && tick < RELEASE_TICK ? 0.28 : 1);
          actor.speed += (measured - actor.speed) * Math.min(1, dTick * 0.12);
        }
        const moving = actor.speed > 0.35;
        // Ground speed for the motion clips: the simulation's own movement, not the gait's.
        if (dTick < 0 || !Number.isFinite(actor.ground ?? 0)) actor.ground = 0;
        else if (dTick > 0) actor.ground = (actor.ground ?? 0) + (moved / (dTick * STEP) - (actor.ground ?? 0)) * Math.min(1, dTick * 0.2);
        if (simAction !== actor.action) {
          // Where the ball was when the engine's take happened. A pickup moves the
          // simulated ball onto the fielder, so it's taken from the tick before.
          if (fielding && (simAction === "pickup" || (simAction === "dive" && actor.action !== "dive" && !dead)))
            // Only a frame or two back is where it was taken; after a jump (a replay scrub) use the hands' own read.
            actor.memo.took =
              tick - prevBallTick <= 4 ? [prevBall.x, Math.max(0.05, prevBall.y), prevBall.z] : actor.memo.goal ? [...actor.memo.goal] : [frame.ball.x, 0.06, frame.ball.z];
          else if (fielding && (simAction === "catch" || simAction === "drop" || simAction === "dive")) actor.memo.took = [frame.ball.x, frame.ball.y, frame.ball.z];
          // How close the hands' read was to where the ball was actually taken (the keeper's own read for a delivery).
          const read = n === KEEPER && simAction === "catch" && !hit ? actor.memo.glove : actor.memo.goal;
          if (fielding && actor.memo.took && read && simAction !== "throw" && simAction !== "run") {
            takeError = Math.hypot(read[0] - actor.memo.took[0], read[1] - actor.memo.took[1], read[2] - actor.memo.took[2]);
            takeMove = n === KEEPER && !hit ? `keeper-${simAction}` : simAction;
          }
          actor.action = simAction;
          actor.actionTick = tick;
        }
        if (tick < actor.actionTick) actor.actionTick = tick;
        const actionAge = Math.max(0, tick - actor.actionTick) * STEP;

        // ---- fielding and keeping: anticipate the ball, take it, release it ------
        let plan: FieldPlan | null = null;
        const asFielder = fielding && !preMatch && (n !== BOWLER || tick > RELEASE_TICK + 40 || travel > 0.02);
        const involved = simAction !== "ready" || travel > 0.05;
        // Only fielders on the ball (and the keeper) have anything to plan; the rest cost nothing.
        if (asFielder && (n === KEEPER || involved || tick < RELEASE_TICK)) {
          const input = {
            tick,
            action: simAction,
            actionAge,
            dead,
            deadAge,
            outcome: dead ? outcome : null,
            contact: hit,
            mode: frame.mode,
            me: { x: px - actor.carry.x, z: pz - actor.carry.z, speed: actor.ground ?? 0 },
            ball: kin,
            friction: VENUES[config.venue].friction,
            involved,
            rope: ropeRatio({ x: px, z: pz }, config.venue),
            length: clipLength,
            throwRelease: motionLibrary?.info.get("OverhandThrow")?.release ?? 0.6,
            contactTick: hit ? contactTick : -1,
          };
          plan =
            n === KEEPER
              ? keeperPlan({ ...input, wicket, directHit: frame.mode === "throw" && Math.abs(frame.ball.x) < 0.6 && Math.hypot(frame.ball.x - px, frame.ball.z - pz) > 1.2 }, actor.memo, Math.max(1e-3, dt))
              : fielderPlan(input, actor.memo, Math.max(1e-3, dt));
        }
        actor.field = plan;
        // The body steps into a take: its display carries towards the ball, at a human pace.
        if (fielding && n !== KEEPER) {
          const hand = plan?.right ?? plan?.left;
          let wx = 0,
            wz = 0;
          if (hand && hand.w > 0.01) {
            const reach = plan!.move === "dive" || plan!.move === "dive-stop" ? 1.25 : plan!.move === "slide-pickup" ? 0.9 : plan!.move.startsWith("catch") ? 0.4 : 0.6,
              ex = px - actor.carry.x,
              ez = pz - actor.carry.z,
              far = Math.hypot(hand.x - ex, hand.z - ez),
              excess = Math.min(0.6, Math.max(0, far - reach)) * hand.w;
            if (far > 1e-3) {
              wx = ((hand.x - ex) / far) * excess;
              wz = ((hand.z - ez) / far) * excess;
            }
          } else if (dead || simAction === "throw" || simAction === "pickup") {
            wx = actor.carry.x;
            wz = actor.carry.z;
          }
          const step = 2.5 * dt,
            cx = wx - actor.carry.x,
            cz = wz - actor.carry.z,
            len = Math.hypot(cx, cz);
          const k = len > step ? step / len : 1;
          actor.carry.x += cx * k;
          actor.carry.z += cz * k;
        }

        // ---- end of the ball: reactions in character, varied, the same in replays --
        let react: Reaction | null = null,
          reacting = false;
        if (!dead || deadAge < 0.05) actor.freeAt = 0;
        if (dead && outcome && deadAge >= 0 && n !== UMPIRE && !preMatch) {
          const took = wicket === "caught" && (simAction === "catch" || simAction === "dive");
          const role: ReactionRole = took ? "taker" : n === STRIKER ? "striker" : n === NON_STRIKER ? "non-striker" : n === BOWLER ? "bowler" : n === KEEPER ? "keeper" : wicket === "run-out" && simAction === "throw" ? "thrower" : "fielder";
          // Still busy with the ball: finishing a catch, a stumping, getting up off the turf.
          const busy = (!!plan && plan.move !== "idle" && plan.move !== "keeper-rise") || (simAction === "dive" && deadAge < 1.2 + (motionLibrary?.info.get("LayToIdle")?.duration ?? 1.5));
          if (busy) actor.freeAt = deadAge;
          else {
            // A catcher who dived starts celebrating once up, not from when the ball died.
            react = reaction(role, outcome, deadAge - actor.freeAt, feed.actorNumbers?.[n] ?? actor.number, deadTick, feed.result ?? null);
            reacting = n > NON_STRIKER || !!react;
          }
        }

        // ---- facing -----------------------------------------------------------
        let want: number;
        if (plan?.face) want = Math.atan2(plan.face.x - px, plan.face.z - pz);
        else if ((ceremony?.stage === "entry" || dead && wicket && deadAge > 1.1 || returnAge > 0 && fielding) && moving) want = Math.atan2(dx, dz);
        // A fielder with the ball turns to throw at the stumps the engine throws to.
        else if (n >= 2 && n < UMPIRE && n !== KEEPER && (simAction === "pickup" || simAction === "throw")) want = Math.atan2(-px, STUMPS_Z - pz);
        else if (n === STRIKER && !running && frame.runner === 0) want = Math.PI / 2;
        else if (moved > 0.002 && moving && (n === BOWLER || n <= NON_STRIKER || actor.speed > 2.2)) want = Math.atan2(dx, dz);
        else if (n === UMPIRE) want = 0;
        else if (n === NON_STRIKER) want = frame.runner % 2 < 1 ? 0 : Math.PI;
        else if (n === STRIKER) want = frame.runner % 2 < 1 ? Math.PI : 0;
        else if (n === KEEPER && !hit) want = Math.PI;
        else want = Math.atan2(frame.ball.x - px, frame.ball.z - pz);
        const diff = ((want - actor.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        // Bodies turn at a human rate: quick on the spot, slower at a sprint.
        const turnRate = (actor.ground ?? 0) > 3 ? 4.5 : 8.5;
        const turned = feed.reducedMotion ? diff : Math.max(-turnRate * dt, Math.min(turnRate * dt, diff * Math.min(1, dt * 9)));
        actor.facing += turned;
        actor.turnLeft = diff - turned;
        actor.turnRate = dt > 0 ? (actor.turnRate ?? 0) + (turned / dt - (actor.turnRate ?? 0)) * Math.min(1, dt * 10) : 0;
        a.root.position.set(px, 0, pz);
        a.root.rotation.y = actor.facing;
        actor.prev.set(px, 0, pz);
        actor.prevTick = tick;

        // ---- motion clips for the realistic body (presentation only) ------------
        if (actor.motion && motionLibrary) {
          const g = actor.ground ?? 0,
            throwInfo = motionLibrary.info.get("OverhandThrow")!,
            fielder = n >= 2 && n !== UMPIRE && (n !== BOWLER || tick > RELEASE_TICK + 40);
          let lower = 0,
            upper = 0,
            shot: { clip: OneShot; time: number; weight: number } | null = null;
          if (fielder && !reacting && (simAction === "pickup" || simAction === "throw")) {
            // The clip's release lands on the engine's release tick (38 ticks after pickup).
            const time = simAction === "pickup" ? throwInfo.release - 38 * STEP + actionAge : throwInfo.release + actionAge;
            actor.throwClock = time;
            shot = { clip: "OverhandThrow", time, weight: simAction === "pickup" ? clamp01(actionAge / 0.12) : 1 };
            lower = upper = 1;
          } else if (!reacting && actor.throwClock !== undefined && actor.throwClock < throwInfo.duration) {
            // Follow-through finishes after the ball has gone.
            actor.throwClock += dt;
            shot = { clip: "OverhandThrow", time: actor.throwClock, weight: clamp01((throwInfo.duration - actor.throwClock) / 0.3) };
            lower = upper = 1;
          } else {
            actor.throwClock = undefined;
            const chasing = fielder && g > 0.45 && (simAction === "run" || simAction === "ready"),
              walking = (ceremony?.stage === "entry" || (dead && !!wicket && deadAge > 1.1)) && g > 0.3 && simAction !== "dive",
              runUp = n === BOWLER && tick > 0 && tick < RELEASE_TICK - GATHER[style] / STEP - 6,
              batterRun = (n === STRIKER || n === NON_STRIKER) && running && g > 0.45;
            const recovering = fielder && simAction === "dive" && dead && deadAge > 1.2,
              getUp = motionLibrary.info.get("LayToIdle")!,
              boundaryCheer = n === NON_STRIKER && dead && !!outcome?.boundary && deadAge > 0.4 && deadAge < 0.4 + motionLibrary.info.get("Yes")!.duration;
            if (recovering && deadAge - 1.2 < getUp.duration + 0.3) {
              // Up off the turf after a dive, rather than lying there or snapping upright.
              shot = { clip: "LayToIdle", time: deadAge - 1.2, weight: clamp01((deadAge - 1.2) / 0.25) * clamp01((getUp.duration + 0.3 - (deadAge - 1.2)) / 0.3) };
              lower = upper = 1;
            } else if (boundaryCheer) {
              // The non-striker acknowledges a boundary: a thumbs-up, from a standstill.
              shot = { clip: "Yes", time: deadAge - 0.4, weight: clamp01((deadAge - 0.4) / 0.2) };
              upper = 1;
            } else if (chasing || walking || runUp) lower = upper = 1;
            else if (batterRun) lower = 1; // legs run; arms keep the bat
          }
          if (plan?.motion && !reacting) {
            lower = plan.motion.lower;
            upper = plan.motion.upper;
            shot = plan.motion.shot;
            if (shot?.clip !== "OverhandThrow") actor.throwClock = undefined;
          }
          if (react?.kind === "clip") {
            const len = motionLibrary.info.get(react.clip)!.duration;
            shot = { clip: react.clip, time: react.loop ? ((react.time % len) + len) % len : react.time, weight: clamp01(react.time / 0.25 + (react.loop ? 1 : 0)) };
            upper = 1;
            if (!react.upper) lower = 1;
          }
          const k = feed.reducedMotion ? 1 : Math.min(1, dt * (plan?.motion ? 14 : 7));
          actor.motionLower = (actor.motionLower ?? 0) + (lower - (actor.motionLower ?? 0)) * k;
          actor.motionUpper = (actor.motionUpper ?? 0) + (upper - (actor.motionUpper ?? 0)) * k;
          // Into a turn the head and chest lead and the body leans with speed (presentation only).
          const twist = feed.reducedMotion ? 0 : Math.max(-0.55, Math.min(0.55, actor.turnLeft ?? 0)) * clamp01(g / 1.5),
            lean = feed.reducedMotion ? 0 : Math.max(-0.2, Math.min(0.2, -(actor.turnRate ?? 0) * g * 0.025));
          actor.plan = actor.motionLower > 0.01 || actor.motionUpper > 0.01 ? { speed: g, shot, lower: actor.motionLower, upper: actor.motionUpper, twist, lean } : null;
        }

        // ---- which clip -------------------------------------------------------
        const p = actor.target;
        let sel: Selection | "gait" | "bat" | "delivery";
        if (n === STRIKER) {
          const dismissedStriker = !!outcome?.wicket && outcome.dismissed === "striker";
          sel = frame.runner > 0 && !running && !dead ? { clip: "idle", time: wall } : selectStriker({ ...moment, running, shot, edge: !!feed.edge, dismissedStriker });
        } else if (n === NON_STRIKER) sel = selectNonStriker({ ...moment, running, dismissedNonStriker: !!outcome?.wicket && outcome.dismissed === "non-striker" });
        else if (n === UMPIRE) sel = selectUmpire(moment);
        else if (n === BOWLER) sel = selectBowler({ ...moment, style, chasing: travel > 0.02, action: simAction, actionAge, moving, ballY: frame.ball.y, wicket });
        else if (n === KEEPER) sel = selectKeeper({ ...moment, action: simAction, actionAge, moving, ballZ: frame.ball.z, ballY: frame.ball.y, wicket });
        else sel = selectFielder({ ...moment, action: simAction, actionAge, moving, speed: actor.speed, ballY: frame.ball.y, id: n - 2, chasing: travel > 0.05 });
        if (dead && wicket && deadAge > 1.1 && moved > 0.002 && n !== UMPIRE && simAction !== "dive") sel = "gait";
        if (ceremony?.stage === "entry" && moving) sel = "gait";
        if (reacting) {
          const walking = moving && moved > 0.002;
          if (react?.kind === "pose" && !(walking && wicket && deadAge > 1.1)) sel = { clip: react.clip, time: react.time };
          else if (walking) sel = "gait";
          else if (n > NON_STRIKER) sel = { clip: "idle", time: wall };
        }

        let name: string;
        if (sel === "gait" && actor.speed < 0.2 && tick === 0) sel = { clip: "idle", time: wall };
        if (sel === "gait") {
          gaitInto(actor);
          name = "gait";
        } else if (sel === "bat" || (n === STRIKER && typeof sel === "object" && sel.clip === "beaten")) {
          sel = "bat";
          sampleClip(CLIPS.stance, 0, p);
          const input = strikerFrame(actor, px, pz, feed, tick, hit, contactTick, style, !!preMatch);
          const result = batting(input, p);
          strikerInput = input;
          strikerBat = result.bat;
          name = `bat-${result.shot}`;
        } else if (sel === "delivery") {
          sampleClip(DELIVERY[style], (tick - RELEASE_TICK) * STEP, p);
          name = `delivery-${style}`;
        } else {
          sampleClip(CLIPS[sel.clip as ClipName], sel.time, p);
          name = sel.clip;
        }

        // ---- fielding plan onto the driver: body shape and hands on the ball --------
        // Weights ease (about 0.07 s) and a change of pose crossfades, so a read of
        // the ball that changes or goes away never snaps the body or the hands.
        if (fielding) {
          const ease = feed.reducedMotion ? 1 : 1 - Math.exp(-dt / 0.07),
            want = plan && !reacting ? plan.pose : null;
          if (want && actor.planPose?.clip !== want.clip) {
            if (actor.planPose && actor.planPose.w > 0.02) actor.fadePose = actor.planPose;
            actor.planPose = { clip: want.clip, time: want.time, w: 0 };
          }
          const cur = actor.planPose;
          if (cur) {
            if (want && cur.clip === want.clip) cur.time = want.time;
            cur.w += ((want && cur.clip === want.clip ? Math.min(1, want.weight) : 0) - cur.w) * ease;
            if (!want && cur.w < 0.01) actor.planPose = null;
          }
          if (actor.fadePose) {
            actor.fadePose.w *= 1 - ease;
            if (actor.fadePose.w < 0.01) actor.fadePose = null;
          }
          for (const layer of [actor.fadePose, actor.planPose])
            if (layer && layer.w > 0.001) {
              sampleClip(CLIPS[layer.clip], layer.time, poseTmp);
              blendPose(p, poseTmp, layer.w, p);
            }
          for (const [k, g] of [plan && !reacting ? plan.left : null, plan && !reacting ? plan.right : null].entries()) {
            const h = actor.handGoals[k]!;
            if (g && g.w > 0.001) {
              // The goal follows the read (already eased in fielding.ts); the weight rises
              // with it and falls away gently when the read lets go.
              Object.assign(h, { x: g.x, y: g.y, z: g.z });
              h.w += (g.w - h.w) * (g.w > h.w ? 1 : ease);
            } else h.w *= 1 - ease;
            if (h.w > 0.001) {
              const [lx, ly, lz] = toLocal(actor, h.x, h.y, h.z);
              setHand(p, k === 0, lx, ly, lz, h.w);
            }
          }
        }
        // Bowling hand arrives exactly at the simulated release point.
        if (n === BOWLER && sel === "delivery") {
          const away = Math.abs(tick - RELEASE_TICK);
          if (away < 7) {
            const [lx, ly, lz] = toLocal(actor, 0.55, 2.08, -8.5);
            setHand(p, false, lx, ly, lz, 1 - away / 7);
          }
        }

        if (n === STRIKER && actor.clip !== name && name.startsWith("bat-") && actor.clip.startsWith("bat-") && lastBat) {
          batFrom = lastBat;
          batFadeAt = wall;
        }
        resolve(actor, name, wall, feed.reducedMotion);
        const out = actor.out;
        // Feet stay planted under held poses (keeping, gathering, catching, reacting).
        if (n > NON_STRIKER && n !== UMPIRE && !preMatch) {
          const airborne = (!!plan && /dive|leap|slide/.test(plan.move)) || simAction === "dive" || (actor.motionLower ?? 0) >= 0.5;
          const s = a.look.scale,
            c = Math.cos(a.root.rotation.y),
            si = Math.sin(a.root.rotation.y),
            wx = (lx: number, lz: number) => px + (lx * c + lz * si) * s,
            wz = (lx: number, lz: number) => pz + (-lx * si + lz * c) * s;
          if (name === "gait" || name.startsWith("delivery")) {
            for (const [k, f] of actor.planter.feet.entries()) Object.assign(actor.steps.feet[k]!, { x: f.x, z: f.z, t: 1, lift: 0 });
          } else if (airborne) {
            // Feet off the ground or the clip's own: follow the pose, ready to plant when it lands.
            for (const [k, X] of [CH.lFootX, CH.rFootX].entries()) Object.assign(actor.steps.feet[k]!, { x: wx(out[X]!, out[X + 2]!), z: wz(out[X]!, out[X + 2]!), t: 1, lift: 0 });
          } else {
            actor.steps.update(wx(out[CH.lFootX]!, out[CH.lFootZ]!), wz(out[CH.lFootX]!, out[CH.lFootZ]!), wx(out[CH.rFootX]!, out[CH.rFootZ]!), wz(out[CH.rFootX]!, out[CH.rFootZ]!), feed.reducedMotion ? 1 : dt);
            for (const [k, f] of actor.steps.feet.entries()) {
              const X = k === 0 ? CH.lFootX : CH.rFootX,
                [lx, , lz] = toLocal(actor, f.x, 0, f.z);
              out[X] = lx;
              out[X + 1] = out[X + 1]! + f.lift / s;
              out[X + 2] = lz;
            }
          }
        }

        // ---- apply --------------------------------------------------------------
        if (n === STRIKER && sel === "bat" && strikerBat && strikerInput) {
          if (hit && shot && !contactSeen && feed.contactPoint) {
            // Measure the rig at the contact tick itself, even if no frame was drawn on that tick.
            contactSeen = true;
            const met = feed.contactPoint;
            sampleClip(CLIPS.stance, 0, contactPose);
            const atContact = batting({ ...strikerInput, tick: contactTick }, contactPose);
            holdBat(a, contactPose, atContact.bat);
            a.root.updateMatrixWorld(true);
            contactError = batPoint(a, BAT.sweet, tmp).distanceTo(tmp2.set(met.x, met.y, met.z));
            if (strikerInput.contact === "inside-edge" || strikerInput.contact === "outside-edge") contactError = Math.max(0, contactError - 0.055);
          }
          // A change of shot (a live batter changing their mind) blends rather than jumps.
          let bat = strikerBat;
          if (batFrom && wall - batFadeAt < 0.16 && !feed.reducedMotion) {
            const w = clamp01((wall - batFadeAt) / 0.16);
            bat = { grip: [batFrom.grip[0] + (bat.grip[0] - batFrom.grip[0]) * w, batFrom.grip[1] + (bat.grip[1] - batFrom.grip[1]) * w, batFrom.grip[2] + (bat.grip[2] - batFrom.grip[2]) * w], dir: bat.dir.map((v, k) => batFrom!.dir[k]! + (v - batFrom!.dir[k]!) * w) as Vec3, face: bat.face.map((v, k) => batFrom!.face[k]! + (v - batFrom!.face[k]!) * w) as Vec3 };
          }
          lastBat = bat;
          holdBat(a, out, bat);
          a.root.updateMatrixWorld(true);
          if (shot) {
            // Measure the real rig: how well the hands are holding the handle.
            handCentre(a, true, tmp);
            batPoint(a, BAT.top, tmp2);
            gripError = Math.max(gripError * 0.995, tmp.distanceTo(tmp2));
            handCentre(a, false, tmp);
            batPoint(a, BAT.bottom, tmp2);
            gripError = Math.max(gripError, tmp.distanceTo(tmp2));
          }
        } else {
          if (n <= NON_STRIKER) {
            // Bat carried in the right hand while running or reacting.
            const up = out[CH.rHandY]! > 1.45;
            const rx = out[CH.rHandX]!,
              ry = out[CH.rHandY]!,
              rz = out[CH.rHandZ]!;
            placeBat(a, { grip: [rx, ry, rz], dir: up ? [0.08, 0.9, 0.3] : [0.04, -0.72, 0.68], face: [1, 0, 0] });
          }
          applyPose(a, out);
        }
        if (n === BOWLER && Math.abs(tick - RELEASE_TICK) < 7 && sel === "delivery") {
          // The arm alone can fall short on a smaller bowler: the body closes the gap into the release.
          a.root.updateMatrixWorld(true);
          handCentre(a, false, tmp);
          tmp2.set(0.55, 2.08, -8.5).sub(tmp);
          const w = 1 - Math.abs(tick - RELEASE_TICK) / 7;
          a.root.position.x += tmp2.x * w;
          a.root.position.z += tmp2.z * w;
          a.root.position.y += Math.max(0, tmp2.y) * w;
        }
        if (n === BOWLER && Math.abs(tick - RELEASE_TICK) < 1.5 && sel === "delivery") {
          a.root.updateMatrixWorld(true);
          releaseError = handCentre(a, false, tmp).distanceTo(tmp2.set(0.55, 2.08, -8.5));
        }
        if (n === BOWLER && tick < RELEASE_TICK) {
          a.root.updateMatrixWorld(true);
          handCentre(a, false, ballMesh.position);
        }
        // Foot-lock check for the runner most on camera.
        if (n === BOWLER && (name !== "gait" || feed.replay || tick < lastTick || actor.planter.resets !== plantResets)) {
          plantResets = actor.planter.resets;
          // A new ball or a replay scrub moves the runner legitimately: that is not a slip.
          planted[0]!.x = planted[1]!.x = NaN;
        } else if (n === BOWLER) {
          actor.planter.feet.forEach((f, k) => {
            const lock = planted[k]!;
            if (!f.swinging && Number.isFinite(lock.x)) footSlip = Math.max(footSlip * 0.998, Math.hypot(f.x - lock.x, f.z - lock.z));
            if (!f.swinging) lock.set(f.x, 0, f.z);
            else lock.set(NaN, 0, 0);
          });
        }
        // Dust at the bowler's front foot as it lands.
        if (n === BOWLER && lastTick < RELEASE_TICK - 5 && tick >= RELEASE_TICK - 5 && !feed.reducedMotion) puff(px + 0.13, 0.05, pz + 0.6, Math.min(10, DUST / 6));
        // Dust from a sliding dive.
        if (simAction === "dive" && actionAge > 0.3 && actionAge < 0.36 && !feed.reducedMotion) puff(px, 0.06, pz, Math.min(12, DUST / 5), 1.3);

        const shadowSize = 0.95 + (out[CH.hipY]! < 0.5 ? 0.5 : 0);
        dummy.position.set(px, 0.016, pz);
        dummy.scale.set(shadowSize, 1, shadowSize * 0.8);
        dummy.rotation.y = actor.facing;
        dummy.updateMatrix();
        blobs.setMatrixAt(n, dummy.matrix);
      }

      // ---- a big catch: slow the presentation as the fielder launches, through the landing ----
      let slow = false;
      if (!feed.reducedMotion && !preMatch) {
        for (let n = 2; n < 13; n++) {
          const f = actors[n]!.field;
          if (!f || !hit || frame.bounce || dead) continue;
          const at = actors[n]!.a.root.position,
            big = f.move === "dive" || f.move === "catch-leap" || (f.move.startsWith("catch-") && ropeRatio({ x: at.x, z: at.z }, config.venue) > 0.85);
          if (big && (f.right?.w ?? 0) > 0.2) slow = true;
        }
        if (slow) cinemaCatch = true;
        if (dead && cinemaCatch && wicket === "caught" && deadAge < 0.9) slow = true;
        if (!hit || tick < lastTick - 0.001) cinemaCatch = false;
      }
      cinema += ((slow ? 0.35 : 1) - cinema) * (feed.reducedMotion ? 1 : 1 - Math.exp(-dt / 0.12));

      // ---- realistic bodies follow their drivers (before the ball, which they hold) ----
      if (realisticReady)
        for (const actor of actors) {
          if (!actor.a.root.visible || !actor.body) continue;
          let motionFrame = null;
          if (actor.motion && actor.plan) {
            const loco = actor.motion.locomotion(dt, actor.plan.speed);
            motionFrame = actor.motion.pose(loco, actor.plan.shot);
            motionFrame.lower = actor.plan.lower;
            motionFrame.upper = actor.plan.upper;
            motionFrame.twist = actor.plan.twist;
            motionFrame.lean = actor.plan.lean;
          }
          actor.body.sync(motionFrame);
          actor.body.setDistance(camera.position.distanceTo(actor.a.root.position));
          // A clip-driven body still puts its hands on the ball.
          if ((actor.motionUpper ?? 0) >= 0.5)
            for (const [k, h] of actor.handGoals.entries()) if (h.w > 0.001) actor.body.reachHand(k === 0, goalTmp.set(h.x, h.y, h.z), h.w);
        }

      // ---- ball -------------------------------------------------------------------
      // The simulation's ball is authoritative. What's drawn sits in the hand that
      // holds it and leaves that hand on release, with the difference to the
      // simulated flight fading out in a few frames, so it never jumps.
      const b = frame.ball;
      ball.visible = !preMatch;
      blobs.visible = !preMatch;
      if (tick >= RELEASE_TICK) {
        if (rewound || tick < ballTick || tick > ballTick + 90) {
          ballOffset.set(0, 0, 0);
          ballHeld = false;
          ballShown.set(b.x, b.y, b.z);
        }
        const holding = frame.mode === "struck" ? frame.actions.findIndex((action) => action === "pickup") : -1,
          caught = dead && wicket === "caught" ? frame.actions.findIndex((action) => action === "catch" || action === "dive") : -1,
          kept = dead && frame.actions[10] === "catch" ? 10 : -1,
          holder = holding >= 0 ? holding : caught >= 0 ? caught : kept;
        if (holder >= 0) {
          const actor = actors[holder + 2]!,
            twoHands = holder === 10 || (!actor.field?.oneHand && (actor.field?.left?.w ?? 0) > 0.3);
          if (actor.body) actor.body.palm(false, tmp);
          else handCentre(actor.a, false, tmp);
          // Taken in both hands (or gloves): the ball sits between the palms.
          if (twoHands) {
            if (actor.body) actor.body.palm(true, tmp2);
            else handCentre(actor.a, true, tmp2);
            tmp.lerp(tmp2, 0.5);
          }
          ballShown.lerp(tmp, feed.reducedMotion || !ballHeld && rewound ? 1 : 1 - Math.exp(-dt / 0.045));
          ballHeld = true;
        } else {
          if (ballHeld) ballOffset.copy(ballShown).sub(tmp2.set(b.x, b.y, b.z));
          ballHeld = false;
          ballOffset.multiplyScalar(feed.reducedMotion ? 0 : Math.exp(-dt / 0.09));
          ballShown.set(b.x + ballOffset.x, b.y + ballOffset.y, b.z + ballOffset.z);
        }
        ballTick = tick;
        ball.position.copy(ballShown);
      }
      ball.scale.setScalar(Math.max(1, Math.min(2.4, camera.position.distanceTo(ball.position) / 16)));
      // Seam presentation: pace comes out with backspin, the seam upright; spin turns
      // about the line of flight; off the bat it tumbles. Visual only.
      if (hit) ball.rotation.set(tick * 0.3, tick * 0.11, 0);
      else if (style === "spin") ball.rotation.set(0.35, 0, -tick * 0.42);
      else ball.rotation.set(-tick * 0.36, 0.08, 0);
      const vy = (b.y - prevBallY) / Math.max(1e-3, (tick - lastTick) * STEP);
      // A bounce: a downward ball that's now rising at ground level. Purely a visual cue.
      if (tick > RELEASE_TICK && tick !== lastTick && !rewound && b.y < 0.25 && prevBallVy < -1 && vy > 0 && !feed.reducedMotion) puff(b.x, 0.04, b.z, Math.min(8, DUST / 7), 0.7);
      if (tick !== lastTick) {
        prevBallVy = vy;
        prevBallY = b.y;
        history.push(ball.position.x, ball.position.y, ball.position.z);
        while (history.length > TRAIL * 3) history.splice(0, 3);
        const count = history.length / 3;
        for (let n = 0; n < TRAIL; n++) {
          const from = Math.max(0, count - TRAIL + n) * 3;
          trailPos[n * 3] = history[from] ?? ball.position.x;
          trailPos[n * 3 + 1] = history[from + 1] ?? ball.position.y;
          trailPos[n * 3 + 2] = history[from + 2] ?? ball.position.z;
        }
        (trailGeo.getAttribute("position") as T.BufferAttribute).needsUpdate = true;
      }
      lastTick = tick;
      trail.visible = tick > RELEASE_TICK && (!!feed.replay || !(deadAge > 3));
      // Ball's shadow on the ground gives its height away, as on a real broadcast.
      const by = ball.position.y,
        shade = Math.max(0.16, 0.42 - by * 0.012);
      dummy.position.set(ball.position.x, 0.02, ball.position.z);
      dummy.scale.set(shade, 1, shade);
      dummy.rotation.y = 0;
      dummy.updateMatrix();
      blobs.setMatrixAt(ACTORS, dummy.matrix);
      blobs.instanceMatrix.needsUpdate = true;

      // ---- stumps -------------------------------------------------------------------
      const broke = dead && (outcome?.wicket === "bowled" || outcome?.wicket === "stumped" || outcome?.wicket === "run-out");
      if (broke && !wasDead) wicketKick = outcome?.wicket === "bowled" ? 1 : 0.55;
      const breakAt = outcome?.wicket === "stumped" ? STUMPING_HIT : 0,
        since = broke ? Math.min(1.5, Math.max(0, deadAge - breakAt)) : 0;
      nearStumps.rotation.x = wicketKick && outcome?.wicket === "bowled" ? -Math.min(0.22, since * 1.5) * wicketKick * Math.exp(-since * 0.4) : 0;
      bails.forEach((bail, n) => {
        const side = n ? 1 : -1;
        bail.position.set(side * 0.038 + since * side * 0.75 * wicketKick, Math.max(0.03, 0.718 + since * 2.1 * wicketKick - 4.9 * since * since), STUMPS_Z + since * 1.1 * wicketKick);
        bail.rotation.x = since * 9;
      });
      if (broke && deadAge >= breakAt && deadAge < breakAt + 0.1 && !feed.reducedMotion) puff(0, 0.25, STUMPS_Z, 2, 0.5);
      wasDead = dead;

      // ---- dust ---------------------------------------------------------------------
      if (DUST) {
        let alive = false;
        for (let n = 0; n < DUST; n++) {
          if (dustLife[n]! <= 0) continue;
          alive = true;
          dustLife[n] = dustLife[n]! - dt;
          dustPos[n * 3] = dustPos[n * 3]! + dustVel[n * 3]! * dt;
          dustPos[n * 3 + 1] = dustPos[n * 3 + 1]! + dustVel[n * 3 + 1]! * dt;
          dustPos[n * 3 + 2] = dustPos[n * 3 + 2]! + dustVel[n * 3 + 2]! * dt;
          dustVel[n * 3 + 1] = dustVel[n * 3 + 1]! - dt * 1.1;
          if (dustLife[n]! <= 0) dustPos[n * 3 + 1] = -50;
        }
        dust.visible = alive;
        if (alive) (dustGeo.getAttribute("position") as T.BufferAttribute).needsUpdate = true;
      }

      // ---- crowd --------------------------------------------------------------------
      const energy = crowdEnergy({ outcome: dead ? outcome : null, deadAge, ballRatio: hit ? ropeRatio(b, config.venue) : 0, inAir: hit && !frame.bounce, reduced: feed.reducedMotion });
      excite += (energy - excite) * Math.min(1, dt * (energy > excite ? 5 : 0.8));
      stadium.update(wall, excite);
      stadium.setScore(feed.score);

      // ---- camera -------------------------------------------------------------------
      if (preMatch && ceremony) {
        const lineup: readonly (readonly [number, number, number, number])[] = Array.from({ length: 11 }, (_, n) => [n, (n - 5) * 0.95, -1 - Math.abs(n - 5) * 0.15, 0] as const);
        for (const [n, x, z, facing] of ceremony.stage === "lineups" ? lineup : [[UMPIRE, 1.6, -1.2, 0]] as const) {
          const actor = actors[n]!, a = actor.a;
          setKit(actor, n, ceremony.stage === "lineups" ? ceremony.team : n === NON_STRIKER ? 1 - ceremony.team : ceremony.team, ceremony.stage === "lineups" ? n + 1 : 1);
          a.root.position.set(x, 0, z); a.root.rotation.y = facing;
          const p = sampleClip(ceremony.stage === "decision" ? CLIPS.clap : CLIPS.idle, ceremony.age, actor.target);
          if (n === STRIKER && ["hand", "flight"].includes(ceremony.stage)) {
            const u = ceremony.stage === "flight" ? Math.max(0, 1 - ceremony.age * 2) : 1;
            const target = toLocal(actor, 0.6, 1.465, 0.7);
            setHand(p, false, target[0], target[1] + (ceremony.stage === "flight" ? Math.sin(ceremony.age * Math.PI * 2) * 0.3 : 0), target[2], u);
          }
          applyPose(a, p);
          a.bones.bat.scale.setScalar(0.001);
        }
        for (const [order, team] of [ceremony.team, 1 - ceremony.team].entries()) {
          const { a, pose: p } = captains[team]!;
          const x = order === 0 ? 0.9 : 2.4, z = order === 0 ? 0.3 : 0.5;
          a.root.position.set(x, 0, z); a.root.rotation.y = order === 0 ? 0 : -0.7;
          sampleClip(ceremony.stage === "decision" ? CLIPS.clap : CLIPS.idle, ceremony.age, p);
          if (order === 0 && ["hand", "flight"].includes(ceremony.stage)) {
            const u = ceremony.stage === "flight" ? Math.max(0, 1 - ceremony.age * 2) : 1;
            setHand(p, false, (0.6 - x) / a.look.scale, 1.465 / a.look.scale, (0.7 - z) / a.look.scale, u);
          }
          applyPose(a, p);
          if (order === 0 && ceremony.stage === "hand") { coin.position.copy(handCentre(a, false, tmp)); coin.position.y += 0.055; }
        }
      }
      const reactionIndex = wicket === "caught" || wicket === "run-out" ? frame.actions.findIndex((action) => (wicket === "caught" ? action === "catch" || action === "dive" : action === "throw")) : -1;
      // Whoever is going for the ball (or has it), for the fielding camera.
      let onBall = -1,
        onBallGap = Infinity;
      if (hit || frame.mode === "throw" || tick > RELEASE_TICK + 60)
        frame.actions.forEach((action, k) => {
          if (action === "ready" || (frame.travel[k] ?? 0) < 0.05 && action === "run") return;
          const at = actors[k + 2]!.a.root.position,
            gap = Math.hypot(at.x - b.x, at.z - b.z);
          if (gap < onBallGap) (onBall = k + 2), (onBallGap = gap);
        });
      const reactionActor = actors[reactionIndex >= 0 ? reactionIndex + 2 : wicket === "stumped" ? KEEPER : BOWLER]!;
      const pick = (ceremony ? ceremonyCamera(ceremony) : null) ?? direct({
        camera: feed.camera,
        frame: { tick, ball: b, contact: hit, mode: frame.mode, bounce: frame.bounce },
        outcome,
        deadAge,
        humanBatting: feed.humanBatting,
        config,
        batterX: actors[STRIKER]!.a.root.position.x,
        batterZ: actors[STRIKER]!.a.root.position.z,
        replay: !!feed.replay,
        contactTick,
        reaction: dead && (wicket || feed.result) ? (wicket ? reactionActor : actors[STRIKER]!).a.root.position : undefined,
        bowler: { x: actors[BOWLER]!.a.root.position.x, z: actors[BOWLER]!.a.root.position.z },
        fielder: onBall >= 0 ? { x: actors[onBall]!.a.root.position.x, z: actors[onBall]!.a.root.position.z } : undefined,
        interlude: feed.interlude ?? null,
        time: wall,
        cinematic: cinema < 0.8,
      });
      // A change of shot to somewhere else entirely is a cut, as on television, not a
      // sweep across the ground; nearby changes (and moving shots) ease. The replay
      // director always cuts.
      const far = Math.hypot(pick.px - camera.position.x, pick.py - camera.position.y, pick.pz - camera.position.z),
        cut = pick.name !== shotName && !!shotName && (pick.name.startsWith("replay-") || far > 14);
      const snap = feed.reducedMotion || snapCamera || cut;
      shotName = pick.name;
      const kP = snap ? 1 : 1 - Math.exp(-pick.rate * dt),
        kL = snap ? 1 : 1 - Math.exp(-pick.lookRate * dt);
      snapCamera = false;
      camera.position.x += (pick.px - camera.position.x) * kP;
      camera.position.y += (pick.py - camera.position.y) * kP;
      camera.position.z += (pick.pz - camera.position.z) * kP;
      camTarget.x += (pick.lx - camTarget.x) * kL;
      camTarget.y += (pick.ly - camTarget.y) * kL;
      camTarget.z += (pick.lz - camTarget.z) * kL;
      // Never below the turf or inside the stands.
      camera.position.y = Math.max(0.3, camera.position.y);
      if (camera.position.y < 30) {
        const r = Math.hypot(camera.position.x / 66, camera.position.z / 72);
        if (r > 1) {
          camera.position.x /= r;
          camera.position.z /= r;
        }
      }
      camera.lookAt(camTarget);
      if (Math.abs(camera.fov - pick.fov) > 0.01) {
        camera.fov += (pick.fov - camera.fov) * (snap ? 1 : kP);
        camera.updateProjectionMatrix();
      }
      if (realisticReady) for (const c of captains) if (c.a.root.visible) c.body?.sync();
      renderer.render(scene, camera);
    },
    cinematic: () => cinema,
    metrics: () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      textures: renderer.info.memory.textures,
      geometries: renderer.info.memory.geometries,
      dpr,
      shot: shotName,
      contactError,
      releaseError,
      gripError,
      footSlip,
      excite,
      spacing,
      takeError,
      takeMove,
      athletes: realisticReady,
      looks: realisticReady
        ? actors
            .flatMap((a, n) => (a.body ? [`${slots[n]!.identity}=${a.body.appearance.model}:${a.body.appearance.facialHair}:${a.body.appearance.haircut}:${a.body.appearance.skinTint.map((c) => c.toFixed(3)).join("/")}`] : []))
            .sort()
            .join("|")
        : "",
      fielding: actors
        .slice(2, 13)
        .map((a) => a.field?.move ?? "idle")
        .join(","),
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      const geometries = new Set<T.BufferGeometry>(),
        materials = new Set<T.Material>(),
        textures = new Set<T.Texture>();
      scene.traverse((node) => {
        if (node instanceof T.InstancedMesh) node.dispose();
        if (node instanceof T.SkinnedMesh) node.skeleton.dispose();
        if (node instanceof T.Sprite) return;
        const m = node as T.Mesh;
        if (m.geometry) geometries.add(m.geometry);
        if (m.material)
          for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
            materials.add(mat);
            for (const value of Object.values(mat)) if (value instanceof T.Texture) textures.add(value);
          }
      });
      for (const kit of teamKits) {
        textures.add(kit.tex);
        materials.add(kit.material);
      }
      for (const m of kits?.all() ?? []) materials.add(m);
      for (const m of equipment.materials) materials.add(m);
      for (const g of equipment.geometries) geometries.add(g);
      stadium.dispose();
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
      geometries.forEach((g) => g.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
