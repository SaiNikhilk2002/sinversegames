import * as T from "three";
import {
  CREASE_Z,
  RELEASE_TICK,
  STEP,
  STUMPS_Z,
  TEAMS,
  VENUES,
  type CricketConfig,
  type Frame,
  type Outcome,
  type ShotInput,
} from "@platform/engines/sinverse-cricket";

export type Quality = "low" | "medium" | "high" | "ultra";
export type CameraName =
  | "broadcast"
  | "batter"
  | "bowler"
  | "side"
  | "aerial"
  | "track";
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
  };
}
const ladder = {
  low: { dpr: 1, crowd: 450, shadows: 0 },
  medium: { dpr: 1.25, crowd: 1000, shadows: 0 },
  high: { dpr: 1.5, crowd: 1900, shadows: 1024 },
  ultra: { dpr: 2, crowd: 3000, shadows: 2048 },
};
const v3 = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const smooth = (x: number) => {
  const t = T.MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Original cross-section lofts, shaped for shoulders, calves and fabric silhouettes. */
function loft(rings: [number, number, number][], segments = 10) {
  const vertices: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  rings.forEach(([y, x, z], r) => {
    for (let n = 0; n <= segments; n++) {
      const a = (n / segments) * Math.PI * 2;
      vertices.push(Math.sin(a) * x, y, Math.cos(a) * z);
      uv.push(n / segments, r / (rings.length - 1));
    }
  });
  for (let r = 0; r < rings.length - 1; r++)
    for (let n = 0; n < segments; n++) {
      const a = r * (segments + 1) + n,
        b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
function canvasTexture(
  width: number,
  height: number,
  paint: (c: CanvasRenderingContext2D) => void,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Texture canvas unavailable");
  paint(ctx);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
function cloth(team: number, number: number) {
  const t = TEAMS[team]!;
  return canvasTexture(256, 256, (c) => {
    c.fillStyle = t.dark;
    c.fillRect(0, 0, 256, 256);
    c.fillStyle = t.color;
    for (let n = -4; n < 8; n++) {
      c.beginPath();
      c.moveTo(n * 57, 0);
      c.lineTo(n * 57 + 45, 0);
      c.lineTo(n * 57 + 170, 256);
      c.lineTo(n * 57 + 142, 256);
      c.fill();
    }
    c.fillStyle = t.accent;
    c.fillRect(0, 46, 256, 6);
    c.fillStyle = "rgba(255,255,255,.09)";
    for (let y = 0; y < 256; y += 3) c.fillRect(0, y, 256, 1);
    c.fillStyle = "#ffffff";
    c.textAlign = "center";
    c.font = "bold 54px sans-serif";
    c.fillText(String(number), 128, 181);
    c.font = "bold 12px sans-serif";
    c.fillText(t.players[(number - 1) % 11]!.toUpperCase(), 128, 119);
    c.font = "bold 13px sans-serif";
    c.fillText(t.short, 128, 72);
  });
}
function material(color: T.ColorRepresentation, roughness = 0.8) {
  return new T.MeshStandardMaterial({ color, roughness });
}
function mesh(
  parent: T.Object3D,
  g: T.BufferGeometry,
  m: T.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const node = new T.Mesh(g, m);
  node.position.set(x, y, z);
  node.castShadow = false;
  node.receiveShadow = true;
  parent.add(node);
  return node;
}
function bone(parent: T.Object3D, x: number, y: number, z: number) {
  const b = new T.Bone();
  b.position.set(x, y, z);
  parent.add(b);
  return b;
}
type Limb = { upper: T.Bone; lower: T.Bone; hand: T.Bone };
type Athlete = {
  root: T.Group;
  pelvis: T.Bone;
  chest: T.Bone;
  arms: Limb[];
  legs: Limb[];
  bat: T.Group | null;
  phase: number;
  previous: T.Vector3;
  torso: T.Mesh;
  trousers: T.Mesh[];
  number: number;
  team: number;
};

function athlete(
  role: "bat" | "field" | "keeper" | "bowl",
  number: number,
  team: number,
  detailed: boolean,
): Athlete {
  const root = new T.Group(),
    pelvis = bone(root, 0, 0.93, 0),
    chest = bone(pelvis, 0, 0.11, 0);
  const skin = material(
    ["#986448", "#bd8e68", "#80513c", "#d3a17b"][number % 4]!,
    0.92,
  );
  const shirt = new T.MeshStandardMaterial({
    map: cloth(team, number),
    roughness: 0.92,
  });
  const pants = material(TEAMS[team]!.dark),
    white = material("#eee9db"),
    rubber = material("#343744"),
    metal = material("#535f6c", 0.25);
  const torso = mesh(
    chest,
    loft([
      [0, 0.14, 0.09],
      [0.13, 0.17, 0.105],
      [0.34, 0.225, 0.115],
      [0.44, 0.21, 0.1],
      [0.48, 0.09, 0.075],
    ]),
    shirt,
  );
  mesh(
    pelvis,
    loft([
      [-0.13, 0.135, 0.1],
      [0, 0.15, 0.11],
      [0.12, 0.14, 0.09],
    ]),
    pants,
  );
  const neck = bone(chest, 0, 0.48, 0);
  mesh(neck, new T.CylinderGeometry(0.06, 0.075, 0.12, 8), skin, 0, 0.035, 0);
  const head = mesh(
    neck,
    new T.SphereGeometry(0.13, 12, 10),
    skin,
    0,
    0.2,
    0.005,
  );
  head.scale.set(0.82, 1.12, 0.88);
  mesh(neck, new T.SphereGeometry(0.025, 6, 5), skin, 0, 0.19, 0.11).scale.set(
    0.65,
    1.1,
    1,
  );
  for (const side of [-1, 1])
    mesh(
      neck,
      new T.SphereGeometry(0.01, 5, 4),
      rubber,
      side * 0.043,
      0.226,
      0.1,
    );
  const hair = mesh(
    neck,
    new T.SphereGeometry(0.134, 12, 6, 0, Math.PI * 2, 0, 1.45),
    rubber,
    0,
    0.222,
    0,
  );
  hair.scale.set(0.85, 1, 0.91);
  if (role === "bat") {
    const helmet = mesh(
      neck,
      new T.SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, 0, 1.7),
      material(TEAMS[team]!.dark, 0.4),
      0,
      0.23,
      -0.005,
    );
    helmet.scale.set(1, 1, 0.97);
    mesh(
      neck,
      new T.BoxGeometry(0.27, 0.014, 0.19),
      material(TEAMS[team]!.color),
      0,
      0.235,
      0.08,
    );
    if (detailed)
      for (let row = 0; row < 3; row++) {
        const curve = new T.QuadraticBezierCurve3(
          v3(-0.13, 0.2 - row * 0.033, 0.1),
          v3(0, 0.19 - row * 0.033, 0.18),
          v3(0.13, 0.2 - row * 0.033, 0.1),
        );
        mesh(neck, new T.TubeGeometry(curve, 8, 0.004, 4, false), metal);
      }
  } else {
    mesh(
      neck,
      new T.SphereGeometry(0.137, 12, 6, 0, Math.PI * 2, 0, 1.55),
      material(TEAMS[team]!.dark),
      0,
      0.235,
      0,
    );
    mesh(
      neck,
      new T.BoxGeometry(0.19, 0.012, 0.17),
      material(TEAMS[team]!.color),
      0,
      0.245,
      0.09,
    );
  }
  const arms: Limb[] = [],
    legs: Limb[] = [],
    trousers: T.Mesh[] = [];
  for (const side of [-1, 1]) {
    const upper = bone(chest, side * 0.225, 0.39, 0),
      lower = bone(upper, 0, -0.31, 0),
      hand = bone(lower, 0, -0.28, 0);
    mesh(
      upper,
      loft([
        [0, 0.07, 0.075],
        [-0.1, 0.065, 0.067],
        [-0.16, 0.05, 0.052],
      ]),
      shirt,
    );
    mesh(
      upper,
      loft([
        [-0.14, 0.049, 0.052],
        [-0.23, 0.048, 0.045],
        [-0.31, 0.038, 0.038],
      ]),
      skin,
    );
    mesh(
      lower,
      loft([
        [0, 0.039, 0.04],
        [-0.12, 0.044, 0.04],
        [-0.28, 0.029, 0.031],
      ]),
      skin,
    );
    mesh(
      hand,
      loft([
        [0.02, 0.036, 0.025],
        [-0.07, 0.041, 0.025],
        [-0.11, 0.029, 0.02],
      ]),
      role === "bat" || role === "keeper" ? white : skin,
    );
    if (detailed && (role === "bat" || role === "keeper"))
      for (let finger = 0; finger < 4; finger++)
        mesh(
          hand,
          new T.CapsuleGeometry(0.009, 0.045, 2, 4),
          white,
          (finger - 1.5) * 0.018,
          -0.06,
          0.025,
        );
    upper.rotation.z = side * 0.09;
    arms.push({ upper, lower, hand });
    const hip = bone(pelvis, side * 0.09, -0.07, 0),
      knee = bone(hip, 0, -0.43, 0),
      ankle = bone(knee, 0, -0.43, 0);
    trousers.push(
      mesh(
        hip,
        loft([
          [0.02, 0.086, 0.09],
          [-0.18, 0.075, 0.08],
          [-0.43, 0.055, 0.059],
        ]),
        pants,
      ),
    );
    trousers.push(
      mesh(
        knee,
        loft([
          [0, 0.055, 0.061],
          [-0.23, 0.05, 0.057],
          [-0.43, 0.036, 0.04],
        ]),
        pants,
      ),
    );
    const shoe = mesh(
      ankle,
      loft(
        [
          [-0.045, 0.055, 0.12],
          [0.005, 0.061, 0.14],
          [0.055, 0.045, 0.11],
        ],
        8,
      ),
      white,
      0,
      0.02,
      0.045,
    );
    mesh(ankle, new T.BoxGeometry(0.12, 0.025, 0.26), rubber, 0, -0.035, 0.04);
    if (role === "bat" || role === "keeper") {
      const pad = mesh(
        knee,
        loft(
          [
            [0.05, 0.069, 0.04],
            [-0.13, 0.078, 0.055],
            [-0.34, 0.056, 0.04],
          ],
          10,
        ),
        white,
        0,
        0,
        0.06,
      );
      if (detailed)
        for (let stripe = 0; stripe < 3; stripe++)
          mesh(
            knee,
            new T.BoxGeometry(0.014, 0.29, 0.012),
            material("#d2d2bf"),
            (stripe - 1) * 0.036,
            -0.14,
            0.117,
          );
      pad.castShadow = true;
    }
    legs.push({ upper: hip, lower: knee, hand: ankle });
    shoe.receiveShadow = true;
  }
  let bat: T.Group | null = null;
  if (role === "bat") {
    bat = new T.Group();
    arms[1]!.hand.add(bat);
    bat.position.set(0, -0.025, 0.01);
    const wood = canvasTexture(64, 256, (c) => {
      c.fillStyle = "#dfc595";
      c.fillRect(0, 0, 64, 256);
      for (let n = 0; n < 16; n++) {
        c.strokeStyle = `rgba(125,83,37,${0.05 + (n % 3) * 0.03})`;
        c.beginPath();
        c.moveTo(n * 4, 0);
        c.bezierCurveTo(n * 4 + 8, 80, n * 4 - 5, 160, n * 4, 256);
        c.stroke();
      }
      c.fillStyle = "#164b49";
      c.fillRect(10, 90, 44, 60);
      c.fillStyle = "#e9dbb5";
      c.font = "bold 12px sans-serif";
      c.textAlign = "center";
      c.fillText("LIGHT", 32, 114);
      c.fillText("GRAIN", 32, 132);
    });
    const blade = new T.MeshStandardMaterial({ map: wood, roughness: 0.65 });
    mesh(
      bat,
      loft(
        [
          [-0.19, 0.018, 0.018],
          [-0.26, 0.052, 0.025],
          [-0.78, 0.055, 0.029],
          [-0.87, 0.04, 0.025],
          [-0.88, 0.01, 0.018],
        ],
        8,
      ),
      blade,
    );
    mesh(
      bat,
      new T.CylinderGeometry(0.014, 0.015, 0.23, 8),
      material(TEAMS[team]!.color),
      0,
      -0.08,
      0,
    );
  }
  return {
    root,
    pelvis,
    chest,
    arms,
    legs,
    bat,
    phase: 0,
    previous: v3(),
    torso,
    trousers,
    number,
    team,
  };
}
function legPose(limb: Limb, z: number, lift: number) {
  const y = -0.855 + lift,
    d = Math.min(0.858, Math.hypot(y, z)),
    bend = Math.acos(T.MathUtils.clamp(d / 0.86, -1, 1));
  limb.upper.rotation.x = -Math.atan2(z, -y) - bend;
  limb.lower.rotation.x = bend * 2;
  limb.hand.rotation.x = -limb.upper.rotation.x - limb.lower.rotation.x;
}
function gripLeft(a: Athlete) {
  a.root.updateMatrixWorld(true);
  const target = a.arms[1]!.hand.getWorldPosition(v3()).add(v3(0, 0.045, 0));
  const arm = a.arms[0]!,
    parent = arm.upper.parent!;
  parent.worldToLocal(target);
  const start = arm.upper.position.clone(),
    dir = target.clone().sub(start),
    d = Math.min(0.58, dir.length());
  dir.normalize();
  const pole = v3(-1, 0, 0);
  pole.addScaledVector(dir, -pole.dot(dir)).normalize();
  const along = (0.31 * 0.31 - 0.28 * 0.28 + d * d) / (2 * d),
    height = Math.sqrt(Math.max(0, 0.31 * 0.31 - along * along));
  const elbow = start
    .clone()
    .addScaledVector(dir, along)
    .addScaledVector(pole, height);
  arm.upper.quaternion.setFromUnitVectors(
    v3(0, -1, 0),
    elbow.clone().sub(start).normalize(),
  );
  const q = new T.Quaternion().setFromUnitVectors(
    v3(0, -1, 0),
    target.sub(elbow).normalize(),
  );
  arm.lower.quaternion.copy(arm.upper.quaternion).invert().multiply(q);
}

function terrace(
  inner: number,
  outer: number,
  y0: number,
  y1: number,
  a0: number,
  a1: number,
) {
  const p: number[] = [],
    idx: number[] = [];
  const steps = 16;
  for (let n = 0; n <= steps; n++) {
    const a = a0 + ((a1 - a0) * n) / steps;
    p.push(
      Math.sin(a) * inner,
      y0,
      Math.cos(a) * inner * 1.08,
      Math.sin(a) * outer,
      y1,
      Math.cos(a) * outer * 1.08,
    );
  }
  for (let n = 0; n < steps; n++) {
    const i = n * 2;
    idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createCricketScene(
  canvas: HTMLCanvasElement,
  config: CricketConfig,
  quality: Quality,
  onLoss: () => void,
): SceneDriver {
  const settings = ladder[quality],
    venue = VENUES[config.venue],
    scene = new T.Scene();
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: quality !== "low",
    powerPreference: quality === "low" ? "low-power" : "high-performance",
    alpha: false,
  });
  const dpr = Math.min(window.devicePixelRatio || 1, settings.dpr);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = venue.night ? 1.05 : 1.1;
  renderer.shadowMap.enabled = !!settings.shadows;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  scene.background = new T.Color(venue.night ? "#101e36" : "#9fced2");
  scene.fog = new T.Fog(venue.night ? "#101e36" : "#c1d7d3", 90, 230);
  const camera = new T.PerspectiveCamera(43, 1, 0.08, 360);
  camera.position.set(-30, 22, 43);
  const hemi = new T.HemisphereLight(
    venue.night ? "#c5deec" : "#fff0c5",
    "#214436",
    venue.night ? 1 : 1.6,
  );
  scene.add(hemi);
  const sun = new T.DirectionalLight(
    venue.night ? "#e9f2ff" : "#fff0ce",
    venue.night ? 2.4 : 2.8,
  );
  sun.position.set(-24, 45, 25);
  sun.castShadow = !!settings.shadows;
  sun.shadow.mapSize.set(settings.shadows || 256, settings.shadows || 256);
  Object.assign(sun.shadow.camera, {
    left: -28,
    right: 28,
    top: 30,
    bottom: -30,
    near: 1,
    far: 100,
  });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.025;
  scene.add(sun);
  sun.shadow.camera.updateProjectionMatrix();
  const grass = canvasTexture(512, 512, (c) => {
    c.fillStyle = "#3a7750";
    c.fillRect(0, 0, 512, 512);
    for (let s = 0; s < 16; s++) {
      c.fillStyle = s % 2 ? "#428155" : "#357247";
      c.fillRect(0, s * 32, 512, 32);
    }
    let seed = 41;
    for (let n = 0; n < 11000; n++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const x = seed % 512;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      c.fillStyle = n % 2 ? "rgba(232,229,155,.07)" : "rgba(6,46,28,.1)";
      c.fillRect(x, seed % 512, 1, 3);
    }
  });
  grass.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const turf = new T.MeshStandardMaterial({ map: grass, roughness: 1 });
  const ground = mesh(scene, new T.CircleGeometry(75, 96), turf, 0, -0.025, 0);
  ground.rotation.x = -Math.PI / 2;
  ground.scale.y = 1.08;
  const pitchTexture = canvasTexture(256, 512, (c) => {
    c.fillStyle = "#bba77d";
    c.fillRect(0, 0, 256, 512);
    for (let n = 0; n < 5000; n++) {
      c.fillStyle = n % 3 ? "rgba(75,54,24,.07)" : "rgba(242,223,167,.1)";
      c.fillRect((n * 137) % 256, (n * 73) % 512, 1 + (n % 3), 2);
    }
    c.fillStyle = "rgba(78,70,40,.2)";
    c.beginPath();
    c.ellipse(128, 85, 20, 47, 0, 0, 7);
    c.ellipse(128, 427, 18, 47, 0, 0, 7);
    c.fill();
  });
  const pitch = mesh(
    scene,
    new T.PlaneGeometry(3.05, STUMPS_Z * 2),
    new T.MeshStandardMaterial({ map: pitchTexture, roughness: 1 }),
    0,
    0.002,
    0,
  );
  pitch.rotation.x = -Math.PI / 2;
  const paint = new T.MeshBasicMaterial({ color: "#e8e8d1" });
  for (const sign of [-1, 1]) {
    for (const z of [CREASE_Z, STUMPS_Z]) {
      const line = mesh(
        scene,
        new T.PlaneGeometry(z === CREASE_Z ? 3.8 : 2.64, 0.045),
        paint,
        0,
        0.012,
        sign * z,
      );
      line.rotation.x = -Math.PI / 2;
    }
    for (const x of [-1.32, 1.32]) {
      const line = mesh(
        scene,
        new T.PlaneGeometry(0.04, 2.6),
        paint,
        x,
        0.014,
        sign * (CREASE_Z + 0.2),
      );
      line.rotation.x = -Math.PI / 2;
    }
  }
  class Rope extends T.Curve<T.Vector3> {
    constructor() {
      super();
    }
    override getPoint(t: number, target = new T.Vector3()) {
      return target.set(
        Math.sin(t * Math.PI * 2) * venue.radiusX,
        0.09,
        Math.cos(t * Math.PI * 2) * venue.radiusZ,
      );
    }
  }
  mesh(
    scene,
    new T.TubeGeometry(new Rope(), 192, 0.045, 5, true),
    material("#e7ddbb"),
  );
  const rail = material("#172e3d"),
    stone = material(venue.night ? "#344658" : "#d8cdb7"),
    roof = material(venue.night ? "#93a6b2" : "#ebe3c9");
  for (let sector = 0; sector < 12; sector++) {
    const a0 = (sector * Math.PI) / 6 + 0.035,
      a1 = ((sector + 1) * Math.PI) / 6 - 0.035;
    mesh(scene, terrace(71, 91, 1, 12, a0, a1), stone);
    mesh(scene, terrace(78, 94, 15, 16.5, a0, a1), roof);
    const a = (a0 + a1) / 2;
    for (const angle of [a0, a1]) {
      const pillar = mesh(
        scene,
        new T.BoxGeometry(0.35, 15, 0.35),
        rail,
        Math.sin(angle) * 83,
        7.5,
        Math.cos(angle) * 83 * 1.08,
      );
      pillar.rotation.y = -angle;
    }
    if (sector % 3 === 1) {
      const gate = mesh(
        scene,
        new T.BoxGeometry(7, 6, 1.2),
        material(TEAMS[sector % 2]!.dark),
        Math.sin(a) * 69,
        3,
        Math.cos(a) * 69 * 1.08,
      );
      gate.rotation.y = a;
    }
  }
  const crowdG = new T.IcosahedronGeometry(0.34, 0),
    crowdM = material("#d7cbb8"),
    crowd = new T.InstancedMesh(crowdG, crowdM, settings.crowd);
  const dummy = new T.Object3D();
  const crowdBase: { x: number; y: number; z: number }[] = [];
  for (let n = 0; n < settings.crowd; n++) {
    const row = n % 12,
      a = ((n * 0.61803398875) % 1) * Math.PI * 2,
      r = 72 + row * 1.35;
    const x = Math.sin(a) * r,
      z = Math.cos(a) * r * 1.08,
      y = 2 + row * 0.87;
    crowdBase.push({ x, y, z });
    dummy.position.set(x, y, z);
    dummy.scale.set(0.7, 1.4, 0.65);
    dummy.updateMatrix();
    crowd.setMatrixAt(n, dummy.matrix);
    crowd.setColorAt(
      n,
      new T.Color(
        ["#d9c8ab", TEAMS[0].color, TEAMS[1].color, "#b5c0d0", "#29384f"][
          n % 5
        ]!,
      ),
    );
  }
  scene.add(crowd);
  for (const z of [-70, 70]) {
    mesh(scene, new T.BoxGeometry(14, 7, 0.5), material("#e5e4dc"), 0, 4, z);
    const back = mesh(scene, new T.BoxGeometry(15, 0.35, 1), rail, 0, 7.6, z);
    back.castShadow = false;
  }
  for (let n = 0; n < 4; n++) {
    const angle = (n * Math.PI) / 2 + Math.PI / 4,
      x = Math.sin(angle) * 67,
      z = Math.cos(angle) * 74;
    mesh(
      scene,
      new T.CylinderGeometry(0.18, 0.45, 28, 8),
      material("#8295a0", 0.5),
      x,
      14,
      z,
    );
    const head = mesh(scene, new T.BoxGeometry(9, 3, 0.45), rail, x, 27, z);
    head.lookAt(0, 1, 0);
    const lights = new T.MeshBasicMaterial({
      color: venue.night ? "#f5f5db" : "#c4cccd",
    });
    for (let l = 0; l < 12; l++) {
      const bulb = new T.Mesh(new T.PlaneGeometry(0.92, 0.58), lights);
      bulb.position.set(
        ((l % 6) - 2.5) * 1.3,
        Math.floor(l / 6) * 1.1 - 0.5,
        0.25,
      );
      head.add(bulb);
    }
    if (venue.night && (quality === "high" || quality === "ultra")) {
      const light = new T.SpotLight("#d9edff", 1600, 140, 0.7, 0.8, 1.5);
      light.position.set(x, 26, z);
      light.target.position.set(0, 0, 0);
      scene.add(light, light.target);
    }
  }
  const adTexture = canvasTexture(1024, 128, (c) => {
    c.fillStyle = "#0d3237";
    c.fillRect(0, 0, 1024, 128);
    c.fillStyle = "#7ee8c8";
    c.font = "bold 45px sans-serif";
    c.textAlign = "center";
    c.fillText("SINVERSE   /   FIELDCRAFT", 512, 78);
  });
  const adMat = new T.MeshBasicMaterial({ map: adTexture, side: T.DoubleSide });
  for (let n = 0; n < 18; n++) {
    const a = (n * Math.PI) / 9,
      p = mesh(
        scene,
        new T.PlaneGeometry(17, 1.1),
        adMat,
        Math.sin(a) * 65,
        0.65,
        Math.cos(a) * 70,
      );
    p.lookAt(0, 0.65, 0);
  }
  if (!venue.night) {
    const ocean = mesh(
      scene,
      new T.PlaneGeometry(500, 250),
      material("#4c9aab", 0.35),
      0,
      -0.08,
      -200,
    );
    ocean.rotation.x = -Math.PI / 2;
  }
  const scoreboard = canvasTexture(512, 256, (c) => {
    c.fillStyle = "#082632";
    c.fillRect(0, 0, 512, 256);
  });
  const scoreMesh = mesh(
    scene,
    new T.PlaneGeometry(15, 7.5),
    new T.MeshBasicMaterial({ map: scoreboard }),
    0,
    18,
    -92,
  );
  scoreMesh.rotation.x = -0.06;
  let oldScore = "";
  const athletes: Athlete[] = [
    athlete("bat", 1, config.team, true),
    athlete("bat", 2, config.team, true),
    ...Array.from({ length: 11 }, (_, n) =>
      athlete(
        n === 10 ? "keeper" : n === 9 ? "bowl" : "field",
        n + 1,
        1 - config.team,
        n >= 9,
      ),
    ),
  ];
  athletes.forEach((a, n) => {
    scene.add(a.root);
    if (settings.shadows && (n < 2 || n >= 11))
      a.root.traverse((node) => {
        if (node === a.torso || a.trousers.includes(node as T.Mesh))
          (node as T.Mesh).castShadow = true;
      });
  });
  const shadowTexture = canvasTexture(64, 64, (c) => {
    const gradient = c.createRadialGradient(32, 32, 3, 32, 32, 31);
    gradient.addColorStop(0, "rgba(0,12,16,.34)");
    gradient.addColorStop(1, "rgba(0,12,16,0)");
    c.fillStyle = gradient;
    c.fillRect(0, 0, 64, 64);
  });
  const shadowMaterial = new T.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
  });
  const shadows = athletes.map(() => {
    const shadow = mesh(scene, new T.PlaneGeometry(1.3, 0.9), shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    return shadow;
  });
  const stumpMat = material("#e5d3a1"),
    bails: T.Mesh[] = [];
  for (const z of [-STUMPS_Z, STUMPS_Z]) {
    for (const x of [-0.0762, 0, 0.0762])
      mesh(
        scene,
        new T.CylinderGeometry(0.017, 0.018, 0.7112, 8),
        stumpMat,
        x,
        0.3556,
        z,
      );
    for (const x of [-0.038, 0.038]) {
      const bail = mesh(
        scene,
        new T.CylinderGeometry(0.008, 0.008, 0.081, 6),
        stumpMat,
        x,
        0.718,
        z,
      );
      bail.rotation.z = Math.PI / 2;
      if (z > 0) bails.push(bail);
    }
  }
  const ballMat = material("#fff1d6", 0.55),
    ball = mesh(scene, new T.SphereGeometry(0.045, 12, 8), ballMat);
  const seam = new T.Mesh(
    new T.TorusGeometry(0.0455, 0.002, 3, 24),
    material("#cd7758"),
  );
  ball.add(seam);
  const trailGeo = new T.BufferGeometry().setFromPoints(
    Array.from({ length: 28 }, () => v3()),
  );
  const trail = new T.Line(
    trailGeo,
    new T.LineBasicMaterial({
      color: "#f9d88c",
      transparent: true,
      opacity: 0.65,
    }),
  );
  scene.add(trail);
  const points: T.Vector3[] = [];
  const target = v3(),
    look = v3(0, 0.6, 0),
    desired = v3();
  let lastTick = -1,
    disposed = false,
    width = 0,
    height = 0,
    wicketAt = -1,
    wasWicket = false;
  const bailImpulse = v3();
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
    renderer.setSize(w, h, false);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  const setTeam = (a: Athlete, team: number, number: number) => {
    if (a.team === team && a.number === number) return;
    const mat = a.torso.material as T.MeshStandardMaterial;
    const old = mat.map;
    mat.map = cloth(team, number);
    old?.dispose();
    mat.needsUpdate = true;
    a.number = number;
    for (const m of a.trousers)
      (m.material as T.MeshStandardMaterial).color.set(TEAMS[team]!.dark);
    a.team = team;
  };
  return {
    draw(feed) {
      if (disposed) return;
      const { frame, shot, outcome } = feed;
      resize();
      for (let n = 0; n < athletes.length; n++) {
        const a = athletes[n]!;
        setTeam(
          a,
          n < 2 ? feed.battingTeam : 1 - feed.battingTeam,
          feed.actorNumbers?.[n] ?? a.number,
        );
        let px = 0,
          pz = 0,
          py = 0,
          action = "ready";
        if (n === 0) {
          const run = frame.runner % 2,
            progress = run <= 1 ? run : 2 - run;
          pz = CREASE_Z * (1 - progress * 2);
          px = -0.36 + (frame.runner > 0 ? 0.3 : 0);
          if (frame.runner === 0) pz = frame.batterGroundZ;
        } else if (n === 1) {
          const run = frame.runner % 2,
            progress = run <= 1 ? run : 2 - run;
          pz = -CREASE_Z * (1 - progress * 2);
          px = 0.65;
        } else {
          const f = frame.fielders[n - 2]!;
          px = f.x;
          pz = f.z;
          action = frame.actions[n - 2] ?? "ready";
          if (n === 11 && frame.tick < RELEASE_TICK) {
            pz =
              -20 +
              (20 + frame.bowlerFootZ - 0.12) *
                smooth(frame.tick / RELEASE_TICK);
            action = "run";
          }
        }
        const next = v3(px, py, pz),
          movement = next.distanceTo(a.previous);
        if (n < 2) a.phase = frame.runner * CREASE_Z * 16;
        else if (n === 11 && frame.tick < RELEASE_TICK) a.phase = (pz + 20) * 8;
        else
          a.phase =
            (frame.travel[n - 2] ?? 0) *
            (n === 12 ? 4.8 : 6.6 + ((n - 2) % 3) * 0.3) *
            8;
        const moving = movement > 0.0005 && movement < 2;
        const facing = moving
          ? Math.atan2(px - a.previous.x, pz - a.previous.z)
          : n === 0
            ? Math.PI
            : n === 1
              ? 0
              : Math.atan2(frame.ball.x - px, frame.ball.z - pz);
        a.root.rotation.y = T.MathUtils.lerp(a.root.rotation.y, facing, 0.25);
        a.root.position.copy(next);
        shadows[n]!.position.set(px, 0.018, pz);
        a.previous.copy(next);
        a.pelvis.position.y =
          0.93 + (moving ? Math.abs(Math.sin(a.phase)) * 0.025 : 0);
        a.chest.rotation.set(0, 0, 0);
        for (let l = 0; l < 2; l++) {
          legPose(
            a.legs[l]!,
            moving
              ? Math.sin(a.phase + l * Math.PI) * 0.28
              : n === 0
                ? l === 0
                  ? 0.15
                  : -0.08
                : 0,
            moving ? Math.max(0, Math.cos(a.phase + l * Math.PI)) * 0.13 : 0,
          );
          const arm = a.arms[l]!;
          arm.upper.rotation.set(
            moving ? Math.sin(a.phase + l * Math.PI) * 0.65 : 0,
            0,
            (l === 0 ? -1 : 1) * 0.1,
          );
          arm.lower.rotation.set(moving ? -0.4 : 0, 0, 0);
          arm.hand.rotation.set(0, 0, 0);
        }
        if (n === 0 && frame.runner === 0) {
          const phase = shot ? (frame.tick - shot.tick) / 42 : -1,
            u = smooth(phase);
          a.chest.rotation.y = shot
            ? Math.sin((shot.direction * Math.PI) / 180) * u * 0.7
            : 0;
          const arm = a.arms[1]!;
          arm.upper.rotation.set(-0.85 - u * 1.4, 0, -0.17 - u * 0.35);
          arm.lower.rotation.x = -0.65 + u * 0.4;
          arm.hand.rotation.set(0.2 - u * 0.65, 0, shot?.face ?? 0);
          a.chest.rotation.x = 0.09;
          gripLeft(a);
        }
        if (n === 11 && frame.tick < RELEASE_TICK + 55) {
          const wind = smooth((frame.tick - RELEASE_TICK + 35) / 70);
          a.arms[1]!.upper.rotation.x = -wind * Math.PI * 2;
          a.arms[0]!.upper.rotation.x = -Math.sin(wind * Math.PI) * 2.7;
          a.chest.rotation.x = 0.12;
        }
        if (n === 12) {
          a.pelvis.position.y = 0.68;
          for (const leg of a.legs) legPose(leg, 0.08, 0.22);
          a.chest.rotation.x = 0.28;
          for (const arm of a.arms) {
            arm.upper.rotation.x = -0.85;
            arm.lower.rotation.x = -0.8;
          }
        }
        if (action === "dive") {
          a.root.rotation.z = 0.8;
          a.pelvis.position.y = 0.3;
          for (const arm of a.arms) arm.upper.rotation.x = -1.8;
        } else {
          a.root.rotation.z *= 0.8;
          if (action === "catch" || action === "throw") {
            for (const arm of a.arms) arm.upper.rotation.x = -2.4;
          }
        }
      }
      ball.position.set(frame.ball.x, frame.ball.y, frame.ball.z);
      ball.visible = frame.tick >= RELEASE_TICK;
      ball.scale.setScalar(
        Math.max(
          1,
          Math.min(2.6, camera.position.distanceTo(ball.position) / 18),
        ),
      );
      ball.rotation.x = frame.tick * 0.12;
      if (frame.tick !== lastTick) {
        if (frame.tick < lastTick || frame.tick === 0) points.length = 0;
        points.push(ball.position.clone());
        while (points.length > 28) points.shift();
        const attr = trailGeo.getAttribute("position") as T.BufferAttribute;
        for (let n = 0; n < 28; n++) {
          const p =
            points[Math.max(0, points.length - 28 + n)] ?? ball.position;
          attr.setXYZ(n, p.x, p.y, p.z);
        }
        attr.needsUpdate = true;
        trailGeo.computeBoundingSphere();
        lastTick = frame.tick;
      }
      trail.visible = ball.visible;
      const bowlingWicket =
        outcome?.wicket === "bowled" && frame.mode === "dead";
      if (bowlingWicket && !wasWicket) {
        wicketAt = feed.time;
        const a = points.at(-2),
          b = points.at(-1);
        if (a && b)
          bailImpulse
            .copy(b)
            .sub(a)
            .multiplyScalar(1 / (STEP * 3));
      }
      if (!bowlingWicket) wicketAt = -1;
      wasWicket = bowlingWicket;
      bails.forEach((b, n) => {
        const elapsed =
          wicketAt < 0 ? 0 : Math.min(1.5, Math.max(0, feed.time - wicketAt));
        const lift = T.MathUtils.clamp(bailImpulse.length() * 0.07, 1, 3);
        b.position.set(
          (n === 0 ? -0.038 : 0.038) + elapsed * (n ? 0.7 : -0.7),
          Math.max(0.025, 0.718 + elapsed * lift - 4.9 * elapsed ** 2),
          STUMPS_Z + elapsed * bailImpulse.z * 0.06,
        );
        b.rotation.x = elapsed * 8;
        b.visible = true;
      });
      let chosen = feed.camera;
      if (chosen === "broadcast" && frame.tick > 0)
        chosen =
          frame.contact && !feed.reducedMotion
            ? "track"
            : feed.humanBatting
              ? "batter"
              : "bowler";
      if (chosen === "track") {
        desired.copy(ball.position).add(v3(-10, 9, 17));
        look.copy(ball.position).multiplyScalar(0.7);
        look.y = Math.max(1, look.y);
      } else if (chosen === "batter") {
        desired.set(0.6, 3.3, 17.4);
        look.set(0, 1, -4);
      } else if (chosen === "bowler") {
        desired.set(-1.3, 4.2, -22);
        look.set(0, 0.8, 8);
      } else if (chosen === "side") {
        desired.set(31, 7, 3);
        look.set(0, 1, 1);
      } else if (chosen === "aerial") {
        desired.set(0, 82, 25);
        look.set(0, 0, 0);
      } else {
        desired.set(-32, 24, 43);
        look.set(0, 1, 0);
      }
      camera.position.lerp(desired, feed.reducedMotion ? 1 : 0.08);
      target.lerp(look, feed.reducedMotion ? 1 : 0.14);
      camera.lookAt(target);
      if (
        outcome?.boundary === 6 &&
        frame.mode === "dead" &&
        !feed.reducedMotion &&
        quality !== "low"
      ) {
        for (let n = 0; n < Math.min(300, settings.crowd); n++) {
          const base = crowdBase[n]!;
          dummy.position.set(
            base.x,
            base.y + Math.max(0, Math.sin(feed.time * 6 + n)) * 0.4,
            base.z,
          );
          dummy.scale.set(0.7, 1.4, 0.65);
          dummy.updateMatrix();
          crowd.setMatrixAt(n, dummy.matrix);
        }
        crowd.instanceMatrix.needsUpdate = true;
      }
      if (oldScore !== feed.score) {
        oldScore = feed.score;
        const source = scoreboard.image as HTMLCanvasElement,
          c = source.getContext("2d")!;
        c.fillStyle = "#092936";
        c.fillRect(0, 0, 512, 256);
        c.textAlign = "center";
        c.fillStyle = "#6de2c5";
        c.font = "bold 26px sans-serif";
        c.fillText("SINVERSE CRICKET", 256, 55);
        c.fillStyle = "#f1ead2";
        c.font = "bold 32px sans-serif";
        feed.score
          .split("|")
          .forEach((line, n) => c.fillText(line, 256, 112 + n * 45));
        scoreboard.needsUpdate = true;
      }
      renderer.render(scene, camera);
    },
    metrics: () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      textures: renderer.info.memory.textures,
      geometries: renderer.info.memory.geometries,
      dpr,
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
        const m = node as T.Mesh;
        if (m.geometry) geometries.add(m.geometry);
        if (m.material)
          for (const mat of Array.isArray(m.material)
            ? m.material
            : [m.material]) {
            materials.add(mat);
            for (const value of Object.values(mat))
              if (value instanceof T.Texture) textures.add(value);
          }
      });
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
      geometries.forEach((g) => g.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
