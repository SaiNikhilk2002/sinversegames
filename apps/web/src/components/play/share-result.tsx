"use client";

import { useState } from "react";
import { Download, Link2, Share2 } from "lucide-react";
import { getGame, type GameId } from "@platform/shared";
import { readJson } from "@/lib/read-json";
import { Button } from "../ui/primitives";
import { useToast } from "../ui/toast";

/**
 * Share a finished match (docs/FUN_INSIGHTS_SYSTEM.md). The server builds a signed card from the
 * recorded match. Names are left off unless you tick the box; answers, emails and ids never go on
 * it. Uses the browser's share sheet where there is one, and copying the link otherwise.
 */
export function ShareResult({ matchId, gameId }: { matchId: string; gameId: GameId }) {
  const toast = useToast();
  const [names, setNames] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  async function create(withNames: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ matchId, names: withNames }) });
      const data = await readJson<{ url?: string; error?: string }>(res);
      if (!res.ok || !data?.url) throw Error(data?.error ?? "Couldn't create a share link");
      const absolute = new URL(data.url, window.location.origin).toString();
      setUrl(absolute);
      return absolute;
    } catch (e) {
      toast((e as Error).message, "error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const link = url ?? (await create(names));
    if (!link) return;
    const title = `${getGame(gameId).name} on SinverseGames`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: "Look at our result!", url: link });
        return;
      } catch {
        // Cancelled or unsupported: fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied", "success");
    } catch {
      toast("Copy this link to share it", "info");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="share-result">
      <Button onClick={share} loading={busy} icon={<Share2 className="size-4" />} data-testid="share-button">
        Share result
      </Button>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={names}
          onChange={(e) => {
            setNames(e.target.checked);
            setUrl(null);
          }}
          data-testid="share-names"
        />
        Show our names
      </label>
      {url && (
        <>
          <a href={url} className="flex items-center gap-1 text-sm font-semibold underline" data-testid="share-link" target="_blank" rel="noreferrer">
            <Link2 className="size-4" aria-hidden /> Open card
          </a>
          <a href={`${url}/opengraph-image`} download="sinversegames-result.png" className="flex items-center gap-1 text-sm font-semibold underline">
            <Download className="size-4" aria-hidden /> Save image
          </a>
        </>
      )}
    </div>
  );
}
