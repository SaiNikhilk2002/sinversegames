# Sinverse Cricket: international teams and multiple formats (assessment and plan)

**Status: plan only.** Nothing in this document is implemented. Phase 5 (presentation) is complete and pushed separately, and this expansion doesn't touch it.

## 1. What exists today

| Area | Today | Where |
|---|---|---|
| Format | One format, `"duel"`: 1 or 2 overs a side, single innings each | `packages/engines/src/sinverse-cricket/domain.ts` (`configSchema`, `version: 1`) |
| Teams | Two fictional sides (Harbour Lights, Ember Kites), 11 names each, no attributes | `content.ts` (`TEAMS`) |
| Rules | Pure scorebook reducer (`scoreDelivery`): runs, extras, wickets, change of ends, free hit | `rules.ts` |
| Ball physics | Deterministic, seeded, one `Delivery` per ball; fielding inside the engine | `physics.ts` |
| Match | `CricketMatch`: toss, innings, AI moves, `record`, `summary`; bowlers are fixed (players 7–8, one over each) | `match.ts` |
| Verification | The client submits the input log. The server re-simulates every ball from the seed (`verify`) | `apps/web/src/app/api/solo/submit/route.ts` |
| Verification limits | Log ≤ 129 entries, ball `seq` ≤ 127, match time ≤ 30 min (`t ≤ 1,800,000`) | `domain.ts` (`logSchema`, `ballLogSchema`) |
| Statistics | Generic per game (`PlayerGameStats`: played, wins, losses, points, best), plus per-match JSON (`MatchParticipant.details`) | `packages/db/prisma/schema.prisma` |
| Presentation | 14 actors, two kits, white ball, night or day venues | `apps/web/src/games/sinverse-cricket/` |

**Consequences:**

- **Long formats need sessions.** A T20 is 240+ legal balls, an ODI 600+, and a Test about 2,700. None fits a 129-entry, single-sitting, 30-minute log. Longer formats need resumable, checkpointed matches stored on the server: a new table, which means a database migration.
- **Engine constants are duel-specific.** The bowler choice, the hard-coded two-over limit and the single innings per side have to become format rules.
- **Old matches must keep verifying.** Every stored v1 match must re-verify with the same digests, so the change has to be an explicit engine version, not an edit to v1.

## 2. Design

### Engine versions

- `configSchema` becomes a discriminated union on `version`.
- `version: 1` is today's duel, frozen as is: same code path, same digests, same limits.
- `version: 2` carries `format`, `teams`, `xi` and `rules`.
- The submit route picks the verifier by version.

**Golden tests** pin a few hundred v1 deliveries and whole v1 matches before any change. They must stay byte-identical.

### Format rules as data (`FormatRules`)

| Rule | Covers |
|---|---|
| Innings | Innings per side (1 or 2); overs per innings (or none, for Tests); balls per over (6; The Hundred uses 5-ball sets in a 100-ball innings) |
| Extras | Wide and no-ball re-bowls; free hit after a no-ball |
| Powerplays | Over ranges, each with a maximum number of fielders outside the 30-yard circle |
| Bowling limits | Maximum overs per bowler (T20 4, ODI 10, Test none); no consecutive overs |
| Fielding restrictions | Applied when the field is set, so a restricted field can't be chosen in that period |
| Innings transitions | All out, overs done, target reached, declaration (Test), follow-on (Test, minimum lead 200; 150 / 100 / 75 for shorter matches) |
| Tie-breakers | Super Over (T20); a tie (ODI); "no result" when the match can't finish |
| DLS | A `revisedTarget` hook only. No DLS tables until a real, licensed or independently derived method is chosen. The game won't pretend to have one |
| Sessions and days (Tests) | Overs per session (30) and sessions per day (3, with lunch and tea), 5 days; a draw when time runs out |
| Result | Won by runs, won by wickets, tie, draw, or no result |

### Long matches

**Segment logs.**
- Each innings (Tests: each session) is a segment of up to 129 balls, verified on its own.
- Each segment starts from a checkpoint (state digest, scorebook and RNG position) that the previous segment's verification produced.
- The server stores the checkpoint, so a segment can't be replayed against a doctored state.

**Simulated overs.**
- The player can let the AI play passages of play: "simulate to the end of the session", or "simulate the opposition innings".
- The server runs the same deterministic engine from the seed, so simulated overs are verified by construction.

### Teams (`teams/`)

- **Identity.** Each team has an ID, name and short name, a palette (primary, secondary, accent), home and away kits, and an original emblem shape (abstract marks only, no crests or logos).
- **Squad.** Each team has a squad of 15 fictional players. A player has:
  - a name, role, batting hand and bowling type
  - attributes: batting (timing, power, defence), bowling (pace or spin, accuracy, variation), fielding and keeping
