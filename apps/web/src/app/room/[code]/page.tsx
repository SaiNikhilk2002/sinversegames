import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { brand, roomCodeSchema } from "@platform/shared";
import { NameGate } from "@/components/play/name-gate";
import { RoomView } from "@/components/play/room-view";

type Params = Promise<{ code: string }>;

export const metadata: Metadata = {
  title: "Join game",
  description: `You've been invited to play on ${brand.name}. Join instantly — no sign-up needed.`,
  robots: { index: false, follow: false },
};

export default async function RoomPage({ params }: { params: Params }) {
  const parsed = roomCodeSchema.safeParse((await params).code);
  if (!parsed.success) notFound();
  return (
    <NameGate title="You've been invited!">
      <RoomView code={parsed.data} />
    </NameGate>
  );
}
