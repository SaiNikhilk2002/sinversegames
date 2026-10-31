/**
 * Game registry: the single source of truth for game metadata. The platform's
 * discovery pages, lobby rules and the realtime server all read from here, so
 * adding a game starts with adding an entry below, then implementing its engine
 * (packages/engines) and its client (apps/web/src/games).
 */
export const GAME_IDS = ["color-clash", "doodle-duel"] as const;
export type GameId = (typeof GAME_IDS)[number];

export const GAME_CATEGORIES = {
  cards: "Card games",
  drawing: "Drawing",
  party: "Party",
  word: "Word games",
  strategy: "Strategy",
  casual: "Casual",
} as const;
export type GameCategory = keyof typeof GAME_CATEGORIES;

export type GameModeId = "private-room" | "public-match" | "two-player" | "group";

export const GAME_MODE_LABELS: Record<GameModeId, string> = {
  "private-room": "Private rooms",
  "public-match": "Public matchmaking",
  "two-player": "1 vs 1",
  group: "Group play",
};

export interface GameMeta {
  id: GameId;
  /** URL slug; equal to id for now but kept separate so URLs can change independently. */
  slug: string;
  name: string;
  tagline: string;
  description: string;
  longDescription: string[];
  categories: GameCategory[];
  minPlayers: number;
  maxPlayers: number;
  avgDurationMinutes: readonly [number, number];
  modes: GameModeId[];
  featured: boolean;
  popular: boolean;
  /** ISO date the game was added — drives "Recently added". */
  addedAt: string;
  /** Visual identity used for game art and accents. */
  theme: { from: string; to: string; ink: string };
  howToPlay: { title: string; body: string }[];
  keywords: string[];
}

export const GAMES: readonly GameMeta[] = [
  {
    id: "color-clash",
    slug: "color-clash",
    name: "Color Clash",
    tagline: "Match colours, fire off action cards, empty your hand first.",
    description:
      "A fast multiplayer card game for 2–4 players. Match by colour or symbol, chain Block, Flip and +2 cards, and use Prism wilds to switch the colour at the perfect moment.",
    longDescription: [
      "Color Clash is a quick-thinking shedding card game. Every turn you match the active colour or symbol on the discard pile — or play a Prism wild to pick a new colour.",
      "Action cards change the flow of play: Block skips the next player, Flip reverses direction and +2 makes the next player draw. The first player to empty their hand wins the round and scores points for every card left in opponents' hands.",
    ],
    categories: ["cards", "strategy", "casual"],
    minPlayers: 2,
    maxPlayers: 4,
    avgDurationMinutes: [5, 12],
    modes: ["private-room", "public-match", "two-player", "group"],
    featured: true,
    popular: true,
    addedAt: "2026-10-30",
    theme: { from: "#ff5f6d", to: "#ffc371", ink: "#3b0a12" },
    howToPlay: [
      { title: "Match the pile", body: "Play a card that matches the active colour, number or symbol." },
      { title: "Use your actions", body: "Block skips a turn, Flip reverses direction, +2 makes the next player draw two." },
      { title: "Go Prism", body: "Prism wilds can be played on anything and let you choose the next colour." },
      { title: "Empty your hand", body: "First to play their last card wins and scores the cards left with opponents." },
    ],
    keywords: ["card game", "multiplayer card game", "online card game with friends", "shedding card game"],
  },
  {
    id: "doodle-duel",
    slug: "doodle-duel",
    name: "Doodle Duel",
    tagline: "Draw it, guess it, win it — a real-time sketching party game.",
    description:
      "A real-time drawing and guessing game for 2–8 players. Take turns sketching a secret word while everyone races to guess it. Faster guesses score more points.",
    longDescription: [
      "In Doodle Duel one player draws while everyone else guesses. The drawer picks one of three secret words and has a limited time to sketch it.",
      "Guessers type their answers — the faster you guess, the more you score. The drawer earns points for every player who gets it right, and hints reveal letters as the clock runs down.",
    ],
    categories: ["drawing", "party", "word"],
    minPlayers: 2,
    maxPlayers: 8,
    avgDurationMinutes: [8, 20],
    modes: ["private-room", "public-match", "two-player", "group"],
    featured: true,
    popular: true,
    addedAt: "2026-10-31",
    theme: { from: "#6a5cff", to: "#20d3c2", ink: "#0b0a33" },
    howToPlay: [
      { title: "Pick a word", body: "When it's your turn to draw, choose one of three secret words." },
      { title: "Sketch fast", body: "Use the pencil, colours and eraser to draw it — no letters or numbers!" },
      { title: "Guess quickly", body: "Type your guesses. Faster correct guesses earn more points." },
      { title: "Top the board", body: "Everyone draws in turn. Highest score after the final round wins." },
    ],
    keywords: ["drawing game", "guess the drawing", "online sketch game", "draw and guess with friends"],
  },
];

const byId = new Map<string, GameMeta>(GAMES.map((g) => [g.id, g]));
const bySlug = new Map<string, GameMeta>(GAMES.map((g) => [g.slug, g]));

export const isGameId = (value: unknown): value is GameId => typeof value === "string" && byId.has(value);

export function getGame(id: GameId): GameMeta {
  const game = byId.get(id);
  if (!game) throw new Error(`Unknown game: ${id}`);
  return game;
}

export const getGameBySlug = (slug: string): GameMeta | undefined => bySlug.get(slug);
