/**
 * International team catalogue for Sinverse Cricket.
 *
 * Data only: nothing here is read by the match engine yet, so existing matches,
 * digests and replays are unaffected (see docs/CRICKET_FORMATS_EXPANSION_PLAN.md).
 *
 * Every player is fictional. Names are invented; none is a real cricketer, and
 * there are no likenesses, crests or licensed marks. Emblems are abstract shapes
 * and kits are plain colour palettes. Attributes are derived deterministically
 * from the team and squad slot, inside fixed bounds, so no side is broken and
 * the same catalogue is produced everywhere (client, server, tests).
 */

export type PlayerRole = "batter" | "keeper" | "all-rounder" | "pace" | "spin";
export type BowlingType = "fast" | "medium" | "off-spin" | "leg-spin" | "left-arm-spin";
export type TeamTier = "full" | "associate";
export type Emblem = "chevron" | "ring" | "diamond" | "bars" | "star" | "wave" | "peak" | "leaf" | "shield" | "sun";

export interface PlayerAttributes {
  /** Timing and placement. */
  batting: number;
  /** Boundary hitting. */
  power: number;
  /** Bowling quality (pace or turn, with accuracy). */
  bowling: number;
  fielding: number;
  /** Glovework; meaningful for keepers. */
  keeping: number;
}
export interface CricketPlayer extends PlayerAttributes {
  /** Stable id: `<team>-<slot>`. */
  id: string;
  name: string;
  role: PlayerRole;
  bats: "right" | "left";
  bowls: BowlingType | null;
}
export interface Kit {
  shirt: string;
  trousers: string;
  trim: string;
}
export interface CricketTeam {
  id: string;
  name: string;
  short: string;
  tier: TeamTier;
  palette: { primary: string; secondary: string; accent: string };
  kits: { home: Kit; away: Kit };
  emblem: Emblem;
  /** Fifteen players; the default XI, captain and keeper are picked from these. */
  squad: CricketPlayer[];
  /** Default playing eleven in batting order (player ids). */
  xi: string[];
  captain: string;
  keeper: string;
  /** Team-level summary of the default XI, 0-100. */
  ratings: { batting: number; bowling: number; fielding: number };
}

/** Attribute bounds: every value lies inside these, whatever the team. */
export const ATTRIBUTE_MIN = 35;
export const ATTRIBUTE_MAX = 95;
export const SQUAD_SIZE = 15;

/** Squad slots: five batters, the keeper, two all-rounders, four quicks, two spinners, a reserve batter. */
const SLOT_ROLES: PlayerRole[] = ["batter", "batter", "batter", "batter", "batter", "keeper", "all-rounder", "all-rounder", "pace", "pace", "pace", "pace", "spin", "spin", "batter"];
/** Default XI by slot, in batting order: the top five, the keeper, both all-rounders, three quicks and a spinner. */
const XI_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 12, 8, 9];

type Seed = {
  id: string;
  name: string;
  short: string;
  tier: TeamTier;
  /** primary, secondary, accent */
  colours: [string, string, string];
  emblem: Emblem;
  /** Overall strength 0-10: shifts every attribute a little (at most +8). */
  strength: number;
  players: string[];
};

