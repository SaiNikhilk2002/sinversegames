/**
 * Kitchen Rush content: ingredients, how stations transform them, recipes,
 * customer types and the level progression. Pure data, shared by the browser
 * game and the server-side score verification.
 */

export const ITEMS = {
  bun: { name: "Bun", final: true },
  cheese: { name: "Cheese", final: true },
  "patty-raw": { name: "Raw patty", final: false },
  "patty-cooked": { name: "Grilled patty", final: true },
  lettuce: { name: "Lettuce", final: false },
  "lettuce-chopped": { name: "Chopped lettuce", final: true },
  tomato: { name: "Tomato", final: false },
  "tomato-chopped": { name: "Sliced tomato", final: true },
  cucumber: { name: "Cucumber", final: false },
  "cucumber-chopped": { name: "Sliced cucumber", final: true },
  onion: { name: "Onion", final: false },
  "onion-chopped": { name: "Chopped onion", final: true },
  potato: { name: "Potato", final: false },
  "potato-chopped": { name: "Potato wedges", final: false },
  fries: { name: "Fries", final: true },
  fish: { name: "Fish fillet", final: false },
  "fish-fried": { name: "Crispy fish", final: true },
  egg: { name: "Egg", final: false },
  "egg-fried": { name: "Fried egg", final: true },
  rice: { name: "Rice", final: false },
  "rice-cooked": { name: "Steamed rice", final: true },
  noodles: { name: "Noodles", final: false },
  "noodles-cooked": { name: "Boiled noodles", final: true },
  burnt: { name: "Burnt food", final: false },
} as const;
export type ItemId = keyof typeof ITEMS;
export const isFinal = (item: ItemId) => ITEMS[item].final;

export const STATION_TYPES = ["board", "grill", "fryer", "pot"] as const;
export type StationType = (typeof STATION_TYPES)[number];

export interface Process {
  to: ItemId;
  ms: number;
  /** Time after `ms` until the result burns; omitted when it can't burn. */
  burnMs?: number;
}

export const PROCESSES: Record<StationType, Partial<Record<ItemId, Process>>> = {
  board: {
    lettuce: { to: "lettuce-chopped", ms: 1400 },
    tomato: { to: "tomato-chopped", ms: 1400 },
    cucumber: { to: "cucumber-chopped", ms: 1400 },
    onion: { to: "onion-chopped", ms: 1600 },
    potato: { to: "potato-chopped", ms: 1600 },
  },
  grill: {
    "patty-raw": { to: "patty-cooked", ms: 4000, burnMs: 6000 },
    egg: { to: "egg-fried", ms: 2600, burnMs: 6000 },
  },
  fryer: {
    "potato-chopped": { to: "fries", ms: 3200, burnMs: 6000 },
    fish: { to: "fish-fried", ms: 3600, burnMs: 6000 },
  },
  pot: {
    rice: { to: "rice-cooked", ms: 5000, burnMs: 8000 },
    noodles: { to: "noodles-cooked", ms: 3600, burnMs: 7000 },
  },
};

export const STATION_NAMES: Record<StationType, string> = { board: "Chopping board", grill: "Grill", fryer: "Fryer", pot: "Pot" };

export const RECIPES = {
  burger: { name: "Classic Burger", parts: ["bun", "patty-cooked"], value: 30 },
  cheeseburger: { name: "Cheeseburger", parts: ["bun", "patty-cooked", "cheese"], value: 40 },
  "garden-burger": { name: "Garden Burger", parts: ["bun", "patty-cooked", "lettuce-chopped", "tomato-chopped"], value: 55 },
  fries: { name: "Fries", parts: ["fries"], value: 25 },
  salad: { name: "Fresh Salad", parts: ["lettuce-chopped", "tomato-chopped", "cucumber-chopped"], value: 45 },
  "fish-fries": { name: "Fish & Fries", parts: ["fish-fried", "fries"], value: 55 },
  "rice-bowl": { name: "Sunny Rice Bowl", parts: ["rice-cooked", "egg-fried", "onion-chopped"], value: 55 },
  "noodle-bowl": { name: "Noodle Bowl", parts: ["noodles-cooked", "egg-fried", "cucumber-chopped"], value: 55 },
  deluxe: { name: "Deluxe Stack", parts: ["bun", "patty-cooked", "cheese", "lettuce-chopped", "tomato-chopped"], value: 70 },
  "fish-rice": { name: "Fish Rice Plate", parts: ["rice-cooked", "fish-fried", "cucumber-chopped"], value: 60 },
} as const satisfies Record<string, { name: string; parts: readonly ItemId[]; value: number }>;
export type RecipeId = keyof typeof RECIPES;

export const CUSTOMER_TYPES = {
  regular: { name: "Regular", patience: 1, value: 1, tip: 1, penalty: 1 },
  hurried: { name: "In a hurry", patience: 0.7, value: 1, tip: 1.6, penalty: 1 },
  vip: { name: "VIP", patience: 1, value: 1.5, tip: 1.5, penalty: 1.5 },
  critic: { name: "Food critic", patience: 0.9, value: 1.3, tip: 2, penalty: 2 },
} as const;
export type CustomerTypeId = keyof typeof CUSTOMER_TYPES;

