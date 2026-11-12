# Proposed updates to AGENTS.md and CLAUDE.md

These edits have **not** been made. The owner asked that the root instruction files stay unchanged. Apply them to both files together, byte for byte, when `feature/cuisine-quest-showdown` merges.

## Corrections to existing lines

| Current text | Proposed |
|---|---|
| "a pnpm workspace for nine browser games" | "a pnpm workspace for eleven browser games" |
| "Multiplayer: Color Clash, Doodle Duel, Token Trail, Bumper Blitz." | "Multiplayer: Color Clash, Doodle Duel, Token Trail, Bumper Blitz, Chef Rivals, Kitchen Rush Co-op." |
| "Solo: Sinverse Cricket, Cuisine Quest, Kitchen Rush, Cascade Solitaire, Mahjong Garden." | Unchanged |

## New section

```markdown
## Cuisine Quest multiplayer and shared motion (2026-11-07)

`packages/engines/src/cuisine-quest/kitchen.ts` is the one cooking simulation. The campaign (`engine.ts`) and Chef Rivals (`rivals.ts`) both plan shifts through it. Golden replays in `packages/engines/test/fixtures/cuisine-quest-golden.json` pin campaign results. Regenerate them only for an intentional rules change, with `CQ_GOLDEN_WRITE=1`.

Chef Rivals (`chef-rivals`) and Kitchen Rush Co-op (`kitchen-rush-coop`) are room games with their own IDs, so their results never reach CuisineProgress. Both use server time only. They use the versioned events `kitchen:act` and `kitchen:tap`, which share the `cook` rate limit. Clients show an action as done only after a server view confirms it.

Kitchen Rush hands are keyed by cook, and a plate can be in only one cook's hands. Co-op views hide future guests.

They need realtime and web deployed together: realtime first, because it only adds games and events.

Motion uses the tokens and rules in `docs/SINVERSEGAMES_DESIGN_SYSTEM.md`. Route fades are opacity only, because a transform on a wrapper breaks fixed game screens. Decorative loops must also stop under `.low-effects`.

Evidence is in `docs/CUISINE_QUEST_EVOLUTION_REPORT.md` and `docs/RELEASE_READINESS_CUISINE_QUEST.md`.
```
