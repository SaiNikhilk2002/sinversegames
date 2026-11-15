/**
 * Same Wavelength prompt bank (docs/SAME_WAVELENGTH_DESIGN.md). Curated, light-hearted prompts:
 * everyday preferences, travel, food, hypotheticals and playful "who is more likely" questions.
 * Nothing intrusive, explicit, about bodies, money troubles, exes, jealousy or anything likely to
 * start an argument.
 *
 * - `group` marks options the prompt counts as close (1 point instead of 2 for an exact match).
 * - `aliases` lists typed answers that count as the same (exact) or as close (`close: true`).
 * - `{subject}` in a predict prompt is replaced by the round's subject's name.
 */
export type Mode = "couples" | "friends" | "group";
export const MODES: readonly Mode[] = ["couples", "friends", "group"];
export type PromptKind = "choice" | "scenario" | "preference" | "emoji" | "who" | "predict" | "text";
export type Topic = "food" | "travel" | "home" | "fun" | "screen" | "habits" | "dreams" | "games";

export interface PromptOption {
  id: string;
  label: string;
  /** Options sharing a group count as a close match. */
  group?: string;
}

export interface Prompt {
  id: string;
  kind: PromptKind;
  text: string;
  topic: Topic;
  modes: readonly Mode[];
  options?: readonly PromptOption[];
  /** Predict prompts: the wording shown to the subject themselves. */
  subjectText?: string;
  /** Typed-answer equivalences: each inner list is one answer written different ways. */
  aliases?: readonly (readonly string[])[];
}

const ALL: readonly Mode[] = ["couples", "friends", "group"];
const PAIR: readonly Mode[] = ["couples"];
const SOCIAL: readonly Mode[] = ["friends", "group"];
const o = (id: string, label: string, group?: string): PromptOption => (group ? { id, label, group } : { id, label });

