import * as T from "three";
import { TEAMS } from "@platform/engines/sinverse-cricket";
import { BAT, CH, RIG, type BatPose, type Pose } from "./animation";

/**
 * Original procedural cricketers: one skinned mesh per person. Every body part
 * is merged into a single geometry bound to one skeleton, so a player costs one
 * draw call however detailed they are, and limbs bend as continuous skin with
 * blended weights at the joints rather than as separate rotating pieces.
 *
 * Colours come from a small per-team atlas (kit) and vertex colours (skin,
 * hair), so a whole body uses one material. All faces are fictional.
 */

export const BONES = ["hips", "spine", "chest", "neck", "head", "lUpper", "lFore", "lHand", "rUpper", "rFore", "rHand", "lThigh", "lShin", "lFoot", "rThigh", "rShin", "rFoot", "bat"] as const;
type BoneName = (typeof BONES)[number];
const B = Object.fromEntries(BONES.map((b, n) => [b, n])) as Record<BoneName, number>;

export type Role = "bat" | "field" | "keeper" | "bowl" | "umpire";
export interface Look {
  scale: number;
  build: number;
  skin: string;
  hair: string;
  hairStyle: 0 | 1 | 2 | 3;
  beard: 0 | 1 | 2;
  headwear: "helmet" | "cap" | "sunhat" | "bare";
}
const SKINS = ["#8d5a3c", "#c4916b", "#6e4630", "#dcae88", "#a87350", "#f0c8a4"];
const HAIRS = ["#17110d", "#2c1b12", "#4a2c18", "#1c1c22", "#6b4423", "#8c8c94"];
/** Deterministic fictional identity for a shirt number; never a real person's likeness. */
export function lookFor(role: Role, number: number, team: number): Look {
  // A small integer hash, so nearby shirt numbers don't get related looks.
  let h = Math.imul(number + 1, 2654435761) ^ Math.imul(team + 3, 40503);
  const next = (range: number) => {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    return (h >>> 8) % range;
  };
  const headwear = next(3);
  return {
    scale: 0.95 + next(11) * 0.011,
    build: 0.93 + next(9) * 0.018,
    skin: SKINS[next(SKINS.length)]!,
    hair: HAIRS[next(HAIRS.length)]!,
    hairStyle: next(4) as Look["hairStyle"],
    beard: [0, 0, 1, 2][next(4)] as Look["beard"],
    headwear: role === "bat" ? "helmet" : role === "umpire" ? "sunhat" : role === "keeper" ? "cap" : headwear === 0 ? "bare" : headwear === 1 ? "cap" : "sunhat",
  };
}

// ---------------------------------------------------------------------------
// Atlas: kit colours, jersey lettering, bat. Same layout for colour and roughness.
// ---------------------------------------------------------------------------

type Rect = [x: number, y: number, w: number, h: number];
const A = {
  jersey: [0, 0, 160, 160] as Rect,
  bat: [168, 0, 80, 152] as Rect,
  pants: [0, 160, 32, 32] as Rect,
  primary: [32, 160, 32, 32] as Rect,
  accent: [64, 160, 32, 32] as Rect,
  fabric: [96, 160, 32, 32] as Rect,
  skin: [128, 160, 32, 32] as Rect,
  gloss: [160, 160, 32, 32] as Rect,
  metal: [192, 160, 32, 32] as Rect,
  rubber: [224, 160, 32, 32] as Rect,
  dark: [0, 192, 32, 32] as Rect,
  leather: [32, 192, 32, 32] as Rect,
};
const SIZE = 256;
type Region = keyof typeof A;
const regionUv = (r: Rect, u: number, v: number): [number, number] => [(r[0] + 2 + (r[2] - 4) * u) / SIZE, 1 - (r[1] + 2 + (r[3] - 4) * v) / SIZE];

const NEUTRAL = { color: "#1b2230", dark: "#252c3a", accent: "#e8e4d6", short: "UMP", players: [] as string[] };

