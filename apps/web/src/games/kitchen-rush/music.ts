import type { Song } from "@/lib/sound";

/** Note frequencies used below (equal temperament, A4 = 440 Hz). */
const N = {
  Bb1: 58.27, C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98, A2: 110, C3: 130.81,
  D3: 146.83, E3: 164.81, F3: 174.61, G3: 196, A3: 220, Bb3: 233.08, C4: 261.63, E4: 329.63,
  F4: 349.23, G4: 392, A4: 440, Bb4: 466.16, C5: 523.25, D5: 587.33,
};

/**
 * "Short Order", an original swung diner loop for Kitchen Rush:
 * I–vi–IV–V in F with a walking bass, soft chords and a two-phrase tune.
 */
export const DINER_SONG: Song = {
  bpm: 112,
  swing: 0.22,
  bass: [
    N.F2, 0, N.A2, 0, N.C3, 0, N.A2, 0,
    N.D2, 0, N.F2, 0, N.A2, 0, N.F2, 0,
    N.Bb1, 0, N.D2, 0, N.F2, 0, N.D2, 0,
    N.C2, 0, N.E2, 0, N.G2, 0, N.E2, 0,
  ],
  chords: [
    [N.F3, N.A3, N.C4, N.E4],
    [N.D3, N.F3, N.A3, N.C4],
    [N.D3, N.F3, N.A3, N.Bb3],
    [N.C3, N.E3, N.G3, N.Bb3],
  ],
  lead: [
    0, 0, N.C5, 0, N.A4, 0, N.G4, N.F4,
    0, 0, N.A4, 0, N.D5, 0, N.C5, 0,
    0, 0, N.Bb4, 0, N.A4, 0, N.G4, 0,
    N.G4, 0, N.A4, 0, N.E4, 0, 0, 0,
    0, 0, N.F4, N.G4, N.A4, 0, N.C5, 0,
    N.D5, 0, N.C5, 0, N.A4, 0, 0, 0,
    0, 0, N.Bb4, N.A4, N.G4, 0, N.F4, 0,
    N.G4, 0, 0, 0, N.F4, 0, 0, 0,
  ],
  hats: [1, 0, 2, 0, 1, 0, 2, 1],
};
