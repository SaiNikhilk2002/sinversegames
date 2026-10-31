import { brand, type GameId } from "@platform/shared";
import { cn } from "./ui/primitives";

/** Placeholder platform mark: a rounded tile with a play-wave glyph. The wordmark comes from brand config. */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c5cff" />
          <stop offset="0.55" stopColor="#c04dff" />
          <stop offset="1" stopColor="#ff4f8b" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill="url(#logo-g)" />
      <path d="M15 12.5v15l12-7.5z" fill="#fff" />
      <path d="M8 29c3-2.6 5.6-2.6 8.6 0s5.6 2.6 8.6 0 5.6-2.6 8.6 0" stroke="#ffd36e" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-xl font-extrabold tracking-tight">{brand.name}</span>
    </span>
  );
}

/** Original game artwork, drawn as SVG so it scales crisply and needs no image assets. */
export function GameArt({ gameId, className }: { gameId: GameId; className?: string }) {
  if (gameId === "color-clash") return <ColorClashArt className={className} />;
  return <DoodleDuelArt className={className} />;
}

function ColorClashArt({ className }: { className?: string }) {
  const cards = [
    { color: "#3d8bff", rotate: -22, x: 70 },
    { color: "#2ec27e", rotate: -7, x: 100 },
    { color: "#ffc23d", rotate: 8, x: 130 },
    { color: "#ff4f5e", rotate: 22, x: 160 },
  ];
  return (
    <svg viewBox="0 0 320 200" className={className} role="img" aria-label="Color Clash artwork: a fan of colourful cards">
      <defs>
        <linearGradient id="cc-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5f6d" />
          <stop offset="1" stopColor="#ffc371" />
        </linearGradient>
        <radialGradient id="cc-glow" cx="0.5" cy="0.6" r="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="200" fill="url(#cc-bg)" />
      <circle cx="160" cy="125" r="120" fill="url(#cc-glow)" />
      {[...Array(7)].map((_, i) => (
        <circle key={i} cx={30 + i * 45} cy={i % 2 ? 30 : 175} r={i % 3 ? 4 : 7} fill="#fff" opacity="0.35" />
      ))}
      {cards.map((c, i) => (
        <g key={i} transform={`translate(${c.x + 15} 150) rotate(${c.rotate}) translate(-36 -112)`}>
          <rect width="72" height="104" rx="12" fill="#fff" />
          <rect x="5" y="5" width="62" height="94" rx="9" fill={c.color} />
          <polygon points="36,26 54,37 54,63 36,74 18,63 18,37" fill="#fff" opacity="0.92" />
          {i === 3 ? (
            <text x="36" y="58" textAnchor="middle" fontFamily="system-ui" fontWeight="900" fontSize="20" fill={c.color}>+2</text>
          ) : (
            <text x="36" y="59" textAnchor="middle" fontFamily="system-ui" fontWeight="900" fontSize="24" fill={c.color}>{[7, 3, 9][i]}</text>
          )}
        </g>
      ))}
      <g transform="translate(250 58) rotate(14)">
        <rect x="-26" y="-36" width="52" height="72" rx="9" fill="#17142b" />
        <polygon points="0,-18 15,-9 15,9 0,18 -15,9 -15,-9" fill="none" stroke="#fff" strokeWidth="3" />
        <path d="M0-18 L15-9 L0 0Z" fill="#ff4f5e" />
        <path d="M15-9 L15 9 L0 0Z" fill="#3d8bff" />
        <path d="M15 9 L0 18 L0 0Z" fill="#2ec27e" />
        <path d="M0 18 L-15 9 L0 0Z" fill="#ffc23d" />
      </g>
    </svg>
  );
}

function DoodleDuelArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 200" className={className} role="img" aria-label="Doodle Duel artwork: a sketchpad with a pencil and guesses">
      <defs>
        <linearGradient id="dd-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6a5cff" />
          <stop offset="1" stopColor="#20d3c2" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill="url(#dd-bg)" />
      {[...Array(6)].map((_, i) => (
        <path key={i} d={`M${i * 60 - 20} 200 q30 -30 60 0`} stroke="#fff" strokeOpacity="0.15" strokeWidth="10" fill="none" />
      ))}
      <g transform="translate(58 30) rotate(-4)">
        <rect width="150" height="120" rx="14" fill="#fff" />
        <path d="M28 82 C 40 40, 70 40, 76 70 S 112 96, 124 52" stroke="#7048e8" strokeWidth="6" fill="none" strokeLinecap="round" />
        <circle cx="52" cy="40" r="12" fill="#fcc419" />
        <path d="M24 102 h100" stroke="#e5e2f1" strokeWidth="4" strokeLinecap="round" />
      </g>
      <g transform="translate(200 40) rotate(38)">
        <rect x="0" y="0" width="22" height="96" rx="4" fill="#ffb23d" />
        <rect x="0" y="0" width="22" height="16" rx="4" fill="#ff4f8b" />
        <polygon points="0,96 22,96 11,120" fill="#ffe2b8" />
        <polygon points="7,110 15,110 11,120" fill="#17142b" />
      </g>
      <g transform="translate(212 118)">
        <rect width="88" height="40" rx="14" fill="#17142b" />
        <path d="M16 40 l-6 12 l16 -12z" fill="#17142b" />
        <text x="44" y="26" textAnchor="middle" fontFamily="system-ui" fontWeight="800" fontSize="16" fill="#2fd6a8">S _ _ _ ?</text>
      </g>
    </svg>
  );
}
