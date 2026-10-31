import { ButtonLink } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="font-display text-7xl font-extrabold text-gradient">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold">This page wandered off</h1>
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
