/**
 * Game discovery: how players find games by how they want to play (docs/GAME_CATEGORY_DISCOVERY.md).
 *
 * The registry (registry.ts) stays the one canonical record per game: id, name, route, player
 * counts, genres. Discovery adds a second, many-to-many dimension on top of it: each game is
 * assigned to the audiences it genuinely suits (Couples, Friends, Family...), and "Multiplayer" /
 * "Single player" are derived from the game's kind, so they can't drift from the real engine.
 * Category pages, the Couples landing page, collections and filters all read from here; nothing
 * is duplicated per category, and progress, history and achievements stay keyed by the one game id.
 */
import { GAMES, getGame, type GameCategory, type GameId, type GameMeta } from "./registry";

/** Audience and play-style categories assigned by hand. Multiplayer and Single player are derived. */
export type AudienceId = "couples" | "friends" | "family" | "party" | "competitive" | "casual";
export type DiscoveryCategoryId = "multiplayer" | "single-player" | AudienceId;

export interface DiscoveryCategory {
  id: DiscoveryCategoryId;
  /** URL segment under /categories (Couples also has its own landing page at /couples). */
  slug: string;
  name: string;
  /** One line for cards and navigation. */
  description: string;
  /** A lucide icon name, rendered by the web app. */
  icon: "users" | "user" | "heart" | "party-popper" | "house" | "sparkles" | "trophy" | "coffee";
  order: number;
  /** Shown in navigation and listings (still subject to having games). */
  visible: boolean;
  /** Landing-page copy and metadata. Written for people, not keyword lists. */
  landing: { title: string; heading: string; intro: string; metaDescription: string };
  /** A dedicated page instead of the generic category page. */
  href?: string;
}

export const DISCOVERY_CATEGORIES: readonly DiscoveryCategory[] = [
  {
    id: "multiplayer", slug: "multiplayer", name: "Multiplayer", icon: "users", order: 1, visible: true,
    description: "Real-time games to play together in a private room or with anyone.",
    landing: {
      title: "Free Multiplayer Browser Games",
      heading: "Play together, right now",
      intro: "Open a private room and send the link, or quick-match with other players. Every game runs in the browser, with no download and no account needed.",
      metaDescription: "Free online multiplayer games for your browser: card, board, drawing, party and cooking games you can play with friends from any device.",
    },
  },
  {
    id: "single-player", slug: "single-player", name: "Single player", icon: "user", order: 2, visible: true,
    description: "Games to play on your own, with daily best scores to beat.",
    landing: {
      title: "Free Single-Player Browser Games",
      heading: "Games for a quiet moment",
      intro: "Puzzles, cards, cooking and cricket to play at your own pace. Scores are checked on the server, so your best runs on the leaderboards are real.",
      metaDescription: "Free single-player browser games: solitaire, mahjong, cooking and cricket. No download, no sign-up, scores verified on the server.",
    },
  },
  {
    id: "couples", slug: "couples", name: "Couples", icon: "heart", order: 3, visible: true, href: "/couples",
    description: "Two-player games for you and your partner, side by side or miles apart.",
    landing: {
      title: "Fun Games for Couples: Play Together Online",
      heading: "Play together. Laugh together. Discover your vibe.",
      intro: "Two-player games for date night, a lazy evening or a long-distance call. Send one link and play from separate devices, with no account needed.",
      metaDescription: "Free online games for couples: think-alike challenges, drawing games and friendly competitions to play with your partner from one link.",
    },
  },
  {
    id: "friends", slug: "friends", name: "Friends", icon: "sparkles", order: 4, visible: true,
    description: "Games that get the group chat talking.",
    landing: {
      title: "Free Online Games to Play With Friends",
      heading: "Games for your group",
      intro: "Draw, guess, race and outsmart each other. Share a room link and everyone joins from their own phone or laptop.",
      metaDescription: "Free browser games to play with friends online: drawing and guessing, card games, board games and party games from one shared link.",
    },
  },
  {
    id: "family", slug: "family", name: "Family", icon: "house", order: 5, visible: true,
    description: "Easy-to-learn games for every age at the table.",
    landing: {
      title: "Family Games to Play Online Together",
      heading: "Games the whole family can play",
      intro: "Simple rules, quick rounds and no reading-heavy turns. Play in one room or across the country.",
      metaDescription: "Free online family games: board, card, drawing and team cooking games with simple rules that everyone can play together.",
    },
  },
  {
    id: "party", slug: "party", name: "Party", icon: "party-popper", order: 6, visible: true,
    description: "Loud, quick and best with a crowd.",
    landing: {
      title: "Online Party Games for Groups",
      heading: "Bring the party",
      intro: "Fast rounds for bigger groups: drawing, guessing, bumper chaos and shared kitchens.",
      metaDescription: "Free online party games for groups: drawing and guessing, arena battles and co-op cooking, played from one room link.",
    },
  },
  {
    id: "competitive", slug: "competitive", name: "Competitive", icon: "trophy", order: 7, visible: true,
    description: "Win on skill and chase the leaderboards.",
    landing: {
      title: "Competitive Browser Games",
      heading: "Play to win",
      intro: "Head-to-head matches and daily best scores, with every result verified on the server.",
      metaDescription: "Competitive free browser games: head-to-head multiplayer and verified daily leaderboards.",
    },
  },
  {
    id: "casual", slug: "casual", name: "Casual", icon: "coffee", order: 8, visible: true,
    description: "Relaxed games for a short break.",
    landing: {
      title: "Relaxing Casual Browser Games",
      heading: "Take a short break",
      intro: "Calm puzzles and easy-going games you can pause and pick back up.",
      metaDescription: "Relaxing free casual browser games: solitaire, mahjong and easy puzzles with no timers to stress about.",
    },
  },
];

