/**
 * Original, generic Doodle Duel word bank. Each entry: text, difficulty,
 * optional accepted alternatives (comma-separated) and an optional hint shown
 * late in the round when hints are enabled.
 */

import type { WordCategory, WordDifficulty } from "./config";

export { WORD_CATEGORIES, type WordCategory, type WordDifficulty } from "./config";

export interface Word {
  text: string;
  category: WordCategory;
  difficulty: WordDifficulty;
  alternatives: string[];
  hint?: string;
}

type Raw = readonly [text: string, difficulty: "e" | "m" | "h", alternatives?: string, hint?: string];

const RAW: Record<WordCategory, readonly Raw[]> = {
  animals: [
    ["cat", "e", "kitten,kitty"], ["dog", "e", "puppy"], ["fish", "e"], ["bird", "e"], ["snake", "e"],
    ["elephant", "m"], ["giraffe", "m"], ["penguin", "m"], ["turtle", "m", "tortoise"], ["octopus", "m"],
    ["butterfly", "m"], ["kangaroo", "m"], ["rabbit", "e", "bunny"], ["owl", "e"], ["crab", "e"],
    ["jellyfish", "h"], ["chameleon", "h", "", "It changes colour"], ["hedgehog", "h"], ["flamingo", "h"],
    ["seahorse", "h", "sea horse"], ["peacock", "h"], ["snail", "m"], ["shark", "m"], ["bat", "e"],
  ],
  food: [
    ["pizza", "e"], ["apple", "e"], ["banana", "e"], ["cake", "e"], ["egg", "e"], ["ice cream", "m", "icecream"],
    ["sandwich", "m"], ["hamburger", "m", "burger"], ["popcorn", "m"], ["spaghetti", "m", "pasta"],
    ["watermelon", "m"], ["pineapple", "m"], ["cupcake", "m"], ["taco", "m"], ["cheese", "e"], ["carrot", "e"],
    ["pancakes", "h", "pancake"], ["sushi", "h"], ["pretzel", "h"], ["lemonade", "h", "", "A sour summer drink"],
    ["broccoli", "h"], ["doughnut", "m", "donut"], ["cookie", "e", "biscuit"], ["hot dog", "m", "hotdog"],
  ],
  objects: [
    ["chair", "e"], ["key", "e"], ["clock", "e"], ["umbrella", "m"], ["scissors", "m"], ["glasses", "m", "spectacles"],
    ["backpack", "m", "rucksack"], ["candle", "e"], ["lamp", "e"], ["book", "e"], ["ladder", "m"], ["toothbrush", "m"],
    ["hammer", "m"], ["balloon", "e"], ["envelope", "h"], ["hourglass", "h", "", "Measures time with sand"],
    ["magnifying glass", "h", "magnifier"], ["paperclip", "h", "paper clip"], ["anchor", "m"], ["bucket", "m"],
    ["crown", "e"], ["kite", "e"], ["suitcase", "m"], ["telescope", "h"],
  ],
  nature: [
    ["sun", "e"], ["tree", "e"], ["flower", "e"], ["cloud", "e"], ["moon", "e"], ["mountain", "m"],
    ["rainbow", "m"], ["volcano", "m"], ["waterfall", "m"], ["cactus", "m"], ["island", "m"], ["leaf", "e"],
    ["snowflake", "m"], ["lightning", "m"], ["tornado", "h"], ["mushroom", "m"], ["iceberg", "h"],
    ["sunflower", "m"], ["cave", "m"], ["desert", "h"], ["glacier", "h", "", "A slow river of ice"], ["wave", "e"],
  ],
  entertainment: [
    ["guitar", "e"], ["drum", "e", "drums"], ["robot", "e"], ["pirate", "m"], ["wizard", "m"], ["ghost", "e"],
    ["dragon", "m"], ["superhero", "m", "super hero"], ["magician", "h"], ["microphone", "m", "mic"],
    ["piano", "m"], ["clown", "m"], ["castle", "m"], ["treasure chest", "h", "treasure"], ["mermaid", "m"],
    ["alien", "e"], ["ticket", "m"], ["violin", "h", "fiddle"], ["puppet", "h"], ["headphones", "m", "headphone"],
    ["trophy", "m"], ["dinosaur", "m"],
  ],
  activities: [
    ["sleeping", "m", "sleep"], ["cooking", "m", "cook"], ["reading", "m", "read"], ["dancing", "m", "dance"],
    ["painting", "m", "paint"], ["fishing", "m", "fish"], ["camping", "h", "camp"], ["shopping", "h", "shop"],
    ["brushing teeth", "h", "brush teeth"], ["swimming", "m", "swim"], ["singing", "m", "sing"],
    ["juggling", "h", "juggle"], ["gardening", "h", "garden"], ["laughing", "m", "laugh"], ["yawning", "h", "yawn"],
    ["running", "e", "run"], ["jumping", "e", "jump"], ["crying", "e", "cry"], ["waving", "m", "wave"],
    ["sneezing", "h", "sneeze"], ["baking", "m", "bake"],
  ],
  sports: [
    ["football", "e", "soccer"], ["basketball", "m"], ["tennis", "m"], ["golf", "m"], ["skateboard", "m"],
    ["bowling", "m"], ["boxing", "m"], ["surfing", "m", "surf"], ["skiing", "m", "ski"], ["karate", "h"],
    ["archery", "h", "", "Bow and arrow"], ["cycling", "h", "biking"], ["volleyball", "h"], ["medal", "e"],
    ["whistle", "m"], ["goal", "e"], ["helmet", "m"], ["baseball", "m"], ["hockey", "h"], ["trampoline", "h"],
  ],
  places: [
    ["house", "e", "home"], ["school", "e"], ["beach", "e"], ["hospital", "m"], ["airport", "m"], ["farm", "e"],
    ["bridge", "m"], ["library", "m"], ["lighthouse", "h"], ["zoo", "e"], ["park", "e"], ["museum", "h"],
    ["restaurant", "h"], ["igloo", "m"], ["pyramid", "m"], ["stadium", "h"], ["tent", "e"], ["windmill", "h"],
    ["playground", "h"], ["train station", "h", "station"],
  ],
  technology: [
    ["phone", "e", "smartphone,mobile"], ["computer", "e", "pc"], ["camera", "e"], ["television", "m", "tv"],
    ["keyboard", "m"], ["battery", "m"], ["satellite", "h"], ["rocket", "e"], ["light bulb", "m", "lightbulb,bulb"],
    ["headset", "h"], ["drone", "m"], ["printer", "m"], ["laptop", "m"], ["magnet", "m"], ["remote control", "h", "remote"],
    ["robot vacuum", "h"], ["video game", "m", "videogame"], ["calculator", "h"], ["microwave", "h"], ["wifi", "h", "wi fi"],
  ],
};

const DIFFICULTY: Record<Raw[1], WordDifficulty> = { e: "easy", m: "medium", h: "hard" };

export const WORD_BANK: readonly Word[] = Object.entries(RAW).flatMap(([category, words]) =>
  words.map(([text, d, alts, hint]) => ({
    text,
    category: category as WordCategory,
    difficulty: DIFFICULTY[d],
    alternatives: alts ? alts.split(",").map((a) => a.trim()).filter(Boolean) : [],
    ...(hint ? { hint } : {}),
  })),
);
