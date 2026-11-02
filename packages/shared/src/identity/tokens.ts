import { SignJWT, jwtVerify, errors } from "jose";

/**
 * Two token types, both HS256 JWTs signed with AUTH_SECRET (shared between the
 * web app and the realtime server):
 *
 *  - session: long-lived, stored only in an httpOnly cookie by the web app.
 *  - realtime: short-lived, handed to the browser to authenticate the socket
 *    handshake. Its `sub` is the only player identity the realtime server
 *    trusts, so clients cannot impersonate other players by editing ids.
 */
export type TokenKind = "session" | "realtime";

export interface PlayerClaims {
  /** Stable player id (guest or registered). */
  sub: string;
  name: string;
  color: string;
  kind: "guest" | "registered";
}

const ISSUER = "platform";
export const SESSION_TTL_SECONDS = 180 * 24 * 60 * 60;
export const REALTIME_TTL_SECONDS = 15 * 60;

const encoder = new TextEncoder();
const keyCache = new Map<string, Uint8Array>();

function key(secret: string | undefined): Uint8Array {
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set and at least 32 characters long");
  }
  let k = keyCache.get(secret);
  if (!k) {
    k = encoder.encode(secret);
    keyCache.set(secret, k);
  }
  return k;
}

export async function signPlayerToken(
  claims: PlayerClaims,
  kind: TokenKind,
  secret: string | undefined,
  ttlSeconds: number = kind === "session" ? SESSION_TTL_SECONDS : REALTIME_TTL_SECONDS,
): Promise<string> {
  return new SignJWT({ name: claims.name, color: claims.color, kind: claims.kind, typ: kind })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(kind)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(key(secret));
}

export class InvalidTokenError extends Error {
  constructor(public readonly reason: "expired" | "invalid") {
    super(`Token ${reason}`);
  }
}

export async function verifyPlayerToken(
  token: string,
  kind: TokenKind,
  secret: string | undefined,
): Promise<PlayerClaims> {
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      issuer: ISSUER,
      audience: kind,
      algorithms: ["HS256"],
    });
    if (
      payload.typ !== kind ||
      typeof payload.sub !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.color !== "string"
    ) {
      throw new InvalidTokenError("invalid");
    }
    return {
      sub: payload.sub,
      name: payload.name,
      color: payload.color,
      kind: payload.kind === "registered" ? "registered" : "guest",
    };
  } catch (err) {
    if (err instanceof InvalidTokenError) throw err;
    if (err instanceof errors.JWTExpired) throw new InvalidTokenError("expired");
    throw new InvalidTokenError("invalid");
  }
}

// ---------------------------------------------------------------------------
// Single-player run tokens
// ---------------------------------------------------------------------------

/**
 * Issued when a single-player game starts. It binds the run to a player, game,
 * seed and config, so the score can only be computed by replaying a move log
 * against exactly that deal. `jti` doubles as the stored match id, which makes
 * each run recordable once.
 */
export interface RunClaims {
  sub: string;
  gameId: string;
  seed: number;
  config: Record<string, unknown>;
  jti: string;
  /** Issue time, epoch ms. */
  issuedAt: number;
}

export const RUN_TTL_SECONDS = 6 * 60 * 60;

export async function signRunToken(claims: Omit<RunClaims, "issuedAt">, secret: string | undefined): Promise<string> {
  return new SignJWT({ gid: claims.gameId, seed: claims.seed, cfg: claims.config, typ: "run" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setJti(claims.jti)
    .setIssuer(ISSUER)
    .setAudience("run")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + RUN_TTL_SECONDS)
    .sign(key(secret));
}

export async function verifyRunToken(token: string, secret: string | undefined): Promise<RunClaims> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { issuer: ISSUER, audience: "run", algorithms: ["HS256"] });
    if (
      payload.typ !== "run" ||
      typeof payload.sub !== "string" ||
      typeof payload.gid !== "string" ||
      typeof payload.seed !== "number" ||
      typeof payload.jti !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.cfg !== "object" ||
      payload.cfg === null
    ) {
      throw new InvalidTokenError("invalid");
    }
    return {
      sub: payload.sub,
      gameId: payload.gid,
      seed: payload.seed,
      config: payload.cfg as Record<string, unknown>,
      jti: payload.jti,
      issuedAt: payload.iat * 1000,
    };
  } catch (err) {
    if (err instanceof InvalidTokenError) throw err;
    if (err instanceof errors.JWTExpired) throw new InvalidTokenError("expired");
    throw new InvalidTokenError("invalid");
  }
}