export type Availability = "available" | "coming-soon";

/**
 * Every game's audience assignments, in one place. A game appears in each category it's assigned
 * to, as the same canonical game. Assignments follow the real mechanics (player counts, modes):
 * a game is only "couples" if two players can genuinely enjoy it together.
 */
export const GAME_DISCOVERY: Record<GameId, { audiences: AudienceId[]; tags: string[]; availability: Availability }> = {
  "same-wavelength": { audiences: ["couples", "friends", "family", "party"], tags: ["think alike", "questions", "two players"], availability: "available" },
  "doodle-duel": { audiences: ["couples", "friends", "family", "party"], tags: ["drawing", "guessing"], availability: "available" },
  "color-clash": { audiences: ["couples", "friends", "family", "party"], tags: ["cards", "two players"], availability: "available" },
  "token-trail": { audiences: ["friends", "family"], tags: ["board game", "dice"], availability: "available" },
  "bumper-blitz": { audiences: ["friends", "party", "competitive"], tags: ["arena", "action"], availability: "available" },
  "chef-rivals": { audiences: ["couples", "friends", "competitive"], tags: ["cooking", "head to head", "two players"], availability: "available" },
  "kitchen-rush-coop": { audiences: ["couples", "friends", "family", "party"], tags: ["cooking", "co-op", "teamwork"], availability: "available" },
  "cascade-solitaire": { audiences: ["casual"], tags: ["cards", "patience"], availability: "available" },
  "mahjong-garden": { audiences: ["casual"], tags: ["tiles", "relaxing"], availability: "available" },
  "kitchen-rush": { audiences: ["casual", "competitive"], tags: ["cooking", "daily best"], availability: "available" },
  "cuisine-quest": { audiences: ["casual", "family"], tags: ["cooking", "campaign"], availability: "available" },
  "sinverse-cricket": { audiences: ["competitive"], tags: ["sports", "cricket"], availability: "available" },
};

export const discoveryCategory = (id: string): DiscoveryCategory | undefined => DISCOVERY_CATEGORIES.find((c) => c.id === id || c.slug === id);

/** Every discovery category a game belongs to, derived (multiplayer / single player) plus assigned. */
export function categoriesOf(game: GameMeta): DiscoveryCategoryId[] {
  return [game.kind === "multiplayer" ? "multiplayer" : "single-player", ...GAME_DISCOVERY[game.id].audiences];
}

const available = (g: GameMeta) => GAME_DISCOVERY[g.id].availability === "available";

/** Featured first, then newest, then name: the order category grids use. */
export const byFeatured = (a: GameMeta, b: GameMeta) => Number(b.featured) - Number(a.featured) || Number(b.popular) - Number(a.popular) || b.addedAt.localeCompare(a.addedAt) || a.name.localeCompare(b.name);

/** The available games in a category, each once. */
export function gamesInCategory(id: DiscoveryCategoryId): GameMeta[] {
  return GAMES.filter((g) => available(g) && categoriesOf(g).includes(id)).sort(byFeatured);
}

/** Categories that are visible and have at least one available game, in display order. */
export function visibleCategories(): DiscoveryCategory[] {
  return [...DISCOVERY_CATEGORIES].filter((c) => c.visible && gamesInCategory(c.id).length > 0).sort((a, b) => a.order - b.order);
}

