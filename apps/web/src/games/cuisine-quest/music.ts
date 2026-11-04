import type { Song } from "@/lib/sound";

/** Seven original motifs; broadly inspired palettes, no borrowed melodies. */
const notes = (root: number, semitones: readonly number[]) => semitones.map(n => n < 0 ? 0 : root * 2 ** (n / 12));
const motifs = [
  { root: 146.83, bpm: 104, scale: [0,2,5,7,9,7,5,2,0,-1,7,9,12,9,7,-1], bass: [0,-1,7,-1,0,-1,5,-1] },
  { root: 130.81, bpm: 112, scale: [0,4,7,12,11,7,4,-1,2,5,9,12,9,5,2,-1], bass: [0,-1,4,7,9,-1,7,4] },
  { root: 164.81, bpm: 88, scale: [0,-1,2,7,9,-1,7,2,0,-1,9,7,2,-1,0,-1], bass: [0,-1,-1,7,0,-1,-1,2] },
  { root: 174.61, bpm: 118, scale: [0,4,-1,7,9,7,4,2,0,4,7,-1,12,9,7,-1], bass: [0,-1,7,0,5,-1,7,5] },
  { root: 146.83, bpm: 98, scale: [0,2,4,7,9,-1,7,4,2,4,7,9,12,-1,9,7], bass: [0,-1,9,-1,7,-1,4,-1] },
  { root: 130.81, bpm: 122, scale: [0,2,4,7,9,7,4,2,7,-1,9,12,9,7,2,-1], bass: [0,0,-1,7,5,5,-1,7] },
  { root: 164.81, bpm: 106, scale: [0,2,3,7,10,7,3,-1,2,5,7,10,7,5,2,0], bass: [0,-1,7,-1,3,-1,10,7] },
];
export const QUEST_SONGS: Song[] = motifs.map((m, i) => ({ bpm: m.bpm, swing: i === 1 ? 0.12 : 0, bass: notes(m.root / 2, [...m.bass, ...m.bass]), lead: notes(m.root * 2, m.scale), chords: [[m.root, m.root * 1.5, m.root * 2], [m.root * 4/3, m.root * 2, m.root * 8/3]], hats: i === 2 ? [0,0,1,0,0,0,2,0] : i === 5 ? [1,0,2,1,1,0,2,0] : [1,0,0,1,2,0,1,0] }));
