import type { FieldName, Vec } from "./domain";
import { vec } from "./domain";

export const TEAMS = [
  {
    id: "harbour-lights",
    name: "Harbour Lights",
    short: "HBL",
    color: "#44dec3",
    dark: "#073b42",
    accent: "#f5d58a",
    emblem: "beacon",
    players: [
      "Ari Vale",
      "Nilan Moss",
      "Dev Rowan",
      "Kiran Tide",
      "Tavi Reed",
      "Milo Fen",
      "Ravi Quill",
      "Ishan Cove",
      "Nero Elm",
      "Samir Flint",
      "Luca Bay",
    ],
  },
  {
    id: "ember-kites",
    name: "Ember Kites",
    short: "EMK",
    color: "#ff825d",
    dark: "#412635",
    accent: "#f4d9bc",
    emblem: "kite",
    players: [
      "Rohan Ash",
      "Kai Ember",
      "Ayan Grove",
      "Rey Sol",
      "Darin Voss",
      "Leon Dune",
      "Neel Cedar",
      "Soren Pike",
      "Yuvan Fern",
      "Ezra Shore",
      "Arun Wren",
    ],
  },
] as const;
export const VENUES = {
  lantern: {
    name: "Lantern Oval",
    subtitle: "The city lights up. You take the crease.",
    radiusX: 58,
    radiusZ: 64,
    bounce: 0.63,
    friction: 0.7,
    swing: 0.85,
    spin: 0.65,
    night: true,
  },
  tideglass: {
    name: "Tideglass Park",
    subtitle: "Salt air. Pale terraces. A quick outfield.",
    radiusX: 60,
    radiusZ: 62,
    bounce: 0.67,
    friction: 0.57,
    swing: 1.05,
    spin: 0.9,
    night: false,
  },
} as const;
const positions: Record<FieldName, [number, number][]> = {
  balanced: [
    [-4, 13],
    [8, 7],
    [-18, 6],
    [23, 4],
    [-28, -14],
    [29, -18],
    [-9, -31],
    [14, -40],
    [-38, 28],
  ],
  attack: [
    [-3, 13],
    [-6, 12],
    [8, 7],
    [-12, 0],
    [18, -4],
    [-23, -14],
    [27, -18],
    [-4, -33],
    [32, 32],
  ],
  boundary: [
    [-8, 10],
    [15, 3],
    [-31, 31],
    [39, 23],
    [-44, -4],
    [44, -13],
    [-24, -45],
    [19, -49],
    [-42, 17],
  ],
};
export const fieldPositions = (name: FieldName): Vec[] =>
  positions[name].map(([x, z]) => vec(x, 0, z));

export interface AssetProvenance {
  id: string;
  origin: "original" | "licensed";
  source: string;
  owner: string;
  realIdentity: boolean;
  licenseId?: string;
}
export interface ContentLicense {
  id: string;
  enabled: boolean;
  startsAt: number;
  expiresAt: number;
  scopes: string[];
  permissionReference: string;
}
export const ORIGINAL_CONTENT: AssetProvenance[] = [
  {
    id: "harbour-lights",
    origin: "original",
    source: "content.ts + scene.ts",
    owner: "SinverseGames project",
    realIdentity: false,
  },
  {
    id: "ember-kites",
    origin: "original",
    source: "content.ts + scene.ts",
    owner: "SinverseGames project",
    realIdentity: false,
  },
  {
    id: "lantern",
    origin: "original",
    source: "scene.ts procedural geometry",
    owner: "SinverseGames project",
    realIdentity: false,
  },
  {
    id: "tideglass",
    origin: "original",
    source: "scene.ts procedural geometry",
    owner: "SinverseGames project",
    realIdentity: false,
  },
];
/** Fail closed: no licensed/real identity can replace the original fallback implicitly. */
export function licensedContent(
  candidate: AssetProvenance | undefined,
  licenses: readonly ContentLicense[],
  now: number,
  fallback = ORIGINAL_CONTENT[0]!,
) {
  if (fallback.origin !== "original" || fallback.realIdentity)
    fallback = ORIGINAL_CONTENT[0]!;
  if (!Number.isFinite(now)) return fallback;
  if (!candidate) return fallback;
  if (candidate.origin === "original")
    return candidate.realIdentity ? fallback : candidate;
  const grant = licenses.find((l) => l.id === candidate.licenseId);
  return grant?.enabled &&
    grant.permissionReference.trim() &&
    grant.startsAt <= now &&
    grant.expiresAt > now &&
    grant.scopes.includes("commercial-interactive") &&
    grant.scopes.includes(candidate.id)
    ? candidate
    : fallback;
}
