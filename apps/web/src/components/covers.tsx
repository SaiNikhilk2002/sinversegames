"use client";

import type { GameId } from "@platform/shared";
import { CardBack, CardFace } from "@/games/cascade-solitaire/card-art";
import { CustomerFigure } from "@/games/kitchen-rush/art/customer";
import { Dish } from "@/games/kitchen-rush/art/food";
import { StationArt } from "@/games/kitchen-rush/art/stations";
import { TileFace } from "@/games/mahjong-garden/tile-art";

/**
 * Game cover art (320×200). Each cover is built from the game's own in-game
 * art and carries a wordmark styled after that game's world, so every game is
 * recognisable from its thumbnail alone. No gradients or <defs>, so any number
 * of covers can share a page.
 */

type CoverProps = { className?: string };
const W = 320;
const H = 200;

function Frame({ label, className, bg, children }: CoverProps & { label: string; bg: string; children: React.ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={label}>
      <rect width={W} height={H} fill={bg} />
      {children}
    </svg>
  );
}

/** An embedded art piece placed in cover coordinates. */
function Place({ x, y, w, h, children, rotate = 0 }: { x: number; y: number; w: number; h: number; children: React.ReactNode; rotate?: number }) {
  return (
    <g transform={rotate ? `rotate(${rotate} ${x + w / 2} ${y + h / 2})` : undefined}>
      <svg x={x} y={y} width={w} height={h} overflow="visible">
        {children}
      </svg>
    </g>
  );
}

const display = "var(--font-outfit), ui-sans-serif, system-ui, sans-serif";

function KitchenRushCover({ className }: CoverProps) {
  return (
    <Frame label="Kitchen Rush cover: a diner counter with a happy customer and a burger" className={className} bg="#f4e3c6">
      {Array.from({ length: 14 }, (_, c) => Array.from({ length: 6 }, (_, r) => <circle key={`${c}-${r}`} cx={12 + c * 24} cy={12 + r * 24} r="2.2" fill="#ecd3ab" />))}
      <rect x="196" y="18" width="104" height="70" rx="8" fill="#3a1d12" />
      <rect x="202" y="24" width="92" height="58" rx="5" fill="#ffb36b" />
      <circle cx="248" cy="62" r="15" fill="#ffe08a" />
      <rect x="202" y="64" width="92" height="18" fill="#6a4c93" opacity="0.55" />
      <path d="M248 24 v58 M202 54 h92" stroke="#3a1d12" strokeWidth="5" />
      <rect x="0" y="124" width={W} height="76" fill="#2e8c8a" />
      <rect x="0" y="120" width={W} height="6" fill="#3a1d12" />
      <Place x={14} y={30} w={96} h={124}>
        <CustomerFigure type="vip" seed={4} mood="excited" />
      </Place>
      <Place x={104} y={58} w={82} h={95}>
        <CustomerFigure type="regular" seed={9} mood="happy" />
      </Place>
      <rect x="0" y="148" width={W} height="52" fill="#a8693b" />
      <rect x="0" y="146" width={W} height="5" fill="#3a1d12" />
      <Place x={168} y={92} w={150} h={112}>
        <StationArt type="grill" item="patty-raw" state="working" progress={0.75} flipped />
      </Place>
      <Place x={84} y={110} w={110} h={88}>
        <Dish parts={["bun", "patty-cooked", "cheese", "lettuce-chopped", "tomato-chopped"]} animate={false} className="size-full" />
      </Place>
      <g transform="translate(14 158) rotate(-3)">
        <rect width="150" height="34" rx="8" fill="#e0533c" stroke="#3a1d12" strokeWidth="3" />
        <text x="75" y="24" textAnchor="middle" fontFamily={display} fontWeight="900" fontSize="21" fill="#fffaf0" letterSpacing="0.5">
          KITCHEN RUSH
        </text>
      </g>
    </Frame>
  );
}

