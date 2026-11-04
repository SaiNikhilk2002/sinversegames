/** Local OIDC fixture only. The app still validates real signed JWTs/PKCE/nonce. */
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
const { generateKeyPair, exportJWK, SignJWT } = createRequire(
  new URL("../../../packages/shared/package.json", import.meta.url),
)("jose");
export async function startIdentityProvider() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const { privateKey: wrongKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "local-identity-fixture";
  jwk.alg = "RS256";
  jwk.use = "sig";
  const pending = new Map<
    string,
    { nonce: string; challenge: string; state: string; redirect: string }
  >();
  const codes = new Map<
    string,
    {
      nonce: string;
      challenge: string;
      redirect: string;
      subject: string;
      variant: string;
    }
  >();
  const server: Server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url!, "http://127.0.0.1:4400");
      if (url.pathname === "/jwks") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ keys: [jwk] }));
        return;
      }
      if (url.pathname === "/authorize") {
        if (
          url.searchParams.get("redirect_uri") !==
            "http://localhost:3200/api/auth/google/callback" ||
          url.searchParams.get("code_challenge_method") !== "S256"
        )
          throw Error("Bad fixture redirect/PKCE");
        const id = randomUUID();
        pending.set(id, {
          nonce: url.searchParams.get("nonce")!,
          challenge: url.searchParams.get("code_challenge")!,
          state: url.searchParams.get("state")!,
          redirect: url.searchParams.get("redirect_uri")!,
        });
        res.setHeader("content-type", "text/html");
        res.end(
          `<html><title>Local OIDC fixture</title><h1>Local test identity provider</h1><p>This is a deterministic fixture, not Google.</p><form action="/approve" method="get"><input type="hidden" name="attempt" value="${id}">${["one", "two", "unverified", "badnonce", "expired", "wrongaudience", "wrongissuer", "badsignature", "cancel"].map((value) => `<button name="user" value="${value}">Fixture ${value}</button>`).join("")}</form></html>`,
        );
        return;
      }
      if (url.pathname === "/approve") {
        const attempt = pending.get(url.searchParams.get("attempt")!);
        if (!attempt) throw Error("Missing fixture attempt");
        pending.delete(url.searchParams.get("attempt")!);
        const variant = url.searchParams.get("user")!;
        const redirect = new URL(attempt.redirect);
        redirect.searchParams.set("state", attempt.state);
        if (variant === "cancel")
          redirect.searchParams.set("error", "access_denied");
        else {
          const code = randomUUID();
          codes.set(code, {
            ...attempt,
            subject: variant === "two" ? "fixture-two" : "fixture-one",
            variant,
          });
          redirect.searchParams.set("code", code);
        }
        res.writeHead(302, { location: redirect.toString() });
        res.end();
        return;
      }
      if (url.pathname === "/token" && req.method === "POST") {
        let body = "";
        for await (const part of req) body += part;
        const params = new URLSearchParams(body);
        const code = codes.get(params.get("code")!);
        codes.delete(params.get("code")!);
        if (
          !code ||
          createHash("sha256")
            .update(params.get("code_verifier") ?? "")
            .digest("base64url") !== code.challenge ||
          params.get("redirect_uri") !== code.redirect ||
          params.get("client_id") !== "local-fixture-client" ||
          params.get("client_secret") !== "local-fixture-secret"
        )
          throw Error("Invalid fixture exchange");
        const id_token = await new SignJWT({
          nonce: code.variant === "badnonce" ? "wrong" : code.nonce,
          email_verified: code.variant !== "unverified",
          email: "never-used-for-linking@example.invalid",
        })
          .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
          .setIssuer(
            code.variant === "wrongissuer"
              ? "https://wrong.example"
              : "http://127.0.0.1:4400",
          )
          .setSubject(code.subject)
          .setAudience(
            code.variant === "wrongaudience"
              ? "other-client"
              : "local-fixture-client",
          )
          .setIssuedAt()
          .setExpirationTime(
            code.variant === "expired"
              ? Math.floor(Date.now() / 1000) - 20
              : "5m",
          )
          .sign(code.variant === "badsignature" ? wrongKey : privateKey);
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            id_token,
            access_token: "unused-local-fixture",
            token_type: "Bearer",
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "fixture_request_rejected" }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(4400, "127.0.0.1", resolve);
  });
  return () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
}
