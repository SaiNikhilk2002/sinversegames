# Game expansion plan

Milestone 1 design baseline with Cuisine Quest implementation update, 2026-11-04. Implementation continues on `codex/takeover-and-reliability-audit`. Local checkpoint **4129552** preserves all 28 takeover files, including original Phase 2 changes and evidence. The pre-expansion Git inventory is retained in ignored `.data/expansion/`. Nothing has been pushed or deployed.

## Existing foundations and gaps

Seven playable games already share server-validated results, profile/history, XP, 13 achievements, and a small append-only reward ledger. Multiplayer engines receive injected clocks/randomness, redact private views, and use rooms/readiness/rematches. Solo engines replay signed, timestamped move logs. Next.js and realtime deploy independently; retain that split.

At the checkpoint, identity was a signed guest cookie; REGISTERED was only a reserved enum. There was no Google provider, account-linking framework, object storage, image upload, cosmetic store, or inventory. Wallet credits existed, but match persistence retries could generate new multiplayer match IDs. Concurrent stats/XP and future spending required serialization. Existing achievements already had visible earned/locked profile states, and all games had generated social PNG endpoints. This slice implements inventory/store, serialization, stable match IDs and corrected social copy. Identity remains guest-only; account recovery and uploads are still design work.

## Milestones and execution boundaries

1. **Product/architecture:** define all ten games in [GAME_CATALOGUE.md](GAME_CATALOGUE.md), progression/economy/account designs, migration strategy, and synchronized instructions. Do not register unfinished games as playable.
2. **Shared platform:** first complete a Sin Coins earn → history → purchase → equip vertical slice on existing validated results. Test real PostgreSQL concurrency, retries, ownership, and insufficient funds. Then implement Google identity, safe linking, usernames/deletion, secure avatars, broader rankings/challenges. Their designs do not count as implementation.
3. **Existing games:** circular Doodle brush preview on a clean canvas; mobile ready actions; joined users without placeholders; fresh match identifiers and session-isolated input; bounded completed-room grace. Integrate the existing seven games through the shared persistence path.
4. **New games:** implement Cuisine Quest first, one complete taught cuisine at a time; then Comet Courier, Circuit Grove, Lantern Ascent, Pocket Tides, Flux Circuit, Signal Shuffle, Keystone Council, Beacon Brigade, Arcforge Rally. Each must pass its own full gameplay/mobile/replay gate before catalogue activation. No superficial game shells or altered copies of existing games.
5. **Polish:** cohesive SinverseGames defaults, progression/store/badges, covers/social previews, navigation, performance. Preserve original vector/canvas art and synthesised audio; build on those assets.
6. **QA:** original 151 unit/integration and 25 browser cases plus new security/economy/lifecycle/gameplay cases; five typechecks, Node production builds, Linux OpenNext build. Record failures, interim attempts, and external limitations.

## Architecture decisions

- Keep the existing session and realtime-token model. Add Google identities to the same player IDs, never a parallel user database/session system. Design details: [ACCOUNT_AND_PROFILE_DESIGN.md](ACCOUNT_AND_PROFILE_DESIGN.md).
- Keep Sin Coins in the existing append-only ledger. Serialize economic operations with a player-row lock, make match IDs stable across persistence retries, and use unique purchase references plus inventory ownership. Never accept submitted balances/prices/reward amounts. Details: [SIN_COINS_ECONOMY.md](SIN_COINS_ECONOMY.md).
- Cosmetic catalogue is versioned code; ownership/equipment are database rows. Ship only items that change real presentation. New categories can be added without rewriting the wallet.
- Use one fresh match UUID per start, persist it, and attach it to room-scoped wire messages. Reject input for a different match, including versionless drawing/input events. Never reset to a reusable session identity.
- Completed-room expiry uses a fixed configurable deadline from match completion, independent of chat/ready/sync activity; starting a new match cancels it. Ordinary room/member cleanup still applies.
- Preserve schema/data through additive migrations. No destructive renames or currency reset: existing reward ledger units become Sin Coins one-for-one. No production migrations in this phase. Regenerate both Node/workerd Prisma clients.

## Backward compatibility and release order

Prepare inventory/equipment tables without deleting or rewriting existing balances or results. Validate migrations against a fresh local database and the existing local schema, and test a deliberately old positive ledger entry. For the future match-ID wire change, coordinate web and realtime in an approved maintenance release: an old open tab receives an actionable refresh error, never silently accepted stale gameplay. Do not loosen the protocol to make old unscoped actions valid.

Google/provider bindings and R2/processing services require user-managed external setup. Disabled/unconfigured integrations must fail clearly and leave guest play usable. Do not introduce a paid Images service without approval. Test credentials never authorize real production sign-in or production data access.

## Definition of a complete game

A tested engine plus its distinct production client, original cover/detail/tutorial, input/audio/reduced-motion support, difficulty curve, end/replay states, local desktop/mobile evidence, validated result persistence/history, Sin Coins and achievement integration. Multiplayer additionally needs two/multi-player tests, readiness, disconnect/reconnect, authorized restart, stale-event rejection, and cleanup. Planned concepts and engines without these gates remain explicitly unfinished.

## Current run

Milestone 1 documented. Active complete slices: Sin Coins/inventory/store and existing Doodle/lobby/lifecycle improvements. Google sign-in, uploaded avatars, expanded rankings/challenges, and nine further games remain scheduled work. Cuisine Quest now implements all seven cuisines and 28 recipes with a passing real campaign and full regression/build gates; acceptance is recorded in [CUISINE_QUEST_QA_REPORT.md](CUISINE_QUEST_QA_REPORT.md). Current validation/status belongs in [EXPANSION_QA_REPORT.md](EXPANSION_QA_REPORT.md).
