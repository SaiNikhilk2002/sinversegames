# Sin Coins economy and integrity

2026-11-04 design. Sin Coins have no monetary value, cannot be purchased for money, transferred, wagered or redeemed. No paid service is introduced. Existing reward ledger units convert in display **one-for-one**, with no data rewrite or balance reset.

## Earnings

Eligible outcome: server-validated `completed` reason, at least 30 seconds of play, positive score; solo also requires a completed/winning run. Aborted runs, instant banking, nonpositive scores and matches ending because others left receive no coins. Normal play stats/history can still record these outcomes.

- Eligible completion: 2 coins.
- Eligible winning/completed result: 10 additional coins.
- New personal best beyond an existing positive best: 3 additional coins.
- Newly earned achievement: 5 coins, once per player/achievement, on an eligible outcome.
- Maximum **80 total positive coins per player per UTC day** across these reward reasons, including achievements. Rewards may be capped partway and history shows the actual amount. A capped achievement reward is not deferred; document that behavior in the UI.

These are initial conservative values, not a tuned final economy. Measure match duration/earn rates before adjusting. Minimum duration and daily limits bound farming per identity but do not prove human input or stop multiple guest identities. Daily/season claim rewards remain disabled until dedicated server claim models exist. Cuisine Quest uses the existing result ledger with the first-completion policy below.

## Transactions and concurrency

The ledger is append-only and remains the balance authority (`SUM(amount)`); no client-sent balance/price is accepted. Each credit has a unique player/reason/refId. Each completed multiplayer match gets one server UUID at start, reused for all persistence retries. Solo run IDs already provide this identity. Duplicate result insertion rolls back the whole stats/reward transaction.

Lock affected Player rows in sorted ID order before reading/updating stats, XP, achievements, ledger, ownership or equipment. Purchases lock the same player's row before summing balance, validate catalog price server-side, insert a negative ledger entry plus inventory atomically, and reject insufficient balance. Unique player/item ownership and purchase reference make retries return Already owned without another debit. Locks serialize concurrent purchases and result credits; a failure rolls back all effects. Keep transaction/query budgets bounded and test against real PostgreSQL, not just mocks.

Catalogue definitions live in shared versioned code and contain stable IDs, category, fixed integer cost and visual treatment. Ship only profile frames and nameplate cosmetics that are actually rendered. Future card backs, table/kitchen themes, victory effects and brush decorations extend the catalogue/equip categories after their renderers exist; do not sell inert items or stroke-size advantages.

An owned item can be equipped or removed only by its authenticated owner. Equip never spends coins and cannot grant an unowned item. Default avatar/frame works without a database. Prices and rewards are not personalized; no randomized rewards or misleading scarcity.

## API and privacy

Authenticated wallet/history reads, same-origin POST mutations, rate limits, small strict request schemas, bounded fetches and clear database-unavailable failures. Browser sends only item ID/category intent, never player ID, reward, price or balance. Wallet history is private to the current session. Profile shows balance, inventory/equipment and links to the store. The store explains earning, cap and nonmonetary status.

Ledger history is cursor-paginated with deterministic createdAt/ID ordering. Index player/time/ID for this access path. Existing balances remain valid; ledger rows are never edited for purchase reversals. Any future refund is a uniquely referenced positive compensating entry, not deletion of a debit.

## Validation gate

Local database tests: eligible reward, cap and UTC rollover, duplicates/retries, concurrent XP/best updates, simultaneous purchases exceeding the combined balance, simultaneous same-item purchase, no partial debit/inventory on failure, equip ownership, another player's isolation, legacy ledger preservation, and disabled rewards. HTTP tests reject forged balance/price/player fields and missing/cross-origin sessions. Browser flow earns verified coins, checks history, buys/equips a cosmetic and sees it persist after reload.

Implementation and test results are recorded separately in [EXPANSION_QA_REPORT.md](EXPANSION_QA_REPORT.md).

## Cuisine Quest first-completion policy

Each cuisine awards the eligible completion/victory 2+10 only on its first successful saved completion. Replaying it can improve best stars/score but cannot repeat those base coins. A new per-cuisine best above an existing positive best can earn 3; a newly unlocked eligible badge can earn 5. The existing duration/completion/positive-score rules, disabled-rewards switch and shared 80/UTC-day cap apply. A failed shift never awards coins or advances campaign progress.

The same locked result transaction updates CuisineProgress, match/stats/XP, achievements and append-only ledger. Receipt metadata records the original actual awards; authenticated retries/receipt reads recover those values without minting another result. Public rankings remove receipt coin/unlock metadata. Concurrent first completions can each count as play, but only one receives first-completion coins; duplicate UUIDs cannot repeat any persisted effect. Real database rollback/concurrency tests and a lost-response browser save are recorded in [Cuisine Quest QA](CUISINE_QUEST_QA_REPORT.md).

## Connected player identity

Google linking and returning sign-in now resolve the same permanent Player ID; they never reconstruct a balance or move ledger rows. Registered sessions and cross-device recovery are documented in [authentication](AUTHENTICATION.md) and [identity QA](PLAYER_IDENTITY_PERSISTENCE_QA_REPORT.md). Real provider setup remains external. Different player accounts cannot merge or transfer coins.
