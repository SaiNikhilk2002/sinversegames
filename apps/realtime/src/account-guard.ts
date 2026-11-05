export type AccountStatus = "valid" | "invalid" | "unknown";

/** How long a live socket can go before its account is checked again. */
export const ACCOUNT_RECHECK_MS = 5_000;

/** These start or enter a room, so they wait for a fresh answer. They're also rare. */
const ENTRY_EVENT = /^(room:create|room:join|match:queue)$/;

/**
 * Keeps session revocation working without a database lookup per packet. Game
 * packets (strokes, movement, guesses) can arrive many times a second, and must
 * never wait on the database or queue behind one another.
 *
 * - Entry events wait for a fresh answer.
 * - Everything else passes straight through and triggers at most one background
 *   recheck every ACCOUNT_RECHECK_MS.
 * - Only a definite "invalid" disconnects. A database error is "unknown", which
 *   leaves the player connected, as the ban check does: an outage must not end
 *   everyone's match.
 */
export function createAccountGuard({
  lookup,
  onInvalid,
  now = Date.now,
  recheckMs = ACCOUNT_RECHECK_MS,
}: {
  lookup: () => Promise<AccountStatus>;
  onInvalid: () => void;
  now?: () => number;
  recheckMs?: number;
}) {
  let checkedAt = now();
  let pending: Promise<AccountStatus> | null = null;
  const refresh = () => {
    checkedAt = now();
    pending ??= lookup()
      .catch((): AccountStatus => "unknown")
      .then((status) => {
        if (status === "invalid") onInvalid();
        return status;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
  return (event: string, next: (error?: Error) => void) => {
    if (ENTRY_EVENT.test(event)) {
      void refresh().then((status) =>
        status === "invalid" ? next(new Error("UNAUTHORIZED")) : next(),
      );
      return;
    }
    if (now() - checkedAt >= recheckMs) void refresh();
    next();
  };
}
