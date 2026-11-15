# Game category discovery

How players find games by how they want to play: Multiplayer, Single player, Couples, Friends, Family, Party, Competitive and Casual.

**The code:** `packages/shared/src/games/discovery.ts` (model and queries) and the web pages listed below.

## Model: one canonical game, many categories

- **The registry** (`registry.ts`) remains the single record per game: id, slug and route, name, descriptions, cover, player counts, play time, modes, featured and popular flags, and **genres** (the existing `categories` field: cards, board, cooking…).
  - Nothing about genres changed.
  - Every route, game id, statistic, achievement and match record stays keyed by the one game id.
- **Discovery categories** are a second, many-to-many dimension, defined once in `discovery.ts`:

| Field | Purpose |
|---|---|
| `id`, `slug` | A stable id and the URL segment (`/categories/<slug>`) |
| `name`, `description`, `icon` | Navigation and cards (lucide icon name) |
| `order`, `visible` | Display order; a switch to hide a category |
| `landing` | The page title, heading, introduction and meta description: unique per category and written for people |
| `href` | An optional dedicated page instead of the generic one (Couples → `/couples`) |

- **Assignments** live in `GAME_DISCOVERY`: one entry per game, typed `Record<GameId, …>`, so a new game can't be added without being classified:
  - `audiences`: the hand-assigned categories;
  - `tags`: extra search words;
  - `availability`: `available` or `coming-soon`.
- **Multiplayer and Single player** are **derived** from the game's `kind`, so they can't disagree with the actual engine.
- **Collections** (`COLLECTIONS`) are curated lists of the same canonical games, optionally with a mode preset (`/play/same-wavelength?preset=couples`). They're never copies.

**Queries:**
- `categoriesOf(game)`
- `gamesInCategory(id)`: available games, each once, featured first
- `visibleCategories()`: visible **and** non-empty, in order
- `searchGames({ q, category, genre, players })`: search over name, tagline, description, keywords and tags
- `supportsPlayers(game, "1" | "2" | "3-4" | "5+")`
- `collectionsFor(category)`: drops items not assigned to that category, and empty collections

## Category assignments for every game

| Game | Derived | Assigned | Why |
|---|---|---|---|
| Same Wavelength | Multiplayer | Couples, Friends, Family, Party | Couples mode for two, groups up to six, gentle prompts |
| Doodle Duel | Multiplayer | Couples, Friends, Family, Party | Drawing and guessing works for two to eight |
| Color Clash | Multiplayer | Couples, Friends, Family, Party | A 1-vs-1 card duel or up to four |
| Token Trail | Multiplayer | Friends, Family | A 2–4 race board game: classic family play |
| Bumper Blitz | Multiplayer | Friends, Party, Competitive | Arena brawling for up to six |
| Chef Rivals | Multiplayer | Couples, Friends, Competitive | Strictly head-to-head |
| Kitchen Rush Co-op | Multiplayer | Couples, Friends, Family, Party | Team cooking for two to four |
| Cascade Solitaire | Single player | Casual | — |
| Mahjong Garden | Single player | Casual | — |
| Kitchen Rush | Single player | Casual, Competitive | Daily best scores |
| Cuisine Quest | Single player | Casual, Family | A campaign suitable for all ages |
| Sinverse Cricket | Single player | Competitive | Verified scores |

**Couples** contains only multiplayer games two people can genuinely play together. A test enforces it: minimum players ≤ 2 ≤ maximum. Bumper Blitz (a brawl best with a crowd) and every solo game are deliberately not in Couples.

## Pages

| Route | What it is |
|---|---|
| `/games` | All games, with search, **category navigation**, genre chips, type, **player count** (Solo, 2, 3–4, 5+) and sort. Now uses `searchGames` |
| `/categories/<slug>` | Generic landing pages for Multiplayer, Single player, Friends, Family, Party, Competitive and Casual. Each has its own metadata (title, description, canonical, Open Graph), heading and introduction, category navigation, a featured lead game, a player-count filter (only counts that have games) and links to the other categories. **An unknown, hidden or empty category is a 404**; `/categories/couples` redirects permanently to `/couples` |
| `/couples` | The dedicated Couples landing page (`COUPLES_EXPERIENCE.md`) |
| `/games/<slug>` | Unchanged route. Now shows "Great for" chips linking to each of the game's categories |
| `/` | A new "Play your way" section of category tiles (with game counts) and a Couples band. Existing sections unchanged |
| Header | A "Couples" link |
| Sitemap | Every visible category page and `/couples` |

**Performance:** category pages render from static data in the shared package, with no database queries. `/couples` is prerendered. Covers are the existing inline SVG art, and no game engine is loaded on discovery pages.

## Adding a category or a game

- **New game:** add its registry entry, then its `GAME_DISCOVERY` entry (TypeScript requires it). It appears in every assigned category automatically.
- **New category:**
  1. Add the id to `AudienceId`.
  2. Add a `DISCOVERY_CATEGORIES` entry with its own landing copy.
  3. Assign games to it.
  4. It gets a page at `/categories/<slug>` once it has a game, and stays hidden until then.

## Tests

- **`packages/shared/test/discovery.test.ts`** (shared unit tests):
  - every game classified, with derived categories correct;
  - Doodle Duel in four categories as **the same object**;
  - no duplicates;
  - Couples only for two-player-capable games;
  - visible categories, order and unique landing copy;
  - empty categories hidden;
  - search, combined filters and player counts;
  - collections only containing correctly assigned games.
- **`apps/web/e2e/discovery.spec.ts`** (browser):
  - the Couples page's content, title, description and canonical;
  - Doodle Duel listed once in each of four category pages, with one game page;
  - category chips;
  - single-player filtering, player filters, the redirect and the 404;
  - `/games` search and player filter;
  - existing routes still 200;
  - homepage tiles;
  - no sideways scroll at 360 px.
