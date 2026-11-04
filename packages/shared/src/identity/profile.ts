import { z } from "zod";

const reserved = new Set([
  "admin",
  "administrator",
  "moderator",
  "mod",
  "support",
  "system",
  "root",
  "staff",
  "sinverse",
  "sinversegames",
  "google",
  "official",
  "help",
  "null",
  "undefined",
  "deleted",
  "anonymous",
  "fuck",
  "shit",
  "nigger",
  "nazi",
  "hitler",
]);
export const usernameSchema = z
  .string()
  .min(3)
  .max(20)
  .regex(
    /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/,
    "Use 3-20 letters/numbers, with single underscores between words.",
  )
  .transform((s) => s.toLowerCase())
  .refine(
    (s) =>
      !reserved.has(s) &&
      !s.split(/_|\d+/).some((part) => reserved.has(part)) &&
      !/^(admin|moderator|support|system|root|staff|sinverse|google|official)/.test(
        s,
      ),
    "That username is reserved.",
  );
export const USERNAME_RENAME_MS = 30 * 24 * 60 * 60 * 1000;
export const ACCOUNT_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function hashSecret(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export const avatarUrl = (
  key?: string | null,
  size: "small" | "full" = "small",
) => (key && /^[a-f0-9]{32}$/.test(key) ? `/api/avatars/${key}/${size}` : null);
