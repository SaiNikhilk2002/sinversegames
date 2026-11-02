import type { ReactNode } from "react";
import type { CustomerTypeId, ItemId } from "@platform/engines/kitchen-rush";

/** Original food illustrations, drawn in a 48×48 box. */
const ICONS: Record<ItemId, ReactNode> = {
  bun: (
    <>
      <path d="M8 27c0-10 7-16 16-16s16 6 16 16z" fill="#f2a541" />
      <rect x="8" y="27" width="32" height="7" rx="3.5" fill="#d9822b" />
      {([[17, 18], [24, 15], [31, 19], [21, 23], [28, 23]] as const).map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="1.6" ry="1" fill="#fff4d6" />
      ))}
    </>
  ),
  cheese: (
    <>
      <path d="M8 31 L38 15 L40 31z" fill="#ffd23f" />
      <path d="M8 31h32v5H8z" fill="#f4b400" />
      <circle cx="28" cy="26" r="2.4" fill="#f4b400" />
      <circle cx="34" cy="22" r="1.6" fill="#f4b400" />
    </>
  ),
  "patty-raw": (
    <>
      <ellipse cx="24" cy="26" rx="16" ry="9" fill="#e86a7a" />
      <ellipse cx="24" cy="24" rx="16" ry="8" fill="#f28b97" />
      {([[16, 23], [26, 21], [31, 26], [21, 27]] as const).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.5" fill="#fbd0d5" />
      ))}
    </>
  ),
  "patty-cooked": (
    <>
      <ellipse cx="24" cy="26" rx="16" ry="9" fill="#5a2e1a" />
      <ellipse cx="24" cy="24" rx="16" ry="8" fill="#7a4126" />
      {[14, 20, 26, 32].map((x) => (
        <path key={x} d={`M${x} 19 l4 9`} stroke="#3d1d10" strokeWidth="2" strokeLinecap="round" />
      ))}
    </>
  ),
  lettuce: (
    <>
      <circle cx="24" cy="25" r="14" fill="#5cc96b" />
      <path d="M24 12 C 18 20, 18 30, 24 38 M24 20 l-6 -3 M24 26 l7 -4 M24 31 l-6 -2" stroke="#2f9944" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  "lettuce-chopped": (
    <>
      {([[14, 22], [26, 18], [33, 27], [20, 31], [28, 33]] as const).map(([x, y], i) => (
        <path key={i} d={`M${x} ${y} q5 -6 10 0 q-5 6 -10 0z`} fill={i % 2 ? "#5cc96b" : "#7fdc89"} />
      ))}
    </>
  ),
  tomato: (
    <>
      <circle cx="24" cy="26" r="14" fill="#ef4b4b" />
      <path d="M24 13 l-5 -3 M24 13 l5 -3 M24 13 l0 -4" stroke="#2f9944" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="19" cy="21" rx="3" ry="2" fill="#ff9a9a" />
    </>
  ),
  "tomato-chopped": (
    <>
      {([[16, 24], [30, 22], [23, 32]] as const).map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="7" fill="#ef4b4b" />
          <circle cx={x} cy={y} r="4.5" fill="#ff8a7a" />
          <circle cx={x - 1.5} cy={y} r="1" fill="#ffe0a0" />
          <circle cx={x + 1.5} cy={y + 1} r="1" fill="#ffe0a0" />
        </g>
      ))}
    </>
  ),
  cucumber: (
    <>
      <rect x="9" y="18" width="30" height="13" rx="6.5" fill="#3c9a4f" transform="rotate(-20 24 24)" />
      <rect x="11" y="20" width="26" height="4" rx="2" fill="#6ccb7d" transform="rotate(-20 24 24)" />
    </>
  ),
  "cucumber-chopped": (
    <>
      {([[16, 22], [30, 24], [22, 33]] as const).map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="7" fill="#3c9a4f" />
          <circle cx={x} cy={y} r="5.4" fill="#c9f2c2" />
          <circle cx={x} cy={y} r="1.6" fill="#8fd486" />
        </g>
      ))}
    </>
  ),
  onion: (
    <>
      <path d="M24 10 C 36 16, 38 34, 24 38 C 10 34, 12 16, 24 10z" fill="#a259c4" />
      <path d="M24 14 C 30 20, 30 32, 24 36 M24 14 C 18 20, 18 32, 24 36" stroke="#d4a6ea" strokeWidth="1.6" fill="none" />
    </>
  ),
  "onion-chopped": (
    <>
      {([[16, 24], [30, 22], [24, 32]] as const).map(([x, y], i) => (
        <g key={i} fill="none" stroke="#b97ad6" strokeWidth="2.4">
          <circle cx={x} cy={y} r="6.5" />
          <circle cx={x} cy={y} r="3.5" stroke="#e2c4f0" />
        </g>
      ))}
    </>
  ),
  potato: (
    <>
      <ellipse cx="24" cy="25" rx="15" ry="11" fill="#c8954f" transform="rotate(-12 24 25)" />
      {([[17, 22], [28, 20], [30, 29], [20, 29]] as const).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.3" fill="#8f6430" />
      ))}
    </>
  ),
  "potato-chopped": (
    <>
      {([[12, 26, -20], [22, 22, 10], [32, 27, 30], [20, 33, -5]] as const).map(([x, y, r], i) => (
        <path key={i} d={`M${x} ${y} l12 -3 l-3 7z`} fill="#f2d39b" stroke="#c8954f" strokeWidth="1.5" transform={`rotate(${r} ${x} ${y})`} />
      ))}
    </>
  ),
  fries: (
    <>
      {[15, 19, 23, 27, 31].map((x, i) => (
        <rect key={x} x={x} y={10 + (i % 2) * 3} width="3.5" height="18" rx="1.5" fill="#ffd25e" />
      ))}
      <path d="M11 22 h26 l-3 16 h-20z" fill="#ef4b4b" />
      <path d="M17 28 q7 5 14 0" stroke="#fff" strokeWidth="2" fill="none" />
    </>
  ),
  fish: (
    <>
      <path d="M8 24 C 16 12, 32 12, 38 24 C 32 36, 16 36, 8 24z" fill="#ff9f6b" />
      <path d="M38 24 l6 -7 v14z" fill="#ff9f6b" />
      <circle cx="15" cy="22" r="2" fill="#17142b" />
      <path d="M22 18 q4 6 0 12 M28 18 q4 6 0 12" stroke="#ffd0b3" strokeWidth="1.6" fill="none" />
    </>
  ),
  "fish-fried": (
    <>
      <path d="M8 24 C 16 12, 32 12, 38 24 C 32 36, 16 36, 8 24z" fill="#e6a23c" />
      <path d="M38 24 l6 -7 v14z" fill="#e6a23c" />
      {([[16, 20], [22, 27], [28, 19], [31, 27], [18, 28]] as const).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill="#c97f1a" />
      ))}
      <path d="M10 33 l28 0" stroke="#ffe0a0" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  egg: (
    <>
      <ellipse cx="24" cy="25" rx="11" ry="14" fill="#fff7ea" stroke="#e8dcc4" strokeWidth="1.5" />
      <ellipse cx="20" cy="19" rx="3" ry="4" fill="#fff" />
    </>
  ),
  "egg-fried": (
    <>
      <path d="M10 24 C 8 14, 22 10, 28 13 C 38 12, 42 22, 37 30 C 34 38, 18 40, 12 33 C 9 30, 10 27, 10 24z" fill="#fff" stroke="#efe6d6" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="7" fill="#ffc22e" />
      <circle cx="22" cy="22" r="2" fill="#ffe08a" />
    </>
  ),
  rice: (
    <>
      <path d="M10 30 l4 -16 h20 l4 16z" fill="#f2e3c6" stroke="#d8c39a" strokeWidth="1.5" />
      <path d="M16 18 h16 M15 23 h18" stroke="#d8c39a" strokeWidth="1.5" />
      <text x="24" y="28" fontSize="7" textAnchor="middle" fill="#a8844a" fontWeight="700">RICE</text>
    </>
  ),
  "rice-cooked": (
    <>
      <path d="M8 26 h32 a16 12 0 0 1 -32 0z" fill="#4a7fd6" />
      <path d="M10 26 C 12 16, 36 16, 38 26z" fill="#fff" />
      {([[16, 22], [22, 20], [28, 21], [32, 23], [20, 24], [26, 24]] as const).map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="1.6" ry="1" fill="#e8e4dc" />
      ))}
    </>
  ),
  noodles: (
    <>
      <rect x="10" y="14" width="28" height="20" rx="4" fill="#f5d27a" />
      <path d="M13 19 q3 -3 6 0 t6 0 t6 0 t6 0 M13 25 q3 -3 6 0 t6 0 t6 0 t6 0 M13 31 q3 -3 6 0 t6 0 t6 0 t6 0" stroke="#d9a93a" strokeWidth="1.6" fill="none" />
    </>
  ),
  "noodles-cooked": (
    <>
      <path d="M8 26 h32 a16 12 0 0 1 -32 0z" fill="#e8503a" />
      <path d="M12 26 q3 -8 6 0 q3 -8 6 0 q3 -8 6 0 q3 -8 6 0" stroke="#ffd25e" strokeWidth="2.4" fill="none" />
      <path d="M30 8 l-4 18 M34 9 l-5 17" stroke="#8a5a2b" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  burnt: (
    <>
      <ellipse cx="24" cy="28" rx="15" ry="8" fill="#2a2420" />
      <ellipse cx="24" cy="26" rx="14" ry="7" fill="#3d332c" />
      <path d="M18 18 q-3 -4 0 -8 M24 17 q-3 -4 0 -8 M30 18 q-3 -4 0 -8" stroke="#9b9590" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
};

export function FoodIcon({ item, size = 40, className }: { item: ItemId; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} aria-hidden>
      {ICONS[item]}
    </svg>
  );
}

