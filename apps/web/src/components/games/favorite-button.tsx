"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import type { GameId } from "@platform/shared";
import { Button } from "../ui/primitives";
import { useToast } from "../ui/toast";
import { usePlayer } from "@/lib/player";

export function FavoriteButton({ gameId }: { gameId: GameId }) {
  const { player } = usePlayer();
  const toast = useToast();
  const [fav, setFav] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  if (!player) return null;
  return (
    <Button
      variant="secondary"
      size="lg"
      loading={busy}
      aria-pressed={!!fav}
      icon={<Heart className={fav ? "size-5 fill-hot text-hot" : "size-5"} />}
      onClick={async () => {
        setBusy(true);
        const res = await fetch("/api/favorites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameId }) });
        const data = (await res.json().catch(() => ({}))) as { favorite?: boolean; error?: string };
        setBusy(false);
        if (!res.ok) return toast(data.error ?? "Couldn't update favourites", "error");
        setFav(!!data.favorite);
        toast(data.favorite ? "Added to your favourites" : "Removed from favourites", "success");
      }}
    >
      {fav ? "Favourited" : "Favourite"}
    </Button>
  );
}
