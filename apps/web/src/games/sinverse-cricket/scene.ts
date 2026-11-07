import * as T from "three";
import {
  CREASE_Z,
  RELEASE_TICK,
  STEP,
  STUMPS_Z,
  type CricketConfig,
  type Fielder,
  type Frame,
  type Outcome,
  type ShotInput,
  type Variation,
} from "@platform/engines/sinverse-cricket";
import {
  BAT,
  CH,
  CLIPS,
  DELIVERY,
  IMPACT_TICKS,
  RELEASE_ROOT,
  RIG,
  RUN_UP,
  FootPlanter,
  applyGait,
  applyShotBody,
  batPose,
  blendPose,
  bowlingStyle,
  clamp01,
  creaseZ,
  makePose,
  nominalImpact,
  runUpProgress,
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
import { applyPose, batPoint, buildAthlete, handCentre, holdBat, paintKit, paintRoughness, placeBat, type Athlete, type Role } from "./character";
import { crowdEnergy, direct, ropeRatio, type CameraName } from "./director";
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
  variation?: Variation | null;
  replay?: boolean;
  result?: MatchMoment["result"];
  ceremony?: CeremonyFeed;
  intent?: Omit<ShotInput, "tick">;
  aim?: { line: number; length: number };
};
export interface SceneDriver {
  draw(feed: SceneFeed): void;
  dispose(): void;
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
    actors.push({ a, planter: new FootPlanter(), target: makePose(), from: makePose(), out: makePose(), clip: "", fadeAt: -10, action: "ready", actionTick: 0, prev: v3(NaN), prevTick: -1, speed: 0, facing: 0, number: n + 1, team, kit, kitCanvas });
  }
  const captains = [0, 1].map(team => {
    const a = buildAthlete("field", 1, team, q.closeDetail, teamKits[team]!.material);
    a.root.visible = false; a.mesh.castShadow = !!q.shadows; scene.add(a.root);
    return { a, pose: makePose() };
  });

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
    actor.team = team;
    actor.number = number;
  };

  /** Writes a clip (with a short crossfade from whatever played before) into `out`. */
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
        wicketKick = 0;
        if (tick < lastTick) for (const actor of actors) actor.prev.set(NaN, NaN, NaN);
      }
      const dead = !!outcome && frame.mode === "dead";
      if (dead && !wasDead) deadAt = wall;
      if (!dead) deadAt = -1;
      const deadAge = dead ? wall - deadAt : -1;
      const contactTick = feed.contactTick ?? (frame.contact ? tick : -1);
      const hit = frame.contact && (contactTick < 0 || tick >= contactTick);
      const running = frame.runner % 1 > 0.0001;
      const style = bowlingStyle(feed.variation ?? undefined);
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

      for (let n = 0; n < ACTORS; n++) {
        const actor = actors[n]!,
          a = actor.a;
        a.bones.bat.scale.setScalar(1);
        a.root.visible = !preMatch || ceremony?.stage === "lineups" && n < 11 || n === UMPIRE && ceremony?.stage !== "lineups";
        if (n < BOWLER + 2) setKit(actor, n, n <= NON_STRIKER ? feed.battingTeam : 1 - feed.battingTeam, feed.actorNumbers?.[n] ?? actor.number);
        // Outfielders can update on alternate frames on the lowest preset.
        if (q.fielderEvery > 1 && n >= 2 && n < BOWLER && n % 2 !== frameNo % 2 && actor.clip) continue;

        // ---- where the simulation says this actor is -------------------------
        let px = 0,
          pz = 0,
          simAction: Fielder["action"] = "ready",
          travel = 0;
        if (n === STRIKER || n === NON_STRIKER) {
          const end = n === STRIKER ? 1 : -1;
          pz = creaseZ(end, frame.runner);
          px = (n === STRIKER ? -0.38 : 0.72) + (frame.runner > 0 ? 0.28 : 0);
          if (n === STRIKER && frame.runner === 0) pz = frame.batterGroundZ;
        } else if (n === UMPIRE) {
          px = -1.05;
          pz = -STUMPS_Z - 1.55;
        } else {
          const f = frame.fielders[n - 2]!;
          px = f.x;
          pz = f.z;
          simAction = frame.actions[n - 2] ?? "ready";
          travel = frame.travel[n - 2] ?? 0;
        }
        if (n === BOWLER) {
          const follow = tick > RELEASE_TICK ? ((u) => u * u * (3 - 2 * u))(clamp01((tick - RELEASE_TICK - 6) / 60)) * 1.75 : 0;
          const fade = 1 - clamp01(travel * 2);
          if (tick <= RELEASE_TICK) {
            const u = runUpProgress(tick, style),
              startZ = -8.5 + RELEASE_ROOT.z - RUN_UP[style];
            pz = startZ + (RUN_UP[style] + (frame.bowlerFootZ + CREASE_Z + 0.23)) * u;
            px = 0.55 + RELEASE_ROOT.x + (1 - u) * 0.5;
          } else {
            pz += (RELEASE_ROOT.z + follow) * fade;
            px += RELEASE_ROOT.x * fade;
          }
        }
        // Presentation positions never write to the fielders or match.
        if (dead && wicket && deadAge > 1.1) {
          const u = clamp01((deadAge - 1.1) / 3.2);
          const dismissed = (outcome?.dismissed === "striker" ? STRIKER : NON_STRIKER);
          if (n === dismissed) { px += u * 4; pz += u * 2.8; }
          else if (n >= 2 && n < UMPIRE && simAction !== "dive") {
            const anchor = frame.fielders.find((_, k) => frame.actions[k] === "catch" || frame.actions[k] === "throw") ?? frame.fielders[9]!;
            const angle = n * 2.4;
            const maxTravel = Math.min(1, (deadAge - 1.1) * 3 / Math.max(1, Math.hypot(anchor.x - px, anchor.z - pz)));
            px += (anchor.x + Math.sin(angle) * 1.3 - px) * maxTravel;
            pz += (anchor.z + Math.cos(angle) * 1.3 - pz) * maxTravel;
          }
        }
        if (ceremony?.stage === "entry") {
          const u = clamp01(ceremony.age / 2.4);
          px += (n % 2 ? -1.4 : 1.4) * (1 - u);
          pz -= 2.2 * (1 - u);
        }

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
        if (simAction !== actor.action) {
          actor.action = simAction;
          actor.actionTick = tick;
        }
        if (tick < actor.actionTick) actor.actionTick = tick;
        const actionAge = Math.max(0, tick - actor.actionTick) * STEP;

        // ---- facing -----------------------------------------------------------
        let want: number;
        if ((ceremony?.stage === "entry" || dead && wicket && deadAge > 1.1) && moving) want = Math.atan2(dx, dz);
        else if (n === STRIKER && !running && frame.runner === 0) want = Math.PI / 2;
        else if (moved > 0.002 && moving && (n === BOWLER || n <= NON_STRIKER || actor.speed > 2.2)) want = Math.atan2(dx, dz);
        else if (n === UMPIRE) want = 0;
        else if (n === NON_STRIKER) want = frame.runner % 2 < 1 ? 0 : Math.PI;
        else if (n === STRIKER) want = frame.runner % 2 < 1 ? Math.PI : 0;
        else if (n === KEEPER && !hit) want = Math.PI;
        else want = Math.atan2(frame.ball.x - px, frame.ball.z - pz);
        const diff = ((want - actor.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        actor.facing += diff * (feed.reducedMotion ? 1 : Math.min(1, dt * 9));
        a.root.position.set(px, 0, pz);
        a.root.rotation.y = actor.facing;
        actor.prev.set(px, 0, pz);
        actor.prevTick = tick;

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

        let name: string;
        if (sel === "gait" && actor.speed < 0.2 && tick === 0) sel = { clip: "idle", time: wall };
        if (sel === "gait") {
          gaitInto(actor);
          name = "gait";
        } else if (sel === "bat") {
          sampleClip(CLIPS.stance, 0, p);
          const swing = shot ? clamp01((tick - shot.tick) / IMPACT_TICKS) : 0;
          if (shot) applyShotBody(p, shot.kind, shot.foot, swing);
          else if (feed.intent && !preMatch) applyShotBody(p, feed.intent.kind, feed.intent.foot, 0.65);
          // A little trigger movement as the bowler lets go.
          const trigger = clamp01((tick - RELEASE_TICK + 12) / 20);
          p[CH.hipY] = p[CH.hipY]! + trigger * 0.012;
          p[CH.headY] = 1.15;
          name = shot ? `bat-${shot.kind}` : "bat";
        } else if (sel === "delivery") {
          sampleClip(DELIVERY[style], (tick - RELEASE_TICK) * STEP, p);
          name = `delivery-${style}`;
        } else {
          sampleClip(CLIPS[sel.clip as ClipName], sel.time, p);
          name = sel.clip;
        }

        // ---- contact points ---------------------------------------------------
        const ball = frame.ball;
        if (n === KEEPER && !hit && tick >= RELEASE_TICK && ball.z > 4.5) {
          // Gloves meet the actual ball as it arrives.
          const [lx, ly, lz] = toLocal(actor, ball.x, ball.y, ball.z);
          const w = clamp01((ball.z - 4.5) / 4.5);
          const reach = Math.hypot(lx, ly - 1, lz);
          if (reach < 1.7) {
            setHand(p, true, lx + 0.055, ly, lz, w);
            setHand(p, false, lx - 0.055, ly, lz, w);
            // Stretch the body towards a wide or low ball rather than just the arms.
            p[CH.hipX] = p[CH.hipX]! + lx * 0.45 * w;
            p[CH.roll] = p[CH.roll]! - lx * 0.5 * w;
          }
        }
        if (n === KEEPER && dead && wicket === "stumped" && deadAge < 0.5) {
          const [lx, ly, lz] = toLocal(actor, 0, 0.62, STUMPS_Z);
          setHand(p, true, lx + 0.05, ly, lz, 1);
          setHand(p, false, lx - 0.05, ly, lz, 1);
        }
        if ((simAction === "catch" || simAction === "drop" || simAction === "dive") && n >= 2 && n !== UMPIRE && actionAge < 0.5) {
          const [lx, ly, lz] = toLocal(actor, ball.x, ball.y, ball.z);
          if (Math.hypot(lx, ly - 1, lz) < 1.9) {
            const w = 1 - clamp01((actionAge - 0.3) / 0.2);
            setHand(p, true, lx + 0.05, ly, lz, w);
            setHand(p, false, lx - 0.05, ly, lz, w);
          }
        }
        if (simAction === "pickup" && n >= 2 && n !== UMPIRE) {
          const [lx, ly, lz] = toLocal(actor, ball.x, ball.y, ball.z);
          if (Math.hypot(lx, ly - 1, lz) < 1.6) setHand(p, false, lx, ly, lz, 1);
        }
        // Bowling hand arrives exactly at the simulated release point.
        if (n === BOWLER && sel === "delivery") {
          const away = Math.abs(tick - RELEASE_TICK);
          if (away < 7) {
            const [lx, ly, lz] = toLocal(actor, 0.55, 2.08, -8.5);
            setHand(p, false, lx, ly, lz, 1 - away / 7);
          }
        }

        resolve(actor, name, wall, feed.reducedMotion);
        const out = actor.out;

        // ---- apply --------------------------------------------------------------
        if (n === STRIKER && sel === "bat") {
          // Contact point in this batter's root space (chest +z = world +x, left = bowler).
          const s = a.look.scale;
          const local = (wx: number, wy: number, wz: number): Vec3 => [-(wz - pz) / s, wy / s, (wx - px) / s];
          let impact: Vec3 | null = null;
          if (shot) {
            const nominal = nominalImpact(shot);
            const near = clamp01(1 - Math.abs(ball.z - nominal.z) / 1.1);
            const aimed = hit ? null : local(nominal.x + (ball.x - nominal.x) * near, nominal.y + (ball.y - nominal.y) * near, nominal.z);
            if (hit && !impactFrozen) {
              const met = feed.contactPoint ?? ball;
              const at = local(met.x, met.y, met.z);
              frozenImpact[0] = at[0];
              frozenImpact[1] = at[1];
              frozenImpact[2] = at[2];
              impactFrozen = true;
            }
            impact = hit ? frozenImpact : aimed;
          }
          if (hit && shot && !contactSeen) {
            // Measure the rig at the contact tick itself, even if no frame was drawn on that tick.
            contactSeen = true;
            const met = feed.contactPoint ?? ball;
            holdBat(a, out, batPose({ tick: contactTick, shot, contactTick, impact }));
            a.root.updateMatrixWorld(true);
            contactError = batPoint(a, BAT.sweet, tmp).distanceTo(tmp2.set(met.x, met.y, met.z));
          }
          const bat = batPose({ tick, shot, contactTick: hit ? contactTick : -1, impact });
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

      // ---- ball -------------------------------------------------------------------
      const b = frame.ball;
      ball.visible = !preMatch;
      blobs.visible = !preMatch;
      if (tick >= RELEASE_TICK) ball.position.set(b.x, b.y, b.z);
      if (dead && wicket === "caught") {
        const catcher = frame.actions.findIndex(action => action === "catch");
        if (catcher >= 0) ball.position.copy(handCentre(actors[catcher + 2]!.a, false, tmp));
      }
      ball.scale.setScalar(Math.max(1, Math.min(2.4, camera.position.distanceTo(ball.position) / 16)));
      ball.rotation.x = tick * 0.14;
      ball.rotation.y = tick * 0.05;
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
      const since = broke ? Math.min(1.5, Math.max(0, deadAge)) : 0;
      nearStumps.rotation.x = wicketKick && outcome?.wicket === "bowled" ? -Math.min(0.22, since * 1.5) * wicketKick * Math.exp(-since * 0.4) : 0;
      bails.forEach((bail, n) => {
        const side = n ? 1 : -1;
        bail.position.set(side * 0.038 + since * side * 0.75 * wicketKick, Math.max(0.03, 0.718 + since * 2.1 * wicketKick - 4.9 * since * since), STUMPS_Z + since * 1.1 * wicketKick);
        bail.rotation.x = since * 9;
      });
      if (broke && deadAge < 0.1 && !feed.reducedMotion) puff(0, 0.25, STUMPS_Z, 2, 0.5);
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
      const reactionIndex = wicket === "caught" || wicket === "run-out" ? frame.actions.findIndex(action => action === (wicket === "caught" ? "catch" : "throw")) : -1;
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
        reaction: dead && wicket ? reactionActor.a.root.position : undefined,
      });
      shotName = pick.name;
      const snap = feed.reducedMotion || snapCamera;
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
      renderer.render(scene, camera);
    },
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
      stadium.dispose();
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
      geometries.forEach((g) => g.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
