import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@platform/shared";
import { ProsePage } from "@/components/layout/prose-page";

export const metadata: Metadata = { title: "Terms of service", description: `The rules for using ${brand.name}.`, alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <ProsePage title="Terms of service" updated="31 October 2026" intro={`By using ${brand.name} you agree to these terms. Please read them — they're short.`}>
      <h2>Using the service</h2>
      <p>
        {brand.name} provides free browser games. You may play as a guest without creating an account. You're responsible for what you do on the platform, including the display name you choose, what you draw and what you type.
      </p>
      <h2>Be a good player</h2>
      <ul>
        <li>No harassment, hate speech, threats or sexual content — including in names, chat and drawings.</li>
        <li>No cheating, exploiting bugs, automating play or interfering with other players' games.</li>
        <li>No impersonating other people or our staff.</li>
        <li>No attempts to disrupt, overload or gain unauthorised access to our systems.</li>
      </ul>
      <p>We may remove players from rooms, close rooms, or suspend access for anyone who breaks these rules.</p>
      <h2>Virtual rewards</h2>
      <p>
        You may earn {brand.rewardCurrencyName} and achievements from eligible verified games. Coins unlock clearly priced cosmetic items in our studio; they provide no competitive advantage. Coins cannot be purchased for money, sold, transferred or redeemed for money or anything of value. There are no random paid rewards. We may adjust future earning rates and item prices; purchases remain in your inventory.
      </p>
      <h2>Availability</h2>
      <p>
        We work hard to keep games running, but the service is provided “as is”. Games in progress can be interrupted, for example during server maintenance, and we can't guarantee that results or statistics will always be recorded.
      </p>
      <h2>Content and ownership</h2>
      <p>The games, artwork and software are ours. You keep ownership of anything you create, such as drawings, but give us permission to display it to the other players in your room.</p>
      <h2>Changes</h2>
      <p>
        We may update these terms; the date above shows the latest version. Questions? <Link href="/contact">Contact us</Link>.
      </p>
    </ProsePage>
  );
}
