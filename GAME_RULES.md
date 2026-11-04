# Game rules

The existing seven games below remain playable. The ten expansion concepts, including Cuisine Quest, are design-only in [docs/GAME_CATALOGUE.md](docs/GAME_CATALOGUE.md). Validated normal completions lasting at least 30 seconds and scoring positively can earn Sin Coins (solo must complete); the economy/caps are in [docs/SIN_COINS_ECONOMY.md](docs/SIN_COINS_ECONOMY.md). Currency never alters game rules or scoring.

Multiplayer results offer readiness/host-controlled rematches in the same room with a fresh server match identifier and fully reset game state. Finished rooms have a five-minute default grace period; inactivity and readiness alone do not keep a finished room alive. Doodle drawing uses a plain white canvas and a separate circular size preview; the preview is never part of the transmitted/saved drawing. Lobbies show joined players and safe-area mobile readiness controls.

Authoritative rules as implemented by the server engines in `packages/engines`. The engines are the source of truth; this document describes them.

---

## Color Clash

A shedding card game for **2–4 players**. Be the first to empty your hand.

### Deck (108 cards)

Defined in `packages/engines/src/color-clash/cards.ts` (`DECK_COMPOSITION`).

| Card | Per colour | Colours | Total |
| --- | --- | --- | --- |
| Number 0 | 1 | Ember, Tide, Grove, Sun | 4 |
| Numbers 1–9 | 2 of each | 4 | 72 |
| **Block** (skip) | 2 | 4 | 8 |
| **Flip** (reverse) | 2 | 4 | 8 |
| **+2** (draw two) | 2 | 4 | 8 |
| **Prism** (wild) | — | — | 4 |
| **Prism +4** (wild draw four) | — | — | 4 |

### Setup

1. The deck is shuffled with a cryptographically secure RNG (tests inject a seeded RNG).
2. Each player is dealt `handSize` cards (default 7), one at a time.
3. The top card of the deck starts the discard pile. It is always a **number card**: action and wild cards are returned to random positions in the deck until a number card is drawn.
4. A random player starts; play proceeds clockwise (seat order).

### On your turn

Play **one** card that matches the discard pile:

- same **colour** as the active colour, or
- same **number** (number cards), or
- same **symbol** (Block on Block, Flip on Flip, +2 on +2), or
- any **Prism** card. You must choose the next colour when playing it.

Or **draw** a card (allowed even if you could play). If the drawn card is playable you may play **that card only** or **pass**; otherwise your turn ends automatically.

### Card effects

| Card | Effect |
| --- | --- |
| Block | The next player loses their turn. |
| Flip | Reverses direction. **With two players it acts as Block** (you go again). |
| +2 | The next player draws 2 and loses their turn. |
| Prism | Choose the active colour. |
| Prism +4 | Choose the active colour; the next player draws 4 and loses their turn. |

Effects of a player's final card still apply (e.g. finishing on a +2 makes the next player draw), which affects scoring.

### Winning and scoring (`scoring.ts`)

The first player to empty their hand wins the match. The winner scores the total value of all cards left in opponents' hands:

| Card | Points |
| --- | --- |
| Number | face value |
| Block, Flip, +2 | 20 |
| Prism, Prism +4 | 50 |

Other players score 0 and are ranked by the fewest points left in hand, then the fewest cards. Players who left are ranked last. Values are configurable in `DEFAULT_SCORING`.

### House rules (lobby settings, `config.ts`)

| Setting | Default | Effect |
| --- | --- | --- |
| `handSize` | 7 | Starting hand, 3–10 (lobby offers 5/7/10). |
| `turnSeconds` | 30 | Turn timer; 0 = off. |
| `stackDrawCards` | off | A player facing +2 may answer with +2 or Prism +4; facing Prism +4 they may answer with Prism +4. The penalty accumulates until someone draws. |
| `drawUntilPlayable` | off | Drawing continues until a playable card appears (or the deck is empty). |
| `prism4AnyTime` | on | When off, Prism +4 is only legal if you hold no card of the active colour. |

### Edge cases

