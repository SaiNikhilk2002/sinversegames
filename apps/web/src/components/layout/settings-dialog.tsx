"use client";

import { Modal } from "../ui/modal";
import { Segmented, Switch } from "../ui/primitives";
import { updateSettings, useSettings } from "@/lib/settings";
import { sfx, unlockAudio } from "@/lib/sound";

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings();
  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-semibold">Theme</p>
          <Segmented
            label="Theme"
            value={s.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={[
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
              { value: "system", label: "System" },
            ]}
          />
        </div>
        <div className="divide-y divide-line">
          <Switch
            label="Sound effects"
            description="Short sounds for your turn, plays and correct guesses. Never plays on page load."
            checked={s.sound}
            onChange={(sound) => {
              unlockAudio();
              updateSettings({ sound });
              if (sound) sfx.join();
            }}
          />
          <label className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm font-semibold">Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={s.volume}
              disabled={!s.sound}
              aria-label="Volume"
              onChange={(e) => updateSettings({ volume: Number(e.target.value) })}
              onPointerUp={() => sfx.card()}
              className="w-40 accent-brand-500"
            />
          </label>
          <Switch
            label="Reduce motion"
            description="Turns off animations. Your system setting is always respected."
            checked={s.reducedMotion}
            onChange={(reducedMotion) => updateSettings({ reducedMotion })}
          />
        </div>
        <p className="text-xs text-ink-faint">Settings are saved on this device only.</p>
      </div>
    </Modal>
  );
}
