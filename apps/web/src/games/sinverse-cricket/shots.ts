import type { ShotInput } from "@platform/engines/sinverse-cricket";
import { battingShot, type BattingShot } from "./batting";

/**
 * The batting shot book: the shots a player chooses between, grouped the way
 * a batter thinks about them. Each is a preset of the engine's existing shot
 * input (kind, aim, footwork, power), so the engine still decides contact,
 * edges and where the ball goes; nothing here can guarantee an outcome. The
 * shot is only ever played when the player presses to play it.
 */

export type ShotCategory = "defensive" | "ground" | "off-side" | "leg-side" | "lofted" | "sweeps" | "special";
export const CATEGORIES: { id: ShotCategory; label: string }[] = [
  { id: "defensive", label: "Defend" },
  { id: "ground", label: "Drives" },
  { id: "off-side", label: "Off side" },
  { id: "leg-side", label: "Leg side" },
  { id: "lofted", label: "Lofted" },
  { id: "sweeps", label: "Sweeps" },
  { id: "special", label: "Special" },
];

export interface ShotChoice {
  id: string;
  label: string;
  category: ShotCategory;
  /** The engine input this shot plays (the press supplies the tick). Null: leave the ball. */
  input: Omit<ShotInput, "tick" | "face"> | null;
  footwork: "front" | "back" | "neutral";
  lofted: boolean;
  /** What a batter looks for to play it: context, never a recommendation. */
  hint: string;
}

const shot = (id: string, label: string, category: ShotCategory, kind: ShotInput["kind"], direction: number, foot: number, power: number, hint: string): ShotChoice => ({
  id,
  label,
  category,
  input: { kind, direction, foot, power },
  footwork: foot > 0.05 ? "front" : foot < -0.05 ? "back" : "neutral",
  lofted: kind === "loft",
  hint,
});

export const SHOT_BOOK: ShotChoice[] = [
  shot("forward-defence", "Forward defence", "defensive", "defend", 0, 0.4, 0.3, "Full and straight, to survive"),
  shot("back-defence", "Back-foot defence", "defensive", "defend", 0, -0.2, 0.3, "Short of a length, at the body"),
  { id: "leave", label: "Leave", category: "defensive", input: null, footwork: "neutral", lofted: false, hint: "Wide of off stump, or over the stumps" },
  shot("straight-drive", "Straight drive", "ground", "straight", 0, 0.35, 0.85, "Full on the stumps"),
  shot("off-drive", "Off drive", "ground", "straight", 25, 0.35, 0.85, "Full, just outside off"),
  shot("on-drive", "On drive", "ground", "straight", -25, 0.35, 0.85, "Full, on middle and leg"),
  shot("cover-drive", "Cover drive", "off-side", "cover", 45, 0.3, 0.85, "Full and wide of off"),
  shot("cut", "Cut", "off-side", "cut", 80, -0.15, 0.9, "Short and wide of off"),
  shot("late-cut", "Late cut", "off-side", "cut", 115, -0.1, 0.6, "Wide, late, past the keeper"),
  shot("flick", "Flick", "leg-side", "on-drive", -55, 0.25, 0.7, "On the pads"),
  shot("glance", "Leg glance", "leg-side", "on-drive", -95, 0.1, 0.5, "Drifting down leg"),
  shot("pull", "Pull", "leg-side", "pull", -70, -0.2, 0.9, "Short, chest high"),
  shot("hook", "Hook", "leg-side", "pull", -95, -0.25, 1, "Short, head high"),
  shot("lofted-straight", "Lofted straight", "lofted", "loft", 0, 0.35, 1, "Full, in the slot"),
  shot("lofted-cover", "Lofted cover", "lofted", "loft", 40, 0.3, 1, "Full and wide, with room"),
  shot("lofted-leg", "Lofted on side", "lofted", "loft", -35, 0.25, 1, "Full on the pads"),
  shot("sweep", "Sweep", "sweeps", "sweep", -60, 0.45, 0.7, "Spin, full on leg"),
  shot("reverse-sweep", "Reverse sweep", "sweeps", "sweep", 40, 0.45, 0.65, "Spin, a gap behind point"),
  shot("paddle-sweep", "Paddle sweep", "sweeps", "sweep", -115, 0.45, 0.45, "Spin, fine leg up"),
  shot("slog", "Slog", "special", "loft", -60, 0, 1, "All out attack: high risk"),
];

export const shotChoice = (id: string) => SHOT_BOOK.find((s) => s.id === id) ?? null;
export const shotsIn = (category: ShotCategory) => SHOT_BOOK.filter((s) => s.category === category);

/** The animation a choice plays (the engine input through the same mapping the renderer uses). */
export const strokeOf = (choice: ShotChoice): BattingShot => battingShot(choice.input);

/** The book entry that best describes an engine shot input (for showing the current intent). */
export function choiceFor(input: Pick<ShotInput, "kind" | "direction" | "foot"> | null): ShotChoice {
  if (!input) return shotChoice("leave")!;
  let best = SHOT_BOOK[0]!,
    score = Infinity;
  for (const s of SHOT_BOOK) {
    if (!s.input || s.input.kind !== input.kind) continue;
    const d = Math.abs(s.input.direction - input.direction) + Math.abs(s.input.foot - input.foot) * 40;
    if (d < score) (best = s), (score = d);
  }
  return best;
}

/** Keyboard: 1-7 pick a category; within it, the same key again (or Tab) steps to the next shot. */
export function stepChoice(current: ShotChoice, category: ShotCategory): ShotChoice {
  const list = shotsIn(category);
  if (current.category !== category) return list[0]!;
  return list[(list.indexOf(current) + 1) % list.length]!;
}

/** How a delivery is read once it's been bowled, for the between-ball card: pace in km/h and the variation's name. */
export function deliveryRead(speedMs: number, variation: string) {
  const names: Record<string, string> = { seam: "Seam", inswing: "Inswinger", outswing: "Outswinger", slower: "Slower ball", offbreak: "Off-break", legbreak: "Leg-break", googly: "Googly", topspin: "Top-spinner" };
  return { kmh: Math.round(speedMs * 3.6), name: names[variation] ?? variation };
}
