import { type Innings, type Outcome } from "./domain";

/** Pure scorebook reducer for the explicit duel rules; physics supplies the outcome. */
export function scoreDelivery(i: Innings, o: Outcome) {
  const bowler = i.bowlers[Math.floor(i.balls / 6)]!,
    striker = i.batsmen[i.striker]!;
  const dismissedId = o.dismissed === "striker" ? i.striker : i.nonStriker;
  const ball = `${Math.floor(i.balls / 6)}.${(i.balls % 6) + (o.legal ? 1 : 0)}`;
  i.runs += o.total;
  i.partnership += o.total;
  for (const extra of ["wides", "noBalls", "byes", "legByes"] as const)
    i.extras[extra] += o[extra];
  striker.runs += o.bat;
  if (!o.wides && !o.noBalls) striker.balls++;
  if (o.boundary === 4 && o.bat) striker.fours++;
  if (o.boundary === 6 && o.bat) striker.sixes++;
  bowler.runs += o.total - o.byes - o.legByes;
  bowler.wides += o.wides;
  bowler.noBalls += o.noBalls;
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
  }
  return ball;
}
