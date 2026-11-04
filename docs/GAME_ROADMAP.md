# SinverseGames: first 50 games

The plan for the first 50 games. The original seven games count toward the historical 50-game plan; Cuisine Quest adds an eighth implemented game through the separate expansion selection below. Every game is original (names, rules presentation, art and code); genres are fair game, specific existing games are not.

Each game reuses one of four engine kinds that already exist, so most new games are content plus a UI on top of proven infrastructure:

| Engine kind | How it works | Built for |
| --- | --- | --- |
| **Solo (replay-verified)** | Plays in the browser; the server replays the move log from a signed seed to compute the score | Kitchen Rush, Cascade Solitaire, Mahjong Garden |
| **Turn-based room** | `GameEngine` on the realtime server; versioned actions, turn timers, auto-play on disconnect | Color Clash, Token Trail |
| **Realtime tick room** | Server simulation at 20 Hz; clients send input only | Bumper Blitz |
| **Shared canvas room** | Stroke relay with server-side scoring | Doodle Duel |

No game on this list needs new infrastructure (no Redis, no new hosts). The few marked Large need more server CPU per room, not new services.

**Complexity:** S (Small) = 2–4 days, M (Medium) = 1–2 weeks, L (Large) = 3–5 weeks, for one engineer, including tests.

**Monetization potential** assumes ads between rounds and optional cosmetics. The reward currency (Sin Coins) stays non-purchasable.

**Priority:**
- **P1:** next batch. High demand, quick to build, reuses existing engines.
- **P2:** after P1.
- **P3:** later or larger bets.

## Catalogue

### Casual and hypercasual (10)

| # | Game | Mode | Size | Effort | Core gameplay | Engine | Monetization | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Stack Tower | Single | S | 2 days | Tap to drop a sliding block; overhangs are sliced off; build as high as possible | Solo | Medium | P1 |
| 2 | Bubble Burst | Single | M | 1 week | Aim and shoot bubbles; match three or more to pop clusters across levels | Solo | High | P1 |
| 3 | Juice Jump | Single | S | 3 days | Endless vertical hopper: bounce between platforms and grab fruit | Solo | Medium | P2 |
| 4 | Slice Splash | Single | S | 3 days | Swipe to slice flying fruit, avoid bombs, chain combos | Solo | Medium | P2 |
| 5 | Orbit Dash | Single | S | 2 days | Tap to switch between orbiting rings and dodge debris | Solo | Low | P3 |
| 6 | Paper Plane Glide | Single | S | 3 days | Hold to climb, release to dive; fly through rings as far as you can | Solo | Low | P3 |
| 7 | Snake Garden | Single | S | 2 days | Classic grow-the-snake through a garden of obstacles and power-ups | Solo | Medium | P1 |
| 8 | Balloon Rise | Single | S | 3 days | Clear obstacles from the path of a rising balloon | Solo | Low | P3 |
| 9 | Merge Garden | Single | M | 1 week | Merge matching seedlings into rarer plants on a grid | Solo | High | P2 |
| 10 | Ring Toss | Single | S | 2 days | Flick rings onto pegs before time runs out | Solo | Low | P3 |

### Puzzle and brain (8)

| # | Game | Mode | Size | Effort | Core gameplay | Engine | Monetization | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 11 | **Mahjong Garden** ✅ | Single | M | Done | Match free tiles across layered, always-solvable layouts | Solo | High | Done |
| 12 | Tile Twins | Single | S | 2 days | Slide tiles to merge equal numbers and reach the target tile | Solo | Medium | P1 |
| 13 | Word Weave | Single | S | 4 days | Daily five-letter word to deduce in six tries, with colour clues | Solo + daily seed | High | P1 |
| 14 | Sudoku Studio | Single | M | 1 week | Generated sudoku in four difficulties, with notes, hints and a daily puzzle | Solo + daily seed | High | P1 |
| 15 | Block Fit | Single | S | 3 days | Place pieces on a 9×9 grid and clear full rows and boxes | Solo | High | P1 |
| 16 | Pipe Flow | Single | M | 1 week | Rotate pipe tiles to connect the water to every outlet | Solo | Medium | P2 |
| 17 | Nonogram Nook | Single | M | 1 week | Fill cells from row and column clues to reveal a picture | Solo | Medium | P3 |
| 18 | Mine Meadow | Single | S | 2 days | Reveal safe tiles using number clues; flag the hidden traps | Solo | Medium | P2 |

