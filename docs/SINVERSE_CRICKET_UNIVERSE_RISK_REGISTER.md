# Sinverse Cricket Universe: risk register

Likelihood and impact use High, Medium and Low. The owner is "Owner" when a decision belongs to the product owner rather than engineering.

| ID | Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | **Using real competitions, franchise names and player names without rights.** IPL, ICC, BCCI and franchise marks, player names and likenesses are commercially licensed in games. Using them could infringe or imply endorsement | High | High | Ship original content by default. Real data is held behind the existing fail-closed licence gate and stays off until legal review confirms each use. Logos, photos, likenesses, official kits and broadcast graphics are never recreated | Owner and legal |
| R2 | **Stale or wrong real-world data.** Rosters, formats and team counts change every season | High | Medium | Season-versioned data with source, retrieval date and status. Anything unverified is marked provisional or unavailable, and nothing is invented | Engineering |
| R3 | **Breaking existing cricket results.** An engine change could alter version-1 outcomes and invalidate saved runs | Medium | High | Pin version-1 behaviour with golden replays before any change. New behaviour only under config version 2 | Engineering |
| R4 | **Long formats are unplayable by hand.** Hours per ODI, days per Test | High | High | Played and simulated overs, verified together. Save and resume | Engineering |
| R5 | **Reward farming through simulation.** | Medium | Medium | Rewards come only from played, verified events, under existing caps | Engineering |
| R6 | **Worker CPU limits on long-match verification.** About 0.5 s for an ODI was measured on Node; the Workers plan limit isn't recorded | Medium | High | Measure in workerd. Verify in checkpoints, or move long-match verification to the Node realtime service if needed | Engineering |
| R7 | **Multiplayer feel under latency.** Release and shot timing are precision inputs | High | High | Server-stamped intents with latency-compensated windows. Measure real round trips before committing to 2v2 | Engineering |
| R8 | **Web and realtime version skew.** Railway runs `2aeab76` | High | High | Versioned protocol, deploy realtime first, refresh prompt on mismatch | Owner, at release |
| R9 | **Cricket 2 not merged.** This branch depends on PR #4 | Medium | Medium | Rebase after merge, and keep changes away from Cricket 2's files where possible | Owner |
| R10 | **Rendering cost on real phones.** Only software-GPU data exists | High | Medium | Physical-device measurement before adding visual cost. Respect quality tiers | Owner and engineering |
| R11 | **Scope.** The brief spans several products | High | High | One independently testable phase at a time. Nothing labelled playable until tested end to end | Engineering |
| R12 | **Rules correctness.** Follow-on, declarations, DLS and impact substitutes are intricate | Medium | Medium | Rules as data with explicit tests. Independent cricket review before claiming compliance. DLS is out of scope until the method is licensed or specified | Engineering and owner |
| R13 | **Abuse in user-created tournaments.** Names, invitations, spam | Medium | Medium | Existing moderation and rate limits, name validation and participant caps. No paid entry or prizes | Engineering |
| R14 | **Database growth from per-ball statistics.** | Low | Medium | Store aggregates per match, not per-ball rows | Engineering |
| R15 | **No friend system.** "Invite friends" would need a social graph | Certain | Medium | Room codes and links first. A friend system is a separate platform decision | Owner |