function BumperBlitzCover({ className }: CoverProps) {
  const car = (x: number, y: number, a: number, color: string) => (
    <g transform={`translate(${x} ${y}) rotate(${a})`}>
      <ellipse cx="4" cy="7" rx="34" ry="28" fill="rgb(0 0 0 / 0.45)" />
      <rect x="-34" y="-27" width="68" height="54" rx="24" fill="#15121f" stroke="#3c3652" strokeWidth="3" />
      <rect x="-27" y="-20" width="54" height="40" rx="17" fill={color} />
      <rect x="-27" y="-20" width="20" height="40" rx="12" fill="rgb(0 0 0 / 0.2)" />
      <ellipse cx="8" cy="-9" rx="14" ry="4" fill="rgb(255 255 255 / 0.35)" />
      <circle cx="-5" cy="0" r="10" fill="#f4f2ff" />
      <circle cx="24" cy="-11" r="3" fill="#fff6c8" />
      <circle cx="24" cy="11" r="3" fill="#fff6c8" />
    </g>
  );
  return (
    <Frame label="Bumper Blitz cover: bumper cars colliding in a neon arena" className={className} bg="#0b0620">
      {Array.from({ length: 40 }, (_, i) => (
        <circle key={i} cx={(i * 83) % W} cy={(i * 47) % H} r={(i % 3) * 0.5 + 0.6} fill={i % 4 ? "#ffbe6e" : "#ff50a0"} opacity="0.55" />
      ))}
      <ellipse cx="160" cy="118" rx="190" ry="120" fill="#2a2440" />
      {[30, 18, 6].map((w, i) => (
        <ellipse key={w} cx="160" cy="118" rx="190" ry="120" fill="none" stroke="#ff4f8b" strokeWidth={w} opacity={[0.08, 0.18, 0.9][i]} />
      ))}
      <ellipse cx="160" cy="118" rx="70" ry="44" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="5" strokeDasharray="20 16" />
      <circle cx="78" cy="70" r="16" fill="#1b1333" stroke="#7a6cff" strokeWidth="6" />
      <circle cx="78" cy="70" r="8" fill="#ff4f8b" />
      {car(118, 118, 20, "#3d8bff")}
      {car(196, 104, 200, "#ffcf3d")}
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return <path key={i} d={`M${157 + Math.cos(a) * 8} ${111 + Math.sin(a) * 8} l${Math.cos(a) * 18} ${Math.sin(a) * 18}`} stroke={i % 2 ? "#fff3b0" : "#ff9d3d"} strokeWidth="3" strokeLinecap="round" />;
      })}
      <circle cx="157" cy="111" r="30" fill="none" stroke="#fff" strokeWidth="3" opacity="0.6" />
      {car(262, 160, 240, "#ff5d73")}
      <text x="20" y="44" fontFamily={display} fontWeight="900" fontSize="34" fontStyle="italic" fill="#ff4f8b" opacity="0.5" transform="translate(2 2)">
        BUMPER BLITZ
      </text>
      <text x="20" y="44" fontFamily={display} fontWeight="900" fontSize="34" fontStyle="italic" fill="#fff" stroke="#ff4f8b" strokeWidth="1.5">
        BUMPER BLITZ
      </text>
    </Frame>
  );
}