export function PlateIcon({ size = 64 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <ellipse cx="32" cy="34" rx="30" ry="22" fill="#d9dce8" />
      <ellipse cx="32" cy="32" rx="30" ry="22" fill="#fff" />
      <ellipse cx="32" cy="32" rx="21" ry="15" fill="#f2f3f8" />
    </svg>
  );
}

const CUSTOMER_LOOK: Record<CustomerTypeId, { skin: string; shirt: string; hat?: string }> = {
  regular: { skin: "#f6c7a0", shirt: "#6a8cff" },
  hurried: { skin: "#e0a77f", shirt: "#ff8a3d" },
  vip: { skin: "#c98b62", shirt: "#7c5cff", hat: "#ffd23f" },
  critic: { skin: "#f0d0b5", shirt: "#2b2a3d", hat: "#2b2a3d" },
};

/** Original customer characters; mood shifts as patience runs out. */
export function CustomerFace({ type, mood, seed }: { type: CustomerTypeId; mood: "happy" | "ok" | "upset"; seed: number }) {
  const look = CUSTOMER_LOOK[type];
  const hair = ["#3b2a20", "#8a4b2b", "#d9a441", "#1f1f2e", "#c4523a"][seed % 5];
  const mouth = mood === "happy" ? "M24 35 q6 6 12 0" : mood === "ok" ? "M25 36 h10" : "M24 38 q6 -6 12 0";
  return (
    <svg viewBox="0 0 60 64" className="size-16" aria-hidden>
      <path d="M8 64 C 8 48, 52 48, 52 64z" fill={look.shirt} />
      <circle cx="30" cy="28" r="17" fill={look.skin} />
      <path d={seed % 2 ? "M13 26 C 13 10, 47 10, 47 26 C 40 18, 22 18, 13 26z" : "M14 24 C 16 8, 46 8, 46 24 L 40 18 L 33 22 L 26 17 L 19 22z"} fill={hair} />
      {look.hat && type === "vip" && <path d="M16 14 l4 -10 l6 6 l4 -8 l4 8 l6 -6 l4 10z" fill={look.hat} />}
      {look.hat && type === "critic" && (
        <>
          <rect x="10" y="10" width="40" height="4" rx="2" fill={look.hat} />
          <rect x="18" y="0" width="24" height="12" rx="3" fill={look.hat} />
        </>
      )}
      <circle cx="24" cy="28" r="2.2" fill="#17142b" />
      <circle cx="36" cy="28" r="2.2" fill="#17142b" />
      {type === "critic" && <path d="M19 27 h10 M31 27 h10 M29 27 h2" stroke="#17142b" strokeWidth="1.6" />}
      <path d={mouth} stroke="#17142b" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      {mood === "upset" && <path d="M44 14 l4 -4 M47 18 l5 -2" stroke="#ff4f5e" strokeWidth="2.4" strokeLinecap="round" />}
    </svg>
  );
}
