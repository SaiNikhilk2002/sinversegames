"use client";

import { memo } from "react";
import type { ChefPose } from "@platform/engines/cuisine-quest";

export type ChefMood = "calm" | "celebrate" | "oops" | "win" | "lose";

const SKIN = ["#f4cda7", "#e5b184", "#c98a5e", "#9c6641", "#6f4630"];
const HATS = ["toque", "puffy", "bandana", "beret"] as const;
const EXTRAS = ["none", "moustache", "glasses", "freckles"] as const;

/** A stable look for a player, from their id. Purely cosmetic: it never reaches the simulation. */
export function chefLook(id: string) {
  let hash = 0;
  for (const ch of id) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
  return { skin: SKIN[hash % SKIN.length]!, hat: HATS[(hash >>> 3) % HATS.length]!, extra: EXTRAS[(hash >>> 6) % EXTRAS.length]! };
}

const Tool = ({ pose }: { pose: ChefPose }) => {
  if (pose === "chop") return <g className="cr-tool"><path d="M98 66l18 -6 3 8 -18 6Z" fill="#dfe6df" stroke="#7d948c" strokeWidth="1.5" /><path d="M98 66l-8 3 2 6 9 -3Z" fill="#665146" /></g>;
  if (pose === "mix" || pose === "stir") return <g className="cr-tool"><path d="M96 70l14 -20" stroke="#b98a55" strokeWidth="4" strokeLinecap="round" /><ellipse cx="111" cy="48" rx="5" ry="3.5" fill="#b98a55" transform="rotate(-55 111 48)" /></g>;
  if (pose === "flip" || pose === "cook") return <g className="cr-tool"><path d="M96 70h12" stroke="#4a3a33" strokeWidth="4" strokeLinecap="round" /><ellipse cx="119" cy="70" rx="13" ry="4.5" fill="#3a3430" /><ellipse cx="119" cy="67" rx="7" ry="3" fill="#e9ab43" /></g>;
  if (pose === "plate" || pose === "serve") return <g className="cr-tool"><ellipse cx="108" cy="64" rx="16" ry="5" fill="#f7f1df" stroke="#c9bfa6" strokeWidth="1.5" /><ellipse cx="108" cy="61" rx="8" ry="4" fill="#df693c" /><circle cx="105" cy="58" r="2" fill="#6fa64a" /></g>;
  if (pose === "roll") return <g className="cr-tool"><rect x="92" y="66" width="28" height="7" rx="3.5" fill="#c99a62" /><rect x="86" y="68" width="7" height="3" rx="1.5" fill="#8e6a3f" /></g>;
  if (pose === "gather") return <g className="cr-tool"><circle cx="106" cy="64" r="7" fill="#d9563d" /><path d="M106 57l3 -4" stroke="#51874b" strokeWidth="2" /></g>;
  return null;
};

const Hat = ({ kind }: { kind: (typeof HATS)[number] }) => {
  if (kind === "toque") return <g><path d="M42 30q-10 -22 8 -24q10 -12 20 0q18 2 8 24Z" fill="#fffaf0" stroke="#d8cfb9" strokeWidth="1.5" /><rect x="42" y="26" width="36" height="8" rx="2" fill="#fffaf0" stroke="#d8cfb9" strokeWidth="1.5" /></g>;
  if (kind === "puffy") return <g><ellipse cx="60" cy="20" rx="26" ry="16" fill="#fffaf0" stroke="#d8cfb9" strokeWidth="1.5" /><rect x="40" y="26" width="40" height="7" rx="3" fill="#f1e8d3" /></g>;
  if (kind === "bandana") return <g><path d="M38 34q22 -24 44 0Z" fill="var(--cr-apron)" /><path d="M82 30l10 -6 -2 10Z" fill="var(--cr-apron)" /></g>;
  return <g><ellipse cx="60" cy="27" rx="27" ry="10" fill="var(--cr-apron)" /><circle cx="60" cy="17" r="3" fill="var(--cr-apron)" /></g>;
};

