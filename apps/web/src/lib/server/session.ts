import "server-only";
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { avatarColorFor, brand, hashSecret } from "@platform/shared";
import {
  createAccountSession,
  getDb,
  resolveAccountSession,
} from "@platform/db";
import {
  signPlayerToken,
  verifyPlayerToken,
  SESSION_TTL_SECONDS,
  type PlayerClaims,
} from "@platform/shared/identity";

export const SESSION_COOKIE = "pw_session";
export class SessionUnavailableError extends Error {
  constructor() {
    super("Player sessions are temporarily unavailable. Please retry.");
  }
}

/**
 * What a server log needs from an error: Prisma's code and the missing table or
 * column. Connection strings are removed, and nothing here is sent to clients.
 */
export function serverErrorSummary(error: unknown) {
  const e = (error ?? {}) as { name?: unknown; code?: unknown; message?: unknown; meta?: Record<string, unknown> };
  return {
    name: String(e.name ?? "Error"),
    code: typeof e.code === "string" ? e.code : undefined,
    model: e.meta?.modelName,
    table: e.meta?.table,
    column: e.meta?.column,
    message: String(e.message ?? error)
      .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"'`]+/gi, "<url>")
      .slice(0, 500),
  };
}

export function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("AUTH_SECRET is not configured (min 32 chars)");
  return secret;
}

export interface SessionPlayer {
  id: string;
  name: string;
  color: string;
  kind: PlayerClaims["kind"];
  sid?: string;
  username?: string | null;
  avatarKey?: string | null;
}

/** Reads and verifies the session cookie. Returns null for missing/invalid sessions. */
export async function getSession(): Promise<SessionPlayer | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  if (token.startsWith("s1_")) {
    if (!/^s1_[a-f0-9]{64}$/.test(token)) return null;
    const db = getDb();
    if (!db) {
      console.error("session lookup failed: DATABASE_URL is not configured");
      throw new SessionUnavailableError();
    }
    try {
      const session = await resolveAccountSession(
        db,
        await hashSecret(token.slice(3)),
      );
      if (!session) return null;
      const p = session.player;
      return {
        id: p.id,
        name: p.displayName,
        color: p.avatarColor,
        kind: "registered",
        sid: session.tokenHash,
        username: p.username,
        avatarKey: p.avatarKey,
      };
    } catch (error) {
      console.error("session lookup failed", serverErrorSummary(error));
      throw new SessionUnavailableError();
    }
  }
  try {
    const c = await verifyPlayerToken(token, "session", authSecret());
    // Legacy bearer guest cookies cannot retain control after Google linking.
    const db = getDb();
    if (c.kind !== "guest") return null;
    if (db) {
      try {
        const row = await db.player.findUnique({
          where: { id: c.sub },
          select: { kind: true, username: true, avatarKey: true },
        });
        if (row?.kind === "REGISTERED") return null;
        return {
          id: c.sub,
          name: c.name,
          color: c.color,
          kind: c.kind,
          username: row?.username,
          avatarKey: row?.avatarKey,
        };
      } catch (error) {
        console.error("guest session lookup failed", serverErrorSummary(error));
        throw new SessionUnavailableError();
      }
    }
    return { id: c.sub, name: c.name, color: c.color, kind: c.kind };
  } catch (error) {
    if (error instanceof SessionUnavailableError) throw error;
    // An invalid cookie is normal, but a missing secret signs everyone out.
    if (error instanceof Error && error.message.startsWith("AUTH_SECRET"))
      console.error(error.message);
    return null;
  }
}

/** Creates (or renames) a guest session. The id is always server-generated or taken from a verified cookie. */
export async function writeSession(
  name: string,
  color: string | undefined,
  existing: SessionPlayer | null,
): Promise<SessionPlayer> {
  if (existing?.kind === "registered") {
    const db = getDb();
    if (!db) throw Error("Account saving is unavailable");
    const p = await db.player.update({
      where: { id: existing.id },
      data: { displayName: name, avatarColor: color ?? existing.color },
    });
    return { ...existing, name: p.displayName, color: p.avatarColor };
  }
  const id = existing?.id ?? `g_${randomUUID().replace(/-/g, "")}`;
  const player: SessionPlayer = {
    id,
    name,
    color: color ?? existing?.color ?? avatarColorFor(id),
    kind: existing?.kind ?? "guest",
  };
  const token = await signPlayerToken(
    {
      sub: player.id,
      name: player.name,
      color: player.color,
      kind: player.kind,
    },
    "session",
    authSecret(),
  );
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
  return signPlayerToken(
    {
      sub: p.id,
      name: p.name,
      color: p.color,
      kind: p.kind,
      ...(p.sid ? { sid: p.sid } : {}),
    },
    "realtime",
    authSecret(),
  );
}

export async function writeAccountSession(playerId: string) {
  const db = getDb();
  if (!db) throw Error("Account saving is unavailable");
  const session = await createAccountSession(db, playerId);
  (await cookies()).set(SESSION_COOKIE, `s1_${session.secret}`, {
    httpOnly: true,
    secure: brand.siteUrl.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
}
export async function sessionFingerprint() {
  return hashSecret((await cookies()).get(SESSION_COOKIE)?.value ?? "");
}
export function publicPlayer(p: SessionPlayer) {
  const { sid: _, ...player } = p;
  return player;
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
