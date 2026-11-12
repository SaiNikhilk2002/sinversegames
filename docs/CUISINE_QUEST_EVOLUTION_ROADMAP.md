# Cuisine Quest: World Chef Showdown, evolution roadmap

Tagline: Cook. Create. Compete. Become a Legend.

This is the living plan for growing Cuisine Quest into single-player, competitive and cooperative play, and for the platform-wide motion work that shares its tokens. Test evidence lives in [CUISINE_QUEST_EVOLUTION_REPORT.md](CUISINE_QUEST_EVOLUTION_REPORT.md). Visual rules live in [SINVERSEGAMES_DESIGN_SYSTEM.md](SINVERSEGAMES_DESIGN_SYSTEM.md).

Nothing here is released. Work is on the local branch `feature/cuisine-quest-showdown`, based on `main` at `2aeab76`.

## Status

"Playable" means tested through the real client and server locally. See the report for current results.

| Stage | State |
|---|---|
| Implemented locally | Yes |
| Tested locally | Yes. Full browser suite 92 passed, 0 failed, 1 skipped, plus later targeted reruns ([release readiness](RELEASE_READINESS_CUISINE_QUEST.md)) |
| Hosted Preview verified | No. Blocked on PR #4 Cloudflare fixes and a non-production realtime service |
| Production deployed | No |

### Workstream A: cooking gameplay

| Item | Status |
|---|---|
| Campaign foundation: shared kitchen, ranks, seals, mastery | Done |
| Multiple visible chefs cooking at once | Done in Chef Rivals and Kitchen Rush Co-op |
| Chef Rivals 1v1 | Done. 2v2 and free-for-all not started |
| Kitchen Rush Co-op, 2-4 players, seven kitchens | Done. Kitchens are all open from the lobby; saved kitchen progression not started |
| Mode menu showing only playable modes | Done |
| Lobby, ready, room code, rematch, reconnect | Existing shared lobby. Chef-specific previews not started |
| Mystery Basket | Superseded for now by Chef Rivals, which uses the same design. A 3-4 player version is a config change plus scoring work |
| Chef's Spotlight, Culinary Runway | Judging reveal exists in Rivals. Theme-based creative mode and voting not started |
| Kitchen Brigade | Largely covered by Kitchen Rush Co-op. Fixed roles not started |
| Chef customization | Each player gets a stable generated look. Choosing outfits, emotes and victory poses not started |
| Practice Kitchen, Daily Challenge, ranked play, friends | Not started. No friend system exists |
| My Restaurant | Not started |

### Workstream B: platform motion

| Item | Status |
|---|---|
| Visual audit | Done, below |
| Design system document, colour and motion tokens | Done |
| Low effects setting | Done |
| Route fades | Done |
| Branded game loader | Done |
| Game cards | Focus and press states added to the existing hover lift. Animated artwork not started |
| Migrating existing screens to the tokens | Not started |
| Game-specific motion in the seven older games | Not started. Only the audit is done, to avoid risking gameplay in this batch |
| Sinverse Cricket | Deliberately untouched. Its work is on the Cricket 2 branch |
| Physical device testing | Not done |

## Milestone 0: architecture audit

### What exists and works

| Area | Where | State |
|---|---|---|
| Campaign | `packages/engines/src/cuisine-quest` | 7 kitchens, 28 recipes, 21 stars. Six guests request seven plates per shift |
| Mechanics | same | Ordered ingredients and portions, gesture paths, exclusive stations, heat, flip and stir windows, plating, finishes, two active batches |
| Determinism | same | Integer heat integration with injected time. Replays don't depend on frame rate |
| Verification | `apps/web/src/app/api/solo/submit` | Signed run token, then server replay of the intent log. Clients never send a score |
| Saved progress | `CuisineProgress`, `MatchParticipant.details` | Stars, best score, run counts, one receipt per run |
| Economy | `packages/db/src/repositories.ts` | One append-only ledger, 80 coins per UTC day, idempotent by match UUID |
| Achievements | `packages/db/src/progression.ts` | 13 Cuisine Quest badges, including mastery of each cuisine, perfect shift, speed and all seven |
| Art and audio | `apps/web/src/games/cuisine-quest` | Original code-drawn food and kitchens, seven original music motifs |
| Realtime | `apps/realtime` | Socket.IO rooms: codes, ready state, host handover, reconnect grace, rematch, public matchmaking, per-player views, action idempotency |

