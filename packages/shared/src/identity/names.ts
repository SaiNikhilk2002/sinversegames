import { z } from "zod";

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 20;

/**
 * Normalises a user-supplied display name: strips control, zero-width and
 * bidi-override characters (which can be used to spoof other names), collapses
 * whitespace and keeps a conservative character set. Returns null when nothing
 * usable remains. Output is still escaped by React when rendered.
 */
export function sanitizeDisplayName(input: string): string | null {
  const cleaned = input
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, "")
    .replace(/[^\p{L}\p{M}\p{N} _.\-']/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DISPLAY_NAME_MAX)
    .trim();
  if (cleaned.length < DISPLAY_NAME_MIN) return null;
  return cleaned;
}

export const displayNameSchema = z
  .string()
  .max(64)
  .transform((value, ctx) => {
    const clean = sanitizeDisplayName(value);
    if (!clean) {
      ctx.addIssue({
        code: "custom",
        message: `Name must be ${DISPLAY_NAME_MIN}–${DISPLAY_NAME_MAX} letters or numbers`,
      });
      return z.NEVER;
    }
    return clean;
  });

/** Avatar colours come from a fixed palette so they always render with good contrast. */
export const AVATAR_COLORS = [
  "#ff6b6b",
  "#ffa94d",
  "#fcc419",
  "#51cf66",
  "#20c997",
  "#339af0",
  "#5c7cfa",
  "#9775fa",
  "#f06595",
  "#22b8cf",
] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

export const avatarColorSchema = z.enum(AVATAR_COLORS);

export function avatarColorFor(seed: string): AvatarColor {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}
