import type { ComponentType } from "react";

/** What a single-player game reports when a run ends (shown immediately; the server re-checks the score). */
export interface SoloSummary {
  score: number;
  completed: boolean;
  headline: string;
  /** Config for a "Next" button, e.g. the next Kitchen Rush level. */
  nextConfig?: Record<string, unknown>;
  nextLabel?: string;
}

export interface SoloGameProps<C = Record<string, unknown>> {
  seed: number;
  config: C;
  /** The run is over: submit this move log for verification. */
  onFinish: (log: unknown, summary: SoloSummary) => void;
  /** Leave the run without submitting. */
  onQuit: () => void;
}

export interface SoloSetupProps {
  onStart: (config: Record<string, unknown>) => void;
  busy: boolean;
}

/** Client half of a single-player game: a setup screen and the game itself. */
export interface SoloClient {
  Setup: ComponentType<SoloSetupProps>;
  Game: ComponentType<SoloGameProps<any>>;
}
