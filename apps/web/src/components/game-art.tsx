import type { ReactNode } from "react";

/** Original thumbnail artwork for the Phase 2 games, in the same 320×200 SVG style as the first two. */

function ArtFrame({ id, from, to, label, className, children }: { id: string; from: string; to: string; label: string; className?: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 320 200" className={className} role="img" aria-label={label}>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${id}-bg)`} />
      {children}
    </svg>
  );
}

export function KitchenRushArt({ className }: { className?: string }) {
  return (
    <ArtFrame id="kr" from="#ff8a3d" to="#ffd25e" label="Kitchen Rush artwork: a sizzling burger and a chef hat" className={className}>
      <rect y="140" width="320" height="60" fill="#c99a62" />
      <rect y="136" width="320" height="8" fill="#9b6b3d" />
      {[30, 90, 150, 210, 270].map((x) => (
        <rect key={x} x={x} y="150" width="30" height="40" rx="6" fill="#d8a86c" />
      ))}
      <g transform="translate(108 52)">
        <path d="M0 50 C 0 14, 104 14, 104 50z" fill="#f2a541" />
        {[20, 40, 60, 80].map((x, i) => (
          <ellipse key={x} cx={x} cy={i % 2 ? 30 : 26} rx="4" ry="2.4" fill="#fff4d6" />
        ))}
        <path d="M-4 52 q14 10 28 0 t28 0 t28 0 t28 0" fill="#5cc96b" />
        <rect x="-2" y="56" width="108" height="10" rx="4" fill="#ffd23f" />
        <rect x="2" y="64" width="100" height="16" rx="8" fill="#6a3720" />
        <rect x="0" y="80" width="104" height="14" rx="6" fill="#d9822b" />
      </g>
      <g transform="translate(238 30)">
        <path d="M6 40 C -8 36, -4 10, 14 14 C 16 -4, 46 -4, 48 14 C 66 10, 70 36, 56 40z" fill="#fff" />
        <rect x="8" y="38" width="46" height="16" rx="4" fill="#fff" stroke="#f0e6d6" strokeWidth="2" />
      </g>
      {(
        [
          [70, 50],
          [86, 36],
          [252, 106],
        ] as const
      ).map(([x, y], i) => (
        <path key={i} d={`M${x} ${y} q-6 -8 0 -16 q6 -8 0 -16`} stroke="#fff" strokeOpacity="0.7" strokeWidth="5" fill="none" strokeLinecap="round" />
      ))}
    </ArtFrame>
  );
}

export function TokenTrailArt({ className }: { className?: string }) {
  const colors = ["#ff5d73", "#3fa4ff", "#ffc83d", "#2fc28a"];
  return (
    <ArtFrame id="tt" from="#2fb36b" to="#3fa4ff" label="Token Trail artwork: a cross-shaped board with coloured tokens and a die" className={className}>
      <g transform="translate(94 14) rotate(8 86 86)">
        <rect width="172" height="172" rx="22" fill="#fffaf0" />
        {colors.map((c, i) => (
          <rect key={c} x={i % 2 ? 108 : 6} y={i < 2 ? 6 : 108} width="58" height="58" rx="14" fill={c} />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect x={72} y={8 + i * 12} width="10" height="10" rx="2" fill="#ece6da" />
            <rect x={90} y={8 + i * 12} width="10" height="10" rx="2" fill={i ? "#3fa4ff" : "#ece6da"} />
            <rect x={8 + i * 12} y={72} width="10" height="10" rx="2" fill="#ece6da" />
            <rect x={8 + i * 12} y={90} width="10" height="10" rx="2" fill={i ? "#ff5d73" : "#ece6da"} />
          </g>
        ))}
        <polygon points="66,66 106,66 86,86" fill="#3fa4ff" />
        <polygon points="66,66 66,106 86,86" fill="#ff5d73" />
        <polygon points="106,66 106,106 86,86" fill="#ffc83d" />
        <polygon points="66,106 106,106 86,86" fill="#2fc28a" />
      </g>
      <g transform="translate(38 112) rotate(-14)">
        <rect width="54" height="54" rx="12" fill="#fff" />
        {(
          [
            [14, 14],
            [40, 14],
            [27, 27],
            [14, 40],
            [40, 40],
          ] as const
        ).map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="5" fill="#17142b" />
        ))}
      </g>
      {colors.map((c, i) => (
        <circle key={c} cx={40 + i * 18} cy={56 - (i % 2) * 10} r="10" fill={c} stroke="#fff" strokeWidth="3" />
      ))}
    </ArtFrame>
  );
}

