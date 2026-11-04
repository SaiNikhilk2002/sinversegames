import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  getDb,
  recordMatch,
  linkGoogle,
  purchaseCosmetic,
  equipCosmetic,
  walletBalance,
} from "@platform/db";
import {
  applyQuest,
  createQuest,
  cuisineQuest,
  questHint,
  type QuestAction,
} from "@platform/engines/cuisine-quest";
import { startIdentityProvider } from "./identity-provider";
import { hashSecret } from "@platform/shared";
const sharp = createRequire(
  new URL("../../realtime/package.json", import.meta.url),
)("sharp");
const { io } = createRequire(
  new URL("../../realtime/package.json", import.meta.url),
)("socket.io-client");
const origin = "http://localhost:3200";
let closeProvider: (() => Promise<void>) | undefined;
const fixturePlayers: string[] = [];
const fixtureMatches: string[] = [];
// Auth network traces can contain codes/cookies. Keep explicit safe screenshots
// and assertions instead of recording authentication traffic.
test.use({ trace: "off" });
test.beforeAll(async () => {
  const dbUrl = new URL(process.env.E2E_DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(dbUrl.hostname) ||
    !dbUrl.pathname.endsWith("_test") ||
    process.env.IDENTITY_TEST_MODE !== "1"
  )
    throw Error(
      "Identity tests require explicit isolated fixture environment.",
    );
  process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
  const db = getDb()!;
  await db.externalIdentity.deleteMany({
    where: {
      provider: "google",
      subject: { in: ["fixture-one", "fixture-two"] },
    },
  });
  closeProvider = await startIdentityProvider();
});
test.afterAll(async () => {
  await closeProvider?.();
  const db = getDb()!;
  await db.player.deleteMany({ where: { id: { in: fixturePlayers } } });
  await db.match.deleteMany({ where: { id: { in: fixtureMatches } } });
  await db.$disconnect();
});
async function guest(page: Page, name: string) {
  await page.goto("/account");
  await page.getByLabel("Display name").fill(name);
  await page
    .getByRole("button", { name: "Continue as guest", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Connect Google and save my player",
      exact: true,
    }),
  ).toBeEnabled();
  const player = (await (await page.request.get("/api/session")).json()).player;
  fixturePlayers.push(player.id);
  return player;
}
async function connect(page: Page, mode: "link" | "signin", variant = "one") {
  await page
    .getByRole("button", {
      name:
        mode === "link"
          ? "Connect Google and save my player"
          : "Sign in with Google",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Local test identity provider" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Fixture ${variant}`, exact: true })
    .click();
  await page.waitForURL(/\/account\?auth=/);
}
async function verifiedGuestProgress(id: string) {
  const s = createQuest(17, { level: 1 }),
    log: QuestAction[] = [];
  let guard = 0;
  while (!s.finished && guard++ < 4000) {
    const o = s.orders.find((o) => o.status === "waiting"),
      hint = o ? questHint(s, o.id) : null;
    const a: QuestAction = hint?.action
      ? { ...hint.action, t: s.t + 160 }
      : { kind: "wait", t: s.t + 160 };
    if (!applyQuest(s, a).ok) throw Error("Invalid fixture replay");
    log.push(a);
  }
  log.push({ kind: "finish", t: s.t });
  const result = cuisineQuest.verify(17, { level: 1 }, log);
  if (!result.ok) throw Error(result.reason);
  const match = randomUUID();
  fixtureMatches.push(match);
  const db = getDb()!;
  await recordMatch(db, {
    id: match,
    solo: true,
    visibility: "solo",
    roomCode: "SOLO",
    config: { level: 1 },
    startedAt: Date.now() - result.result.durationMs,
    players: [{ id, name: "SavedExplorer", color: "#8d86df" }],
    results: {
      gameId: "cuisine-quest",
      reason: "completed",
      endedAt: Date.now(),
      entries: [
        {
          playerId: id,
          name: "SavedExplorer",
          color: "#8d86df",
          placement: 1,
          score: result.result.score,
          isWinner: true,
          details: result.result.details,
        },
      ],
    },
  });
}

test("identity: guest links, onboards, stores pictures and recovers the same player in another browser", async ({
  browser,
}, info) => {
  test.setTimeout(120000);
  const a = await browser.newContext({
    viewport: { width: 390, height: 812 },
    extraHTTPHeaders: { "x-forwarded-for": "198.51.100.81" },
  });
  const b = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": "198.51.100.82" },
  });
  const page = await a.newPage(),
    other = await b.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  other.on("pageerror", (e) => errors.push(e.message));
  try {
    const p = await guest(page, "SavedExplorer");
    const oldCookie = (await a.cookies()).find((c) => c.name === "pw_session")!;
    await verifiedGuestProgress(p.id);
    const db = getDb()!;
    await purchaseCosmetic(db, p.id, "frame-brass-orbit");
    await equipCosmetic(db, p.id, "profile-frame", "frame-brass-orbit");
    const before = await db.player.findUniqueOrThrow({
      where: { id: p.id },
      include: {
        stats: true,
        achievements: true,
        rewards: true,
        cuisineProgress: true,
        inventory: true,
        equipment: true,
      },
    });
    await connect(page, "link");
    await expect(
      page.getByRole("heading", { name: "Your unique username", exact: true }),
    ).toBeVisible();
    const username = "explorer_" + randomUUID().slice(0, 8);
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page
      .getByRole("button", { name: "Check availability", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("available");
    await page
      .getByRole("button", { name: "Save and continue", exact: true })
      .click();
    const png = await sharp({
      create: { width: 80, height: 100, channels: 3, background: "#af75ed" },
    })
      .png()
      .toBuffer();
    await page
      .getByLabel("Choose picture")
      .setInputFiles({
        name: "picture.png",
        mimeType: "image/png",
        buffer: png,
      });
    await expect(
      page.getByAltText("Your selected picture preview"),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Save picture", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Picture saved");
    await page
      .getByRole("button", { name: "Continue with saved picture", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Finish setup", exact: true })
      .click();
    await page.waitForURL("**/profile");
    await expect(page.getByTestId("cq-profile-progress")).toContainText(
      "1/7 cuisines",
    );
    await expect(page.getByText(`@${username}`, { exact: true })).toBeVisible();
    const linked = (await (await page.request.get("/api/session")).json())
      .player;
    expect(linked).toMatchObject({ id: p.id, kind: "registered", username });
    expect(linked).not.toHaveProperty("sid");
    const after = await db.player.findUniqueOrThrow({
      where: { id: p.id },
      include: {
        stats: true,
        achievements: true,
        rewards: true,
        cuisineProgress: true,
        inventory: true,
        equipment: true,
      },
    });
    for (const key of [
      "xp",
      "stats",
      "achievements",
      "rewards",
      "cuisineProgress",
      "inventory",
      "equipment",
    ] as const)
      expect(after[key]).toEqual(before[key]);
    // Retain the legacy guest cookie as a negative takeover test after linking.
    const stale = await browser.newContext();
    try {
      await stale.addCookies([oldCookie]);
      expect(
        (await (await stale.request.get(origin + "/api/session")).json())
          .player,
      ).toBeNull();
    } finally {
      await stale.close();
    }
    await other.goto("/account");
    await connect(other, "signin");
    const recovered = (await (await other.request.get("/api/session")).json())
      .player;
    expect(recovered.id).toBe(p.id);
    expect(recovered.avatarKey).toBe(linked.avatarKey);
    await other.goto("/profile");
    await expect(other.getByTestId("cq-profile-progress")).toContainText(
      "1/7 cuisines",
    );
    await expect(
      other.getByText(`@${username}`, { exact: true }),
    ).toBeVisible();
    const avatar = await other.request.get(
      `/api/avatars/${recovered.avatarKey}/full`,
    );
    expect(avatar.ok()).toBe(true);
    expect(avatar.headers()["content-type"]).toBe("image/webp");
    expect((await sharp(await avatar.body()).metadata()).width).toBe(256);
    await other.goto("/leaderboard?game=cuisine-quest");
    await expect(other.getByTestId("leaderboard-table")).toContainText(
      `@${username}`,
    );
    await page.goto("/account");
    for (const width of [320, 360, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize({ width: 320, height: 812 });
    await page.screenshot({
      path: info.outputPath("account-320.png"),
      fullPage: true,
    });
    // Replace, then remove the normalized avatar through the same authorized route.
    for (const format of ["jpeg", "webp"]) {
      const image = await sharp(png).toFormat(format).toBuffer();
      expect(
        (
          await page.request.post("/api/account/avatar", {
            headers: { origin, "content-type": `image/${format}` },
            data: image,
          })
        ).ok(),
      ).toBe(true);
    }
    expect(
      (
        await page.request.get(`/api/avatars/${recovered.avatarKey}/full`)
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.delete("/api/account/avatar", {
          headers: { origin },
        })
      ).ok(),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Remove picture", exact: true }),
    ).toHaveCount(0);
    const token = (
      await (
        await other.request.post("/api/session/token", { headers: { origin } })
      ).json()
    ).token;
    const socket = io("http://localhost:4200", {
      auth: { token },
      transports: ["websocket"],
      extraHeaders: { origin },
      reconnection: false,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      await page
        .getByRole("button", { name: "Sign out other browsers", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Other sessions signed out",
      );
      expect(
        (await (await other.request.get("/api/session")).json()).player,
      ).toBeNull();
      const disconnected = new Promise<void>((resolve) =>
        socket.once("disconnect", () => resolve()),
      );
      socket.emit(
        "room:create",
        {
          id: randomUUID(),
          payload: { gameId: "color-clash", visibility: "private" },
        },
        () => {},
      );
      await disconnected;
    } finally {
      socket.disconnect();
    }
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page
      .getByRole("button", { name: "Confirm sign out", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Sign in with Google", exact: true }),
    ).toBeEnabled();
    await connect(page, "signin");
    expect(
      (await (await page.request.get("/api/session")).json()).player.id,
    ).toBe(p.id);
    expect(await walletBalance(db, p.id)).toBe(37);
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});
test("identity: collision, cancelled/hostile OAuth, IDOR and invalid avatars are rejected", async ({
  browser,
}) => {
  const context = await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": "198.51.100.83" },
    }),
    page = await context.newPage();
  try {
    const db = getDb()!;
    if (
      !(await db.externalIdentity.findUnique({
        where: {
          provider_subject: { provider: "google", subject: "fixture-one" },
        },
      }))
    ) {
      const owner = "fixture_" + randomUUID().replaceAll("-", "");
      fixturePlayers.push(owner);
      await db.player.create({
        data: {
          id: owner,
          displayName: "Fixture owner",
          avatarColor: "#8d86df",
        },
      });
      await linkGoogle(db, "fixture-one", owner, "link");
    }
    const p = await guest(page, "SeparateGuest");
    await connect(page, "link");
    await expect(
      page.getByTestId("account-panel").getByRole("alert"),
    ).toContainText("already belongs to another player");
    expect(
      (await (await page.request.get("/api/session")).json()).player.id,
    ).toBe(p.id);
    for (const variant of [
      "cancel",
      "unverified",
      "badnonce",
      "expired",
      "wrongaudience",
      "wrongissuer",
      "badsignature",
    ]) {
      await connect(page, "link", variant);
      expect(
        (await (await page.request.get("/api/session")).json()).player,
      ).toMatchObject({ id: p.id, kind: "guest" });
      await expect(
        page.getByTestId("account-panel").getByRole("alert"),
      ).toBeVisible();
    }
    await page.goto("/api/auth/google/callback?state=not-a-state&code=invalid");
    await expect(
      page.getByTestId("account-panel").getByRole("alert"),
    ).toContainText("expired");
    expect(
      (
        await page.request.patch("/api/account", {
          headers: { origin },
          data: { username: "stolen" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/auth/google/start?mode=link", {
          headers: { origin: "https://wrong.example" },
        })
      ).status(),
    ).toBe(403);
    await connect(page, "link", "two");
    const current = (await (await page.request.get("/api/session")).json())
      .player;
    expect(current.id).toBe(p.id);
    expect(
      (
        await page.request.patch("/api/account", {
          headers: { origin },
          data: { username: "ADMIN" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.patch("/api/account", {
          headers: { origin },
          data: { username: "good_name", playerId: "victim" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.post("/api/account/avatar", {
          headers: { origin, "content-type": "image/svg+xml" },
          data: "<svg/>",
        })
      ).status(),
    ).toBe(415);
    expect(
      (
        await page.request.post("/api/account/avatar", {
          headers: { origin, "content-type": "image/png" },
          data: "MZ executable",
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.post("/api/account/avatar", {
          headers: { origin, "content-type": "image/png" },
          data: Buffer.alloc(5 * 1024 * 1024 + 1),
        })
      ).status(),
    ).toBe(413);
    expect(
      (
        await page.request.delete("/api/account/avatar", {
          headers: { origin: "https://wrong.example" },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await context.close();
  }
});

test("identity: OAuth attempts expire, bind the initiating browser/session and cannot be replayed", async ({
  browser,
}) => {
  const context = await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": "198.51.100.84" },
    }),
    other = await browser.newContext();
  const page = await context.newPage();
  try {
    const player = await guest(page, "StateExplorer");
    const db = getDb()!;
    const start = async () => {
      const response = await page.request.post(
        "/api/auth/google/start?mode=link",
        { headers: { origin } },
      );
      expect(response.ok()).toBe(true);
      const data = await response.json();
      return new URL(data.url);
    };
    const callback = (url: URL) =>
      `${origin}/api/auth/google/callback?state=${url.searchParams.get("state")}&code=invalid-fixture-code`;
    let url = await start();
    let stateHash = await hashSecret(url.searchParams.get("state")!);
    await db.oAuthAttempt.update({
      where: { stateHash },
      data: { expiresAt: new Date(0) },
    });
    expect((await page.request.get(callback(url))).url()).toContain(
      "auth=invalid_state",
    );
    url = await start();
    stateHash = await hashSecret(url.searchParams.get("state")!);
    expect((await other.request.get(callback(url))).url()).toContain(
      "auth=invalid_state",
    );
    expect(
      (await db.oAuthAttempt.findUniqueOrThrow({ where: { stateHash } }))
        .consumedAt,
    ).toBeNull();
    expect((await page.request.get(callback(url))).url()).toContain(
      "auth=provider_failed",
    );
    expect(
      (await db.oAuthAttempt.findUniqueOrThrow({ where: { stateHash } }))
        .consumedAt,
    ).not.toBeNull();
    expect((await page.request.get(callback(url))).url()).toContain(
      "auth=invalid_state",
    );
    url = await start();
    expect(
      (
        await page.request.post("/api/session", {
          headers: { origin },
          data: { displayName: "ChangedGuest" },
        })
      ).ok(),
    ).toBe(true);
    expect((await page.request.get(callback(url))).url()).toContain(
      "auth=invalid_state",
    );
    expect(
      (await (await page.request.get("/api/session")).json()).player.id,
    ).toBe(player.id);
    const anonymousUpload = await other.request.post(
      origin + "/api/account/avatar",
      {
        headers: { origin, "content-type": "image/png" },
        data: Buffer.from("not an image"),
      },
    );
    expect(anonymousUpload.status()).toBe(401);
    const unsignedJob = await other.request.post(
      "http://localhost:4200/internal/avatar",
      {
        headers: { "content-type": "image/png" },
        data: Buffer.from("not an image"),
      },
    );
    expect(unsignedJob.status()).toBe(401);
  } finally {
    await context.close();
    await other.close();
  }
});
