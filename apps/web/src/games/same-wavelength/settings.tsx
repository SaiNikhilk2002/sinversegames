"use client";

import { sameWavelengthConfigSchema, type SameWavelengthConfig } from "@platform/engines/same-wavelength";
import { Segmented, Switch } from "@/components/ui/primitives";
import type { GameSettingsProps } from "../types";

const read = (c: Record<string, unknown>): SameWavelengthConfig => sameWavelengthConfigSchema.parse(c);
export const MODE_LABEL: Record<SameWavelengthConfig["mode"], string> = { couples: "Couples · 2", friends: "Friends · 2–4", group: "Group · 2–6" };
const MODE_HINT: Record<SameWavelengthConfig["mode"], string> = {
  couples: "Light everyday prompts and predict-your-partner rounds for two.",
  friends: "Funny, social prompts and who-is-most-likely rounds.",
  group: "Everyone answers, one big reveal. Up to six players.",
};

export const summarizeSameWavelength = (c: Record<string, unknown>): string[] => {
  const cfg = read(c);
  return [MODE_LABEL[cfg.mode], `${cfg.rounds} rounds`, `${cfg.answerSeconds}s to answer`, cfg.textAnswers ? "Typed answers on" : "Pick-only answers"];
};

/** Private-room presets a link can start with (/play/same-wavelength?preset=couples). */
export const SAME_WAVELENGTH_PRESETS: Record<string, Partial<SameWavelengthConfig>> = {
  couples: { mode: "couples", rounds: 8, answerSeconds: 30, textAnswers: true },
  friends: { mode: "friends", rounds: 8, answerSeconds: 30, textAnswers: true },
  group: { mode: "group", rounds: 10, answerSeconds: 30, textAnswers: true },
};

export function SameWavelengthSettings({ config, editable, onChange }: GameSettingsProps) {
  const cfg = read(config);
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold">Mode</p>
        <Segmented label="Mode" disabled={!editable} value={cfg.mode} onChange={(mode) => onChange({ mode })} options={(["couples", "friends", "group"] as const).map((value) => ({ value, label: MODE_LABEL[value] }))} />
        <p className="mt-1.5 text-xs text-ink-muted">{MODE_HINT[cfg.mode]}</p>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Rounds</p>
        <Segmented label="Rounds" disabled={!editable} value={cfg.rounds} onChange={(rounds) => onChange({ rounds })} options={([5, 8, 10, 12] as const).map((value) => ({ value, label: String(value) }))} />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Time to answer</p>
        <Segmented label="Time to answer" disabled={!editable} value={cfg.answerSeconds} onChange={(answerSeconds) => onChange({ answerSeconds })} options={([20, 30, 45, 60] as const).map((value) => ({ value, label: `${value}s` }))} />
      </div>
      <Switch checked={cfg.textAnswers} disabled={!editable} onChange={(textAnswers) => onChange({ textAnswers })} label="Typed answers" description="Adds short write-in prompts. Everyone sees typed answers at the reveal, so keep them for people you know." />
    </div>
  );
}
