import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CREASE_Z, STUMPS_Z, TEAMS, VENUES, type CricketConfig } from "@platform/engines/sinverse-cricket";

/**
 * The ground: outfield, pitch, stands, roofs, floodlights, screens and crowd.
 * Static parts are merged by material, so the whole stadium costs a handful of
 * draw calls. The crowd is one instanced mesh animated in its vertex shader:
 * reacting to a six costs one uniform, not thousands of matrix updates.
 * Everything is generated here; no external models or textures.
 */

export type Lighting = "day" | "evening" | "night";
export const lightingFor = (venue: CricketConfig["venue"], chosen: Lighting | "ground"): Lighting => (chosen === "ground" ? (VENUES[venue].night ? "night" : "day") : chosen);

export const QUALITY = {
  low: { dpr: 1, maxWidth: 960, envStandard: false, antialias: false, shadows: 0, crowd: 500, ground: 512, detail: 0 as const, closeDetail: 1 as const, standard: false, fielderEvery: 2, particles: 24 },
  medium: { dpr: 1.25, maxWidth: 1600, envStandard: false, antialias: true, shadows: 0, crowd: 1400, ground: 1024, detail: 1 as const, closeDetail: 2 as const, standard: true, fielderEvery: 1, particles: 60 },
  high: { dpr: 1.5, maxWidth: 2200, envStandard: false, antialias: true, shadows: 1024, crowd: 2600, ground: 1024, detail: 1 as const, closeDetail: 2 as const, standard: true, fielderEvery: 1, particles: 110 },
  ultra: { dpr: 2, maxWidth: 3200, envStandard: true, antialias: true, shadows: 2048, crowd: 4600, ground: 2048, detail: 2 as const, closeDetail: 2 as const, standard: true, fielderEvery: 1, particles: 180 },
};
export type QualityName = keyof typeof QUALITY;

export const LIGHTS: Record<Lighting, { sky: [string, string, string]; fog: string; hemiSky: string; hemiGround: string; hemi: number; key: string; keyI: number; keyPos: [number, number, number]; exposure: number; glow: number }> = {
  day: { sky: ["#3f83c4", "#9cc9e6", "#e6eef0"], fog: "#c6dbe4", hemiSky: "#e8f1ff", hemiGround: "#6d7d4a", hemi: 1.15, key: "#fff2d6", keyI: 2.7, keyPos: [-30, 58, 24], exposure: 0.92, glow: 0 },
  evening: { sky: ["#2a2f63", "#b65c5a", "#f6b271"], fog: "#c88a6e", hemiSky: "#ffd0a8", hemiGround: "#4b4a39", hemi: 0.95, key: "#ffc48a", keyI: 2.4, keyPos: [-58, 20, -30], exposure: 0.9, glow: 0.55 },
  night: { sky: ["#080d23", "#152345", "#304468"], fog: "#15233c", hemiSky: "#c0d4ef", hemiGround: "#3c5134", hemi: 0.9, key: "#fff3dc", keyI: 2.6, keyPos: [-16, 44, 18], exposure: 1.0, glow: 1 },
};

function texture(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void, srgb = true) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d");
  if (!c) throw Error("Texture canvas unavailable");
  paint(c);
  const tex = new T.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = T.SRGBColorSpace;
  return tex;
}
const noise = (seed: number) => {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
};

export interface Stadium {
  group: T.Group;
  /** Call per frame; `excite` is 0–1 crowd energy, `favour` tilts it towards one end. */
  update(time: number, excite: number): void;
  setScore(lines: string): void;
  dispose(): void;
}

