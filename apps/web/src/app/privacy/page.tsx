import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@platform/shared";
import { ProsePage } from "@/components/layout/prose-page";

export const metadata: Metadata = { title: "Privacy policy", description: `How ${brand.name} handles your data.`, alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy policy" updated="31 October 2026" intro="This policy explains what information we collect when you play, why, and the choices you have.">
      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Guest profile:</strong> the display name and avatar colour you choose, and a randomly generated player ID. We don't ask for your real name, email address or date of birth to play.
        </li>
        <li>
          <strong>Game activity:</strong> match results (game, players, placements, scores, date), aggregate statistics such as games played and wins, achievements, and reward points earned.
        </li>
        <li>
          <strong>Reports:</strong> if you report a player, we store the report, its reason and any details you provide.
        </li>
        <li>
          <strong>Technical data:</strong> our servers process your IP address and connection information to deliver the service, prevent abuse (for example rate limiting), and keep short-lived operational logs.
        </li>
      </ul>
      <h2>What we don't store</h2>
      <p>
        Drawings, individual moves and in-game chat messages are relayed in real time to the other players in your room and are not saved to our database. They exist only in server memory for the duration of a game.
      </p>
      <h2>How we use information</h2>
      <ul>
        <li>To run games, rooms and matchmaking.</li>
        <li>To show your profile, match history and leaderboards (leaderboards display your display name, avatar colour, level and statistics).</li>
        <li>To keep the platform safe, investigate reports and enforce our <Link href="/terms">terms</Link>.</li>
      </ul>
      <h2>Cookies and local storage</h2>
      <p>
        We use one essential cookie to remember your guest identity and local storage for your settings. See the <Link href="/cookies">cookie information</Link> page. We do not currently use advertising or analytics cookies.
      </p>
      <h2>Sharing</h2>
      <p>
        We don't sell your information. We use infrastructure providers (hosting, database and real-time servers) to operate the service; they process data on our behalf. Other players can see your display name, avatar colour and in-game activity in rooms you join.
      </p>
      <h2>Retention and your choices</h2>
      <p>
        You can change your display name at any time from your profile. Clearing your browser's cookies removes your link to your guest profile on that device. To request deletion of the data associated with your player ID, <Link href="/contact">contact us</Link>.
      </p>
      <h2>Changes</h2>
      <p>If we change this policy we'll update the date at the top of this page.</p>
      <p>
        Contact: <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>
      </p>
    </ProsePage>
  );
}
