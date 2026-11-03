import { memo } from "react";

/**
 * Original playing-card art for Cascade Solitaire, drawn in a 50×70 box:
 * ivory faces with proper pip layouts, double-ended J/Q/K portraits, and a
 * crimson-and-gold back with the SinverseGames "S" emblem.
 */

const RED = "#c3243a";
const BLACK = "#1c1a2b";
const GOLD = "#d9a441";
const RANK = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/** Suit shapes in a 10×10 box. 0 spades, 1 hearts, 2 diamonds, 3 clubs. */
function Suit({ suit, x, y, size, flip = false }: { suit: number; x: number; y: number; size: number; flip?: boolean }) {
  const fill = suit === 1 || suit === 2 ? RED : BLACK;
  const t = `translate(${x - size / 2} ${y - size / 2}) scale(${size / 10})${flip ? " rotate(180 5 5)" : ""}`;
  if (suit === 0) return <path transform={t} fill={fill} d="M5 0 C 6 1.6, 10 3.8, 10 6.3 C 10 8.4, 7.6 9, 6 7.6 L 6.9 10 H 3.1 L 4 7.6 C 2.4 9, 0 8.4, 0 6.3 C 0 3.8, 4 1.6, 5 0 Z" />;
  if (suit === 1) return <path transform={t} fill={fill} d="M5 9.6 C 3.6 8.2, 0 6, 0 3.1 C 0 1.2, 1.5 0, 3 0 C 4 0, 4.7 0.7, 5 1.6 C 5.3 0.7, 6 0, 7 0 C 8.5 0, 10 1.2, 10 3.1 C 10 6, 6.4 8.2, 5 9.6 Z" />;
  if (suit === 2) return <path transform={t} fill={fill} d="M5 0 C 6.2 2, 7.6 3.6, 9 5 C 7.6 6.4, 6.2 8, 5 10 C 3.8 8, 2.4 6.4, 1 5 C 2.4 3.6, 3.8 2, 5 0 Z" />;
  return (
    <g transform={t} fill={fill}>
      <circle cx="5" cy="2.6" r="2.4" />
      <circle cx="2.5" cy="6" r="2.4" />
      <circle cx="7.5" cy="6" r="2.4" />
      <path d="M4.3 5.5 L 3.4 10 H 6.6 L 5.7 5.5 Z" />
    </g>
  );
}

const PIPS: Record<number, [number, number][]> = {
  2: [[25, 14], [25, 56]],
  3: [[25, 14], [25, 35], [25, 56]],
  4: [[16, 14], [34, 14], [16, 56], [34, 56]],
  5: [[16, 14], [34, 14], [25, 35], [16, 56], [34, 56]],
  6: [[16, 14], [34, 14], [16, 35], [34, 35], [16, 56], [34, 56]],
  7: [[16, 14], [34, 14], [25, 24.5], [16, 35], [34, 35], [16, 56], [34, 56]],
  8: [[16, 14], [34, 14], [25, 24.5], [16, 35], [34, 35], [25, 45.5], [16, 56], [34, 56]],
  9: [[16, 13], [34, 13], [16, 27.5], [34, 27.5], [25, 35], [16, 42.5], [34, 42.5], [16, 57], [34, 57]],
  10: [[16, 13], [34, 13], [25, 20], [16, 27.5], [34, 27.5], [16, 42.5], [34, 42.5], [25, 50], [16, 57], [34, 57]],
};

/** Half of a court card portrait (drawn twice, the second rotated 180°). */
function CourtHalf({ rank, suit }: { rank: number; suit: number }) {
  const red = suit === 1 || suit === 2;
  const robe = red ? RED : "#2b3a7a";
  const trim = GOLD;
  return (
    <g>
      {/* Shoulders and robe */}
      <path d="M12 35 C 12 27, 18 24, 25 24 C 32 24, 38 27, 38 35 Z" fill={robe} />
      <path d="M25 24 L 21 35 M25 24 L 29 35" stroke={trim} strokeWidth="1.2" />
      <path d="M14 33 h22" stroke={trim} strokeWidth="1" strokeDasharray="1.5 1.5" />
      {/* Face */}
      <circle cx="25" cy="18" r="5.2" fill="#f5d7b8" stroke={BLACK} strokeWidth="0.6" />
      <path d="M23 18 h0.01 M27 18 h0.01" stroke={BLACK} strokeWidth="1.1" strokeLinecap="round" />
      {rank === 13 && <path d="M21.5 21 q3.5 3 7 0 q-1 4 -3.5 4 q-2.5 0 -3.5 -4z" fill="#8a5a2b" />}
      {/* Headwear: Jack's feathered cap, Queen's tiara, King's crown */}
      {rank === 11 && (
        <>
          <path d="M19.5 15.5 q5.5 -6 11 0 z" fill={robe} stroke={BLACK} strokeWidth="0.5" />
          <path d="M29 12 q5 -4 6 -1 q-3 0 -5 3" fill={trim} />
        </>
      )}
      {rank === 12 && (
        <>
          <path d="M20 14 q5 -3 10 0" stroke={trim} strokeWidth="1.6" fill="none" />
          <circle cx="25" cy="11.5" r="1.2" fill={red ? "#3fa4ff" : RED} />
          <path d="M19.6 16 q-2 6 1 9 M30.4 16 q2 6 -1 9" stroke="#6b3a1e" strokeWidth="1.4" fill="none" />
        </>
      )}
      {rank === 13 && <path d="M19.5 14.5 L 19.5 9.5 L 22 12 L 25 8.5 L 28 12 L 30.5 9.5 L 30.5 14.5 Z" fill={trim} stroke={BLACK} strokeWidth="0.5" />}
      <Suit suit={suit} x={33.5} y={29.5} size={4.5} />
    </g>
  );
}

