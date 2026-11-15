import { describe, expect, it } from "vitest";
import { signShareToken, verifyShareToken } from "../src/identity/share";
import { sharePayloadFor } from "../src/share-card";
import type { MatchResults } from "../src/realtime/protocol";

const SECRET = "test-secret-test-secret-test-secret-000";
const results: MatchResults = {
  gameId: "same-wavelength",
  endedAt: 1_700_000_000_000,
  reason: "completed",
  entries: [
    { playerId: "player-uuid-asha", name: "Asha", color: "#fff", placement: 1, score: 14, isWinner: false, details: { result: "shared", players: 2, matchPct: 75, exactMatches: 6, comparisons: 8, perfectRounds: 6, rounds: 8, agreeTopics: "travel", differTopics: "food" } },
    { playerId: "player-uuid-ben", name: "Ben", color: "#fff", placement: 1, score: 14, isWinner: false, details: { result: "shared", players: 2, matchPct: 75, exactMatches: 6, comparisons: 8, perfectRounds: 6, rounds: 8, agreeTopics: "travel", differTopics: "food" } },
  ],
};

describe("share cards", () => {
  it("summarise a match without names unless the sharer opts in, and never with ids", () => {
    const anonymous = sharePayloadFor(results, { seed: "match-1", includeNames: false });
    expect(anonymous).toMatchObject({ g: "same-wavelength", h: "75% on the same wavelength", m: 75, p: 2 });
    expect(anonymous.n).toBeUndefined();
    expect(anonymous.i.length).toBeGreaterThan(0);
    const named = sharePayloadFor(results, { seed: "match-1", includeNames: true });
    expect(named.n).toEqual(["Asha", "Ben"]);
    for (const p of [anonymous, named]) expect(JSON.stringify(p)).not.toMatch(/player-uuid|match-1/);
  });

  it("describe other games from their recorded scores", () => {
    const doodle: MatchResults = {
      gameId: "doodle-duel",
      endedAt: 1,
      reason: "completed",
      entries: [
        { playerId: "a", name: "Asha", color: "#fff", placement: 1, score: 900, isWinner: true, details: {} },
        { playerId: "b", name: "Ben", color: "#fff", placement: 2, score: 700, isWinner: false, details: {} },
      ],
    };
    expect(sharePayloadFor(doodle, { seed: "s", includeNames: false }).h).toBe("A winner was crowned in Doodle Duel");
    expect(sharePayloadFor(doodle, { seed: "s", includeNames: true }).h).toBe("Asha won in Doodle Duel");
  });

  it("can't be edited: a changed or foreign token is refused", async () => {
    const token = await signShareToken(sharePayloadFor(results, { seed: "m", includeNames: false }), SECRET);
    expect((await verifyShareToken(token, SECRET))!.m).toBe(75);
    const [head, body, sig] = token.split(".");
    const forged = JSON.parse(Buffer.from(body!, "base64url").toString());
    forged.d.m = 100;
    expect(await verifyShareToken(`${head}.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`, SECRET)).toBeNull();
    expect(await verifyShareToken(token, "another-secret-another-secret-another-0")).toBeNull();
    expect(await verifyShareToken("not-a-token", SECRET)).toBeNull();
    expect(await verifyShareToken("x".repeat(5000), SECRET)).toBeNull();
  });

  it("refuses to sign content outside the card's limits", async () => {
    const payload = sharePayloadFor(results, { seed: "m", includeNames: false });
    await expect(signShareToken({ ...payload, i: ["a", "b", "c"] }, SECRET)).rejects.toThrow();
    await expect(signShareToken({ ...payload, extra: "private" } as never, SECRET)).rejects.toThrow();
  });
});
