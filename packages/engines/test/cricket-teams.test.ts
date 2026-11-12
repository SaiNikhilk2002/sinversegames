import { describe, expect, it } from "vitest";
import { ATTRIBUTE_MAX, ATTRIBUTE_MIN, INTERNATIONAL_TEAMS, SQUAD_SIZE, TEAMS, internationalTeam, validateSelection } from "../src/sinverse-cricket";

const FULL = ["India", "Australia", "England", "Pakistan", "South Africa", "New Zealand", "Sri Lanka", "Bangladesh", "Afghanistan", "West Indies", "Ireland", "Zimbabwe"];
/** Well-known real internationals: no fictional player may share a full name with any of them. */
const REAL = ["Virat Kohli", "Rohit Sharma", "Jasprit Bumrah", "Shubman Gill", "Rishabh Pant", "Hardik Pandya", "Ravindra Jadeja", "KL Rahul", "Pat Cummins", "Steve Smith", "Travis Head", "Mitchell Starc", "David Warner", "Glenn Maxwell", "Marnus Labuschagne", "Joe Root", "Ben Stokes", "Jos Buttler", "Harry Brook", "Jofra Archer", "Babar Azam", "Shaheen Afridi", "Mohammad Rizwan", "Naseem Shah", "Kagiso Rabada", "Quinton de Kock", "Aiden Markram", "Temba Bavuma", "Kane Williamson", "Trent Boult", "Tim Southee", "Devon Conway", "Kusal Mendis", "Wanindu Hasaranga", "Pathum Nissanka", "Shakib Al Hasan", "Mushfiqur Rahim", "Litton Das", "Rashid Khan", "Mohammad Nabi", "Rahmanullah Gurbaz", "Nicholas Pooran", "Shai Hope", "Andre Russell", "Jason Holder", "Paul Stirling", "Andrew Balbirnie", "Sikandar Raza", "Craig Ervine", "Bas de Leede", "Max O'Dowd", "Richie Berrington", "Sandeep Lamichhane", "Rohit Paudel", "Gerhard Erasmus", "Aaron Jones", "Saurabh Netravalkar"];

describe("international team catalogue", () => {
  it("has the twelve full members first, then associates, with unique identities", () => {
    expect(INTERNATIONAL_TEAMS.slice(0, 12).map((t) => t.name)).toEqual(FULL);
    expect(INTERNATIONAL_TEAMS.slice(0, 12).every((t) => t.tier === "full")).toBe(true);
    expect(INTERNATIONAL_TEAMS.length).toBeGreaterThanOrEqual(20);
    for (const key of ["id", "name", "short"] as const) expect(new Set(INTERNATIONAL_TEAMS.map((t) => t[key])).size).toBe(INTERNATIONAL_TEAMS.length);
    expect(internationalTeam("india")?.short).toBe("IND");
    expect(internationalTeam("nowhere")).toBeNull();
  });
  it("gives every team a full squad, a valid default eleven, a captain and a keeper", () => {
    for (const t of INTERNATIONAL_TEAMS) {
      expect(t.squad).toHaveLength(SQUAD_SIZE);
      expect(validateSelection(t, t), t.name).toEqual([]);
      expect(t.squad.find((p) => p.id === t.keeper)?.role).toBe("keeper");
      expect(t.xi).toContain(t.captain);
      for (const colour of [...Object.values(t.palette), ...Object.values(t.kits.home), ...Object.values(t.kits.away)]) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
      expect(t.kits.home.shirt).not.toBe(t.kits.away.shirt);
    }
  });
  it("uses invented players: unique names, and none shared with a real international", () => {
    const names = INTERNATIONAL_TEAMS.flatMap((t) => t.squad.map((p) => p.name));
    expect(new Set(names).size).toBe(names.length);
    const real = new Set(REAL.map((n) => n.toLowerCase()));
    expect(names.filter((n) => real.has(n.toLowerCase()))).toEqual([]);
    expect(names.every((n) => /^[A-Z][A-Za-z'-]+( [A-Za-z][A-Za-z'-]+)+$/.test(n))).toBe(true);
  });
  it("keeps attributes inside the bounds, different between players, and fitted to roles", () => {
    const all = INTERNATIONAL_TEAMS.flatMap((t) => t.squad);
    for (const p of all) for (const k of ["batting", "power", "bowling", "fielding", "keeping"] as const) {
      expect(p[k]).toBeGreaterThanOrEqual(ATTRIBUTE_MIN);
      expect(p[k]).toBeLessThanOrEqual(ATTRIBUTE_MAX);
    }
    expect(new Set(all.map((p) => `${p.batting}-${p.power}-${p.bowling}-${p.fielding}`)).size).toBeGreaterThan(all.length * 0.9);
    const avg = (role: string, k: "batting" | "bowling" | "keeping") => {
      const xs = all.filter((p) => p.role === role).map((p) => p[k]);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(avg("batter", "batting")).toBeGreaterThan(avg("pace", "batting") + 15);
    expect(avg("pace", "bowling")).toBeGreaterThan(avg("batter", "bowling") + 15);
    expect(avg("keeper", "keeping")).toBeGreaterThan(avg("batter", "keeping") + 25);
    expect(all.filter((p) => p.role === "pace" || p.role === "spin").every((p) => p.bowls)).toBe(true);
  });
  it("is balanced: the strongest and weakest sides differ, but within a controlled spread", () => {
    const rating = (id: string) => {
      const r = internationalTeam(id)!.ratings;
      return (r.batting + r.bowling + r.fielding) / 3;
    };
    const all = INTERNATIONAL_TEAMS.map((t) => rating(t.id));
    expect(Math.max(...all) - Math.min(...all)).toBeLessThanOrEqual(12);
    expect(rating("india")).toBeGreaterThan(rating("oman"));
  });
  it("rejects bad elevens", () => {
    const t = internationalTeam("australia")!;
    expect(validateSelection(t, { ...t, xi: t.xi.slice(0, 10) })).toContain("A playing eleven needs exactly 11 players.");
    expect(validateSelection(t, { ...t, xi: [...t.xi.slice(0, 10), t.xi[0]!] })).toContain("A player is picked twice.");
    expect(validateSelection(t, { ...t, captain: "australia-15" })).toContain("The captain must be in the eleven.");
    const batters = [0, 1, 2, 3, 4, 5, 14, 6, 7, 8, 9].map((s) => t.squad[s]!.id);
    expect(validateSelection(t, { xi: batters, captain: batters[0]!, keeper: t.keeper })).toEqual(["The eleven needs at least 5 bowling options."]);
  });
  it("is deterministic and leaves the existing duel teams untouched", async () => {
    const again = await import("../src/sinverse-cricket/teams");
    expect(JSON.stringify(again.INTERNATIONAL_TEAMS)).toBe(JSON.stringify(INTERNATIONAL_TEAMS));
    expect(TEAMS.map((t) => t.id)).toEqual(["harbour-lights", "ember-kites"]);
  });
});
