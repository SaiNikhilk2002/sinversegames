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
  /** Optional tab-scoped recovery; only clients declaring recoverable use it. */
  initialLog?: unknown;
  onCheckpoint?: (log: unknown[]) => void;
}

export interface SoloSetupProps {
  onStart: (config: Record<string, unknown>) => void;
  busy: boolean;
}

/** Client half of a single-player game: a setup screen and the game itself. */
export interface SoloClient {
  fullWidthSetup?: boolean;
  Setup: ComponentType<SoloSetupProps>;
  Game: ComponentType<SoloGameProps<any>>;
  recoverable?: boolean;
  ResultDetails?: ComponentType<{ details: Record<string, number | string>; saved: boolean }>;
}
