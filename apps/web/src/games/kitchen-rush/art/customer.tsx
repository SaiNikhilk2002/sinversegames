"use client";

import type { CustomerTypeId } from "@platform/engines/kitchen-rush";
import { INK } from "./food";

/**
 * Kitchen Rush customers. Each customer is built from their seed (skin, hair,
 * clothes) plus their type's signature look, so the same regular always looks
 * the same in a run. Faces and body language carry the game state:
 *
 *   excited    the chef is holding their order
 *   happy      plenty of patience left
 *   neutral    waiting
 *   impatient  patience running low: frown, sweat, foot tapping
 *   angry      about to leave: red face, steam, shaking
 *   delighted  served correctly: celebrates, then leaves
 *   sad        served the wrong dish
 *   storming   gave up and walks out
 */
export type Mood = "excited" | "happy" | "neutral" | "impatient" | "angry" | "delighted" | "sad" | "storming";

const SKIN = ["#f7d1b0", "#eab48a", "#c98b62", "#a8704a", "#7a4a2e"];
const HAIR = ["#2c1d16", "#6e3b1f", "#d9a441", "#1b1b26", "#b9472f", "#8b8b96"];
const NAMES = ["Mo", "Ada", "Ravi", "June", "Kofi", "Lena", "Theo", "Mei", "Sol", "Iris", "Bo", "Nia", "Ezra", "Pip", "Uma", "Ari"];

export const customerName = (seed: number) => NAMES[(seed * 7 + 3) % NAMES.length]!;

interface Look {
  skin: string;
  hair: string;
  hairStyle: number;
  shirt: string;
  shirtShade: string;
}

function lookFor(type: CustomerTypeId, seed: number): Look {
  const pick = <T,>(xs: T[], salt: number) => xs[(seed * 31 + salt * 17) % xs.length]!;
  const shirts: Record<CustomerTypeId, [string, string][]> = {
    regular: [["#5b8cff", "#3f6ad6"], ["#2fbf8f", "#1f9670"], ["#ff8f5e", "#e06a38"], ["#f2c94c", "#d4a82a"]],
    hurried: [["#3b4a63", "#29344a"], ["#5c6b80", "#434f61"]],
    vip: [["#7c4dff", "#5a30d6"], ["#c2185b", "#90123f"]],
    critic: [["#2b2a3d", "#1a1928"], ["#4a3b5c", "#342842"]],
  };
  const [shirt, shirtShade] = pick(shirts[type], 1);
  return { skin: pick(SKIN, 2), hair: type === "critic" ? "#8b8b96" : pick(HAIR, 3), hairStyle: (seed * 13 + 5) % 4, shirt, shirtShade };
}

const line = { stroke: INK, strokeWidth: 2.4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

function Hair({ style, color }: { style: number; color: string }) {
  switch (style) {
    case 0: // side part
      return <path d="M28 40 C 26 18, 74 14, 74 40 C 66 30, 52 28, 40 32 C 36 34, 32 36, 28 40z" fill={color} {...line} />;
    case 1: // curls
      return (
        <g fill={color} {...line}>
          {[[32, 30], [40, 22], [50, 19], [60, 22], [68, 30], [36, 38], [66, 38]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="8" />
          ))}
        </g>
      );
    case 2: // bun on top
      return (
        <>
          <circle cx="50" cy="14" r="8" fill={color} {...line} />
          <path d="M27 42 C 24 16, 76 16, 73 42 C 70 30, 30 30, 27 42z" fill={color} {...line} />
        </>
      );
    default: // spiky crop
      return <path d="M28 38 L 30 22 L 38 26 L 42 14 L 50 22 L 58 13 L 62 24 L 70 20 L 72 38 C 62 30, 38 30, 28 38z" fill={color} {...line} />;
  }
}

function Face({ mood, type }: { mood: Mood; type: CustomerTypeId }) {
  const browL = { excited: "M36 40 q5 -5 10 -2", happy: "M36 41 q5 -3 10 -1", neutral: "M36 41 h10", impatient: "M36 38 l10 4", angry: "M35 37 l12 6", delighted: "M36 38 q5 -6 10 -3", sad: "M36 43 l10 -4", storming: "M35 37 l12 6" }[mood];
  const browR = { excited: "M54 38 q5 -3 10 2", happy: "M54 40 q5 -2 10 1", neutral: "M54 41 h10", impatient: "M54 42 l10 -4", angry: "M53 43 l12 -6", delighted: "M54 35 q5 -3 10 3", sad: "M54 39 l10 4", storming: "M53 43 l12 -6" }[mood];
  const closedHappy = mood === "delighted" || mood === "happy";
  const mouth = {
    excited: <path d="M40 60 q10 12 20 0 z" fill="#7a1f1f" {...line} />,
    happy: <path d="M41 59 q9 8 18 0" fill="none" {...line} />,
    neutral: <path d="M43 61 h14" fill="none" {...line} />,
    impatient: <path d="M42 63 q4 -3 8 0 q4 3 8 0" fill="none" {...line} />,
    angry: <rect x="40" y="58" width="20" height="7" rx="2" fill="#fff" {...line} />,
    delighted: <path d="M38 58 q12 16 24 0 z" fill="#7a1f1f" {...line} />,
    sad: <path d="M41 64 q9 -8 18 0" fill="none" {...line} />,
    storming: <path d="M41 64 q9 -7 18 0" fill="none" {...line} />,
  }[mood];
  return (
    <g>
      <g className="kr-blink">
        {closedHappy ? (
          <>
            <path d="M37 49 q4 -5 8 0" fill="none" {...line} />
            <path d="M55 49 q4 -5 8 0" fill="none" {...line} />
          </>
        ) : (
          <>
            <ellipse cx="41" cy="49" rx={mood === "excited" ? 4.2 : 3.2} ry={mood === "excited" ? 5 : 4} fill={INK} />
            <ellipse cx="59" cy="49" rx={mood === "excited" ? 4.2 : 3.2} ry={mood === "excited" ? 5 : 4} fill={INK} />
            <circle cx="42.4" cy="47.4" r="1.3" fill="#fff" />
            <circle cx="60.4" cy="47.4" r="1.3" fill="#fff" />
          </>
        )}
      </g>
      <path d={browL} fill="none" {...line} strokeWidth={3} />
      <path d={browR} fill="none" {...line} strokeWidth={3} />
      {type === "critic" && (
        <g fill="none" {...line} strokeWidth={1.8}>
          <circle cx="59" cy="49" r="7" />
          <path d="M66 50 q4 10 2 22" strokeWidth={1.2} />
        </g>
      )}
      {mood !== "angry" && mood !== "storming" && <ellipse cx="33" cy="56" rx="4" ry="2.4" fill="#ff7a8a" opacity={mood === "delighted" || mood === "excited" ? 0.75 : 0.35} />}
      {mood !== "angry" && mood !== "storming" && <ellipse cx="67" cy="56" rx="4" ry="2.4" fill="#ff7a8a" opacity={mood === "delighted" || mood === "excited" ? 0.75 : 0.35} />}
      {mouth}
    </g>
  );
}

