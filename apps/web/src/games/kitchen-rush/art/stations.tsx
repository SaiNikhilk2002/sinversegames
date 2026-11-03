"use client";

import type { ItemId, StationType } from "@platform/engines/kitchen-rush";
import { FoodGroup, INK } from "./food";

/**
 * Kitchen equipment, drawn in a 120×110 box: grill, fryer, pot on a burner and
 * a chopping board. Each one shows its contents cooking, a heat gauge on the
 * front, and state-specific animation (glowing coals, bubbling oil, flames,
 * a chopping knife). Smoke and steam come from the particle layer.
 */

export type StationState = "empty" | "working" | "done" | "burning" | "burnt" | "idle";

const line = { stroke: INK, strokeWidth: 2.4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/** Visual doneness for the food on a station: 0 raw → 1 perfect → 2 burnt. */
export function cookLevel(state: StationState, progress: number): number {
  if (state === "working") return progress;
  if (state === "done") return 1 + progress * 0.25;
  if (state === "burning") return 1.15 + progress * 0.6;
  if (state === "burnt") return 2;
  return 1;
}

/** Needle position on the gauge, 0–1: cooking fills the blue, perfect is green, then red. */
function gaugeAt(state: StationState, progress: number) {
  if (state === "working") return progress * 0.6;
  if (state === "done" || state === "burning") return 0.6 + progress * 0.4;
  if (state === "burnt") return 1;
  return 0;
}

function Gauge({ x, y, state, progress, burns }: { x: number; y: number; state: StationState; progress: number; burns: boolean }) {
  const r = 11;
  const arc = (a0: number, a1: number) => {
    const p = (a: number) => [x + r * Math.cos(Math.PI * (1 - a)), y - r * Math.sin(Math.PI * (1 - a))];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    return `M${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
  };
  const at = burns ? gaugeAt(state, progress) : state === "working" ? progress : state === "empty" ? 0 : 1;
  return (
    <g>
      <path d={`M${x - 15} ${y + 3} a15 15 0 0 1 30 0z`} fill="#f4efe6" {...line} strokeWidth={1.8} />
      <path d={arc(0.02, burns ? 0.58 : 0.98)} stroke="#5aa9e6" strokeWidth="3.2" fill="none" />
      {burns && <path d={arc(0.6, 0.78)} stroke="#2fbf6f" strokeWidth="3.2" fill="none" />}
      {burns && <path d={arc(0.8, 0.98)} stroke="#e8343f" strokeWidth="3.2" fill="none" />}
      <g style={{ transform: `rotate(${-90 + at * 180}deg)`, transformOrigin: `${x}px ${y}px`, transition: "transform 120ms linear" }}>
        <path d={`M${x} ${y} L${x} ${y - 11}`} stroke={INK} strokeWidth="2" strokeLinecap="round" />
      </g>
      <circle cx={x} cy={y} r="2.2" fill={INK} />
    </g>
  );
}

function Grill({ item, cook, flipped, on }: { item: ItemId | null; cook: number; flipped: boolean; on: boolean }) {
  return (
    <>
      {/* Body */}
      <path d="M8 58 h104 v40 q0 6 -6 6 h-92 q-6 0 -6 -6z" fill="#3e3d4c" {...line} />
      <path d="M14 96 h92" stroke="#2a2935" strokeWidth="3" strokeLinecap="round" />
      {/* Top: hot plate with grates, drawn in perspective */}
      <path d="M18 30 h84 l10 28 h-104z" fill="#24232e" {...line} />
      <path d="M22 34 h76 l7 20 h-90z" fill={on ? "#ff6a1f" : "#3a2a24"} className={on ? "kr-coals" : undefined} opacity={on ? 0.85 : 1} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <path key={i} d={`M${26 + i * 11.4} 33 L${20 + i * 13.4} 56`} stroke="#5a5866" strokeWidth="3" strokeLinecap="round" />
      ))}
      <path d="M20 44 h80" stroke="#5a5866" strokeWidth="2.4" />
      {item && (
        <g key={flipped ? "b" : "a"} className={flipped ? "kr-flip" : "kr-drop"}>
          <FoodGroup item={item} cook={cook} x={60} y={42} scale={item === "burnt" ? 0.8 : 0.78} />
        </g>
      )}
      {/* Knobs */}
      {[28, 92].map((x) => (
        <g key={x}>
          <circle cx={x} cy="80" r="7" fill="#c8c6d4" {...line} strokeWidth={1.8} />
          <path d={`M${x} 80 l${on ? 4 : 0} ${on ? -5 : -6}`} stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      ))}
    </>
  );
}

function Fryer({ item, cook, on }: { item: ItemId | null; cook: number; on: boolean }) {
  return (
    <>
      <path d="M10 46 h100 v52 q0 6 -6 6 h-88 q-6 0 -6 -6z" fill="#c5c9d6" {...line} />
      <path d="M16 54 h88" stroke="#a3a8b8" strokeWidth="2" />
      <ellipse cx="60" cy="46" rx="48" ry="12" fill="#8a8f9e" {...line} />
      <ellipse cx="60" cy="47" rx="42" ry="9" fill={on ? "#f5b73b" : "#d9a243"} />
      {/* Basket */}
      <path d="M30 40 h60 l-4 14 h-52z" fill="none" stroke="#5e6372" strokeWidth="2.2" />
      <path d="M90 42 l18 -16" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <path d="M104 29 l8 -7" stroke="#2b2a3d" strokeWidth="6" strokeLinecap="round" />
      {item && (
        <g className="kr-drop">
          <FoodGroup item={item} cook={cook} x={60} y={38} scale={0.62} />
        </g>
      )}
      {/* Oil over the lower half of the food, bubbling while it fries */}
      {item && <path d="M18 47 q42 14 84 0 q-42 10 -84 0z" fill="#f5b73b" opacity="0.75" />}
      {on && (
        <g className="kr-bubbles" fill="#ffe08a" stroke="#c98a12" strokeWidth="0.8">
          {[[30, 48], [44, 52], [62, 50], [78, 52], [90, 47], [52, 46]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={1.6 + (i % 3)} style={{ animationDelay: `${i * 130}ms` }} />
          ))}
        </g>
      )}
      <rect x="22" y="70" width="40" height="12" rx="3" fill="#2b2a3d" />
      <text x="42" y="79.5" fontSize="8" textAnchor="middle" fill={on ? "#ff7a3d" : "#6b6880"} fontFamily="ui-monospace, monospace" fontWeight="700">
        {on ? "180°" : "OFF"}
      </text>
    </>
  );
}

function Pot({ item, cook, on }: { item: ItemId | null; cook: number; on: boolean }) {
  return (
    <>
      {/* Burner and flames */}
      <path d="M14 92 h92 v8 q0 4 -4 4 h-84 q-4 0 -4 -4z" fill="#3e3d4c" {...line} />
      {on && (
        <g className="kr-flames">
          {[30, 42, 54, 66, 78, 90].map((x, i) => (
            <path key={x} d={`M${x} 92 q-4 -6 0 -12 q4 6 0 12z`} fill={i % 2 ? "#5ab0ff" : "#8fd0ff"} style={{ animationDelay: `${i * 70}ms` }} />
          ))}
        </g>
      )}
      {/* Pot */}
      <path d="M18 40 h84 v40 q0 10 -10 10 h-64 q-10 0 -10 -10z" fill="#e0533c" {...line} />
      <path d="M24 50 v26" stroke="#f58b72" strokeWidth="4" strokeLinecap="round" />
      <path d="M18 46 h-8 M102 46 h8" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="60" cy="40" rx="42" ry="9" fill="#b33b28" {...line} />
      <ellipse cx="60" cy="41" rx="37" ry="6.5" fill={item ? "#7fa3ba" : "#a9c3d3"} />
      {item && (
        <g className="kr-drop">
          <FoodGroup item={item} cook={cook} x={60} y={36} scale={0.6} />
        </g>
      )}
      {on && (
        <g className="kr-bubbles" fill="#ffffff" opacity="0.8">
          {[[38, 42], [54, 44], [70, 42], [84, 41]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2" style={{ animationDelay: `${i * 160}ms` }} />
          ))}
        </g>
      )}
    </>
  );
}

function Board({ item, working }: { item: ItemId | null; working: boolean }) {
  return (
    <>
      <path d="M8 66 h104 v32 q0 6 -6 6 h-92 q-6 0 -6 -6z" fill="#c5c9d6" {...line} />
      <path d="M14 74 h92" stroke="#a3a8b8" strokeWidth="2" />
      <path d="M14 34 h92 q6 0 6 6 v22 q0 6 -6 6 h-92 q-6 0 -6 -6 v-22 q0 -6 6 -6z" fill="#d49a5e" {...line} />
      <path d="M18 42 h70 M22 50 h60 M18 58 h74" stroke="#b97d44" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="100" cy="42" r="3" fill="#b97d44" />
      {item && (
        <g className="kr-drop">
          <FoodGroup item={item} x={52} y={46} scale={0.62} />
        </g>
      )}
      {/* Knife */}
      <g className={working ? "kr-chop" : undefined} style={{ transformOrigin: "106px 50px", transformBox: "view-box" }}>
        <path d="M60 30 L96 46 L92 52 L58 36z" fill="#eef0f6" {...line} strokeWidth={2} />
        <path d="M96 46 l14 6 l-3 6 l-15 -6z" fill="#3b2a20" {...line} strokeWidth={2} />
      </g>
    </>
  );
}

export function StationArt({ type, item, state, progress, flipped }: { type: StationType; item: ItemId | null; state: StationState; progress: number; flipped: boolean }) {
  const cook = cookLevel(state, progress);
  const on = state === "working" || state === "done" || state === "burning";
  return (
    <svg viewBox="0 0 120 110" className="h-full w-full" aria-hidden overflow="visible">
      {type === "grill" && <Grill item={item} cook={cook} flipped={flipped} on={on} />}
      {type === "fryer" && <Fryer item={item} cook={cook} on={on} />}
      {type === "pot" && <Pot item={item} cook={cook} on={on} />}
      {type === "board" && <Board item={item} working={state === "working"} />}
      <Gauge x={type === "fryer" ? 88 : type === "board" ? 30 : 60} y={type === "pot" ? 72 : type === "grill" ? 86 : 88} state={state} progress={progress} burns={type !== "board"} />
    </svg>
  );
}
