import "server-only";
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { avatarColorFor, brand } from "@platform/shared";
import { signPlayerToken, verifyPlayerToken, SESSION_TTL_SECONDS, type PlayerClaims } from "@platform/shared/identity";

export const SESSION_COOKIE = "pw_session";

export function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is not configured (min 32 chars)");
  return secret;
}

export interface SessionPlayer {
  id: string;
  name: string;
  color: string;
  kind: PlayerClaims["kind"];
}

/** Reads and verifies the session cookie. Returns null for missing/invalid sessions. */
export async function getSession(): Promise<SessionPlayer | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const c = await verifyPlayerToken(token, "session", authSecret());
    return { id: c.sub, name: c.name, color: c.color, kind: c.kind };
  } catch {
    return null;
  }
}

/** Creates (or renames) a guest session. The id is always server-generated or taken from a verified cookie. */
export async function writeSession(name: string, color: string | undefined, existing: SessionPlayer | null): Promise<SessionPlayer> {
  const id = existing?.id ?? `g_${randomUUID().replace(/-/g, "")}`;
  const player: SessionPlayer = { id, name, color: color ?? existing?.color ?? avatarColorFor(id), kind: existing?.kind ?? "guest" };
  const token = await signPlayerToken({ sub: player.id, name: player.name, color: player.color, kind: player.kind }, "session", authSecret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: brand.siteUrl.startsWith("https://"),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return player;
}

export async function realtimeToken(p: SessionPlayer): Promise<string> {
  return signPlayerToken({ sub: p.id, name: p.name, color: p.color, kind: p.kind }, "realtime", authSecret());
}

/**
 * CSRF defence for state-changing API routes: browsers always send Origin on
 * cross-site POSTs, so we require it to match this site.
 */
export async function isSameOrigin(): Promise<boolean> {
  const h = await headers();
  const origin = h.get("origin");
  if (!origin) return h.get("sec-fetch-site") === "same-origin";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
