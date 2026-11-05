import { CREASE_Z, STUMPS_Z, TEAMS } from "@platform/engines/sinverse-cricket";
import type { SceneDriver } from "./scene";

/** Playable projection of the same snapshots, not a replacement static game image. */
export function createTacticalScene(canvas: HTMLCanvasElement): SceneDriver {
  const c = canvas.getContext("2d");
  if (!c) throw Error("Canvas unavailable");
  return {
    draw({ frame, battingTeam, score }) {
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      c.fillStyle = "#102b35";
      c.fillRect(0, 0, w, h);
      const scale = Math.min(w / 145, h / 155);
      const cx = w / 2,
        cy = h / 2;
      const project = (x: number, z: number) =>
        [cx + x * scale, cy + z * scale] as const;
      c.fillStyle = "#397956";
      c.beginPath();
      c.ellipse(cx, cy, 60 * scale, 64 * scale, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#dfddba";
      c.stroke();
      c.fillStyle = "#c2ab7d";
      c.fillRect(
        cx - 1.6 * scale,
        cy - STUMPS_Z * scale,
        3.2 * scale,
        STUMPS_Z * 2 * scale,
      );
      for (const z of [-CREASE_Z, CREASE_Z]) {
        c.fillStyle = "#f3eed7";
        c.fillRect(cx - 2 * scale, cy + z * scale, 4 * scale, 1);
      }
      frame.fielders.forEach((p, n) => {
        const [x, y] = project(p.x, p.z);
        c.fillStyle = TEAMS[1 - battingTeam]!.color;
        c.beginPath();
        c.arc(x, y, n === 10 ? 5 : 4, 0, 7);
        c.fill();
      });
      for (const side of [-1, 1]) {
        const phase = frame.runner % 2,
          progress = phase <= 1 ? phase : 2 - phase;
        const [x, y] = project(
          side * 0.5,
          side * CREASE_Z * (1 - 2 * progress),
        );
        c.fillStyle = TEAMS[battingTeam]!.color;
        c.beginPath();
        c.arc(x, y, 5, 0, 7);
        c.fill();
      }
      const [bx, by] = project(frame.ball.x, frame.ball.z);
      c.fillStyle = "#0a161b55";
      c.beginPath();
      c.arc(bx + 3, by + 3, 3, 0, 7);
      c.fill();
      c.fillStyle = "#fff2c9";
      c.beginPath();
      c.arc(bx, by - frame.ball.y * scale * 0.65, 3.5, 0, 7);
      c.fill();
      c.fillStyle = "#edf4eb";
      c.font = "bold 12px sans-serif";
      c.textAlign = "center";
      c.fillText(score.replaceAll("|", " · "), w / 2, 24);
    },
    metrics: () => ({
      calls: 1,
      triangles: 0,
      textures: 0,
      geometries: 0,
      dpr: 1,
    }),
    dispose() {},
  };
}
