"use client";

import { doodleConfigSchema, WORD_CATEGORIES, type DoodleConfig } from "@platform/engines/doodle-duel/client";
import { Segmented, Switch } from "@/components/ui/primitives";
import type { GameSettingsProps } from "../types";

const read = (c: Record<string, unknown>): DoodleConfig => doodleConfigSchema.parse(c);

export function summarizeDoodleDuel(c: Record<string, unknown>): string[] {
  const cfg = read(c);
  return [
    `${cfg.rounds} ${cfg.rounds === 1 ? "round" : "rounds"}`,
    `${cfg.drawSeconds}s to draw`,
    cfg.difficulty === "mixed" ? "Mixed difficulty" : `${cfg.difficulty[0]!.toUpperCase()}${cfg.difficulty.slice(1)} words`,
    cfg.category === "mixed" ? "All categories" : WORD_CATEGORIES[cfg.category],
    cfg.hints ? "Hints on" : "Hints off",
  ];
}

export function DoodleDuelSettings({ config, editable, onChange }: GameSettingsProps) {
  const cfg = read(config);
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold">Rounds</p>
        <Segmented label="Rounds" disabled={!editable} value={cfg.rounds} onChange={(rounds) => onChange({ rounds })} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Drawing time</p>
        <Segmented label="Drawing time" disabled={!editable} value={cfg.drawSeconds} onChange={(drawSeconds) => onChange({ drawSeconds })} options={[30, 60, 80, 120].map((n) => ({ value: n, label: `${n}s` }))} />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Word difficulty</p>
        <Segmented
          label="Word difficulty"
          disabled={!editable}
          value={cfg.difficulty}
          onChange={(difficulty) => onChange({ difficulty })}
          options={[
            { value: "mixed", label: "Mixed" },
            { value: "easy", label: "Easy" },
            { value: "medium", label: "Medium" },
            { value: "hard", label: "Hard" },
          ]}
        />
      </div>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">Word category</span>
        <select
          disabled={!editable}
          value={cfg.category}
          onChange={(e) => onChange({ category: e.target.value })}
          className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 font-medium disabled:opacity-60"
        >
          <option value="mixed">Random mix</option>
          {Object.entries(WORD_CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <div className="divide-y divide-line">
        <Switch disabled={!editable} label="Hints" description="Show the category, then reveal letters as time runs down." checked={cfg.hints} onChange={(hints) => onChange({ hints })} />
        <Switch disabled={!editable} label="Typo tolerance" description="Accept answers with one small typo on longer words." checked={cfg.typoTolerance} onChange={(typoTolerance) => onChange({ typoTolerance })} />
      </div>
    </div>
  );
}