- **Draw pile exhausted:** the discard pile (except its top card) is shuffled into a new draw pile. If every card is in players' hands, drawing yields nothing and the turn passes.
- **Turn timer expires:** the player takes any pending stacked penalty, otherwise draws one card; the turn then passes. Timeouts are counted per player.
- **Disconnected on your turn:** even with the timer off, a disconnected player's turn is auto-played after **10 s**.
- **Player leaves** (or their 60 s reconnect grace expires): their cards are shuffled back into the draw pile and they are skipped. A pending stacked penalty is cancelled if it was their turn. If one player remains, they win (`players-left`).
- **Out-of-turn, unowned or illegal cards** are rejected without changing state. Choosing a colour for a non-wild card is rejected.
- **Simultaneous / duplicate submissions:** actions are applied one at a time per room; turn actions carry the state version they were based on, so a second click based on stale state is rejected (`STALE_STATE`), and retries with the same action id return the original result.

---

## Doodle Duel

A drawing and guessing game for **2–8 players**.

### Round flow

1. Players are put in a random drawing order. A **round** = every player draws once (`rounds`, default 3).
2. **Choosing (15 s):** the drawer is offered 3 words (in mixed mode, one easy, one medium and one hard). If they don't pick in time, one is chosen at random.
3. **Drawing (`drawSeconds`, default 80 s):** the drawer sketches; everyone else types guesses.
4. The turn ends when **time runs out**, **every connected guesser has solved it**, or **the drawer leaves** (or stays disconnected for 15 s).
5. **Reveal (6 s):** the word and the turn's points are shown to everyone.
6. The next drawer is chosen; after the final round the leaderboard is shown.

With two players, roles simply alternate.

### Words

`packages/engines/src/doodle-duel/words.ts`: about 200 original, generic words across Animals, Food & drink, Objects, Nature, Entertainment, Everyday activities, Sports, Places and Technology. Each has a difficulty, optional accepted alternatives (e.g. *doughnut / donut*) and an optional text hint. Words are not repeated within a match until the pool runs out. The lobby can restrict category and difficulty.

### Guessing

- Guesses are normalised: case, accents, punctuation and extra whitespace are ignored. Spacing variants match (*icecream* = *ice cream*).
- **Typo tolerance** (on by default): one character off is accepted for answers of 6+ letters.
- **Close guesses** (one edit on 4–5 letter words, two on longer ones), and messages that *contain* the answer, are shown only to the guesser as "close", never to others.
- Wrong guesses appear in the shared chat. Correct guesses are announced as "X guessed the word!" without the word.
- After solving, a player's messages are only visible to the drawer and other solvers.
- The drawer cannot guess or chat while drawing. Repeating your previous guess is rejected, empty guesses are ignored, and guessing is rate-limited.

### Hints (`hints.ts`)

When hints are enabled:

1. At the start of drawing: the **category** and the **letter count** (blanks).
2. Letters are revealed one at a time, evenly spaced from 35% to 85% of the drawing time. Up to 50% (easy), 35% (medium) or 25% (hard) of letters may be revealed, and **at least one letter always stays hidden**.
3. Words with a text hint show it at 50% of the drawing time.

With hints off, guessers see only the blanks.

### Scoring (`scoring.ts`, server-side only)

| Who | Points |
| --- | --- |
| Correct guesser | `100 + 200 × (time remaining ÷ draw time)` |
| First correct guesser of the turn | +50 bonus |
| Drawer | 60 per correct guesser |
| Drawer, when every eligible guesser solved it | +100 bonus |
| Drawer whose turn ended because they left | 0 |

Points are awarded once per player per turn. Final placements use standard competition ranking (ties share a place); everyone tied for first with a positive score is a winner.

### Drawing sync

Strokes are sent as small chunks of up to 64 points in a fixed 1000×750 coordinate space, with a whitelisted palette and brush sizes. Each chunk repeats the previous chunk's last point, so chunks render correctly in any order, and duplicate chunks are ignored. Only the current drawer may draw, undo or clear. Late joiners and reconnecting players receive the full canvas. A turn is capped at 1,500 strokes / 40,000 points.

### Edge cases

- **Drawer disconnects:** 15 s grace, then the turn ends with the word revealed.
- **Guesser disconnects:** they're excluded from "everyone guessed" while offline. Their score is kept if they come back within 60 s.
- **Fewer than two players remain:** the match ends (`players-left`).
- **Simultaneous correct guesses:** processed in arrival order; only the first gets the first-guess bonus.

---

## Kitchen Rush

