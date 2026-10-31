# Game rules

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