const SEEDS: Seed[] = [
  { id: "india", name: "India", short: "IND", tier: "full", colours: ["#1f6fd6", "#0b2f6b", "#ff9a3c"], emblem: "sun", strength: 10, players: ["Aarav Venkat", "Dhruv Malhotra", "Ishaan Rege", "Kabir Sethi", "Nikhil Bharadwaj", "Tejas Kulkarni", "Reyansh Dutta", "Vihaan Chauhan", "Arnav Sidhu", "Yuvan Pillai", "Kartik Nambiar", "Shaurya Rathore", "Advait Menon", "Pranav Joglekar", "Rudra Bhatia"] },
  { id: "australia", name: "Australia", short: "AUS", tier: "full", colours: ["#f4c430", "#0d5c3a", "#0b3d2e"], emblem: "star", strength: 10, players: ["Lachlan Harwood", "Cooper Brennan", "Angus Whitlock", "Declan Marsden", "Riley Thackeray", "Jarrah Ellison", "Flynn Cassidy", "Hamish Dunleavy", "Tyson Radford", "Kade Fenwick", "Beau Lockhart", "Darcy Wainwright", "Nate Okeefe", "Callum Prentice", "Zane Holloway"] },
  { id: "england", name: "England", short: "ENG", tier: "full", colours: ["#1c3f94", "#c8102e", "#e9eef7"], emblem: "shield", strength: 9, players: ["Alfie Greenhalgh", "Rupert Ashdown", "Toby Lanchester", "Freddie Whitcombe", "Oscar Penhallow", "Hugo Trevelyan", "Barnaby Sutcliffe", "Ellis Fairbrother", "Jago Hartwell", "Monty Braithwaite", "Kit Oakenshaw", "Wilf Dearden", "Seb Ravenscroft", "Lowen Castell", "Ned Hawksworth"] },
  { id: "pakistan", name: "Pakistan", short: "PAK", tier: "full", colours: ["#0b6b3a", "#063d22", "#f1f5ee"], emblem: "ring", strength: 9, players: ["Zayan Qureshi", "Hamdan Baig", "Rayyan Lodhi", "Taimur Sheikh", "Arham Siddiqui", "Daniyal Mirza", "Shayan Durrani", "Eesa Farooqi", "Mikail Abbasi", "Sarim Tareen", "Fawad Niazi", "Ahsan Ghumman", "Subhan Rizvi", "Moiz Chaudhry", "Rohail Bangash"] },
  { id: "south-africa", name: "South Africa", short: "RSA", tier: "full", colours: ["#0f7a4a", "#f4c430", "#12372a"], emblem: "peak", strength: 9, players: ["Ruan Vermeulen", "Thabo Mokoena", "Dewald Joubert", "Sipho Ndlovu", "Kyle Abrahams", "Jaco Swanepoel", "Lwazi Khumalo", "Wian Engelbrecht", "Bongani Mthembu", "Corne Barnard", "Tumelo Sithole", "Hanno Pretorius", "Ayabonga Dlamini", "Reece Fortuin", "Marnus Lombard"] },
  { id: "new-zealand", name: "New Zealand", short: "NZ", tier: "full", colours: ["#16191d", "#8a949e", "#f2f4f6"], emblem: "leaf", strength: 9, players: ["Tane Rangihuna", "Finn Aldridge", "Mason Kirkwood", "Hemi Parata", "Blake Sommerville", "Lochie Templeton", "Kahu Wihongi", "Carter Hazlett", "Reuben Stanaway", "Ari Tamihana", "Jesse Winterbourne", "Corbin Mackrell", "Niko Ruatara", "Ethan Garrick", "Sam Tolhurst"] },
  { id: "sri-lanka", name: "Sri Lanka", short: "SL", tier: "full", colours: ["#12357f", "#f2b632", "#8b1e2d"], emblem: "wave", strength: 8, players: ["Sahan Weerakoon", "Dilan Abeysekera", "Kavindu Ratnayake", "Tharindu Gunawardena", "Ruwan Jayakody", "Nimesh Wickramage", "Chamath Seneviratne", "Isuru Dassanayake", "Pasan Ekanayake", "Lahiru Tennakoon", "Ravindu Amarasekara", "Hasitha Kulatunga", "Sachith Pathirage", "Dulaj Hettige", "Minod Karunathilaka"] },
  { id: "bangladesh", name: "Bangladesh", short: "BAN", tier: "full", colours: ["#0a6b4f", "#d62839", "#f3d27a"], emblem: "ring", strength: 7, players: ["Rafid Talukdar", "Tahsin Mollah", "Nayeem Sarkar", "Shadman Kabir", "Ifti Howlader", "Zubair Majumder", "Arif Bhuiyan", "Sajid Patwari", "Mahir Sikdar", "Rakib Hawladar", "Tanzim Akand", "Jubayer Pramanik", "Fahim Gazi", "Shihab Munshi", "Rizwan Khondokar"] },
  { id: "afghanistan", name: "Afghanistan", short: "AFG", tier: "full", colours: ["#1667c2", "#c8102e", "#101418"], emblem: "peak", strength: 8, players: ["Haroon Stanikzai", "Baheer Wardak", "Samiullah Ahmadzai", "Idrees Kakar", "Wali Mangal", "Yama Hotak", "Farhad Noorzai", "Zmarai Safi", "Nangyal Sherzad", "Bilal Popal", "Qais Momand", "Emal Zadran", "Shafiq Durani", "Omid Jalali", "Latif Haidari"] },
  { id: "west-indies", name: "West Indies", short: "WI", tier: "full", colours: ["#7b1f3a", "#f2c230", "#2a0f1a"], emblem: "sun", strength: 8, players: ["Javon Blackwood", "Kemar Springer", "Dwayne Fontaine", "Tariq Maynard", "Shaquille Prescod", "Andre Belgrave", "Rakeem Lashley", "Jomel Thibou", "Odean Carrington", "Keon Durant", "Marlon Hinkson", "Renaldo Bascombe", "Akeem Ollivierre", "Devon Sealy", "Kirk Ramnarace"] },
  { id: "ireland", name: "Ireland", short: "IRE", tier: "full", colours: ["#1a8f4c", "#0f3d2e", "#f4f1e6"], emblem: "leaf", strength: 6, players: ["Cillian Mulvaney", "Oisin Farrelly", "Tadhg Brannigan", "Ronan Devaney", "Fionn Geraghty", "Darragh Kinsella", "Cormac Lanigan", "Eoin Tierney", "Padraig Costigan", "Niall Heffernan", "Conall Reardon", "Senan Mulqueen", "Lorcan Fennessy", "Diarmuid Scully", "Aodhan Rafferty"] },
  { id: "zimbabwe", name: "Zimbabwe", short: "ZIM", tier: "full", colours: ["#c8102e", "#f4c430", "#12372a"], emblem: "chevron", strength: 6, players: ["Tinashe Mavhunga", "Farai Chigwedere", "Tawanda Mukondiwa", "Kudzai Nyamande", "Brandon Hartley", "Tapiwa Gumbo", "Simbarashe Zvobgo", "Nyasha Makoni", "Takudzwa Bvute", "Rufaro Chitsaka", "Munashe Dzingai", "Craig Venables", "Panashe Musarurwa", "Tendai Hwata", "Blessing Manyika"] },
  { id: "netherlands", name: "Netherlands", short: "NED", tier: "associate", colours: ["#f36c21", "#16307a", "#fff3e6"], emblem: "bars", strength: 5, players: ["Daan Verhoeven", "Sem Kuipers", "Bram Hofstra", "Luuk Dijkema", "Thijs Oosterhuis", "Jesse Brouwer", "Ruben Wessels", "Stijn Veldkamp", "Niels Postma", "Mats Hendriks", "Floris Terpstra", "Joris Koopman", "Teun Bakker", "Pim Schouten", "Gijs Mulder"] },
  { id: "scotland", name: "Scotland", short: "SCO", tier: "associate", colours: ["#14337a", "#6c2a8c", "#eef2fb"], emblem: "diamond", strength: 5, players: ["Fraser Kinnaird", "Ewan Balfour", "Callan Moncrieff", "Rory Sutherland-Kerr", "Struan Laidlaw", "Innes Drummond", "Finlay Abernethy", "Gregor Tulloch", "Murray Carnegie", "Lewis Pitcairn", "Blair Rintoul", "Hamish Elphinstone", "Angus Baillie", "Torin Galbraith", "Keir Dunsmuir"] },
  { id: "nepal", name: "Nepal", short: "NEP", tier: "associate", colours: ["#c8102e", "#12357f", "#f6f1e7"], emblem: "peak", strength: 5, players: ["Bibek Gautam", "Sagar Lamsal", "Prabin Khadka", "Nischal Dahal", "Anup Poudyal", "Roshan Tamang", "Sujan Basnet", "Kiran Rokaya", "Dipesh Ghimire", "Manish Budhathoki", "Aashish Sunuwar", "Bikram Chaudhary", "Sandesh Koirala", "Yogesh Bhandari", "Ritesh Pun"] },
  { id: "uae", name: "United Arab Emirates", short: "UAE", tier: "associate", colours: ["#8a94a3", "#b0122b", "#101418"], emblem: "ring", strength: 4, players: ["Rashid Almarri", "Zaid Alkaabi", "Karthik Subramani", "Hamad Alshamsi", "Vinay Cherian", "Saif Alnuaimi", "Junaid Latif", "Omar Alketbi", "Basil Koshy", "Adnan Rauf", "Khalid Alhammadi", "Rohan Tharakan", "Majid Alzaabi", "Asad Mehmood", "Sultan Aldhaheri"] },
  { id: "usa", name: "United States", short: "USA", tier: "associate", colours: ["#14337a", "#c8102e", "#f2f4f8"], emblem: "star", strength: 5, players: ["Aiden Castellano", "Rishi Vaidya", "Marcus Whitfield", "Sanjay Iyengar", "Tyler Okafor", "Neil Ramsaroop", "Jordan Delacroix", "Varun Chitale", "Elias Montgomery", "Akash Deshmukh", "Brandon Kessler", "Naveen Gollapudi", "Cameron Ashby", "Dev Persaud", "Isaiah Pemberton"] },
  { id: "namibia", name: "Namibia", short: "NAM", tier: "associate", colours: ["#14337a", "#c8102e", "#f4c430"], emblem: "sun", strength: 4, players: ["Hendrik Louw", "Pieter Steenkamp", "Shaun Kotze", "Jan-Hendrik Brits", "Ndeshi Shikongo", "Zander Coetzee", "Nico Burger", "Tangeni Iipinge", "Michau du Preez", "Ruben Opperman", "Danie Viljoen", "Mauritius Haufiku", "Ben van Wyk", "Lohan Marais", "Petrus Amutenya"] },
  { id: "oman", name: "Oman", short: "OMA", tier: "associate", colours: ["#c8102e", "#0f7a4a", "#f6f1e7"], emblem: "wave", strength: 4, players: ["Yousuf Albalushi", "Hamza Alrawahi", "Jatin Kothari", "Salim Alhabsi", "Naseem Bukhari", "Faisal Alsaadi", "Pratik Vora", "Mazin Alhinai", "Shoaib Anwar", "Talal Alfarsi", "Kashif Jamali", "Ahmed Alwahaibi", "Sufyan Lakhani", "Nadir Albusaidi", "Imran Dalwai"] },
  { id: "canada", name: "Canada", short: "CAN", tier: "associate", colours: ["#c8102e", "#101418", "#f6f1e7"], emblem: "leaf", strength: 4, players: ["Harjot Dhaliwal", "Liam Carmichael", "Navdeep Sandhar", "Ethan Beauchamp", "Pargat Sohal", "Noah Lindqvist", "Ravinder Gosal", "Owen Mackinnon", "Dilpreet Bajwa", "Nolan Tremblay", "Kanwar Mangat", "Jeremy Gordon-Lewis", "Sukhman Aulakh", "Aaron Pellerin", "Gurbaz Randhawa"] },
];

