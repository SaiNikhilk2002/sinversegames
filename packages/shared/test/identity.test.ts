import { describe, expect, it } from "vitest";
import { sanitizeDisplayName } from "../src/identity/names";
import { InvalidTokenError, signPlayerToken, verifyPlayerToken } from "../src/identity/tokens";
import { roomCodeSchema } from "../src/realtime/protocol";

const SECRET = "test-secret-test-secret-test-secret-123";
const claims = { sub: "player-1", name: "Ava", color: "#ff6b6b", kind: "guest" as const };

describe("display names", () => {
  it("trims, collapses whitespace and limits length", () => {
    expect(sanitizeDisplayName("   Ava    Lee  ")).toBe("Ava Lee");
    expect(sanitizeDisplayName("x".repeat(40))).toHaveLength(20);
  });

  it("strips markup, control and bidi characters", () => {
    expect(sanitizeDisplayName("<script>alert(1)</script>")).toBe("scriptalert1script");
    expect(sanitizeDisplayName("Ad‮min​")).toBe("Admin");
    expect(sanitizeDisplayName("Zoë_李")).toBe("Zoë_李");
  });

  it("rejects names that are empty after cleaning", () => {
    expect(sanitizeDisplayName("  ")).toBeNull();
    expect(sanitizeDisplayName("<>")).toBeNull();
    expect(sanitizeDisplayName("a")).toBeNull();
  });
});

describe("player tokens", () => {
  it("round-trips claims for the same token kind", async () => {
    const token = await signPlayerToken(claims, "realtime", SECRET);
    await expect(verifyPlayerToken(token, "realtime", SECRET)).resolves.toEqual(claims);
  });

  it("rejects tokens of another kind, a wrong secret or tampering", async () => {
    const token = await signPlayerToken(claims, "session", SECRET);
    await expect(verifyPlayerToken(token, "realtime", SECRET)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(verifyPlayerToken(token, "session", SECRET + "x")).rejects.toBeInstanceOf(InvalidTokenError);
    const [h, p, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p!, "base64url").toString()), sub: "someone-else" })).toString("base64url");
    await expect(verifyPlayerToken(`${h}.${forged}.${sig}`, "session", SECRET)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("reports expiry", async () => {
    const token = await signPlayerToken(claims, "realtime", SECRET, -10);
    await expect(verifyPlayerToken(token, "realtime", SECRET)).rejects.toMatchObject({ reason: "expired" });
  });

  it("refuses weak secrets", async () => {
    await expect(signPlayerToken(claims, "realtime", "short")).rejects.toThrow();
  });
});

describe("room codes", () => {
  it("accepts valid codes case-insensitively and rejects ambiguous characters", () => {
    expect(roomCodeSchema.parse(" abc234 ")).toBe("ABC234");
    expect(roomCodeSchema.safeParse("ABCDE1").success).toBe(false);
    expect(roomCodeSchema.safeParse("ABCDEO").success).toBe(false);
    expect(roomCodeSchema.safeParse("ABC").success).toBe(false);
  });
});
