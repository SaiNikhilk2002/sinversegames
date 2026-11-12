import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioClient } from "./studio-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cricket character studio", robots: { index: false, follow: false } };

/**
 * Development-only review page for the cricket athletes (close-ups, poses and
 * lighting). Never served by a production build unless CRICKET_STUDIO=1 is set
 * on that server, which only local evidence runs do.
 */
export default function CricketStudioPage() {
  if (process.env.NODE_ENV === "production" && process.env.CRICKET_STUDIO !== "1") notFound();
  return <StudioClient />;
}
