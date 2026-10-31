"use client";

import { ArrowLeftRight, Ban } from "lucide-react";
import { COLOR_META, describeCard, type Card } from "@platform/engines/color-clash/client";
import { cn } from "@/components/ui/primitives";

const SIZES = {
  sm: { w: 44, h: 64, glyph: 16, corner: 9 },
  md: { w: 72, h: 104, glyph: 26, corner: 12 },
  lg: { w: 96, h: 138, glyph: 36, corner: 15 },
} as const;
export type CardSize = keyof typeof SIZES;

/** The four-colour hexagon emblem used on Prism (wild) cards and the card back. */
function PrismHex({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="-20 -20 40 40" aria-hidden>
      <path d="M0-18 L15.6-9 L0 0Z" fill={COLOR_META.ember.hex} />
      <path d="M15.6-9 L15.6 9 L0 0Z" fill={COLOR_META.tide.hex} />
      <path d="M15.6 9 L0 18 L0 0Z" fill={COLOR_META.grove.hex} />
      <path d="M0 18 L-15.6 9 L0 0Z" fill={COLOR_META.sun.hex} />
      <path d="M-15.6 9 L-15.6 -9 L0 0Z" fill={COLOR_META.ember.hex} opacity="0.8" />
      <path d="M-15.6 -9 L0 -18 L0 0Z" fill={COLOR_META.tide.hex} opacity="0.8" />
      <polygon points="0,-18 15.6,-9 15.6,9 0,18 -15.6,9 -15.6,-9" fill="none" stroke="#fff" strokeWidth="2.5" />
    </svg>
  );
}

function Glyph({ card, size, color }: { card: Card; size: number; color: string }) {
  switch (card.kind) {
    case "number":
      return <span style={{ fontSize: size, color }} className="font-display leading-none font-black">{card.value}</span>;
    case "block":
      return <Ban style={{ width: size, height: size, color }} strokeWidth={3} aria-hidden />;
    case "flip":
      return <ArrowLeftRight style={{ width: size, height: size, color }} strokeWidth={3} aria-hidden />;
    case "plus2":
      return <span style={{ fontSize: size * 0.85, color }} className="font-display leading-none font-black">+2</span>;
    case "prism":
      return <PrismHex size={size * 1.25} />;
    case "prism4":
      return (
        <span className="relative inline-flex items-center justify-center">
          <PrismHex size={size * 1.25} />
          <span style={{ fontSize: size * 0.55 }} className="absolute font-display font-black text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.7)]">+4</span>
        </span>
      );
  }
}

const cornerLabel = (card: Card) =>
  card.kind === "number" ? String(card.value) : card.kind === "plus2" ? "+2" : card.kind === "prism4" ? "+4" : card.kind === "block" ? "⊘" : card.kind === "flip" ? "⇄" : "◆";

export function PlayingCard({
  card,
  size = "md",
  playable,
  dimmed,
  selected,
  onClick,
  className,
  testId,
}: {
  card: Card;
  size?: CardSize;
  playable?: boolean;
  dimmed?: boolean;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  testId?: string;
}) {
  const s = SIZES[size];
  const meta = card.color ? COLOR_META[card.color] : null;
  const body = meta ? `linear-gradient(150deg, ${meta.hex} 0%, ${meta.deep} 100%)` : "linear-gradient(150deg, #2a2550 0%, #120f26 100%)";
  const inner = (
    <span
      className="relative flex size-full items-center justify-center overflow-hidden rounded-[inherit] border-[3px] border-white/95"
      style={{ background: body }}
    >
      {/* subtle diagonal sheen */}
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_35%,rgb(255_255_255/0.22)_50%,transparent_65%)]" />
      <span className="absolute top-1 left-1.5 font-display font-black text-white" style={{ fontSize: s.corner }}>
        {cornerLabel(card)}
      </span>
      <span className="absolute right-1.5 bottom-1 rotate-180 font-display font-black text-white" style={{ fontSize: s.corner }}>
        {cornerLabel(card)}
      </span>
      {/* central hexagon plate (Prism cards show the colour hex instead) */}
      {meta ? (
        <span
          className="flex items-center justify-center bg-white shadow-inner"
          style={{ width: s.w * 0.68, height: s.w * 0.68 * 1.08, clipPath: "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)" }}
        >
          <Glyph card={card} size={s.glyph} color={meta.deep} />
        </span>
      ) : (
        <Glyph card={card} size={s.glyph} color="#fff" />
      )}
    </span>
  );
  const common = cn(
    "relative inline-block shrink-0 align-top rounded-[14px] shadow-[0_6px_16px_-6px_rgb(0_0_0/0.55)] transition duration-150",
    dimmed && "opacity-45 saturate-50",
    selected && "-translate-y-3 ring-4 ring-white",
    className,
  );
  const style = { width: s.w, height: s.h };

  if (!onClick) {
    return (
      <span className={common} style={style} role="img" aria-label={describeCard(card)} data-testid={testId}>
        {inner}
      </span>
    );
  }
  // The button keeps a fixed hit area; only the inner layer lifts on hover, so
  // the card can't flicker by moving out from under the pointer.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${describeCard(card)}${playable ? ", playable" : ""}`}
      data-playable={playable ? "true" : "false"}
      data-testid={testId}
      className={cn("group relative shrink-0 rounded-[14px] outline-none", playable ? "cursor-pointer" : playable === false && "cursor-not-allowed", className)}
      style={style}
    >
      <span
        className={cn(
          "absolute inset-0 rounded-[14px] shadow-[0_6px_16px_-6px_rgb(0_0_0/0.55)] transition duration-150",
          dimmed && "opacity-45 saturate-50",
          selected && "-translate-y-3 ring-4 ring-white",
          playable && "group-hover:-translate-y-4 group-focus-visible:-translate-y-4 group-focus-visible:ring-4 group-focus-visible:ring-brand-300",
        )}
      >
        {inner}
        {playable && <span className="pointer-events-none absolute -inset-1 rounded-[17px] ring-2 ring-white/80" />}
      </span>
    </button>
  );
}

export function CardBack({ size = "md", className, count }: { size?: CardSize; className?: string; count?: number }) {
  const s = SIZES[size];
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center rounded-[14px] border-[3px] border-white/90 shadow-lg", className)} style={{ width: s.w, height: s.h, background: "repeating-linear-gradient(45deg,#2a2152 0 8px,#221a46 8px 16px)" }} aria-hidden>
      <PrismHex size={s.glyph * 1.3} />
      {count !== undefined && <span className="absolute -right-2 -bottom-2 rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-bg">{count}</span>}
    </span>
  );
}
