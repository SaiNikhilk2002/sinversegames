import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createAccountSession, getDb } from "@platform/db";
import { hashSecret } from "@platform/shared";
test.use({ trace: "off" });
test("identity: a database session failure preserves the cookie and cannot replace it with a new guest", async ({
  browser,
}) => {
  const target = new URL(process.env.E2E_DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    !target.pathname.endsWith("_test")
  )
    throw Error(
      "Outage fixture requires an isolated loopback *_test database.",
    );
  process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
  const db = getDb()!;
  const playerId = `outage_${randomUUID().replaceAll("-", "")}`;
  await db.player.create({
    data: {
      id: playerId,
      displayName: "Outage fixture",
      avatarColor: "#7268c6",
      kind: "REGISTERED",
    },
  });
  const session = await createAccountSession(db, playerId);
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": "198.51.100.85" },
  });
  await context.addCookies([
    {
      name: "pw_session",
      value: `s1_${session.secret}`,
      url: "http://localhost:3200",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  let renamed = false;
  try {
    expect(
      (
        await (
          await context.request.get("http://localhost:3200/api/session")
        ).json()
      ).player.id,
    ).toBe(playerId);
    await db.$executeRawUnsafe(
      'ALTER TABLE "AccountSession" RENAME TO "AccountSession_identity_outage_fixture"',
    );
    renamed = true;
    expect(
      (await context.request.get("http://localhost:3200/api/session")).status(),
    ).toBe(503);
    const response = await context.request.post(
      "http://localhost:3200/api/session",
      {
        headers: { origin: "http://localhost:3200" },
        data: { displayName: "Accidental replacement" },
      },
    );
    expect(response.status()).toBe(503);
    expect(response.headers()["set-cookie"]).toBeUndefined();
    // These once returned a 500 with an empty body, which browsers report as a JSON parse error.
    const origin = { origin: "http://localhost:3200" };
    for (const failing of [
      await context.request.get("http://localhost:3200/api/cuisine-quest/campaign"),
      await context.request.post("http://localhost:3200/api/session/token", { headers: origin }),
      await context.request.get("http://localhost:3200/api/wallet"),
      await context.request.get("http://localhost:3200/api/solo/best?game=cuisine-quest"),
      await context.request.post("http://localhost:3200/api/solo/start", { headers: origin, data: { gameId: "cuisine-quest", config: { level: 1 } } }),
    ]) {
      expect(failing.status()).toBe(503);
      const text = await failing.text();
      expect(JSON.parse(text).error).toBe("Player sessions are temporarily unavailable. Please retry.");
      // The client learns nothing about the database behind the failure.
      expect(text).not.toMatch(/postgres|prisma|AccountSession|stack/i);
    }
    expect(
      await hashSecret(
        (await context.cookies()).find((cookie) => cookie.name === "pw_session")
          ?.value ?? "",
      ),
    ).toBe(await hashSecret(`s1_${session.secret}`));
    const page = await context.newPage();
    await page.goto("http://localhost:3200/account");
    await expect(
      page.getByRole("button", { name: "Retry player session", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue as guest", exact: true }),
    ).toHaveCount(0);
    await db.$executeRawUnsafe(
      'ALTER TABLE "AccountSession_identity_outage_fixture" RENAME TO "AccountSession"',
    );
    renamed = false;
    await page
      .getByRole("button", { name: "Retry player session", exact: true })
      .click();
    expect(
      (
        await (
          await context.request.get("http://localhost:3200/api/session")
        ).json()
      ).player.id,
    ).toBe(playerId);
  } finally {
    if (renamed)
      await db.$executeRawUnsafe(
        'ALTER TABLE "AccountSession_identity_outage_fixture" RENAME TO "AccountSession"',
      );
    await context.close();
    await db.player.delete({ where: { id: playerId } });
    await db.$disconnect();
  }
});
