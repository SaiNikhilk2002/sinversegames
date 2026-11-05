import { describe, expect, it } from "vitest";
import {
  emailLinkTokenSchema,
  emailSchema,
  generateOtp,
  maskEmail,
  otpEmail,
  otpMac,
  otpSchema,
  securityEmail,
  verificationLinkEmail,
  verifyOtpMac,
  welcomeEmail,
} from "../src/identity";

const SECRET = "unit-test-secret-unit-test-secret-1234";

describe("email normalization", () => {
  it("gives one form for the same address", () => {
    expect(emailSchema.parse("  Player.One@Example.COM ")).toBe("player.one@example.com");
  });
  it.each([
    "",
    "plain",
    "a@b",
    "a b@example.com",
    "a@exa mple.com",
    "a@@example.com",
    "a@example..com",
    "a@-example.com",
    "<a@example.com>",
    "a@example.com\nBcc: b@example.com",
    "a,b@example.com",
    `${"x".repeat(120)}@example.com`,
  ])("rejects %j", (value) => {
    expect(emailSchema.safeParse(value).success).toBe(false);
  });
  it("masks all but the first letter", () => {
    expect(maskEmail("player@example.com")).toBe("p***@example.com");
  });
});

describe("codes and tokens", () => {
  it("generates six digits and doesn't repeat itself", () => {
    const codes = Array.from({ length: 400 }, generateOtp);
    for (const code of codes) expect(otpSchema.safeParse(code).success).toBe(true);
    expect(new Set(codes).size).toBeGreaterThan(390);
  });
  it("verifies only the right code, attempt and secret", async () => {
    const mac = await otpMac(SECRET, "attempt-a", "123456");
    expect(mac).toMatch(/^[a-f0-9]{64}$/);
    expect(mac).not.toContain("123456");
    expect(await verifyOtpMac(SECRET, "attempt-a", "123456", mac)).toBe(true);
    expect(await verifyOtpMac(SECRET, "attempt-a", "123457", mac)).toBe(false);
    expect(await verifyOtpMac(SECRET, "attempt-b", "123456", mac)).toBe(false);
    expect(await verifyOtpMac(`${SECRET}x`, "attempt-a", "123456", mac)).toBe(false);
  });
  it("refuses malformed stored values without throwing", async () => {
    for (const mac of ["", "zz", "a".repeat(63), "A".repeat(64)])
      expect(await verifyOtpMac(SECRET, "attempt-a", "123456", mac)).toBe(false);
  });
  it("accepts only full-length lowercase link tokens", () => {
    expect(emailLinkTokenSchema.safeParse("a".repeat(64)).success).toBe(true);
    for (const token of ["a".repeat(63), "A".repeat(64), `${"a".repeat(63)}g`])
      expect(emailLinkTokenSchema.safeParse(token).success).toBe(false);
  });
});

describe("email templates", () => {
  const link = "https://sinversegames.com/auth/email#token=abc&x=<1>";
  it("keeps the code out of the subject line", () => {
    const message = otpEmail("482913", 10);
    expect(message.subject).not.toContain("482913");
    expect(message.html).toContain("482913");
    expect(message.text).toContain("482913");
    expect(message.html.split("display:none")[1]!.split("</div>")[0]).not.toContain("482913");
  });
  it("keeps the link out of the subject line and escapes it in HTML", () => {
    const message = verificationLinkEmail(link, 15);
    expect(message.subject).not.toContain("token");
    expect(message.html).not.toContain("<1>");
    expect(message.html).toContain("&lt;1&gt;");
    expect(message.text).toContain(link);
  });
  it("has four distinct kinds of message, each with a plain-text version", () => {
    const messages = [
      otpEmail("482913", 10),
      verificationLinkEmail(link, 15),
      welcomeEmail("https://sinversegames.com/games"),
      securityEmail("new_sign_in", "https://sinversegames.com/account"),
      securityEmail("other_sessions_signed_out", "https://sinversegames.com/account"),
    ];
    expect(new Set(messages.map((m) => m.subject)).size).toBe(messages.length);
    for (const message of messages) {
      expect(message.subject).toContain("SinverseGames");
      expect(message.html).toContain("SinverseGames");
      expect(message.text.length).toBeGreaterThan(20);
    }
  });
});
