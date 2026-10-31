import type { ComponentType } from "react";
import type { Ack, GameStatePayload, RoomSnapshot } from "@platform/shared";

/** Client half of the game integration contract (the server half is GameEngine). */
export interface GameClientProps<V = unknown> {
  code: string;
  room: RoomSnapshot;
  game: GameStatePayload<V>;
  selfId: string;
  /** Sends a game action; `versioned` attaches the state version for turn-based validation. */
  send: <T = unknown>(event: string, payload?: unknown, versioned?: boolean) => Promise<Ack<T>>;
}

export interface GameSettingsProps {
  config: Record<string, unknown>;
  editable: boolean;
  onChange: (patch: Record<string, unknown>) => void;
}

export interface GameClient {
  Game: ComponentType<GameClientProps<any>>;
  Settings: ComponentType<GameSettingsProps>;
  /** Short summary of the current settings for non-hosts. */
  summarize: (config: Record<string, unknown>) => string[];
}
