import type { Metadata } from "next";
import { NameGate } from "@/components/play/name-gate";
import { WalletPanel } from "@/components/profile/wallet-panel";

export const metadata: Metadata = { title: "Cosmetic studio", description: "Use earned Sin Coins for profile frames and nameplates. Every unlock is cosmetic, with clear prices and no random rewards.", robots: { index: false } };

export default function StorePage() {
  return <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6"><p className="text-xs font-semibold tracking-[0.25em] text-[#8a4b00] dark:text-sun uppercase">Made for your player</p><h1 className="mt-2 font-display text-4xl font-semibold">The cosmetic studio</h1><p className="mt-3 mb-8 max-w-xl text-ink-muted">Play for the experience. Save up for a look you love. Every item stays yours, with no time limits.</p><NameGate title="Choose a name to open your studio"><WalletPanel store /></NameGate></div>;
}
