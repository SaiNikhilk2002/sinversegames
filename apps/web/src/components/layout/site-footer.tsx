import Link from "next/link";
import { brand, GAMES } from "@platform/shared";
import { Logo } from "../brand";

/** Quiet footer: the brand, the catalogue, the platform and the legal pages. */
export function SiteFooter() {
  return (
    <footer className="mt-28 border-t border-line">
      <div className="page-x grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-muted">{brand.description}</p>
        </div>
        <FooterCol title="Games" links={[...GAMES.map((g) => ({ href: `/games/${g.slug}`, label: g.name })), { href: "/games", label: "All games" }]} />
        <FooterCol
          title="Platform"
          links={[
            { href: "/leaderboard", label: "Leaderboard" },
            { href: "/profile", label: "Your profile" },
            { href: "/account", label: "Account" },
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
      <div className="border-t border-line">
        <p className="page-x py-6 text-xs text-ink-faint">
          © {new Date().getFullYear()} {brand.name}. All games and artwork are original.
        </p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h2 className="type-eyebrow mb-4">{title}</h2>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-sm text-ink-muted transition-colors hover:text-ink">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
