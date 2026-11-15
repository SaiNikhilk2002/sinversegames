import { describe, expect, it } from "vitest";
import { GAMES, GAME_IDS, getGame, type GameId } from "../src/games/registry";
import {
  COLLECTIONS,
  DISCOVERY_CATEGORIES,
  GAME_DISCOVERY,
  categoriesOf,
  collectionsFor,
  discoveryCategory,
  gamesInCategory,
  searchGames,
  supportsPlayers,
  visibleCategories,
} from "../src/games/discovery";

describe("game discovery categories", () => {
  it("classifies every game, with multiplayer and single player derived from the game's kind", () => {
    expect(Object.keys(GAME_DISCOVERY).sort()).toEqual([...GAME_IDS].sort());
    for (const g of GAMES) {
      const cats = categoriesOf(g);
      expect(cats[0]).toBe(g.kind === "multiplayer" ? "multiplayer" : "single-player");
      expect(new Set(cats).size).toBe(cats.length);
    }
  });

  it("lists one game in several categories without copying it", () => {
    for (const id of ["multiplayer", "couples", "friends", "party"] as const) expect(gamesInCategory(id).map((g) => g.id)).toContain("doodle-duel");
    // The same object every time: one canonical record, one id, one route.
    const fromCouples = gamesInCategory("couples").find((g) => g.id === "doodle-duel");
    const fromParty = gamesInCategory("party").find((g) => g.id === "doodle-duel");
    expect(fromCouples).toBe(fromParty);
    expect(fromCouples).toBe(getGame("doodle-duel"));
    for (const c of DISCOVERY_CATEGORIES) {
      const ids = gamesInCategory(c.id).map((g) => g.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(GAMES.length);
  });

  it("only calls a game couples-friendly when two players can play it", () => {
    for (const g of gamesInCategory("couples")) {
      expect(g.kind).toBe("multiplayer");
      expect(g.minPlayers).toBeLessThanOrEqual(2);
      expect(g.maxPlayers).toBeGreaterThanOrEqual(2);
    }
    expect(gamesInCategory("couples").map((g) => g.id)).toEqual(expect.arrayContaining(["same-wavelength", "doodle-duel"]));
    for (const g of gamesInCategory("single-player")) expect(g.kind).toBe("solo");
  });

  it("shows only visible categories that have games, in order, with their own copy", () => {
    const visible = visibleCategories();
    expect(visible.map((c) => c.id)).toEqual(expect.arrayContaining(["multiplayer", "single-player", "couples", "friends", "family", "party"]));
    expect(visible.map((c) => c.order)).toEqual([...visible.map((c) => c.order)].sort((a, b) => a - b));
    for (const c of visible) expect(gamesInCategory(c.id).length).toBeGreaterThan(0);
    // Unique titles and descriptions for every landing page.
    expect(new Set(DISCOVERY_CATEGORIES.map((c) => c.landing.title)).size).toBe(DISCOVERY_CATEGORIES.length);
    expect(new Set(DISCOVERY_CATEGORIES.map((c) => c.landing.metaDescription)).size).toBe(DISCOVERY_CATEGORIES.length);
    for (const c of DISCOVERY_CATEGORIES) expect(c.landing.metaDescription.length).toBeLessThanOrEqual(170);
    expect(discoveryCategory("couples")!.href).toBe("/couples");
    expect(discoveryCategory("nope")).toBeUndefined();
  });

  it("hides a category that has no available games", () => {
    const casual = GAMES.filter((g) => GAME_DISCOVERY[g.id].audiences.includes("casual")).map((g) => g.id) as GameId[];
    const before = casual.map((id) => GAME_DISCOVERY[id].availability);
    try {
      for (const id of casual) GAME_DISCOVERY[id].availability = "coming-soon";
      expect(gamesInCategory("casual")).toEqual([]);
      expect(visibleCategories().map((c) => c.id)).not.toContain("casual");
    } finally {
      casual.forEach((id, i) => (GAME_DISCOVERY[id].availability = before[i]!));
    }
    expect(visibleCategories().map((c) => c.id)).toContain("casual");
  });
});

describe("search and filters", () => {
  it("searches names, descriptions, keywords and tags", () => {
    expect(searchGames({ q: "wavelength" }).map((g) => g.id)).toEqual(["same-wavelength"]);
    expect(searchGames({ q: "  DRAWING " }).map((g) => g.id)).toContain("doodle-duel");
    expect(searchGames({ q: "zzzz-no-such-game" })).toEqual([]);
  });

  it("filters by category, genre and player count together", () => {
    const twoPlayerCouples = searchGames({ category: "couples", players: "2" });
    expect(twoPlayerCouples.length).toBe(gamesInCategory("couples").length);
    expect(searchGames({ players: "1" }).every((g) => g.kind === "solo")).toBe(true);
    expect(searchGames({ players: "5+" }).every((g) => g.maxPlayers >= 5)).toBe(true);
    expect(searchGames({ players: "5+" }).map((g) => g.id)).toEqual(expect.arrayContaining(["same-wavelength", "doodle-duel", "bumper-blitz"]));
    expect(searchGames({ category: "single-player", genre: "cards" }).map((g) => g.id)).toEqual(["cascade-solitaire"]);
    expect(supportsPlayers(getGame("chef-rivals"), "3-4")).toBe(false);
    expect(supportsPlayers(getGame("color-clash"), "3-4")).toBe(true);
  });
});

describe("collections", () => {
  it("only contain real games assigned to the collection's category", () => {
    for (const c of COLLECTIONS) {
      for (const item of c.items) {
        expect(GAME_IDS).toContain(item.gameId);
        expect(GAME_DISCOVERY[item.gameId].audiences).toContain(c.category);
      }
    }
    const couples = collectionsFor("couples");
    expect(couples.map((c) => c.id)).toEqual(expect.arrayContaining(["know-each-other", "think-alike", "draw-together", "friendly-competition", "date-night", "laugh-together", "long-distance"]));
    for (const c of couples) expect(c.items.length).toBeGreaterThan(0);
  });
});
