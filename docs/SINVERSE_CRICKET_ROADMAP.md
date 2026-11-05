# Sinverse Cricket phased roadmap

## This milestone

Audit/preserve the platform; implement a real one/two-over solo duel with two innings, original teams/grounds, batting/bowling, field interception, scorecards, replay, quality controls and existing server-verified result persistence. Final status and acceptance evidence belong in [QA](SINVERSE_CRICKET_QA_REPORT.md), not this roadmap's ambitions.

## Next bounded milestones

1. **Rules and scorebook audit.** Independent cricket reviewer; broaden legal/statistical conventions, deliveries and dismissal tests; add left-handed models, overthrows, relay and keeper behavior. Do not claim comprehensive law compliance from duel tests.
2. **Character and animation production pass.** Improve topology, hand/bat contact alignment, shoulder/foot IK, keeper reach and dive/throw blends. Capture real browser clips on supported devices and resolve clipping/foot sliding before increasing asset count.
3. **Full limited-overs match.** Versioned T20 then ODI configurations, validated bowling quotas, powerplay field restrictions, realistic fatigue, configurable tie procedure and long-match save/recovery. Full-format labels stay unavailable until rules and browser campaigns pass.
4. **Series/tournament vertical slice.** Fixtures, standings/NRR and tie-breakers with resumable server-owned state, failure recovery and rollback/idempotency tests; reuse Player and existing reward ledger. Do not create another wallet.
5. **Career vertical slice.** Original created player, role/attributes, skill training and cosmetic-only rewards with explicit save schema/migration; preserve old guest/account data. No inert career screen or paid advantage.
6. **Test cricket.** Separate multi-innings/day/session engine, declarations, follow-on, new ball, drawn/innings results, interruptions and independently audited rules. This is not an overs parameter change.
7. **Existing Socket.IO multiplayer.** Authoritative Node tick loop, bounded sequenced intents, snapshot reconciliation, hidden future randomness, private-room ownership, disconnect/rejoin and two independent browser acceptance. Only then consider ranked queues, seasonal boards and anti-abuse review.
8. **Production device and performance pass.** Physical mobile/Safari/gamepad/accessibility testing, adaptive LOD, asset compression/streaming, Worker upload budget, load and account recovery after a separately approved release. Keep future Google/R2 verification separate from this game.

Rain adjustments require a specified rules/licensing decision; official competitions or real identities require rights review. Replay sharing needs privacy/storage/lifecycle design. No paid service, deployment, push, remote migration or official content is implied by this roadmap.

## Status after the visual polish (2026-11-05)

Item 2, the character and animation pass, is largely done in stylised form. Item 8 is still open and is now the most important next step: measure on real phones and hardware GPUs with the checklist in the [visual polish QA report](SINVERSE_CRICKET_VISUAL_POLISH_QA_REPORT.md), section 12.

Next visual work, based on what was found: confirm Medium and Ultra cost on real GPUs and tune them; review cut, pull and sweep at full speed; capture stumping, run-out and diving catch on screen; add left-handed players and dedicated keeper wide and diving clips; have someone listen to the audio mix.
