"use client";

import { useState } from "react";
import type { GameId } from "@platform/shared";
import { Modal } from "../ui/modal";
import { Button } from "../ui/primitives";
import { useToast } from "../ui/toast";

const REASONS = [
  { value: "harassment", label: "Harassment or abuse" },
  { value: "offensive-name", label: "Offensive name" },
  { value: "offensive-drawing", label: "Offensive drawing" },
  { value: "cheating", label: "Cheating" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Something else" },
] as const;

export function ReportDialog({ target, roomCode, gameId, onClose }: { target: { id: string; name: string } | null; roomCode: string; gameId: GameId; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"]>("harassment");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal open={!!target} onClose={onClose} title={`Report ${target?.name ?? "player"}`}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!target) return;
          setBusy(true);
          const res = await fetch("/api/reports", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ targetPlayerId: target.id, roomCode, gameId, reason, details: details || undefined }),
          });
          setBusy(false);
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) return toast(data.error ?? "Couldn't send the report", "error");
          toast("Thanks — our moderators will review this report.", "success");
          setDetails("");
          onClose();
        }}
      >
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold">What happened?</legend>
          {REASONS.map((r) => (
            <label key={r.value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2.5 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-500/10">
              <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="accent-brand-500" />
              <span className="text-sm font-medium">{r.label}</span>
            </label>
          ))}
        </fieldset>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Details (optional)</span>
          <textarea value={details} onChange={(e) => setDetails(e.target.value.slice(0, 1000))} rows={3} className="w-full rounded-xl border border-line bg-surface-2 p-3 text-sm" />
        </label>
        <Button type="submit" loading={busy} className="w-full">
          Send report
        </Button>
      </form>
    </Modal>
  );
}
