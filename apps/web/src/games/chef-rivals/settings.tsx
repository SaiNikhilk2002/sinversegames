"use client";

import { rivalsConfigSchema, type RivalsConfig } from "@platform/engines/cuisine-quest";
import { Segmented } from "@/components/ui/primitives";
import type { GameSettingsProps } from "../types";

const read = (c: Record<string, unknown>): RivalsConfig => rivalsConfigSchema.parse(c);
const LABEL: Record<RivalsConfig["durationSeconds"], string> = { 120: "2 min · Sprint", 180: "3 min · Classic", 240: "4 min · Relaxed" };

export const summarizeChefRivals = (c: Record<string, unknown>): string[] => [LABEL[read(c).durationSeconds]];

export function ChefRivalsSettings({ config, editable, onChange }: GameSettingsProps) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">Cooking time</p>
      <Segmented
        label="Cooking time"
        disabled={!editable}
        value={read(config).durationSeconds}
        onChange={(durationSeconds) => onChange({ durationSeconds })}
        options={([120, 180, 240] as const).map((value) => ({ value, label: LABEL[value] }))}
      />
    </div>
  );
}
