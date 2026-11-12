"use client";

import dynamic from "next/dynamic";

const Studio = dynamic(() => import("@/games/sinverse-cricket/studio").then((m) => m.CricketStudio), { ssr: false });

export function StudioClient() {
  return <Studio />;
}