### Board and card (8)

| # | Game | Mode | Size | Effort | Core gameplay | Engine | Monetization | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 19 | **Color Clash** ✅ | Multi 2–4 | M | Done | Shedding card game with action cards and house rules | Turn-based room | High | Done |
| 20 | **Token Trail** ✅ | Multi 2–4 | M | Done | Race-home dice board game with captures and safe stars | Turn-based room | High | Done |
| 21 | **Cascade Solitaire** ✅ | Single | M | Done | Klondike-rules solitaire with undo, hints and daily bests | Solo | High | Done |
| 22 | Drop Four | Multi 2 | S | 3 days | Drop discs to connect four in a row; includes a bot opponent | Turn-based room | Medium | P1 |
| 23 | Crown Checkers | Multi 2 | M | 1 week | Draughts with forced captures, kings and a bot | Turn-based room | Medium | P2 |
| 24 | Royal Chess | Multi 2 | L | 4 weeks | Full chess rules, clocks and rated matchmaking | Turn-based room | High | P3 |
| 25 | Trick Tide | Multi 4 | L | 3 weeks | Partnership trick-taking card game with bidding; bots fill seats | Turn-based room | High | P2 |
| 26 | FreeCell Fjord | Single | S | 3 days | FreeCell rules on the Cascade Solitaire card engine | Solo | Medium | P1 |

### Multiplayer and party (8)

| # | Game | Mode | Size | Effort | Core gameplay | Engine | Monetization | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 27 | **Doodle Duel** ✅ | Multi 2–8 | M | Done | Draw a secret word while others race to guess | Shared canvas room | High | Done |
| 28 | Trivia Clash | Multi 2–12 | M | 1.5 weeks | Timed multiple-choice rounds by category; speed scores more | Turn-based room | High | P1 |
| 29 | Word Bluff | Multi 3–8 | M | 1.5 weeks | Write fake answers to obscure questions; score for fooling friends | Turn-based room | High | P2 |
| 30 | Hidden Agent | Multi 4–10 | M | 1.5 weeks | Everyone knows the location except the spy; ask questions and vote | Turn-based room | Medium | P2 |
| 31 | Emoji Charades | Multi 2–8 | S | 4 days | Describe a phrase with emoji only; others guess | Turn-based room | Medium | P2 |
| 32 | Type Racer Rally | Multi 2–6 | S | 4 days | Race to type a passage accurately; live progress bars | Realtime tick room (low rate) | Medium | P1 |
| 33 | Battle Boats | Multi 2 | M | 1 week | Hide a fleet and take turns firing at the rival's grid | Turn-based room | Medium | P2 |
| 34 | Sketch Relay | Multi 4–10 | M | 1.5 weeks | Telephone game alternating drawings and descriptions | Shared canvas room | High | P2 |

### Arcade and action (8)

| # | Game | Mode | Size | Effort | Core gameplay | Engine | Monetization | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 35 | **Bumper Blitz** ✅ | Multi 2–6 | M | Done | Ram rivals off a shrinking arena with power-ups and hazards | Realtime tick room | Medium | Done |
| 36 | Neon Serpents | Multi 2–12 | L | 4 weeks | Arena snakes: grow by eating, cut others off; spectate after death | Realtime tick room | High | P2 |
| 37 | Brick Burst | Single | S | 3 days | Paddle-and-ball brick breaker with power-ups and levels | Solo (replay-verified) | Medium | P1 |
| 38 | Asteroid Drift | Single | S | 4 days | Thrust and shoot through waves of splitting rocks | Solo | Medium | P2 |
| 39 | Tank Tactics | Multi 2–8 | L | 4 weeks | Top-down tank battles with ricochets and destructible cover | Realtime tick room | High | P3 |
| 40 | Sky Runner | Single | M | 1.5 weeks | Endless runner across rooftops with three lanes and gadgets | Solo | High | P2 |
| 41 | Pixel Peaks | Single | L | 4 weeks | Platformer with handmade levels, collectibles and time trials | Solo | Medium | P3 |
| 42 | Swarm Defender | Single | S | 4 days | Fixed shooter against descending waves; shields and bosses | Solo | Medium | P2 |

