import Link from "next/link";
import { brand, GAMES } from "@platform/shared";
import { Logo } from "../brand";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-ink-muted">{brand.description}</p>
        </div>
        <FooterCol title="Games" links={[...GAMES.map((g) => ({ href: `/games/${g.slug}`, label: g.name })), { href: "/games", label: "All games" }]} />
        <FooterCol
          title="Platform"
          links={[
            { href: "/leaderboard", label: "Leaderboard" },
            { href: "/profile", label: "Your profile" },
            { href: "/store", label: "Cosmetic studio" },
            { href: "/about", label: "About" },
            { href: "/contact", label: "Contact" },
          ]}
        />
        <FooterCol
          title="Legal"
          links={[
            { href: "/privacy", label: "Privacy policy" },
            { href: "/terms", label: "Terms of service" },
            { href: "/cookies", label: "Cookies" },
          ]}
        />
      </div>
      <div className="border-t border-line py-5 text-center text-xs text-ink-faint">
        © {new Date().getFullYear()} {brand.name}. All games and artwork are original.
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-bold">{title}</h2>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-sm text-ink-muted hover:text-ink">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