export function SolitaireArt({ className }: { className?: string }) {
  const card = (x: number, y: number, r: number, label: string, red: boolean) => (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <rect width="62" height="88" rx="8" fill="#fff" />
      <text x="8" y="20" fontFamily="system-ui" fontWeight="800" fontSize="15" fill={red ? "#e0314b" : "#17142b"}>
        {label}
      </text>
      <text x="31" y="60" textAnchor="middle" fontFamily="system-ui" fontSize="30" fill={red ? "#e0314b" : "#17142b"}>
        {label.slice(-1)}
      </text>
    </g>
  );
  return (
    <ArtFrame id="cs" from="#0f8a5f" to="#3fd0a4" label="Cascade Solitaire artwork: a cascading run of playing cards" className={className}>
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={24 + i * 54} y="24" width="44" height="62" rx="6" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="2" strokeDasharray="6 5" />
      ))}
      {card(70, 60, -6, "K♠", false)}
      {card(98, 78, -2, "Q♥", true)}
      {card(126, 96, 2, "J♣", false)}
      {card(154, 104, 6, "10♦", true)}
      <g transform="translate(236 40) rotate(10)">
        <rect width="62" height="88" rx="8" fill="#7c5cff" />
        <rect x="6" y="6" width="50" height="76" rx="6" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="2" />
      </g>
    </ArtFrame>
  );
}

export function MahjongArt({ className }: { className?: string }) {
  const tile = (x: number, y: number, glyph: string, color: string) => (
    <g transform={`translate(${x} ${y})`}>
      <rect x="5" y="6" width="44" height="58" rx="7" fill="#c9b48f" />
      <rect width="44" height="58" rx="7" fill="#fffdf7" stroke="#e5d8bf" />
      <text x="22" y="40" textAnchor="middle" fontFamily="system-ui" fontWeight="800" fontSize="26" fill={color}>
        {glyph}
      </text>
    </g>
  );
  return (
    <ArtFrame id="mg" from="#d95f8d" to="#ffb7a1" label="Mahjong Garden artwork: stacked tiles among blossoms" className={className}>
      {(
        [
          [30, 40],
          [280, 150],
          [250, 30],
          [60, 170],
        ] as const
      ).map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`} opacity="0.6">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy="-9" rx="6" ry="10" fill="#fff" transform={`rotate(${a})`} />
          ))}
          <circle r="4" fill="#ffd23f" />
        </g>
      ))}
      {tile(86, 70, "中", "#e0314b")}
      {tile(132, 70, "發", "#1f9d55")}
      {tile(178, 70, "東", "#17142b")}
      {tile(109, 52, "春", "#e8590c")}
      {tile(155, 52, "梅", "#d6336c")}
      {tile(132, 34, "九", "#17142b")}
    </ArtFrame>
  );
}

export function BumperBlitzArt({ className }: { className?: string }) {
  const pods = [
    { x: 120, y: 112, c: "#ffd23f" },
    { x: 168, y: 104, c: "#3fa4ff" },
    { x: 238, y: 132, c: "#2fd6a8" },
  ];
  return (
    <ArtFrame id="bb" from="#7b2ff7" to="#f107a3" label="Bumper Blitz artwork: bumper pods colliding on a glowing arena" className={className}>
      <ellipse cx="160" cy="112" rx="132" ry="76" fill="#3a1690" />
      <ellipse cx="160" cy="108" rx="132" ry="76" fill="#5b2bd8" stroke="#ff4f8b" strokeWidth="6" />
      {[60, 100].map((r) => (
        <ellipse key={r} cx="160" cy="108" rx={r * 1.2} ry={r * 0.68} fill="none" stroke="#fff" strokeOpacity="0.1" strokeWidth="3" />
      ))}
      <circle cx="160" cy="60" r="12" fill="#20d3c2" stroke="#c9fff7" strokeWidth="3" />
      {pods.map((p, i) => (
        <g key={i}>
          <ellipse cx={p.x} cy={p.y + 8} rx="24" ry="9" fill="#000" opacity="0.25" />
          <circle cx={p.x} cy={p.y} r="22" fill={p.c} stroke="#fff" strokeWidth="4" />
          <circle cx={p.x + 8} cy={p.y - 6} r="5" fill="#fff" />
        </g>
      ))}
      <path d="M140 92 l8 -14 M146 120 l14 6 M142 104 l-14 -6" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <path d="M262 46 l-10 18 h10 l-6 16 l16 -22 h-10 l6 -12z" fill="#ffd23f" />
    </ArtFrame>
  );
}