function TokenTrailCover({ className }: CoverProps) {
  const seat = ["#ff5d73", "#3fa4ff", "#ffc83d", "#2fc28a"];
  const deep = ["#c2304a", "#1f6fc4", "#c78f00", "#16825a"];
  const pawn = (x: number, y: number, i: number, s = 1.6) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="9" rx="15" ry="6" fill="rgb(0 0 0 / 0.35)" />
      <ellipse cx="0" cy="5" rx="15" ry="8" fill={deep[i]} stroke="#2b1a10" strokeWidth="2" />
      <path d="M-9 4 C -9 -8, 9 -8, 9 4 z" fill={seat[i]} stroke="#2b1a10" strokeWidth="2" />
      <circle cx="0" cy="-11" r="8" fill={seat[i]} stroke="#2b1a10" strokeWidth="2" />
      <circle cx="-2.6" cy="-13.5" r="2.8" fill="#fff" opacity="0.75" />
    </g>
  );
  return (
    <Frame label="Token Trail cover: pawns racing on a wooden board with a die" className={className} bg="#2a1a12">
      <g transform="rotate(-8 160 100)">
        <rect x="30" y="-30" width="270" height="270" rx="22" fill="#6b3f22" stroke="#2b1a10" strokeWidth="4" />
        <rect x="44" y="-16" width="242" height="242" rx="12" fill="#f3e6cc" />
        {Array.from({ length: 6 }, (_, i) => (
          <g key={i}>
            <rect x={56 + i * 36} y="74" width="32" height="32" rx="6" fill={i === 1 ? "#ffd3da" : "#fffaf0"} stroke="#2b1a10" strokeOpacity="0.35" strokeWidth="1.5" />
            <rect x={56 + i * 36} y="110" width="32" height="32" rx="6" fill={i > 0 ? "#ff5d73" : "#fffaf0"} stroke="#2b1a10" strokeOpacity="0.45" strokeWidth="1.5" />
          </g>
        ))}
        <rect x="44" y="-16" width="96" height="84" rx="14" fill="#3fa4ff" stroke="#2b1a10" strokeWidth="3" />
        <rect x="58" y="-2" width="68" height="56" rx="10" fill="#2f5d48" />
        <path transform="translate(108 90) scale(0.9)" d="M0,-13 L3.8,-4.2 13,-4 5.8,2.4 8,12 0,6.6 -8,12 -5.8,2.4 -13,-4 -3.8,-4.2Z" fill="#ff5d73" stroke="#2b1a10" strokeWidth="1.6" />
      </g>
      {pawn(138, 92, 0)}
      {pawn(200, 108, 1)}
      {pawn(92, 40, 1, 1.2)}
      <g transform="translate(232 36) rotate(16)">
        <rect x="0" y="0" width="54" height="54" rx="11" fill="#fffdf7" stroke="#2b1a10" strokeWidth="3" />
        {[[14, 14], [40, 14], [27, 27], [14, 40], [40, 40]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="5" fill="#22161f" />
        ))}
      </g>
      <g transform="translate(16 152)">
        <rect width="190" height="38" rx="10" fill="#4a2a17" stroke="#2b1a10" strokeWidth="3" />
        <text x="95" y="27" textAnchor="middle" fontFamily={display} fontWeight="900" fontSize="24" fill="#f3e6cc" letterSpacing="1">
          TOKEN TRAIL
        </text>
      </g>
    </Frame>
  );
}

function SolitaireCover({ className }: CoverProps) {
  return (
    <Frame label="Cascade Solitaire cover: a cascade of cards on green felt" className={className} bg="#1f6b4a">
      {Array.from({ length: 20 }, (_, c) => Array.from({ length: 13 }, (_, r) => <circle key={`${c}-${r}`} cx={c * 16 + 8} cy={r * 16 + 8} r="0.9" fill="rgb(0 0 0 / 0.15)" />))}
      <rect x="4" y="4" width="312" height="192" rx="16" fill="none" stroke="#4a2a17" strokeWidth="8" />
      {[12, 25, 38, 51].map((card, i) => (
        <Place key={card} x={150 + i * 24} y={24 + i * 22} w={60} h={84} rotate={-4 + i * 5}>
          <CardFace card={card} />
        </Place>
      ))}
      <Place x={30} y={40} w={60} h={84} rotate={-10}>
        <CardBack />
      </Place>
      <Place x={54} y={34} w={60} h={84} rotate={4}>
        <CardFace card={0} />
      </Place>
      <text x="22" y="162" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="26" fill="#f2d48a">
        Cascade
      </text>
      <text x="22" y="186" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="20" fill="#fffdf6" letterSpacing="3">
        SOLITAIRE
      </text>
    </Frame>
  );
}