### Sports and skill (4)

| # | Game | Mode | Size | Effort | Core gameplay | Engine | Monetization | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 43 | Mini Golf Meadow | Single / Multi 2–4 | M | 2 weeks | Physics mini golf across themed holes; take turns in rooms | Solo + turn-based room | High | P2 |
| 44 | Penalty Pro | Single | S | 3 days | Aim, curve and power penalty kicks against an adaptive keeper | Solo | Medium | P2 |
| 45 | Hoop Shot | Single | S | 2 days | Flick to shoot; moving hoops and streak multipliers | Solo | Medium | P1 |
| 46 | Air Hockey Duel | Multi 2 | M | 1 week | Realtime air hockey using the Bumper Blitz physics core | Realtime tick room | Medium | P2 |

### Cooking and time management (4)

| # | Game | Mode | Size | Effort | Core gameplay | Engine | Monetization | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 47 | **Kitchen Rush** ✅ | Single | L | Done | Prep, cook, plate and serve orders across 12 levels | Solo (event simulation) | High | Done |
| 48 | Kitchen Rush Co-op | Multi 2–4 | L | 3 weeks | Shared kitchen, one cook per player (the engine already keys hands by cook) | Realtime tick room + Kitchen Rush engine | High | P1 |
| 49 | Café Barista | Single | M | 1.5 weeks | Brew, froth and decorate drinks to order; reuses the Kitchen Rush engine with new content | Solo (event simulation) | High | P1 |
| 50 | Bakery Bloom | Single | M | 1.5 weeks | Mix, proof, bake and decorate with oven timing; seasonal menus | Solo (event simulation) | High | P2 |

**Counts:** 10 casual, 8 puzzle, 8 board and card, 8 party, 8 arcade, 4 sports, 4 cooking, for a total of **50**. By size: 22 Small, 21 Medium, 7 Large (including the finished games).

## Expansion phase (November 2026)

The next ten-game selection and full implementation gates are now defined in [GAME_CATALOGUE.md](GAME_CATALOGUE.md) and [GAME_EXPANSION_PLAN.md](GAME_EXPANSION_PLAN.md). Cuisine Quest leads, followed by four distinct solo and five multiplayer designs. Cuisine Quest now has all seven kitchens and 28 recipes implemented locally and is registered; [its QA report](CUISINE_QUEST_QA_REPORT.md) records acceptance. The other nine concepts remain designs outside the runtime registry. The original seven games are retained. Shared Sin Coins/cosmetic and Doodle improvements are tracked in [EXPANSION_QA_REPORT.md](EXPANSION_QA_REPORT.md); Google identity, secure avatars and the other nine games remain later complete slices. This selection refines the earlier catalogue proposals without claiming those earlier entries are finished.

## Development tracker

Statuses:
- **Planned:** designed, not started.
- **In progress:** being built.
- **Implemented:** code complete.
- **Tested:** unit, integration and E2E tests pass.
- **Released:** live on sinversegames.com.

| Status | Games |
| --- | --- |
| Released | Color Clash, Doodle Duel |
| Tested (awaiting release) | Kitchen Rush, Token Trail, Cascade Solitaire, Mahjong Garden, Bumper Blitz; expansion: Cuisine Quest (7 cuisines / 28 recipes) |
| Implemented | none |
| In progress | none |
| Planned: P1 (next batch) | Stack Tower, Bubble Burst, Snake Garden, Tile Twins, Word Weave, Sudoku Studio, Block Fit, Drop Four, FreeCell Fjord, Trivia Clash, Type Racer Rally, Brick Burst, Hoop Shot, Kitchen Rush Co-op, Café Barista |
| Planned: P2 | Juice Jump, Slice Splash, Merge Garden, Pipe Flow, Mine Meadow, Crown Checkers, Trick Tide, Word Bluff, Hidden Agent, Emoji Charades, Battle Boats, Sketch Relay, Neon Serpents, Asteroid Drift, Sky Runner, Swarm Defender, Mini Golf Meadow, Penalty Pro, Air Hockey Duel, Bakery Bloom |
| Planned: P3 | Orbit Dash, Paper Plane Glide, Balloon Rise, Ring Toss, Nonogram Nook, Royal Chess, Tank Tactics, Pixel Peaks |

