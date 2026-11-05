import "server-only";
import type { EmailMessage } from "@platform/shared";

const RESEND_URL = "https://api.resend.com/emails";
const isLoopback = (host: string) => ["localhost", "127.0.0.1"].includes(host);

export interface EmailConfig {
  origin: string;
  apiKey: string;
  from: string;
  apiUrl: string;
}

/**
 * Null unless email can really be sent, so the interface can say so honestly.
 * EMAIL_API_URL can only name a loopback address, for a local stand-in server.
 * A deployed Worker therefore can't be pointed at a third-party relay by mistake.
 */
export function emailConfig(): EmailConfig | null {
  const origin = process.env.AUTH_ORIGIN;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const secret = process.env.AUTH_SECRET;
  if (!origin || !apiKey || !from?.includes("@") || !secret || secret.length < 32)
    return null;
  try {
    const u = new URL(origin);
    if (
      u.origin !== origin ||
      u.username ||
      u.password ||
      (!isLoopback(u.hostname) && u.protocol !== "https:")
    )
      return null;
    const override = process.env.EMAIL_API_URL;
    if (override && !isLoopback(new URL(override).hostname)) return null;
    return { origin, apiKey, from, apiUrl: override || RESEND_URL };
  } catch {
    return null;
  }
}

/** Throws on failure. Errors carry a status only: never the address, content or key. */
export async function sendEmail(
  config: EmailConfig,
  to: string,
  message: EmailMessage,
) {
  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: config.from, to, ...message }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw Error(`email_provider_${response.status}`);
}
