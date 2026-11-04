import "server-only";
import { headers } from "next/headers";

/**
 * Best-effort in-memory fixed-window limiter for API routes. On serverless
 * hosting each instance keeps its own counters, which is acceptable for abuse
 * damping; swap in a shared store (e.g. Redis) if stricter limits are needed.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function rateLimit(bucket: string, limit: number, windowMs: number): Promise<boolean> {
  const key = `${bucket}:${await clientIp()}`;
  const now = Date.now();
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 10_000) for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
    return true;
  }
  w.count++;
  return w.count <= limit;
}