Historical 50-game catalogue totals: 2 released, 5 tested, 15 P1, 20 P2, 8 P3. Cuisine Quest is the additional expansion implementation; it does not silently replace an original numbered entry.

### Suggested next batch (P1, about 6–8 weeks)

1. **Quick wins on existing engines** (about 2 weeks): Stack Tower, Snake Garden, Tile Twins, Block Fit, Hoop Shot and FreeCell Fjord. All are solo and small, with verified scores for free.
2. **Daily-seed puzzles** (about 1.5 weeks): Word Weave and Sudoku Studio. They need one small addition: a deterministic daily seed (date → seed) alongside the existing random seed, so everyone plays the same puzzle each day.
3. **Social** (about 2 weeks): Trivia Clash, Drop Four and Type Racer Rally.
4. **Cooking expansion** (about 4 weeks): Café Barista (content on the Kitchen Rush engine), then Kitchen Rush Co-op.

## Future expansion: simulation games (after game 50)

These are future products, not part of the 50-game commitment. Nothing here should be built until the catalogue is complete; the notes record what each would need, so infrastructure decisions made now don't block them later.

What they share: long sessions and persistent worlds. That means **save games** (a new `SaveSlot` table holding versioned JSON state), offline progress calculated on return rather than simulated continuously, and a deterministic step function, so saves can be validated the same way solo scores are today. None needs an always-on server per player.

| Concept | Complexity | Gameplay loop | Technical requirements |
| --- | --- | --- | --- |
| **Restaurant Empire** (restaurant and business management) | L | Run Kitchen Rush-style shifts, then spend earnings on staff, décor and new menus between days | Kitchen Rush engine as the "day" phase; save slots; an economy balancing model |
| **Brick & Boulevard** (city building) | XL | Zone districts, lay roads and utilities, balance budget and happiness, respond to events | Tile-based world on a canvas or WebGL renderer; save slots; worker-thread simulation; chunked saves |
| **Sunny Acres** (farm management) | L | Plant, water and harvest on real-time crop timers; sell at market; expand fields | Offline progress from timestamps; save slots; optional visits to friends' farms (read-only snapshots) |
| **Runway Rush** (airport management) | L | Schedule arrivals, assign gates, keep runways clear; avoid delays as traffic grows | Event simulation (like Kitchen Rush) at larger scale; pathfinding for ground traffic |
| **Thrill Park** (theme park management) | XL | Build rides and paths, set prices, keep visitors happy and safe | Agent simulation of visitors (worker thread); ride editor; save slots |
| **Tycoon Tower** (tycoon) | M | Build floors with shops and offices, collect rent, unlock upgrades | Idle-game math with offline earnings; save slots; anti-tamper on save totals |
| **Route Runner** (vehicle and driving simulation) | L | Drive delivery routes on time; upgrade vehicles; obey traffic | WebGL top-down driving, vehicle physics, route generation |
| **Little Lives** (life simulation) | XL | Guide a character's day: jobs, hobbies, friendships, home decoration | Large content system (needs, schedules, dialogue); save slots; asset pipeline |
| **Assembly Line** (factory and production) | L | Place machines and belts to turn raw resources into products; optimise throughput | Grid simulation with deterministic ticks; blueprint sharing; save slots |
| **Club Manager** (sports club management) | L | Sign players, set tactics, simulate matches and seasons | Match simulation engine; seasonal data model; optional async leagues between friends |

**Infrastructure this will eventually need:** save-slot storage (a Neon table, and well within the current plan's limits for early volumes), and possibly an object store for large saves (Cloudflare R2, the same account). Neither is needed for the first 50 games.
