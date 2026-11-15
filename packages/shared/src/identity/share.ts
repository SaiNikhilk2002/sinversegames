import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { GAME_IDS } from "../games/registry";

/**
 * Shareable result cards (docs/FUN_INSIGHTS_SYSTEM.md). A share link carries a signed summary of a
 * finished, recorded match: the game, the headline numbers, up to two Fun Insights and, only if
 * the sharer chose to, the players' display names. Never answers, emails, player ids, room codes
 * or anything private: the token is built on the server from the recorded match, signed so it
 * can't be edited, and readable by anyone with the link (it's meant to be shared).
 */
export const sharePayloadSchema = z
  .object({
    v: z.literal(1),
    /** Game id. */
    g: z.enum(GAME_IDS),
    /** When the match ended (ms). */
    t: z.number().int().nonnegative(),
    /** Players in the match. */
    p: z.number().int().min(1).max(12),
    /** Headline, e.g. "86% on the same wavelength". */
    h: z.string().max(80),
    /** Supporting numbers shown on the card ("label: value"), at most four. */
    s: z.array(z.tuple([z.string().max(24), z.string().max(16)])).max(4),
    /** Fun Insights, at most two. */
    i: z.array(z.string().max(140)).max(2),
    /** Display names, only when the sharer opted in. */
    n: z.array(z.string().max(32)).max(6).optional(),
    /** Match percentage, for the card's dial (Same Wavelength). */
    m: z.number().int().min(0).max(100).optional(),
  })
  .strict();
export type SharePayload = z.infer<typeof sharePayloadSchema>;

const key = (secret: string) => {
  if (!secret || secret.length < 32) throw Error("AUTH_SECRET must be set and at least 32 characters long");
  return new TextEncoder().encode(secret);
};

export async function signShareToken(payload: SharePayload, secret: string): Promise<string> {
  const data = sharePayloadSchema.parse(payload);
  return new SignJWT({ purpose: "share", d: data })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("platform")
    .setAudience("share")
    .setIssuedAt()
    .setExpirationTime("400d")
    .sign(key(secret));
}

/** The card's contents, or null when the link is invalid, edited or expired. */
export async function verifyShareToken(token: string, secret: string): Promise<SharePayload | null> {
  if (token.length > 4096) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { issuer: "platform", audience: "share", algorithms: ["HS256"] });
    if (payload.purpose !== "share") return null;
    const data = sharePayloadSchema.safeParse(payload.d);
    return data.success ? data.data : null;
  } catch {
    return null;
  }
}
