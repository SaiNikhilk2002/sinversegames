"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Coins, Palette, ShieldCheck } from "lucide-react";
import { COIN_RULES, COSMETICS, coinReasonLabel, cosmeticTextColor, getCosmetic, type CosmeticCategory } from "@platform/shared";
import { reloadPlayer, usePlayer } from "@/lib/player";
import { sfx } from "@/lib/sound";
import { Button, Card } from "../ui/primitives";
import { CosmeticAvatar } from "./cosmetic-avatar";

interface Wallet {
  balance: number;
  inventory: { itemId: string; acquiredAt: string }[];
  equipment: { category: CosmeticCategory; itemId: string }[];
  transactions: { id: string; amount: number; reason: string; refType: string | null; refId: string | null; createdAt: string }[];
  nextCursor: string | null;
}

export function WalletPanel({ store = false }: { store?: boolean }) {
  const { player } = usePlayer();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async (cursor?: string) => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/wallet${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Your wallet is unavailable.");
      setWallet((previous) => cursor && previous ? { ...data, transactions: [...previous.transactions, ...data.transactions] } : data);
    } catch (err) { setError(err instanceof Error ? err.message : "Your wallet is unavailable."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const mutate = async (key: string, body: object) => {
    setBusy(key); setNotice(null); setError(null);
    try {
      const response = await fetch("/api/wallet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12_000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The store couldn't confirm this request.");
      setNotice("action" in body && body.action === "purchase" ? (result.purchased ? "Unlocked! Equip it whenever you like." : "You already own this item. No coins spent.") : "Profile style updated.");
      sfx.pop();
      await refresh();
      await reloadPlayer();
    } catch (err) { setError(err instanceof Error ? err.message : "Refresh your wallet before retrying."); }
    finally { setBusy(null); }
  };
  const owned = new Set(wallet?.inventory.map((item) => item.itemId));
  const equipment = new Map(wallet?.equipment.map((item) => [item.category, item.itemId]));

  return (
    <section aria-label="Sin Coins wallet" className="space-y-5" data-testid="wallet">
      <Card className="border-2 border-[#ffbf57]/50 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-[#8a4b00] dark:text-sun"><Coins className="size-5" /> Your Sin Coins</p>
            <p className="mt-2 font-mono text-4xl font-black tabular-nums" data-testid="coin-balance">{wallet ? wallet.balance.toLocaleString() : "—"}</p>
          </div>
          <div className="flex items-center gap-3">
            <CosmeticAvatar name={player?.name ?? "You"} color={player?.color ?? "#ff4f8b"} frameId={equipment.get("profile-frame")} size={52} />
            <p data-testid="cosmetic-name" data-nameplate={equipment.get("nameplate") ?? "default"} className="font-display text-xl font-black" style={{ color: cosmeticTextColor(equipment.get("nameplate")) }}>{player?.name ?? "Your profile"}</p>
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-sm text-ink-muted">Earn coins from positive-score games completed normally after at least 30 seconds, with bonuses for wins, personal bests and new achievements. Solo runs must be completed. Up to {COIN_RULES.dailyCap} coins per UTC day. Cosmetics give no gameplay advantage.</p>
        <p className="mt-2 text-xs text-ink-faint">Sin Coins have no monetary value. No real-money purchases, transfers, random prizes or cash redemption.</p>
        {player?.kind === "guest" && <p className="mt-3 text-sm text-[#8a4b00] dark:text-sun">Guest progress stays with this browser cookie. Account sign-in and recovery across devices are not available yet; keep your cookie to retain access.</p>}
        {!store && <Link href="/store" className="mt-4 inline-flex items-center gap-2 font-bold text-brand-400 hover:underline"><Palette className="size-4" /> Visit the cosmetic studio</Link>}
      </Card>
      {notice && <p role="status" className="rounded-xl border border-mint/40 bg-mint/10 p-3 text-sm">{notice}</p>}
      {error && <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm"><p>{error}</p><Button size="sm" variant="secondary" className="mt-2" disabled={loading || !!busy} onClick={() => void refresh()}>Refresh wallet</Button></div>}
      {loading && !wallet && <p role="status" className="text-sm text-ink-muted">Loading your wallet…</p>}
      {store && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {COSMETICS.map((item) => {
            const have = owned.has(item.id);
            const equipped = equipment.get(item.category) === item.id;
            return (
              <Card key={item.id} className="flex flex-col border-2 p-5" data-testid={`item-${item.id}`}>
                <div className="mb-5 flex h-24 items-center justify-center rounded-2xl bg-bg">
                  {item.category === "profile-frame" ? <CosmeticAvatar name={player?.name ?? "You"} color={player?.color ?? "#ff4f8b"} frameId={item.id} size={48} /> : <span className="font-display text-2xl font-black" style={{ color: cosmeticTextColor(item.id) }}>{player?.name ?? "Your name"}</span>}
                </div>
                <p className="text-xs font-bold tracking-wider text-ink-faint uppercase">{item.category === "profile-frame" ? "Portrait frame" : "Nameplate"}</p>
                <h2 className="mt-1 font-display text-xl font-black">{item.name}</h2>
                <p className="mt-2 flex-1 text-sm text-ink-muted">{item.description}</p>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#8a4b00] dark:text-sun">{have ? <><ShieldCheck className="size-4" /> Owned</> : <><Coins className="size-4" />{item.price}</>}</span>
                  <Button size="sm" variant={have ? "secondary" : "primary"} loading={busy === item.id} disabled={!wallet || !!busy || loading || (!have && wallet.balance < item.price)} onClick={() => void mutate(item.id, have ? { action: "equip", category: item.category, itemId: equipped ? null : item.id } : { action: "purchase", itemId: item.id })}>
                    {have ? equipped ? "Remove" : "Equip" : "Unlock"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Card className="p-5">
        <h2 className="font-display text-xl font-black">Transaction history</h2>
        <p className="mt-1 text-sm text-ink-muted">Your verified rewards and purchases. Daily-cap adjustments are reflected in the amount received; capped rewards are not carried forward.</p>
        {wallet?.transactions.length ? <ul className="mt-4 divide-y divide-line" data-testid="coin-history">{wallet.transactions.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-3 py-3">
            <div><p className="text-sm font-semibold">{coinReasonLabel(entry.reason)}{entry.reason === "cosmetic_purchase" && ` · ${getCosmetic(entry.refId)?.name ?? "Cosmetic"}`}</p><time className="text-xs text-ink-faint" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time></div>
            <span className={`shrink-0 font-mono font-bold ${entry.amount > 0 ? "text-[#11654d] dark:text-mint" : "text-ink-muted"}`}>{entry.amount > 0 ? "+" : ""}{entry.amount}</span>
          </li>
        ))}</ul> : !loading && <p className="mt-4 text-sm text-ink-muted">{wallet ? "No transactions yet. Finish an eligible game to earn your first coins." : "History will appear when your wallet is available."}</p>}
        {wallet?.nextCursor && <Button variant="secondary" className="mt-4" disabled={loading || !!busy} loading={loading} onClick={() => void refresh(wallet.nextCursor!)}>Load older transactions</Button>}
      </Card>
    </section>
  );
}
