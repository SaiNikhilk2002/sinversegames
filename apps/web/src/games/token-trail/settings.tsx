"use client";

import { tokenTrailConfigSchema, type TokenTrailConfig } from "@platform/engines/token-trail";
import { Segmented } from "@/components/ui/primitives";
import type { GameSettingsProps } from "../types";

const read = (c: Record<string, unknown>): TokenTrailConfig => tokenTrailConfigSchema.parse(c);

export function summarizeTokenTrail(c: Record<string, unknown>): string[] {
  const cfg = read(c);
  return [`${cfg.tokensPerPlayer} token${cfg.tokensPerPlayer === 1 ? "" : "s"} each`, cfg.turnSeconds ? `${cfg.turnSeconds}s per move` : "No turn timer"];
}

export function TokenTrailSettings({ config, editable, onChange }: GameSettingsProps) {
  const cfg = read(config);
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold">Tokens per player</p>
        <Segmented
          label="Tokens per player"
          disabled={!editable}
          value={cfg.tokensPerPlayer}
          onChange={(tokensPerPlayer) => onChange({ tokensPerPlayer })}
          options={[
            { value: 1, label: "1 · Sprint" },
            { value: 2, label: "2 · Quick" },
            { value: 4, label: "4 · Classic" },
          ]}
        />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Turn timer</p>
        <Segmented
          label="Turn timer"
          disabled={!editable}
          value={cfg.turnSeconds}
          onChange={(turnSeconds) => onChange({ turnSeconds })}
          options={[
            { value: 10, label: "10s" },
            { value: 20, label: "20s" },
            { value: 45, label: "45s" },
            { value: 0, label: "Off" },
          ]}
        />
      </div>
    </div>
  );
}
