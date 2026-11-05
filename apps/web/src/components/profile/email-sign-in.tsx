"use client";
import { useEffect, useRef, useState } from "react";
import { KeyRound, Link2, Mail } from "lucide-react";
import { emailSchema, otpSchema, type EmailMethod } from "@platform/shared";
import { readJson } from "@/lib/read-json";
import { Button, Input } from "../ui/primitives";

async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await readJson<{
    error?: string;
    retryAfter?: number;
    resendAfter?: number;
    locked?: boolean;
    next?: string;
  }>(response);
  return { ok: response.ok, data: data ?? { error: "That didn't work. Please try again." } };
}

export function EmailSignIn({ enabled, guest }: { enabled: boolean; guest: boolean }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [method, setMethod] = useState<EmailMethod | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  useEffect(() => {
    if (method) heading.current?.focus();
  }, [method]);

  const send = async (next: EmailMethod, address = sentTo || email) => {
    const parsed = emailSchema.safeParse(address);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { ok, data } = await post("/api/auth/email/start", {
        email: parsed.data,
        method: next,
      });
      if (!ok) {
        setError(data.error ?? "We couldn't send that email. Please try again.");
        if (data.retryAfter) setWait(data.retryAfter);
        return;
      }
      setSentTo(parsed.data);
      setMethod(next);
      setCode("");
      setWait(data.resendAfter ?? 60);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const parsed = otpSchema.safeParse(code.trim());
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { ok, data } = await post("/api/auth/email/verify", {
        kind: "code",
        email: sentTo,
        code: parsed.data,
      });
      if (ok && data.next) {
        location.assign(data.next);
        return;
      }
      setError(data.error ?? "That code didn't work. Please try again.");
      if (data.locked) setCode("");
      setBusy(false);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
      setBusy(false);
    }
  };

  if (!enabled)
    return (
      <p className="text-sm text-ink-muted" data-testid="email-unavailable">
        Email sign-in needs owner configuration and is currently unavailable.
      </p>
    );

  const alert = error && (
    <p role="alert" className="mt-3 text-sm text-danger">
      {error}
    </p>
  );
  if (!method)
    return (
      <form
        data-testid="email-sign-in"
        onSubmit={(event) => {
          event.preventDefault();
          void send("otp", email);
        }}
        noValidate
      >
        <label htmlFor="sign-in-email" className="text-sm font-semibold">
          Email address
        </label>
        <Input
          id="sign-in-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          maxLength={128}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-2"
          required
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button type="submit" disabled={busy || wait > 0} className="w-full whitespace-normal">
            <KeyRound size={17} />
            {busy ? "Sending…" : "Email me a code"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || wait > 0}
            className="w-full whitespace-normal"
            onClick={() => void send("link", email)}
          >
            <Link2 size={17} />
            Email me a link
          </Button>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          No password needed. New here? This creates your account.
          {guest ? " Your guest progress moves with you if this email is new." : ""}
        </p>
        {wait > 0 && (
          <p className="mt-2 text-xs text-ink-muted">You can try again in {wait}s.</p>
        )}
        {alert}
      </form>
    );

  const other: EmailMethod = method === "otp" ? "link" : "otp";
  return (
    <div data-testid="email-sent">
      <h3 ref={heading} tabIndex={-1} className="flex items-center gap-2 font-display text-lg font-bold">
        <Mail size={18} />
        Check your email
      </h3>
      <p role="status" className="mt-2 break-words text-sm text-ink-muted">
        {method === "otp"
          ? `If this address can receive mail, a 6-digit code is on its way to ${sentTo}. It expires in 10 minutes.`
          : `If this address can receive mail, a sign-in link is on its way to ${sentTo}. It expires in 15 minutes. Open it in this browser to keep your guest progress.`}
      </p>
      {method === "otp" && (
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void verify();
          }}
          noValidate
        >
          <label htmlFor="sign-in-code" className="text-sm font-semibold">
            6-digit code
          </label>
          <Input
            id="sign-in-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            className="mt-2 tracking-[0.4em]"
          />
          <Button type="submit" disabled={busy} className="mt-3 w-full">
            {busy ? "Checking…" : "Verify and continue"}
          </Button>
        </form>
      )}
      {alert}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={busy || wait > 0}
          onClick={() => void send(method)}
        >
          {wait > 0 ? `Resend in ${wait}s` : `Resend ${method === "otp" ? "code" : "link"}`}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void send(other)}>
          {other === "otp" ? "Use a code instead" : "Use a link instead"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setMethod(null);
            setSentTo("");
            setCode("");
            setError("");
          }}
        >
          Use a different email
        </Button>
      </div>
    </div>
  );
}
