# Player progression design

2026-11-04. Existing XP/stats/history/achievement evaluation is reused for eight implemented games. Cuisine Quest adds a server-owned seven-kitchen passport; nine further expansion games remain gated on complete games.

## Durable progress

Player is the canonical identity. Per-game stats retain plays/wins/losses/best/total scores. Match and MatchParticipant retain validated outcomes and details; achievements store unique player/key unlocks. RewardLedgerEntry stores Sin Coins transactions. Add cosmetic inventory with one owned item per player/item and a server-validated equipped item per category.

Later additive tables: provider Account (`provider`, immutable provider subject, player ID; unique provider/subject), profile username, deletion request, daily challenge participation/claim, season definitions. Never infer account ownership from an unverified email. Never overwrite balances when a guest signs in.

XP formula stays compatible: 20 per recorded match/run plus 30 for a verified winning/completed outcome; level n starts at `50*(n-1)^2`. XP is not spendable. Economy rules are stricter than play counts: short, abandoned, aborted, duplicate and nonpositive-score runs do not earn coins. Row serialization prevents concurrent result updates from losing XP or a personal best.

## Achievement presentation and integrity

Keep every existing badge/key and earned row. Expand visual badge icons/tier labels using deterministic definitions, not claimed global rarity percentages. Earned and locked states show the exact condition. Unlocks are evaluated inside the outcome transaction from server-verified details and accumulated stats. A unique player/key unlock supports a one-time reward reference; replayed outcomes cannot grant it again.

Later milestones include first daily challenge, complete cuisine lesson/mastery, cooperative completion, and score thresholds. Do not add earnable-looking badges for games/features not yet shipped. Avoid punishing streak loss; optional streak displays never destroy earned progress or currency.

## Ranking design

All-time per-game boards use validated stats and deterministic player-ID tie-breaks after the selected metric and games played. Daily boards now aggregate best results per eligible player across the full UTC window before applying LIMIT. This replaces the arbitrary 500-result pre-dedup cap that could hide players. Daily ties use earliest recorded achievement, then player ID; the query also resolves one player's equal-score rows by participant ID. Global XP boards, weekly/monthly UTC windows, explicit seasons, and cuisine mastery rankings remain later complete slices, not variants of a UI filter with unchanged SQL.

Exclude currently banned/deleted identities consistently; a past expired ban should not hide a player forever. Return public display name/avatar cosmetics only, never provider subject/email/token. Explain score and ties next to each board.

## Ethical engagement

Optional challenges, clear session ends, replay choice, personal records and attainable cosmetic goals. No paid currency, transfer, redemption, loot boxes, urgency counters, compulsory streaks, break penalties, or push prompts. Add optional session-break reminders without blocking play when a future settings slice is implemented.

## Status

Baseline XP, game history and achievements are preserved. This slice adds concurrency-safe Sin Coins, useful cosmetics, transaction history, badge distinctions and corrected per-game/daily ranking queries. Google identity, usernames/uploads, daily challenge claims, seasonal/weekly/monthly/global boards and break reminders remain unimplemented until their own tests/UI are complete. See [EXPANSION_QA_REPORT.md](EXPANSION_QA_REPORT.md).

## Cuisine Quest passport

CuisineProgress is now implemented per player/level with best stars/score, completion and perfect-shift counts. All earlier kitchens need one saved star before a later start. Three stars marks mastery; the profile displays seven kitchens, up to 21 stars, best scores, earned badges and the six most recent cuisine runs. First-completion coins and per-cuisine PBs follow [the economy policy](SIN_COINS_ECONOMY.md#cuisine-quest-first-completion-policy).

Thirteen new badges use the existing unique achievement framework: seven cuisine masteries, first perfect plate, three-star service, perfect shift, no burns, a seven-plate <=120-second shift and all-seven completion. They require a verified successful shift; accumulated completion/mastery comes from the transaction's server progress. Existing 13 badges/XP remain. Cuisine-specific public rankings sort best score, stars and player ID, exclude active bans and expose no receipt/ledger history. No account-provider, global/weekly/monthly/season ranking or claim model is implied.
