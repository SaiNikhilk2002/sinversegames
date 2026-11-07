/**
 * Game registry: the single source of truth for game metadata. The platform's
 * discovery pages, lobby rules and the realtime server all read from here, so
 * adding a game starts with adding an entry below, then implementing its engine
 * (packages/engines) and its client (apps/web/src/games).
 */
export const GAME_IDS = [
  "color-clash",
  "doodle-duel",
  "kitchen-rush",
  "token-trail",
  "cascade-solitaire",
  "mahjong-garden",
  "bumper-blitz",
  "cuisine-quest",
  "sinverse-cricket",
  "chef-rivals",
] as const;
export type GameId = (typeof GAME_IDS)[number];

/** Games played in realtime rooms (engines in packages/engines, rooms on the realtime server). */
export const MULTIPLAYER_GAME_IDS = ["color-clash", "doodle-duel", "token-trail", "bumper-blitz", "chef-rivals"] as const;
export type MultiplayerGameId = (typeof MULTIPLAYER_GAME_IDS)[number];

/** Single-player games: played in the browser, scores verified by replaying the move log on the server. */
export const SOLO_GAME_IDS = ["kitchen-rush", "cascade-solitaire", "mahjong-garden", "cuisine-quest", "sinverse-cricket"] as const;
export type SoloGameId = (typeof SOLO_GAME_IDS)[number];

export const GAME_CATEGORIES = {
  cards: "Card games",
  board: "Board games",
  puzzle: "Puzzle",
  cooking: "Cooking",
  arcade: "Arcade & action",
  drawing: "Drawing",
  party: "Party",
  word: "Word games",
  strategy: "Strategy",
  casual: "Casual",
  sports: "Sports",
} as const;
export type GameCategory = keyof typeof GAME_CATEGORIES;

export type GameModeId = "private-room" | "public-match" | "two-player" | "group" | "solo" | "daily";

export const GAME_MODE_LABELS: Record<GameModeId, string> = {
  "private-room": "Private rooms",
  "public-match": "Public matchmaking",
  "two-player": "1 vs 1",
  group: "Group play",
  solo: "Single player",
  daily: "Daily best scores",
};

