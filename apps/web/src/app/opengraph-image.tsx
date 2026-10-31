import { ImageResponse } from "next/og";
import { brand } from "@platform/shared";

export const alt = `${brand.name} — ${brand.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(120deg, #1a1240 0%, #3b1a6e 50%, #6a1b4d 100%)", color: "white" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ width: 96, height: 96, borderRadius: 28, background: "linear-gradient(120deg,#7c5cff,#ff4f8b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56 }}>▶</div>
          <div style={{ fontSize: 72, fontWeight: 800 }}>{brand.name}</div>
        </div>
        <div style={{ fontSize: 44, marginTop: 36, opacity: 0.9 }}>{brand.tagline}</div>
        <div style={{ fontSize: 30, marginTop: 20, opacity: 0.7 }}>Color Clash · Doodle Duel · Free in your browser</div>
      </div>
    ),
    size,
  );
}
