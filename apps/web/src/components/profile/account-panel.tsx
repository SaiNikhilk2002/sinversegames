"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, Cloud, ImagePlus, ShieldCheck, UserRound } from "lucide-react";
import { usernameSchema } from "@platform/shared";
import { usePlayer, reloadPlayer } from "@/lib/player";
import { Button, Card, Input, Spinner } from "../ui/primitives";
import { NameForm } from "../play/name-gate";
import { CosmeticAvatar } from "./cosmetic-avatar";

import { expectJson } from "@/lib/read-json";
interface Account {
  linked: boolean;
  username: string | null;
  usernameChangedAt: string | null;
  onboardingAt: string | null;
  avatarKey: string | null;
  avatarAvailable: boolean;
  sessions: { current: boolean; createdAt: string; expiresAt: string }[];
}
const messages: Record<string, string> = {
  identity_collision:
    "This Google account already belongs to another player. Neither account was merged or changed. You can sign in to that existing player instead; this guest's progress will remain separate.",
  cancelled: "Google connection was cancelled. Your player is unchanged.",
  invalid_state:
    "This Google attempt expired or belongs to another browser. Start again here.",
  session_changed: "Your player session changed. Start the connection again.",
  provider_failed: "Google couldn't be verified. Try again from this page.",
  invalid_callback: "Google returned an invalid response. Start again.",
  suspended: "This account is suspended.",
  rate_limited: "Please wait a minute and try again.",
  already_linked: "This player already has Google connected. Sign in with its existing Google account to return.",
  session_unavailable: "Google was verified, but a player session couldn't be created. Sign in again with the same Google account; your progress is retained.",
};
async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({ error: "Account service couldn't finish. Please retry." }));
  if (!response.ok)
    throw Error(data.error ?? "Account service couldn't finish. Please retry.");
  return data;
}
function GoogleButton({
  mode,
  enabled,
}: {
  mode: "link" | "signin";
  enabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          const data = await api(`/api/auth/google/start?mode=${mode}`, "POST");
          location.assign(data.url);
        } catch (e) {
          setError((e as Error).message);
          setBusy(false);
        }
      }}
    >
      <Button
        type="submit"
        variant="secondary"
        disabled={!enabled || busy}
        className="w-full whitespace-normal"
      >
        <Cloud size={18} />
        {busy
          ? "Opening Google…"
          : mode === "link"
            ? "Connect Google and save my player"
            : "Sign in with Google"}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