export const CardFace = memo(function CardFace({ card }: { card: number }) {
  const rank = (card % 13) + 1;
  const suit = Math.floor(card / 13);
  const color = suit === 1 || suit === 2 ? RED : BLACK;
  return (
    <svg viewBox="0 0 50 70" className="block size-full" aria-hidden>
      <rect x="0.5" y="0.5" width="49" height="69" rx="5" fill="#fffdf6" stroke="#d8cfbd" />
      <rect x="2.5" y="2.5" width="45" height="65" rx="3.6" fill="none" stroke="#efe5d2" strokeWidth="0.6" />
      {/* Corner indices */}
      {[false, true].map((flip) => (
        <g key={String(flip)} transform={flip ? "rotate(180 25 35)" : undefined}>
          <text x="5.6" y="10.5" textAnchor="middle" fontSize={rank === 10 ? 7.2 : 8.4} fontWeight="800" fill={color} fontFamily="Georgia, 'Times New Roman', serif" letterSpacing={rank === 10 ? -0.6 : 0}>
            {RANK[rank]}
          </text>
          <Suit suit={suit} x={5.6} y={15.2} size={5} />
        </g>
      ))}
      {rank === 1 && (
        <>
          <Suit suit={suit} x={25} y={35} size={suit === 0 ? 20 : 16} />
          {suit === 0 && <circle cx="25" cy="34" r="2" fill="#fffdf6" />}
        </>
      )}
      {rank >= 2 && rank <= 10 && PIPS[rank]!.map(([x, y], i) => <Suit key={i} suit={suit} x={x} y={y} size={8.4} flip={y > 35} />)}
      {rank > 10 && (
        <g>
          <rect x="10" y="9" width="30" height="52" rx="2.5" fill={suit === 1 || suit === 2 ? "#fbe9e4" : "#e9ecf8"} stroke={color} strokeWidth="0.8" />
          <clipPath id={`court-${card}`}>
            <rect x="10" y="9" width="30" height="26" />
          </clipPath>
          <g clipPath={`url(#court-${card})`}>
            <CourtHalf rank={rank} suit={suit} />
          </g>
          <g transform="rotate(180 25 35)" clipPath={`url(#court-${card})`}>
            <CourtHalf rank={rank} suit={suit} />
          </g>
          <path d="M10 35 h30" stroke={color} strokeWidth="0.6" />
        </g>
      )}
    </svg>
  );
});

export const CardBack = memo(function CardBack() {
  return (
    <svg viewBox="0 0 50 70" className="block size-full" aria-hidden>
      <defs>
        <pattern id="sol-lattice" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#8e1b2e" />
          <path d="M0 3 h6 M3 0 v6" stroke="#b8323f" strokeWidth="0.8" />
          <circle cx="3" cy="3" r="0.9" fill={GOLD} />
        </pattern>
      </defs>
      <rect x="0.5" y="0.5" width="49" height="69" rx="5" fill="#fffdf6" stroke="#d8cfbd" />
      <rect x="3" y="3" width="44" height="64" rx="3.4" fill="url(#sol-lattice)" stroke={GOLD} strokeWidth="0.9" />
      <rect x="6" y="6" width="38" height="58" rx="2.4" fill="none" stroke={GOLD} strokeWidth="0.5" opacity="0.7" />
      <circle cx="25" cy="35" r="9" fill="#8e1b2e" stroke={GOLD} strokeWidth="1.2" />
      <text x="25" y="39.5" textAnchor="middle" fontSize="13" fontWeight="900" fill={GOLD} fontFamily="Georgia, serif">
        S
      </text>
    </svg>
  );
});
