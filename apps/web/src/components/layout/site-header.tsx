"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Gamepad2, Menu, Settings2, Trophy, UserRound, X } from "lucide-react";
import { Logo } from "../brand";
import { Avatar, cn } from "../ui/primitives";
import { SettingsDialog } from "./settings-dialog";
import { usePlayer } from "@/lib/player";

const NAV = [
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/profile", label: "Profile", icon: UserRound },
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
              className={cn(
                "rounded-xl px-3.5 py-2 text-sm font-semibold transition",
                pathname.startsWith(href) ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {label}
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
          {player && (
            <Link href="/profile" className="hidden items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-sm font-semibold sm:flex">
              <Avatar name={player.name} color={player.color} size={28} />
              <span className="max-w-32 truncate">{player.name}</span>
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
      {menuOpen && (
        <nav aria-label="Mobile" className="border-t border-line bg-bg px-4 py-3 md:hidden">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-surface-2">
              <Icon className="size-5 text-brand-500" /> {label}
            </Link>
          ))}
        </nav>
      )}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