/**
 * An original chef drawn in SVG. All movement is CSS transforms keyed by pose and
 * mood, so it reflects real game state and costs no JavaScript per frame.
 */
export const ChefCharacter = memo(function ChefCharacter({ id, color, pose = "idle", mood = "calm", label, className = "" }: { id: string; color: string; pose?: ChefPose; mood?: ChefMood; label?: string; className?: string }) {
  const look = chefLook(id);
  const happy = mood === "celebrate" || mood === "win";
  const sad = mood === "oops" || mood === "lose";
  return (
    <svg viewBox="0 0 130 150" className={`cr-chef cr-pose-${pose} cr-mood-${mood} ${className}`} style={{ "--cr-apron": color } as React.CSSProperties} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} data-pose={pose} data-mood={mood}>
      <ellipse cx="60" cy="144" rx="30" ry="5" fill="#000" opacity=".2" />
      <g className="cr-body">
        <g className="cr-leg cr-leg-l"><rect x="44" y="110" width="13" height="30" rx="5" fill="#2c2a3f" /><rect x="41" y="134" width="19" height="8" rx="4" fill="#191827" /></g>
        <g className="cr-leg cr-leg-r"><rect x="63" y="110" width="13" height="30" rx="5" fill="#2c2a3f" /><rect x="60" y="134" width="19" height="8" rx="4" fill="#191827" /></g>
        <path d="M36 66q24 -14 48 0l4 50q-28 8 -56 0Z" fill="#fffaf0" stroke="#d8cfb9" strokeWidth="1.5" />
        <path d="M44 76h32l5 39q-21 6 -42 0Z" fill="var(--cr-apron)" />
        <path d="M60 60v14" stroke="#d8cfb9" strokeWidth="2" /><circle cx="52" cy="68" r="1.6" fill="#a89f88" /><circle cx="68" cy="68" r="1.6" fill="#a89f88" />
        <g className="cr-arm cr-arm-l"><path d="M38 70q-14 10 -16 28" fill="none" stroke="#fffaf0" strokeWidth="11" strokeLinecap="round" /><circle cx="22" cy="101" r="6" fill={look.skin} /></g>
        <g className="cr-arm cr-arm-r"><path d="M82 70q10 4 16 0" fill="none" stroke="#fffaf0" strokeWidth="11" strokeLinecap="round" /><circle cx="98" cy="70" r="6" fill={look.skin} /><Tool pose={pose} /></g>
        <g className="cr-head">
          <circle cx="60" cy="44" r="20" fill={look.skin} />
          <Hat kind={look.hat} />
          <g className="cr-eyes"><ellipse cx="52" cy="44" rx="2.4" ry={happy ? 1 : 3} fill="#2a2030" /><ellipse cx="68" cy="44" rx="2.4" ry={happy ? 1 : 3} fill="#2a2030" /></g>
          {sad ? <path d="M53 56q7 -6 14 0" fill="none" stroke="#7a3b2e" strokeWidth="2.4" strokeLinecap="round" /> : <path d={happy ? "M50 51q10 12 20 0Z" : "M53 53q7 5 14 0"} fill={happy ? "#8c2f2a" : "none"} stroke="#7a3b2e" strokeWidth="2.2" strokeLinecap="round" />}
          {look.extra === "moustache" && <path d="M50 50q5 -4 10 0q5 -4 10 0q-5 3 -10 1q-5 2 -10 -1Z" fill="#3c2a20" />}
          {look.extra === "glasses" && <g fill="none" stroke="#2a2030" strokeWidth="1.6"><circle cx="52" cy="44" r="5.5" /><circle cx="68" cy="44" r="5.5" /><path d="M57.5 44h5" /></g>}
          {look.extra === "freckles" && <g fill="#a8623f" opacity=".7"><circle cx="47" cy="49" r="1" /><circle cx="50" cy="51" r="1" /><circle cx="70" cy="51" r="1" /><circle cx="73" cy="49" r="1" /></g>}
        </g>
      </g>
    </svg>
  );
});
