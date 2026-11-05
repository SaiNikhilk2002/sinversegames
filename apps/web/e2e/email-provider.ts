/**
 * Local stand-in for Resend's send-email API. The app's real sending code runs
 * against it, but nothing leaves this machine, so this proves the request and the
 * email contents, not real delivery. Addresses starting "provider-down" get a 500.
 */
import { createServer, type Server } from "node:http";

export interface SentEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function startEmailProvider() {
  const sent: SentEmail[] = [];
  const server: Server = createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    res.setHeader("content-type", "application/json");
    if (
      req.method !== "POST" ||
      req.url !== "/emails" ||
      req.headers.authorization !== "Bearer local-email-fixture"
    ) {
      res.writeHead(401);
      res.end(JSON.stringify({ message: "rejected" }));
      return;
    }
    const message = JSON.parse(raw) as SentEmail;
    if (message.to.startsWith("provider-down")) {
      res.writeHead(500);
      res.end(JSON.stringify({ message: "fixture outage" }));
      return;
    }
    sent.push(message);
    res.end(JSON.stringify({ id: `fixture-${sent.length}` }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(4401, "127.0.0.1", resolve);
  });
  return {
    sent,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
