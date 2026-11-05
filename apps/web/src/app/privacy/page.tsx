import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@platform/shared";
import { ProsePage } from "@/components/layout/prose-page";

export const metadata: Metadata = { title: "Privacy policy", description: `How ${brand.name} handles your data.`, alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy policy" updated="5 November 2026" intro="This policy explains what information we collect when you play, why, and the choices you have.">
      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Guest profile:</strong> the display name and avatar colour you choose, and a randomly generated player ID. We don't ask for your real name, email address or date of birth to play as a guest.
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
      <h2>Sin Coins and cosmetics</h2>
      <p>We retain your reward and purchase transactions, owned cosmetic items and equipped profile styles in the player database. Your transaction history is private to your current player session. Coins cannot be bought for money or transferred. Guest access depends on the browser cookie. When Google connection is available, you can link it to recover the same player on another device.</p>
      <h2>Optional connected accounts and pictures</h2>
      <p>Saving your player with email is optional. If you do, we keep your email address linked to your player so you can sign in, and we use it to send sign-in codes and links, a welcome message and security notices. We don't use it for marketing. Sign-in codes and links are stored only in protected form and expire within 15 minutes.</p>
      <p>Connecting Google is optional. We validate Google's identity response and retain its account identifier linked to your existing player. We check verified-email status but do not retain your Google email, access tokens, refresh tokens or provider picture. Registered accounts can choose a public username and upload a public profile picture. Uploaded originals are processed into small square images without original metadata; replacement and removal update your current picture. Previously cached public pictures can remain briefly after removal.</p>
      <p>We retain hashed account-session secrets and expiry times so you can sign out this browser or other browsers. Short-lived connection attempts and abuse-prevention counters support secure sign-in. A connected account keeps the same wallet, achievements and game progress; different players are not automatically merged.</p>
      <h2>What we don't store</h2>
      <p>
        Drawings, individual moves and in-game chat messages are relayed in real time to the other players in your room and are not saved to our database. They exist only in server memory for the duration of a game.
      </p>
      <h2>How we use information</h2>
      <ul>
        <li>To run games, rooms and matchmaking.</li>
        <li>To show your profile, match history and leaderboards (leaderboards display your display name, public username/picture when chosen, avatar colour, level and statistics).</li>
        <li>To keep the platform safe, investigate reports and enforce our <Link href="/terms">terms</Link>.</li>
      </ul>
      <h2>Cookies and local storage</h2>
      <p>
        We use essential cookies to remember your player session and protect an email or Google sign-in attempt, local storage for settings, and tab storage for unfinished Cuisine Quest recovery. See the <Link href="/cookies">cookie information</Link> page. We do not currently use advertising or analytics cookies.
      </p>
      <h2>Sharing</h2>
      <p>
        We don't sell your information. We use infrastructure providers (hosting, database, image storage, real-time servers and email delivery) to operate the service; they process data on our behalf. Google processes your optional sign-in on its own service. Other players can see your public display name, username/picture when chosen, avatar colour and in-game activity in rooms you join.
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
