/**
 * Doodle Duel scoring, calculated only on the server.
 *
 * Guesser: base points + a speed bonus proportional to the time remaining,
 * plus a bonus for the first correct guess of the turn.
 * Drawer: points for each correct guesser, plus a bonus when every eligible
 * guesser solved the word.
 */
export interface DoodleScoring {
  guessBase: number;
  guessSpeedBonus: number;
  firstGuessBonus: number;
  drawerPerGuess: number;
  drawerAllGuessedBonus: number;
}

export const DEFAULT_DOODLE_SCORING: DoodleScoring = {
  guessBase: 100,
  guessSpeedBonus: 200,
  firstGuessBonus: 50,
  drawerPerGuess: 60,
  drawerAllGuessedBonus: 100,
};

/** `remainingFraction` is the share of drawing time left, clamped to [0, 1]. */
export function guesserPoints(remainingFraction: number, isFirst: boolean, s: DoodleScoring = DEFAULT_DOODLE_SCORING): number {
  const r = Math.min(1, Math.max(0, remainingFraction));
  return Math.round(s.guessBase + s.guessSpeedBonus * r) + (isFirst ? s.firstGuessBonus : 0);
}

export function drawerPoints(correctCount: number, eligibleCount: number, s: DoodleScoring = DEFAULT_DOODLE_SCORING): number {
  if (correctCount <= 0) return 0;
  const allGuessed = eligibleCount > 0 && correctCount >= eligibleCount;
  return correctCount * s.drawerPerGuess + (allGuessed ? s.drawerAllGuessedBonus : 0);
}