function Arms({ mood, shirt }: { mood: Mood; shirt: string }) {
  if (mood === "excited" || mood === "delighted")
    return (
      <g fill="none" {...line} strokeWidth={8} stroke={shirt}>
        <path d="M26 86 q-10 -10 -8 -26" />
        <path d="M74 86 q10 -10 8 -26" />
      </g>
    );
  if (mood === "impatient")
    return (
      <g fill="none" stroke={shirt} strokeWidth={8} strokeLinecap="round">
        <path d="M28 90 q20 10 44 -2" />
      </g>
    );
  if (mood === "angry" || mood === "storming")
    return (
      <g fill="none" stroke={shirt} strokeWidth={8} strokeLinecap="round">
        <path d="M26 86 q-8 6 -4 16" />
        <path d="M74 86 q8 6 4 16" />
      </g>
    );
  return (
    <g fill="none" stroke={shirt} strokeWidth={8} strokeLinecap="round">
      <path d="M26 86 q-6 10 -4 22" />
      <path d="M74 86 q6 10 4 22" />
    </g>
  );
}

/** A customer, drawn standing behind the counter (100×130 box). */
export function CustomerFigure({ type, seed, mood }: { type: CustomerTypeId; seed: number; mood: Mood }) {
  const look = lookFor(type, seed);
  const flushed = mood === "angry" || mood === "storming";
  return (
    <svg viewBox="0 0 100 130" className="h-full w-full" aria-hidden overflow="visible">
      <g className={`kr-body kr-mood-${mood}`}>
        {/* Torso */}
        <path d="M20 130 C 18 96, 30 80, 50 80 C 70 80, 82 96, 80 130z" fill={look.shirt} {...line} />
        <path d="M50 82 v48" stroke={look.shirtShade} strokeWidth="3" />
        {type === "hurried" && <path d="M46 82 l4 22 l4 -22z" fill="#d93a3a" {...line} strokeWidth={1.6} />}
        {type === "vip" && <path d="M34 86 q16 14 32 0" fill="none" stroke="#ffd13f" strokeWidth="3.4" strokeLinecap="round" />}
        <Arms mood={mood} shirt={look.shirt} />
        {(mood === "excited" || mood === "delighted") && (
          <>
            <circle cx="18" cy="58" r="6" fill={look.skin} {...line} />
            <circle cx="82" cy="58" r="6" fill={look.skin} {...line} />
          </>
        )}
        {type === "hurried" && mood === "impatient" && (
          <g className="kr-watch">
            <circle cx="70" cy="88" r="5" fill="#fff" {...line} strokeWidth={1.8} />
          </g>
        )}
        {/* Head */}
        <g className="kr-head">
          <circle cx="50" cy="48" r="25" fill={flushed ? "#e8806e" : look.skin} {...line} style={{ transition: "fill 400ms" }} />
          <Hair style={type === "critic" ? 0 : look.hairStyle} color={look.hair} />
          {type === "vip" && (
            <g>
              <path d="M32 26 l4 -14 l8 8 l6 -12 l6 12 l8 -8 l4 14z" fill="#ffd13f" {...line} />
              <circle cx="50" cy="16" r="2.2" fill="#ff4f8b" />
            </g>
          )}
          {type === "critic" && (
            <g>
              <ellipse cx="50" cy="26" rx="26" ry="7" fill="#7a1f3d" {...line} />
              <circle cx="50" cy="18" r="3" fill="#7a1f3d" {...line} />
            </g>
          )}
          {type === "hurried" && <path d="M28 44 v-6 M72 44 v-6" stroke={INK} strokeWidth="2" />}
          <Face mood={mood} type={type} />
          {mood === "impatient" && <path className="kr-sweat" d="M74 36 q4 6 0 9 q-4 -3 0 -9z" fill="#7cc8ff" {...line} strokeWidth={1.4} />}
          {(mood === "angry" || mood === "storming") && (
            <g stroke="#e8283a" strokeWidth="3" strokeLinecap="round" className="kr-anger">
              <path d="M70 24 l6 -6 M72 30 l8 -2 M66 20 l2 -8" />
            </g>
          )}
        </g>
      </g>
    </svg>
  );
}