export interface LevelDef {
  number: number;
  name: string;
  recipes: RecipeId[];
  stations: Partial<Record<StationType, number>>;
  seats: number;
  plates: number;
  customers: number;
  /** Gap between customer arrivals, ms. */
  gap: [number, number];
  /** Base patience, ms. */
  patience: [number, number];
  /** Weighted customer type mix. */
  types: Partial<Record<CustomerTypeId, number>>;
  intro?: string;
}

export const LEVELS: LevelDef[] = [
  { number: 1, name: "Opening Day", recipes: ["burger"], stations: { grill: 1 }, seats: 2, plates: 2, customers: 4, gap: [9000, 12000], patience: [55000, 65000], types: { regular: 1 }, intro: "Grill a patty, put it on a plate with a bun and serve it." },
  { number: 2, name: "Say Cheese", recipes: ["burger", "cheeseburger"], stations: { grill: 2 }, seats: 2, plates: 2, customers: 6, gap: [7000, 10000], patience: [45000, 55000], types: { regular: 1 }, intro: "Cheeseburgers need a slice of cheese too." },
  { number: 3, name: "Garden Fresh", recipes: ["burger", "cheeseburger", "garden-burger"], stations: { board: 1, grill: 2 }, seats: 3, plates: 3, customers: 7, gap: [7000, 10000], patience: [45000, 55000], types: { regular: 1 }, intro: "New: the chopping board. Chop lettuce and tomato for Garden Burgers." },
  { number: 4, name: "Fry Day", recipes: ["burger", "cheeseburger", "fries"], stations: { board: 1, grill: 2, fryer: 1 }, seats: 3, plates: 3, customers: 8, gap: [6000, 9000], patience: [42000, 52000], types: { regular: 1 }, intro: "New: the fryer. Chop potatoes into wedges, then fry them." },
  { number: 5, name: "Lunch Rush", recipes: ["garden-burger", "fries", "salad"], stations: { board: 2, grill: 2, fryer: 1 }, seats: 3, plates: 3, customers: 9, gap: [6000, 8500], patience: [40000, 50000], types: { regular: 3, hurried: 1 }, intro: "Customers in a hurry tip more but won't wait as long." },
  { number: 6, name: "Catch of the Day", recipes: ["cheeseburger", "fries", "fish-fries"], stations: { board: 1, grill: 2, fryer: 2 }, seats: 3, plates: 3, customers: 10, gap: [5500, 8000], patience: [38000, 48000], types: { regular: 3, hurried: 1 }, intro: "Fish goes straight into the fryer." },
  { number: 7, name: "Rice & Shine", recipes: ["cheeseburger", "fries", "rice-bowl", "salad"], stations: { board: 2, grill: 2, fryer: 1, pot: 1 }, seats: 3, plates: 3, customers: 10, gap: [5500, 8000], patience: [40000, 50000], types: { regular: 3, hurried: 1, vip: 1 }, intro: "New: the pot for rice. VIPs pay extra." },
  { number: 8, name: "Noodle Night", recipes: ["rice-bowl", "noodle-bowl", "fish-fries", "salad"], stations: { board: 2, grill: 2, fryer: 1, pot: 2 }, seats: 4, plates: 4, customers: 11, gap: [5000, 7500], patience: [40000, 50000], types: { regular: 3, hurried: 1, vip: 1 } },
  { number: 9, name: "The Critic", recipes: ["deluxe", "garden-burger", "fries", "fish-fries"], stations: { board: 2, grill: 3, fryer: 2 }, seats: 4, plates: 4, customers: 12, gap: [5000, 7000], patience: [40000, 48000], types: { regular: 3, hurried: 1, vip: 1, critic: 1 }, intro: "Food critics tip big, but mistakes cost double." },
  { number: 10, name: "Full House", recipes: ["deluxe", "rice-bowl", "noodle-bowl", "fries", "salad"], stations: { board: 2, grill: 3, fryer: 1, pot: 2 }, seats: 4, plates: 4, customers: 12, gap: [4500, 7000], patience: [38000, 46000], types: { regular: 2, hurried: 1, vip: 1, critic: 1 } },
  { number: 11, name: "Festival", recipes: ["cheeseburger", "fish-rice", "noodle-bowl", "fish-fries", "salad"], stations: { board: 2, grill: 2, fryer: 2, pot: 2 }, seats: 4, plates: 4, customers: 14, gap: [4500, 6500], patience: [36000, 44000], types: { regular: 2, hurried: 2, vip: 1, critic: 1 } },
  { number: 12, name: "Master Chef", recipes: ["deluxe", "garden-burger", "fish-rice", "rice-bowl", "noodle-bowl", "fish-fries"], stations: { board: 3, grill: 3, fryer: 2, pot: 2 }, seats: 4, plates: 4, customers: 16, gap: [4000, 6000], patience: [34000, 42000], types: { regular: 2, hurried: 2, vip: 1, critic: 2 } },
];

/** Raw ingredients a level needs on its shelves, derived from the recipes. */
export function cratesFor(level: LevelDef): ItemId[] {
  const raw = new Set<ItemId>();
  const sourceOf = (item: ItemId): ItemId => {
    for (const station of STATION_TYPES) {
      for (const [input, proc] of Object.entries(PROCESSES[station]) as [ItemId, Process][]) {
        if (proc.to === item) return sourceOf(input);
      }
    }
    return item;
  };
  for (const r of level.recipes) for (const part of RECIPES[r].parts) raw.add(sourceOf(part));
  const order = Object.keys(ITEMS) as ItemId[];
  return [...raw].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
