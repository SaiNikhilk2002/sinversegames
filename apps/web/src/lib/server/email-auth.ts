import "server-only";
import { cookies } from "next/headers";
import {
  AccountError,
  getDb,
  identityLimit,
  linkEmail,
  upsertPlayer,
} from "@platform/db";
import {
  EMAIL_ATTEMPT_MODE,
  EMAIL_LINK_TTL_MS,
  EMAIL_OTP_MAX_ATTEMPTS,
  EMAIL_OTP_TTL_MS,
  EMAIL_RESEND_COOLDOWN_SECONDS,
  generateOtp,
  hashSecret,
  maskEmail,
  otpEmail,
  otpMac,
  randomSecret,
  securityEmail,
  verificationLinkEmail,
  verifyOtpMac,
  welcomeEmail,
  type EmailMethod,
} from "@platform/shared";
import { accountJson } from "./account";
import { emailConfig, sendEmail, type EmailConfig } from "./email";
import { clientIp } from "./rate-limit";
import { getSession, writeAccountSession } from "./session";

const COOKIE = "sg_email_auth";
const COOKIE_PATH = "/api/auth/email";
const COOKIE_SECONDS = 30 * 60;
const HOUR = 60 * 60 * 1000;
export const INVALID_CODE = "That code is invalid or has expired. Check it, or request a new one.";
export const UNAVAILABLE =
  "Email sign-in isn't available right now. Guest play still works.";

type Db = NonNullable<ReturnType<typeof getDb>>;

const secureCookie = (origin: string) => origin.startsWith("https:");
const browserSecret = async () => {
  const value = (await cookies()).get(COOKIE)?.value;
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
};
const clearBrowserCookie = async (config: EmailConfig) =>
  (await cookies()).set(COOKIE, "", {
    httpOnly: true,
    secure: secureCookie(config.origin),
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: 0,
  });

/** Failure of a courtesy email must never block sign-in or reveal anything. */
const notify = (config: EmailConfig, to: string, build: () => Parameters<typeof sendEmail>[2]) =>
  sendEmail(config, to, build()).catch((error: Error) =>
    console.warn("email_notification_failed", { reason: error.message.slice(0, 40) }),
  );
export const notifyOtherSessionsSignedOut = (to: string) => {
  const config = emailConfig();
  return config
    ? notify(config, to, () =>
        securityEmail("other_sessions_signed_out", `${config.origin}/account`),
      )
    : Promise.resolve();
};

export function emailContext() {
  const config = emailConfig();
  const db = getDb();
  return config && db ? { config, db } : null;
}

/**
 * The reply is the same whether or not the address has an account, and every
 * limit below is applied the same way, so this route can't be used to find out
 * who is registered.
 */
