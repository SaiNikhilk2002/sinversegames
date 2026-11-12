# Sinverse Cricket Universe: current architecture and target design

This is the Phase 0 audit. It was checked against code on `feature/sinverse-cricket-universe`, which is based on the pushed Cricket 2 head `dc4eda6`, not only against documents. The roadmap is in [SINVERSE_CRICKET_UNIVERSE_ROADMAP.md](SINVERSE_CRICKET_UNIVERSE_ROADMAP.md) and the risks in [SINVERSE_CRICKET_UNIVERSE_RISK_REGISTER.md](SINVERSE_CRICKET_UNIVERSE_RISK_REGISTER.md).

## Why this branch is based on Cricket 2, not `main`

The brief suggests branching from `main`. All Cricket 2 work, including controls, the 3D toss, camera direction, reactions and the Cloudflare fixes, exists only on `feature/sinverse-cricket-2`, which is PR #4 and still open. Branching from `main` would start from the older presentation and duplicate or conflict with that work.

This branch starts at the pushed commit `dc4eda6`. It doesn't touch the Cricket 2 worktree or its three uncommitted documents. If PR #4 changes before merging, this branch rebases onto the merged result.

## Current architecture

```
packages/engines/src/sinverse-cricket   pure, deterministic, browser and server safe
  domain.ts   constants, Zod schemas (config v1, shot, bowling, toss, ball log), outcome adjudication
  physics.ts  Delivery: 120 Hz ball, bat contact, edges, field interception, catches, throws, digest
  match.ts    CricketMatch: seeded toss, AI bowling, batting and field choices, innings, input log, verify()
  rules.ts    scoreDelivery: the scorebook reducer
  content.ts  2 original teams, 2 original venues, field presets, licence gate (fails closed)
apps/web/src/games/sinverse-cricket     presentation only, Three.js 0.187
  scene.ts, stadium.ts, character.ts, animation.ts, director.ts, ceremony*.ts, tactical.ts, input.ts
  cricket-game.tsx  setup, HUD, input, match loop, replay, result
Server: shared solo API  /api/solo/start, /api/solo/submit  (signed run, replay verification, recordMatch)
```

### Functionality inventory

| Area | What exists | Evidence |
|---|---|---|
| Format | One "duel" format: 1 or 2 overs, two innings, house playing conditions | `configSchema` (`format: "duel"`, `overs: 1 \| 2`) |
| Teams and venues | 2 original teams of 11 fictional names, and 2 original venues | `content.ts` |
| Batting | 8 shot kinds (`defend, straight, cover, on-drive, cut, pull, sweep, loft`) with direction, power, foot, face and timing tick | `shotSchema` |
| Bowling | 8 variations (`seam, inswing, outswing, slower, offbreak, legbreak, googly, topspin`) with line, length, speed and release | `bowlingSchema` |
| Dismissals | Bowled, caught, LBW, run-out, stumped. Wides, no-balls, free hits, byes and leg byes | `domain.ts`, `rules.ts` |
| Running | Up to 3 run calls per ball | `runAt` max 3 |
| Fielding | 9 fielders in 3 presets; run, dive, catch, pickup, throw and drop actions | `Fielder`, `fieldPositions` |
| Presentation | 3D scene with quality tiers, instanced crowd, director cameras, 3D toss ceremony, grounded reactions, recorded-frame replay, tactical 2D fallback | Cricket 2 report |
| Input | Keyboard (remappable), touch swipe, standard gamepad, assist controls | `input.ts` |
| Integrity | Server replays every input. Digest per ball. Presentation data never enters the digest | `match.ts verify` |
| Rewards | Existing `recordMatch`, 3 cricket achievements, Sin Coins ledger with the daily cap; ties are neutral | `progression.ts`, `repositories.ts` |
| Licensing | `AssetProvenance` and `ContentLicense` with a fail-closed `licensedContent()` | `content.ts` |

Not present anywhere in the codebase:

- T20, ODI or Test rules.
- Squads, playing XIs or player attributes.
- Competitions, tournaments, fixtures or points tables.
- Cricket statistics beyond per-match details.
- Friends or invitations beyond room codes.
- Spectating.
- Cricket multiplayer.
- Left-handed batting.
- A hook shot or reverse sweep.
- Per-bowler actions or fatigue.

### Reusable systems

| System | Reuse for |
|---|---|
| `Delivery` physics and `adjudicate` | Every format. The ball-level model doesn't change with match length |
| `CricketMatch` input log and `verify` | Solo play in all formats, after a versioned log design |
| Signed run tokens and `recordMatch` | Solo results and rewards. Idempotent by match UUID |
| Realtime `Room` and `GameEngine` contract | Cricket multiplayer. Proven again by Chef Rivals and Kitchen Rush Co-op on another branch |
| Matchmaker, reconnect grace, rematch, lobby | Private and public cricket matches |
| Player identity, profiles, cosmetics, ledger | Progression, without a second currency or account system |
| Licence gate | Real-world data and assets, which stay disabled until rights are confirmed |
| Renderer, director, quality governor | Presentation in every mode |

## Measured constraints

