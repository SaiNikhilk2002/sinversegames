# Sinverse Cricket duel rules, version 1

This is an explicit custom playing condition, not complete MCC/ICC certification. The source reference is [MCC's Laws and playing-condition material](https://lawsofcricket.lords.org/laws-and-playing-conditions), including the distinction between Laws and limited-overs free-hit conditions. The [2026 Laws](https://www.lords.org/getattachment/f955069b-ddb9-4e8e-9615-41c3071a3446/The-Laws-of-Cricket-2026-submitted-17-4-2026.pdf) are the dated research reference; full application requires a later independent rules audit.

## Implemented match and scoring

- Eleven fictional players per team, assigned opening pair and two bowlers. One or two scheduled overs per innings; six legal deliveries per over. Each designated bowler can bowl one over. No consecutive-over selection bypass.
- Seeded toss and captain's decision; two innings, target first total + 1. All out, scheduled balls or achieved chase ends an innings. Win margin uses runs or wickets remaining. Equal totals produce a tie without a Super Over.
- Batter runs, legal balls faced, boundaries, bowler legal balls/conceded runs/wickets, extras, partnership and fall of wickets are computed together. This duel labels batter B* as legal deliveries faced; it does not claim all broadcast statistical conventions.
- Completed odd runs rotate strike; an over also swaps ends. Incoming caught/bowled/LBW/stumped batters take the dismissed striker's position; completed run-out runs and original runner identity determine the replacement end. A catch does not retain crossed runs. Catches on the last legal ball also apply the over-end switch.
- Wides: fixed right-handed-stance lateral limit 0.9 m or passing over head height, provided there was no bat/pad contact. One penalty plus additional running/boundary wides; not a legal ball. This geometric limit is a duel simplification, not every striker-movement provision of Law 22.
- No-ball: actual computed front-foot landing beyond the popping crease, or an unpitched ball at contact/passage over 1.05 m. One penalty; takes precedence over wide; does not consume a legal ball. Release controls are not an umpire button: timing changes the modeled landing foot.
- Every no-ball grants a free hit under this house limited-overs condition. Wides/no-balls carry it forward. Bowled, caught, LBW and stumped are suppressed on no-balls/free hits; run-out remains possible. A wide can allow stumping/run-out but cannot be credited as bowled/caught/LBW.
- Byes and attempted-shot leg-byes are separated from bat runs and excluded from bowler conceded runs. Boundaries require actual crossing of the venue ellipse. A bat-struck ball clearing it without a post-contact ground touch scores six; other boundary paths score four, credited to bat or extras as appropriate. A prior pitch bounce does not prevent a subsequent six.

## Physical adjudication

The ball uses fixed-step gravity, quadratic drag, swing/lateral spin, pitch restitution/friction, ground roll, bat contact and swept stump intersection. A swept segment prevents a fast ball tunnelling through the wicket. Ball and stumps use metric dimensions; other parameters are tuned for readable play, not a scientific simulation.

Eight shot profiles have different vertical contact coverage, orientation, lift and impulse. Footwork changes contact plane/grounding, and timing/face/contact offset/stamina change the outgoing vector. Misses and edges follow that computation. The renderer never requests a boundary destination.

Fielders react after a delay, assign a primary/backup from predicted landing/current position and move with acceleration/speed limits. A catch requires actual proximity/height before a post-contact ground touch and a seeded skill check; otherwise the ball drops. A pickup schedules a throw. Direct-hit accuracy, flight duration and runner distance at arrival determine a run-out. Keeper collection can stump an advancing batter only before the modeled recovery reaches ground, and only when dismissal rules allow it. These are geometric interception proxies, not collisions against every animated glove vertex.

The narrow LBW model requires a pitched delivery not pitching outside the right-hander's leg line, inline pad impact, an attempted shot, and a projected path through the wicket; gravity is included in projection. Reviews, umpire's call, left-handed geometry, evasive non-shot adjudication and every edge case of Law 36 are **not** implemented. It is not presented as a complete LBW adjudicator.

Each delivery is bounded to 1,680 simulation ticks (14 seconds), then called dead. Match inputs are bounded to 128 deliveries and 30 minutes. These safety bounds are house rules, not timed professional-cricket laws. QA must report whether routine accepted play hits the delivery cap.

## Explicitly not implemented

Full T20/ODI powerplays and quotas; branded hundred-ball formats; Test days/sessions/two innings per team; follow-on, declarations, new ball and draw clocks; rain reduction/DLS licensing; Super Overs; penalty-run adjudications; hit wicket, obstruction, handled-ball-related cases, retirement, concussion/substitute rules; bouncer warnings; complete dangerous-bowling laws; overthrows, relay throws and runner cancellation. These require new explicit versioned rule modules and independent tests. Unsupported format names are rejected by the current schema rather than relabeling this duel.