/** Paints an athlete's kit. `team` of -1 is the umpire's black-and-white. */
export function paintKit(c: CanvasRenderingContext2D, team: number, number: number, lettering: boolean) {
  const t = team < 0 ? NEUTRAL : TEAMS[team]!;
  const px = c.canvas.width / SIZE;
  c.save();
  c.setTransform(px, 0, 0, px, 0, 0);
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, SIZE, SIZE);
  // Jersey: base colour, diagonal panel, collar band, side panels.
  c.fillStyle = team < 0 ? "#e8e6dc" : t.dark;
  c.fillRect(0, 0, 160, 160);
  if (team >= 0) {
    c.fillStyle = t.color;
    c.beginPath();
    c.moveTo(0, 26);
    c.lineTo(160, 96);
    c.lineTo(160, 142);
    c.lineTo(0, 72);
    c.fill();
    c.fillStyle = t.accent;
    c.fillRect(0, 24, 160, 3);
    c.fillRect(0, 12, 160, 3);
    c.globalAlpha = 0.5;
    c.fillRect(0, 150, 160, 2);
    c.globalAlpha = 1;
  }
  if (lettering) {
    c.textAlign = "center";
    c.fillStyle = team < 0 ? "#2a2f3a" : "#ffffff";
    c.font = "800 15px system-ui, sans-serif";
    c.fillText(t.short, 40, 66);
    if (team >= 0) {
      c.font = "800 44px system-ui, sans-serif";
      c.fillText(String(number), 120, 96);
      c.font = "800 9px system-ui, sans-serif";
      c.fillText((t.players[(number - 1) % 11] ?? "").toUpperCase().slice(0, 12), 120, 50);
      c.font = "800 16px system-ui, sans-serif";
      c.fillText(String(number), 40, 90);
    }
  }
  // Fabric weave adds a little life under the lights.
  c.globalAlpha = 0.07;
  c.fillStyle = "#ffffff";
  for (let y = 0; y < 160; y += 2) c.fillRect(0, y, 160, 1);
  c.fillStyle = "#000000";
  for (let x = 0; x < 160; x += 2) c.fillRect(x, 0, 1, 160);
  c.globalAlpha = 1;
  // Bat: pale willow with grain, edge shading and an original sticker.
  c.fillStyle = "#dcc493";
  c.fillRect(...A.bat);
  for (let n = 0; n < 10; n++) {
    c.fillStyle = `rgba(120,80,36,${0.05 + (n % 3) * 0.035})`;
    c.fillRect(A.bat[0] + 4 + n * 7.6, 0, 1.5, 152);
  }
  c.fillStyle = team < 0 ? "#203040" : t.color;
  c.fillRect(A.bat[0] + 16, 60, 48, 56);
  c.fillStyle = team < 0 ? "#fff" : t.accent;
  c.fillRect(A.bat[0] + 16, 80, 48, 8);
  // Kit solids.
  c.fillStyle = team < 0 ? "#20242e" : t.dark;
  c.fillRect(...A.pants);
  c.fillStyle = team < 0 ? "#e8e6dc" : t.color;
  c.fillRect(...A.primary);
  c.fillStyle = t.accent;
  c.fillRect(...A.accent);
  c.fillStyle = "#f1eee2";
  c.fillRect(...A.fabric);
  c.fillStyle = "#3a3f4c";
  c.fillRect(...A.rubber);
  c.fillStyle = "#14161c";
  c.fillRect(...A.dark);
  c.fillStyle = "#8d5b2e";
  c.fillRect(...A.leather);
  c.restore();
}

/** Roughness for the same layout: skin satin, kit matte, helmet and metal glossy. */
export function paintRoughness(c: CanvasRenderingContext2D) {
  const px = c.canvas.width / SIZE;
  c.save();
  c.setTransform(px, 0, 0, px, 0, 0);
  const g = (v: number) => `rgb(0,${Math.round(v * 255)},0)`;
  c.fillStyle = g(0.88);
  c.fillRect(0, 0, SIZE, SIZE);
  c.fillStyle = g(0.62);
  c.fillRect(...A.bat);
  c.fillStyle = g(0.58);
  c.fillRect(...A.skin);
  c.fillStyle = g(0.32);
  c.fillRect(...A.gloss);
  c.fillStyle = g(0.28);
  c.fillRect(...A.metal);
  c.fillStyle = g(0.5);
  c.fillRect(...A.leather);
  c.restore();
}

// ---------------------------------------------------------------------------
// Geometry builder
// ---------------------------------------------------------------------------

type Weight = number | [boneA: number, boneB: number, b: number];
interface Ring {
  y: number;
  rx: number;
  rz: number;
  x?: number;
  z?: number;
  /** Superellipse squareness; 2 is round, higher is boxier. */
  e?: number;
  w: Weight;
}
const toLinear = (hex: string) => {
  const c = new T.Color(hex);
  return [c.r, c.g, c.b] as const;
};
const WHITE = [1, 1, 1] as const;
type Paint = { region: Region; color?: readonly [number, number, number] };

