# Same Wavelength: design

An original social multiplayer game. Everyone answers the same prompt in secret, the server reveals all the answers at once, and the game scores how often you matched. It's cooperative: there are no winners or losers, only a shared "wavelength".

**Where the code lives:**
- **Engine:** `packages/engines/src/same-wavelength/` (`engine.ts`, `prompts.ts`, `scoring.ts`).
- **Web client:** `apps/web/src/games/same-wavelength/`.
- **Catalogue entry:** `packages/shared/src/games/registry.ts`.

It runs on the existing realtime rooms, matchmaking, identity and persistence. No new realtime system and no database migration.

## Game rules

| | |
|---|---|
| Players | 2–6 |
| Modes | **Couples** (exactly 2): light everyday prompts and predict-your-partner rounds. **Friends** (2–4): social prompts and who-is-most-likely rounds. **Group** (2–6): everyone answers, one reveal |
| Settings (host, in the lobby) | Rounds 5 / 8 / 10 / 12; time to answer 20 / 30 / 45 / 60 s; **typed answers** on or off |
| A round | Intro (3 s, first round only) → **answering** (the timer, or until everyone connected has answered) → **reveal** (9 s, or until everyone taps Next) → the next round |
| The end | After the last round's reveal, a summary: match percentage, exact and close matches, perfect rounds, best round, shared picks, the funniest disagreements and the topics you agreed on |

**Prompt kinds:**
- multiple choice, scenario, preference and emoji: answered with an option;
- who-is-more-likely: answered with one of the players;
- predict-your-partner: one subject per round answers about themselves while the others guess. The subject sees "You have a free day…"; the others see "Asha has a free day…";
- short typed answers: at most 40 characters, opt-in.

**The prompt bank** (`prompts.ts`, 64 prompts):
- 26 for every mode, 20 couples-only and 18 for friends and groups;
- by kind: 13 choice, 7 scenario, 8 emoji, 4 preference, 16 who-is-more-likely, 8 predict and 8 typed;
- each has a topic: food, travel, home, fun, screen, habits, dreams or games;
- curated to be light-hearted. Nothing intrusive, explicit, about bodies, money troubles, exes or jealousy, or likely to start an argument.
- A test checks the bank's shape and screens all text against a list of off-limits words.

## Scoring (transparent, deterministic)

Every pair of players who both answered is compared (`scoring.ts`):

| Level | Points per player in the pair | When |
|---|---|---|
| **Match** | 2 | The same option or player. For typed answers: equal after a simple normalisation (case, spacing, punctuation, a leading "a / an / the", a trailing plural "s"), or two answers the prompt lists as the same (e.g. "biryani" and "briyani") |
| **Close** | 1 | Two options the prompt groups together (e.g. "Beach day" and "Mountain hike" are both *outdoors*) |
| **Different** | 0 | Anything else |

- **The round's match %** is the points earned divided by the points possible (2 × pairs).
- **The session's match %** is the same, over all rounds.
- **Predict rounds** count only the pairs that include the subject.
- **Players who didn't answer** are left out of the comparison: they're listed as "didn't answer in time", not scored as wrong.
- **No AI or fuzzy matching is used.** Every reveal can show exactly how the round scored ("How this round scored"), and the results say plainly that the percentage shows how often your answers matched in this game, **not** how compatible anyone is.

## Realtime protocol

**Actions** (client → server, through the room layer's existing envelope, acknowledgements and idempotency):

| Event | Payload | Rules |
|---|---|---|
| `wave:answer` | `{ round, option? \| player? \| text? }` | Only while answering, before the deadline, for the current round, once per player. Validated against the prompt: a real option, a seated player, or 1–40 characters with control characters stripped |
| `wave:next` | `{ round }` | Only during a reveal: marks you ready, and the next round starts when everyone connected is ready |

**State** (server → client): the room's usual `game:state` with a per-player view (`SameWavelengthView`):
- the phase, round, deadline, players and who has answered;
- the prompt (worded for the viewer);
- **your own answer only**;
- the current reveal, the history and, at the end, the summary.

Messages are small. Under load, about 1 KB/s and 6 messages a second per room (`bench:wavelength`).

**Room layer (generic, also usable by future games):**
- **`maxPlayersFor(config)`:** engines can now limit seats by settings. Rooms, joins, public rooms and the matchmaker honour it, and settings that can't seat the current players are refused (Couples can't be chosen with three people in the room).
- **Matchmaking:** a public quick match pairs 2 players in Friends mode, without typed answers.

