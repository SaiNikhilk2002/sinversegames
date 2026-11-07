# Sinverse Cricket Universe: roadmap

Status as of 2026-11-07:

- Phase 0, the audit, is complete.
- No gameplay has changed yet.
- Branch `feature/sinverse-cricket-universe` is based on Cricket 2 at `dc4eda6`. See the architecture document for why.

Every phase must be independently testable, reversible, and run with no production changes.

## Phases

| Phase | Delivers | Depends on | Size |
|---|---|---|---|
| **0. Audit** | These three documents | none | Done |
| **1a. Safety net** | Golden replays pinning version-1 cricket outcomes, and a verification cost benchmark | 0 | Small |
| **1b. Rules as data** | `FormatRules` with a version-2 config and log, bowler quotas, squad-based bowling and powerplays. A solo T20 with played and simulated overs | 1a | Large |
| **1c. Core realism** | Left-handed batting, hook and reverse sweep, bowling styles with distinct actions and physics parameters, fatigue, more varied reactions chosen deterministically, scoreboard and graphics for new events | 1a, 1b | Large |
| **2. Teams and competitions** | Original catalogue of teams, squads, attributes and venues. Competition, season and format catalogue with source and status. ODI, then Test with follow-on and declarations. Real-world data packages, disabled pending a licence decision | 1b | Large |
| **3. Multiplayer 1v1** | Server-authoritative cricket room engine, private rooms with code and link, reconnect, rematch, results through `recordMatch` | 1b. Railway deploy alignment at release | Large |
| **4. Tournaments** | Tournament engine (groups, knockouts, net run rate, tie-breakers), user tournaments, standings, history | 2, and 3 for friend tournaments | Large |
| **5. Progression** | Cricket statistics, cosmetic kits, bats and celebrations through the existing inventory and ledger. Rivalries. Spectating if the room layer gains observers | 2, 3, 4 | Medium |

2v2 needs latency results from Phase 3 first.

### Why this order

| Phase | Reason |
|---|---|
| 1a first | Nothing should change saved outcomes unnoticed |
| 1b before everything else | Every format, competition, tournament and multiplayer mode needs rules as data and a log that can describe a long match |
| Real-world data separate | It needs both verification and a licence decision, which can happen in parallel with engineering |
| Multiplayer before tournaments | Friend tournaments need it |

## Testing strategy

| Layer | Tests |
|---|---|
| Rules | Pure tests per rule: quota, powerplay, follow-on, declaration, ties, super over. Golden replays for version 1 |
| Simulation | Deterministic seeded simulated overs, verified exactly on replay. Distribution tests so simulated scores fall in documented ranges |
| Server | Verification cost per format in Node, and in workerd before release |
| Realtime | Real-socket matches with separate signed identities: retries, forged intents, stale matches, disconnects, reconnects, rematches |
| Database | Results, statistics and tournament advancement on disposable `*_test` databases, applied once by match UUID |
| Browser | Complete solo T20 and ODI with simulated overs, a shortened Test, two separate browser identities for 1v1, a tournament from fixtures to final, plus regressions for Cricket 2 and every other game |
| Devices | Physical phones and Safari, reported as untested until actually done |

## Decisions needed from the owner

1. **Real-world content.** Ship original content only until rights are confirmed (recommended), or seek licences first? Without licences, the IPL and international catalogues can be built as structure but not shown with real names.
2. **Base branch.** Confirm building on Cricket 2, which means rebasing after PR #4 merges.
3. **Long formats.** Accept played and simulated overs as the way to support ODI and Test.
4. **Friends.** Is room codes and links enough for now? A friend system would be a platform feature for all games.

## Next step

Phase 1a then 1b, beginning with golden replays of the version-1 duel. Nothing in Phase 1 needs a licence decision.