export async function startEmailAttempt(
  { config, db }: { config: EmailConfig; db: Db },
  email: string,
  method: EmailMethod,
) {
  const ip = await clientIp();
  if (!(await identityLimit(db, "email-start-ip", ip, 30, HOUR)))
    return accountJson({ error: "Too many requests. Please try again later." }, 429);
  // Before the per-address limits: a refused request sends nothing, so it shouldn't use them up.
  const player = await getSession();
  if (player?.kind === "registered")
    return accountJson({ error: "You're already signed in." }, 409);
  if (
    !(await identityLimit(
      db,
      `email-resend-${method}`,
      email,
      1,
      EMAIL_RESEND_COOLDOWN_SECONDS * 1000,
    ))
  )
    return accountJson(
      {
        error: "Please wait a minute before asking for another email.",
        retryAfter: EMAIL_RESEND_COOLDOWN_SECONDS,
      },
      429,
    );
  if (!(await identityLimit(db, "email-start-address", email, 6, HOUR)))
    return accountJson(
      { error: "Too many emails were requested for this address. Please try again later." },
      429,
    );

  if (player) await upsertPlayer(db, player);

  const ttl = method === "otp" ? EMAIL_OTP_TTL_MS : EMAIL_LINK_TTL_MS;
  const minutes = ttl / 60_000;
  const state = randomSecret();
  const stateHash = await hashSecret(state);
  const browser = (await browserSecret()) ?? randomSecret();
  const browserHash = await hashSecret(browser);
  const mode = EMAIL_ATTEMPT_MODE[method];
  const code = method === "otp" ? generateOtp() : null;
  const secret = process.env.AUTH_SECRET!;

  await db.oAuthAttempt.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  // Asking again replaces this browser's earlier request. Requests from other
  // browsers are left alone, so a stranger can't cancel someone's sign-in.
  await db.oAuthAttempt.updateMany({
    where: { browserHash, verifier: email, mode, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await db.oAuthAttempt.create({
    data: {
      stateHash,
      browserHash,
      actorId: player?.id ?? null,
      actorSessionHash: null,
      mode,
      verifier: email,
      nonce: code ? await otpMac(secret, stateHash, code) : "",
      expiresAt: new Date(Date.now() + ttl),
    },
  });
  (await cookies()).set(COOKIE, browser, {
    httpOnly: true,
    secure: secureCookie(config.origin),
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: COOKIE_SECONDS,
  });
  try {
    await sendEmail(
      config,
      email,
      code
        ? otpEmail(code, minutes)
        // In the fragment, so the token stays out of server logs and referrers.
        : verificationLinkEmail(`${config.origin}/auth/email#token=${state}`, minutes),
    );
  } catch (error) {
    await db.oAuthAttempt.delete({ where: { stateHash } }).catch(() => {});
    console.warn("email_send_failed", { reason: (error as Error).message.slice(0, 40) });
    return accountJson(
      { error: "We couldn't send that email. Please try again in a moment." },
      503,
    );
  }
  return accountJson({
    sent: true,
    method,
    expiresInMinutes: minutes,
    resendAfter: EMAIL_RESEND_COOLDOWN_SECONDS,
  });
}

const ACCOUNT_ERRORS: Record<string, { error: string; status: number }> = {
  suspended: { error: "This account is suspended.", status: 403 },
  already_linked: { error: "This player already has an account. Sign out, then try again.", status: 409 },
  identity_collision: { error: "We couldn't finish signing you in. Please try again.", status: 409 },
  session_unavailable: { error: "Your email was verified, but we couldn't start a session. Please sign in again; your progress is safe.", status: 503 },
};

async function finish(
  { config, db }: { config: EmailConfig; db: Db },
  email: string,
  actorId: string | null,
) {
  try {
    const { player, created } = await linkEmail(db, email, actorId);
    const otherSessions = created
      ? 0
      : await db.accountSession.count({
          where: { playerId: player.id, expiresAt: { gt: new Date() } },
        });
    await writeAccountSession(player.id);
    await clearBrowserCookie(config);
    if (created)
      await notify(config, email, () => welcomeEmail(`${config.origin}/games`));
    else if (otherSessions > 0)
      await notify(config, email, () =>
        securityEmail("new_sign_in", `${config.origin}/account`),
      );
    return accountJson({
      ok: true,
      next: player.onboardingAt ? "/profile" : "/account?auth=email",
    });
  } catch (error) {
    if (error instanceof AccountError) {
      const known = ACCOUNT_ERRORS[error.code];
      console.warn("email_auth_refused", { status: error.code });
      if (known) return accountJson({ error: known.error }, known.status);
    }
    throw error;
  }
}

/** The guest becomes the account only if this browser requested the email and still holds that guest. */
async function linkableActor(actorId: string | null, sameBrowser: boolean) {
  if (!actorId || !sameBrowser) return null;
  const session = await getSession();
  return session?.kind === "guest" && session.id === actorId ? actorId : null;
}

export async function verifyEmailCode(
  context: { config: EmailConfig; db: Db },
  email: string,
  code: string,
) {
  const { db } = context;
  if (!(await identityLimit(db, "email-verify-ip", await clientIp(), 30, 60_000)))
    return accountJson({ error: "Please wait a minute and try again." }, 429);
  const browser = await browserSecret();
  if (!browser) return accountJson({ error: INVALID_CODE }, 400);
  const attempt = await db.oAuthAttempt.findFirst({
    where: {
      browserHash: await hashSecret(browser),
      verifier: email,
      mode: EMAIL_ATTEMPT_MODE.otp,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { expiresAt: "desc" },
  });
  if (!attempt) return accountJson({ error: INVALID_CODE }, 400);
  const withinAttempt = await identityLimit(
    db,
    "email-otp-attempt",
    attempt.stateHash,
    EMAIL_OTP_MAX_ATTEMPTS,
    EMAIL_OTP_TTL_MS,
  );
  // Also capped per address, so requesting new codes can't buy unlimited guesses.
  const withinAddress = await identityLimit(db, "email-otp-address", email, 20, HOUR);
  if (!withinAttempt || !withinAddress) {
    await db.oAuthAttempt.updateMany({
      where: { stateHash: attempt.stateHash, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return accountJson(
      { error: "Too many incorrect attempts. Request a new code.", locked: true },
      429,
    );
  }
  if (!(await verifyOtpMac(process.env.AUTH_SECRET!, attempt.stateHash, code, attempt.nonce)))
    return accountJson({ error: INVALID_CODE }, 400);
  // Conditional on still being unused, so only one of two simultaneous requests can win.
  const consumed = await db.oAuthAttempt.updateMany({
    where: {
      stateHash: attempt.stateHash,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) return accountJson({ error: INVALID_CODE }, 400);
  return finish(context, email, await linkableActor(attempt.actorId, true));
}

const LINK_ERRORS = {
  invalid: "This sign-in link isn't valid. Request a new one.",
  expired: "This sign-in link has expired. Request a new one.",
  used: "This sign-in link has already been used. Request a new one if you still need to sign in.",
};

/**
 * Mail scanners open links, so opening one must not be enough to sign in from an
 * unknown browser: without the cookie from the original request the visitor is
 * asked to confirm first. The same check stops someone from tricking another
 * person into signing in to the wrong account, because the confirmation names it.
 */
export async function verifyEmailLink(
  context: { config: EmailConfig; db: Db },
  token: string,
  confirm: boolean,
) {
  const { db } = context;
  if (!(await identityLimit(db, "email-verify-ip", await clientIp(), 30, 60_000)))
    return accountJson({ error: "Please wait a minute and try again." }, 429);
  const stateHash = await hashSecret(token);
  const attempt = await db.oAuthAttempt.findUnique({ where: { stateHash } });
  const refuse = (code: keyof typeof LINK_ERRORS) =>
    accountJson({ error: LINK_ERRORS[code], code }, 400);
  if (!attempt || attempt.mode !== EMAIL_ATTEMPT_MODE.link) return refuse("invalid");
  if (attempt.consumedAt) return refuse("used");
  if (attempt.expiresAt.getTime() <= Date.now()) return refuse("expired");
  const browser = await browserSecret();
  const sameBrowser = !!browser && (await hashSecret(browser)) === attempt.browserHash;
  if (!sameBrowser && !confirm) {
    const session = await getSession();
    return accountJson({
      needsConfirm: true,
      email: maskEmail(attempt.verifier),
      leavingGuest: session?.kind === "guest",
    });
  }
  const consumed = await db.oAuthAttempt.updateMany({
    where: { stateHash, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) return refuse("used");
  return finish(context, attempt.verifier, await linkableActor(attempt.actorId, sameBrowser));
}
