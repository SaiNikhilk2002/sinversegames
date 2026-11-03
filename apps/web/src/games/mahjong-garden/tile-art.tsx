import { memo } from "react";

/**
 * Mahjong Garden tile faces in a 40×52 box: coin dots, bamboo with nodes
 * (and a small bird on the 1), brush-style characters and winds, the three
 * dragons, and painted flower and season tiles.
 */

const JADE = "#1f8a6a";
const CRIMSON = "#c3243a";
const NAVY = "#23407a";
const INK = "#1c1a2b";

const DOT_POS: [number, number][][] = [
  [[20, 26]],
  [[20, 15], [20, 37]],
  [[11, 13], [20, 26], [29, 39]],
  [[12, 15], [28, 15], [12, 37], [28, 37]],
  [[12, 13], [28, 13], [20, 26], [12, 39], [28, 39]],
  [[13, 12], [27, 12], [13, 26], [27, 26], [13, 40], [27, 40]],
  [[11, 10], [20, 15], [29, 20], [13, 30], [27, 30], [13, 41], [27, 41]],
  [[13, 9], [27, 9], [13, 20], [27, 20], [13, 31], [27, 31], [13, 42], [27, 42]],
  [[10, 12], [20, 12], [30, 12], [10, 26], [20, 26], [30, 26], [10, 40], [20, 40], [30, 40]],
];

const NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const WINDS = ["東", "南", "西", "北"];
const FLOWERS = ["梅", "蘭", "菊", "竹"];
const SEASONS = ["春", "夏", "秋", "冬"];
const SERIF = "'Noto Serif SC', 'Songti SC', 'SimSun', 'Hiragino Mincho ProN', serif";

function Coin({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={color} />
      <circle cx={x} cy={y} r={r * 0.68} fill="#fffdf6" />
      <circle cx={x} cy={y} r={r * 0.42} fill={color} />
      <circle cx={x - r * 0.15} cy={y - r * 0.15} r={r * 0.14} fill="#fffdf6" opacity="0.8" />
    </g>
  );
}

function Stalk({ x, y, h, color }: { x: number; y: number; h: number; color: string }) {
  return (
    <g>
      <rect x={x - 2.6} y={y - h / 2} width="5.2" height={h} rx="2.6" fill={color} />
      <rect x={x - 3.2} y={y - 0.9} width="6.4" height="1.8" rx="0.9" fill="#0f5a3e" />
      <rect x={x - 1} y={y - h / 2 + 1.5} width="1.2" height={h - 3} rx="0.6" fill="#ffffff" opacity="0.35" />
    </g>
  );
}

function Bird() {
  return (
    <g>
      <path d="M8 34 C 10 22, 22 16, 30 20 C 34 22, 34 28, 30 30 C 26 34, 16 36, 8 34 Z" fill={JADE} />
      <path d="M14 30 C 18 24, 26 22, 30 24" stroke="#7fd3b4" strokeWidth="1.6" fill="none" />
      <circle cx="28" cy="23.5" r="1.4" fill={INK} />
      <path d="M32 24 l4 1 l-4 1.5 z" fill="#e8a33d" />
      <path d="M8 34 l-3 6 M10 35 l-1 6" stroke={CRIMSON} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 38 v6 M18 37 v7" stroke={INK} strokeWidth="1.2" />
    </g>
  );
}

function Glyph({ text, color, size = 22, y = 32 }: { text: string; color: string; size?: number; y?: number }) {
  return (
    <text x="20" y={y} textAnchor="middle" fontSize={size} fontWeight="700" fill={color} fontFamily={SERIF}>
      {text}
    </text>
  );
}

function Flower({ i }: { i: number }) {
  if (i === 0)
    // Plum blossom
    return (
      <g transform="translate(20 32)">
        <path d="M-14 12 C -6 4, 2 4, 12 -8" stroke="#6b3f22" strokeWidth="1.6" fill="none" />
        {[0, 1, 2, 3, 4].map((k) => (
          <circle key={k} cx={Math.cos((k / 5) * 6.283) * 4.2} cy={Math.sin((k / 5) * 6.283) * 4.2} r="3.4" fill="#f28aa8" />
        ))}
        <circle r="2" fill="#ffd166" />
      </g>
    );
  if (i === 1)
    // Orchid
    return (
      <g transform="translate(20 33)">
        <path d="M-10 12 C -4 0, 0 -2, 2 -12 M2 12 C 2 2, 6 -2, 12 -6" stroke={JADE} strokeWidth="1.6" fill="none" />
        <path d="M2 -12 C -4 -16, -6 -8, 0 -8 C 6 -8, 8 -16, 2 -12 Z" fill="#a76fd1" />
        <circle cx="1" cy="-9" r="1.4" fill="#ffd166" />
      </g>
    );
  if (i === 2)
    // Chrysanthemum
    return (
      <g transform="translate(20 32)">
        {Array.from({ length: 12 }, (_, k) => (
          <ellipse key={k} cx="0" cy="-5.5" rx="1.8" ry="5" fill="#f0b429" transform={`rotate(${k * 30})`} />
        ))}
        <circle r="3" fill="#d9822b" />
      </g>
    );
  // Bamboo sprig
  return (
    <g transform="translate(20 32)">
      <path d="M-2 14 V -12" stroke={JADE} strokeWidth="2.6" />
      <path d="M-2 0 C 6 -6, 10 -4, 13 -9 C 8 -10, 2 -6, -2 0 Z M-2 6 C -10 2, -12 4, -14 -1 C -8 -2, -4 2, -2 6 Z" fill="#3fae7d" />
    </g>
  );
}