### Findings that shape the plan

1. **The engine was already close to reusable.** Campaign specifics were limited to order construction, a few constants and star rules. Milestone 1 separated them without changing any result.
2. **`cuisine-quest` can't be a room game ID.** `recordMatch` sends every `cuisine-quest` result to `recordCuisineProgress`, which expects a campaign level and enforces unlock order. Multiplayer needs its own game ID, or it would corrupt campaign progress or fail to save.
3. **A tap can beat a drag.** The "Follow marker" button sends exact coordinates, so it always scores perfectly, while a real drag loses quality with distance. That is fine as an accessibility path in solo play, but it makes gesture accuracy unusable as a competitive score source.
4. **Coaching reveals every correct step.** `questHint` and the `data-next-*` attributes name the next action. Recipes must be public in any mode, so competitive skill has to come from multitasking and timing, not from knowing the answer.
5. **Campaign difficulty is fairly flat.** Patience and arrival timing barely change by kitchen. Flawless fixed-pace runs take 70-81 s in all seven. Complexity comes from recipes, portion choice from kitchen 5 and impatient guests from kitchen 3. Rebalancing would change what stars mean, so it needs a deliberate decision.
6. **Replay proves a run was possible, not that a person played it.** A script can pace itself to pass. Rewards are capped and non-monetary, so this is tolerable, but competitive rankings will inherit it.
7. **Per-recipe data wasn't saved.** Recipe mastery needed either a new table or a new field in run details. Milestone 1 uses run details.
8. **Realtime gaps for cooking:**
   - No protocol version field exists on messages.
   - An unlisted game event falls into the `room` rate limit (4 per second), and gestures alone can reach about 7 per second.
   - `Room` sends every player a full view on each state change, which is too heavy for per-gesture cooking.
   - Rooms live in memory, so a server restart ends matches. That's safe for rewards, because nothing is saved, but players lose the match.
9. **No friend system exists.** "Friends" appears only in marketing copy. Invitations can be room codes and links until one is built.
10. **Creativity isn't modelled.** Recipes are fixed sequences, so nothing a player does today could be scored as creative. Chef's Spotlight needs new content and rules, not just a new screen.

### Safe parallel work

- Isolated worktree: `D:\dev\games-cuisine-quest`, branch `feature/cuisine-quest-showdown`.
- Based on `origin/main` rather than Cricket 2. No Cuisine Quest code depends on that branch, and at the last check the two branches changed no files in common.
- The root `AGENTS.md` and `CLAUDE.md` weren't changed, as this assignment instructs, even though they normally ask for status updates. **Their Cuisine Quest status needs updating when this branch merges.**

### Multiplayer and motion audit (second directive)

| Question | Finding at the start of this work |
|---|---|
| Existing modes | Solo campaign only for Cuisine Quest. Kitchen Rush solo, 12 levels |
| Multiplayer infrastructure | Rooms, ready state, reconnect, rematch and matchmaking all reusable with no changes to `Room` |
| Simultaneous chef characters | None. Only customers had animated figures |
| What Chef Rivals needed | A room engine over `kitchen.ts`, server time, a new action event, rival summaries and a chef renderer |
| What co-op needed | Kitchen Rush already keyed hands by cook. It needed a plate lock, team rules and a shared-kitchen client |

Animation infrastructure already in place:

- `motion` 12, used in 16 files, including a shared navigation underline, modals, toasts and result sequences.
- About 35 CSS keyframes in `globals.css`, mostly game-specific, using transforms and opacity.
- Three.js for Sinverse Cricket only.
- A reduced-motion setting and OS preference, both respected. A `kr-lite` mode existed only inside Kitchen Rush.

Visual inconsistencies:

