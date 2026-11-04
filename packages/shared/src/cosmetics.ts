export const COSMETIC_CATEGORIES = ["profile-frame", "nameplate"] as const;
export type CosmeticCategory = (typeof COSMETIC_CATEGORIES)[number];

export interface CosmeticItem {
  id: string;
  category: CosmeticCategory;
  name: string;
  description: string;
  price: number;
  color: string;
  detail: string;
}

/** Stable IDs: prices are authoritative on the server; ownership never expires. */
export const COSMETICS: readonly CosmeticItem[] = [
  { id: "frame-brass-orbit", category: "profile-frame", name: "Brass orbit", description: "A double brass rim for your profile portrait.", price: 15, color: "#ffbf57", detail: "double" },
  { id: "frame-jade-studio", category: "profile-frame", name: "Jade studio", description: "A carved jade border, inspired by the garden.", price: 25, color: "#2fd6a8", detail: "solid" },
  { id: "frame-ink-star", category: "profile-frame", name: "Ink star", description: "A violet dashed border from the sketchbook club.", price: 35, color: "#b39aff", detail: "dashed" },
  { id: "nameplate-sunset", category: "nameplate", name: "Sunset lettering", description: "Warm sunset lettering on your profile and navigation.", price: 20, color: "#ffb675", detail: "sunset" },
  { id: "nameplate-seaglass", category: "nameplate", name: "Sea-glass lettering", description: "Cool sea-glass lettering on your profile and navigation.", price: 30, color: "#81e6d9", detail: "seaglass" },
];

export const getCosmetic = (id: string | null | undefined): CosmeticItem | undefined => COSMETICS.find((item) => item.id === id);
/** The existing theme sets color-scheme, so lettering stays readable in both themes. */
export const cosmeticTextColor = (id: string | null | undefined) => {
  const item = getCosmetic(id);
  return item?.category === "nameplate" ? `light-dark(${item.id === "nameplate-sunset" ? "#913d04" : "#11605a"}, ${item.color})` : undefined;
};
export const COIN_RULES = { completion: 2, victory: 10, personalBest: 3, achievement: 5, dailyCap: 80, minimumDurationMs: 30_000 } as const;
export const COIN_REWARD_REASONS = ["match_played", "match_won", "personal_best", "achievement"] as const;

export const coinReasonLabel = (reason: string) => ({
  match_played: "Game completed", match_won: "Victory / solo completion", personal_best: "New personal best",
  achievement: "Achievement unlocked", cosmetic_purchase: "Cosmetic purchase",
}[reason] ?? "Previous reward");
