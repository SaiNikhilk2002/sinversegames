import type { ConnectionStatus } from "@/lib/realtime/connection";
import { cn } from "../ui/primitives";

const LABELS: Record<ConnectionStatus, { label: string; tone: string }> = {
  idle: { label: "Not connected", tone: "bg-ink-faint" },
  connecting: { label: "Connecting…", tone: "bg-sun animate-pulse" },
  connected: { label: "Connected", tone: "bg-mint" },
  reconnecting: { label: "Reconnecting…", tone: "bg-sun animate-pulse" },
  offline: { label: "Game server unreachable", tone: "bg-danger" },
  unauthorized: { label: "Choose a name to connect", tone: "bg-ink-faint" },
  banned: { label: "Account suspended", tone: "bg-danger" },
};

export function ConnectionBadge({ status, className }: { status: ConnectionStatus; className?: string }) {
  const { label, tone } = LABELS[status];
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold", className)}>
      <span className={cn("size-2 rounded-full", tone)} aria-hidden />
      {label}
    </span>
  );
}
