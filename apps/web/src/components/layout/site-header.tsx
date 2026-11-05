"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Gamepad2, Menu, Settings2, Trophy, UserRound, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { GAMES, cosmeticTextColor } from "@platform/shared";
import { CosmeticAvatar } from "../profile/cosmetic-avatar";
import { GameArt, Logo } from "../brand";
import { GAME_THEME } from "../game-theme";
import { cn } from "../ui/primitives";
import { SettingsDialog } from "./settings-dialog";
import { usePlayer } from "@/lib/player";

const NAV = [
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/store", label: "Studio", icon: Gamepad2 },
  { href: "/account", label: "Account", icon: UserRound },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { player } = usePlayer();
  const inGame = pathname.startsWith("/room/");

  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <header className={cn("sticky top-0 z-40 border-b border-line/70 bg-bg/75 backdrop-blur-xl", inGame && "max-sm:static")}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Home" className="shrink-0">
          <Logo />
        </Link>
        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname.startsWith(href) ? "page" : undefined}
              className={cn("relative rounded-xl px-3.5 py-2 text-sm font-bold transition", pathname.startsWith(href) ? "text-ink" : "text-ink-muted hover:text-ink")}
            >
              {label}
              {pathname.startsWith(href) && <motion.span layoutId="nav-underline" className="absolute inset-x-3 -bottom-[13px] h-[3px] rounded-full bg-[#ff4f8b]" />}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="rounded-xl p-2.5 text-ink-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <Settings2 className="size-5" />
          </button>
          {!inGame && player?.kind !== "registered" && (
            <Link href="/account" className="hidden rounded-xl bg-[#ff4f8b] px-3.5 py-2 text-sm font-bold text-white transition hover:brightness-110 sm:inline-flex">
              Sign up
            </Link>
          )}
          {player && (
            <Link href="/profile" className="hidden items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-sm font-semibold lg:flex">
              <CosmeticAvatar name={player.name} color={player.color} frameId={player.cosmetics?.frame} size={24} avatarKey={player.avatarKey} />
              <span className="max-w-32 truncate" style={{ color: cosmeticTextColor(player.cosmetics?.nameplate) }}>{player.name}</span>
            </Link>
          )}
          <button
            type="button"
            className="rounded-xl p-2.5 text-ink-muted hover:bg-surface-2 md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            aria-label="Mobile"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.3, 1] }}
            className="overflow-hidden border-t border-line bg-bg md:hidden"
          >
            <div className="px-4 py-3">
              {player?.kind !== "registered" && (
                <Link href="/account" className="mb-2 flex items-center justify-center rounded-xl bg-[#ff4f8b] px-3 py-3 font-bold text-white">
                  Sign up or sign in
                </Link>
              )}
              {NAV.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} aria-current={pathname.startsWith(href) ? "page" : undefined} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 font-bold hover:bg-surface-2", pathname.startsWith(href) && "bg-surface-2")}>
                  <Icon className="size-5 text-[#ff4f8b]" /> {label}
                </Link>
              ))}
              <p className="mt-3 mb-2 px-3 text-xs font-black tracking-[0.2em] text-ink-faint uppercase">Jump into a game</p>
              <div className="grid grid-cols-3 gap-2 px-1 pb-2">
                {GAMES.map((g) => (
                  <Link key={g.id} href={`/play/${g.slug}`} className="overflow-hidden rounded-xl border-2" style={{ borderColor: GAME_THEME[g.id].accent }} aria-label={`Play ${g.name}`}>
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
