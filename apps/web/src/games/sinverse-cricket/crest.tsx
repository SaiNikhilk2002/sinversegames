import type { CricketTeam, Emblem } from "@platform/engines/sinverse-cricket";

/**
 * A team's crest: an abstract emblem on the team's own colours. Original
 * artwork only: no national flags, real crests or licensed marks (see
 * packages/engines/src/sinverse-cricket/teams.ts).
 */
const EMBLEMS: Record<Emblem, string> = {
  chevron: "M12 30 24 18l12 12M12 22l12-12 12 12",
  ring: "M24 13a11 11 0 1 0 0.01 0ZM24 18a6 6 0 1 0 0.01 0Z",
  diamond: "M24 10 35 24 24 38 13 24ZM24 17l7 7-7 7-7-7Z",
  bars: "M14 15h20M14 22h20M14 29h20M14 36h20",
  star: "m24 10 3.6 8.6 9.4.8-7.1 6.1 2.2 9.1L24 29.7l-8.1 4.9 2.2-9.1-7.1-6.1 9.4-.8Z",
  wave: "M11 20c4-4 9-4 13 0s9 4 13 0M11 28c4-4 9-4 13 0s9 4 13 0",
  peak: "M10 35 20 18l5 8 4-6 9 15ZM20 18l2 4",
  leaf: "M24 38c-8-6-11-14-8-24 9 2 15 9 14 19-1 3-3 5-6 5ZM24 38V20",
  shield: "M24 10 35 14v9c0 8-5 13-11 16-6-3-11-8-11-16v-9Z M24 15v19M17 22h14",
  sun: "M24 18a6 6 0 1 0 0.01 0ZM24 9v5M24 34v5M9 24h5M34 24h5M13 13l3.5 3.5M31.5 31.5 35 35M13 35l3.5-3.5M31.5 16.5 35 13",
};

export function TeamCrest({ team, size = 44, label = false }: { team: Pick<CricketTeam, "palette" | "emblem" | "short" | "name">; size?: number; label?: boolean }) {
  const { primary, secondary, accent } = team.palette;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className="cr-crest" role={label ? "img" : undefined} aria-hidden={label ? undefined : true} aria-label={label ? `${team.name} crest` : undefined}>
      <path d="M24 2 44 9v15c0 12-9 19-20 22C13 43 4 36 4 24V9Z" fill={primary} stroke={accent} strokeWidth="2" />
      <path d="M24 6 40 11.5V24c0 10-7 15.5-16 18.2" fill={secondary} opacity="0.55" />
      <path d={EMBLEMS[team.emblem]} fill="none" stroke={accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