/** Deterministic 0..1 from a string (FNV-1a, then an avalanche step). */
function unit(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
const bound = (n: number) => Math.round(Math.max(ATTRIBUTE_MIN, Math.min(ATTRIBUTE_MAX, n)));

/** Base levels by role: [batting, power, bowling, fielding, keeping]. */
const BASE: Record<PlayerRole, [number, number, number, number, number]> = {
  batter: [72, 66, 40, 66, 38],
  keeper: [66, 60, 36, 70, 78],
  "all-rounder": [62, 64, 62, 68, 38],
  pace: [44, 48, 72, 62, 36],
  spin: [46, 44, 72, 62, 36],
};
const PACE: BowlingType[] = ["fast", "fast", "medium"];
const SPIN: BowlingType[] = ["off-spin", "leg-spin", "left-arm-spin"];

function buildPlayer(team: Seed, slot: number): CricketPlayer {
  const id = `${team.id}-${slot + 1}`,
    role = SLOT_ROLES[slot]!,
    base = BASE[role],
    // Strength lifts a side by up to 8; individuals vary by ±7 around their role.
    lift = team.strength * 0.8,
    roll = (k: string) => (unit(`${id}:${k}`) - 0.5) * 14;
  const bowls: BowlingType | null =
    role === "pace" ? PACE[Math.floor(unit(`${id}:type`) * PACE.length)]! : role === "spin" ? SPIN[Math.floor(unit(`${id}:type`) * SPIN.length)]! : role === "all-rounder" ? [...PACE, ...SPIN][Math.floor(unit(`${id}:type`) * 6)]! : null;
  return {
    id,
    name: team.players[slot]!,
    role,
    bats: unit(`${id}:hand`) < 0.28 ? "left" : "right",
    bowls,
    batting: bound(base[0] + lift + roll("bat")),
    power: bound(base[1] + lift + roll("pow")),
    bowling: bound(base[2] + (bowls ? lift : 0) + roll("bowl")),
    fielding: bound(base[3] + lift * 0.6 + roll("field")),
    keeping: bound(base[4] + (role === "keeper" ? lift : 0) + roll("keep")),
  };
}

const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
/** A darker shade of a hex colour, for trousers and away kits. */
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16),
    c = (v: number) => Math.round(Math.max(0, Math.min(255, v * k))).toString(16).padStart(2, "0");
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

