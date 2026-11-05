import { SHOTS, VARIATIONS, type BowlingInput, type ShotInput } from "@platform/engines/sinverse-cricket";

export type BatIntent = Omit<ShotInput, "tick">;
export const SHOT_AIMS = [0, 0, 35, -35, 75, -70, -60, 15];
export const DEFAULT_BINDINGS = {
  action: "Space", run: "KeyR", replay: "KeyP", camera: "KeyC",
  left: "ArrowLeft", right: "ArrowRight", front: "ArrowUp", back: "ArrowDown",
  loft: "ShiftLeft", defend: "ControlLeft", variation: "KeyV", slower: "KeyQ", faster: "KeyE",
} as const;
export type BindingName = keyof typeof DEFAULT_BINDINGS;
export type Bindings = Record<BindingName, string>;
export const INPUT_STORAGE = "sinverse-cricket-controls-v2";
const bound = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const keyLabel = (code: string) => code.startsWith("Arrow") ? code.slice(5) : code.replace("Key", "").replace("Left", "").replace("Digit", "");

/** Rejects conflicts, including browser navigation and reserved pause/tutorial keys. */
export function rebind(bindings: Bindings, name: BindingName, code: string): Bindings | null {
  if (!/^(Key[A-Z]|Arrow(Left|Right|Up|Down)|Space|ShiftLeft|ControlLeft)$/.test(code) ||
      Object.entries(bindings).some(([k, v]) => k !== name && v === code)) return null;
  return { ...bindings, [name]: code };
}
export function parseBindings(value: unknown): Bindings {
  if (!value || typeof value !== "object") return { ...DEFAULT_BINDINGS };
  const candidate = value as Bindings;
  const keys = Object.keys(DEFAULT_BINDINGS) as BindingName[];
  if (keys.some(k => typeof candidate[k] !== "string") || new Set(keys.map(k => candidate[k])).size !== keys.length) return { ...DEFAULT_BINDINGS };
  let checked: Bindings = { ...candidate };
  for (const k of keys) {
    const next = rebind(checked, k, candidate[k]);
    if (!next) return { ...DEFAULT_BINDINGS };
    checked = next;
  }
  return checked;
}
export function keyboardIntent(code: string, bindings: Bindings, bat: BatIntent, bowl: BowlingInput, batting: boolean): { bat?: BatIntent; bowl?: BowlingInput } | null {
  const index = /^Digit[1-8]$/.test(code) ? Number(code.slice(-1)) - 1 : -1;
  if (index >= 0) return batting
    ? { bat: { ...bat, kind: SHOTS[index]!, direction: SHOT_AIMS[index]! } }
    : { bowl: { ...bowl, variation: VARIATIONS[index]! } };
  const action = (Object.keys(bindings) as BindingName[]).find(k => bindings[k] === code);
  if (batting) {
    if (action === "left" || action === "right") return { bat: { ...bat, direction: bound(bat.direction + (action === "left" ? -10 : 10), -120, 120) } };
    if (action === "front" || action === "back") return { bat: { ...bat, foot: action === "front" ? 0.65 : -0.3 } };
    if (action === "loft") return { bat: { ...bat, kind: "loft", power: 1 } };
    if (action === "defend") return { bat: { ...bat, kind: "defend", power: 0.3 } };
    if (action === "slower" || action === "faster") return { bat: { ...bat, power: bound(bat.power + (action === "slower" ? -0.1 : 0.1), 0.15, 1) } };
  } else {
    if (action === "left" || action === "right") return { bowl: { ...bowl, line: bound(bowl.line + (action === "left" ? -0.1 : 0.1), -1.5, 1.5) } };
    if (action === "front" || action === "back") return { bowl: { ...bowl, length: bound(bowl.length + (action === "front" ? -0.5 : 0.5), 0.5, 9) } };
    if (action === "slower" || action === "faster") return { bowl: { ...bowl, speed: bound(bowl.speed + (action === "slower" ? -0.1 : 0.1), 0, 1) } };
    if (action === "variation") return { bowl: { ...bowl, variation: VARIATIONS[(VARIATIONS.indexOf(bowl.variation) + 1) % VARIATIONS.length]! } };
  }
  return null;
}

export type GestureStart = { id: number; x: number; y: number; at: number; width: number; height: number };
export type Gesture = { dx: number; dy: number; distance: number; duration: number; tap: boolean };
/** Normalized to the playing surface; browser zoom/device pixels never change sensitivity. */
export function finishGesture(start: GestureStart | null, id: number, x: number, y: number, at: number, sensitivity = 1): Gesture | null {
  if (!start || id !== start.id || at < start.at || at - start.at > 3000) return null;
  const scale = Math.max(160, Math.min(start.width, start.height));
  const dx = (x - start.x) / scale * sensitivity, dy = (y - start.y) / scale * sensitivity;
  const distance = Math.hypot(dx, dy);
  return { dx, dy, distance, duration: at - start.at, tap: distance < 0.035 };
}
export function gestureShot(g: Gesture, intent: BatIntent): BatIntent {
  if (g.tap) return { ...intent, kind: "defend", power: 0.3 };
  const direction = bound(Math.atan2(g.dx, -g.dy) * 180 / Math.PI, -120, 120);
  const power = bound(0.35 + g.distance * 1.8, 0.15, 1);
  const kind = g.distance > 0.42 && g.duration < 320 ? "loft"
    : Math.abs(direction) > 58 ? direction > 0 ? "cut" : "pull"
    : direction > 18 ? "cover" : direction < -18 ? "on-drive" : "straight";
  return { ...intent, kind, direction, power, foot: g.dy < -0.18 ? 0.55 : -0.15 };
}
export function gestureBowl(g: Gesture, bowl: BowlingInput): BowlingInput {
  return { ...bowl, line: bound(bowl.line + g.dx * 3, -1.5, 1.5), length: bound(bowl.length + g.dy * 7, 0.5, 9), speed: bound(0.2 + g.distance * 1.5, 0, 1) };
}

/** Ignore editable widgets, interactive buttons, and browser/OS shortcuts. */
export function acceptsGameplayKey(event: { altKey: boolean; metaKey: boolean; ctrlKey: boolean; code: string }, interactive: boolean) {
  return !interactive && !event.altKey && !event.metaKey && (!event.ctrlKey || event.code === "ControlLeft");
}
