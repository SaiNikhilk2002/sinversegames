/**
 * Central SinverseGames branding. Every user-facing platform reference
 * must go through this module.
 * Name and currency are fixed. Optional tagline/description values are inlined at build time.
 */
export const brand = {
  name: "SinverseGames",
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || "Instant multiplayer games with friends",
  description:
    process.env.NEXT_PUBLIC_BRAND_DESCRIPTION ||
    "Free browser games you can play instantly with friends — no downloads, no sign-up required.",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.com",
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3200").replace(/\/$/, ""),
  /** Name of the non-purchasable virtual reward currency. */
  rewardCurrencyName: "Sin Coins",
} as const;

export type Brand = typeof brand;
