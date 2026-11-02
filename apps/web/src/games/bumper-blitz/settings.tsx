"use client";

import { bumperBlitzConfigSchema, type BumperBlitzConfig } from "@platform/engines/bumper-blitz";
import { Segmented, Switch } from "@/components/ui/primitives";
import type { GameSettingsProps } from "../types";

const read = (c: Record<string, unknown>): BumperBlitzConfig => bumperBlitzConfigSchema.parse(c);

export function summarizeBumperBlitz(c: Record<string, unknown>): string[] {
  const cfg = read(c);
  return [`${cfg.durationSeconds}s match`, cfg.powerups ? "Power-ups on" : "No power-ups", cfg.hazards ? "Hazards on" : "No hazards"];
}

export function BumperBlitzSettings({ config, editable, onChange }: GameSettingsProps) {
  const cfg = read(config);
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold">Match length</p>
        <Segmented
          label="Match length"
          disabled={!editable}
          value={cfg.durationSeconds}
          onChange={(durationSeconds) => onChange({ durationSeconds })}
          options={[30, 60, 90, 120, 180].map((s) => ({ value: s as BumperBlitzConfig["durationSeconds"], label: s < 60 ? `${s}s` : `${s / 60}m${s % 60 ? "30" : ""}` }))}
        />
      </div>
      <div className="divide-y divide-line">
        <Switch disabled={!editable} label="Power-ups" description="Turbo, Heavy and Shield pickups appear on the arena." checked={cfg.powerups} onChange={(powerups) => onChange({ powerups })} />
        <Switch disabled={!editable} label="Hazards" description="Warning zones flash up, then blast nearby pods outward." checked={cfg.hazards} onChange={(hazards) => onChange({ hazards })} />
      </div>
    </div>
  );
}
