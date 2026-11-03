import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export const cn = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-[#ff4f8b] text-white shadow-[0_4px_0_#a3194f] hover:-translate-y-px hover:brightness-110 active:translate-y-0.5 active:shadow-[0_1px_0_#a3194f] disabled:shadow-none",
  secondary: "bg-surface-2 text-ink hover:bg-surface-3 border border-line",
  outline: "border border-line text-ink hover:bg-surface-2",
  ghost: "text-ink-muted hover:text-ink hover:bg-surface-2",
  danger: "bg-danger text-white hover:brightness-110",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5 rounded-xl",
  md: "h-11 px-5 text-[15px] gap-2 rounded-xl",
  lg: "h-14 px-7 text-base gap-2.5 rounded-2xl",
};

export const buttonClass = (variant: Variant = "primary", size: Size = "md", extra?: string) =>
  cn(
    "inline-flex select-none items-center justify-center font-semibold whitespace-nowrap transition duration-150",
    "disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
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
    brand: "bg-brand-500/15 text-brand-600 dark:text-brand-300 border-brand-500/25",
    hot: "bg-hot/15 text-hot border-hot/25",
    mint: "bg-mint/15 text-emerald-700 dark:text-mint border-mint/25",
    sun: "bg-sun/15 text-amber-700 dark:text-sun border-sun/30",
  };
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}
      {...rest}
    />
  );
}

export function SectionHeading({ title, subtitle, action, id }: { title: string; subtitle?: string; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 id={id} className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-ink-muted">{subtitle}</p>}
      </div>
      {action}
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
        "outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/20",
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
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition", checked ? "bg-brand-500" : "bg-surface-3")}
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

export function Avatar({ name, color, size = 40, className, ring }: { name: string; color: string; size?: number; className?: string; ring?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-[#17142b]", ring && "ring-4 ring-brand-400/70", className)}
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}

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
