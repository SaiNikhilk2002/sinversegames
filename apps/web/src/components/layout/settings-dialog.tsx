"use client";

import { Modal } from "../ui/modal";
import { Segmented, Switch } from "../ui/primitives";
import { updateSettings, useSettings, resolveLowEffects } from "@/lib/settings";
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
            label="Sound"
            description="Game sounds and music. Nothing plays until you interact with the page."
            checked={s.sound}
            onChange={(sound) => {
              unlockAudio();
              updateSettings({ sound });
              if (sound) sfx.join();
            }}
          />
          <VolumeRow label="Effects volume" value={s.volume} disabled={!s.sound} onChange={(volume) => updateSettings({ volume })} onRelease={() => sfx.card()} />
          <Switch label="Music" description="Background music in games that have it." checked={s.music} disabled={!s.sound} onChange={(music) => updateSettings({ music })} />
          <VolumeRow label="Music volume" value={s.musicVolume} disabled={!s.sound || !s.music} onChange={(musicVolume) => updateSettings({ musicVolume })} />
          <Switch
            label="Reduce motion"
            description="Turns off animations. Your system setting is always respected."
            checked={s.reducedMotion}
            onChange={(reducedMotion) => updateSettings({ reducedMotion })}
          />
          <Switch
            label="Low effects"
            description="Removes decorative motion and blur on slower devices. Gameplay feedback stays."
            checked={resolveLowEffects(s)}
            onChange={(lowEffects) => updateSettings({ lowEffects })}
          />
        </div>
        <p className="text-xs text-ink-faint">Settings are saved on this device only.</p>
      </div>
    </Modal>
  );
}

function VolumeRow({ label, value, disabled, onChange, onRelease }: { label: string; value: number; disabled: boolean; onChange: (v: number) => void; onRelease?: () => void }) {
  return (
    <label className="flex items-center justify-between gap-4 py-3">
      <span className="text-sm font-semibold">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.1}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onRelease}
        className="w-40 accent-brand-500"
      />
    </label>
  );
}
