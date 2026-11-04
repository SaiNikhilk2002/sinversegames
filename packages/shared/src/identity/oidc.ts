import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { randomSecret } from "./profile";

export interface OidcConfig {
  clientId: string;
  clientSecret: string;
  origin: string;
  issuer: string;
  authorization: string;
  token: string;
  jwks: string;
}
export const callbackUrl = (config: OidcConfig) =>
  `${config.origin}/api/auth/google/callback`;
export async function authorizationUrl(
  config: OidcConfig,
  state: string,
  verifier: string,
  nonce: string,
) {
  const challenge = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const encoded = btoa(String.fromCharCode(...challenge))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  const url = new URL(config.authorization);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: callbackUrl(config),
    response_type: "code",
    scope: "openid email",
    state,
    nonce,
    code_challenge: encoded,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function exchangeGoogle(
  config: OidcConfig,
  code: string,
  verifier: string,
  nonce: string,
) {
  const response = await fetch(config.token, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: callbackUrl(config),
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(8000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("provider_response");
  const data = (await response.json()) as { id_token?: unknown };
  if (typeof data.id_token !== "string" || data.id_token.length > 16384)
    throw new Error("provider_response");
  let keys = jwksCache.get(config.jwks);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(config.jwks), {
      timeoutDuration: 5000,
      cooldownDuration: 30000,
    });
    jwksCache.set(config.jwks, keys);
  }
  const issuer =
    config.issuer === "https://accounts.google.com"
      ? ["https://accounts.google.com", "accounts.google.com"]
      : config.issuer;
  const { payload } = await jwtVerify(data.id_token, keys, {
    issuer,
    audience: config.clientId,
    algorithms: ["RS256"],
    maxTokenAge: "10m",
    requiredClaims: ["exp", "iat", "sub", "nonce"],
  });
  if (
    payload.nonce !== nonce ||
    payload.email_verified !== true ||
    typeof payload.sub !== "string" ||
    !payload.sub.length ||
    payload.sub.length > 255 ||
    (payload.azp !== undefined && payload.azp !== config.clientId)
  )
    throw new Error("provider_claims");
  return { provider: "google" as const, subject: payload.sub };
}
export async function signAvatarJob(playerId: string, secret: string) {
  return new SignJWT({ purpose: "avatar-normalize" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(playerId)
    .setIssuer("platform")
    .setAudience("avatar-service")
    .setIssuedAt()
    .setExpirationTime("30s")
    .setJti(randomSecret())
    .sign(new TextEncoder().encode(secret));
}
export async function verifyAvatarJob(token: string, secret: string) {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    issuer: "platform",
    audience: "avatar-service",
    algorithms: ["HS256"],
    maxTokenAge: "30s",
  });
  if (
    payload.purpose !== "avatar-normalize" ||
    typeof payload.sub !== "string" ||
    !payload.jti
  )
    throw Error("invalid_job");
  return { playerId: payload.sub, jti: payload.jti };
}