class Builder {
  pos: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  idx: number[] = [];
  private vertex(x: number, y: number, z: number, u: number, v: number, w: Weight, paint: Paint) {
    this.pos.push(x, y, z);
    const col = paint.color ?? WHITE;
    this.col.push(col[0], col[1], col[2]);
    const [a, b] = regionUv(A[paint.region], u, v);
    this.uv.push(a, b);
    if (typeof w === "number") {
      this.si.push(w, 0, 0, 0);
      this.sw.push(1, 0, 0, 0);
    } else {
      this.si.push(w[0], w[1], 0, 0);
      this.sw.push(1 - w[2], w[2], 0, 0);
    }
    return this.pos.length / 3 - 1;
  }
  /** Stacks elliptical rings (bottom to top) into a closed tube. */
  loft(rings: Ring[], segments: number, paint: Paint) {
    const first = this.pos.length / 3;
    rings.forEach((r, n) => {
      for (let s = 0; s <= segments; s++) {
        const u = s / segments,
          a = -Math.PI / 2 + u * Math.PI * 2,
          e = r.e ?? 2,
          sa = Math.sin(a),
          ca = Math.cos(a),
          px = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / e),
          pz = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e);
        this.vertex((r.x ?? 0) + px * r.rx, r.y, (r.z ?? 0) + pz * r.rz, u, 1 - n / (rings.length - 1), r.w, paint);
      }
    });
    const row = segments + 1;
    for (let n = 0; n < rings.length - 1; n++)
      for (let s = 0; s < segments; s++) {
        const a = first + n * row + s,
          b = a + row;
        this.idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    this.cap(first, segments, rings[0]!, false, paint);
    this.cap(first + (rings.length - 1) * row, segments, rings[rings.length - 1]!, true, paint);
  }
  private cap(start: number, segments: number, r: Ring, top: boolean, paint: Paint) {
    const c = this.vertex(r.x ?? 0, r.y, r.z ?? 0, 0.5, 0.5, r.w, paint);
    for (let s = 0; s < segments; s++) top ? this.idx.push(start + s, start + s + 1, c) : this.idx.push(start + s + 1, start + s, c);
  }
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, segments: number, w: Weight, paint: Paint, from = 0, to = 1) {
    const rings: Ring[] = [],
      count = Math.max(3, Math.round(segments * 0.7));
    for (let n = 0; n <= count; n++) {
      const p = from + (to - from) * (n / count),
        a = -Math.PI / 2 + p * Math.PI,
        k = Math.max(0.001, Math.cos(a));
      rings.push({ y: cy + Math.sin(a) * ry, rx: rx * k, rz: rz * k, x: cx, z: cz, w });
    }
    this.loft(rings, segments, paint);
  }
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, w: Weight, paint: Paint) {
    this.loft(
      [
        { y: cy - sy / 2, rx: sx / 2, rz: sz / 2, x: cx, z: cz, e: 8, w },
        { y: cy + sy / 2, rx: sx / 2, rz: sz / 2, x: cx, z: cz, e: 8, w },
      ],
      8,
      paint,
    );
  }
  build() {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(this.col, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("skinIndex", new T.Uint16BufferAttribute(this.si, 4));
    g.setAttribute("skinWeight", new T.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

// ---------------------------------------------------------------------------
// Skeleton and body
// ---------------------------------------------------------------------------

const SH = RIG.shoulderSide;
const Y = {
  hips: RIG.hipY,
  spine: RIG.hipY + RIG.spine,
  chest: RIG.hipY + RIG.spine + RIG.chest,
  shoulder: RIG.hipY + RIG.spine + RIG.chest + RIG.shoulderUp,
  elbow: RIG.hipY + RIG.spine + RIG.chest + RIG.shoulderUp - RIG.upperArm,
  wrist: RIG.hipY + RIG.spine + RIG.chest + RIG.shoulderUp - RIG.upperArm - RIG.forearm,
  hipJoint: RIG.hipY - RIG.hipJointDrop,
  knee: RIG.ankle + RIG.shin,
  neck: 1.52,
  head: 1.565,
};

function buildBody(role: Role, look: Look, detail: 0 | 1 | 2) {
  const b = new Builder(),
    skin = toLinear(look.skin),
    hair = toLinear(look.hair),
    k = look.build,
    seg = detail === 2 ? 14 : detail === 1 ? 10 : 7,
    limb = detail === 2 ? 10 : detail === 1 ? 8 : 6;
  const skinP: Paint = { region: "skin", color: skin },
    hairP: Paint = { region: "dark", color: hair },
    shirt: Paint = { region: "jersey" },
    pants: Paint = { region: "pants" },
    primary: Paint = { region: "primary" },
    accent: Paint = { region: "accent" },
    pad: Paint = { region: "fabric" },
    rubber: Paint = { region: "rubber" };

  // Torso as one continuous skin from hips to neck.
  b.loft(
    [
      { y: 0.8, rx: 0.145 * k, rz: 0.1, w: B.hips },
      { y: 0.9, rx: 0.16 * k, rz: 0.115, w: B.hips },
      { y: 1.0, rx: 0.15 * k, rz: 0.108, w: [B.hips, B.spine, 0.5] },
      { y: 1.1, rx: 0.145 * k, rz: 0.1, w: B.spine },
      { y: 1.22, rx: 0.165 * k, rz: 0.108, w: [B.spine, B.chest, 0.5] },
      { y: 1.34, rx: 0.19 * k, rz: 0.118, w: B.chest },
      { y: 1.44, rx: 0.195 * k, rz: 0.11, w: B.chest },
      { y: 1.49, rx: 0.13 * k, rz: 0.08, w: B.chest },
      { y: 1.525, rx: 0.058, rz: 0.058, w: [B.chest, B.neck, 0.5] },
    ],
    seg,
    shirt,
  );
  // Shorts line over the hips is trouser-coloured.
  b.loft(
    [
      { y: 0.8, rx: 0.15 * k, rz: 0.105, w: B.hips },
      { y: 0.9, rx: 0.164 * k, rz: 0.119, w: B.hips },
    ],
    seg,
    pants,
  );
  // Neck and sculpted head.
  b.loft(
    [
      { y: 1.5, rx: 0.056, rz: 0.058, w: B.neck },
      { y: 1.59, rx: 0.052, rz: 0.054, w: [B.neck, B.head, 0.6] },
    ],
    limb,
    skinP,
  );
  b.loft(
    [
      { y: 1.562, rx: 0.052, rz: 0.058, z: 0.018, w: B.head },
      { y: 1.59, rx: 0.076, rz: 0.08, z: 0.012, w: B.head },
      { y: 1.63, rx: 0.09, rz: 0.098, z: 0.006, w: B.head },
      { y: 1.68, rx: 0.098, rz: 0.11, w: B.head },
      { y: 1.73, rx: 0.095, rz: 0.108, w: B.head },
      { y: 1.77, rx: 0.073, rz: 0.086, w: B.head },
      { y: 1.795, rx: 0.03, rz: 0.038, w: B.head },
    ],
    seg,
    skinP,
  );
  for (const s of [-1, 1]) b.ellipsoid(s * 0.098, 1.672, 0, 0.011, 0.026, 0.017, 5, B.head, skinP);
  if (detail >= 1) {
    // Face: original, simple planes that read from the close cameras.
    const shade: Paint = { region: "skin", color: [skin[0] * 0.72, skin[1] * 0.68, skin[2] * 0.66] };
    b.ellipsoid(0, 1.664, 0.11, 0.016, 0.03, 0.022, 5, B.head, skinP);
    b.ellipsoid(0, 1.705, 0.095, 0.072, 0.011, 0.016, 6, B.head, shade);
    b.ellipsoid(0, 1.622, 0.098, 0.03, 0.007, 0.008, 5, B.head, { region: "skin", color: [0.28, 0.08, 0.07] });
    for (const s of [-1, 1]) {
      b.ellipsoid(s * 0.039, 1.687, 0.094, 0.019, 0.01, 0.008, 5, B.head, { region: "fabric" });
      b.ellipsoid(s * 0.039, 1.687, 0.1, 0.008, 0.008, 0.004, 5, B.head, { region: "dark" });
      b.box(s * 0.04, 1.712, 0.103, 0.036, 0.007, 0.006, B.head, hairP);
    }
    if (look.beard) b.ellipsoid(0, 1.598, 0.03, 0.08, look.beard === 2 ? 0.05 : 0.036, 0.08, 7, B.head, look.beard === 2 ? hairP : { region: "skin", color: [skin[0] * 0.55, skin[1] * 0.5, skin[2] * 0.48] }, 0, 0.62);
  }
  if (look.headwear === "helmet") {
    const shell: Paint = { region: "primary" };
    b.ellipsoid(0, 1.695, -0.008, 0.116, 0.112, 0.128, seg, B.head, shell, 0.42, 1);
    b.loft(
      [
        { y: 1.595, rx: 0.086, rz: 0.03, z: -0.09, e: 3, w: B.head },
        { y: 1.69, rx: 0.114, rz: 0.04, z: -0.092, e: 3, w: B.head },
      ],
      limb,
      shell,
    );
    b.loft(
      [
        { y: 1.704, rx: 0.098, rz: 0.058, z: 0.135, e: 3, w: B.head },
        { y: 1.716, rx: 0.106, rz: 0.066, z: 0.128, e: 3, w: B.head },
      ],
      limb,
      accent,
    );
    if (detail >= 1) {
      const steel: Paint = { region: "metal", color: [0.42, 0.46, 0.5] };
      for (const [y, z, w] of [[1.685, 0.13, 0.2], [1.645, 0.145, 0.19], [1.605, 0.135, 0.16]] as const) b.box(0, y, z, w, 0.008, 0.008, B.head, steel);
      for (const s of [-1, 0, 1]) b.box(s * 0.06, 1.645, 0.137, 0.007, 0.086, 0.007, B.head, steel);
      for (const s of [-1, 1]) b.box(s * 0.098, 1.645, 0.085, 0.007, 0.086, 0.09, B.head, steel);
    }
  } else if (look.headwear === "cap") {
    b.ellipsoid(0, 1.72, -0.002, 0.104, 0.082, 0.116, seg, B.head, primary, 0.45, 1);
    b.loft(
      [
        { y: 1.728, rx: 0.08, rz: 0.06, z: 0.145, e: 3, w: B.head },
        { y: 1.738, rx: 0.086, rz: 0.066, z: 0.14, e: 3, w: B.head },
      ],
      limb,
      primary,
    );
  } else if (look.headwear === "sunhat") {
    b.ellipsoid(0, 1.722, -0.002, 0.103, 0.08, 0.114, seg, B.head, role === "umpire" ? pad : primary, 0.45, 1);
    b.loft(
      [
        { y: 1.726, rx: 0.17, rz: 0.178, w: B.head },
        { y: 1.742, rx: 0.15, rz: 0.158, w: B.head },
      ],
      seg,
      role === "umpire" ? pad : primary,
    );
  } else if (look.hairStyle === 1 && detail === 2) {
    for (let n = 0; n < 12; n++) {
      const a = n * 2.39;
      b.ellipsoid(Math.sin(a) * 0.075, 1.745 + (n % 3) * 0.012, Math.cos(a) * 0.08 - 0.012, 0.036, 0.032, 0.036, 5, B.head, hairP);
    }
  } else if (look.hairStyle !== 3) {
    b.ellipsoid(0, 1.705, look.hairStyle === 2 ? -0.018 : -0.008, 0.102, look.hairStyle === 2 ? 0.11 : 0.098, 0.116, seg, B.head, hairP, 0.5, 1);
  } else {
    b.ellipsoid(0, 1.7, -0.01, 0.1, 0.098, 0.112, seg, B.head, hairP, 0.6, 1);
  }

  // Arms: sleeve and skin share the elbow bend through blended rings.
  const glove = role === "bat" || role === "keeper";
  for (const s of [1, -1]) {
    const up = s > 0 ? B.lUpper : B.rUpper,
      fore = s > 0 ? B.lFore : B.rFore,
      hand = s > 0 ? B.lHand : B.rHand,
      x = s * SH;
    b.ellipsoid(x - s * 0.012, Y.shoulder - 0.015, 0, 0.068, 0.07, 0.07, limb, [B.chest, up, 0.6], shirt);
    b.loft(
      [
        { y: Y.elbow + 0.14, x, rx: 0.05, rz: 0.054, w: up },
        { y: Y.shoulder - 0.02, x: x - s * 0.006, rx: 0.062, rz: 0.066, w: up },
      ],
      limb,
      primary,
    );
    b.loft(
      [
        { y: Y.wrist, x, rx: 0.028, rz: 0.03, w: fore },
        { y: Y.wrist + 0.13, x, rx: 0.039, rz: 0.042, w: fore },
        { y: Y.elbow - 0.03, x, rx: 0.041, rz: 0.043, w: [up, fore, 0.85] },
        { y: Y.elbow + 0.03, x, rx: 0.043, rz: 0.046, w: [up, fore, 0.15] },
        { y: Y.elbow + 0.16, x, rx: 0.048, rz: 0.052, w: up },
      ],
      limb,
      skinP,
    );
    const handY = Y.wrist - RIG.hand;
    if (glove) {
      const gloveP: Paint = role === "keeper" ? { region: "accent" } : { region: "fabric" };
      const r = role === "keeper" ? 1.3 : 1;
      b.ellipsoid(x, handY, 0.004, 0.044 * r, 0.062 * r, 0.044 * r, limb, hand, gloveP);
      b.loft(
        [
          { y: Y.wrist - 0.015, x, rx: 0.038, rz: 0.038, w: hand },
          { y: Y.wrist + 0.04, x, rx: 0.036, rz: 0.038, w: fore },
        ],
        limb,
        primary,
      );
    } else b.ellipsoid(x, handY, 0.004, 0.034, 0.056, 0.03, limb, hand, skinP);
  }

  // Legs.
  for (const s of [1, -1]) {
    const thigh = s > 0 ? B.lThigh : B.rThigh,
      shin = s > 0 ? B.lShin : B.rShin,
      foot = s > 0 ? B.lFoot : B.rFoot,
      x = s * RIG.hipSide;
    b.loft(
      [
        { y: RIG.ankle + 0.03, x, rx: 0.042, rz: 0.046, w: shin },
        { y: RIG.ankle + 0.25, x, rx: 0.054, rz: 0.063, z: -0.006, w: shin },
        { y: Y.knee - 0.05, x, rx: 0.052, rz: 0.058, w: [thigh, shin, 0.85] },
        { y: Y.knee + 0.05, x, rx: 0.056, rz: 0.061, w: [thigh, shin, 0.15] },
        { y: Y.knee + 0.2, x, rx: 0.074, rz: 0.084, w: thigh },
        { y: Y.hipJoint + 0.02, x: x * 0.9, rx: 0.09, rz: 0.098, w: thigh },
      ],
      limb,
      pants,
    );
    // Shoe and sole.
    b.loft(
      [
        { y: 0.008, rx: 0.046, rz: 0.13, z: 0.045, x, e: 2.6, w: foot },
        { y: 0.05, rx: 0.052, rz: 0.13, z: 0.043, x, e: 2.6, w: foot },
        { y: 0.092, rx: 0.044, rz: 0.08, z: 0.012, x, e: 2.4, w: foot },
        { y: 0.128, rx: 0.042, rz: 0.05, x, w: foot },
      ],
      limb,
      role === "umpire" ? { region: "dark" } : pad,
    );
    b.loft(
      [
        { y: 0, rx: 0.05, rz: 0.134, z: 0.045, x, e: 3, w: foot },
        { y: 0.014, rx: 0.051, rz: 0.135, z: 0.045, x, e: 3, w: foot },
      ],
      limb,
      rubber,
    );
    if (role === "bat" || role === "keeper") {
      b.loft(
        [
          { y: 0.13, x, z: 0.038, rx: 0.058, rz: 0.044, e: 3, w: shin },
          { y: Y.knee - 0.06, x, z: 0.05, rx: 0.072, rz: 0.056, e: 3, w: shin },
          { y: Y.knee + 0.04, x, z: 0.054, rx: 0.068, rz: 0.05, e: 3, w: [thigh, shin, 0.5] },
          { y: Y.knee + 0.1, x, z: 0.05, rx: 0.052, rz: 0.038, e: 3, w: thigh },
        ],
        limb,
        pad,
      );
      if (detail >= 1) for (let n = -1; n <= 1; n++) b.box(x + n * 0.03, Y.knee - 0.18, 0.1, 0.012, 0.36, 0.012, shin, { region: "fabric", color: [0.74, 0.74, 0.68] });
    }
  }

  if (role === "bat") {
    // Bat, modelled along the bat bone's -Y. Blade has a flat face and a raised back.
    const handle: Paint = { region: "primary" };
    b.loft(
      [
        { y: -0.25, rx: 0.016, rz: 0.015, w: B.bat },
        { y: 0.07, rx: 0.0155, rz: 0.015, w: B.bat },
      ],
      limb,
      handle,
    );
    const w: Paint = { region: "bat" };
    b.loft(
      [
        { y: -BAT.toe, rx: 0.05, rz: 0.012, z: -0.002, e: 4, w: B.bat },
        { y: -BAT.toe + 0.02, rx: 0.054, rz: 0.019, z: -0.004, e: 4, w: B.bat },
        { y: -BAT.sweet, rx: 0.056, rz: 0.028, z: -0.012, e: 4, w: B.bat },
        { y: -0.34, rx: 0.054, rz: 0.021, z: -0.006, e: 4, w: B.bat },
        { y: -0.27, rx: 0.042, rz: 0.018, e: 3, w: B.bat },
        { y: -0.235, rx: 0.018, rz: 0.016, w: B.bat },
      ],
      limb,
      w,
    );
  }
  return b.build();
}

export interface Athlete {
  root: T.Group;
  mesh: T.SkinnedMesh;
  bones: Record<BoneName, T.Bone>;
  role: Role;
  look: Look;
}

function makeBones() {
  const bones = {} as Record<BoneName, T.Bone>;
  const add = (name: BoneName, parent: T.Bone | null, x: number, y: number, z: number) => {
    const bone = new T.Bone();
    bone.name = name;
    bone.position.set(x, y, z);
    parent?.add(bone);
    bones[name] = bone;
    return bone;
  };
  const hips = add("hips", null, 0, Y.hips, 0),
    spine = add("spine", hips, 0, RIG.spine, 0),
    chest = add("chest", spine, 0, RIG.chest, 0),
    neck = add("neck", chest, 0, Y.neck - Y.chest, 0);
  add("head", neck, 0, Y.head - Y.neck, 0);
  for (const [s, up, fore, hand] of [[1, "lUpper", "lFore", "lHand"], [-1, "rUpper", "rFore", "rHand"]] as const) {
    const u = add(up, chest, s * SH, RIG.shoulderUp, 0),
      f = add(fore, u, 0, -RIG.upperArm, 0);
    add(hand, f, 0, -RIG.forearm, 0);
  }
  for (const [s, th, sh, ft] of [[1, "lThigh", "lShin", "lFoot"], [-1, "rThigh", "rShin", "rFoot"]] as const) {
    const t = add(th, hips, s * RIG.hipSide, -RIG.hipJointDrop, 0),
      k = add(sh, t, 0, -RIG.thigh, 0);
    add(ft, k, 0, -RIG.shin, 0);
  }
  add("bat", null, 0, 0, 0);
  return bones;
}

export function buildAthlete(role: Role, number: number, team: number, detail: 0 | 1 | 2, material?: T.Material): Athlete {
  const look = lookFor(role, number, team),
    geometry = buildBody(role, look, detail),
    bones = makeBones(),
    root = new T.Group();
  const mesh = new T.SkinnedMesh(geometry, material ?? new T.MeshBasicMaterial({ vertexColors: true }));
  mesh.add(bones.hips);
  mesh.add(bones.bat);
  // Inverse bind matrices are taken from the rest pose at the origin, before scaling.
  mesh.updateMatrixWorld(true);
  const skeleton = new T.Skeleton(BONES.map((b) => bones[b]));
  mesh.bind(skeleton, new T.Matrix4());
  // The rig moves far from the bind pose; bounds are the whole body, not the rest shape.
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;
  root.add(mesh);
  root.scale.setScalar(look.scale);
  return { root, mesh, bones, role, look };
}

// ---------------------------------------------------------------------------
// Pose application (reused temporaries; nothing allocates per frame).
// ---------------------------------------------------------------------------

const DOWN = new T.Vector3(0, -1, 0);
const m4 = new T.Matrix4(),
  inv = new T.Matrix4(),
  q1 = new T.Quaternion(),
  q2 = new T.Quaternion(),
  vT = new T.Vector3(),
  vS = new T.Vector3(),
  vE = new T.Vector3(),
  vD = new T.Vector3(),
  vP = new T.Vector3(),
  vW = new T.Vector3();

/** Solves a two-bone limb in its parent's space. Returns how far the end is from the target. */
export function solveLimb(upper: T.Bone, lower: T.Bone, l1: number, l2: number, start: T.Vector3, target: T.Vector3, pole: T.Vector3) {
  vD.copy(target).sub(start);
  const raw = vD.length(),
    d = Math.max(Math.abs(l1 - l2) + 0.001, Math.min(l1 + l2 - 0.001, raw));
  if (raw < 1e-5) vD.set(0, -1, 0);
  else vD.divideScalar(raw);
  vP.copy(pole).addScaledVector(vD, -pole.dot(vD));
  if (vP.lengthSq() < 1e-6) vP.set(0, 0, 1).addScaledVector(vD, -vD.z);
  vP.normalize();
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d),
    h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  vE.copy(start).addScaledVector(vD, along).addScaledVector(vP, h);
  vW.copy(start).addScaledVector(vD, d);
  upper.quaternion.setFromUnitVectors(DOWN, vT.copy(vE).sub(start).normalize());
  q1.setFromUnitVectors(DOWN, vT.copy(vW).sub(vE).normalize());
  lower.quaternion.copy(q2.copy(upper.quaternion).invert()).multiply(q1);
  return Math.max(0, raw - d);
}

const poleElbowL = new T.Vector3(0.7, -0.35, -0.6),
  poleElbowR = new T.Vector3(-0.7, -0.35, -0.6),
  poleKnee = new T.Vector3(0, 0, 1),
  vTarget = new T.Vector3(),
  vLocal = new T.Vector3(),
  vPole = new T.Vector3(),
  vFore = new T.Vector3(),
  shoulderL = new T.Vector3(SH, RIG.shoulderUp, 0),
  shoulderR = new T.Vector3(-SH, RIG.shoulderUp, 0),
  chestM = new T.Matrix4(),
  hipL = new T.Vector3(RIG.hipSide, -RIG.hipJointDrop, 0),
  hipR = new T.Vector3(-RIG.hipSide, -RIG.hipJointDrop, 0);

function solveHand(a: Athlete, left: boolean, x: number, y: number, z: number) {
  const up = left ? a.bones.lUpper : a.bones.rUpper,
    fore = left ? a.bones.lFore : a.bones.rFore,
    shoulder = left ? shoulderL : shoulderR;
  vLocal.set(x, y, z).applyMatrix4(inv);
  vPole.copy(left ? poleElbowL : poleElbowR).transformDirection(inv);
  // The target is the middle of the hand, which sits along the forearm, so the
  // wrist has to end up short of it in the direction the forearm finally points.
  vFore.copy(vLocal).sub(shoulder).normalize();
  for (let n = 0; n < 6; n++) {
    vTarget.copy(vLocal).addScaledVector(vFore, -RIG.hand);
    solveLimb(up, fore, RIG.upperArm, RIG.forearm, shoulder, vTarget, vPole);
    vFore.lerp(vT.copy(vW).sub(vE).normalize(), 0.6).normalize();
  }
}

/** Writes a pose (root-space targets) onto the skeleton. */
export function applyPose(a: Athlete, p: Pose) {
  const b = a.bones;
  b.hips.position.set(p[CH.hipX]!, p[CH.hipY]!, p[CH.hipZ]!);
  b.hips.rotation.set(p[CH.pitch]!, p[CH.yaw]!, p[CH.roll]!);
  b.spine.rotation.set(p[CH.chestX]! * 0.5, p[CH.chestY]! * 0.5, p[CH.chestZ]! * 0.5);
  b.chest.rotation.set(p[CH.chestX]! * 0.5, p[CH.chestY]! * 0.5, p[CH.chestZ]! * 0.5);
  b.neck.rotation.set(p[CH.headX]! * 0.35, p[CH.headY]! * 0.35, p[CH.headZ]! * 0.35);
  b.head.rotation.set(p[CH.headX]! * 0.65, p[CH.headY]! * 0.65, p[CH.headZ]! * 0.65);
  b.hips.updateMatrix();
  b.spine.updateMatrix();
  b.chest.updateMatrix();
  chestM.copy(b.hips.matrix).multiply(b.spine.matrix).multiply(b.chest.matrix);
  inv.copy(chestM).invert();
  solveHand(a, true, p[CH.lHandX]!, p[CH.lHandY]!, p[CH.lHandZ]!);
  solveHand(a, false, p[CH.rHandX]!, p[CH.rHandY]!, p[CH.rHandZ]!);
  // Legs, in hip space.
  inv.copy(b.hips.matrix).invert();
  vPole.copy(poleKnee).transformDirection(inv);
  vLocal.set(p[CH.lFootX]!, p[CH.lFootY]!, p[CH.lFootZ]!).applyMatrix4(inv);
  solveLimb(b.lThigh, b.lShin, RIG.thigh, RIG.shin, hipL, vLocal, vPole);
  vLocal.set(p[CH.rFootX]!, p[CH.rFootY]!, p[CH.rFootZ]!).applyMatrix4(inv);
  solveLimb(b.rThigh, b.rShin, RIG.thigh, RIG.shin, hipR, vLocal, vPole);
  // Feet stay level with the ground (plus any toe pitch) whatever the leg is doing.
  levelFoot(b.hips, b.lThigh, b.lShin, b.lFoot, p[CH.lToe]!);
  levelFoot(b.hips, b.rThigh, b.rShin, b.rFoot, p[CH.rToe]!);
}

function levelFoot(hips: T.Bone, thigh: T.Bone, shin: T.Bone, foot: T.Bone, toe: number) {
  q1.copy(hips.quaternion).multiply(thigh.quaternion).multiply(shin.quaternion).invert();
  q2.setFromAxisAngle(vT.set(1, 0, 0), toe);
  foot.quaternion.copy(q1).multiply(q2);
}

const vX = new T.Vector3(),
  vY = new T.Vector3(),
  vZ = new T.Vector3();
/** Positions the bat bone, then returns the two handle points hands should hold. */
export function placeBat(a: Athlete, bat: BatPose) {
  const bone = a.bones.bat;
  vY.set(-bat.dir[0], -bat.dir[1], -bat.dir[2]).normalize();
  vZ.set(bat.face[0], bat.face[1], bat.face[2]);
  vZ.addScaledVector(vY, -vZ.dot(vY));
  if (vZ.lengthSq() < 1e-5) vZ.set(1, 0, 0).addScaledVector(vY, -vY.x);
  vZ.normalize();
  vX.crossVectors(vY, vZ);
  m4.makeBasis(vX, vY, vZ);
  bone.quaternion.setFromRotationMatrix(m4);
  bone.position.set(bat.grip[0], bat.grip[1], bat.grip[2]);
}

/**
 * Poses a batter with both hands on the handle. The grip is pulled towards the
 * shoulders if a pose over-reaches, so the bat moves rather than the hands
 * letting go. Left hand on top for a right-handed batter.
 */
export function holdBat(a: Athlete, p: Pose, bat: BatPose) {
  const b = a.bones;
  b.hips.position.set(p[CH.hipX]!, p[CH.hipY]!, p[CH.hipZ]!);
  b.hips.rotation.set(p[CH.pitch]!, p[CH.yaw]!, p[CH.roll]!);
  b.spine.rotation.set(p[CH.chestX]! * 0.5, p[CH.chestY]! * 0.5, p[CH.chestZ]! * 0.5);
  b.chest.rotation.set(p[CH.chestX]! * 0.5, p[CH.chestY]! * 0.5, p[CH.chestZ]! * 0.5);
  b.hips.updateMatrix();
  b.spine.updateMatrix();
  b.chest.updateMatrix();
  chestM.copy(b.hips.matrix).multiply(b.spine.matrix).multiply(b.chest.matrix);
  const maxReach = RIG.upperArm + RIG.forearm + RIG.hand - 0.012;
  const grip = bat.grip.slice() as [number, number, number],
    dir = bat.dir;
  // A ball out of reach is met by moving the hips towards it, feet staying planted.
  for (const hand of [0, BAT.bottom]) {
    vS.copy(hand ? shoulderR : shoulderL).applyMatrix4(chestM);
    const dx = grip[0] + dir[0] * hand - vS.x,
      dy = grip[1] + dir[1] * hand - vS.y,
      dz = grip[2] + dir[2] * hand - vS.z,
      l = Math.hypot(dx, dy, dz),
      over = l - maxReach;
    if (over <= 0) continue;
    const shift = Math.min(over, 0.3) / l;
    p[CH.hipX] = p[CH.hipX]! + dx * shift;
    p[CH.hipY] = p[CH.hipY]! + Math.min(0, dy) * shift;
    p[CH.hipZ] = p[CH.hipZ]! + dz * shift;
    b.hips.position.set(p[CH.hipX]!, p[CH.hipY]!, p[CH.hipZ]!);
    b.hips.updateMatrix();
    chestM.copy(b.hips.matrix).multiply(b.spine.matrix).multiply(b.chest.matrix);
  }
  for (let i = 0; i < 3; i++) {
    vS.copy(shoulderL).applyMatrix4(chestM);
    let dx = grip[0] - vS.x,
      dy = grip[1] - vS.y,
      dz = grip[2] - vS.z,
      over = Math.hypot(dx, dy, dz) - maxReach;
    if (over > 0) {
      const l = over + maxReach;
      grip[0] -= (dx / l) * over;
      grip[1] -= (dy / l) * over;
      grip[2] -= (dz / l) * over;
    }
    vS.copy(shoulderR).applyMatrix4(chestM);
    const hx = grip[0] + dir[0] * BAT.bottom,
      hy = grip[1] + dir[1] * BAT.bottom,
      hz = grip[2] + dir[2] * BAT.bottom;
    dx = hx - vS.x;
    dy = hy - vS.y;
    dz = hz - vS.z;
    over = Math.hypot(dx, dy, dz) - maxReach;
    if (over > 0) {
      const l = over + maxReach;
      grip[0] -= (dx / l) * over;
      grip[1] -= (dy / l) * over;
      grip[2] -= (dz / l) * over;
    }
  }
  placeBat(a, { grip, dir, face: bat.face });
  p[CH.lHandX] = grip[0];
  p[CH.lHandY] = grip[1];
  p[CH.lHandZ] = grip[2];
  p[CH.rHandX] = grip[0] + dir[0] * BAT.bottom;
  p[CH.rHandY] = grip[1] + dir[1] * BAT.bottom;
  p[CH.rHandZ] = grip[2] + dir[2] * BAT.bottom;
  applyPose(a, p);
}

/** World position of the middle of a hand. */
export function handCentre(a: Athlete, left: boolean, out: T.Vector3) {
  return (left ? a.bones.lHand : a.bones.rHand).localToWorld(out.set(0, -RIG.hand, 0));
}
/** World position of a point along the bat. */
export function batPoint(a: Athlete, along: number, out: T.Vector3) {
  return a.bones.bat.localToWorld(out.set(0, -along, 0));
}
