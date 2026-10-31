import type { Metadata } from "next";
import { brand } from "@platform/shared";
import { ProsePage } from "@/components/layout/prose-page";

export const metadata: Metadata = { title: "Cookies", description: `How ${brand.name} uses cookies and local storage.`, alternates: { canonical: "/cookies" } };

export default function CookiesPage() {
  return (
    <ProsePage title="Cookies & local storage" updated="31 October 2026" intro="We keep this minimal: one essential cookie and a few settings on your device.">
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
              <td className="py-2 pr-4">Remembers your guest identity and display name so you keep your seat and stats.</td>
              <td className="py-2">180 days</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">pw_admin</td>
              <td className="py-2 pr-4">Essential cookie (httpOnly)</td>
              <td className="py-2 pr-4">Only set for moderators who sign in to the admin area.</td>
              <td className="py-2">12 hours</td>
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
