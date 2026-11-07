"use client";

import { COOP_KITCHENS, coopConfigSchema } from "@platform/engines/kitchen-rush";
import type { GameSettingsProps } from "../types";

const read = (c: Record<string, unknown>) => COOP_KITCHENS[coopConfigSchema.parse(c).kitchen - 1]!;

export const summarizeKitchenCoop = (c: Record<string, unknown>): string[] => { const kitchen = read(c); return [kitchen.name, kitchen.twist]; };

export function KitchenCoopSettings({ config, editable, onChange }: GameSettingsProps) {
  const selected = read(config);
  return (
    <div>
      <label htmlFor="coop-kitchen" className="mb-2 block text-sm font-semibold">Kitchen</label>
      <select id="coop-kitchen" data-testid="coop-kitchen" className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm" disabled={!editable} value={selected.number} onChange={(e) => onChange({ kitchen: Number(e.target.value) })}>
        {COOP_KITCHENS.map((k) => <option key={k.number} value={k.number}>{k.number}. {k.name}</option>)}
      </select>
      <p className="mt-2 text-xs text-ink-muted">{selected.twist}</p>
    </div>
  );
}
