import type { Metadata } from "next";
import { brand } from "@platform/shared";
import { ProsePage } from "@/components/layout/prose-page";

export const metadata: Metadata = { title: "Cookies", description: `How ${brand.name} uses cookies and local storage.`, alternates: { canonical: "/cookies" } };

export default function CookiesPage() {
  return (
    <ProsePage title="Cookies & local storage" updated="5 November 2026" intro="Essential player cookies, optional sign-in protection, and settings on your device.">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Purpose</th>
              <th className="py-2">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <tr>
              <td className="py-2 pr-4 font-mono">pw_session</td>
              <td className="py-2 pr-4">Essential cookie (httpOnly)</td>
              <td className="py-2 pr-4">Remembers your guest identity or connected account session so you keep your player and progress.</td>
              <td className="py-2">Guest: 180 days; connected: 30 days</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">pw_admin</td>
              <td className="py-2 pr-4">Essential cookie (httpOnly)</td>
              <td className="py-2 pr-4">Only set for moderators who sign in to the admin area.</td>
              <td className="py-2">12 hours</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">sg_oauth</td>
              <td className="py-2 pr-4">Essential cookie (httpOnly)</td>
              <td className="py-2 pr-4">Binds an optional Google connection attempt to this browser. Cleared on callback.</td>
              <td className="py-2">Up to 10 minutes</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">sg_email_auth</td>
              <td className="py-2 pr-4">Essential cookie (httpOnly)</td>
              <td className="py-2 pr-4">Binds an optional email sign-in attempt to this browser. Cleared once you&apos;re signed in.</td>
              <td className="py-2">Up to 30 minutes</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">platform:solo:…</td>
              <td className="py-2 pr-4">Tab session storage</td>
              <td className="py-2 pr-4">Bounded Cuisine Quest move log and signed run for paused refresh recovery. Does not authorize rewards.</td>
              <td className="py-2">Until tab closes or saved shift is discarded</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">platform:settings</td>
              <td className="py-2 pr-4">Local storage</td>
              <td className="py-2 pr-4">Your theme, sound and reduced-motion preferences. Never sent to our servers.</td>
              <td className="py-2">Until cleared</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        We don&apos;t use advertising, analytics or third-party tracking cookies. Fonts are served from our own domain. If that changes, we&apos;ll update this page and ask for consent where required.
      </p>
    </ProsePage>
  );
}
