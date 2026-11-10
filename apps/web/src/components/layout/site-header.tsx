"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, Gamepad2, Menu, Palette, Search, Settings2, Trophy, UserRound, KeyRound, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { GAMES, cosmeticTextColor } from "@platform/shared";
import { CosmeticAvatar } from "../profile/cosmetic-avatar";
import { GameArt, Logo } from "../brand";
import { cn } from "../ui/primitives";
import { SettingsDialog } from "./settings-dialog";
import { usePlayer } from "@/lib/player";

const NAV = [
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/store", label: "Studio", icon: Palette },
  { href: "/profile", label: "Profile", icon: UserRound },
];

/**
 * The site bar: brand, four destinations, and the player's own controls on the
 * right. On phones the destinations move into a sheet with a quick row of games.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { player } = usePlayer();
  const inGame = pathname.startsWith("/room/");
  const registered = player?.kind === "registered";
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className={cn("sticky top-0 z-40 border-b border-line/80 bg-bg/80 backdrop-blur-xl backdrop-saturate-150", inGame && "max-sm:static")}>
      <div className="page-x flex h-16 items-center gap-3">
        <Link href="/" aria-label="Home" className="shrink-0 rounded-lg">
          <Logo />
        </Link>
        <nav aria-label="Main" className="ml-8 hidden items-center gap-1 md:flex">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={cn("relative rounded-lg px-3 py-2 text-sm font-medium transition-colors", active(href) ? "text-ink" : "text-ink-muted hover:text-ink")}
            >
              {label}
              {active(href) && <motion.span layoutId="nav-underline" className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-primary" transition={{ duration: 0.25, ease: [0.2, 0.8, 0.3, 1] }} />}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <Link href="/games#search" aria-label="Search games" className="hidden rounded-lg p-2.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink sm:inline-flex">
            <Search className="size-[18px]" />
          </Link>
          <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Settings" className="rounded-lg p-2.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink">
            <Settings2 className="size-[18px]" />
          </button>
          {!inGame && !registered && (
            <Link href="/account" className="ml-1 hidden h-9 items-center rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-hover sm:inline-flex">
              Sign up
            </Link>
          )}
          {registered && (
            <Link href="/account" aria-current={active("/account") ? "page" : undefined} className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink sm:inline-flex">
              Account
            </Link>
          )}
          {player && (
            <Link href="/profile" aria-label={`Your profile, ${player.name}`} className="ml-1 hidden items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-sm font-medium transition-colors hover:border-line-strong lg:flex">
              <CosmeticAvatar name={player.name} color={player.color} frameId={player.cosmetics?.frame} size={26} avatarKey={player.avatarKey} />
              <span className="max-w-32 truncate" style={{ color: cosmeticTextColor(player.cosmetics?.nameplate) }}>{player.name}</span>
            </Link>
          )}
          <button
            type="button"
            className="rounded-lg p-2.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            id="mobile-menu"
            aria-label="Mobile"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.3, 1] }}
            className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-line bg-bg shadow-lift md:hidden"
          >
            <div className="page-x py-4">
              {player && (
                <Link href="/profile" className="mb-3 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                  <CosmeticAvatar name={player.name} color={player.color} frameId={player.cosmetics?.frame} size={40} avatarKey={player.avatarKey} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold" style={{ color: cosmeticTextColor(player.cosmetics?.nameplate) }}>{player.name}</span>
                    <span className="block text-xs text-ink-muted">{registered ? "Signed in" : "Playing as a guest"}</span>
                  </span>
                  <ChevronRight className="size-4 text-ink-faint" />
                </Link>
              )}
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {[...NAV, { href: "/account", label: registered ? "Account" : "Sign up or sign in", icon: KeyRound }].map(({ href, label, icon: Icon }) => (
                  <li key={href}>
                    <Link href={href} aria-current={active(href) ? "page" : undefined} className={cn("flex items-center gap-3 px-4 py-3.5 font-medium transition-colors hover:bg-surface-2", active(href) && "text-primary")}>
                      <Icon className="size-[18px] text-ink-faint" /> <span className="flex-1">{label}</span>
                      <ChevronRight className="size-4 text-ink-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="type-eyebrow mt-6 mb-3">Jump into a game</p>
              <div className="grid grid-cols-3 gap-2 pb-2">
                {GAMES.map((g) => (
                  <Link key={g.id} href={`/play/${g.slug}`} className="overflow-hidden rounded-xl border border-line" aria-label={`Play ${g.name}`}>
                    <GameArt gameId={g.id} className="block aspect-[16/10] w-full" />
                  </Link>
                ))}
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
