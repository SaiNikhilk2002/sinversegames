"use client";

import { colorClashConfigSchema, type ColorClashConfig } from "@platform/engines/color-clash/client";
import { Segmented, Switch } from "@/components/ui/primitives";
import type { GameSettingsProps } from "../types";

const read = (c: Record<string, unknown>): ColorClashConfig => colorClashConfigSchema.parse(c);

export function summarizeColorClash(c: Record<string, unknown>): string[] {
  const cfg = read(c);
  return [
    `${cfg.handSize} cards each`,
    cfg.turnSeconds ? `${cfg.turnSeconds}s turns` : "No turn timer",
    ...(cfg.stackDrawCards ? ["Stacking on"] : []),
    ...(cfg.drawUntilPlayable ? ["Draw until playable"] : []),
    ...(!cfg.prism4AnyTime ? ["Strict Prism +4"] : []),
  ];
}

export function ColorClashSettings({ config, editable, onChange }: GameSettingsProps) {
  const cfg = read(config);
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold">Starting hand</p>
        <Segmented label="Starting hand" disabled={!editable} value={cfg.handSize} onChange={(handSize) => onChange({ handSize })} options={[5, 7, 10].map((n) => ({ value: n, label: `${n} cards` }))} />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Turn timer</p>
        <Segmented
          label="Turn timer"
          disabled={!editable}
          value={cfg.turnSeconds}
          onChange={(turnSeconds) => onChange({ turnSeconds })}
          options={[
            { value: 15, label: "15s" },
            { value: 30, label: "30s" },
            { value: 60, label: "60s" },
            { value: 0, label: "Off" },
          ]}
        />
      </div>
      <div className="divide-y divide-line">
        <Switch disabled={!editable} label="Stack draw cards" description="Answer a +2 with a +2 (or a +4) to pass the penalty on." checked={cfg.stackDrawCards} onChange={(stackDrawCards) => onChange({ stackDrawCards })} />
        <Switch disabled={!editable} label="Draw until playable" description="Keep drawing until you get a card you can play." checked={cfg.drawUntilPlayable} onChange={(drawUntilPlayable) => onChange({ drawUntilPlayable })} />
        <Switch disabled={!editable} label="Prism +4 any time" description="When off, Prism +4 is only allowed if you have no card of the active colour." checked={cfg.prism4AnyTime} onChange={(prism4AnyTime) => onChange({ prism4AnyTime })} />
      </div>
    </div>
  );
}