| Area | Finding |
|---|---|
| Colour | Games hard-code many colours (Cuisine Quest about 500 hex values, Kitchen Rush about 370, Cricket about 220). That's reasonable for illustration, less so for interface |
| Style | Cuisine Quest uses a paper passport look, Kitchen Rush a chunky diner look and Cricket a broadcast look. These are good identities, but they share few interface parts |
| Theme | Dark by default, which contributes to the platform feeling dark. A change here needs a product decision |
| Timing | No shared durations or curves until now, so each surface picks its own |
| Results | Three different patterns: the shared panel, the solo runner and game-specific ones |

Motion risks to keep watching:

- Whole-page SVG on the homepage: over 4,000 elements were measured earlier.
- A transform on any wrapper breaks `position: fixed` game screens.
- Per-frame React updates in games. New clients repaint at most ten times a second and animate with CSS.

Game-specific motion plan, in the order proposed:

1. Result screens across games, using one count-up and celebration.
2. Color Clash, Token Trail and Mahjong Garden, where card and tile movement is most visible.
3. Bumper Blitz impact feedback, Doodle Duel guess and round moments, Cascade Solitaire completion.
4. Sinverse Cricket only after Cricket 2 merges, and only after auditing current behaviour.

## Shared architecture

```
content.ts    recipes, cuisines, stations, pantry: the one source of truth
kitchen.ts    the simulation: ShiftPlan -> state, intents, time, scoreShift
engine.ts     campaign: kitchen plans, stars, solo replay verification
journey.ts    replay goals, read from verified run details
rivals.ts     Chef Rivals room engine: one kitchen per chef, same plan
kitchen-rush/coop.ts   co-op room engine: one shared Kitchen Rush kitchen
```

Rules for every mode:

- The simulation stays free of sockets, React and databases, and time is always passed in.
- The same plan gives every player the same conditions.
- Scores come only from simulated events. Clients send intents.
- Rewards go through `recordMatch` and the existing ledger, keyed by match UUID.
- Cosmetics never reach the simulation.

## Milestone 1: single-player foundation

Delivered:

- `kitchen.ts`, with `ShiftPlan` and configurable seats, batches, opening orders and an optional hard time limit, plus one scoring function with a breakdown.
- Golden replays proving saved results are unchanged.
- Chef ranks from saved stars: Commis Chef, Line Cook, Sous Chef, Head Chef, Executive Chef, World Chef.
- 21 chef's seals, three per kitchen: Spotless service, Beat the clock and Signature shift.
- Recipe mastery: apprentice, skilled, master.
- A results screen showing the score breakdown, each plate's quality and the seals.
- Quality shown in the serve message.
- No schema change and no coin change.

How the goals are stored: they are computed from saved run details, so **runs saved before this work earn seals immediately**. Recipe mastery only counts runs saved from now on, since older runs didn't record dishes. Only a player's latest 500 completed runs are read, so a seal earned only in a run older than that would disappear. A dedicated table can fix that in Milestone 5 if it ever matters.

Brief items not delivered in this milestone:

| Item | State |
|---|---|
| Increasing difficulty | Unchanged, on purpose (finding 5). A decision for the owner |
| Ingredient collection | Not started |
| Plating bonuses | Plating is scored as a gesture only. Not extended |
| Dedicated time trial and perfect-order modes | Only as goals ("Beat the clock", "Spotless service"), not as separate modes |
| New campaign achievements | Existing badges already cover Perfect Chef, cuisine mastery, Speed Chef and World Chef. None added, so the coin rules stay untouched |
| Coach-off option | Not started. It can't be verified, so it could never pay rewards |

## Chef Rivals design, as built

**Identity.** Game ID `chef-rivals`, reached from the Cuisine Quest menu. It has its own ID so results can't reach campaign progress.

**Fairness.** The server draws one `ShiftPlan`: theme, mystery ingredient, basket, guests, finishes and time limit. Each chef gets a separate kitchen built from it. Gesture distance costs nothing in a duel, so keyboard, touch and mouse compete equally.

**Time.** The server stamps every action. Client times are ignored and there's no pause.

**Protocol.** `kitchen:act` carries a version number. A mismatched version is told to refresh. It has its own rate limit of 14 per second with a burst of 28. Existing action IDs handle retries, and `matchId` handles stale matches.

