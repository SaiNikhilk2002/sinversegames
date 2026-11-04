/** Authored Cuisine Quest content. No transport, browser or database imports. */
export type StationId = "storage" | "board" | "mixer" | "stove" | "grill" | "fryer" | "oven" | "plating" | "serving";
export type Technique = "chop" | "slice" | "mix" | "marinate" | "spread" | "knead" | "stretch" | "layer" | "roll" | "shape" | "wrap" | "fold" | "seal" | "crush" | "blend" | "plate";
export type Method = "tawa" | "grill" | "bake" | "boil" | "steam" | "fry" | "wok" | "temper";
export type Garnish = "herbs" | "lemon" | "sesame";
export type Step =
  | { kind: "ingredient"; ingredient: string; portions: number; station: "storage"; label: string }
  | { kind: "technique"; technique: Technique; station: StationId; label: string }
  | { kind: "cook"; method: Method; station: StationId; heat: number; ms: number; flip: boolean; stirs: number; label: string };
export interface Recipe { id: string; name: string; level: number; color: string; steps: Step[]; description: string }
export interface Cuisine { level: number; id: string; name: string; place: string; lesson: string; challenge: string; color: string; dark: string; wall: string; recipes: string[]; garnish: Garnish; motif: string }
const I = (ingredient: string, portions = 1): Step => ({ kind: "ingredient", ingredient, portions, station: "storage", label: `Add ${ingredient.replaceAll("-", " ")}` });
const T = (technique: Technique, label: string, station: StationId = ["mix", "marinate", "crush", "blend"].includes(technique) ? "mixer" : technique === "plate" ? "plating" : "board"): Step => ({ kind: "technique", technique, label, station });
const C = (method: Method, heat: number, ms: number, flip = false, stirs = 0): Step => ({ kind: "cook", method, heat, ms, flip, stirs, station: method === "bake" ? "oven" : method === "grill" ? "grill" : method === "fry" ? "fryer" : "stove", label: `${method[0]!.toUpperCase()}${method.slice(1)} at heat ${heat}` });
const plate = () => T("plate", "Arrange the plate and finish");
const recipe = (id: string, name: string, level: number, color: string, description: string, steps: Step[]): Recipe => ({ id, name, level, color, description, steps: [...steps, plate()] });