function Season({ i }: { i: number }) {
  if (i === 0)
    // Spring sprout
    return (
      <g transform="translate(20 34)">
        <path d="M0 10 V -4" stroke={JADE} strokeWidth="2" />
        <path d="M0 -2 C -8 -4, -10 -10, -8 -12 C -2 -12, 0 -6, 0 -2 Z M0 -4 C 6 -8, 10 -8, 11 -12 C 5 -13, 1 -10, 0 -4 Z" fill="#5cc96b" />
        <ellipse cx="0" cy="11" rx="9" ry="2.4" fill="#8a5a2b" />
      </g>
    );
  if (i === 1)
    // Summer sun
    return (
      <g transform="translate(20 32)">
        {Array.from({ length: 8 }, (_, k) => (
          <path key={k} d="M0 -12 L 2 -8 L -2 -8 Z" fill="#f08c00" transform={`rotate(${k * 45})`} />
        ))}
        <circle r="6.5" fill="#ffb81f" />
      </g>
    );
  if (i === 2)
    // Autumn maple leaf
    return (
      <path
        transform="translate(20 32) scale(0.95)"
        d="M0 -13 L 3 -6 L 9 -9 L 7 -2 L 13 0 L 6 3 L 8 9 L 1 6 L 0 13 L -1 6 L -8 9 L -6 3 L -13 0 L -7 -2 L -9 -9 L -3 -6 Z"
        fill="#e8590c"
      />
    );
  // Winter snowflake
  return (
    <g transform="translate(20 32)" stroke="#3b82c4" strokeWidth="1.8" strokeLinecap="round">
      {[0, 60, 120].map((r) => (
        <g key={r} transform={`rotate(${r})`}>
          <path d="M0 -12 V 12 M-3 -9 L 0 -6 L 3 -9 M-3 9 L 0 6 L 3 9" fill="none" />
        </g>
      ))}
    </g>
  );
}

export const TileFace = memo(function TileFace({ kind }: { kind: number }) {
  let body: React.ReactNode;
  if (kind < 9) {
    const n = kind;
    body = DOT_POS[n]!.map(([x, y], i) => <Coin key={i} x={x} y={y} r={n === 0 ? 11 : n > 6 ? 4.4 : 5.4} color={n === 0 ? CRIMSON : i % 3 === 0 ? NAVY : i % 3 === 1 ? CRIMSON : JADE} />);
  } else if (kind < 18) {
    const n = kind - 9 + 1;
    if (n === 1) body = <Bird />;
    else {
      const cols = n <= 3 ? n : 3;
      const rows = Math.ceil(n / cols);
      body = Array.from({ length: n }, (_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const inRow = Math.min(cols, n - r * cols);
        const x = 20 + (c - (inRow - 1) / 2) * 11;
        const y = 26 + (r - (rows - 1) / 2) * (40 / rows);
        return <Stalk key={i} x={x} y={y} h={40 / rows - 3} color={(i + r) % 2 ? JADE : "#2fb37f"} />;
      });
    }
  } else if (kind < 27) {
    body = (
      <>
        <Glyph text={NUMERALS[kind - 18]!} color={INK} size={17} y={22} />
        <Glyph text="萬" color={CRIMSON} size={17} y={44} />
      </>
    );
  } else if (kind < 31) body = <Glyph text={WINDS[kind - 27]!} color={NAVY} size={24} y={34} />;
  else if (kind === 31)
    body = (
      <>
        <rect x="7" y="8" width="26" height="36" rx="3" fill="none" stroke={CRIMSON} strokeWidth="1.2" />
        <Glyph text="中" color={CRIMSON} size={24} y={34} />
      </>
    );
  else if (kind === 32) body = <Glyph text="發" color={JADE} size={24} y={34} />;
  else if (kind === 33)
    body = (
      <>
        <rect x="8" y="9" width="24" height="34" rx="3" fill="none" stroke={NAVY} strokeWidth="2.4" />
        <rect x="12" y="13" width="16" height="26" rx="2" fill="none" stroke={NAVY} strokeWidth="1" />
      </>
    );
  else if (kind < 38)
    body = (
      <>
        <Flower i={kind - 34} />
        <Glyph text={FLOWERS[kind - 34]!} color={CRIMSON} size={9} y={12} />
      </>
    );
  else
    body = (
      <>
        <Season i={kind - 38} />
        <Glyph text={SEASONS[kind - 38]!} color={NAVY} size={9} y={12} />
      </>
    );
  return (
    <svg viewBox="0 0 40 52" className="block size-full" aria-hidden>
      {body}
    </svg>
  );
});
