"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { banPlayer, getDb, resolveReport, unbanPlayer } from "@platform/db";
import { endAdminSession, isAdmin, realtimeAdmin, startAdminSession, tokenMatches } from "@/lib/server/admin";
import { rateLimit } from "@/lib/server/rate-limit";

export interface LoginState {
  error: string | null;
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (!(await rateLimit("admin-login", 5, 15 * 60_000))) return { error: "Too many attempts. Try again later." };
  const token = String(form.get("token") ?? "");
  if (!tokenMatches(token)) return { error: "Invalid admin token" };
  await startAdminSession();
  revalidatePath("/admin");
  return { error: null };
}

export async function logout() {
  await endAdminSession();
  revalidatePath("/admin");
}

/** Every action re-checks authorization; server actions are public endpoints. */
async function guard() {
  if (!(await isAdmin())) throw new Error("Unauthorized");
}

const id = z.string().min(1).max(64);

export async function moderateReport(form: FormData) {
  await guard();
  const db = getDb();
  if (!db) return;
  const reportId = z.string().uuid().parse(form.get("reportId"));
  const action = z.enum(["resolve", "dismiss"]).parse(form.get("action"));
  await resolveReport(db, reportId, action === "resolve" ? "RESOLVED" : "DISMISSED", String(form.get("note") ?? "").slice(0, 500) || undefined);
  revalidatePath("/admin");
}

export async function banAction(form: FormData) {
  await guard();
  const db = getDb();
  if (!db) return;
  const playerId = id.parse(form.get("playerId"));
  const hours = z.coerce.number().int().min(1).max(24 * 365).parse(form.get("hours"));
  await banPlayer(db, playerId, hours, String(form.get("reason") ?? "Terms violation").slice(0, 500), "admin");
  // Disconnect them from any live game right away.
  await realtimeAdmin(`/admin/players/${encodeURIComponent(playerId)}/kick`, "POST");
  revalidatePath("/admin");
}

export async function unbanAction(form: FormData) {
  await guard();
  const db = getDb();
  if (!db) return;
  await unbanPlayer(db, id.parse(form.get("playerId")), "admin");
  revalidatePath("/admin");
}

export async function closeRoomAction(form: FormData) {
  await guard();
  const code = z.string().regex(/^[A-Z0-9]{6}$/).parse(form.get("code"));
  await realtimeAdmin(`/admin/rooms/${code}/close`, "POST");
  revalidatePath("/admin");
}