| Constraint | Current value | Effect |
|---|---|---|
| Server verification cost | Median 0.76 ms per delivery: Node 24 on this laptop, 5 two-over fixture matches, while other work was running | Full T20 about 0.2 s, ODI about 0.5 s, one Test day of about 540 balls about 0.4 s. Affordable, but Cloudflare Worker CPU limits depend on the plan, and the plan isn't recorded in the repository |
| Log size | `logSchema` max 129 entries; ball `seq` max 127; `t` max 1,800,000 ms (30 minutes) | A T20 (240+ deliveries) can't be submitted today. Needs a versioned log, not a widened v1 |
| Human playing time | About 15-25 s per delivery, with presentation | A hand-played T20 takes about 1-1.5 hours, an ODI 3-4 hours, a Test days. Long formats need played and simulated overs |
| Rendering | Software-GPU only: Low median 50 ms per frame on desktop. No physical-device data | Graphics tiers exist. Real devices must be measured before new visual cost is added |
| Bowlers per innings | 2 (players 6-7) | Over quotas (4 in T20, 10 in ODI) need squad-based bowling |

## Target design

### 1. Format and rules as data

A versioned `FormatRules` object drives a match, so code doesn't branch on format names:

```
FormatRules {
  id, version
  innings: 1 | 2
  oversPerInnings: number | null       // null for Test
  ballsPerOver
  bowlerQuota: number | null
  powerplays: { from, to, fieldersOutside }[]
  freeHitOnNoBall
  tie: "neutral" | "super-over" | "bowl-out"
  followOn: { minimumLead } | null
  declarations
  days: number | null
  sessionsPerDay
  substitutes: { kind: "impact" | "concussion" | "none"; perTeam }
}
```

Competitions refer to a rules id and version. A tournament's official rules override user settings, and the setup screen only shows options the rules allow.

### 2. Played and simulated overs, verified together

Long formats can't be played delivery by delivery. A deterministic statistical simulator decides simulated deliveries, using the same seed, team attributes and match state.

The log records which overs were played and which were simulated. The server replays played deliveries through physics, and recomputes simulated ones exactly.

Players choose how much to play: every ball, key moments, or chosen overs. Rewards stay tied to played and verified events, so simulating can't farm rewards.

### 3. Log and engine versioning

`configSchema.version: 2` gets new schemas: larger bounds, simulated-over entries and periodic checkpoints. Version 1 stays readable and verifiable forever, so old runs and Cricket 2 results remain valid.

The golden-replay technique already used for Cuisine Quest pins version-1 outcomes before any engine change.

### 4. Squads, players and attributes

| Entity | Notes |
|---|---|
| `Player` | Cricket player, not the platform account. Original or licensed identity, handedness, roles, styles and an attribute block |
| `Squad` | Season-scoped list of players for a team |
| `PlayingXI` | Chosen from a squad, with captain, wicketkeeper and batting order. Validated against format rules |

Attributes are bounded modifiers on input windows and physics. For example:

- Timing widens the good-contact window.
- Power raises carry.
- Accuracy tightens release spread.

Caps keep skill dominant, so a well-timed shot from a weaker batter still beats a mistimed one from a stronger batter. Paid cosmetics never touch attributes.

### 5. Competition data model

Static catalogue data lives as versioned JSON in the engine package, the same way recipes do. Each record has:

- `id`, `version`, `season`
- `source` (URL)
- `retrievedAt`
- `status`: verified, provisional or unavailable
- `licence`: a licence reference, or `original`

Covered entities: Competition, CompetitionSeason, FormatRules, Team, TeamSeason, Player, PlayerRegistration and Venue.

Per-player state goes in database tables, through additive migrations:

- User tournaments, their participants and fixtures.
- Saved match checkpoints.
- Cricket statistics.

### 6. Tournament engine

This is a pure package with no cricket physics: the same engine can run any results source. It covers:

- Fixtures for round robin, groups and knockouts.
- Points tables, with net run rate from overs faced and bowled.
- Configurable tie-breakers and super overs.
- Bracket progression.

Server-owned tournament state advances only from recorded match results, and each result is applied once by match UUID.

### 7. Multiplayer control model

| Mode | Control model | Precondition |
|---|---|---|
| 1v1 | Each user controls one whole team: batting when their side bats, bowling and fields when it bowls | Server-run `Delivery` at 120 Hz. Bowling and shot intents are timestamped, with input windows widened for latency |
| 2v2 | One teammate bats while the other picks field and bowling, then they swap each over | Only after 1v1 latency results are measured |
| Spectator | Read-only view stream | Room support for non-players, which doesn't exist yet |

A delivery takes about 3-6 s of simulated time and only two intents matter: the release and the shot commit. That suits a server-authoritative design with client prediction for display, as the duel and Chef Rivals already do.

### 8. Licensing

The default product ships only original teams, players, kits and venues. Real competitions, franchises and player names are data packages. They're enabled only when `licensedContent()` finds a valid, in-scope, unexpired grant with a permission reference. Logos, photos, likenesses, official kits and broadcast graphics are never sourced or recreated. See risks R1 and R2.

## Database impact

Everything is additive, with no change to existing tables' meaning:

| Phase | Tables |
|---|---|
| 2 | Optional cache of the catalogue, if it's ever editable at runtime. Otherwise none |
| 3 | None. Rooms are in memory and results use `Match` and `MatchParticipant` |
| 4 | `CricketTournament`, `CricketTournamentEntry`, `CricketFixture` |
| 5 | `CricketPlayerStats`, keyed by account, competition, season and format |

Existing cricket results stay in `MatchParticipant.details`, and statistics can be backfilled from them. Migrations run only on disposable local test databases, and production migrations need explicit approval.

## Realtime impact

- New game ID `sinverse-cricket-duel` (multiplayer), separate from the solo ID, so solo statistics and rewards keep their meaning.
- A versioned `cricket:intent` event with its own rate limit.
- An engine tick that steps the active delivery and sends compact frames.
- The web app and Railway must deploy together. Railway runs `2aeab76` today. Evidence: the GitHub deployment record and the realtime process start time.
