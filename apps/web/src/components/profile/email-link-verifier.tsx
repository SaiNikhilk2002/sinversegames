"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MailCheck, MailWarning } from "lucide-react";
import { readJson } from "@/lib/read-json";
import { Button, Card, Spinner } from "../ui/primitives";

type State =
  | { name: "checking" }
  | { name: "confirm"; email: string; leavingGuest: boolean }
  | { name: "done" }
  | { name: "error"; message: string };

interface VerifyReply {
  error?: string;
  next?: string;
  needsConfirm?: boolean;
  email?: string;
  leavingGuest?: boolean;
}

export function EmailLinkVerifier() {
  const [state, setState] = useState<State>({ name: "checking" });
  const token = useRef<string | null>(null);
  const started = useRef(false);

  const verify = async (confirm: boolean) => {
    setState({ name: "checking" });
    try {
      const response = await fetch("/api/auth/email/verify", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "link", token: token.current, confirm }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await readJson<VerifyReply>(response);
      if (response.ok && data?.next) {
        setState({ name: "done" });
        location.assign(data.next);
      } else if (response.ok && data?.needsConfirm) {
        setState({
          name: "confirm",
          email: data.email ?? "this address",
          leavingGuest: !!data.leavingGuest,
        });
      } else {
        setState({
          name: "error",
          message: data?.error ?? "We couldn't verify this link. Please request a new one.",
        });
      }
    } catch {
      setState({
        name: "error",
        message: "We couldn't reach the server. Check your connection and open the link again.",
      });
    }
  };

  useEffect(() => {
    const readLink = () => {
      const next = new URLSearchParams(location.hash.slice(1)).get("token");
      // Removed straight away so it can't linger in history or be copied from the address bar.
      history.replaceState(null, "", location.pathname);
      if (next && next === token.current) return;
      token.current = next;
      if (next) void verify(false);
      else setState({ name: "error", message: "This sign-in link isn't valid. Request a new one." });
    };
    if (!started.current) {
      started.current = true;
      readLink();
    }
    // Opening another link in a tab already on this page only changes the fragment.
    window.addEventListener("hashchange", readLink);
    return () => window.removeEventListener("hashchange", readLink);
  }, []);

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6" data-testid="email-link-verifier">
      <Card className="p-6 sm:p-8">
        {state.name === "checking" && <Spinner label="Verifying your link" />}
        {state.name === "done" && (
          <p role="status" className="flex items-center gap-2 font-semibold">
            <MailCheck size={20} /> Email verified. Taking you to your player…
          </p>
        )}
        {state.name === "confirm" && (
          <>
            <h1 className="font-display text-2xl font-bold">Finish signing in</h1>
            <p className="my-4 text-sm text-ink-muted">
              You're signing in as <strong className="text-ink">{state.email}</strong> in a
              different browser from the one that asked for this link. Only continue if you
              asked for it.
            </p>
            {state.leavingGuest && (
              <p className="mb-4 text-sm text-ink-muted">
                The guest player in this browser stays separate and won't be merged. You won't
                be able to reach it here after signing in.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void verify(true)}>Continue signing in</Button>
              <Link
                href="/"
                className="inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold text-ink-muted"
              >
                Cancel
              </Link>
            </div>
          </>
        )}
        {state.name === "error" && (
          <>
            <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
              <MailWarning size={22} /> Link not available
            </h1>
            <p role="alert" className="my-4 text-sm text-ink-muted">
              {state.message}
            </p>
            <Link href="/account" className="font-semibold text-brand-400">
              Back to sign in
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}
