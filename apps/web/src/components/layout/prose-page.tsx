import type { ReactNode } from "react";

export function ProsePage({ title, updated, intro, children }: { title: string; updated?: string; intro?: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl font-semibold tracking-tight">{title}</h1>
      {updated && <p className="mt-2 text-sm text-ink-faint">Last updated {updated}</p>}
      {intro && <p className="mt-6 text-lg text-ink-muted">{intro}</p>}
      <div className="mt-8 space-y-4 leading-relaxed text-ink-muted [&_a]:font-semibold [&_a]:text-brand-500 [&_a:hover]:underline [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">
        {children}
      </div>
    </article>
  );
}
