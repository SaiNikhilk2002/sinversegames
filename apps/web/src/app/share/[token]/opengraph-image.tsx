import { ImageResponse } from "next/og";
import { brand, getGame } from "@platform/shared";
import { verifyShareToken } from "@platform/shared/identity";
import { authSecret } from "@/lib/server/session";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A SinverseGames result card";

/** The share card as an image, for link previews and the "Save image" button. */
export default async function ShareImage({ params }: { params: Promise<{ token: string }> }) {
  const data = await verifyShareToken((await params).token, authSecret());
  const game = getGame(data?.g ?? "same-wavelength");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: `linear-gradient(135deg, ${game.theme.from}, ${game.theme.to})`, color: "white" }}>
        <div style={{ display: "flex", fontSize: 32, opacity: 0.9 }}>{`${brand.name} · ${game.name}`}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {data?.n && <div style={{ fontSize: 34, opacity: 0.9 }}>{data.n.join(" & ")}</div>}
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>{data ? data.h : game.name}</div>
          {data?.i[0] && <div style={{ fontSize: 38, marginTop: 24, maxWidth: 1000 }}>{data.i[0]}</div>}
        </div>
        <div style={{ display: "flex", fontSize: 30, opacity: 0.9 }}>{`Play free at ${brand.siteUrl.replace(/^https?:\/\//, "")}`}</div>
      </div>
    ),
    size,
  );
}
