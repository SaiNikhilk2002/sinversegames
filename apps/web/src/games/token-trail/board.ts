import { HOME, LAST_TRACK_STEP, TRACK_LENGTH } from "@platform/engines/token-trail";

/**
 * Board geometry for a 15×15 grid: [row, col] cells for the 52-square loop
 * (index 0 is seat 0's start), each seat's home lane, base yard and colours.
 */
export type Cell = [row: number, col: number];

export const TRACK: Cell[] = [
  ...[1, 2, 3, 4, 5].map((c): Cell => [6, c]),
  ...[5, 4, 3, 2, 1, 0].map((r): Cell => [r, 6]),
  [0, 7],
  [0, 8],
  ...[1, 2, 3, 4, 5].map((r): Cell => [r, 8]),
  ...[9, 10, 11, 12, 13, 14].map((c): Cell => [6, c]),
  [7, 14],
  [8, 14],
  ...[13, 12, 11, 10, 9].map((c): Cell => [8, c]),
  ...[9, 10, 11, 12, 13, 14].map((r): Cell => [r, 8]),
  [14, 7],
  [14, 6],
  ...[13, 12, 11, 10, 9].map((r): Cell => [r, 6]),
  ...[5, 4, 3, 2, 1, 0].map((c): Cell => [8, c]),
  [7, 0],
  [6, 0],
];
if (TRACK.length !== TRACK_LENGTH) throw new Error("Token Trail track must have 52 squares");

/** Home lanes: five cells from the edge towards the centre, per seat. */
export const HOME_LANES: Cell[][] = [
  [1, 2, 3, 4, 5].map((c): Cell => [7, c]),
  [1, 2, 3, 4, 5].map((r): Cell => [r, 7]),
  [13, 12, 11, 10, 9].map((c): Cell => [7, c]),
  [13, 12, 11, 10, 9].map((r): Cell => [r, 7]),
];

/** Base yards (top-left corner of each 6×6 corner block) per seat. */
export const BASES: Cell[] = [
  [0, 0],
  [0, 9],
  [9, 9],
  [9, 0],
];

export const SEAT_COLORS = [
  { fill: "#ff5d73", deep: "#c2304a", soft: "#ffd3da", name: "Coral" },
  { fill: "#3fa4ff", deep: "#1f6fc4", soft: "#cfe7ff", name: "Sky" },
  { fill: "#ffc83d", deep: "#c78f00", soft: "#fff0c2", name: "Sun" },
  { fill: "#2fc28a", deep: "#16825a", soft: "#c8f3e1", name: "Mint" },
];

/** Grid cell for a token: base slots, track, home lane or the centre. */
export function tokenCell(seat: number, progress: number, tokenIndex: number): Cell {
  if (progress < 0) {
    const [r, c] = BASES[seat]!;
    const slot: Cell[] = [
      [1.5, 1.5],
      [1.5, 3.5],
      [3.5, 1.5],
      [3.5, 3.5],
    ];
    const [dr, dc] = slot[tokenIndex]!;
    return [r + dr, c + dc];
  }
  if (progress <= LAST_TRACK_STEP) return TRACK[(seat * 13 + progress) % TRACK_LENGTH]!;
  if (progress < HOME) return HOME_LANES[seat]![progress - LAST_TRACK_STEP - 1]!;
  const centre: Cell[] = [
    [7, 6.4],
    [6.4, 7],
    [7, 7.6],
    [7.6, 7],
  ];
  return centre[seat]!;
}