A single-player time-management cooking game across **12 levels** (`packages/engines/src/kitchen-rush`). Scores are computed on the server by replaying the player's taps (see ARCHITECTURE.md → Single-player games).

### Interactions

Every action is a tap on a target; dragging from one target to another is the same as two taps. You hold one thing at a time.

| Target | Holding nothing | Holding food | Holding a plate |
| --- | --- | --- | --- |
| Ingredient crate | Pick up that raw ingredient | Not allowed | Not allowed |
| Station | Take finished food off it | Place the food if the station can process it | Put the finished food straight onto the held plate |
| Plate | Pick up the plate (if it has food) | Add the food (finished items only, no duplicates, six at most) | Switch to that plate, or put it down |
| Customer | Not allowed | Not allowed | Serve the plate |
| Bin | Not allowed | Throw it away | Empty the plate |

### Stations (`content.ts`)

| Station | Turns | Into | Time | Burns after |
| --- | --- | --- | --- | --- |
| Chopping board | lettuce, tomato, cucumber, onion, potato | chopped / sliced / wedges | 1.4–1.6 s | never |
| Grill | raw patty, egg | grilled patty, fried egg | 4.0 s / 2.6 s | +6 s |
| Fryer | potato wedges, fish | fries, crispy fish | 3.2 s / 3.6 s | +6 s |
| Pot | rice, noodles | steamed rice, boiled noodles | 5.0 s / 3.6 s | +8 s / +7 s |

Food keeps cooking while it sits on a station and stops when you take it off. Burnt food can only be binned.

### Customers and scoring

