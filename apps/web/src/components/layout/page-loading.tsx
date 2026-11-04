import { LogoMark } from "@/components/brand";

/** Shown while a slow page (database-backed) streams in: the platform mark bouncing over a spinning ring. */
export function PageLoading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5" role="status" aria-label="Loading">
      <div className="relative grid size-24 place-items-center">
        <span className="absolute inset-0 animate-spin rounded-full border-4 border-[#ff4f8b]/20 border-t-[#ff4f8b] [animation-duration:900ms]" />
        <span className="animate-bounce">
          <LogoMark size={44} />
        </span>
      </div>
      <p className="font-display text-sm font-black tracking-[0.3em] text-ink-muted uppercase">Loading</p>
    </div>
  );
}
