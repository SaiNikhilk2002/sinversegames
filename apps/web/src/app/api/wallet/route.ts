import { NextResponse } from "next/server";
import { z } from "zod";
import { COSMETIC_CATEGORIES } from "@platform/shared";
import { activeBan, equipCosmetic, getDb, getWallet, purchaseCosmetic, WalletError } from "@platform/db";
import { jsonRoute } from "@/lib/server/api-route";
import { getSession, isSameOrigin } from "@/lib/server/session";
import { rateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

async function handleGET(request: Request) {
  const player = await getSession();
  if (!player) return json({ error: "Choose a name to view your wallet." }, 401);
  if (!(await rateLimit("wallet-read", 90, 60_000))) return json({ error: "Please try again shortly." }, 429);
  const db = getDb();
  if (!db) return json({ error: "Your wallet is unavailable. You can still play." }, 503);
  const parsed = z.string().uuid().optional().safeParse(new URL(request.url).searchParams.get("cursor") ?? undefined);
  if (!parsed.success) return json({ error: "Invalid history page." }, 400);
  try {
    if (parsed.data && !(await db.rewardLedgerEntry.findFirst({ where: { id: parsed.data, playerId: player.id }, select: { id: true } }))) return json({ error: "Invalid history page." }, 400);
    return json(await getWallet(db, player.id, parsed.data));
  } catch {
    return json({ error: "Your wallet couldn't be loaded. Please try again." }, 503);
  }
}

const intent = z.discriminatedUnion("action", [
  z.object({ action: z.literal("purchase"), itemId: z.string().min(1).max(64) }).strict(),
  z.object({ action: z.literal("equip"), category: z.enum(COSMETIC_CATEGORIES), itemId: z.string().min(1).max(64).nullable() }).strict(),
]);

async function handlePOST(request: Request) {
  if (!(await isSameOrigin())) return json({ error: "Forbidden" }, 403);
  const player = await getSession();
  if (!player) return json({ error: "Choose a name before using the store." }, 401);
  if (!(await rateLimit("wallet-write", 30, 60_000))) return json({ error: "Too many requests. Try again in a minute." }, 429);
  // Bound actual bytes, including chunked requests without Content-Length.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 1024) { await reader.cancel(); return json({ error: "Request too large." }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const parsed = intent.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    if (!parsed.success) return json({ error: "Invalid store request." }, 400);
    const db = getDb();
    if (!db) return json({ error: "The store is unavailable. No coins were spent." }, 503);
    if (await activeBan(db, player.id)) return json({ error: "Purchases and equipment changes are unavailable while suspended." }, 403);
    if (parsed.data.action === "purchase") return json(await purchaseCosmetic(db, player.id, parsed.data.itemId));
    await equipCosmetic(db, player.id, parsed.data.category, parsed.data.itemId);
    return json({ equipped: true });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid store request." }, 400);
    if (error instanceof WalletError) return json({ error: error.message, code: error.code }, error.code === "INSUFFICIENT_FUNDS" ? 409 : 400);
    return json({ error: "The store couldn't confirm this request. Refresh your wallet before retrying." }, 503);
  } finally { reader?.releaseLock(); }
}

export const GET = jsonRoute("wallet GET", handleGET);
export const POST = jsonRoute("wallet POST", handlePOST);