export function buildStadium(config: CricketConfig, quality: QualityName, lightingChoice: Lighting | "ground", maxAniso: number, makeMat: (o: { color?: T.ColorRepresentation; map?: T.Texture; roughness?: number; metalness?: number; vertexColors?: boolean; side?: T.Side }) => T.Material): Stadium {
  const q = QUALITY[quality],
    v = VENUES[config.venue],
    light = LIGHTS[lightingFor(config.venue, lightingChoice)],
    group = new T.Group(),
    tideglass = config.venue === "tideglass",
    owned: { dispose(): void }[] = [];
  const keep = <D extends { dispose(): void }>(x: D) => (owned.push(x), x);

  // Sky dome: painted gradient, stars or thin cloud, and a distant skyline.
  const sky = keep(
    texture(64, 512, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 512);
      g.addColorStop(0, light.sky[0]);
      g.addColorStop(0.62, light.sky[1]);
      g.addColorStop(1, light.sky[2]);
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 512);
    }),
  );
  const dome = new T.Mesh(keep(new T.SphereGeometry(330, 24, 12)), keep(new T.MeshBasicMaterial({ map: sky, side: T.BackSide, fog: false })));
  // Drawn after everything solid, so pixels hidden by the stands and the ground are never shaded.
  dome.renderOrder = 9;
  group.add(dome);
  const skyline = keep(
    texture(1024, 128, (c) => {
      c.clearRect(0, 0, 1024, 128);
      const r = noise(tideglass ? 91 : 17);
      c.fillStyle = light.glow > 0.8 ? "#0a1426" : tideglass ? "#6c8a98" : "#7d7f8c";
      if (tideglass)
        for (let x = 0; x < 1024; x += 3) {
          const h = 34 + Math.sin(x * 0.012) * 20 + Math.sin(x * 0.041) * 8;
          c.fillRect(x, 128 - h, 3, h);
        }
      else {
        for (let x = 0; x < 1024; ) {
          const w = 18 + r() * 34,
            h = 28 + r() * 86;
          c.fillRect(x, 128 - h, w, h);
          if (light.glow > 0.3) {
            c.fillStyle = "rgba(255,214,140,.75)";
            for (let wy = 128 - h + 6; wy < 124; wy += 8) for (let wx = x + 3; wx < x + w - 3; wx += 6) if (r() > 0.55) c.fillRect(wx, wy, 2.5, 3.5);
            c.fillStyle = light.glow > 0.8 ? "#0a1426" : "#7d7f8c";
          }
          x += w + r() * 6;
        }
      }
    }),
  );
  skyline.wrapS = T.RepeatWrapping;
  skyline.repeat.x = 3;
  const horizon = new T.Mesh(keep(new T.CylinderGeometry(300, 300, 58, 32, 1, true)), keep(new T.MeshBasicMaterial({ map: skyline, side: T.BackSide, transparent: true, fog: false })));
  horizon.position.y = 22;
  group.add(horizon);

  // Outfield: mown stripes, circular collar near the rope, worn square, 30-yard ring.
  const size = q.ground;
  const outfield = keep(
    texture(size, size, (c) => {
      const k = size / 1024,
        r = noise(41),
        cx = size / 2,
        cy = size / 2;
      c.fillStyle = "#336f45";
      c.fillRect(0, 0, size, size);
      const bands = 26,
        band = size / bands;
      for (let n = 0; n < bands; n++) {
        c.fillStyle = n % 2 ? "#3a7a4b" : "#2f6840";
        c.fillRect(n * band, 0, band, size);
      }
      c.save();
      c.globalCompositeOperation = "multiply";
      for (let n = 0; n < 12; n++) {
        c.fillStyle = n % 2 ? "rgba(255,255,255,1)" : "rgba(226,232,224,1)";
        c.fillRect(0, (n * size) / 12, size, size / 12);
      }
      c.restore();
      // Rope collar: mown in rings.
      for (let n = 0; n < 6; n++) {
        c.strokeStyle = n % 2 ? "rgba(70,125,80,.65)" : "rgba(40,92,56,.65)";
        c.lineWidth = 18 * k;
        c.beginPath();
        c.ellipse(cx, cy, size * 0.495 - n * 18 * k, size * 0.495 - n * 18 * k, 0, 0, 7);
        c.stroke();
      }
      // Wear around the square and at the bowlers' run-ups.
      const wear = c.createRadialGradient(cx, cy, 10 * k, cx, cy, 190 * k);
      wear.addColorStop(0, "rgba(150,140,84,.5)");
      wear.addColorStop(0.5, "rgba(120,126,72,.2)");
      wear.addColorStop(1, "rgba(120,126,72,0)");
      c.fillStyle = wear;
      c.fillRect(0, 0, size, size);
      c.fillStyle = "rgba(120,110,70,.22)";
      for (const dir of [-1, 1]) c.fillRect(cx - 20 * k, cy + dir * 80 * k - (dir < 0 ? 150 * k : 0), 40 * k, 150 * k);
      // Fine grain.
      const specks = Math.round(16000 * k * k);
      for (let n = 0; n < specks; n++) {
        c.fillStyle = n % 2 ? "rgba(214,226,150,.07)" : "rgba(6,40,24,.1)";
        c.fillRect(r() * size, r() * size, 1 + k, 2 * k + 1);
      }
      // Inner circle marker dashes.
      c.strokeStyle = "rgba(240,240,225,.32)";
      c.lineWidth = 2.4 * k;
      c.setLineDash([12 * k, 22 * k]);
      c.beginPath();
      c.ellipse(cx, cy, size * 0.27, size * 0.28, 0, 0, 7);
      c.stroke();
      c.setLineDash([]);
      // Floodlights pool on the grass at night.
      if (light.glow > 0.2) {
        const pool = c.createRadialGradient(cx, cy, 40 * k, cx, cy, size * 0.54);
        pool.addColorStop(0, `rgba(255,255,240,${0.12 * light.glow})`);
        pool.addColorStop(1, "rgba(0,8,20,.18)");
        c.fillStyle = pool;
        c.fillRect(0, 0, size, size);
      }
    }),
  );
  outfield.anisotropy = Math.min(q.envStandard ? 8 : q.standard ? 2 : 1, maxAniso);
  const fieldR = Math.max(v.radiusX, v.radiusZ) + 12;
  const ground = new T.Mesh(keep(new T.CircleGeometry(fieldR, 72)), keep(makeMat({ map: outfield, roughness: 1 })));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.025;
  ground.receiveShadow = true;
  // After the pitch, players and stands, which cover a good part of it.
  ground.renderOrder = 2;
  group.add(ground);

  // Pitch.
  const pitchTex = keep(
    texture(256, 1024, (c) => {
      const r = noise(7);
      c.fillStyle = "#c4b087";
      c.fillRect(0, 0, 256, 1024);
      for (let n = 0; n < 9000; n++) {
        c.fillStyle = n % 3 ? "rgba(84,62,28,.07)" : "rgba(246,230,180,.09)";
        c.fillRect(r() * 256, r() * 1024, 1 + r() * 2.4, 1 + r() * 3);
      }
      // Grass tufts at the edges.
      for (let n = 0; n < 700; n++) {
        c.fillStyle = `rgba(70,110,60,${0.08 + r() * 0.2})`;
        const x = r() < 0.5 ? r() * 30 : 226 + r() * 30;
        c.fillRect(x, r() * 1024, 2, 5);
      }
      // Footmarks: back-foot scuffs and rough outside off, where bowlers land.
      c.fillStyle = "rgba(86,68,38,.38)";
      for (const [y, x] of [[116, 150], [130, 106], [894, 106], [908, 150]] as const) {
        c.beginPath();
        c.ellipse(x, y, 19, 40, 0, 0, 7);
        c.fill();
      }
      // A good-length patch worn slightly darker.
      c.fillStyle = "rgba(90,74,44,.16)";
      c.fillRect(70, 700, 116, 120);
      c.fillRect(70, 204, 116, 120);
      for (let n = 0; n < 60; n++) {
        c.fillStyle = "rgba(60,44,20,.32)";
        c.fillRect(70 + r() * 116, 204 + r() * 120, 1 + r() * 3, 1 + r() * 3);
        c.fillRect(70 + r() * 116, 700 + r() * 120, 1 + r() * 3, 1 + r() * 3);
      }
    }),
  );
  pitchTex.anisotropy = Math.min(q.standard ? 4 : 1, maxAniso);
  const pitch = new T.Mesh(keep(new T.PlaneGeometry(3.05, STUMPS_Z * 2 + 2.4)), keep(makeMat({ map: pitchTex, roughness: 1 })));
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0.002;
  pitch.receiveShadow = true;
  group.add(pitch);

  // Creases and rope, merged.
  const lines: T.BufferGeometry[] = [];
  const flat = (w: number, d: number, x: number, z: number, y = 0.012) => {
    const g = new T.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    g.translate(x, y, z);
    lines.push(g);
  };
  for (const s of [-1, 1]) {
    flat(3.66, 0.05, 0, s * CREASE_Z);
    flat(2.64, 0.05, 0, s * STUMPS_Z);
    for (const x of [-1.32, 1.32]) flat(0.05, 2.5, x, s * (CREASE_Z + 0.25));
    flat(0.05, 1.22, 0.92, s * (CREASE_Z + 0.61));
    flat(0.05, 1.22, -0.92, s * (CREASE_Z + 0.61));
  }
  const paint = new T.Mesh(keep(mergeGeometries(lines)!), keep(new T.MeshBasicMaterial({ color: "#efeedd" })));
  lines.forEach((g) => g.dispose());
  group.add(paint);
  class RopeCurve extends T.Curve<T.Vector3> {
    constructor() {
      super();
    }
    override getPoint(u: number, target = new T.Vector3()) {
      return target.set(Math.sin(u * Math.PI * 2) * v.radiusX, 0.08, Math.cos(u * Math.PI * 2) * v.radiusZ);
    }
  }
  group.add(new T.Mesh(keep(new T.TubeGeometry(new RopeCurve(), 140, 0.05, 5, true)), keep(new T.MeshLambertMaterial({ color: "#f1e9cc" }))));

  // Static architecture: collected by material then merged.
  const parts = new Map<string, T.BufferGeometry[]>();
  const add = (key: string, g: T.BufferGeometry) => {
    const list = parts.get(key) ?? [];
    if (g.index) g = g.toNonIndexed();
    g.deleteAttribute("uv2");
    if (!g.getAttribute("uv")) g.setAttribute("uv", new T.Float32BufferAttribute(new Float32Array((g.getAttribute("position").count as number) * 2), 2));
    list.push(g);
    parts.set(key, list);
  };
  const place = (g: T.BufferGeometry, x: number, y: number, z: number, ry = 0) => {
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return g;
  };
  const ringR = (a: number, r: number) => [Math.sin(a) * r * (v.radiusX / 58), Math.cos(a) * r * (v.radiusZ / 58)] as const;
  /** A curved band between two radii and heights (a terrace face, roof or wall). */
  const band = (r0: number, y0: number, r1: number, y1: number, a0: number, a1: number, steps = 8) => {
    const p: number[] = [],
      uv: number[] = [],
      idx: number[] = [];
    for (let n = 0; n <= steps; n++) {
      const a = a0 + ((a1 - a0) * n) / steps,
        [x0, z0] = ringR(a, r0),
        [x1, z1] = ringR(a, r1);
      p.push(x0, y0, z0, x1, y1, z1);
      uv.push(n / steps, 0, n / steps, 1);
    }
    for (let n = 0; n < steps; n++) {
      const i = n * 2;
      idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const sectors = 16;
  const roofH = tideglass ? 19 : 23;
  for (let s = 0; s < sectors; s++) {
    const gap = 0.018,
      a0 = (s / sectors) * Math.PI * 2 + gap,
      a1 = ((s + 1) / sectors) * Math.PI * 2 - gap,
      mid = (a0 + a1) / 2,
      // The pavilion end (behind the bowler's arm) is lower, with no upper tier.
      pavilion = Math.abs(Math.cos(mid)) > 0.93 && Math.cos(mid) < 0;
    add("seats", band(70, 1.6, 84, 10.5, a0, a1));
    add("concrete", band(70, 0.2, 70, 1.6, a0, a1));
    add("concrete", band(84, 10.5, 86, 11.6, a0, a1));
    if (!pavilion) {
      add("seats", band(86, 11.8, 99, 20, a0, a1));
      add("concrete", band(99, 20, 99, roofH + 1, a0, a1));
      add("roofUnder", band(102, roofH + 2, 79, roofH + (tideglass ? 3.5 : 0.5), a0, a1));
      add("roof", band(79, roofH + (tideglass ? 3.7 : 0.8), 102, roofH + 2.4, a0, a1));
      const [px, pz] = ringR(mid, 92);
      add("steel", place(new T.BoxGeometry(0.5, roofH, 0.5), px, roofH / 2, pz));
    }
    // A tunnel mouth into every other stand.
    if (s % 2 === 0) {
      const [tx, tz] = ringR(mid, 70.2);
      add("dark", place(new T.BoxGeometry(5, 2.1, 0.5), tx, 1.05, tz, mid));
      const [wx, wz] = ringR(mid, 77);
      add("concrete", place(new T.BoxGeometry(1.1, 0.25, 13), wx, 6, wz, mid));
    }
  }
  // Pavilion: a gabled end with a clock, distinct for each ground.
  const pz = -ringR(0, 92)[1];
  add("concrete", place(new T.BoxGeometry(34, 10, 7), 0, 16, pz));
  if (tideglass) {
    for (let n = -2; n <= 2; n++) {
      const sail = new T.ConeGeometry(4.2, 11, 3, 1);
      add("roof", place(sail, n * 7.4, 26.4, pz + 1));
    }
  } else {
    add("roof", place(new T.ConeGeometry(21, 8, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.3), 0, 25, pz));
    add("dark", place(new T.CylinderGeometry(2.1, 2.1, 0.3, 16).rotateX(Math.PI / 2), 0, 25.5, pz + 3.4));
  }
  add("dark", place(new T.BoxGeometry(31, 3.2, 0.3), 0, 15.2, pz + 3.6));

  // Sight screens at both ends.
  for (const z of [-1, 1]) {
    const zz = z * (v.radiusZ + 2.6);
    add("screen", place(new T.BoxGeometry(17, 7, 0.4), 0, 3.5, zz));
    add("steel", place(new T.BoxGeometry(17.6, 0.3, 0.8), 0, 7.1, zz));
    for (const x of [-7, 0, 7]) add("steel", place(new T.BoxGeometry(0.28, 7, 0.28), x, 3.5, zz - z * 0.5));
  }
  // Floodlight towers.
  const lamps: T.BufferGeometry[] = [];
  const towers: [number, number][] = [];
  for (let n = 0; n < 6; n++) {
    const a = (n / 6) * Math.PI * 2 + Math.PI / 6,
      [x, z] = ringR(a, 106);
    towers.push([x, z]);
    add("steel", place(new T.CylinderGeometry(0.35, 0.95, 44, 8), x, 22, z));
    const face = Math.atan2(-x, -z);
    add("steel", place(new T.BoxGeometry(11.5, 6, 0.8), x, 45, z, face));
    for (let l = 0; l < 20; l++) {
      const g = new T.PlaneGeometry(0.95, 0.95);
      g.translate(((l % 5) - 2) * 2.15, (Math.floor(l / 5) - 1.5) * 1.35, 0.46);
      g.rotateX(-0.28);
      lamps.push(place(g, x, 45, z, face));
    }
  }
  const lampMesh = new T.Mesh(keep(mergeGeometries(lamps)!), keep(new T.MeshBasicMaterial({ color: light.glow > 0.2 ? "#fbf7dc" : "#b8c0c4", fog: false, side: T.DoubleSide })));
  lamps.forEach((g) => g.dispose());
  group.add(lampMesh);
  // Glare around each lamp bank when the lights are on.
  if (light.glow > 0.2) {
    const halo = keep(
      texture(64, 64, (c) => {
        const g = c.createRadialGradient(32, 32, 2, 32, 32, 32);
        g.addColorStop(0, "rgba(255,250,225,.8)");
        g.addColorStop(0.3, "rgba(255,245,210,.22)");
        g.addColorStop(1, "rgba(255,245,210,0)");
        c.fillStyle = g;
        c.fillRect(0, 0, 64, 64);
      }),
    );
    const haloMat = keep(new T.SpriteMaterial({ map: halo, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: light.glow, fog: false }));
    for (const [x, z] of towers) {
      const s = new T.Sprite(haloMat);
      s.position.set(x, 45, z);
      s.scale.setScalar(32);
      group.add(s);
    }
  }
  // Scoreboard housing beneath the pavilion clock.
  const seatTex = keep(
    texture(256, 256, (c) => {
      const r = noise(tideglass ? 23 : 5);
      c.fillStyle = tideglass ? "#a4b9c4" : "#2a3a58";
      c.fillRect(0, 0, 256, 256);
      const fans = ["#d9c8ab", TEAMS[0]!.color, TEAMS[1]!.color, "#b5c0d0", "#39465e", "#efece0", "#a8454a", "#e0b24a"];
      for (let y = 0; y < 256; y += 13) {
        c.fillStyle = "rgba(0,0,0,.34)";
        c.fillRect(0, y + 8, 256, 5);
        for (let x = 0; x < 256; x += 8) {
          c.fillStyle = r() > 0.5 ? (tideglass ? "#d7e4e6" : "#3a5079") : tideglass ? "#8fb0bd" : "#23324e";
          c.fillRect(x + 1, y, 6, 8);
          // Most seats are taken: from a distance this reads as a full house,
          // while the instanced figures in front supply the movement.
          if (r() < 0.72) {
            c.fillStyle = fans[Math.floor(r() * fans.length)]!;
            c.fillRect(x + 2, y + 2, 4, 6);
            c.fillStyle = r() > 0.4 ? "#c99a78" : "#7a5238";
            c.fillRect(x + 3, y, 2, 2);
          }
        }
      }
    }),
  );
  seatTex.wrapS = seatTex.wrapT = T.RepeatWrapping;
  seatTex.repeat.set(5, 3);
  const palette: Record<string, T.Material> = {
    seats: keep(makeMat({ map: seatTex, roughness: 0.9, side: T.DoubleSide })),
    concrete: keep(makeMat({ color: light.glow > 0.8 ? "#5a6573" : tideglass ? "#e4dfd2" : "#b5b3ac", roughness: 0.95, side: T.DoubleSide })),
    roof: keep(makeMat({ color: tideglass ? "#f3f1e8" : "#7a8592", roughness: 0.55, metalness: 0.2, side: T.DoubleSide })),
    roofUnder: keep(makeMat({ color: "#454d5a", roughness: 0.85, side: T.DoubleSide })),
    steel: keep(makeMat({ color: "#7c8894", roughness: 0.5, metalness: 0.4 })),
    // Roof undersides, unlit: near black under floodlights, but they catch skylight by day.
    dark: keep(new T.MeshBasicMaterial({ color: light.glow > 0.8 ? "#0c1016" : light.glow > 0.2 ? "#3b3a42" : "#5a6068", side: T.DoubleSide })),
    screen: keep(makeMat({ color: "#f2f1ea", roughness: 0.95 })),
  };
  for (const [key, list] of parts) {
    const merged = keep(mergeGeometries(list, false)!);
    list.forEach((g) => g.dispose());
    const m = new T.Mesh(merged, palette[key]!);
    group.add(m);
  }

  // Boundary boards: one merged ring with an original wrap.
  const adTex = keep(
    texture(1024, 64, (c) => {
      const names = ["SINVERSE", "FIELDCRAFT", tideglass ? "TIDEGLASS PARK" : "LANTERN OVAL", "SINVERSE", "LONG ON"];
      const colors = ["#0e3a40", "#7a1f3b", "#1b2e63", "#3c2a0e", "#0f4a34"];
      names.forEach((name, n) => {
        c.fillStyle = colors[n]!;
        c.fillRect((n * 1024) / 5, 0, 1024 / 5, 64);
        c.fillStyle = "#f4f1dc";
        c.font = "800 24px system-ui, sans-serif";
        c.textAlign = "center";
        c.fillText(name, ((n + 0.5) * 1024) / 5, 42);
      });
    }),
  );
  adTex.wrapS = T.RepeatWrapping;
  adTex.repeat.x = 5;
  const boards = band(v.radiusX * (58 / v.radiusX) + 3.6, 0, v.radiusX * (58 / v.radiusX) + 3.6, 1.05, 0, Math.PI * 2, 64);
  owned.push(boards);
  group.add(new T.Mesh(boards, keep(new T.MeshBasicMaterial({ map: adTex, side: T.DoubleSide }))));

  if (tideglass) {
    const sea = new T.Mesh(keep(new T.CircleGeometry(300, 32)), keep(new T.MeshLambertMaterial({ color: "#3f8ea3" })));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.3;
    group.add(sea);
  }
  // Scoreboard: a live canvas fed only from the match's own score text.
  const scoreCanvasTex = keep(
    texture(512, 256, (c) => {
      c.fillStyle = "#061a24";
      c.fillRect(0, 0, 512, 256);
    }),
  );
  const scoreMesh = new T.Mesh(keep(new T.PlaneGeometry(22, 11)), keep(new T.MeshBasicMaterial({ map: scoreCanvasTex, fog: false })));
  scoreMesh.position.set(0, 18.5, pz + 3.8);
  group.add(scoreMesh);
  let lastScore = "";

  // Crowd: instanced figures. Reactions run in the vertex shader from one uniform.
  const count = q.crowd,
    figure = (() => {
      // Low-poly on purpose: about 22 triangles a person, since thousands share the screen.
      const body = new T.CylinderGeometry(0.15, 0.24, 0.72, 5, 1, true),
        head = new T.IcosahedronGeometry(0.14, 0);
      head.translate(0, 0.5, 0);
      const merged = mergeGeometries([body.toNonIndexed(), head.toNonIndexed()])!;
      body.dispose();
      head.dispose();
      return merged;
    })();
  keep(figure);
  const crowdMat = keep(new T.MeshLambertMaterial({ color: "#ffffff" }));
  const crowdUniforms = { uTime: { value: 0 }, uExcite: { value: 0 } };
  crowdMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = crowdUniforms.uTime;
    shader.uniforms.uExcite = crowdUniforms.uExcite;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime; uniform float uExcite;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec2 crowdSeed = instanceMatrix[3].xz;
        float crowdPhase = fract(sin(dot(crowdSeed, vec2(12.9898, 78.233))) * 43758.5453);
        float crowdWave = sin(uTime * (2.0 + 5.0 * uExcite) + crowdPhase * 6.283);
        transformed.y += max(0.0, crowdWave) * (0.02 + uExcite * 0.55);
        transformed.x += sin(uTime * 0.7 + crowdPhase * 9.0) * 0.03;`,
      );
  };
  const crowd = new T.InstancedMesh(figure, crowdMat, count);
  const r = noise(tideglass ? 73 : 31),
    dummy = new T.Object3D(),
    tones = ["#d9c8ab", TEAMS[0]!.color, TEAMS[1]!.color, "#b5c0d0", "#39465e", "#efece0", "#a8454a", "#e0b24a"];
  const color = new T.Color(),
    seatTone = new T.Color(tideglass ? "#a9b6bb" : "#4a5468");
  for (let n = 0; n < count; n++) {
    const a = r() * Math.PI * 2,
      upper = r() < 0.45 && !(Math.abs(Math.cos(a)) > 0.93 && Math.cos(a) < 0),
      depth = r(),
      radius = upper ? 87 + depth * 11 : 71 + depth * 12,
      y = upper ? 12.4 + depth * 7.4 : 2.1 + depth * 8,
      [x, z] = ringR(a, radius);
    dummy.position.set(x, y, z);
    dummy.rotation.y = a + Math.PI;
    const s = 0.82 + r() * 0.2;
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    crowd.setMatrixAt(n, dummy.matrix);
    // Blocks of each team's fans, loosely, with neutrals mixed in.
    const fan = Math.sin(a * 2) > 0.45 ? 1 : Math.sin(a * 2) < -0.45 ? 2 : Math.floor(r() * tones.length);
    color.set(r() < 0.42 ? tones[fan]! : tones[Math.floor(r() * tones.length)]!);
    // Softened towards the seat tone, so people sit in the stand rather than float over it.
    color.lerp(seatTone, 0.28);
    crowd.setColorAt(n, color);
  }
  crowd.instanceMatrix.needsUpdate = true;
  group.add(crowd);
  owned.push({ dispose: () => crowd.dispose() });

  return {
    group,
    update(time, excite) {
      crowdUniforms.uTime.value = time;
      crowdUniforms.uExcite.value = excite;
    },
    setScore(text) {
      if (text === lastScore) return;
      lastScore = text;
      const c = (scoreCanvasTex.image as HTMLCanvasElement).getContext("2d")!;
      c.fillStyle = "#061a24";
      c.fillRect(0, 0, 512, 256);
      c.strokeStyle = "#1b4d58";
      c.lineWidth = 6;
      c.strokeRect(6, 6, 500, 244);
      c.textAlign = "center";
      c.fillStyle = "#6de2c5";
      c.font = "800 26px system-ui, sans-serif";
      c.fillText("SINVERSE CRICKET", 256, 52);
      c.fillStyle = "#fff4cf";
      c.font = "800 34px ui-monospace, monospace";
      text.split("|").forEach((line, n) => c.fillText(line.trim(), 256, 108 + n * 48));
      scoreCanvasTex.needsUpdate = true;
    },
    dispose() {
      owned.forEach((o) => o.dispose());
      Object.values(palette).forEach((m) => m.dispose());
    },
  };
}