export function AccountPanel({
  googleConfigured,
}: {
  googleConfigured: boolean;
}) {
  const { player, loading, error: sessionError } = usePlayer();
  const [data, setData] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const signoutTrigger = useRef<HTMLButtonElement>(null);
  const signoutConfirmation = useRef<HTMLDivElement>(null);
  useEffect(() => { if(confirm)signoutConfirmation.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [confirm]);
  const load = async () => {
    try {
      const account = (await api("/api/account")) as Account;
      setData(account);
      setUsername(account.username ?? "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  };
  useEffect(() => {
    if (player) void load();
    else if (!loading) setLoaded(true);
  }, [player?.id, loading]);
  useEffect(() => {
    const auth = new URL(location.href).searchParams.get("auth");
    if (auth && messages[auth]) setError(messages[auth]);
    if (auth === "connected" || auth === "onboarding")
      setStatus(
        "Google connected. Your original player and progress are saved.",
      );
  }, []);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    title.current?.focus();
  }, [step]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const onboarding =
    player?.kind === "registered" && data && !data.onboardingAt;
  const choose = (f: File | undefined) => {
    setError("");
    if (!f) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
      f.size > 5 * 1024 * 1024
    ) {
      setError("Choose a JPEG, PNG or WebP under 5 MB.");
      return;
    }
    setFile(f);
  };
  return (
    <div
      className="mx-auto max-w-5xl px-4 py-8 sm:px-6"
      data-testid="account-panel"
    >
      <Link href="/profile" className="text-sm font-semibold text-ink-muted">
        &larr; Your player profile
      </Link>
      <header className="my-6 overflow-hidden rounded-3xl border-2 border-[#7268c6] bg-[#211b46] p-5 text-[#f6efff] sm:p-8">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#d9c2ff]">
          <ShieldCheck size={18} /> One player. Every adventure.
        </p>
        <h1
          ref={title}
          tabIndex={-1}
          className="mt-3 font-display text-3xl font-black sm:text-5xl"
        >
          {onboarding ? "Make it yours." : "Your player, everywhere."}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#d4cdeb]">
          Keep your Sin Coins, hard-earned badges and chef's passport together.
          Google connects to your existing player; your progress stays yours.
        </p>
      </header>
      {error && (
        <div
          role="alert"
          className="mb-5 rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm"
        >
          {error}
        </div>
      )}
      {status && (
        <p
          role="status"
          className="mb-5 flex items-center gap-2 rounded-xl bg-mint/10 p-4 text-sm"
        >
          <Check size={18} />
          {status}
        </p>
      )}
      {sessionError && (
        <div
          role="alert"
          className="mb-5 rounded-2xl border border-danger/40 p-4 text-sm"
        >
          {sessionError}
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => location.reload()}
          >
            Retry player session
          </Button>
        </div>
      )}
      {loading || (player && !loaded) ? (
        <div className="p-8">
          <Spinner label="Loading your account" />
        </div>
      ) : sessionError ? null : !player ? (
        <div className="grid gap-5 md:grid-cols-2">
          <Card className="p-6">
            <UserRound className="mb-3 text-brand-400" />
            <h2 className="font-display text-2xl font-bold">Play as a guest</h2>
            <p className="my-4 text-sm text-ink-muted">
              No registration required. Clearing cookies or changing devices
              before linking Google can lose access to this guest.
            </p>
            <NameForm
              submitLabel="Continue as guest"
              onSaved={() => location.reload()}
            />
          </Card>
          <Card className="p-6">
            <Cloud className="mb-3 text-brand-400" />
            <h2 className="font-display text-2xl font-bold">
              Bring your player back
            </h2>
            <p className="my-4 text-sm text-ink-muted">
              Already connected Google on another device? Sign in to recover
              that same player, wallet and campaign.
            </p>
            <GoogleButton mode="signin" enabled={googleConfigured} />
            {!googleConfigured && (
              <p className="mt-3 text-sm text-ink-muted">
                Google sign-in needs owner configuration. Guest play is
                available.
              </p>
            )}
          </Card>
        </div>
      ) : (
        <>
          {onboarding && (
            <ol
              aria-label="Profile setup"
              className="mb-6 grid grid-cols-3 gap-2 text-center text-xs font-bold"
            >
              {["Username", "Picture", "Ready"].map((label, i) => (
                <li
                  key={label}
                  className={`rounded-xl border p-3 ${step === i + 1 ? "border-brand-400 bg-brand-500/15" : "border-line"}`}
                >
                  {i + 1}. {label}
                </li>
              ))}
            </ol>
          )}
          <div className="grid items-start gap-5 md:grid-cols-[1fr_280px]">
            <div className="min-w-0 space-y-5">
              {!onboarding && (
                <Card className="p-5 sm:p-6">
                  <h2 className="font-display text-xl font-bold">
                    {player.kind === "guest"
                      ? "Save this guest"
                      : "Google connected"}
                  </h2>
                  <p className="my-3 text-sm text-ink-muted">
                    {player.kind === "guest"
                      ? "Keep playing freely. Connect Google to recover this exact player on another device. Cookie-only guests cannot recover after losing their cookie."
                      : "Your provider connects to the same permanent player ID. We don't store Google access or refresh tokens."}
                  </p>
                  {player.kind === "guest" && (
                    <>
                      <GoogleButton mode="link" enabled={googleConfigured} />
                      <div className="mt-3">
                        <GoogleButton
                          mode="signin"
                          enabled={googleConfigured}
                        />
                      </div>
                      <p className="mt-3 text-xs text-ink-muted">
                        Sign in switches to the player already connected to
                        Google. Guest progress stays separate; no automatic
                        merge or wallet transfer.
                      </p>
                      {!googleConfigured && (
                        <p className="mt-3 text-sm text-ink-muted">
                          Google connection needs owner configuration and is
                          currently unavailable.
                        </p>
                      )}
                    </>
                  )}
                </Card>
              )}
              {player.kind === "registered" && (!onboarding || step === 1) && (
                <Card className="p-5 sm:p-6">
                  <h2 className="font-display text-xl font-bold">
                    Your unique username
                  </h2>
                  <p className="mt-2 text-sm text-ink-muted">
                    3-20 letters or numbers, with single underscores between
                    words. Stored in lowercase. Renames are limited to once
                    every 30 days; display names stay separate.
                  </p>
                  <form
                    className="mt-4 space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        const parsed = usernameSchema.safeParse(username);
                        if (!parsed.success)
                          throw Error(parsed.error.issues[0]?.message);
                        await api("/api/account", "PATCH", {
                          username: parsed.data,
                        });
                        await load();
                        await reloadPlayer();
                        if (onboarding) setStep(2);
                        else setStatus("Username saved.");
                      });
                    }}
                  >
                    <label htmlFor="username" className="text-sm font-semibold">
                      Username
                    </label>
                    <Input
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      maxLength={20}
                      autoComplete="username"
                      spellCheck={false}
                      required
                    />
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const result = await api(
                              `/api/account/username?username=${encodeURIComponent(username)}`,
                            );
                            setStatus(
                              result.available
                                ? `@${result.username} is available. Claiming is confirmed when saved.`
                                : "That username is taken.",
                            );
                          })
                        }
                      >
                        Check availability
                      </Button>
                      <Button type="submit" disabled={busy}>
                        {onboarding ? "Save and continue" : "Save username"}
                      </Button>
                    </div>
                  </form>
                </Card>
              )}
              {player.kind === "registered" && (!onboarding || step === 2) && (
                <Card className="p-5 sm:p-6">
                  <h2 className="font-display text-xl font-bold">
                    Your player picture
                  </h2>
                  <p className="mt-2 text-sm text-ink-muted">
                    Optional. Still JPEG, PNG or WebP, up to 5 MB and 4096 x
                    4096. Saved as square 64px and 256px images without original
                    metadata.
                  </p>
                  {!data?.avatarAvailable && (
                    <p className="mt-3 text-sm text-ink-muted">
                      Image storage is not configured yet. You can continue with
                      your default avatar.
                    </p>
                  )}
                  <label
                    className="mt-4 block text-sm font-semibold"
                    htmlFor="avatar-file"
                  >
                    Choose picture
                  </label>
                  <input
                    id="avatar-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy || !data?.avatarAvailable}
                    onChange={(e) => choose(e.target.files?.[0])}
                    className="mt-2 block w-full min-w-0 rounded-xl border border-line p-3 text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-surface-2 file:p-2"
                  />
                  {preview && (
                    <img
                      src={preview}
                      alt="Your selected picture preview"
                      className="mt-4 size-28 rounded-2xl object-cover"
                    />
                  )}
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      disabled={busy || !file || !data?.avatarAvailable}
                      onClick={() =>
                        void run(async () => {
                          const response = await fetch("/api/account/avatar", {
                            method: "POST",
                            headers: { "content-type": file!.type },
                            body: file,
                            signal: AbortSignal.timeout(20000),
                          });
                          await expectJson(response, "Your picture couldn't be saved. Please try again.");
                          setFile(null);
                          await load();
                          await reloadPlayer();
                          setStatus("Picture saved.");
                        })
                      }
                    >
                      <ImagePlus size={17} />
                      Save picture
                    </Button>
                    {data?.avatarKey && (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api("/api/account/avatar", "DELETE");
                            setFile(null);
                            await load();
                            await reloadPlayer();
                            setStatus("Default avatar restored.");
                          })
                        }
                      >
                        Remove picture
                      </Button>
                    )}
                    {onboarding && (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setStep(3)}
                      >
                        Continue with{" "}
                        {data?.avatarKey ? "saved picture" : "default avatar"}
                      </Button>
                    )}
                  </div>
                </Card>
              )}
              {onboarding && step === 3 && (
                <Card className="p-6">
                  <h2 className="font-display text-2xl font-bold">
                    Ready for your next adventure.
                  </h2>
                  <p className="my-4 text-sm text-ink-muted">
                    Your profile preview is ready. Your wallet, games and
                    cuisine stars stay attached to the player you connected.
                  </p>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api("/api/account", "PATCH", {
                          finishOnboarding: true,
                        });
                        location.href = "/profile";
                      })
                    }
                  >
                    Finish setup
                  </Button>
                  <Button variant="ghost" onClick={() => setStep(1)}>
                    Back to username
                  </Button>
                </Card>
              )}
              {!onboarding && (
                <Card className="p-5 sm:p-6">
                  <h2 className="font-display text-xl font-bold">
                    Sessions and sign out
                  </h2>
                  <p className="my-3 text-sm text-ink-muted">
                    {player.kind === "registered"
                      ? `${data?.sessions.length ?? 0} active session(s). Registered sessions expire after 30 days.`
                      : "This guest is accessible through this browser cookie. Sign out only if you're ready to leave it behind."}
                  </p>
                  {player.kind === "registered" && (
                    <>
                      <ul className="mb-4 space-y-2 text-xs text-ink-muted">
                        {data?.sessions.map((session, i) => (
                          <li key={i}>
                            {session.current
                              ? "This browser"
                              : "Another browser"}{" "}
                            · Started{" "}
                            {new Date(session.createdAt).toLocaleDateString()} ·
                            Expires{" "}
                            {new Date(session.expiresAt).toLocaleDateString()}
                          </li>
                        ))}
                      </ul>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api("/api/account/sessions", "POST", {
                              action: "revoke-others",
                            });
                            await load();
                            setStatus("Other sessions signed out.");
                          })
                        }
                      >
                        Sign out other browsers
                      </Button>
                    </>
                  )}
                  <div className="mt-3">
                    <Button ref={signoutTrigger} variant="ghost" onClick={() => setConfirm(true)}>
                      Sign out
                    </Button>
                  </div>
                  {confirm && (
                    <div
                      role="alertdialog"
                      ref={signoutConfirmation}
                      aria-label="Confirm sign out"
                      className="mt-3 rounded-xl border border-line p-4"
                    >
                      <p className="mb-3 text-sm">
                        {player.kind === "guest"
                          ? "Leaving an unlinked guest can make its progress inaccessible. Connect Google first to save it."
                          : "Your progress stays saved. Sign in with the same Google account to return."}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="danger"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await api("/api/account/sessions", "POST", {
                                action: "signout",
                              });
                              location.href = "/account";
                            })
                          }
                        >
                          Confirm sign out
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => { setConfirm(false); signoutTrigger.current?.focus(); }}
                        >
                          Keep playing
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              )}
            </div>
            <aside className="min-w-0 rounded-2xl border border-line bg-surface p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">
                Your player card
              </p>
              <div className="my-5 flex justify-center">
                {preview ? (
                  <img
                    src={preview}
                    alt="Player picture preview"
                    className="size-24 rounded-full object-cover"
                    onError={() => {
                      setFile(null);
                      setError(
                        "That preview could not be decoded. Choose another image.",
                      );
                    }}
                  />
                ) : (
                  <CosmeticAvatar
                    name={player.name}
                    color={player.color}
                    avatarKey={data?.avatarKey}
                    frameId={player.cosmetics?.frame}
                    size={80}
                  />
                )}
              </div>
              <h2 className="break-words font-display text-2xl font-bold">
                {player.name}
              </h2>
              <p className="mt-1 break-words text-sm text-brand-400">
                {data?.username
                  ? `@${data.username}`
                  : "Your unique username goes here"}
              </p>
              <p className="mt-4 text-sm text-ink-muted">
                {player.kind === "registered"
                  ? "Google linked"
                  : "Guest player"}
              </p>
              <Link
                href="/games"
                className="mt-5 inline-block rounded-xl bg-surface-2 px-5 py-3 font-semibold"
              >
                Keep playing
              </Link>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
