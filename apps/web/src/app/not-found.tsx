import { ButtonLink } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-28 text-center">
      <p className="type-eyebrow">Error 404</p>
      <h1 className="type-title mt-3">This page wandered off</h1>
      <p className="mt-2 text-ink-muted">The link might be broken, or the room may have closed.</p>
      <div className="mt-8 flex justify-center gap-3">
        <ButtonLink href="/games">Browse games</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Home
        </ButtonLink>
      </div>
    </div>
  );
}
