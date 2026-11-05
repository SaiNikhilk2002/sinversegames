import * as T from "three";
import { coinPose, type CeremonyFeed } from "./ceremony";
import type { Shot } from "./director";

/** Original minted geometry and locally drawn face textures; no external assets. */
export function buildCoin() {
  const face = (heads: boolean) => {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#bf8e3d"; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "#ffe8a3"; g.lineWidth = 5;
    for (const r of [111, 98]) { g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = "#fff1ba"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "bold 82px Georgia"; g.fillText(heads ? "S" : "II", 128, 119);
    g.font = "bold 18px sans-serif"; g.fillText(heads ? "HEADS" : "TAILS", 128, 176);
    const map = new T.CanvasTexture(c); map.colorSpace = T.SRGBColorSpace;
    return new T.MeshStandardMaterial({ map, color: "#fff0ac", metalness: 0.62, roughness: 0.3 });
  };
  const edge = new T.MeshStandardMaterial({ color: "#d7ac5e", metalness: 0.75, roughness: 0.28 });
  const mesh = new T.Mesh(new T.CylinderGeometry(0.026, 0.026, 0.0034, 48), [edge, face(true), face(false)]);
  mesh.castShadow = true;
  const rim = new T.Mesh(new T.TorusGeometry(0.0258, 0.001, 5, 48), edge);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.0017; mesh.add(rim);
  mesh.visible = false;
  return mesh;
}
const shot = (name: string, p: number[], l: number[], fov: number, rate = 4): Shot => ({ name, px: p[0]!, py: p[1]!, pz: p[2]!, lx: l[0]!, ly: l[1]!, lz: l[2]!, fov, rate, lookRate: rate * 1.5 });
export function ceremonyCamera(f: CeremonyFeed): Shot | null {
  const coin = coinPose(f);
  if (f.stage === "stadium") return shot("stadium-introduction", [48 - f.age * 3, 33, -42], [0, 1, 0], 51, 1.2);
  if (f.stage === "lineups") return shot("team-lineup", [3, 3.8, 16], [0, 1, -1], 50, 2);
  if (f.stage === "captains") return shot("captain-introduction", [5, 2, 6], [1.2, 1.1, 0.4], 35, 2.5);
  if (f.stage === "hand") return shot("coin-in-hand", [0.72, 1.77, 0.91], [0.6, 1.52, 0.7], 28, 12);
  if (f.stage === "flight") return shot("toss-top-down", [coin.x + 0.015, coin.y + 0.32, coin.z + 0.035], [coin.x, coin.y, coin.z], 32, 24);
  if (f.stage === "landing" || f.stage === "reveal") return shot("coin-landing", [0.62, coin.y + 0.35, 0.74], [0.6, coin.y, 0.7], 28, 24);
  if (f.stage === "decision") return shot("captain-acknowledgement", [5, 1.8, 5], [1.3, 1.05, 0.4], 34, 3);
  if (f.stage === "entry") return shot("players-taking-position", [20, 15, -26], [0, 0, 1], 45, 2);
  return null;
}
