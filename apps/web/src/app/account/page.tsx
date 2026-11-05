import type { Metadata } from "next";
import { AccountPanel } from "@/components/profile/account-panel";
import { googleConfig } from "@/lib/server/account";
import { emailConfig } from "@/lib/server/email";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your player account",
  robots: { index: false, follow: false },
};
export default function AccountPage() {
  return (
    <AccountPanel googleConfigured={!!googleConfig()} emailConfigured={!!emailConfig()} />
  );
}