function MahjongCover({ className }: CoverProps) {
  const tile = (x: number, y: number, kind: number, lift = 0) => (
    <g key={`${x}-${y}`}>
      <rect x={x + 5} y={y + 7 - lift} width="44" height="58" rx="7" fill="#1d6b54" />
      <rect x={x + 3} y={y + 4 - lift} width="44" height="58" rx="7" fill="#2f8f72" />
      <rect x={x} y={y - lift} width="44" height="58" rx="7" fill="#fbf6ea" stroke="#e9dcc2" />
      <Place x={x + 2} y={y + 3 - lift} w={40} h={52}>
        <TileFace kind={kind} />
      </Place>
    </g>
  );
  return (
    <Frame label="Mahjong Garden cover: jade tiles under a dusk sky" className={className} bg="#8c4f7a">
      <rect width={W} height="70" fill="#3b2a5c" />
      <rect y="70" width={W} height="50" fill="#6e3e6e" />
      <rect y="120" width={W} height="80" fill="#e89a7a" opacity="0.5" />
      <circle cx="262" cy="52" r="26" fill="#fff1d6" />
      <path d="M0 150 C 80 110, 160 140, 240 112 C 280 100, 300 110, 320 104 V 200 H 0 Z" fill="#4a3561" />
      <path d="M0 176 C 100 150, 220 170, 320 152 V 200 H 0 Z" fill="#33244a" />
      <g fill="#241a36" transform="translate(276 92) scale(0.55)">
        <path d="M-30 80 h60 v-30 h-60z M-38 50 h76 l-10 -14 h-56z M-24 36 h48 v-22 h-48z M-32 14 h64 l-10 -14 h-44z M-16 0 h32 v-20 h-32z M-24 -20 h48 l-24 -22z" />
      </g>
      <path d="M320 0 C 280 18, 250 16, 214 34" stroke="#3a2418" strokeWidth="4" fill="none" />
      {[[296, 10], [262, 22], [236, 30]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          {[0, 1, 2, 3, 4].map((k) => (
            <circle key={k} cx={Math.cos((k / 5) * 6.283) * 4} cy={Math.sin((k / 5) * 6.283) * 4} r="3.6" fill="#f6a5c0" />
          ))}
        </g>
      ))}
      {tile(60, 74, 31)}
      {tile(106, 74, 34)}
      {tile(152, 74, 9)}
      {tile(83, 44, 4, 2)}
      {tile(129, 44, 32, 2)}
      {tile(198, 82, 38)}
      {[[40, 60], [230, 140], [180, 30], [300, 120]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="4" ry="3" fill="#f6a5c0" transform={`rotate(${i * 40} ${x} ${y})`} />
      ))}
      <text x="18" y="178" fontFamily="'Noto Serif SC', Georgia, serif" fontWeight="700" fontSize="27" fill="#fff6ea">
        Mahjong Garden
      </text>
    </Frame>
  );
}

