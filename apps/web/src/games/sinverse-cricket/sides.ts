import { TEAMS, isFormatConfig, type CricketConfig, type Side } from "@platform/engines/sinverse-cricket";

/**
 * The two sides of the match being shown: names, kit colours and players.
 * The renderer reads kits from here, so an international match wears its own
 * teams' colours. It defaults to the duel's two teams (the studio, older
 * replays) until a match sets it.
 */
export interface SideLook {
  id: string;
  name: string;
  short: string;
  color: string;
  dark: string;
  accent: string;
  players: string[];
}
const duel = (): [SideLook, SideLook] => [TEAMS[0], TEAMS[1]].map((t) => ({ id: t.id, name: t.name, short: t.short, color: t.color, dark: t.dark, accent: t.accent, players: [...t.players] })) as [SideLook, SideLook];
let sides: [SideLook, SideLook] = duel();

export function setSides(next: readonly Side[] | null) {
  sides = next ? (next.map((s) => ({ id: s.id, name: s.name, short: s.short, color: s.color, dark: s.dark, accent: s.accent, players: s.players.map((p) => p.name) })) as [SideLook, SideLook]) : duel();
}
/** A side's look by index (0 or 1). */
export const side = (n: number) => sides[n < 0 ? 0 : n] ?? sides[0];
/** Which side index the player controls. */
export const humanSide = (config: CricketConfig) => (isFormatConfig(config) ? 0 : config.team);
