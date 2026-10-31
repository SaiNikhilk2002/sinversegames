/**
 * Central platform branding. The final brand name is undecided, so every
 * user-facing reference to the platform must go through this module.
 * Override with NEXT_PUBLIC_BRAND_* environment variables (inlined at build time by Next.js).
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "Playwave",
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || "Instant multiplayer games with friends",
  description:
    process.env.NEXT_PUBLIC_BRAND_DESCRIPTION ||
    "Free browser games you can play instantly with friends — no downloads, no sign-up required.",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.com",
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3200").replace(/\/$/, ""),
  /** Name of the non-purchasable virtual reward currency. */
  rewardCurrencyName: process.env.NEXT_PUBLIC_REWARD_CURRENCY_NAME || "Stars",
} as const;

export type Brand = typeof brand;
