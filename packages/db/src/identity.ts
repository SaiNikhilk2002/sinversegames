import type { PrismaClient } from "./generated/prisma/client";
import {
  ACCOUNT_SESSION_MS,
  hashSecret,
  randomSecret,
  usernameSchema,
  USERNAME_RENAME_MS,
} from "@platform/shared";
import { lockPlayer } from "./wallet";

export class AccountError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export async function createAccountSession(db: PrismaClient, playerId: string) {
  const secret = randomSecret();
  const tokenHash = await hashSecret(secret);
  const expiresAt = new Date(Date.now() + ACCOUNT_SESSION_MS);
  await db.$transaction(async (tx) => {
    await lockPlayer(tx, playerId);
    const player = await tx.player.findUniqueOrThrow({
      where: { id: playerId },
    });
    if (
      player.kind !== "REGISTERED" ||
      (player.bannedUntil && player.bannedUntil.getTime() > Date.now())
    )
      throw new AccountError("session_unavailable");
    await tx.accountSession.deleteMany({
      where: { playerId, expiresAt: { lte: new Date() } },
    });
    const older = await tx.accountSession.findMany({
      where: { playerId },
      orderBy: [{ createdAt: "desc" }, { tokenHash: "asc" }],
      skip: 19,
      select: { tokenHash: true },
    });
    if (older.length)
      await tx.accountSession.deleteMany({
        where: { tokenHash: { in: older.map((s) => s.tokenHash) } },
      });
    await tx.accountSession.create({
      data: { tokenHash, playerId, expiresAt },
    });
  });
  return { secret, tokenHash, expiresAt };
}
export async function resolveAccountSession(db: PrismaClient, hash: string) {
  const session = await db.accountSession.findUnique({
    where: { tokenHash: hash },
    include: { player: true },
  });
  if (
    !session ||
    session.expiresAt.getTime() <= Date.now() ||
    session.player.kind !== "REGISTERED" ||
    (session.player.bannedUntil &&
      session.player.bannedUntil.getTime() > Date.now())
  )
    return null;
  return session;
}
export async function linkGoogle(
  db: PrismaClient,
  subject: string,
  actorId: string | null,
  mode: "link" | "signin",
) {
  if (!subject || subject.length > 255)
    throw new AccountError("invalid_identity");
  try {
    return await db.$transaction(async (tx) => {
      if (actorId) await lockPlayer(tx, actorId);
      const identity = await tx.externalIdentity.findUnique({
        where: { provider_subject: { provider: "google", subject } },
        include: { player: true },
      });
      if (identity) {
        if (mode === "link" && identity.playerId !== actorId)
          throw new AccountError("identity_collision");
        if (
          identity.player.bannedUntil &&
          identity.player.bannedUntil.getTime() > Date.now()
        )
          throw new AccountError("suspended");
        return identity.player;
      }
      if (mode === "link" && !actorId)
        throw new AccountError("session_changed");
      let player =
        actorId && mode === "link"
          ? await tx.player.findUnique({ where: { id: actorId } })
          : null;
      if (mode === "link" && !player) throw new AccountError("session_changed");
      if (player?.bannedUntil && player.bannedUntil.getTime() > Date.now())
        throw new AccountError("suspended");
      if (player?.kind === "REGISTERED")
        throw new AccountError("already_linked");
      if (!player)
        player = await tx.player.create({
          data: {
            id: `p_${randomSecret().slice(0, 32)}`,
            displayName: "New adventurer",
            avatarColor: "#8d86df",
            kind: "REGISTERED",
          },
        });
      await tx.externalIdentity.create({
        data: { provider: "google", subject, playerId: player.id },
      });
      await tx.accountSession.deleteMany({ where: { playerId: player.id } });
      return tx.player.update({
        where: { id: player.id },
        data: { kind: "REGISTERED" },
      });
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      throw new AccountError("identity_collision");
    if ((error as { code?: string }).code === "NO_PLAYER")
      throw new AccountError("session_changed");
    throw error;
  }
}
export async function claimUsername(
  db: PrismaClient,
  playerId: string,
  input: string,
  now = new Date(),
) {
  const username = usernameSchema.parse(input);
  try {
    return await db.$transaction(async (tx) => {
      await lockPlayer(tx, playerId);
      const player = await tx.player.findUniqueOrThrow({
        where: { id: playerId },
      });
      if (player.kind !== "REGISTERED")
        throw new AccountError("registration_required");
      if (player.username === username) return player;
      if (
        player.usernameChangedAt &&
        now.getTime() - player.usernameChangedAt.getTime() < USERNAME_RENAME_MS
      )
        throw new AccountError("rename_cooldown");
      return tx.player.update({
        where: { id: playerId },
        data: { username, usernameChangedAt: now },
      });
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      throw new AccountError("username_taken");
    throw error;
  }
}
export async function identityLimit(
  db: PrismaClient,
  bucket: string,
  identity: string,
  limit: number,
  windowMs: number,
) {
  const key = await hashSecret(`${bucket}:${identity}`);
  const now = new Date();
  const reset = new Date(now.getTime() + windowMs);
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "IdentityRateLimit" ("key","count","resetAt") VALUES (${key},1,${reset}) ON CONFLICT ("key") DO UPDATE SET "count"=CASE WHEN "IdentityRateLimit"."resetAt"<=${now} THEN 1 ELSE LEAST("IdentityRateLimit"."count"+1,1000000) END,"resetAt"=CASE WHEN "IdentityRateLimit"."resetAt"<=${now} THEN ${reset} ELSE "IdentityRateLimit"."resetAt" END RETURNING "count"`;
  return rows[0]!.count <= limit;
}