export type PlayerCountFilter = "1" | "2" | "3-4" | "5+";
export const PLAYER_COUNT_FILTERS: Record<PlayerCountFilter, string> = { "1": "Solo", "2": "2 players", "3-4": "3–4 players", "5+": "5+ players" };

/** Whether a game can be played with the player counts a filter stands for. */
export function supportsPlayers(game: GameMeta, filter: PlayerCountFilter): boolean {
  const [lo, hi] = filter === "1" ? [1, 1] : filter === "2" ? [2, 2] : filter === "3-4" ? [3, 4] : [5, 99];
  return game.minPlayers <= hi && game.maxPlayers >= lo;
}

export interface GameQuery {
  q?: string;
  category?: DiscoveryCategoryId | null;
  genre?: GameCategory | null;
  players?: PlayerCountFilter | null;
}

/** Text search over name, tagline, description, keywords and tags, plus the filters. Available games only. */
export function searchGames(query: GameQuery, games: readonly GameMeta[] = GAMES): GameMeta[] {
  const q = (query.q ?? "").trim().toLowerCase().slice(0, 60);
  return games.filter((g) => {
    if (!available(g)) return false;
    if (query.category && !categoriesOf(g).includes(query.category)) return false;
    if (query.genre && !g.categories.includes(query.genre)) return false;
    if (query.players && !supportsPlayers(g, query.players)) return false;
    if (!q) return true;
    return [g.name, g.tagline, g.description, ...g.keywords, ...GAME_DISCOVERY[g.id].tags].join(" ").toLowerCase().includes(q);
  });
}

/** A curated collection: canonical games (optionally with a mode preset), never copies. */
export interface GameCollection {
  id: string;
  category: AudienceId;
  title: string;
  blurb: string;
  items: { gameId: GameId; preset?: string; note: string }[];
}

export const COLLECTIONS: readonly GameCollection[] = [
  {
    id: "know-each-other", category: "couples", title: "How well do you know each other?",
    blurb: "Predict each other's answers and see who really pays attention.",
    items: [{ gameId: "same-wavelength", preset: "couples", note: "Couples mode: predict-your-partner rounds" }],
  },
  {
    id: "think-alike", category: "couples", title: "Think-alike challenges",
    blurb: "Same prompt, separate answers, one big reveal.",
    items: [{ gameId: "same-wavelength", preset: "couples", note: "Match answers to score together" }],
  },
  {
    id: "draw-together", category: "couples", title: "Draw together",
    blurb: "One draws, one guesses, both laugh at the results.",
    items: [{ gameId: "doodle-duel", note: "Take turns drawing and guessing" }],
  },
  {
    id: "friendly-competition", category: "couples", title: "Friendly competition",
    blurb: "A little rivalry never hurt anyone. Probably.",
    items: [
      { gameId: "color-clash", note: "Two-player card duel" },
      { gameId: "chef-rivals", note: "Head-to-head cooking" },
    ],
  },
  {
    id: "date-night", category: "couples", title: "Quick date-night games",
    blurb: "Rounds that fit between dinner and dessert.",
    items: [
      { gameId: "same-wavelength", preset: "couples", note: "About 5 minutes" },
      { gameId: "chef-rivals", note: "Three-minute cook-off" },
      { gameId: "color-clash", note: "5–12 minutes" },
    ],
  },
  {
    id: "laugh-together", category: "couples", title: "Laugh together",
    blurb: "Games where losing is half the fun.",
    items: [
      { gameId: "doodle-duel", note: "Questionable drawings guaranteed" },
      { gameId: "kitchen-rush-coop", note: "Share one chaotic kitchen" },
      { gameId: "same-wavelength", preset: "couples", note: "Funny disagreements included" },
    ],
  },
  {
    id: "long-distance", category: "couples", title: "Long-distance couple games",
    blurb: "Send one link and play from separate devices, wherever you are.",
    items: [
      { gameId: "same-wavelength", preset: "couples", note: "Private room by link" },
      { gameId: "doodle-duel", note: "Draw on your own screens" },
      { gameId: "color-clash", note: "Play a hand across the miles" },
      { gameId: "kitchen-rush-coop", note: "Cook as a team online" },
    ],
  },
];

/** Collections for a category that have at least one available game assigned to that category. */
export function collectionsFor(category: AudienceId): GameCollection[] {
  return COLLECTIONS.filter((c) => c.category === category)
    .map((c) => ({ ...c, items: c.items.filter((i) => available(getGame(i.gameId)) && GAME_DISCOVERY[i.gameId].audiences.includes(category)) }))
    .filter((c) => c.items.length > 0);
}
