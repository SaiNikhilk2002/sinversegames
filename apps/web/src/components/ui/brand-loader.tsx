import { LogoMark } from "../brand";

/** The branded loading state. Indeterminate on purpose: we never show a made-up percentage. */
export function BrandLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="sg-loader" data-testid="brand-loader">
      <span className="sg-loader-mark"><LogoMark size={44} /></span>
      <span>{label}…</span>
    </div>
  );
}