**Responsiveness.** The browser applies each action to a private copy immediately, then every server view replaces that copy. Between views, it advances cooking locally for display only.

**Scoring out of 10,000.** Recipe correctness 3,000, cooking craft 3,000, timing and welcome 1,500, clean technique 1,000, presentation 500, secret challenge 500, efficiency 500. Efficiency is the only part that rewards pure speed, and only for a complete service.

**Failure handling.**

| Situation | Behaviour |
|---|---|
| Disconnect | Seat held for the grace period, kitchen keeps running, rival sees "Reconnecting" |
| Reconnect | Exact kitchen restored from the server |
| A chef leaves while cooking | Match ends as `players-left`. The stayer wins, and no coins are paid under existing rules |
| A chef leaves before cooking | Aborted, nothing saved |
| Server restart | Match lost, nothing saved |

**Rewards.** `recordMatch` with the match UUID and the existing eligibility and daily cap. A tie counts as neither a win nor a loss.

## Kitchen Rush Co-op design, as built

**Identity.** Game ID `kitchen-rush-coop`. The solo game and its 12 levels are unchanged, apart from the plate lock, which can't trigger with one cook.

**Contention.** The room applies actions one at a time, so the first tap wins and the second does nothing. Stations hold one item, and a plate can only be in one cook's hands.

**Teamwork.** All cooks share one score and all win or lose together. Food one cook prepared and another carried on counts as a handoff worth points, capped by plates served so it can't be farmed. Waste, burns and lost guests cost the team.

**Seven kitchens.** Street Food Stall, Small Café, Family Restaurant, Luxury Restaurant, Food Court, Festival Kitchen and International Food Hall. Each adds a rule: handoffs, a shared board, combos, tough guests, limited stock, flare-ups, then all of them together.

**Traffic.** Views omit the kitchen definition, resolved guests and future guests. They're sent on each action and every 500 ms.

**Departures.** A departing cook's hands are cleared, so a held plate is freed. The team can finish without them, and a cook who left gets no score.

## Milestones 3-5: outline

**3. Chef's Spotlight.** Builds on the Rivals judging reveal. Theme generator over tagged recipes, independent cooking, Culinary Runway reveal, judge categories, podium. Votes are a small capped bonus, with no self-voting and one vote per player per match. "Creativity" must become something measurable (finding 10): for example, authored optional ingredients and plating choices that fit the theme. This needs design work before code. Presentation will be an original SinverseGames stage, not modelled on any existing game's runway.

**4. Kitchen Brigade.** Kitchen Rush Co-op now delivers the shared kitchen. What remains is optional role-locked stations with a short cooldown on switching, on top of the co-op engine, to stop one player doing everything. Decide after real players have tried co-op.

**5. My Restaurant.** Identity, decoration and reputation, using the existing cosmetics. This is the first milestone expected to need a new table. Additive migrations only, and production migration only with explicit approval.

## Risks

| Risk | Mitigation |
|---|---|
| Changing saved results | Golden replays from the original engine, with mutation checks |
| Multiplayer results entering the campaign | Separate game IDs |
| Competitive cheating by script | Server time and rate limits limit it, but can't remove it. Keep rewards capped |
| Web and realtime version skew | Protocol version check, coordinated release |
| Heavy traffic per gesture | Private per-player messages and periodic rival summaries |
| Scope | One milestone at a time, and no mode called playable until tested |

## Decisions for the owner

1. **Should later kitchens get harder?** It would change what stars mean for existing players, so the recommendation is to leave the campaign and add optional hard variants.
2. **Should the default theme stay dark?** You asked to avoid overly dark screens. Changing the default affects every page, so it should be a deliberate choice. The recommendation is to review light mode across the site, then decide.
3. **Is the name `Cuisine Quest: World Chef Showdown` confirmed?** The game title is unchanged until then.
4. **What should come next?** The recommendation is real players on the two multiplayer games first, then chef customization and older-game motion.

## Release notes for later

- These games need the web app and the realtime service deployed together. The commit Railway currently runs is unverified.
- No schema change and no migration so far.
- The root `AGENTS.md` and `CLAUDE.md` need updating at merge, including "nine browser games", which becomes eleven.