## Server authority, privacy and security

| Concern | How it's handled |
|---|---|
| Room membership | The existing signed realtime token, room join rules, host-only settings and kicking |
| Prompt selection | The server shuffles the bank with the room's RNG |
| Hidden answers | While a round is open, `viewFor` contains your own answer and only *whether* others have answered. Tests check views, and every message over the socket, before the reveal |
| Submission ownership | Answers are keyed by the socket's authenticated player id; a non-member gets `NOT_IN_ROOM` |
| Duplicates and retries | A second answer is refused (`INVALID_MOVE`); a retried message with the same id gets the original reply (room layer); a stale round gets `STALE_STATE` |
| Deadlines | Late answers are refused; the timer reveals with whoever answered |
| Disconnects | A dropped player keeps their seat for the reconnect grace period. The round doesn't wait for them, and they rejoin with their own answer and the current state |
| Scores | Computed only on the server; the client never sends a score |
| Rate limits | `wave:*` events use the existing action bucket (6 a second, burst 12) |
| Typed answers | Off by default (so strangers in quick match only see built-in options), and turned on by the host or the link presets for private rooms. Shown as plain text (React escapes it), and never stored |
| Stored data | The recorded result holds **aggregates only**: mode, rounds, match %, exact and close counts, perfect rounds, best round, answers given (count), the topics agreed and split on, and the fastest answer time. **No answers, typed text or option labels** |

## Persistence and rewards

- **Recording:** `recordMatch`, unchanged except for one line that records a `result: "shared"` entry as **neutral**, with no win and no loss.
- **Eligibility:** the existing rules apply: completed, at least 30 seconds, score > 0. A completed game earns the base match reward and XP within the shared daily cap. There is no victory reward, because nobody wins.
- **Two new achievements** (string keys, no migration):
  - *Same brain energy*: 80%+ over a game of 5+ rounds;
  - *Tuned in*: 5 games played.
- **No schema change:** game ids aren't constrained in the database. A fresh local database with the existing four migrations was used for testing.

## Results and sharing

- **The summary** is shown above the shared results panel:
  - a dial and an entertainment label ("Same brain energy", "Different opinions, great chemistry");
  - stats;
  - same-brain moments and funniest disagreements, while this tab still has the final state; after a refresh, the recorded aggregates;
  - the topics you agreed on.
- **The shared results panel** reads "Played together: a shared result, nobody wins or loses".
- **Fun Insights and the share card** come from `FUN_INSIGHTS_SYSTEM.md`.

## Tests

- **Engine** (`packages/engines/test/same-wavelength.test.ts`, 16 tests):
  - the bank's shape and content;
  - scoring levels, normalisation, aliases and predict pairs;
  - a deterministic deck, and only the mode's prompts;
  - the intro and deadlines;
  - hidden answers;
  - duplicate, stale and invalid answers and non-members;
  - timeouts;
  - next or timer advancing, and finishing;
  - predict wording;
  - disconnects and removal;
  - mode seat limits;
  - aggregate-only results.
- **Sockets** (`apps/realtime/test/same-wavelength.test.ts`, 5 tests):
  - Couples seats and room full;
  - mode switching refused or allowed;
  - secrecy over the wire;
  - duplicate, stale and outsider answers;
  - reconnection restoring your answer;
  - a whole game to a recorded neutral result;
  - quick-match pairing.
- **Real PostgreSQL** (`apps/realtime/test-db/same-wavelength.db.ts`, 3 tests):
  - a neutral result, with no answers stored, the base reward and the achievement;
  - a low match without the achievement;
  - atomic duplicate refusal.
- **Browser** (`apps/web/e2e/same-wavelength.spec.ts`, 2 tests):
  - a full Couples game in two browser contexts: preset link, invite, secret answers, reveal, summary, insights, sharing with and without names, and a tampered link refused;
  - phone layout.

## Known limitations

- **Typed-answer matching is deliberately simple.** "Ice cream" and "gelato" only match if the prompt lists them together. That's by design: no AI.
- **Shared picks and disagreements need this tab's final state.** After a refresh at the results screen, only the aggregates are shown, because answers aren't stored.
- **Public quick match** is two players in Friends mode. Groups use private rooms.
- **Text moderation:** there's no word filter. Typed answers are off in quick match, and the existing report button applies.
