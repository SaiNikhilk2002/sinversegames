import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { brand } from "@platform/shared";

/**
 * Admin access: moderators sign in with ADMIN_TOKEN. The cookie holds an
 * expiry plus an HMAC of it (keyed by ADMIN_TOKEN), so it cannot be forged
 * and rotating ADMIN_TOKEN signs every moderator out.
 */
const COOKIE = "pw_admin";
const TTL_MS = 12 * 3600_000;

const adminToken = () => {
  const t = process.env.ADMIN_TOKEN;
  return t && t.length >= 16 ? t : null;
};

const sign = (exp: number, token: string) => createHmac("sha256", token).update(`admin:${exp}`).digest("base64url");

export function tokenMatches(candidate: string): boolean {
  const token = adminToken();
  if (!token) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function startAdminSession() {
  const token = adminToken()!;
  const exp = Date.now() + TTL_MS;
  (await cookies()).set(COOKIE, `${exp}.${sign(exp, token)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: brand.siteUrl.startsWith("https://"),
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export async function endAdminSession() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const token = adminToken();
  if (!token) return false;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const [expStr, mac] = raw.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now() || !mac) return false;
  const expected = Buffer.from(sign(exp, token));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const adminConfigured = () => adminToken() !== null;

/** Calls an authenticated realtime-server admin endpoint. */
export async function realtimeAdmin<T>(path: string, method: "GET" | "POST" = "GET"): Promise<T | null> {
  const base = process.env.REALTIME_INTERNAL_URL ?? process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4200";
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${adminToken()}` },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