- **Attributes.** They scale engine inputs within narrow, tested bounds (for example ±8% on contact quality), so no team is broken and balance tests can measure it.
- **Selection.** The playing XI, batting order, captain and wicketkeeper are chosen from the squad, with validation: 11 players, exactly one keeper, and at least 5 bowling options for limited overs.
- **Extensibility.** Associate nations and custom teams use the same schema. Custom teams are stored per player, which means a migration.
- **Names.** The 12 nations named are used only as team names. Player identities are invented and checked against a list of real current internationals, so there are no likenesses, photographs or real names.

### Statistics

- A new `CricketStatLine` table: player, format, matches, innings, runs, balls, fours, sixes, outs, wickets, runs conceded, best figures, catches, run-outs, wins, losses and draws. It's a migration.
- It's written only from verified results. Existing `PlayerGameStats` rows and match history are untouched; they stay as the duel's record.
- Test matches add per-innings figures, partnerships, the follow-on, and session and day summaries, kept in the match's details JSON.

## 3. Phases

| Phase | Scope | Complexity | Depends on | Acceptance |
|---|---|---|---|---|
| **F1** Team catalogue | 12 teams, squads, attributes, kits as validated data; schema tests; no engine wiring | Medium | none | Schema validation and uniqueness tests; attribute distributions within bounds; no real names |
| **F2** Format rules | `FormatRules` for T20, ODI, Test, T10, The Hundred and custom, as data plus pure helpers (legal-ball counting, powerplay lookup, bowler-limit check, follow-on eligibility, result margin) | Medium | none | Unit tests for every rule in brief section G, against hand-worked examples |
| **F3** Engine v2 | Versioned config; a v2 `CricketMatch` driven by `FormatRules`; bowler rotation and limits; field restrictions; ties and the Super Over; declarations and the follow-on; segment checkpoints | High | F1, F2, **approval** | Golden v1 corpus unchanged; v2 property and balance tests; deterministic re-verification of every format |
| **F4** Server sessions | Resumable matches and segment verification; simulated passages | High | F3, **migration approval** | Migration tested on disposable databases; old history and progression untouched; resume and verify tests |
| **F5** Setup flow | Format, then home and away teams, venue, XI, captain and keeper, toss, settings, then start | Medium | F1, F2 (works before F3 for display) | Browser tests across the flow, phone and desktop |
| **F6** Format presentation | T20 and ODI broadcast identities; Tests with a red ball, whites, a session scoreboard and a quieter crowd | Medium | F5 | Visual review footage; graphics tests |
| **F7** Statistics and progression | `CricketStatLine` per format; Test match details | Medium | F3, F4, **migration approval** | Database tests; no change to existing profiles, wallets, cosmetics or achievements |
| **F8** Extra formats and modes | T10, The Hundred, custom, nets and practice, tournaments and series | Medium | F3–F7 | Per-format tests |

**Approval needed before F3, F4 and F7:**
- the engine version split
- the new tables and migrations (run only on disposable local databases until approved)
- the change to how long matches are verified

## 4. Implemented now

**F1, the team catalogue, as data only** (`packages/engines/src/sinverse-cricket/teams.ts`, tests in `packages/engines/test/cricket-teams.test.ts`):

- **20 teams.** The 12 full members (India, Australia, England, Pakistan, South Africa, New Zealand, Sri Lanka, Bangladesh, Afghanistan, West Indies, Ireland, Zimbabwe) plus 8 associates (Netherlands, Scotland, Nepal, United Arab Emirates, United States, Namibia, Oman, Canada).
- **Each team has:**
  - an ID, name and short name
  - a palette, home and away kits, and an abstract emblem
  - a squad of 15 fictional players
  - a default XI in batting order, a captain and a wicketkeeper
  - team ratings
- **Each player has:** a role, batting hand, bowling type, and batting, power, bowling, fielding and keeping attributes. Attributes are deterministic, bounded to 35–95, and differ by role and by team strength, with a tested spread of at most 12 rating points between the strongest and weakest sides.
- **Selection.** `validateSelection` checks a chosen eleven: 11 unique squad players, captain and keeper included, and enough bowling options.
- **Tests (7).** They cover:
  - identities and unique names
  - no name shared with a list of real internationals
  - attribute bounds and role fit
  - balance
  - selection rules and determinism
  - the existing duel teams being untouched

**Not wired in yet.** The match engine, the setup screen and the renderer still use the two duel teams, and no match can be played with these teams until F3 and F5. The catalogue changes no existing match, digest, replay or stored record.

Everything else in this plan (F2 to F8) is planned, not implemented.
