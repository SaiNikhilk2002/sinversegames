# Sinverse Cricket: the AI opposition

How the computer plays international cricket (version 2), what changed in this milestone, and the evidence that it is legal, deterministic and meaningfully harder at each level. The duel's AI (version 1) is unchanged.

## Principles

- **Same rules as the player.** The AI produces the same inputs a player does:
  - a bowling variation, length, line, pace and release;
  - a shot with its timing;
  - run calls;
  - a field preset;
  - a bowler at each over's start.
- **Physics decides every outcome.** The AI never sets an outcome, a score or a dismissal.
- **Legal choices only.** Fields come from those legal for the over; bowlers come from `bowlerOptions()`, with quotas, no consecutive overs, never the keeper, and a schedule that can still be finished.
- **No peeking.** The batter reads only the ball's flight as it reaches him. The bowler never sees the coming shot.
- **Deterministic.** Every choice is a function of the match seed, the sequence number and the visible match state, so the server replays it exactly.
- **Difficulty describes the opposition only.** When the AI plays the player's own side in a simulated passage, it plays at the neutral county level.

## What difficulty changes

| Decision | Club | County | Elite |
|---|---|---|---|
| Bowling execution error around the planned length (× (1.25 − bowling attribute)) | ±1.25 m | ±0.80 m | ±0.45 m |
| Line error | widest | middle | tightest |
| Extra loose short balls (pace) | 18% | — | — |
| Spinners' "loose" (over-pitched or short) share | 25% | 15% | 10% |
| Wides and no-balls (× the bowler's slip rate) | 1.4× | 1× | 0.7× |
| Captain keeps his two best seamers' overs for the death | no | yes | yes |
| Field: deep to defend a chase that needs more than par + 2.5, attack the tail (7+ wickets down) | no | yes | yes |
| Field: attack a new batter (his first 5 balls) | no | no | yes |
| Batting timing error (× (1.45 − batting attribute)) | 7 ticks | 5 | 4 |
| Batting direction: the best gap, or one of the two best | either | either | best |
| Risky extra runs (× aggression) | 1.3× | 1× | 0.45× |

**The same at every level:**
- the phase plans (below);
- the chase arithmetic;
- protecting wickets in a comfortable chase;
- no risky runs once 8 wickets are down;
- the pace of each bowler, which comes from his type and bowling attribute, not from the level.

## Plans by phase

**Pace bowlers** choose a length band, weighted by the phase of the innings:

| Phase | Yorker 0.9–1.5 m | Full 1.6–2.4 | Good 2.5–3.6 | Back of a length 4.0–5.2 | Short 6.0–7.2 | Variations |
|---|---|---|---|---|---|---|
| Powerplay (T20 overs 1–6, ODI 1–10) | 5% | 25% | 40% | 20% | 10% | Swing and seam; few slower balls |
| Middle | 5% | 15% | 45% | 25% | 10% | Mostly seam, some swing and slower balls |
| Death (T20 last 4, ODI last 10) | 30% | 20% | 20% | 15% | 15% | 30% slower balls |

- **Spinners** bowl their stock ball two-thirds of the time, at 2.4–3.6 m mostly.
- **The bowling captain** picks the freshest strong bowler, favours spin through the middle overs and, at county and above, holds his two best seamers' overs back for the death.
- **Batters** set their aggression by format and phase (T20 harder throughout, ODI building) and by the required rate. When well ahead of the rate they protect wickets. They loft more as aggression rises (cubed), leave wide balls unless attacking, and take the safe runs a probe of the struck ball shows, with an occasional risky extra.

## Why the bowling was rebuilt

**The old AI:**
- bowled uniformly random lengths of 1.6–6.8 m;
- used difficulty only to raise pace;
- in this physics, a quicker ball comes onto the bat faster, so "elite" bowling was *easier* to score from.

A grid run (360 balls a cell, county AI batter) found:
- **Full lengths** (0.8–2 m): 4–6 an over, a wicket every 15–20 balls.
- **Short of a length** (5–7 m): 10–13 an over.
- **Pace** barely matters at full length, and favours the batter when short.

The plans above aim at the lengths that are hard to score from, and use accuracy to make the levels differ.

## Measured effect (40 simulated matches per cell)

`CRICKET_MATCHES=40 pnpm --filter @platform/engines bench:balance`, with the player's side played by the county AI against each level of opposition.

**Before:** commit `98dca74`. **After:** this work.

| Format / opposition | Player side wins (before → after) | Opposition wickets taken | Opposition extras bowled | Opposition batting runs |
|---|---|---|---|---|
| T20 club | 48% → **83%** | 5.5 → 3.5 | 5.7 → 6.3 | 139.6 → 123.3 |
| T20 county | 40% → **50%** | 5.9 → 4.7 | 5.0 → 3.4 | 153.7 → 133.7 |
| T20 elite | 38% → **25%** | 6.0 → 5.3 | 5.3 → 2.6 | 165.1 → 140.9 |
| ODI club | 78% → **85%** | 6.2 → 5.4 | 11.5 → 16.0 | 259.1 → 242.3 |
| ODI county | 55% → **35%** | 7.2 → 6.8 | 11.5 → 12.0 | 293.3 → 281.1 |
| ODI elite | 15% → **10%** | 8.9 → 7.2 | 10.4 → 7.2 | 328.4 → 296.3 |

**What the table shows:**
- **Difficulty is now monotonic in T20.** Before, the player's side won about as often against elite as against county, and elite bowling conceded the most runs. Now club, county and elite win rates are 83%, 50% and 25%.
- **Elite bowls the fewest extras.** In T20, extras fall steadily from club (6.3) to elite (2.6); in ODI, from 16.0 to 7.2.
- **County against county T20 is even** (50%).
- **Run-outs fell** in every cell. T20 went from 1.2–1.7 to 0.8–1.4 per match, and ODI from 2.8–3.7 to 1.6–2.6.
- **Scoring is lower.** T20 innings are about 123–141 runs (before: 136–165). Boundaries are about 11 an innings (before: 13–18). This is a balance trade-off of the physics model; see `CRICKET_REMAINING_WORK.md`.

## Tests

`packages/engines/test/cricket-ai.test.ts`, all deterministic:

- **Every AI field is legal, every ball.** Every AI-chosen bowler is a legal option at every over. Checked for T20 and ODI, club and elite: 300+ and 800+ states.
- **Death fields:** the elite captain sets "attack" in the powerplay and "deep" at the death.
- **Holding seamers back:** elite captains keep more of their best seamers' overs for overs 17–20 than club captains.
- **Better bowling at each level:** more balls on a good length and fewer extras, elite > county > club, sampled over 1,500 deliveries.
- **Whole matches:** over 12 simulated T20s, an elite opposition wins more and bowls fewer extras than a club one.
- **The player's own side** is always played at county level.

**Also exercised by the stress run** (`CRICKET_MATCHES=500 pnpm --filter @platform/engines stress:cricket`): the AI on both sides of 1,000 matches. Its fields and bowlers are checked every ball, and the server replays every match exactly.
