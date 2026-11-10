import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
export { PlayerAvatar as Avatar } from "../profile/player-avatar";

export const cn = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_8px_22px_-12px_var(--color-primary)] hover:bg-primary-hover",
  secondary: "bg-surface-2 text-ink border border-line hover:bg-surface-3 hover:border-line-strong",
  outline: "border border-line-strong text-ink hover:bg-surface-2",
  ghost: "text-ink-muted hover:text-ink hover:bg-surface-2",
  danger: "bg-danger text-white hover:brightness-110",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5 rounded-lg",
  md: "h-11 px-5 text-[15px] gap-2 rounded-xl",
  lg: "h-12 px-6 text-base gap-2.5 rounded-xl",
};

/**
 * Buttons. One primary per view; secondary for the alternative; ghost for
 * tertiary actions. Hover lifts colour, press settles slightly; no bounces.
 */
export const buttonClass = (variant: Variant = "primary", size: Size = "md", extra?: string) =>
  cn(
    "inline-flex select-none items-center justify-center font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out",
    "disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400",
    variants[variant],
    sizes[size],
    extra,
  );

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({ variant, size, className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

// ---------------------------------------------------------------------------
// Surfaces & text
// ---------------------------------------------------------------------------

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-line bg-surface shadow-card", className)} {...rest} />;
}

export function Badge({ className, tone = "neutral", ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "brand" | "hot" | "mint" | "sun" }) {
  const tones = {
    neutral: "bg-surface-2 text-ink-muted border-line",
    brand: "bg-brand-500/12 text-brand-600 dark:text-brand-300 border-brand-500/20",
    hot: "bg-primary/12 text-primary border-primary/20",
    mint: "bg-mint/12 text-emerald-700 dark:text-mint border-mint/20",
    sun: "bg-sun/12 text-amber-700 dark:text-sun border-sun/25",
  };
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}
      {...rest}
    />
  );
}

export function SectionHeading({ title, subtitle, action, id, eyebrow }: { title: string; subtitle?: string; action?: ReactNode; id?: string; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        {eyebrow && <p className="type-eyebrow mb-2">{eyebrow}</p>}
        <h2 id={id} className="type-section">
          {title}
        </h2>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[15px] text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** A placeholder block with the same footprint as the content it stands in for. */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("skeleton", className)} {...rest} />;
}

/** An empty or error state: what happened, and the one thing to do next. */
export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center", className)}>
      {icon && <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-surface-2 text-ink-muted [&_svg]:size-5">{icon}</div>}
      <p className="font-display text-lg font-semibold">{title}</p>
      {body && <div className="mt-1.5 max-w-sm text-sm text-ink-muted">{body}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** One figure with its label: big number, quiet caption. Only for real data. */
export function Stat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-line bg-surface p-4", className)}>
      <p className="text-xs font-medium text-ink-faint">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-ink-muted", className)}>
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-ink placeholder:text-ink-faint",
        "outline-none transition hover:border-line-strong focus:border-brand-400 focus:bg-surface focus:ring-4 focus:ring-brand-500/15",
        className,
      )}
      {...rest}
    />
  );
});

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-center justify-between gap-4 py-2", disabled && "cursor-not-allowed opacity-60")}>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {description && <span className="block text-xs text-ink-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-surface-3")}
      >
        <span className={cn("absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform", checked && "translate-x-5")} />
      </button>
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-w-10 flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed",
            o.value === value ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avatars & tooltips
// ---------------------------------------------------------------------------

/** CSS-only tooltip; the label is also exposed to assistive tech via aria-label on the trigger. */
export function Tooltip({ label, children, side = "top" }: { label: string; children: ReactNode; side?: "top" | "bottom" }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-xs font-medium whitespace-nowrap text-bg opacity-0 shadow-lg transition",
          "group-hover/tt:opacity-100 group-focus-within/tt:opacity-100",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
        )}
      >
        {label}
      </span>
    </span>
  );
}
