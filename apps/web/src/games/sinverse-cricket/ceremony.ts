export type CoinFace = "heads" | "tails";
export type CeremonyStage = "stadium" | "lineups" | "captains" | "hand" | "flight" | "landing" | "reveal" | "decision" | "entry" | "done";
export type CeremonyFeed = { stage: CeremonyStage; age: number; spin: number; call: CoinFace | null; face: CoinFace | null; team: number; reduced: boolean };
const next: Partial<Record<CeremonyStage, CeremonyStage>> = { stadium: "lineups", lineups: "captains", captains: "hand", hand: "flight", flight: "landing", landing: "reveal", reveal: "decision", entry: "done" };
const duration: Partial<Record<CeremonyStage, number>> = { stadium: 1.6, lineups: 2.8, captains: 1.8, hand: 1, flight: 3.2, landing: 0.75, reveal: 1.2, entry: 2.4 };

/** Presentation clock only. No RNG, scoring, DOM, or match mutation. */
export class TossSequence {
  stage: CeremonyStage = "stadium";
  age = 0;
  call: CoinFace | null = null;
  spin = 0;
  advance(seconds: number, paused: boolean, reduced: boolean) {
    if (paused || !next[this.stage]) return;
    this.age += Math.max(0, seconds) * (reduced ? 3 : 1);
    if (this.stage === "flight" && !reduced) this.spin += Math.max(0, seconds) * 4.6;
    // Hold in mid-air until a conscious call: never default a user's choice.
    if (this.stage === "flight" && !this.call) this.age = Math.min(this.age, 1.55);
    if (this.age >= duration[this.stage]!) {
      this.stage = next[this.stage]!;
      this.age = 0;
    }
  }
  choose(call: CoinFace) {
    if (this.stage !== "flight" || this.call) return false;
    this.call = call;
    return true;
  }
  skip() {
    if (["stadium", "lineups", "captains", "hand"].includes(this.stage)) { this.stage = "flight"; this.age = 0; }
    else if (this.stage === "flight" && this.call) { this.stage = "landing"; this.age = 0; }
    else if (this.stage === "landing") { this.stage = "reveal"; this.age = 0; }
    else if (this.stage === "reveal") { this.stage = "decision"; this.age = 0; }
    else if (this.stage === "entry") { this.stage = "done"; this.age = 0; }
  }
  enter() {
    if (this.stage !== "decision" || !this.call) return false;
    this.stage = "entry"; this.age = 0;
    return true;
  }
  feed(face: CoinFace, team: number, reduced: boolean): CeremonyFeed {
    return { stage: this.stage, age: this.age, spin: this.spin, call: this.call, face: this.call && ["landing", "reveal", "decision", "entry", "done"].includes(this.stage) ? face : null, team, reduced };
  }
}
const ease = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t); };
/** Cylinder axis +Y: heads on the top, tails on the bottom. Rotation is outcome-independent until the call locks. */
export function coinPose(f: CeremonyFeed) {
  const final = f.face === "tails" ? Math.PI : 0;
  const restingRotation = Math.ceil((f.spin + Math.PI) / (Math.PI * 2)) * Math.PI * 2 + final;
  if (["reveal", "decision", "entry", "done"].includes(f.stage)) return { x: 0.6, y: 0.003, z: 0.7, rx: restingRotation, rz: 0 };
  if (f.stage === "landing") {
    const u = ease(f.age / 0.75);
    return { x: 0.6, y: 0.003 + (1 - u) * 1.517 + Math.sin(u * Math.PI * 3) ** 2 * (1 - u) * 0.035, z: 0.7, rx: f.spin + (restingRotation - f.spin) * u, rz: (1 - u) * 0.2 };
  }
  if (f.stage === "flight") {
    const u = Math.min(1, f.age / 3.2);
    return { x: 0.6, y: 1.52 + Math.sin(u * Math.PI) * 2.5, z: 0.7, rx: f.spin, rz: f.reduced ? 0 : Math.sin(u * Math.PI) * 0.2 };
  }
  return { x: 0.6, y: 1.52, z: 0.7, rx: 0, rz: 0 };
}
