import { describe, expect, it } from "vitest";
import { avatarUrl, usernameSchema } from "../src/identity/profile";
describe("Public player profile contract", () => {
  it("explicitly lowercases ASCII handles and preserves single internal underscores", () => {
    expect(usernameSchema.parse("Pixel_Fox7")).toBe("pixel_fox7");
    expect(usernameSchema.safeParse(" pixel_fox7").success).toBe(false);
    expect(usernameSchema.safeParse("pixel_fox7 ").success).toBe(false);
  });
  it("blocks staff-role impersonation variants and denylisted tokens", () => {
    for (const value of [
      "Support123",
      "Administrator99",
      "real_admin",
      "GoogleTeam",
      "staff_member",
      "officialfox",
      "cool_nazi",
    ])
      expect(usernameSchema.safeParse(value).success, value).toBe(false);
  });
  it("accepts only server-shaped avatar keys and same-origin variant routes", () => {
    expect(avatarUrl("a".repeat(32))).toBe(
      `/api/avatars/${"a".repeat(32)}/small`,
    );
    expect(avatarUrl("a".repeat(32), "full")).toBe(
      `/api/avatars/${"a".repeat(32)}/full`,
    );
    for (const key of [
      null,
      undefined,
      "../private",
      "https://other.example/image",
      "<svg/>",
      "a".repeat(31),
    ])
      expect(avatarUrl(key)).toBeNull();
  });
});
