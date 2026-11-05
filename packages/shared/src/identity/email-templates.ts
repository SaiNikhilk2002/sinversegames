import { brand } from "../brand";

export interface EmailMessage {
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Table layout and inline styles: the formats mail clients render reliably. */
function layout({
  preheader,
  heading,
  intro,
  body = "",
  footer,
}: {
  preheader: string;
  heading: string;
  intro: string;
  body?: string;
  footer: string;
}) {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#f4f1fb;font-family:Arial,Helvetica,sans-serif;color:#211b46">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden">
<tr><td style="background:#211b46;padding:22px 28px;color:#f6efff;font-size:20px;font-weight:bold">${escapeHtml(brand.name)}</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#211b46">${escapeHtml(heading)}</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#463f6b">${escapeHtml(intro)}</p>
${body}
<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6d678c">${escapeHtml(footer)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

const button = (url: string, label: string) =>
  `<a href="${escapeHtml(url)}" style="display:inline-block;background:#ff4f8b;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;padding:14px 26px;border-radius:12px">${escapeHtml(label)}</a>`;

const IGNORE = "If you didn't ask for this, you can ignore this email. Nobody can sign in without it.";

/** The code never appears in the subject or preheader, so it stays out of notification previews. */
export function otpEmail(code: string, minutes: number): EmailMessage {
  return {
    subject: `Your ${brand.name} sign-in code`,
    html: layout({
      preheader: `Your sign-in code expires in ${minutes} minutes.`,
      heading: "Your sign-in code",
      intro: `Enter this code on ${brand.name} to continue. It expires in ${minutes} minutes and works once.`,
      body: `<p style="margin:0;padding:18px;background:#f4f1fb;border-radius:12px;text-align:center;font-size:34px;font-weight:bold;letter-spacing:8px;color:#211b46">${escapeHtml(code)}</p>`,
      footer: `${IGNORE} We'll never ask you for this code.`,
    }),
    text: `Your ${brand.name} sign-in code is ${code}\n\nIt expires in ${minutes} minutes and works once.\n\n${IGNORE} We'll never ask you for this code.`,
  };
}

export function verificationLinkEmail(url: string, minutes: number): EmailMessage {
  return {
    subject: `Your ${brand.name} sign-in link`,
    html: layout({
      preheader: `Your sign-in link expires in ${minutes} minutes.`,
      heading: "Confirm it's you",
      intro: `Use this button to verify your email and continue on ${brand.name}. It expires in ${minutes} minutes and works once.`,
      body: `<p style="margin:0 0 16px">${button(url, "Verify and continue")}</p><p style="margin:0;font-size:13px;line-height:1.5;color:#6d678c;word-break:break-all">Or paste this link into your browser:<br>${escapeHtml(url)}</p>`,
      footer: IGNORE,
    }),
    text: `Verify your email and continue on ${brand.name}:\n\n${url}\n\nThis link expires in ${minutes} minutes and works once.\n\n${IGNORE}`,
  };
}

export function welcomeEmail(url: string): EmailMessage {
  return {
    subject: `Welcome to ${brand.name}`,
    html: layout({
      preheader: "Your player is saved and ready on any device.",
      heading: "Your player is saved",
      intro: "Your wallet, badges and game progress now follow you. Sign in with this email on any device to pick up where you left off.",
      body: `<p style="margin:0">${button(url, "Start playing")}</p>`,
      footer: `You're getting this because this address was just verified on ${brand.name}.`,
    }),
    text: `Your player is saved.\n\nYour wallet, badges and game progress now follow you. Sign in with this email on any device to pick up where you left off.\n\nStart playing: ${url}\n\nYou're getting this because this address was just verified on ${brand.name}.`,
  };
}

export type SecurityNotice = "new_sign_in" | "other_sessions_signed_out";
const NOTICE: Record<SecurityNotice, { subject: string; heading: string; intro: string }> = {
  new_sign_in: {
    subject: `New sign-in to your ${brand.name} player`,
    heading: "New sign-in",
    intro: "A new browser just signed in to your player using this email address.",
  },
  other_sessions_signed_out: {
    subject: `Other browsers were signed out of ${brand.name}`,
    heading: "Other browsers signed out",
    intro: "All other browsers were just signed out of your player from your account page.",
  },
};

export function securityEmail(kind: SecurityNotice, accountUrl: string): EmailMessage {
  const notice = NOTICE[kind];
  const footer = "If this wasn't you, open your account page, sign out other browsers, and secure this email inbox.";
  return {
    subject: notice.subject,
    html: layout({
      preheader: notice.intro,
      heading: notice.heading,
      intro: notice.intro,
      body: `<p style="margin:0">${button(accountUrl, "Review my account")}</p>`,
      footer,
    }),
    text: `${notice.intro}\n\nReview your account: ${accountUrl}\n\n${footer}`,
  };
}
