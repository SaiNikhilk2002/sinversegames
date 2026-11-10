import { Skeleton } from "@/components/ui/primitives";

/**
 * Shown while a database-backed page streams in: a quiet outline of the page
 * to come, so nothing jumps when it arrives. Static under reduced motion.
 */
export function PageLoading() {
  return (
    <div className="page-x py-10 sm:py-14" role="status" aria-label="Loading">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-10 w-72 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-72 rounded-2xl" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

/** The leaderboard's own outline: a header band, a podium and rows. */
export function LeaderboardLoading() {
  return (
    <div role="status" aria-label="Loading leaderboard">
      <div className="border-b border-line bg-surface">
        <div className="page-x py-10">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-4 h-10 w-64" />
          <div className="mt-6 flex gap-2 overflow-hidden">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-24 shrink-0 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
      <div className="page-x max-w-4xl py-10">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
        <div className="mt-6 space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}

/** The profile's own outline: the player header, four figures and the wallet. */
export function ProfileLoading() {
  return (
    <div className="page-x max-w-5xl py-10" role="status" aria-label="Loading profile">
      <Skeleton className="h-44 rounded-2xl" />
      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-64 rounded-2xl" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
