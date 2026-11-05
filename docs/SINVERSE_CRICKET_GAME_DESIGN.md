# Sinverse Cricket - first playable duel

The first milestone is a complete solo **custom one- or two-over duel**, with two innings. It is a foundation for the flagship, not a claim that full T20, ODI, Test, career or multiplayer is finished. Preserve the existing eight games and platform services.

## Player experience

Choose Harbour Lights or Ember Kites, Lantern Oval at night or Tideglass Park by day, scheduled overs and opposition skill. Both original teams have eleven fictional named players. The opening pair and two eligible bowlers are assigned from that roster; XI editing is future work. Call the seeded toss and specify bat/bowl if you win. The opposing captain chooses independently if it wins.

The player controls batting in one innings and bowling in the other. Six **legal** deliveries make an over; wides and no-balls are rebowled. Chase ends when the target is reached. A level completed match is tied; there is no Super Over in the duel. Display actual scores, target, run rates, partnerships, legal balls, batter/bowler records, extras and fall of wickets. The scorebook and result are computed by the domain engine.

Batting combines eight implemented shot profiles, direction, power, footwork, face angle and a live swing. Bat coverage and an oriented impulse decide contact; no input selects a four or six. Footwork affects the contact plane and grounding. Running requires a fresh request per run; committed runs cannot be cancelled in this slice. Field pickup/throw time and runner distance determine run-outs.

Bowling uses line, length, pace/flight, eight seam/spin choices and a release meter. Release timing changes execution and landing-foot position; overstepping costs a no-ball/free hit. Three field presets change actual interception positions. The AI chooses variation/line from match situation and recent play, and aims batting at gaps with difficulty-dependent execution error. It never reads a later human swing. It remains a bounded tactical policy, not a complete professional strategy model.

## Controls and presentation

Space performs the contextual action; R requests a run, P opens last-delivery replay, C cycles camera and Escape pauses. Equivalent touch buttons remain visible. Gamepad A/B/X/Start map to action/run/replay/pause; controller coverage beyond browser polling is partially verified until tested. Relaxed presentation slows the clock driving fixed steps, not the laws or physical parameters. Touch, keyboard, focus handling and actual viewports require browser acceptance.

The game occupies a full-viewport layer with score, scene and compact controls. Pause and hidden-tab handling stop simulation. Replay is read-only and uses recorded frames, speed selection, scrub and camera choice. Event replays may be skipped or disabled; reduced motion suppresses automatic cinematic transitions. Quality settings and a playable 2D tactical projection handle device differences.

All stadium geometry, articulated characters, kit patterns, cover art and synthesized sound are original code-native work. This is a stylized procedural art direction. Detailed motion capture, cloth simulation, photorealistic faces, broadcast commentary and production animation polish are not claimed.

## Platform contract

The existing solo runner issues a signed seed/config/run UUID. Submission replays cricket inputs on the server. Scores, match history, XP, existing leaderboards, achievements and Sin Coins use the permanent Player and existing transaction/ledger. Winning eligible duels use the existing solo reward policy and 80-positive-coins UTC-day cap; failed/tied duels do not earn completion coins. Cricket ties count as played without incrementing wins or losses. No parallel account, wallet or cricket currency exists.

The score normalizes batting runs and bowling wickets by scheduled overs, with a win bonus. The initial generic board mixes difficulties; it is a provisional solo score board, not a ranked esports ladder. Career, tournaments, cricket cosmetics sales, daily claims, licensed teams and synchronous opponents have no inactive UI pretending to implement them.

See [architecture](SINVERSE_CRICKET_ARCHITECTURE.md), [rules](SINVERSE_CRICKET_RULES.md), [assets](SINVERSE_CRICKET_ASSET_GUIDE.md), [QA](SINVERSE_CRICKET_QA_REPORT.md) and [next phases](SINVERSE_CRICKET_ROADMAP.md).
