"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ItemId } from "@platform/engines/kitchen-rush";

/**
 * Kitchen Rush food art. Style: chunky dark-brown ink outlines, flat fills
 * with one shadow tone and one highlight (cel shading), no gradients.
 * Cookable food takes a `cook` value: 0 raw → 1 perfectly cooked → 2 burnt,
 * and its colours are interpolated so food visibly changes on the heat.
 */

export const INK = "#3a1d12";
const SW = 2.2;
const line = { stroke: INK, strokeWidth: SW, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function mix(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${x.map((v, i) => Math.round(v + (y[i]! - v) * k)).join(",")})`;
}
/** Picks a colour along raw → cooked → burnt for cook ∈ [0, 2]. */
function cooked(raw: string, done: string, burnt: string, cook: number) {
  return cook <= 1 ? mix(raw, done, cook) : mix(done, burnt, cook - 1);
}

// ---------------------------------------------------------------------------
// Single ingredients (64×64)
// ---------------------------------------------------------------------------

function Patty({ cook, marks }: { cook: number; marks: boolean }) {
  const top = cooked("#f08f9a", "#9b5a36", "#2e2622", cook);
  const side = cooked("#d8667a", "#6e3a22", "#1f1a17", cook);
  const fleck = cooked("#fbd0d6", "#b97a52", "#4a3f39", cook);
  return (
    <>
      <ellipse cx="32" cy="38" rx="24" ry="12" fill={side} {...line} />
      <ellipse cx="32" cy="34" rx="24" ry="11" fill={top} {...line} />
      {([[22, 32], [36, 29], [42, 37], [27, 38], [32, 34]] as const).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill={fleck} />
      ))}
      {marks && [20, 28, 36, 44].map((x) => <path key={x} d={`M${x - 3} 27 l6 12`} stroke={cooked("#000", "#4a2414", "#120d0b", cook)} strokeWidth="2.6" strokeLinecap="round" opacity={Math.min(1, cook)} />)}
      <path d="M16 31 q8 -6 18 -6" stroke="#fff" strokeOpacity={cook > 1.4 ? 0.08 : 0.35} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </>
  );
}

function Egg({ cook }: { cook: number }) {
  const white = cooked("#f3efe6", "#ffffff", "#5a4a3a", cook);
  const edge = cooked("#e8e0d0", "#f0d9a8", "#2a211a", cook);
  return (
    <>
      <path d="M12 34 C 8 20, 26 14, 33 18 C 46 14, 56 26, 50 38 C 46 50, 24 52, 16 44 C 12 41, 13 38, 12 34z" fill={white} {...line} />
      <path d="M14 40 C 20 48, 38 50, 48 40" stroke={edge} strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="32" cy="33" r="9" fill={cooked("#ffb81f", "#ffb81f", "#6b4a12", cook)} {...line} />
      <circle cx="29" cy="30" r="2.6" fill="#ffe7a1" opacity={cook > 1.5 ? 0.2 : 1} />
    </>
  );
}

function Fries({ cook }: { cook: number }) {
  const body = cooked("#f6e2b0", "#ffc94a", "#4a3626", cook);
  const shade = cooked("#e2c58c", "#e59a1f", "#2e2219", cook);
  return (
    <>
      {([[14, 24, -18], [22, 18, -6], [30, 16, 4], [38, 18, 12], [46, 24, 22], [26, 26, -10], [36, 26, 8]] as const).map(([x, y, r], i) => (
        <g key={i} transform={`rotate(${r} ${x + 3} ${y + 14})`}>
          <rect x={x} y={y} width="7" height="28" rx="2.5" fill={body} {...line} />
          <rect x={x + 4} y={y + 2} width="2" height="24" rx="1" fill={shade} />
        </g>
      ))}
    </>
  );
}

function FishFillet({ cook }: { cook: number }) {
  const body = cooked("#ffb39a", "#f0a73c", "#3d2b1e", cook);
  const crumb = cooked("#ffd3c4", "#c97a1c", "#1f1611", cook);
  return (
    <>
      <path d="M8 32 C 16 18, 40 16, 50 30 L 58 22 L 58 42 L 50 34 C 40 48, 16 46, 8 32z" fill={body} {...line} />
      {cook > 0.3
        ? ([[18, 30], [24, 36], [30, 27], [36, 34], [42, 29], [22, 26], [32, 40]] as const).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.8" fill={crumb} />)
        : [22, 30, 38].map((x) => <path key={x} d={`M${x} 24 q4 8 0 16`} stroke={crumb} strokeWidth="2" fill="none" />)}
      <path d="M14 28 q10 -8 24 -6" stroke="#fff" strokeOpacity="0.35" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </>
  );
}

function RicePile({ cook }: { cook: number }) {
  const grain = cooked("#efe6cf", "#ffffff", "#4c3c2c", cook);
  return (
    <>
      <path d="M8 44 C 10 26, 54 26, 56 44z" fill={cooked("#e8dcc0", "#f6f3ec", "#3a2e22", cook)} {...line} />
      {([[18, 38], [26, 34], [34, 32], [42, 35], [48, 40], [22, 42], [30, 39], [38, 40], [44, 43]] as const).map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="3" ry="1.6" fill={grain} stroke={INK} strokeOpacity="0.25" strokeWidth="0.8" transform={`rotate(${(i * 37) % 60 - 30} ${x} ${y})`} />
      ))}
    </>
  );
}

function NoodleNest({ cook }: { cook: number }) {
  const n = cooked("#f3d27c", "#ffd866", "#4a3a22", cook);
  return (
    <>
      <ellipse cx="32" cy="38" rx="22" ry="12" fill={cooked("#e6bd5a", "#f2c447", "#2e2418", cook)} {...line} />
      {[30, 35, 40].map((y, i) => (
        <path key={y} d={`M14 ${y} q4 -6 8 0 t8 0 t8 0 t8 0 t6 0`} stroke={n} strokeWidth="2.6" fill="none" strokeLinecap="round" opacity={1 - i * 0.1} />
      ))}
    </>
  );
}

const SPRITES: Record<ItemId, (cook: number) => ReactNode> = {
  bun: () => (
    <>
      <path d="M8 36 C 8 18, 56 18, 56 36z" fill="#eaa04a" {...line} />
      <path d="M14 26 q12 -8 28 -6" stroke="#ffd48c" strokeWidth="3" fill="none" strokeLinecap="round" />
      {([[22, 27], [32, 24], [42, 27], [27, 31], [38, 31]] as const).map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="1.9" ry="1.1" fill="#fff3d1" transform={`rotate(${i * 25 - 30} ${x} ${y})`} />
      ))}
      <rect x="8" y="38" width="48" height="10" rx="4" fill="#d9883a" {...line} />
      <path d="M12 44 h40" stroke="#b46a25" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  cheese: () => (
    <>
      <path d="M10 40 L46 18 L54 40z" fill="#ffd13f" {...line} />
      <path d="M10 40 h44 v6 h-44z" fill="#f2ae16" {...line} />
      <circle cx="38" cy="33" r="3" fill="#f2ae16" />
      <circle cx="46" cy="28" r="2" fill="#f2ae16" />
      <circle cx="30" cy="38" r="1.6" fill="#f2ae16" />
    </>
  ),
  "patty-raw": (cook) => <Patty cook={cook} marks={false} />,
  "patty-cooked": (cook) => <Patty cook={Math.max(1, cook)} marks />,
  lettuce: () => (
    <>
      <path d="M32 10 C 52 12, 56 36, 48 48 C 40 56, 22 56, 14 46 C 6 34, 12 12, 32 10z" fill="#6fcf5f" {...line} />
      <path d="M32 14 C 26 26, 26 40, 32 52 M32 24 l-9 -5 M32 32 l10 -6 M32 40 l-9 -3" stroke="#3e9e3c" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M18 22 q4 -6 10 -8" stroke="#b5f0a2" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </>
  ),
  "lettuce-chopped": () => (
    <>
      {([[10, 30], [26, 22], [36, 34], [16, 42], [32, 44]] as const).map(([x, y], i) => (
        <path key={i} d={`M${x} ${y} q7 -9 16 -2 q2 8 -6 11 q-8 3 -10 -9z`} fill={i % 2 ? "#6fcf5f" : "#8ee07a"} {...line} />
      ))}
    </>
  ),
  tomato: () => (
    <>
      <circle cx="32" cy="35" r="19" fill="#ec4a3f" {...line} />
      <path d="M32 17 l-7 -4 M32 17 l7 -4 M32 17 v-6" stroke="#3e9e3c" strokeWidth="3.2" strokeLinecap="round" />
      <ellipse cx="24" cy="28" rx="4.5" ry="3" fill="#ff9a8a" />
      <path d="M22 50 q10 4 20 -2" stroke="#b72e26" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </>
  ),
  "tomato-chopped": () => (
    <>
      {([[20, 32], [42, 30], [31, 44]] as const).map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="11" fill="#ec4a3f" {...line} />
          <circle cx={x} cy={y} r="7" fill="#ff7f6e" />
          {[-1, 1].map((d) => (
            <ellipse key={d} cx={x + d * 3} cy={y + d} rx="1.6" ry="1" fill="#ffe2a0" />
          ))}
        </g>
      ))}
    </>
  ),
  cucumber: () => (
    <g transform="rotate(-24 32 32)">
      <rect x="8" y="24" width="48" height="18" rx="9" fill="#3a9a4c" {...line} />
      <path d="M14 29 h34" stroke="#79cf84" strokeWidth="3" strokeLinecap="round" />
      {[18, 28, 38, 48].map((x) => (
        <circle key={x} cx={x} cy="37" r="1.1" fill="#2a7238" />
      ))}
    </g>
  ),
  "cucumber-chopped": () => (
    <>
      {([[20, 30], [42, 32], [30, 45]] as const).map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="10" fill="#3a9a4c" {...line} />
          <circle cx={x} cy={y} r="7.4" fill="#d6f5c9" />
          {[0, 1, 2, 3, 4].map((k) => (
            <ellipse key={k} cx={x + Math.cos(k * 1.26) * 3.6} cy={y + Math.sin(k * 1.26) * 3.6} rx="1.2" ry="0.7" fill="#98d68b" />
          ))}
        </g>
      ))}
    </>
  ),
  onion: () => (
    <>
      <path d="M32 12 C 50 20, 54 44, 32 52 C 10 44, 14 20, 32 12z" fill="#b065cf" {...line} />
      <path d="M32 16 C 40 24, 40 42, 32 50 M32 16 C 24 24, 24 42, 32 50" stroke="#dcb0ee" strokeWidth="2" fill="none" />
      <path d="M32 12 l-2 -5 M32 12 l3 -5" stroke="#7a4f2a" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  "onion-chopped": () => (
    <>
      {([[20, 32], [42, 30], [31, 44]] as const).map(([x, y], i) => (
        <g key={i} fill="none" strokeLinecap="round">
          <circle cx={x} cy={y} r="10" stroke={INK} strokeWidth="5.4" />
          <circle cx={x} cy={y} r="10" stroke="#c88ae0" strokeWidth="3" />
          <circle cx={x} cy={y} r="5" stroke="#efdaf7" strokeWidth="2.2" />
        </g>
      ))}
    </>
  ),
  potato: () => (
    <>
      <ellipse cx="32" cy="34" rx="22" ry="16" fill="#c9954f" transform="rotate(-12 32 34)" {...line} />
      <path d="M18 28 q8 -8 20 -8" stroke="#e8c088" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      {([[22, 36], [36, 28], [42, 40], [28, 44]] as const).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill="#8f6430" />
      ))}
    </>
  ),
  "potato-chopped": (cook) => (
    <>
      {([[10, 36, -24], [24, 30, 8], [38, 36, 26], [22, 44, -6]] as const).map(([x, y, r], i) => (
        <path key={i} d={`M${x} ${y} l18 -5 l-4 10z`} fill={cooked("#f6e2b0", "#ffc94a", "#4a3626", cook)} {...line} transform={`rotate(${r} ${x} ${y})`} />
      ))}
    </>
  ),
  fries: (cook) => <Fries cook={Math.max(1, cook)} />,
  fish: (cook) => <FishFillet cook={cook} />,
  "fish-fried": (cook) => <FishFillet cook={Math.max(1, cook)} />,
  egg: () => (
    <>
      <ellipse cx="32" cy="34" rx="15" ry="19" fill="#fbf4e6" {...line} />
      <ellipse cx="26" cy="26" rx="4" ry="6" fill="#fff" />
      <path d="M22 46 q10 6 20 0" stroke="#e2d3b4" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </>
  ),
  "egg-fried": (cook) => <Egg cook={Math.max(1, cook)} />,
  rice: () => (
    <>
      <path d="M14 54 l4 -32 h28 l4 32z" fill="#efe3c8" {...line} />
      <path d="M18 22 q14 -10 28 0" fill="#e2d2ad" {...line} />
      <path d="M22 34 h20" stroke="#c9b48a" strokeWidth="2" strokeLinecap="round" />
      {([[26, 42], [32, 44], [38, 42], [29, 48], [35, 48]] as const).map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="2" ry="1.1" fill="#fff" stroke="#c9b48a" strokeWidth="0.6" />
      ))}
    </>
  ),
  "rice-cooked": (cook) => <RicePile cook={Math.max(1, cook)} />,
  noodles: () => (
    <>
      <rect x="10" y="20" width="44" height="28" rx="5" fill="#f3d27c" {...line} />
      {[27, 34, 41].map((y) => (
        <path key={y} d={`M14 ${y} q3 -4 6 0 t6 0 t6 0 t6 0 t6 0 t6 0`} stroke="#d9a93a" strokeWidth="2" fill="none" />
      ))}
    </>
  ),
  "noodles-cooked": (cook) => <NoodleNest cook={Math.max(1, cook)} />,
  burnt: () => (
    <>
      <ellipse cx="32" cy="40" rx="22" ry="11" fill="#1f1a17" {...line} />
      <path d="M12 38 C 14 26, 50 24, 52 38 C 46 34, 18 34, 12 38z" fill="#3b322c" {...line} />
      {([[22, 36], [34, 33], [42, 38]] as const).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2" fill="#ff6a2a" opacity="0.7" />
      ))}
    </>
  ),
};

/** One ingredient. `cook` (0–2) only affects food that cooks. */
export function FoodSprite({ item, size = 44, cook = 0, className }: { item: ItemId; size?: number; cook?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden overflow="visible">
      {SPRITES[item](cook)}
    </svg>
  );
}

/** The same art as an SVG group, for use inside larger scenes. */
export function FoodGroup({ item, cook = 0, x, y, scale = 1 }: { item: ItemId; cook?: number; x: number; y: number; scale?: number }) {
  return <g transform={`translate(${x - 32 * scale} ${y - 32 * scale}) scale(${scale})`}>{SPRITES[item](cook)}</g>;
}

// ---------------------------------------------------------------------------
// Plated dishes (120×96): a burger is stacked layer by layer, bowls get toppings
// ---------------------------------------------------------------------------

const BURGER_ORDER = ["bun-bottom", "patty-cooked", "cheese", "lettuce-chopped", "tomato-chopped", "bun-top"] as const;
type Layer = (typeof BURGER_ORDER)[number];
const LAYER_H: Record<Layer, number> = { "bun-bottom": 11, "patty-cooked": 10, cheese: 4, "lettuce-chopped": 5, "tomato-chopped": 5, "bun-top": 22 };

function burgerLayer(layer: Layer, y: number, cx: number): ReactNode {
  const x0 = cx - 28;
  switch (layer) {
    case "bun-bottom":
      return (
        <>
          <path d={`M${x0 + 2} ${y - 11} h52 q2 0 2 3 v3 q0 5 -6 5 h-44 q-6 0 -6 -5 v-3 q0 -3 2 -3z`} fill="#e19448" {...line} />
          <path d={`M${x0 + 6} ${y - 4} h44`} stroke="#b46a25" strokeWidth="2" strokeLinecap="round" />
        </>
      );
    case "patty-cooked":
      return (
        <>
          <rect x={x0 - 2} y={y - 10} width="60" height="10" rx="5" fill="#7a4126" {...line} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <circle key={i} cx={x0 + 6 + i * 9} cy={y - 5} r="1.3" fill="#a8683f" />
          ))}
        </>
      );
    case "cheese":
      return <path d={`M${x0 - 3} ${y - 4} h62 l-6 4 l-3 7 l-3 -7 h-18 l-4 9 l-4 -9 h-14 l-3 6 l-3 -6z`} fill="#ffcf3f" {...line} />;
    case "lettuce-chopped":
      return <path d={`M${x0 - 4} ${y - 2} q4 -5 8 0 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0 q4 -5 8 0 v3 h-64z`} fill="#6fcf5f" {...line} />;
    case "tomato-chopped":
      return (
        <>
          {[-14, 14].map((d) => (
            <g key={d}>
              <ellipse cx={cx + d} cy={y - 2.5} rx="14" ry="3.6" fill="#ec4a3f" {...line} />
              <ellipse cx={cx + d} cy={y - 3} rx="9" ry="1.6" fill="#ff8a76" />
            </g>
          ))}
        </>
      );
    case "bun-top":
      return (
        <>
          <path d={`M${x0} ${y} C ${x0} ${y - 30}, ${x0 + 56} ${y - 30}, ${x0 + 56} ${y} z`} fill="#eaa04a" {...line} />
          <path d={`M${x0 + 8} ${y - 12} q14 -10 30 -8`} stroke="#ffd48c" strokeWidth="3" fill="none" strokeLinecap="round" />
          {([[12, 14], [22, 18], [32, 17], [42, 14], [18, 9], [36, 9]] as const).map(([dx, dy], i) => (
            <ellipse key={i} cx={x0 + dx + 2} cy={y - dy} rx="1.8" ry="1" fill="#fff3d1" transform={`rotate(${i * 30 - 40} ${x0 + dx + 2} ${y - dy})`} />
          ))}
        </>
      );
  }
}

function Burger({ parts, cx, base, animate }: { parts: ItemId[]; cx: number; base: number; animate: boolean }) {
  const has = new Set<string>(parts);
  const layers = BURGER_ORDER.filter((l) => (l === "bun-bottom" || l === "bun-top" ? has.has("bun") : has.has(l)));
  let y = base;
  const placed = layers.map((l) => {
    const at = y;
    y -= LAYER_H[l] - (l === "bun-top" ? 0 : 1);
    return { l, at };
  });
  return (
    <AnimatePresence initial={false}>
      {placed.map(({ l, at }) => (
        <motion.g
          key={l}
          initial={animate ? { y: -26, opacity: 0, scaleY: 1.2 } : false}
          animate={{ y: 0, opacity: 1, scaleY: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 22 }}
          style={{ transformOrigin: `${cx}px ${at}px`, transformBox: "view-box" }}
        >
          {burgerLayer(l, at, cx)}
        </motion.g>
      ))}
    </AnimatePresence>
  );
}

function Bowl({ base, parts, animate }: { base: "rice-cooked" | "noodles-cooked" | "salad"; parts: ItemId[]; animate: boolean }) {
  const has = (i: ItemId) => parts.includes(i);
  const body = base === "rice-cooked" ? "#4a7fd6" : base === "noodles-cooked" ? "#d84a36" : "#b5763f";
  const rim = base === "rice-cooked" ? "#7aa6ee" : base === "noodles-cooked" ? "#f07a62" : "#d4955a";
  const pop = (key: string, node: ReactNode) => (
    <motion.g key={key} initial={animate ? { y: -18, opacity: 0 } : false} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 480, damping: 20 }}>
      {node}
    </motion.g>
  );
  return (
    <>
      <path d="M26 56 h68 q-3 26 -34 26 q-31 0 -34 -26z" fill={body} {...line} />
      <path d="M36 74 q24 8 48 0" stroke={rim} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      {base === "rice-cooked" && <path d="M30 57 C 34 40, 86 40, 90 57z" fill="#fbf9f3" {...line} />}
      {base === "noodles-cooked" && (
        <>
          <path d="M30 57 C 34 44, 86 44, 90 57z" fill="#f2c447" {...line} />
          {[48, 52].map((y) => (
            <path key={y} d={`M36 ${y} q4 -5 8 0 t8 0 t8 0 t8 0 t8 0 t6 0`} stroke="#ffe08a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          ))}
          <path d="M78 22 l-10 32 M86 24 l-12 30" stroke="#8a5a2b" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {base === "salad" && has("lettuce-chopped") && pop("lettuce", ([[34, 50], [46, 44], [60, 42], [74, 45], [84, 51]] as const).map(([x, y], i) => <path key={i} d={`M${x - 9} ${y + 6} q4 -12 14 -8 q6 6 -2 12z`} fill={i % 2 ? "#6fcf5f" : "#8ee07a"} {...line} />))}
      {base === "salad" && !has("lettuce-chopped") && <path d="M30 57 C 34 50, 86 50, 90 57z" fill="#8a5a2b" opacity="0.4" />}
      {has("tomato-chopped") && pop("tomato", ([[44, 49], [66, 47]] as const).map(([x, y]) => <g key={x}><circle cx={x} cy={y} r="6" fill="#ec4a3f" {...line} /><circle cx={x} cy={y} r="3.4" fill="#ff8a76" /></g>))}
      {has("cucumber-chopped") && pop("cucumber", ([[56, 52], [78, 50], [38, 53]] as const).filter((_, i) => base === "salad" || i < 2).map(([x, y]) => <g key={x}><circle cx={x + (base === "salad" ? 0 : 20)} cy={y} r="5.4" fill="#3a9a4c" {...line} /><circle cx={x + (base === "salad" ? 0 : 20)} cy={y} r="3.6" fill="#d6f5c9" /></g>))}
      {has("onion-chopped") && pop("onion", ([[40, 49], [48, 52]] as const).map(([x, y]) => <g key={x} fill="none"><circle cx={x} cy={y} r="4.6" stroke={INK} strokeWidth="4" /><circle cx={x} cy={y} r="4.6" stroke="#c88ae0" strokeWidth="2" /></g>))}
      {has("fish-fried") && pop("fish", <g transform="translate(34 30) scale(0.5)"><FishFillet cook={1} /></g>)}
      {has("egg-fried") && pop("egg", <g transform="translate(50 22) scale(0.55)"><Egg cook={1} /></g>)}
    </>
  );
}

function FriesCarton({ cx, base }: { cx: number; base: number }) {
  return (
    <g>
      {[-9, -4, 1, 6, 10].map((dx, i) => (
        <rect key={dx} x={cx + dx - 2.5} y={base - 34 - (i % 2) * 4} width="5" height="22" rx="2" fill="#ffc94a" {...line} transform={`rotate(${dx * 0.9} ${cx} ${base})`} />
      ))}
      <path d={`M${cx - 14} ${base - 20} h28 l-4 20 h-20z`} fill="#e23d3d" {...line} />
      <path d={`M${cx - 8} ${base - 12} q8 5 16 0`} stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </g>
  );
}

/** Food on a plate, arranged the way the finished dish is served. */
export function Dish({ parts, plate = true, animate = true, className, size }: { parts: readonly ItemId[]; plate?: boolean; animate?: boolean; className?: string; size?: number }) {
  const list = [...parts] as ItemId[];
  const has = (i: ItemId) => list.includes(i);
  const burger = has("bun") || has("patty-cooked") || has("cheese");
  const bowlBase = has("rice-cooked") ? "rice-cooked" : has("noodles-cooked") ? "noodles-cooked" : null;
  const salad = !burger && !bowlBase && (has("lettuce-chopped") || has("tomato-chopped") || has("cucumber-chopped"));
  const fries = has("fries");
  const looseFish = has("fish-fried") && !bowlBase;
  const looseEgg = has("egg-fried") && !bowlBase;
  const looseOnion = has("onion-chopped") && !bowlBase;
  const side = fries && (burger || bowlBase || salad || looseFish);
  const mainX = side ? 50 : 60;
  return (
    <svg viewBox="0 0 120 96" width={size} height={size ? (size * 96) / 120 : undefined} className={className} aria-hidden overflow="visible">
      {plate && (
        <>
          <ellipse cx="60" cy="78" rx="56" ry="15" fill="#c9cede" {...line} />
          <ellipse cx="60" cy="75" rx="56" ry="14" fill="#fbfbff" {...line} />
          <ellipse cx="60" cy="75" rx="38" ry="8.5" fill="#eef0f8" />
        </>
      )}
      {burger && (
        <g transform={side ? "translate(-10 0)" : undefined}>
          <Burger parts={list} cx={60} base={78} animate={animate} />
        </g>
      )}
      {bowlBase && <g transform={side ? "translate(-12 -2) scale(0.95)" : undefined}><Bowl base={bowlBase} parts={list} animate={animate} /></g>}
      {salad && <g transform={side ? "translate(-12 -2) scale(0.95)" : undefined}><Bowl base="salad" parts={list} animate={animate} /></g>}
      {looseFish && !burger && <FoodGroup item="fish-fried" cook={1} x={mainX} y={66} scale={0.9} />}
      {looseEgg && !burger && <FoodGroup item="egg-fried" cook={1} x={mainX + (looseFish ? 12 : 0)} y={70} scale={0.7} />}
      {looseOnion && !burger && <FoodGroup item="onion-chopped" x={mainX - 10} y={70} scale={0.6} />}
      {burger && (looseFish || looseEgg || looseOnion) && <FoodGroup item={looseFish ? "fish-fried" : looseEgg ? "egg-fried" : "onion-chopped"} cook={1} x={22} y={70} scale={0.5} />}
      {fries && <FriesCarton cx={side ? 92 : 60} base={80} />}
    </svg>
  );
}