export const PROMPTS: readonly Prompt[] = [
  // Everyone: preferences and hypotheticals.
  { id: "weekend", kind: "choice", topic: "travel", modes: ALL, text: "Choose the perfect weekend activity.", options: [o("beach", "Beach day", "outdoors"), o("hike", "Mountain hike", "outdoors"), o("city", "City wander"), o("movies", "Movie marathon", "in"), o("games", "Game night", "in")] },
  { id: "lazy-sunday", kind: "scenario", topic: "home", modes: ALL, text: "What's the ideal lazy Sunday?", options: [o("brunch", "Long brunch", "food"), o("bed", "Staying in bed till noon", "rest"), o("park", "Picnic in the park"), o("series", "Finishing a whole series", "rest"), o("baking", "Baking something ambitious", "food")] },
  { id: "world", kind: "choice", topic: "dreams", modes: ALL, text: "Which kind of fictional world would you visit?", options: [o("magic", "A magic school", "fantasy"), o("space", "A space station", "scifi"), o("dragons", "A land of dragons", "fantasy"), o("future", "A neon future city", "scifi"), o("cartoon", "A cartoon town")] },
  { id: "pizza", kind: "choice", topic: "food", modes: ALL, text: "Pick a pizza everyone would order.", options: [o("margherita", "Margherita", "classic"), o("pepperoni", "Pepperoni", "classic"), o("veggie", "Veggie supreme", "loaded"), o("paneer", "Tandoori paneer", "loaded"), o("pineapple", "Pineapple, no regrets")] },
  { id: "snack", kind: "emoji", topic: "food", modes: ALL, text: "Pick the snack for movie night.", options: [o("popcorn", "🍿", "salty"), o("chips", "🥨", "salty"), o("chocolate", "🍫", "sweet"), o("icecream", "🍦", "sweet"), o("fruit", "🍉")] },
  { id: "weather", kind: "emoji", topic: "dreams", modes: ALL, text: "Pick your favourite kind of day.", options: [o("sun", "☀️", "warm"), o("rain", "🌧️", "cosy"), o("snow", "❄️", "cosy"), o("wind", "🌬️"), o("rainbow", "🌈", "warm")] },
  { id: "trip-transport", kind: "preference", topic: "travel", modes: ALL, text: "Road trip, train or plane?", options: [o("road", "Road trip", "ground"), o("train", "Train journey", "ground"), o("plane", "Plane, get there fast")] },
  { id: "superpower", kind: "choice", topic: "dreams", modes: ALL, text: "Which superpower would be most useful on a Monday?", options: [o("teleport", "Teleporting", "speed"), o("time", "Pausing time", "speed"), o("mind", "Reading minds"), o("invisible", "Invisibility"), o("nosleep", "Never needing sleep")] },
  { id: "dessert", kind: "preference", topic: "food", modes: ALL, text: "Cake, ice cream or both at once?", options: [o("cake", "Cake", "single"), o("icecream", "Ice cream", "single"), o("both", "Both at once")] },
  { id: "holiday", kind: "scenario", topic: "travel", modes: ALL, text: "You win a surprise holiday. Where are you going?", options: [o("islands", "A tropical island", "sun"), o("snow", "A snowy cabin"), o("city", "A buzzing big city"), o("safari", "A wildlife safari"), o("cruise", "A slow river cruise", "sun")] },
  { id: "breakfast", kind: "emoji", topic: "food", modes: ALL, text: "Pick the best breakfast.", options: [o("pancakes", "🥞", "sweet"), o("eggs", "🍳", "savoury"), o("croissant", "🥐", "sweet"), o("dosa", "🫓", "savoury"), o("coffee", "☕ just coffee")] },
  { id: "game-night", kind: "choice", topic: "games", modes: ALL, text: "Which game would you happily play all night?", options: [o("cards", "A card game", "table"), o("board", "A board game", "table"), o("drawing", "A drawing game", "party"), o("quiz", "A quiz", "party"), o("video", "A video game")] },
  { id: "movie-genre", kind: "choice", topic: "screen", modes: ALL, text: "Pick tonight's movie.", options: [o("comedy", "A comedy", "light"), o("romcom", "A rom-com", "light"), o("thriller", "A thriller", "tense"), o("horror", "A horror film", "tense"), o("animated", "An animated film", "light")] },
  { id: "spontaneous", kind: "scenario", topic: "travel", modes: ALL, text: "Perfect spontaneous trip: you have six hours and a full tank.", options: [o("coast", "Drive to the coast", "nature"), o("hills", "Head for the hills", "nature"), o("food", "Chase a famous food spot"), o("town", "Explore a town you've never seen"), o("home", "Honestly? Stay home")] },
  { id: "pet", kind: "emoji", topic: "home", modes: ALL, text: "Choose the household pet.", options: [o("dog", "🐶"), o("cat", "🐱"), o("fish", "🐠", "low"), o("rabbit", "🐰"), o("plant", "🪴 a plant counts", "low")] },
  { id: "season", kind: "preference", topic: "dreams", modes: ALL, text: "Best season of the year?", options: [o("spring", "Spring", "mild"), o("summer", "Summer"), o("autumn", "Autumn", "mild"), o("winter", "Winter")] },
  { id: "drink", kind: "emoji", topic: "food", modes: ALL, text: "Pick the drink.", options: [o("tea", "🍵", "hot"), o("coffee", "☕", "hot"), o("juice", "🧃", "cold"), o("shake", "🥤", "cold"), o("water", "💧")] },
  { id: "music", kind: "choice", topic: "fun", modes: ALL, text: "Choose the soundtrack for a road trip.", options: [o("pop", "Pop hits", "singalong"), o("old", "Old classics", "singalong"), o("chill", "Chill beats"), o("podcast", "A podcast", "talk"), o("silence", "Just conversation", "talk")] },
  { id: "food-now", kind: "text", topic: "food", modes: ALL, text: "Which food would you order right now? (one word or two)", aliases: [["pizza", "pizzas", "pizza pie"], ["biryani", "biriyani", "briyani"], ["burger", "burgers", "hamburger", "cheeseburger"], ["noodles", "ramen", "chow mein"], ["dosa", "masala dosa"], ["sushi", "sushi rolls"], ["tacos", "taco"], ["fries", "chips", "french fries"]] },
  { id: "colour", kind: "text", topic: "fun", modes: ALL, text: "Name a colour (any colour).", aliases: [["blue", "navy", "sky blue", "light blue", "dark blue"], ["red", "crimson", "scarlet"], ["green", "mint", "emerald", "olive"], ["purple", "violet", "lavender", "lilac"], ["pink", "rose"], ["yellow", "gold", "golden"], ["black"], ["white"], ["orange"]] },
  { id: "fruit", kind: "text", topic: "food", modes: ALL, text: "Name a fruit.", aliases: [["mango", "mangoes"], ["apple", "apples"], ["banana", "bananas"], ["strawberry", "strawberries"], ["watermelon"], ["orange", "oranges"], ["grapes", "grape"]] },
  { id: "animal", kind: "text", topic: "fun", modes: ALL, text: "Name an animal you'd love to see in the wild.", aliases: [["tiger", "tigers"], ["elephant", "elephants"], ["panda", "pandas", "red panda"], ["lion", "lions"], ["dolphin", "dolphins"], ["whale", "whales", "blue whale"], ["penguin", "penguins"], ["giraffe", "giraffes"]] },
  { id: "city", kind: "text", topic: "travel", modes: ALL, text: "Name a city you'd visit tomorrow.", aliases: [["paris"], ["tokyo"], ["london"], ["new york", "nyc", "new york city"], ["dubai"], ["rome"], ["singapore"], ["mumbai", "bombay"], ["goa"], ["bali"]] },
  { id: "dinner-plan", kind: "scenario", topic: "food", modes: ALL, text: "It's late and nobody wants to cook. What happens?", options: [o("order", "Order in", "easy"), o("leftovers", "Leftovers", "easy"), o("cereal", "Cereal for dinner"), o("out", "Go out to eat"), o("cook", "Someone cooks anyway")] },
  { id: "sleep-style", kind: "preference", topic: "habits", modes: ALL, text: "Early bird or night owl?", options: [o("early", "Early bird"), o("night", "Night owl"), o("both", "Neither: permanently sleepy")] },
  { id: "phone", kind: "choice", topic: "habits", modes: ALL, text: "What's the first thing you do in the morning?", options: [o("phone", "Check my phone"), o("coffee", "Make tea or coffee", "drink"), o("stretch", "Stretch"), o("snooze", "Hit snooze. Again."), o("water", "Drink water", "drink")] },

  // Couples: everyday life together, playful and light.
  { id: "c-sleep-movie", kind: "who", topic: "screen", modes: PAIR, text: "Who is more likely to fall asleep during a movie?" },
  { id: "c-ready", kind: "who", topic: "habits", modes: PAIR, text: "Who takes longer to get ready?" },
  { id: "c-lost", kind: "who", topic: "travel", modes: PAIR, text: "Who is more likely to get you both lost on a trip?" },
  { id: "c-snacks", kind: "who", topic: "food", modes: PAIR, text: "Who is more likely to eat the last snack?" },
  { id: "c-plans", kind: "who", topic: "habits", modes: PAIR, text: "Who plans the dates?" },
  { id: "c-sing", kind: "who", topic: "fun", modes: PAIR, text: "Who sings louder in the car?" },
  { id: "c-dish", kind: "who", topic: "home", modes: PAIR, text: "Who is the better cook?" },
  { id: "c-gamewin", kind: "who", topic: "games", modes: PAIR, text: "Who is more competitive at games?" },
  { id: "c-destination", kind: "choice", topic: "travel", modes: PAIR, text: "Which destination would you both choose?", options: [o("beach", "A quiet beach", "sea"), o("mountains", "The mountains"), o("island", "An island hop", "sea"), o("city", "A big city break"), o("roadtrip", "A road trip with no plan")] },
  { id: "c-date", kind: "scenario", topic: "fun", modes: PAIR, text: "Pick the perfect date night.", options: [o("dinner", "Dinner somewhere new", "out"), o("cook", "Cooking together at home", "in"), o("movie", "Blanket fort and a movie", "in"), o("walk", "A long evening walk", "out"), o("games", "Playing games together", "in")] },
  { id: "c-couch", kind: "emoji", topic: "home", modes: PAIR, text: "Pick the sofa-night snack you'd share.", options: [o("popcorn", "🍿", "salty"), o("nachos", "🌮", "salty"), o("cookies", "🍪", "sweet"), o("chocolate", "🍫", "sweet"), o("fruit", "🍓")] },
  { id: "c-trip-role", kind: "choice", topic: "travel", modes: PAIR, text: "On a trip together, the best part is…", options: [o("food", "Trying the food"), o("views", "The views", "sights"), o("photos", "Taking silly photos", "sights"), o("doing", "Doing nothing together"), o("adventure", "One big adventure")] },
  { id: "c-predict-food", kind: "predict", topic: "food", modes: PAIR, text: "What would {subject} order at a café?", subjectText: "What would you order at a café?", options: [o("coffee", "Coffee", "drink"), o("tea", "Tea", "drink"), o("cake", "Cake", "sweet"), o("sandwich", "A sandwich"), o("shake", "A milkshake", "sweet")] },
  { id: "c-predict-day", kind: "predict", topic: "home", modes: PAIR, text: "{subject} has a free day. What do they do first?", subjectText: "You have a free day. What do you do first?", options: [o("sleep", "Sleep in", "rest"), o("game", "Play games"), o("out", "Go out somewhere"), o("cook", "Cook something nice"), o("read", "Read or watch something", "rest")] },
  { id: "c-predict-trip", kind: "predict", topic: "travel", modes: PAIR, text: "Pick {subject}'s dream holiday.", subjectText: "Pick your dream holiday.", options: [o("beach", "Beach resort", "relax"), o("spa", "Spa retreat", "relax"), o("trek", "Mountain trek", "active"), o("city", "City break"), o("safari", "Safari", "active")] },
  { id: "c-predict-movie", kind: "predict", topic: "screen", modes: PAIR, text: "Which film genre does {subject} pick on a Friday?", subjectText: "Which film genre do you pick on a Friday?", options: [o("comedy", "Comedy", "light"), o("romcom", "Rom-com", "light"), o("action", "Action"), o("thriller", "Thriller"), o("animated", "Animated", "light")] },
  { id: "c-predict-snack", kind: "predict", topic: "food", modes: PAIR, text: "{subject}'s go-to snack?", subjectText: "Your go-to snack?", options: [o("crisps", "Crisps", "salty"), o("chocolate", "Chocolate", "sweet"), o("biscuits", "Biscuits", "sweet"), o("nuts", "Nuts", "salty"), o("fruit", "Fruit")] },
  { id: "c-together", kind: "text", topic: "fun", modes: PAIR, text: "One word for your favourite thing to do together." , aliases: [["travel", "travelling", "traveling", "trips"], ["eat", "eating", "food", "dinner"], ["games", "gaming", "playing games"], ["movies", "films", "watching movies"], ["cook", "cooking"], ["walk", "walks", "walking"], ["talk", "talking", "chatting"]] },
  { id: "c-game-together", kind: "choice", topic: "games", modes: PAIR, text: "Which game would you play together all night?", options: [o("cards", "Cards", "table"), o("board", "A board game", "table"), o("drawing", "Drawing and guessing"), o("puzzle", "A big puzzle"), o("video", "A video game")] },
  { id: "c-weekend-home", kind: "emoji", topic: "home", modes: PAIR, text: "Rainy weekend at home: pick the vibe.", options: [o("movies", "🎬"), o("baking", "🧁"), o("games", "🎲"), o("books", "📚", "quiet"), o("nap", "😴", "quiet")] },

  // Friends and groups: social, funny, guess-what-your-friends-would-pick.
  { id: "f-late", kind: "who", topic: "habits", modes: SOCIAL, text: "Who is most likely to be late to their own party?" },
  { id: "f-famous", kind: "who", topic: "dreams", modes: SOCIAL, text: "Who is most likely to become famous by accident?" },
  { id: "f-zombie", kind: "who", topic: "dreams", modes: SOCIAL, text: "Who survives longest in a zombie film?" },
  { id: "f-karaoke", kind: "who", topic: "fun", modes: SOCIAL, text: "Who picks the first karaoke song?" },
  { id: "f-plan", kind: "who", topic: "habits", modes: SOCIAL, text: "Who would plan the group holiday?" },
  { id: "f-photo", kind: "who", topic: "fun", modes: SOCIAL, text: "Who takes the most photos on a day out?" },
  { id: "f-chef", kind: "who", topic: "food", modes: SOCIAL, text: "Who would win a cooking competition?" },
  { id: "f-gametalk", kind: "who", topic: "games", modes: SOCIAL, text: "Who argues the rules of every board game?" },
  { id: "f-heist", kind: "scenario", topic: "dreams", modes: SOCIAL, text: "Your group plans a (legal) museum heist movie. Your role?", options: [o("brains", "The planner", "plan"), o("tech", "The tech wizard", "plan"), o("driver", "The getaway driver", "action"), o("distraction", "The distraction", "action"), o("snacks", "In charge of snacks")] },
  { id: "f-island", kind: "choice", topic: "dreams", modes: SOCIAL, text: "Stranded on an island, the group needs…", options: [o("knife", "A pocket knife", "tools"), o("rope", "Rope", "tools"), o("food", "A crate of snacks"), o("speaker", "A speaker with music"), o("boat", "An inflatable boat")] },
  { id: "f-hangout", kind: "emoji", topic: "fun", modes: SOCIAL, text: "Pick the group hangout.", options: [o("food", "🍜", "eat"), o("games", "🎮", "play"), o("music", "🎤"), o("sport", "⚽", "play"), o("park", "🧺", "eat")] },
  { id: "f-predict-snack", kind: "predict", topic: "food", modes: SOCIAL, text: "What snack does {subject} bring to game night?", subjectText: "What snack do you bring to game night?", options: [o("chips", "Chips"), o("sweets", "Sweets"), o("pizza", "Pizza"), o("homemade", "Something homemade"), o("nothing", "Forgets to bring anything")] },
  { id: "f-predict-holiday", kind: "predict", topic: "travel", modes: SOCIAL, text: "{subject}'s first stop on a group trip?", subjectText: "Your first stop on a group trip?", options: [o("food", "The best local food"), o("beach", "The beach", "relax"), o("shops", "The shops"), o("sights", "The famous sights"), o("hotel", "A nap at the hotel", "relax")] },
  { id: "f-predict-superpower", kind: "predict", topic: "dreams", modes: SOCIAL, text: "Which superpower would {subject} pick?", subjectText: "Which superpower would you pick?", options: [o("fly", "Flying", "move"), o("teleport", "Teleporting", "move"), o("invisible", "Invisibility"), o("time", "Time travel"), o("animals", "Talking to animals")] },
  { id: "f-word", kind: "text", topic: "fun", modes: SOCIAL, text: "Describe this group in one word.", aliases: [["chaos", "chaotic"], ["fun", "funny"], ["loud", "noisy"], ["family"], ["legends", "legendary"], ["crazy", "mad"], ["hungry"]] },
  { id: "f-snack-word", kind: "text", topic: "food", modes: SOCIAL, text: "Name a snack the whole group would eat.", aliases: [["chips", "crisps"], ["popcorn"], ["pizza"], ["samosa", "samosas"], ["nachos"], ["chocolate", "chocolates"], ["cookies", "biscuits"]] },
  { id: "f-movie-night", kind: "choice", topic: "screen", modes: SOCIAL, text: "Group movie night: what wins the vote?", options: [o("comedy", "Comedy", "fun"), o("horror", "Horror"), o("action", "Action", "fun"), o("animated", "Animated", "fun"), o("documentary", "A documentary")] },
  { id: "f-party-job", kind: "scenario", topic: "fun", modes: SOCIAL, text: "At the party, you're in charge of…", options: [o("music", "The music", "vibe"), o("food", "The food", "host"), o("games", "The games", "vibe"), o("photos", "The photos"), o("cleanup", "Cleaning up after", "host")] },
];

export const promptById = new Map(PROMPTS.map((p) => [p.id, p]));