export interface GameMeta {
  id: GameId;
  /** URL slug; equal to id for now but kept separate so URLs can change independently. */
  slug: string;
  /** "multiplayer" games run in realtime rooms; "solo" games run in the browser with verified scores. */
  kind: "multiplayer" | "solo";
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
    id: "cuisine-quest", slug: "cuisine-quest", kind: "solo", name: "Cuisine Quest",
    tagline: "Travel the world. Master the kitchen.",
    description: "An illustrated seven-cuisine cooking journey. Prepare 28 recipes with hands-on techniques, manage heat and customers, and fill your chef's passport with stars.",
    longDescription: [
      "From a copper courtyard to an olive terrace, each kitchen introduces a new craft: spread a dosa, stretch pizza dough, roll sushi, fold tortillas, balance a curry, seal dumplings and blend a silky hummus.",
      "Follow preparation markers with mouse, touch or keyboard. Choose ingredient portions, set the heat, time your flips and stirs, then arrange each dish and match the guest's requested finish. Two batches can share the kitchen, but stations can only do one job at a time.",
      "Six guests request seven plates in each shift. Learn the four local recipes, serve a large order and finish with a service rush. One saved star opens the next cuisine; three stars mark mastery. Pause freely and recover an unfinished shift after refreshing this tab.",
      "Scores, campaign unlocks, achievements and Sin Coins are verified on the server. Your first completed visit to each cuisine can earn completion coins; replays improve records without repeating the same completion reward. Guest progress stays linked to this browser cookie.",
    ],
    categories: ["cooking", "strategy", "arcade"], minPlayers: 1, maxPlayers: 1, avgDurationMinutes: [2,5], modes: ["solo", "daily"], featured: true, popular: false, addedAt: "2026-11-04",
    theme: { from: "#254841", to: "#d6b478", ink: "#f4e8c8" },
    howToPlay: [
      { title: "Open your passport", body: "Start in the Indian kitchen. Earn one saved star to unlock the next of seven cuisines." },
      { title: "Prepare by hand", body: "Choose ingredients in order, measure portions and follow numbered preparation markers by tapping, dragging or keyboard." },
      { title: "Watch the flame", body: "Set recipe heat before cooking. Flip and stir in their windows; lift food while it is perfectly cooked." },
      { title: "Serve with care", body: "Plate neatly and choose the guest's finish. Manage two batches and keep an eye on patience before the final service rush." },
    ], keywords: ["cooking game", "cuisine quest", "world cooking game", "restaurant management", "dosa cooking", "pizza game", "sushi game", "cooking campaign"],
  },
  {
    id: "color-clash",
    slug: "color-clash",
    kind: "multiplayer",
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
    kind: "multiplayer",
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
  {
    id: "kitchen-rush",
    slug: "kitchen-rush",
    kind: "solo",
    name: "Kitchen Rush",
    tagline: "Chop, cook and plate up before the customers lose patience.",
    description:
      "A time-management cooking game. Prepare ingredients, cook them to perfection, assemble orders and serve hungry customers across 12 levels of rising chaos.",
    longDescription: [
      "Kitchen Rush puts you in charge of a busy little kitchen. Customers arrive with orders and a patience meter, and it's your job to chop, grill, fry and plate every dish before they walk out.",
      "Each level adds new recipes, stations and customers. Serve quickly for tips, don't burn anything, and chase three stars on every level.",
    ],
    categories: ["cooking", "casual", "arcade"],
    minPlayers: 1,
    maxPlayers: 1,
    avgDurationMinutes: [2, 4],
    modes: ["solo"],
    featured: true,
    popular: true,
    addedAt: "2026-11-02",
    theme: { from: "#ff8a3d", to: "#ffd25e", ink: "#3a1700" },
    howToPlay: [
      { title: "Read the order", body: "Each customer shows the dish they want and how patient they are." },
      { title: "Prep and cook", body: "Pick up an ingredient, then tap a station: chop on the board, grill or fry on the stove. Take food off before it burns!" },
      { title: "Plate it up", body: "Drop every finished part of the dish onto a plate." },
      { title: "Serve fast", body: "Tap the customer to serve. Faster service earns tips; wrong dishes and burnt food cost points." },
    ],
    keywords: ["cooking game", "restaurant game", "time management game", "kitchen game online", "free cooking game"],
  },
  {
    id: "token-trail",
    slug: "token-trail",
    kind: "multiplayer",
    name: "Token Trail",
    tagline: "Roll, race and bump rivals back to base on the way home.",
    description:
      "A classic race-home board game for 2–4 players. Roll the die, move your tokens around the trail, capture rivals and be first to bring every token home.",
    longDescription: [
      "Token Trail is a friendly race around a cross-shaped board. Roll a 6 to bring a token out, then race it round the trail and up your home lane.",
      "Land on a rival to send them back to base — unless they're resting on a star. Sixes, captures and reaching home all earn another roll.",
    ],
    categories: ["board", "strategy", "casual"],
    minPlayers: 2,
    maxPlayers: 4,
    avgDurationMinutes: [6, 20],
    modes: ["private-room", "public-match", "two-player", "group"],
    featured: false,
    popular: true,
    addedAt: "2026-11-02",
    theme: { from: "#2fb36b", to: "#3fa4ff", ink: "#05261a" },
    howToPlay: [
      { title: "Roll to start", body: "Roll a 6 to move a token from your base onto your start square." },
      { title: "Race around", body: "Move a token by the number rolled. Tokens travel the whole trail, then up your coloured home lane." },
      { title: "Capture", body: "Land on a rival's token to send it back to base. Star squares are safe: nobody can be captured there." },
      { title: "Bonus rolls", body: "Rolling a 6, capturing or reaching home gives you another roll. Three 6s in a row ends your turn." },
    ],
    keywords: ["ludo online", "board game with friends", "dice board game", "race board game multiplayer"],
  },
  {
    id: "cascade-solitaire",
    slug: "cascade-solitaire",
    kind: "solo",
    name: "Cascade Solitaire",
    tagline: "The classic patience card game, with undo, hints and daily best scores.",
    description:
      "Classic Klondike-rules solitaire. Build the four foundations from Ace to King, with undo, hints, a timer and daily best scores.",
    longDescription: [
      "Cascade Solitaire is the timeless patience game: build down the seven columns in alternating colours and move every card up to the four foundations.",
      "Choose draw-one for a relaxed game or draw-three for a challenge. Your best scores each day go on the daily leaderboard.",
    ],
    categories: ["cards", "puzzle", "casual"],
    minPlayers: 1,
    maxPlayers: 1,
    avgDurationMinutes: [4, 10],
    modes: ["solo", "daily"],
    featured: false,
    popular: false,
    addedAt: "2026-11-02",
    theme: { from: "#0f8a5f", to: "#3fd0a4", ink: "#02261a" },
    howToPlay: [
      { title: "Build columns", body: "Stack cards in descending order, alternating red and black." },
      { title: "Move runs", body: "Move a face-up run of cards together. Only a King can fill an empty column." },
      { title: "Fill foundations", body: "Build each suit from Ace up to King on the four foundations." },
      { title: "Use the stock", body: "Tap the stock to draw. Stuck? Use a hint or undo." },
    ],
    keywords: ["solitaire", "klondike solitaire", "free solitaire online", "patience card game"],
  },
  {
    id: "mahjong-garden",
    slug: "mahjong-garden",
    kind: "solo",
    name: "Mahjong Garden",
    tagline: "Match free tiles and clear the garden. Every board is solvable.",
    description:
      "A relaxing tile-matching puzzle. Match pairs of free tiles to clear the board across several layouts and difficulty levels. Every board is guaranteed solvable.",
    longDescription: [
      "Mahjong Garden is a calm solitaire tile-matching game. A tile is free when nothing sits on top of it and its left or right side is open.",
      "Match two identical free tiles to remove them. Clear every tile to win: quick matches and fewer hints score higher.",
    ],
    categories: ["puzzle", "casual"],
    minPlayers: 1,
    maxPlayers: 1,
    avgDurationMinutes: [3, 12],
    modes: ["solo", "daily"],
    featured: false,
    popular: false,
    addedAt: "2026-11-02",
    theme: { from: "#d95f8d", to: "#ffb7a1", ink: "#3a0f22" },
    howToPlay: [
      { title: "Find free tiles", body: "A tile is free if no tile covers it and its left or right side is open." },
      { title: "Match pairs", body: "Select two identical free tiles to clear them. Seasons and flowers match within their group." },
      { title: "Use your tools", body: "Hints show a valid pair, shuffle mixes the remaining tiles and undo takes back a match." },
      { title: "Clear the garden", body: "Remove every tile to win. Faster clears with fewer hints score more." },
    ],
    keywords: ["mahjong solitaire", "mahjong online free", "tile matching game", "mahjong puzzle"],
  },
  {
    id: "bumper-blitz",
    slug: "bumper-blitz",
    kind: "multiplayer",
    name: "Bumper Blitz",
    tagline: "Ram your rivals off the arena in a frantic bumper-pod brawl.",
    description:
      "A real-time arena game for 2–6 players. Steer your bumper pod, grab power-ups and knock rivals out of the ring before the timer runs out.",
    longDescription: [
      "Bumper Blitz is a fast top-down brawl on a floating arena. Steer with the keyboard or the on-screen stick and ram the other pods off the edge.",
      "Grab Turbo, Heavy and Shield power-ups, avoid the bumpers and hazard zones, and score a point for every rival you knock out.",
    ],
    categories: ["arcade", "party"],
    minPlayers: 2,
    maxPlayers: 6,
    avgDurationMinutes: [2, 4],
    modes: ["private-room", "public-match", "two-player", "group"],
    featured: true,
    popular: false,
    addedAt: "2026-11-02",
    theme: { from: "#7b2ff7", to: "#f107a3", ink: "#1d0636" },
    howToPlay: [
      { title: "Steer", body: "Use WASD or the arrow keys, or the on-screen stick on mobile." },
      { title: "Boost", body: "Press Space (or the boost button) for a burst of speed. It recharges after a moment." },
      { title: "Knock them out", body: "Ram rivals out of the ring. You score when a pod you hit falls off." },
      { title: "Power up", body: "Turbo makes you faster, Heavy hits harder and Shield blocks one knock." },
    ],
    keywords: ["bumper cars game", "arena brawler online", "multiplayer arena game", "knockout game online"],
  },
  {
    id: "sinverse-cricket", slug: "sinverse-cricket", kind: "solo", name: "Sinverse Cricket",
    tagline: "Read the ball. Find the gap. Own the final over.",
    description: "An original 3D cricket duel. Bat, bowl and chase across two innings, then replay the real ball flight. One- and two-over custom matches against tactical AI.",
    longDescription: [
      "Play as Harbour Lights or Ember Kites under the lights of Lantern Oval or beside Tideglass Park. Call the toss and take control of both batting and bowling in a complete custom short-format duel.",
      "Choose your shot, direction, power, footwork and bat face. Swing against a moving ball; contact, bounce, fielding and boundary crossings determine the outcome. Bowling combines line, length, release timing, pace and eight seam/spin variations.",
      "Review delivery snapshots from different cameras, slow the action and scrub the trajectory. A playable tactical view is available when WebGL2 is unavailable. Local geometry and synthesized audio use no real-player likenesses or official cricket branding.",
      "This is the first playable cricket slice. T20, ODI, Test, tournaments, career and synchronous multiplayer are later phases. Match results are replay-verified through the existing player, leaderboard and Sin Coins systems; no separate cricket wallet.",
    ],
    categories: ["sports", "strategy", "arcade"], minPlayers: 1, maxPlayers: 1, avgDurationMinutes: [3, 7],
    modes: ["solo", "daily"], featured: true, popular: false, addedAt: "2026-11-05",
    theme: { from: "#102d3a", to: "#42d5b4", ink: "#eaf6ed" },
    howToPlay: [
      { title: "Set the fixture", body: "Choose a team, venue, difficulty and one or two overs. Call the toss and choose your preferred innings." },
      { title: "Read the delivery", body: "Choose a shot, aim and power. Press Space or Swing as the ball reaches the crease. Footwork and bat face change contact." },
      { title: "Build a bowling plan", body: "Set line, length and variation. Release near the centre of the moving meter; late oversteps cost a no-ball and free hit." },
      { title: "Watch the field", body: "Request a run only when the gap is there. Throws and runner positions decide run-outs. Review any completed delivery before continuing." },
    ], keywords: ["cricket simulation", "3d cricket", "original cricket game", "batting bowling game", "short cricket match"],
  },
  {
    id: "chef-rivals", slug: "chef-rivals", kind: "multiplayer", name: "Chef Rivals",
    tagline: "Same basket. Same clock. Two chefs. One winner.",
    description: "A head-to-head cooking duel from the Cuisine Quest kitchens. Two chefs cook the same mystery basket at the same time, then the judges decide.",
    longDescription: [
      "Chef Rivals puts two chefs on one stage. You both get the same theme, mystery ingredient, guests and clock, and you can watch your rival work while you cook.",
      "Choose your own order of attack across the tickets. The judges score correctness, cooking craft, timing, technique and presentation, plus a secret challenge revealed only at the end. Good cooking beats fast clicking.",
    ],
    categories: ["cooking", "strategy", "arcade"], minPlayers: 2, maxPlayers: 2, avgDurationMinutes: [3, 5], modes: ["private-room", "public-match", "two-player"], featured: false, popular: false, addedAt: "2026-11-07",
    theme: { from: "#ff6b4a", to: "#7c5cff", ink: "#fff6ea" },
    howToPlay: [
      { title: "Meet the challenge", body: "A theme and mystery ingredient are revealed, and both chefs get the same tickets." },
      { title: "Cook at the same time", body: "Follow each ticket's recipe: ingredients, preparation, heat, timing and plating. Two batches can run at once, so plan your order." },
      { title: "Serve it right", body: "Give each guest the finish they asked for before their patience runs out." },
      { title: "Face the judges", body: "Scores are revealed category by category, including a secret challenge. Quality counts far more than speed." },
    ],
    keywords: ["cooking duel", "multiplayer cooking game", "chef vs chef", "two player cooking game", "online cooking competition"],
  },
];

const byId = new Map<string, GameMeta>(GAMES.map((g) => [g.id, g]));
const bySlug = new Map<string, GameMeta>(GAMES.map((g) => [g.slug, g]));

export const isGameId = (value: unknown): value is GameId => typeof value === "string" && byId.has(value);
export const isMultiplayerGameId = (value: unknown): value is MultiplayerGameId =>
  typeof value === "string" && (MULTIPLAYER_GAME_IDS as readonly string[]).includes(value);
export const isSoloGameId = (value: unknown): value is SoloGameId =>
  typeof value === "string" && (SOLO_GAME_IDS as readonly string[]).includes(value);

export function getGame(id: GameId): GameMeta {
  const game = byId.get(id);
  if (!game) throw new Error(`Unknown game: ${id}`);
  return game;
}

export const getGameBySlug = (slug: string): GameMeta | undefined => bySlug.get(slug);