function DoodleDuelCover({ className }: CoverProps) {
  return (
    <Frame label="Doodle Duel cover: a sketchbook with a doodled house and a guess" className={className} bg="#8a5a3b">
      <g transform="rotate(-4 160 100)">
        <rect x="46" y="16" width="230" height="168" rx="6" fill="#fffdf8" />
        {Array.from({ length: 6 }, (_, i) => (
          <path key={i} d={`M52 ${48 + i * 24} h218`} stroke="#9cc0e8" strokeWidth="1" opacity="0.6" />
        ))}
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={60 + i * 21.5} y="8" width="7" height="18" rx="3.5" fill="#c9c7d3" stroke="#8d8a99" strokeWidth="1.5" />
        ))}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M108 140 V 96 H 188 V 140 Z" stroke="#17142b" strokeWidth="4" />
          <path d="M98 98 L 148 58 L 198 98" stroke="#e8343f" strokeWidth="4" />
          <path d="M138 140 V 116 H 158 V 140" stroke="#17142b" strokeWidth="4" />
          <circle cx="226" cy="58" r="14" stroke="#ffb23d" strokeWidth="4" />
          <path d="M226 36 v-6 M226 86 v-6 M204 58 h-6 M254 58 h-6" stroke="#ffb23d" strokeWidth="3" />
          <path d="M70 150 q20 -12 40 0 t40 0" stroke="#2fbf6f" strokeWidth="4" />
        </g>
        <path d="M236 128 l26 -46 l10 6 l-26 46 l-12 4z" fill="#ffcf3f" stroke="#17142b" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M262 82 l10 6 l4 -7 l-10 -6z" fill="#ff8fa3" stroke="#17142b" strokeWidth="2.5" />
      </g>
      <g transform="translate(206 140) rotate(5)">
        <rect width="104" height="40" rx="14" fill="#2fd6a8" stroke="#17142b" strokeWidth="3" />
        <path d="M18 40 l-4 12 l14 -12z" fill="#2fd6a8" stroke="#17142b" strokeWidth="3" strokeLinejoin="round" />
        <text x="52" y="27" textAnchor="middle" fontFamily={display} fontWeight="900" fontSize="18" fill="#17142b">
          house?
        </text>
      </g>
      <text x="14" y="38" fontFamily={display} fontWeight="900" fontSize="30" fill="#fffdf8" stroke="#17142b" strokeWidth="5" paintOrder="stroke" transform="rotate(-6 14 38)">
        Doodle Duel
      </text>
    </Frame>
  );
}

function ColorClashCover({ className }: CoverProps) {
  const card = (x: number, rot: number, fill: string, label: string, dark: string) => (
    <g key={label + x} transform={`translate(${x} 104) rotate(${rot})`}>
      <rect x="-40" y="-58" width="80" height="116" rx="12" fill="#fff" stroke="#17142b" strokeWidth="3" />
      <rect x="-34" y="-52" width="68" height="104" rx="9" fill={fill} />
      <ellipse cx="0" cy="0" rx="24" ry="40" fill="#fff" transform="rotate(25)" />
      <text x="0" y="14" textAnchor="middle" fontFamily={display} fontWeight="900" fontSize="38" fill={dark}>
        {label}
      </text>
      <text x="-26" y="-36" fontFamily={display} fontWeight="900" fontSize="14" fill="#fff">
        {label}
      </text>
    </g>
  );
  return (
    <Frame label="Color Clash cover: a fan of colourful cards on a felt table" className={className} bg="#123b33">
      <ellipse cx="160" cy="110" rx="150" ry="90" fill="#1a5246" />
      <ellipse cx="160" cy="110" rx="110" ry="66" fill="#ffc23d" opacity="0.12" />
      <ellipse cx="160" cy="112" rx="124" ry="76" fill="none" stroke="#ffc23d" strokeWidth="2" strokeDasharray="10 12" opacity="0.6" />
      {card(98, -24, "#3d8bff", "7", "#1546a8")}
      {card(140, -8, "#2fbf6f", "3", "#16825a")}
      {card(182, 8, "#ffc23d", "9", "#b37a00")}
      {card(224, 24, "#ff4f5e", "+2", "#b3122a")}
      <g transform="translate(270 54) rotate(14)">
        <rect x="-26" y="-36" width="52" height="72" rx="9" fill="#1c1640" stroke="#fff" strokeWidth="3" />
        <path d="M0-16 L13.9-8 L0 0Z" fill="#ff4f5e" />
        <path d="M13.9-8 L13.9 8 L0 0Z" fill="#3d8bff" />
        <path d="M13.9 8 L0 16 L0 0Z" fill="#2fbf6f" />
        <path d="M0 16 L-13.9 8 L0 0Z" fill="#ffc23d" />
        <path d="M-13.9 8 L-13.9 -8 L0 0Z" fill="#ff4f5e" opacity="0.8" />
        <path d="M-13.9 -8 L0 -16 L0 0Z" fill="#3d8bff" opacity="0.8" />
      </g>
      <text x="16" y="40" fontFamily={display} fontWeight="900" fontSize="32" fill="#fff" stroke="#17142b" strokeWidth="6" paintOrder="stroke" letterSpacing="0.5">
        COLOR CLASH
      </text>
    </Frame>
  );
}

