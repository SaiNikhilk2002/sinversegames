"use client";

import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { AVATAR_COLORS, DISPLAY_NAME_MAX } from "@platform/shared";
import { Avatar, Button, Card, cn, Input, Spinner } from "../ui/primitives";
import { savePlayer, usePlayer } from "@/lib/player";
import { realtime } from "@/lib/realtime/connection";
import { unlockAudio } from "@/lib/sound";

export function NameForm({ initialName = "", initialColor, submitLabel = "Let's play", onSaved }: { initialName?: string; initialColor?: string; submitLabel?: string; onSaved?: () => void }) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<string>(initialColor ?? AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]!);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        unlockAudio();
        setBusy(true);
        setError(null);
        try {
          await savePlayer(name, color);
          realtime.reauthenticate();
          onSaved?.();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-5"
    >
      <div className="flex items-center gap-4">
        <Avatar name={name || "?"} color={color} size={56} />
        <div className="flex-1">
          <label htmlFor="display-name" className="mb-1.5 block text-sm font-semibold">
            Display name
          </label>
          <Input
            id="display-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={DISPLAY_NAME_MAX}
            placeholder="e.g. PixelFox"
            autoComplete="nickname"
            autoFocus
            required
            minLength={2}
          />
        </div>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Avatar colour</legend>
        <div className="flex flex-wrap gap-2">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={c === color}
              onClick={() => setColor(c)}
              className={cn("flex size-9 items-center justify-center rounded-full transition hover:scale-110", c === color && "ring-4 ring-brand-400/60")}
              style={{ background: c }}
            >
              {c === color && <Check className="size-4 text-[#17142b]" />}
            </button>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={name.trim().length < 2}>
        {submitLabel}
      </Button>
      <p className="text-center text-xs text-ink-faint">No account needed. Your name is visible to other players in your rooms.</p>
    </form>
  );
}

/** Renders children once the visitor has a guest identity; otherwise asks for a display name. */
export function NameGate({ children, title = "Choose your name" }: { children: ReactNode; title?: string }) {
  const { player, loading } = usePlayer();
  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading your profile" />
      </div>
    );
  }
  if (player) return <>{children}</>;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card className="p-6 sm:p-8">
        <h1 className="mb-1 font-display text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-ink-muted">Pick a name and colour so your friends know who you are.</p>
        <NameForm />
      </Card>
    </div>
  );
}
