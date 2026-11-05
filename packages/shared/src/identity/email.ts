import { z } from "zod";

/** Stored in OAuthAttempt.mode, which also holds Google's "link" and "signin". */
export const EMAIL_ATTEMPT_MODE = { otp: "emailotp", link: "emaillnk" } as const;
export type EmailMethod = keyof typeof EMAIL_ATTEMPT_MODE;
export const EMAIL_PROVIDER = "email";
export const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;
export const EMAIL_LINK_TTL_MS = 15 * 60 * 1000;
export const EMAIL_OTP_MAX_ATTEMPTS = 5;
export const EMAIL_RESEND_COOLDOWN_SECONDS = 60;

/**
 * One account per normalized address. Limited to 128 characters because pending
 * attempts hold it in OAuthAttempt.verifier. Whitespace and characters that are
 * special in address headers are rejected, not cleaned up.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(128, "Use an email address under 128 characters.")
  .regex(
    /^[^\s@"(),:;<>[\]\\]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/,
    "Enter a valid email address.",
  );
export const otpSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code.");
export const emailLinkTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);

export function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

/** Uniform 6-digit code: values that would bias the remainder are redrawn. */
export function generateOtp() {
  const limit = Math.floor(2 ** 32 / 1_000_000) * 1_000_000;
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0]!;
  } while (value >= limit);
  return String(value % 1_000_000).padStart(6, "0");
}

const hmacKey = (secret: string, usage: "sign" | "verify") =>
  crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
const otpMessage = (scope: string, code: string) =>
  new TextEncoder().encode(`email-otp:${scope}:${code}`);

/**
 * A 6-digit code is too small to protect with a plain hash, so it is keyed with
 * the server secret and scoped to one attempt.
 */
export async function otpMac(secret: string, scope: string, code: string) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret, "sign"),
    otpMessage(scope, code),
  );
  return Array.from(new Uint8Array(signature), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** Uses WebCrypto's HMAC verification, which compares in constant time. */
export async function verifyOtpMac(
  secret: string,
  scope: string,
  code: string,
  mac: string,
) {
  if (!/^[a-f0-9]{64}$/.test(mac)) return false;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(mac.slice(i * 2, i * 2 + 2), 16);
  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret, "verify"),
    bytes,
    otpMessage(scope, code),
  );
}
