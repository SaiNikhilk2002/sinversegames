import type { Metadata } from "next";
import { EmailLinkVerifier } from "@/components/profile/email-link-verifier";

export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return <EmailLinkVerifier />;
}
