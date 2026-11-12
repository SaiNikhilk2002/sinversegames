# Sinverse Cricket: remaining work

What is not done after the teams and formats milestone, and why. Status of what *is* done: `CRICKET_IMPLEMENTATION_PROGRESS.md`.

## Needs a decision or approval

| Item | Why it's blocked | What it needs |
|---|---|---|
| **Playable Test cricket** | A five-day match (about 2,700 balls) is longer than the 6-hour run token, the 512 KB submit body and one sitting | Server-side, resumable matches: a new table (additive migration), checkpointed segments verified in turn, and resume across devices. Approval for the migration and for how long matches are verified |
| **Production release** | Nothing here is deployed | The owner's decision. No migration is needed for T20 and ODI. The release changes cricket's stored details (`engine: 2` rows) and the solo runner's recovery |
| **Server CPU for ODI verification** | Re-verifying an ODI took up to about 1 s of CPU in the engine tests; the Workers plan's CPU limit isn't visible from the repository | Check the plan's limit (Workers Paid defaults to 30 s per request). If it is tight, verify long matches on the realtime service, or make the batting AI's running probes cheaper |

## Not yet built

| Item | Notes |
|---|---|
| Super Over (T20) and ODI tie-breaks | A tie is recorded as "Match tied" |
| T10, The Hundred, custom formats | `FORMATS` makes T10 a small addition. The Hundred needs 5-ball sets and a 100-ball innings in the scorebook |
| Choosing the opposition's XI | The opposition plays its catalogue XI |
| Rain, DLS, over-rate rules, the new ball, reviews (DRS) | Not modelled |
| Tournaments, series, career, per-format statistics | Phases F7 and F8 of the expansion plan. Per-format stat lines would need a migration |
| Player names on the 3D players' shirts | Kits wear team colours and the batting-order number; names appear in the HUD, broadcast cards and scorecards |
| Highlights of simulated passages | Simulated deliveries are summarised and scored, not replayed in 3D |
| Cross-device resume | Recovery is per browser tab, as for Cuisine Quest |
| Real team logos and flags | Deliberately not used: the catalogue is fictional, with original abstract emblems |

## Known limitations

- **Batting AI.** It leans on drives and occasional lofts. The engine's block shot is rarely used, because in this physics model it tends to carry to the slips. Its scoring patterns come from tuning, not from real match data.
- **Untested hardware.** Performance is measured on one laptop (RTX 3050) and headless SwiftShader. No physical phone, tablet or Safari was tested.
- **No visible innings timeline for Test cricket.** The engine computes days and sessions, but there is no UI yet.
- **Unearned wins.** A win the player didn't play enough of themselves is stored, but counts as neither a win nor a loss. Stored records keep the real result in `details.result`.