- **Arrivals:** customers come in a fixed order (from the run's seed). They take a free seat at their scheduled time, or as soon as a seat frees up.
- **Patience:** each customer has a patience timer. The four types change patience, value, tips and penalties:

  | Type | Patience | Value | Tip | Penalty |
  | --- | --- | --- | --- | --- |
  | Regular | ×1 | ×1 | ×1 | ×1 |
  | In a hurry | ×0.7 | ×1 | ×1.6 | ×1 |
  | VIP | ×1 | ×1.5 | ×1.5 | ×1.5 |
  | Food critic | ×0.9 | ×1.3 | ×2 | ×2 |

- **Correct dish:** the plate's contents must equal the recipe exactly; order doesn't matter. It earns the recipe value × type value, plus a **tip** of up to 50 % of the recipe value × type tip, scaled by the patience left.
- **Penalties:**
  - Wrong dish: −15 × type penalty, and the customer leaves.
  - Customer runs out of patience: −10 × type penalty.
  - Food burns: −5 when it burns.
- **End of the shift:** the shift ends when every customer has been served or has left. Anything you leave unfinished plays out to the end, so stopping early doesn't avoid penalties. The recorded score is never below 0.
- **Stars:** compared against the best possible score for that shift (every customer served correctly with full tips): **1 star at 35 %, 2 stars at 60 %, 3 stars at 80 %**. One star unlocks the next level and counts as a win.

### Levels

Each level introduces something new:

| Level | New |
| --- | --- |
| 1 | Tutorial: grill and burgers |
| 2 | Cheese |
| 3 | Chopping board |
| 4 | Fryer and fries |
| 5 | Salads; hurried customers |
| 6 | Fish |
| 7 | Pot and rice bowls; VIPs |
| 8 | Noodles and four seats |
| 9 | Deluxe burgers; food critics |
| 10–12 | Mixed menus, more customers, less patience |

---

## Token Trail

A race-home dice board game for **2–4 players** (`packages/engines/src/token-trail`). All dice are rolled by the server.

### Board

- A shared loop of 52 squares and four corner bases.
- Each seat has its own start square and a private five-square home lane leading to the centre.
- With two players the seats face each other.
- **Safe squares (stars):** every start square, and the square eight steps after it.

### Turn

1. **Roll.** A token needs a **6** to leave base onto its start square.
2. **Move** one token forward by the roll. If several tokens could move to different places, you choose; if there's only one real choice, it moves automatically.
3. **Exact roll to finish.** A move that would overshoot home isn't allowed. With no legal move, the turn passes, even on a 6.
4. **Capture:** landing on a square with rivals' tokens that isn't a star sends all of them back to base. Your own tokens can share a square.
5. **Bonus roll** after rolling a 6, capturing, or bringing a token home. **Three 6s in a row** end your turn, and the third 6 isn't played.

### Winning and scoring

- The first player with every token home wins and the match ends.
- Everyone else is ranked by total progress, then by captures.
- **Score** = steps travelled + 10 per capture + 50 for the winner.

### Settings and timers

- **Tokens per player:** 1 (Sprint), 2 (Quick) or 4 (Classic).
- **Turn timer:** 10, 20 or 45 seconds per decision, or off. When it runs out, the server rolls or moves for the player using the best move: capture, then reach home, then leave base, then advance the furthest token.
- **Disconnected players** get 5 seconds per decision before the server plays for them. Their seat is held for the reconnect grace period. If only one player is left, the match ends (`players-left`).

---

## Cascade Solitaire

Single-player patience with **Klondike** rules (`packages/engines/src/cascade-solitaire`).

### Rules

- **Deal:** seven columns of 1–7 cards, with the top card of each face up. The 24 remaining cards form the stock.
- **Columns:** build down in alternating colours. Any face-up run can move together, and only a King (or a run starting with one) can fill an empty column.
- **Foundations:** build each suit up from Ace to King.
- **Stock:** draw 1 or 3 cards at a time (chosen before dealing). When the stock is empty, the waste turns over to refill it.
- **Win:** all 52 cards on the foundations. **End game** banks the current score without the win bonus.

### Scoring

| Event | Points |
| --- | --- |
| Waste → column | +5 |
| Any card → foundation | +10 |
| Turning over a face-down card | +5 |
| Foundation → column | −15 |
| Recycling the waste | −100 (draw 1) / −20 (draw 3) |
| Each undo | −10 |
| Win bonus | 500 + 2 × (600 − seconds), when positive |

The score never goes below 0. Hints are free. Daily leaderboards rank the best score per player since 00:00 UTC.

---

## Mahjong Garden

Single-player tile matching (`packages/engines/src/mahjong-garden`).

### Rules

- **Free tiles:** a tile is free when no tile on the layer above overlaps it and its left or right side is open.
- **Matching:** match two identical free tiles to remove them. Any flower matches any flower, and any season matches any season.
- **Layouts:**
  - **Pebble:** easy, 36 tiles, 3 layers.
  - **Lotus:** medium, 72 tiles, 4 layers.
  - **Pagoda:** hard, 118 tiles, 5 layers.
- **Always solvable:** boards are generated by reverse play. Random pairs of simultaneously free positions are removed from the full layout and given matching tiles, so the generator's removal order clears the board.
- **Shuffle** re-deals the remaining tiles with the same guarantee. Some positions can't be cleared whatever the tiles, such as a single stacked column. The game detects these, and only undo helps.

### Scoring

| Event | Points |
| --- | --- |
| Match | +20, plus 10 per combo step (another match within 4 s; up to +50) |
| Hint | −30 |
| Shuffle | −50 |
| Undo | −10 |
| Clearing the board | +500, plus 3 × (par time − seconds) when positive |

Par time: Pebble 150 s, Lotus 330 s, Pagoda 600 s.

---

## Bumper Blitz

A real-time arena brawler for **2–6 players** (`packages/engines/src/bumper-blitz`), simulated on the server at 20 ticks per second.

- **Controls:** steer with WASD, the arrow keys or the on-screen stick. **Boost** gives a burst of speed and recharges in 2.5 s. Clients send only their input; the server moves every pod.
- **Arena:** a circular ring that shrinks over the second half of the match. Three bumper posts bounce pods away.
- **Hazards:** a warning zone appears every 11 s, then blasts nearby pods outward for 3.5 s.
- **Power-ups**, one every 7 s with at most two on the field:
  - **Turbo:** faster for 6 s.
  - **Heavy:** more mass for 6 s, so it hits harder.
  - **Shield:** absorbs one big knock, within 10 s.
- **Knockouts:** a pod whose centre leaves the ring falls and respawns after 2 s, with 1.5 s of no-collision. The last rival to hit it within 4 s scores a **knockout**. Falling on your own scores nobody.
- **Match:** 30 s to 3 min after a 3 s countdown. **Score** = 100 per knockout − 25 per fall (never below 0). Ties at the top share the win.
- **Disconnected pods** stop steering but stay in the arena. If only one player is left, the match ends.
