"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import { roomCodeSchema } from "@platform/shared";
import { Button, cn } from "../ui/primitives";

export function JoinCodeForm({ className, compact }: { className?: string; compact?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className={cn("w-full", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = roomCodeSchema.safeParse(code);
        if (!parsed.success) return setError("Room codes are 6 letters and numbers, like K7PQ2M");
        router.push(`/room/${parsed.data}`);
      }}
    >
      <div className={cn("flex items-center gap-2 rounded-2xl border border-line bg-surface p-1.5 shadow-card", compact && "rounded-xl")}>
        <KeyRound className="ml-2.5 size-5 shrink-0 text-ink-faint" aria-hidden />
        <label htmlFor="join-code" className="sr-only">
          Room code
        </label>
        <input
          id="join-code"
          value={code}
          onChange={(e) => {
            setError(null);
            setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
          }}
          placeholder="Enter room code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="h-11 min-w-0 flex-1 bg-transparent font-mono text-lg tracking-[0.25em] uppercase outline-none placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:normal-case placeholder:text-ink-faint"
        />
        <Button type="submit" size="md" disabled={code.length !== 6} aria-label="Join room">
          Join <ArrowRight className="size-4" />
        </Button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </form>
  );
}