export const RECIPES: Recipe[] = [
  recipe("masala-dosa", "Masala dosa", 1, "#e9ab43", "Crisp rice crêpe, golden potato filling, coriander.", [I("rice"), I("lentils"), I("potato"), I("spice"), T("mix", "Whisk a smooth batter"), T("spread", "Spread the dosa in a spiral"), C("tawa", 3, 5000, true)]),
  recipe("paneer-tikka", "Paneer tikka", 1, "#df693c", "Marinated paneer and peppers with charred edges.", [I("paneer"), I("yogurt"), I("pepper"), I("spice"), T("chop", "Cut even paneer cubes"), T("marinate", "Coat each cube with marinade"), C("grill", 4, 5500, true)]),
  recipe("butter-naan", "Butter naan", 1, "#e9c87c", "A soft, blistered flatbread brushed with butter.", [I("flour"), I("yogurt"), I("butter"), T("knead", "Knead until elastic"), T("stretch", "Stretch a teardrop naan"), C("bake", 4, 5000)]),
  recipe("vegetable-biryani", "Vegetable biryani", 1, "#dfba53", "Spiced rice layered with vegetables and herbs.", [I("rice"), I("onion"), I("spice"), I("herbs"), T("chop", "Slice the onion evenly"), C("temper", 4, 3000, false, 1), C("steam", 2, 4000)]),
  recipe("margherita-pizza", "Margherita pizza", 2, "#d94b37", "Stretched dough, tomato, mozzarella and fresh basil.", [I("flour"), I("tomato"), I("mozzarella"), I("basil"), T("knead", "Knead the pizza dough"), T("stretch", "Stretch a round base"), T("layer", "Sauce, cheese, then basil"), C("bake", 4, 6000)]),
  recipe("pasta-alfredo", "Pasta Alfredo", 2, "#e7d0a0", "Tender pasta folded through a creamy parmesan sauce.", [I("pasta"), I("cream"), I("parmesan"), I("garlic"), C("boil", 3, 4500), T("mix", "Emulsify the Alfredo sauce"), T("fold", "Fold pasta into the sauce")]),
  recipe("bruschetta", "Bruschetta", 2, "#c9743e", "Toasted bread with bright tomato and basil.", [I("bread"), I("tomato"), I("basil"), I("olive-oil"), T("chop", "Dice tomatoes without crushing"), C("grill", 3, 3500, true), T("layer", "Spoon tomato over the toast")]),
  recipe("lasagna", "Lasagna", 2, "#d96d36", "Distinct pasta, tomato and cheese layers with a golden top.", [I("pasta"), I("tomato"), I("mozzarella"), I("cream"), T("mix", "Combine the tomato filling"), T("layer", "Build alternating pasta layers"), C("bake", 3, 6500)]),
  recipe("sushi-rolls", "Sushi rolls", 3, "#638b58", "Clean rice-and-nori rolls with precise fish and cucumber cuts.", [I("rice"), I("nori"), I("cucumber"), I("fish"), C("boil", 2, 4000), T("slice", "Slice clean, even strips"), T("roll", "Roll tightly with the mat")]),
  recipe("ramen", "Ramen", 3, "#d99d47", "Springy noodles, fragrant broth, mushroom and egg.", [I("noodles"), I("broth"), I("mushroom"), I("egg"), T("mix", "Prepare the broth base"), C("boil", 2, 6000, false, 1)]),
  recipe("tempura", "Tempura", 3, "#e7b768", "Lightly battered prawns with a crisp, delicate shell.", [I("prawn"), I("flour"), I("water"), I("pepper"), T("mix", "Fold the light batter gently"), C("fry", 3, 4500, true)]),
  recipe("onigiri", "Onigiri", 3, "#e4e0ca", "A neat rice triangle wrapped in nori and sesame.", [I("rice"), I("nori"), I("sesame"), I("fish"), C("boil", 2, 4000), T("shape", "Shape a balanced triangle"), T("wrap", "Wrap the nori neatly")]),
  recipe("tacos", "Tacos", 4, "#deb64e", "Warm tortillas, beans and a bright chopped topping.", [I("tortilla"), I("beans"), I("tomato"), I("lettuce"), T("chop", "Chop the fresh topping"), C("grill", 3, 3500, true), T("layer", "Beans, tomato, then lettuce")]),
  recipe("quesadillas", "Quesadillas", 4, "#e1ae40", "A folded tortilla with melted cheese and peppers.", [I("tortilla"), I("cheese"), I("pepper"), I("beans"), T("chop", "Prepare the filling"), C("grill", 3, 4000, true), T("fold", "Fold and seal the tortilla")]),
  recipe("burritos", "Burritos", 4, "#dfc798", "A snug rice, bean and avocado wrap.", [I("rice"), I("tortilla"), I("beans"), I("avocado"), C("boil", 2, 4000), T("layer", "Balance the rice and fillings"), T("wrap", "Tuck the sides and roll")]),
  recipe("nachos", "Nachos", 4, "#df9a36", "Crisp chips with cheese, tomato and a chilli finish.", [I("chips"), I("cheese"), I("tomato"), I("chili"), T("chop", "Dice the topping"), T("layer", "Spread the toppings evenly"), C("bake", 3, 4000)]),
  recipe("pad-thai", "Pad Thai", 5, "#c98542", "Balanced tamarind noodles, lime and roasted peanuts.", [I("noodles", 2), I("tamarind", 2), I("lime", 1), I("peanuts", 1), T("crush", "Crush the peanuts and paste"), C("wok", 4, 5000, false, 2)]),
  recipe("green-curry", "Green curry", 5, "#699747", "A fragrant green paste simmered with coconut and tofu.", [I("coconut", 2), I("curry", 1), I("tofu", 2), I("basil", 1), T("crush", "Pound a fragrant curry paste"), C("fry", 4, 3000, false, 1), C("boil", 2, 4000, false, 1)]),
  recipe("tom-yum", "Tom Yum", 5, "#d57439", "Hot-and-sour broth with lemongrass, lime and mushroom.", [I("broth", 2), I("lemongrass", 1), I("lime", 2), I("mushroom", 1), T("slice", "Slice the aromatic ingredients"), C("boil", 2, 5000, false, 2)]),
  recipe("mango-sticky-rice", "Mango sticky rice", 5, "#efc33e", "Tender sticky rice, ripe mango and coconut cream.", [I("rice", 2), I("mango", 2), I("coconut", 1), I("sugar", 1), C("steam", 2, 5500), T("slice", "Fan the mango slices"), T("mix", "Fold in the coconut cream")]),
  recipe("fried-rice", "Fried rice", 6, "#c99c45", "Separate grains, egg ribbons and crisp carrots.", [I("rice"), I("egg"), I("carrot"), I("soy"), T("chop", "Dice uniform vegetables"), C("wok", 5, 4500, false, 2)]),
  recipe("dumplings", "Dumplings", 6, "#dbc9a7", "Pleated parcels with a sealed vegetable filling.", [I("flour"), I("cabbage"), I("mushroom"), I("soy"), T("chop", "Mince the filling finely"), T("fold", "Fold the dumpling wrapper"), T("seal", "Pleat and seal each edge"), C("steam", 2, 5000)]),
  recipe("chow-mein", "Chow mein", 6, "#b87a3c", "Boiled noodles tossed with crisp vegetables in the wok.", [I("noodles"), I("pepper"), I("cabbage"), I("soy"), C("boil", 3, 3500), C("wok", 5, 4000, false, 2)]),
  recipe("kung-pao-chicken", "Kung pao chicken", 6, "#aa4c2f", "Marinated chicken, peanuts and a glossy chilli sauce.", [I("chicken"), I("peanuts"), I("chili"), I("soy"), T("chop", "Cut consistent chicken pieces"), T("marinate", "Coat with the savoury marinade"), C("wok", 5, 5500, false, 2)]),
  recipe("hummus-platter", "Hummus platter", 7, "#d2b07c", "Silky chickpeas, tahini, lemon and olive oil.", [I("chickpeas"), I("tahini"), I("lemon"), I("olive-oil"), T("blend", "Blend until silky smooth"), T("spread", "Create a hummus well")]),
  recipe("falafel", "Falafel", 7, "#a08039", "Herbed chickpea rounds with a crisp golden crust.", [I("chickpeas"), I("herbs"), I("onion"), I("spice"), T("chop", "Mince herbs and onion"), T("blend", "Blend a coarse falafel mixture"), T("shape", "Shape even rounds"), C("fry", 3, 5000, true)]),
  recipe("greek-salad", "Greek salad", 7, "#689b57", "Cucumber, tomato, feta and olives, carefully balanced.", [I("cucumber"), I("tomato"), I("feta"), I("olives"), T("slice", "Cut the vegetables evenly"), T("layer", "Balance vegetables and feta")]),
  recipe("shakshuka", "Shakshuka", 7, "#c95033", "Soft eggs nestled in a rich tomato-and-pepper base.", [I("tomato"), I("pepper"), I("egg"), I("spice"), T("chop", "Chop the tomato and pepper"), C("temper", 3, 3500, false, 1), C("boil", 2, 5000)]),
];
export const byRecipe = new Map(RECIPES.map(r => [r.id, r]));
export const CUISINES: Cuisine[] = [
  { level: 1, id: "indian", name: "Indian Kitchen", place: "The copper courtyard", lesson: "Spread batter, control tawa heat and time your first flip.", challenge: "A double order followed by two street-food guests.", color: "#edaa50", dark: "#3d2722", wall: "#b66c44", recipes: RECIPES.filter(r => r.level === 1).map(r => r.id), garnish: "herbs", motif: "arches" },
  { level: 2, id: "italian", name: "Italian Trattoria", place: "The sunlit bakehouse", lesson: "Knead, stretch and layer before tending the oven.", challenge: "Coordinate the oven and pasta pot during dinner service.", color: "#ef7b5d", dark: "#3d2427", wall: "#bb795e", recipes: RECIPES.filter(r => r.level === 2).map(r => r.id), garnish: "herbs", motif: "brick" },
  { level: 3, id: "japanese", name: "Japanese Kitchen", place: "The lantern counter", lesson: "Slice precisely, roll tightly and protect delicate frying windows.", challenge: "Balance the fryer with carefully plated rice dishes.", color: "#91c5be", dark: "#183a43", wall: "#678a8a", recipes: RECIPES.filter(r => r.level === 3).map(r => r.id), garnish: "sesame", motif: "shoji" },
  { level: 4, id: "mexican", name: "Mexican Kitchen", place: "The tiled garden", lesson: "Build toppings in order, fold tortillas and wrap without spilling.", challenge: "Keep grilled tortillas warm while finishing layered plates.", color: "#eac752", dark: "#164846", wall: "#41958c", recipes: RECIPES.filter(r => r.level === 4).map(r => r.id), garnish: "lemon", motif: "tiles" },
  { level: 5, id: "thai", name: "Thai Kitchen", place: "The rain-and-teak pavilion", lesson: "Measure balanced portions, pound paste and stir at the right moments.", challenge: "Share the wok, fryer and simmering station with special finishes.", color: "#b5cc6b", dark: "#293c32", wall: "#72916c", recipes: RECIPES.filter(r => r.level === 5).map(r => r.id), garnish: "lemon", motif: "bamboo" },
  { level: 6, id: "chinese", name: "Chinese Kitchen", place: "The red-window workshop", lesson: "Use fierce wok heat, timed tosses and sealed dumpling folds.", challenge: "Move between hot wok dishes and a gentle steamer.", color: "#f09a69", dark: "#482731", wall: "#a9574e", recipes: RECIPES.filter(r => r.level === 6).map(r => r.id), garnish: "sesame", motif: "circle" },
  { level: 7, id: "mediterranean", name: "Mediterranean Kitchen", place: "The olive terrace", lesson: "Combine blending, shaping, frying and deliberate plating.", challenge: "A final multi-station service with cool salads and hot plates.", color: "#d6ca8a", dark: "#27434b", wall: "#b1b29b", recipes: RECIPES.filter(r => r.level === 7).map(r => r.id), garnish: "herbs", motif: "terrace" },
];
export const STATION_NAMES: Record<StationId, string> = { storage: "Ingredient pantry", board: "Preparation board", mixer: "Mixing station", stove: "Stove & steamer", grill: "Grill", fryer: "Fryer", oven: "Oven", plating: "Plating counter", serving: "Serving counter" };
/** Logical target paths. Pointer dragging and keyboard activation share them. */
export const PATHS: Record<Technique, readonly (readonly [number, number])[]> = {
  chop: [[250,350],[650,350],[250,650],[650,650]], slice: [[200,300],[400,400],[600,500],[800,600]],
  mix: [[500,200],[800,500],[500,800],[200,500]], marinate: [[200,350],[500,700],[800,350],[500,500]],
  spread: [[500,500],[700,500],[700,750],[300,750],[200,300]], knead: [[300,250],[300,750],[700,250],[700,750]],
  stretch: [[500,500],[200,500],[800,500],[500,200]], layer: [[250,650],[500,500],[750,350]],
  roll: [[200,700],[400,550],[600,400],[800,250]], shape: [[500,200],[200,750],[800,750],[500,200]],
  wrap: [[200,500],[800,500],[500,750],[500,250]], fold: [[200,250],[800,250],[500,750]],
  seal: [[200,600],[400,400],[600,400],[800,600]], crush: [[300,300],[700,700],[700,300],[300,700]],
  blend: [[500,200],[750,500],[500,800],[250,500]], plate: [[250,650],[500,350],[750,650]],
};
