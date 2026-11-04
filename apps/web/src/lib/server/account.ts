import "server-only";
import { NextResponse } from "next/server";
import { getDb, identityLimit } from "@platform/db";
import { getSession, isSameOrigin } from "./session";
import { clientIp } from "./rate-limit";
import type { OidcConfig } from "@platform/shared/identity";

export const accountJson = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
export function localIdentityFixture() {
  try {
    const origin = new URL(process.env.AUTH_ORIGIN ?? "");
    const db = new URL(process.env.DATABASE_URL ?? "");
    return (
      process.env.IDENTITY_TEST_MODE === "1" &&
      ["localhost", "127.0.0.1"].includes(origin.hostname) &&
      origin.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(db.hostname) &&
      db.pathname.endsWith("_test")
    );
  } catch {
    return false;
  }
}
export function googleConfig(): OidcConfig | null {
  const origin = process.env.AUTH_ORIGIN;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!origin || !clientId || !clientSecret) return null;
  try {
    const u = new URL(origin);
    if (
      u.origin !== origin ||
      u.username ||
      u.password ||
      (!["localhost", "127.0.0.1"].includes(u.hostname) &&
        u.protocol !== "https:")
    )
      return null;
  } catch {
    return null;
  }
  if (localIdentityFixture())
    return {
      origin,
      clientId,
      clientSecret,
      issuer: "http://127.0.0.1:4400",
      authorization: "http://127.0.0.1:4400/authorize",
      token: "http://127.0.0.1:4400/token",
      jwks: "http://127.0.0.1:4400/jwks",
    };
  return {
    origin,
    clientId,
    clientSecret,
    issuer: "https://accounts.google.com",
    authorization: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    jwks: "https://www.googleapis.com/oauth2/v3/certs",
  };
}
export async function accountContext(
  bucket: string,
  mutation = true,
  registered = true,
) {
  if (mutation && !(await isSameOrigin()))
    return { error: accountJson({ error: "Forbidden" }, 403) };
  let player;
  try {
    player = await getSession();
  } catch {
    return {
      error: accountJson(
        { error: "Your existing player couldn't be checked. Please retry." },
        503,
      ),
    };
  }
  if (!player)
    return {
      error: accountJson(
        { error: "Choose your player or sign in first." },
        401,
      ),
    };
  if (registered && player.kind !== "registered")
    return {
      error: accountJson(
        { error: "Link Google before managing this account." },
        403,
      ),
    };
  const db = getDb();
  if (!db)
    return {
      error: accountJson({ error: "Account saving is unavailable." }, 503),
    };
  try {
    if (
      !(await identityLimit(
        db,
        bucket,
        `${player.id}:${await clientIp()}`,
        20,
        60000,
      ))
    )
      return {
        error: accountJson(
          { error: "Please wait a minute before trying again." },
          429,
        ),
      };
  } catch {
    return {
      error: accountJson({ error: "Account service is unavailable." }, 503),
    };
  }
  return { player, db };
}
export async function boundedBody(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        throw Error("body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function smallJson(request: Request) {
  try {
    return JSON.parse(
      new TextDecoder().decode(await boundedBody(request, 4096)),
    ) as unknown;
  } catch {
    return null;
  }
}
