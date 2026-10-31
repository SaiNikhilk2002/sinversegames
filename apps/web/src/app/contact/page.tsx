import type { Metadata } from "next";
import { brand } from "@platform/shared";
import { ProsePage } from "@/components/layout/prose-page";

export const metadata: Metadata = { title: "Contact", description: `Contact the ${brand.name} team.`, alternates: { canonical: "/contact" } };

export default function ContactPage() {
  return (
    <ProsePage title="Contact us" intro="We'd love to hear from you.">
      <p>
        Email us at <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> for support, feedback, privacy requests or partnership enquiries.
      </p>
      <h2>Reporting a player</h2>
      <p>
        To report behaviour during a game, use the flag icon next to the player's name in the room lobby. Reports include the room code and go straight to our moderation queue. For anything urgent, email us with the room code and a description of what happened.
      </p>
      <h2>Privacy requests</h2>
      <p>
        To ask what data is linked to your guest profile or to have it deleted, email us from the device you play on and include your display name. See our privacy policy for details.
      </p>
    </ProsePage>
  );
}