function buildTeam(seed: Seed): CricketTeam {
  const squad = seed.players.map((_, slot) => buildPlayer(seed, slot)),
    xi = XI_SLOTS.map((slot) => squad[slot]!),
    [primary, secondary, accent] = seed.colours,
    // The captain is one of the senior eight, fixed per team.
    captain = squad[Math.floor(unit(`${seed.id}:captain`) * 8)]!;
  const bowlers = xi.filter((p) => p.bowls);
  return {
    id: seed.id,
    name: seed.name,
    short: seed.short,
    tier: seed.tier,
    palette: { primary, secondary, accent },
    kits: { home: { shirt: primary, trousers: shade(primary, 0.82), trim: accent }, away: { shirt: secondary, trousers: shade(secondary, 0.82), trim: accent } },
    emblem: seed.emblem,
    squad,
    xi: xi.map((p) => p.id),
    captain: captain.id,
    keeper: squad[5]!.id,
    ratings: { batting: mean(xi.slice(0, 8).map((p) => p.batting)), bowling: mean(bowlers.map((p) => p.bowling)), fielding: mean(xi.map((p) => p.fielding)) },
  };
}

/** Every selectable international side: the twelve full members first, then associates. */
export const INTERNATIONAL_TEAMS: readonly CricketTeam[] = SEEDS.map(buildTeam);
export const internationalTeam = (id: string) => INTERNATIONAL_TEAMS.find((t) => t.id === id) ?? null;

export interface Selection {
  /** Eleven player ids in batting order. */
  xi: string[];
  captain: string;
  keeper: string;
}
/**
 * Checks a playing eleven chosen from a team's squad. Returns the problems (empty when valid).
 * `minBowlers` is the number of bowling options a format needs (five for limited overs).
 */
export function validateSelection(team: CricketTeam, pick: Selection, minBowlers = 5): string[] {
  const problems: string[] = [],
    byId = new Map(team.squad.map((p) => [p.id, p]));
  if (pick.xi.length !== 11) problems.push("A playing eleven needs exactly 11 players.");
  if (new Set(pick.xi).size !== pick.xi.length) problems.push("A player is picked twice.");
  if (pick.xi.some((id) => !byId.has(id))) problems.push("A player is not in this squad.");
  if (!pick.xi.includes(pick.captain)) problems.push("The captain must be in the eleven.");
  if (!pick.xi.includes(pick.keeper)) problems.push("The wicketkeeper must be in the eleven.");
  const bowlers = pick.xi.filter((id) => byId.get(id)?.bowls).length;
  if (bowlers < minBowlers) problems.push(`The eleven needs at least ${minBowlers} bowling options.`);
  return problems;
}
