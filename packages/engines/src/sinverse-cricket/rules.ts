import { type Innings, type Outcome } from "./domain";

/**
 * Pure scorebook reducer; physics supplies the outcome.
 *
 * A duel innings (version 1) has no `overBowlers`: its two bowlers alternate by
 * over, exactly as recorded matches expect. An international innings (version
 * 2) names the bowler of every over, and also keeps every partnership and each
 * bowler's maidens.
 */
export function scoreDelivery(i: Innings, o: Outcome) {
  const over = Math.floor(i.balls / 6),
    bowler = i.bowlers[i.overBowlers ? i.overBowlers[over]! : over]!,
    striker = i.batsmen[i.striker]!;
  const dismissedId = o.dismissed === "striker" ? i.striker : i.nonStriker;
  const ball = `${Math.floor(i.balls / 6)}.${(i.balls % 6) + (o.legal ? 1 : 0)}`;
  i.runs += o.total;
  i.partnership += o.total;
  for (const extra of ["wides", "noBalls", "byes", "legByes"] as const)
    i.extras[extra] += o[extra];
  const international = !!i.overBowlers;
  striker.runs += o.bat;
  // A no-ball counts as a ball faced (a wide doesn't). The duel's record keeps its original count.
  if (!o.wides && (international || !o.noBalls)) striker.balls++;
  if (o.boundary === 4 && o.bat) striker.fours++;
  if (o.boundary === 6 && o.bat) striker.sixes++;
  bowler.runs += o.total - o.byes - o.legByes;
  bowler.wides += o.wides;
  bowler.noBalls += o.noBalls;
  if (i.overBowlers) i.overRuns = (i.overRuns ?? 0) + o.total - o.byes - o.legByes;
  const pair = i.partnerships?.at(-1);
  if (pair) {
    pair.runs += o.total;
    if (o.legal) pair.balls++;
  }
  i.over.push(o.label);
  if (o.completedRuns % 2)
    [i.striker, i.nonStriker] = [i.nonStriker, i.striker];
  if (o.wicket) {
    i.wickets++;
    i.batsmen[dismissedId]!.dismissal = o.wicket;
    i.fall.push({
      score: i.runs,
      wicket: i.wickets,
      ball,
      batter: i.batsmen[dismissedId]!.name,
    });
    i.partnership = 0;
    if (o.wicket !== "run-out") bowler.wickets++;
    if (i.nextBatter < 11) {
      if (i.striker === dismissedId) i.striker = i.nextBatter++;
      else i.nonStriker = i.nextBatter++;
      // International: the throw breaks the striker's-end wicket, so after a run-out the
      // new batter comes in at that end, on strike; the not-out batter is at the other end.
      if (international && o.wicket === "run-out" && i.nonStriker === i.nextBatter - 1) [i.striker, i.nonStriker] = [i.nonStriker, i.striker];
      i.partnerships?.push({ a: i.striker, b: i.nonStriker, runs: 0, balls: 0 });
    }
  }
  if (o.legal) {
    i.balls++;
    bowler.balls++;
  }
  i.freeHit = !!o.noBalls || (!!o.wides && i.freeHit);
  if (o.legal && i.balls % 6 === 0) {
    [i.striker, i.nonStriker] = [i.nonStriker, i.striker];
    i.over = [];
    if (i.overBowlers) {
      if (!i.overRuns) bowler.maidens = (bowler.maidens ?? 0) + 1;
      i.overRuns = 0;
    }
  }
  return ball;
}