export function GameCover({ gameId, className }: { gameId: GameId; className?: string }) {
  switch (gameId) {
    case "sinverse-cricket":
      return <Frame label="Sinverse Cricket: floodlights above an original oval and a rising cricket ball" className={className} bg="#102d3a"><image href="/sinverse-cricket/cover.svg" width="320" height="200" /></Frame>;
    case "cuisine-quest":
      return <Frame label="Cuisine Quest cover: a chef's passport and a world of kitchens" className={className} bg="#254841"><image href="/cuisine-quest/cover.svg" width="320" height="200" /></Frame>;
    case "chef-rivals":
      return (
        <Frame label="Chef Rivals cover: two chefs face off across a glowing cooking stage" className={className} bg="#2a1533">
          <circle cx={W / 2} cy={H * 0.42} r={H * 0.36} fill="#ff8a5c" opacity=".22" />
          <rect y={H * 0.74} width={W} height={H * 0.26} fill="#3d2149" />
          {[[W * 0.28, "#ff6b4a"], [W * 0.72, "#7c5cff"]].map(([x, apron], i) => (
            <g key={i} transform={`translate(${x} ${H * 0.3}) scale(${i ? -1 : 1} 1)`}>
              <path d="M-22 -8q-16 -30 8 -30q14 -18 28 0q24 0 8 30Z" fill="#fff6ea" />
              <circle r="24" cy="12" fill={i ? "#c98a5e" : "#f0c39a"} />
              <path d="M-30 36q30 -14 60 0v62h-60Z" fill="#fff6ea" />
              <path d="M-18 46h36v52h-36Z" fill={String(apron)} />
              <path d="M28 44l38 -16" stroke="#fff6ea" strokeWidth="13" strokeLinecap="round" />
              <path d="M62 30l26 -12" stroke="#d6ddd3" strokeWidth="7" strokeLinecap="round" />
            </g>
          ))}
          <path d={`M${W / 2 - 16} ${H * 0.3}l24 -6 -10 26 18 -2 -30 40 8 -32 -16 2Z`} fill="#ffc83d" />
        </Frame>
      );
    case "kitchen-rush-coop":
      return (
        <Frame label="Kitchen Rush Co-op cover: four chefs' hats around one busy stove" className={className} bg="#3a1d12">
          <rect y={H * 0.68} width={W} height={H * 0.32} fill="#6b3a1e" />
          <rect x={W * 0.3} y={H * 0.55} width={W * 0.4} height={H * 0.16} rx="8" fill="#2c2a3f" />
          <path d={`M${W * 0.42} ${H * 0.55}q10 -34 22 -8q10 -26 22 8Z`} fill="#ffb23d" />
          {[["#ff6b4a", 0.14], ["#2fd6a8", 0.36], ["#7c5cff", 0.62], ["#ffc83d", 0.84]].map(([color, x], i) => (
            <g key={i} transform={`translate(${Number(x) * W} ${H * (i % 2 ? 0.3 : 0.38)})`}>
              <path d="M-20 -6q-14 -26 8 -26q12 -16 24 0q22 0 8 26Z" fill="#fff6ea" />
              <circle r="20" cy="12" fill={["#f0c39a", "#c98a5e", "#e5b184", "#9c6641"][i]} />
              <path d="M-26 32q26 -12 52 0v50h-52Z" fill={String(color)} />
            </g>
          ))}
        </Frame>
      );
    case "kitchen-rush":
      return <KitchenRushCover className={className} />;
    case "bumper-blitz":
      return <BumperBlitzCover className={className} />;
    case "token-trail":
      return <TokenTrailCover className={className} />;
    case "cascade-solitaire":
      return <SolitaireCover className={className} />;
    case "mahjong-garden":
      return <MahjongCover className={className} />;
    case "doodle-duel":
      return <DoodleDuelCover className={className} />;
    case "color-clash":
      return <ColorClashCover className={className} />;
  }
}

