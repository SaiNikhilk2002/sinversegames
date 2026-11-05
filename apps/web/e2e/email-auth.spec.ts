import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { getDb, walletBalance } from "@platform/db";
import { applyQuest, createQuest, questHint, type QuestAction } from "@platform/engines/cuisine-quest";
import { startEmailProvider } from "./email-provider";

const { io } = createRequire(new URL("../../realtime/package.json", import.meta.url))("socket.io-client");
const origin = "http://localhost:3200";
const FORBIDDEN_BRANCHES = ["br-cold-thunder-b5hsf9io", "br-nameless-king-b5be92u3"];
let mail: Awaited<ReturnType<typeof startEmailProvider>>;
let ipCounter = 1;
// New per run, because real rate-limit counters outlive a test run.
const runPrefix = randomUUID().slice(0, 4);
const playersUsed = new Set<string>();

// Auth traces would contain codes and cookies.
test.use({ trace: "off" });
test.setTimeout(240_000);

test.beforeAll(async () => {
  const url = new URL(process.env.E2E_DATABASE_URL ?? "");
  const local = ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.endsWith("_test");
  process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
  if (!local) {
    const wanted = process.env.E2E_REHEARSAL_BRANCH;
    if (!wanted || FORBIDDEN_BRANCHES.includes(wanted)) throw Error("This target is not an approved test database.");
    const rows = await getDb()!.$queryRaw<{ b: string }[]>`SELECT current_setting('neon.branch_id') AS b`;
    if (rows[0]?.b !== wanted || FORBIDDEN_BRANCHES.includes(rows[0].b)) throw Error("The database is not the approved rehearsal branch.");
  }
  mail = await startEmailProvider();
});
test.afterAll(async () => {
  await mail?.close();
  await getDb()?.$disconnect();
});

const address = (label: string) => `${label}-${randomUUID().slice(0, 12)}@example.invalid`;
const newBrowser = (browser: Browser, viewport?: { width: number; height: number }) =>
  browser.newContext({
    viewport,
    // A distinct address per browser, so tests don't share per-IP limits.
    extraHTTPHeaders: { "x-forwarded-for": `2001:db8:${runPrefix}::${(ipCounter++).toString(16)}` },
  });
function lastMail(to: string) {
  const found = mail.sent.filter((m) => m.to === to);
  if (!found.length) throw Error("No email was sent to this address");
  return found[found.length - 1]!;
}
const mailCount = (to: string) => mail.sent.filter((m) => m.to === to).length;
const codeIn = (to: string) => /sign-in code is (\d{6})/.exec(lastMail(to).text)![1]!;
const linkIn = (to: string) => /(http:\/\/localhost:3200\/auth\/email#token=[a-f0-9]{64})/.exec(lastMail(to).text)![1]!;
const tokenIn = (to: string) => linkIn(to).split("token=")[1]!;
const post = (request: APIRequestContext, path: string, data: unknown) =>
  request.post(path, { headers: { origin }, data: data as object });
const start = (request: APIRequestContext, email: string, method: "otp" | "link") =>
  post(request, "/api/auth/email/start", { email, method });
const verifyCode = (request: APIRequestContext, email: string, code: string) =>
  post(request, "/api/auth/email/verify", { kind: "code", email, code });
const verifyLink = (request: APIRequestContext, token: string, confirm = false) =>
  post(request, "/api/auth/email/verify", { kind: "link", token, confirm });
const wrongCode = (code: string) => (code === "000000" ? "000001" : "000000");
const sessionOf = async (context: BrowserContext) =>
  (await (await context.request.get(`${origin}/api/session`)).json()).player;

async function chooseCode(page: Page, email: string) {
  await page.goto("/account");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a code", exact: true }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible();
}
async function signInWithCode(page: Page, email: string) {
  await chooseCode(page, email);
  await page.getByLabel("6-digit code").fill(codeIn(email));
  await page.getByRole("button", { name: "Verify and continue", exact: true }).click();
  await page.waitForURL(/\/(account\?auth=email|profile)/);
}
async function signInWithLink(page: Page, email: string) {
  await page.goto("/account");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a link", exact: true }).click();
  await expect(page.getByTestId("email-sent")).toBeVisible();
  await page.goto(linkIn(email));
  await page.waitForURL(/\/(account\?auth=email|profile)/);
  expect(page.url()).not.toContain("token=");
}
async function onboard(page: Page) {
  const username = `t_${randomUUID().slice(0, 10).replaceAll("-", "")}`;
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue with default avatar", exact: true }).click();
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await page.waitForURL("**/profile");
  await expect(page.getByText(`@${username}`, { exact: true })).toBeVisible();
  return username;
}
async function signOut(page: Page) {
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Confirm sign out", exact: true }).click();
  await page.waitForURL("**/account");
  await expect(page.getByLabel("Email address")).toBeVisible();
}
/** Plays a real Cuisine Quest run through the public API, so the server replays and scores it. */
async function playCuisine(request: APIRequestContext) {
  const startedAt = Date.now();
  const run = await (await post(request, "/api/solo/start", { gameId: "cuisine-quest", config: { level: 1 } })).json();
  const state = createQuest(run.seed, run.config);
  const log: QuestAction[] = [];
  let guard = 0;
  while (!state.finished && guard++ < 4000) {
    const order = state.orders.find((o) => o.status === "waiting");
    const hint = order ? questHint(state, order.id) : null;
    const action: QuestAction = hint?.action ? { ...hint.action, t: state.t + 160 } : { kind: "wait", t: state.t + 160 };
    if (!applyQuest(state, action).ok) throw Error("Invalid test replay");
    log.push(action);
  }
  log.push({ kind: "finish", t: state.t });
  // The server rejects a run that claims more game time than has really passed.
  const wait = state.t - 8_000 - (Date.now() - startedAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  const submit = () => post(request, "/api/solo/submit", { token: run.token, log });
  const response = await submit();
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.saved).toBe(true);
  return { result, submit, runId: run.runId as string };
}
async function progressOf(playerId: string) {
  const db = getDb()!;
  const [row, balance] = await Promise.all([
    db.player.findUniqueOrThrow({
      where: { id: playerId },
      include: {
        stats: { orderBy: { gameId: "asc" } },
        achievements: { orderBy: { achievementKey: "asc" } },
        rewards: { orderBy: { id: "asc" } },
        cuisineProgress: { orderBy: { level: "asc" } },
        inventory: { orderBy: { itemId: "asc" } },
        equipment: { orderBy: { category: "asc" } },
        favorites: { orderBy: { gameId: "asc" } },
        participations: { orderBy: { id: "asc" } },
      },
    }),
    walletBalance(db, playerId),
  ]);
  const { lastSeenAt: _ignored, ...stable } = row;
  return { ...stable, balance };
}

test("email: OTP registration, onboarding, a real game, then the link method returns the same player everywhere", async ({ browser }) => {
  const email = address("otp-first");
  const a = await newBrowser(browser);
  const page = await a.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const db = getDb()!;
  try {
    await signInWithCode(page, email);
    await expect(page.getByText("Email verified. Your player is saved.")).toBeVisible();
    const username = await onboard(page);
    const player = await sessionOf(a);
    playersUsed.add(player.id);
    expect(player).toMatchObject({ kind: "registered", username });
    expect(lastMail(email).subject).toContain("Welcome");

    const { result, submit, runId } = await playCuisine(a.request);
    expect(result.earnedCoins).toBeGreaterThan(0);
    const coins = await walletBalance(db, player.id);
    expect(coins).toBeGreaterThan(0);
    expect((await a.request.get(`${origin}/api/wallet`)).ok()).toBe(true);

    await expect((await submit()).ok()).toBeTruthy();
    expect(await walletBalance(db, player.id)).toBe(coins);
    expect(await db.matchParticipant.count({ where: { playerId: player.id, matchId: runId } })).toBe(1);

    const catalogue = await post(a.request, "/api/favorites", { gameId: "cuisine-quest" });
    expect((await catalogue.json()).favorite).toBe(true);
    const buy = await post(a.request, "/api/wallet", { action: "purchase", itemId: "frame-brass-orbit" });
    if (buy.ok()) {
      expect((await post(a.request, "/api/wallet", { action: "equip", category: "profile-frame", itemId: "frame-brass-orbit" })).ok()).toBe(true);
      // A repeated purchase must not charge twice.
      const balance = await walletBalance(db, player.id);
      await post(a.request, "/api/wallet", { action: "purchase", itemId: "frame-brass-orbit" });
      expect(await walletBalance(db, player.id)).toBe(balance);
    }
    const snapshot = await progressOf(player.id);
    expect(snapshot.stats.length).toBeGreaterThan(0);
    expect(snapshot.cuisineProgress.length).toBeGreaterThan(0);
    expect(snapshot.participations).toHaveLength(1);

    await signOut(page);
    expect(await sessionOf(a)).toBeNull();

    await signInWithLink(page, email);
    await page.waitForURL("**/profile");
    expect((await sessionOf(a)).id).toBe(player.id);
    expect(await progressOf(player.id)).toEqual(snapshot);

    await page.reload();
    await expect(page.getByTestId("cq-profile-progress")).toContainText("1/7 cuisines");

    const b = await newBrowser(browser, { width: 390, height: 812 });
    try {
      const other = await b.newPage();
      await chooseCode(other, email);
      await other.getByLabel("6-digit code").fill(codeIn(email));
      await other.getByRole("button", { name: "Verify and continue", exact: true }).click();
      await other.waitForURL("**/profile");
      expect((await sessionOf(b)).id).toBe(player.id);
      await expect(other.getByText(`@${username}`, { exact: true })).toBeVisible();
      await expect(other.getByTestId("cq-profile-progress")).toContainText("1/7 cuisines");
      expect(lastMail(email).subject).toContain("New sign-in");
      const wallet = await (await b.request.get(`${origin}/api/wallet`)).json();
      expect(wallet.balance).toBe(snapshot.balance);
    } finally {
      await b.close();
    }
    expect(await progressOf(player.id)).toEqual(snapshot);
    expect(await db.externalIdentity.count({ where: { provider: "email", subject: email } })).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await a.close();
  }
});

test("email: link registration, then OTP from a new browser returns the same player", async ({ browser }) => {
  const email = address("link-first");
  const a = await newBrowser(browser, { width: 390, height: 812 });
  const b = await newBrowser(browser);
  try {
    const page = await a.newPage();
    await signInWithLink(page, email);
    await onboard(page);
    const player = await sessionOf(a);
    playersUsed.add(player.id);
    await post(a.request, "/api/favorites", { gameId: "color-clash" });
    const snapshot = await progressOf(player.id);

    await signInWithCode(await b.newPage(), email);
    expect((await sessionOf(b)).id).toBe(player.id);
    expect(await progressOf(player.id)).toEqual(snapshot);
    expect(await getDb()!.externalIdentity.count({ where: { provider: "email", subject: email } })).toBe(1);
  } finally {
    await a.close();
    await b.close();
  }
});

test("email: a guest keeps their id when saving; a known address never absorbs a guest", async ({ browser }) => {
  const context = await newBrowser(browser);
  try {
    const page = await context.newPage();
    await page.goto("/account");
    await page.getByLabel("Display name").fill("SavingGuest");
    await page.getByRole("button", { name: "Continue as guest", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Save this guest", exact: true })).toBeVisible();
    const guest = await sessionOf(context);
    const oldCookie = (await context.cookies()).find((c) => c.name === "pw_session")!;
    const email = address("guest-save");
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Email me a code", exact: true }).click();
    await expect(page.getByLabel("6-digit code")).toBeVisible();
    await page.getByLabel("6-digit code").fill(codeIn(email));
    await page.getByRole("button", { name: "Verify and continue", exact: true }).click();
    await page.waitForURL(/account\?auth=email/);
    const saved = await sessionOf(context);
    expect(saved).toMatchObject({ id: guest.id, kind: "registered", name: "SavingGuest" });
    // The old guest cookie can't take the account back over.
    const stale = await newBrowser(browser);
    await stale.addCookies([oldCookie]);
    expect(await sessionOf(stale)).toBeNull();
    await stale.close();

    const second = await newBrowser(browser);
    const other = await second.newPage();
    await other.goto("/account");
    await other.getByLabel("Display name").fill("SeparateGuest");
    await other.getByRole("button", { name: "Continue as guest", exact: true }).click();
    await expect(other.getByRole("heading", { name: "Save this guest", exact: true })).toBeVisible();
    const separate = await sessionOf(second);
    await other.getByLabel("Email address").fill(email);
    // The other method: this address's code was requested moments ago, so a new code is on cooldown.
    await other.getByRole("button", { name: "Email me a link", exact: true }).click();
    await expect(other.getByTestId("email-sent")).toBeVisible();
    await other.goto(linkIn(email));
    await other.waitForURL(/account\?auth=email|profile/);
    expect((await sessionOf(second)).id).toBe(guest.id);
    const left = await getDb()!.player.findUniqueOrThrow({ where: { id: separate.id } });
    expect(left.kind).toBe("GUEST");
    await second.close();
  } finally {
    await context.close();
  }
});

test("email: code protections", async ({ browser }) => {
  const context = await newBrowser(browser);
  const request = context.request;
  const db = getDb()!;
  try {
    // Formats
    for (const bad of ["", "nope", "a@b", "a b@example.invalid", "x".repeat(200) + "@example.invalid"])
      expect((await start(request, bad, "otp")).status()).toBe(400);
    const malformed = await request.post("/api/auth/email/start", { headers: { origin, "content-type": "application/json" }, data: "{oops" });
    expect(malformed.status()).toBe(400);
    expect(await malformed.json()).toHaveProperty("error");
    expect((await post(request, "/api/auth/email/verify", { kind: "code", email: "a@example.invalid", code: "12" })).status()).toBe(400);

    // Normalized: both spellings reach one address.
    const base = address("normalize");
    const started = await start(request, `  ${base.toUpperCase()} `, "otp");
    expect(started.status()).toBe(200);
    const body = await started.text();
    expect(mailCount(base)).toBe(1);
    expect(body).not.toContain(codeIn(base));

    // Wrong, then correct, then reused.
    expect((await verifyCode(request, base, wrongCode(codeIn(base)))).status()).toBe(400);
    const code = codeIn(base);
    expect((await verifyCode(request, base, code)).status()).toBe(200);
    const player = await sessionOf(context);
    playersUsed.add(player.id);
    await request.post("/api/account/sessions", { headers: { origin }, data: { action: "signout" } });
    expect((await verifyCode(request, base, code)).status()).toBe(400);

    // Stored only in protected form.
    const rows = await db.oAuthAttempt.findMany({ where: { verifier: base } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.nonce).not.toBe(code);
      expect(row.stateHash).toMatch(/^[a-f0-9]{64}$/);
    }

    // Brute force: the sixth guess is refused even with the right code.
    const brute = address("brute");
    await start(request, brute, "otp");
    const right = codeIn(brute);
    for (let i = 0; i < 5; i++) expect((await verifyCode(request, brute, wrongCode(right))).status()).toBe(400);
    const locked = await verifyCode(request, brute, right);
    expect(locked.status()).toBe(429);
    expect((await locked.json()).locked).toBe(true);
    expect((await verifyCode(request, brute, right)).status()).toBe(400);
    expect(await db.externalIdentity.count({ where: { subject: brute } })).toBe(0);

    // Expired
    const late = address("late");
    await start(request, late, "otp");
    await db.oAuthAttempt.updateMany({ where: { verifier: late }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await verifyCode(request, late, codeIn(late))).status()).toBe(400);

    // Bound to the browser that asked for it.
    const other = address("other-browser");
    await start(request, other, "otp");
    const stranger = await newBrowser(browser);
    expect((await verifyCode(stranger.request, other, codeIn(other))).status()).toBe(400);
    await stranger.close();

    // Resend limits
    const noisy = address("noisy");
    expect((await start(request, noisy, "otp")).status()).toBe(200);
    const throttled = await start(request, noisy, "otp");
    expect(throttled.status()).toBe(429);
    expect((await throttled.json()).retryAfter).toBeGreaterThan(0);
    expect(mailCount(noisy)).toBe(1);
    // The other method stays available, since it's a separate choice.
    expect((await start(request, noisy, "link")).status()).toBe(200);

    // Two requests racing with one code: exactly one wins.
    const race = address("race");
    const racer = await newBrowser(browser);
    await start(racer.request, race, "otp");
    const raceCode = codeIn(race);
    const results = await Promise.all([verifyCode(racer.request, race, raceCode), verifyCode(racer.request, race, raceCode)]);
    expect(results.map((r) => r.status()).sort()).toEqual([200, 400]);
    await racer.close();
    expect(await db.externalIdentity.count({ where: { subject: race } })).toBe(1);

    // A provider failure says so, and leaves nothing usable behind.
    const down = `provider-down-${randomUUID().slice(0, 8)}@example.invalid`;
    const failed = await start(request, down, "otp");
    expect(failed.status()).toBe(503);
    expect((await failed.json()).error).toContain("couldn't send");
    expect(await db.oAuthAttempt.count({ where: { verifier: down } })).toBe(0);
  } finally {
    await context.close();
  }
});

test("email: link protections", async ({ browser }) => {
  const a = await newBrowser(browser);
  const b = await newBrowser(browser);
  const db = getDb()!;
  try {
    // Tampered and missing
    for (const token of ["a".repeat(64), "not-hex"]) {
      const response = await verifyLink(a.request, token);
      expect(response.status()).toBe(400);
      expect((await response.json()).code).toBe("invalid");
    }
    const page = await a.newPage();
    await page.goto("/auth/email");
    await expect(page.getByTestId("email-link-verifier").getByRole("alert")).toContainText("isn't valid");

    // Reuse
    const used = address("used");
    await start(a.request, used, "link");
    const usedToken = tokenIn(used);
    expect((await verifyLink(a.request, usedToken)).status()).toBe(200);
    playersUsed.add((await sessionOf(a)).id);
    await a.request.post(`${origin}/api/account/sessions`, { headers: { origin }, data: { action: "signout" } });
    const reused = await verifyLink(a.request, usedToken);
    expect(reused.status()).toBe(400);
    expect((await reused.json()).code).toBe("used");
    await page.goto(`/auth/email#token=${usedToken}`);
    await expect(page.getByTestId("email-link-verifier").getByRole("alert")).toContainText("already been used");
    expect(page.url()).not.toContain("token=");

    // Expired
    const late = address("late-link");
    await start(a.request, late, "link");
    await db.oAuthAttempt.updateMany({ where: { verifier: late }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await verifyLink(a.request, tokenIn(late));
    expect((await expired.json()).code).toBe("expired");
    await page.goto(linkIn(late));
    await expect(page.getByTestId("email-link-verifier").getByRole("alert")).toContainText("expired");

    // A mail scanner or stranger opening the link consumes nothing and signs nobody in.
    const scanned = address("scanned");
    await start(a.request, scanned, "link");
    const scannedToken = tokenIn(scanned);
    const probe = await verifyLink(b.request, scannedToken);
    expect(await probe.json()).toMatchObject({ needsConfirm: true });
    expect(await sessionOf(b)).toBeNull();
    expect(await db.externalIdentity.count({ where: { subject: scanned } })).toBe(0);
    const pageB = await b.newPage();
    await pageB.goto(linkIn(scanned));
    await expect(pageB.getByRole("heading", { name: "Finish signing in" })).toBeVisible();
    await expect(pageB.getByText(/s\*\*\*@example\.invalid/)).toBeVisible();
    await pageB.getByRole("button", { name: "Continue signing in", exact: true }).click();
    await pageB.waitForURL(/account\?auth=email/);
    playersUsed.add((await sessionOf(b)).id);

    // An email link can't finish through Google's callback.
    const crossed = address("crossed");
    const crossing = await newBrowser(browser);
    expect((await start(b.request, crossed, "link")).status()).toBe(409);
    expect((await start(crossing.request, crossed, "link")).status()).toBe(200);
    const callback = await crossing.request.get(`${origin}/api/auth/google/callback?state=${tokenIn(crossed)}&code=x`, { maxRedirects: 0 });
    expect([303, 503]).toContain(callback.status());
    await crossing.close();
    expect(await db.externalIdentity.count({ where: { subject: crossed } })).toBe(0);
    expect((await db.oAuthAttempt.findFirstOrThrow({ where: { verifier: crossed } })).consumedAt).toBeNull();

    // Two browsers registering one new address at once: still one player.
    const racing = address("register-race");
    const c1 = await newBrowser(browser);
    const c2 = await newBrowser(browser);
    await start(c1.request, racing, "otp");
    const first = codeIn(racing);
    await start(c2.request, racing, "link");
    const token = tokenIn(racing);
    const [r1, r2] = await Promise.all([verifyCode(c1.request, racing, first), verifyLink(c2.request, token)]);
    expect(r1.status()).toBe(200);
    expect(r2.status()).toBe(200);
    expect(await db.externalIdentity.count({ where: { subject: racing } })).toBe(1);
    expect((await sessionOf(c1)).id).toBe((await sessionOf(c2)).id);
    await c1.close();
    await c2.close();
  } finally {
    await a.close();
    await b.close();
  }
});

test("email: nobody can learn who is registered, and cross-site requests are refused", async ({ browser }) => {
  const a = await newBrowser(browser);
  const b = await newBrowser(browser);
  try {
    const known = address("known");
    await start(a.request, known, "otp");
    expect((await verifyCode(a.request, known, codeIn(known))).status()).toBe(200);
    const unknown = address("unknown");
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    const [one, two] = [await start(b.request, known, "otp"), await start(b.request, unknown, "otp")];
    expect(one.status()).toBe(two.status());
    expect(await one.json()).toEqual(await two.json());
    const [w1, w2] = [await verifyCode(b.request, known, "000000"), await verifyCode(b.request, unknown, "000000")];
    if (codeIn(known) !== "000000" && codeIn(unknown) !== "000000") {
      expect(w1.status()).toBe(w2.status());
      expect(await w1.json()).toEqual(await w2.json());
    }
    for (const path of ["/api/auth/email/start", "/api/auth/email/verify"]) {
      const hostile = await b.request.post(path, {
        headers: { origin: "https://evil.example" },
        data: { email: unknown, method: "otp", kind: "code", code: "123456" },
      });
      expect(hostile.status()).toBe(403);
    }
  } finally {
    await a.close();
    await b.close();
  }
});

test("email: sessions, usernames, realtime identity and layouts", async ({ browser }) => {
  const a = await newBrowser(browser);
  const b = await newBrowser(browser);
  const db = getDb()!;
  try {
    const email = address("sessions");
    const page = await a.newPage();
    await signInWithCode(page, email);
    const username = await onboard(page);
    const player = await sessionOf(a);
    playersUsed.add(player.id);

    // Duplicate usernames
    const rival = address("rival");
    const rivalPage = await b.newPage();
    await signInWithCode(rivalPage, rival);
    await rivalPage.getByLabel("Username", { exact: true }).fill(username);
    await rivalPage.getByRole("button", { name: "Save and continue", exact: true }).click();
    await expect(rivalPage.getByTestId("account-panel").getByRole("alert")).toContainText("taken");
    playersUsed.add((await sessionOf(b)).id);
    await b.request.post(`${origin}/api/account/sessions`, { headers: { origin }, data: { action: "signout" } });

    // Realtime accepts the same player from a registered session.
    const c = await newBrowser(browser);
    await c.request.get(`${origin}/api/session`);
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    await start(c.request, email, "otp");
    expect((await verifyCode(c.request, email, codeIn(email))).status()).toBe(200);
    const token = (await (await c.request.post(`${origin}/api/session/token`, { headers: { origin } })).json()).token;
    expect(token).toBeTruthy();
    const socket = io("http://localhost:4200", { auth: { token }, transports: ["websocket"], reconnection: false, extraHeaders: { origin } });
    const connected = await new Promise<boolean>((resolve) => {
      socket.once("connect", () => resolve(true));
      socket.once("connect_error", () => resolve(false));
      setTimeout(() => resolve(false), 15_000);
    });
    expect(connected).toBe(true);
    socket.close();

    // Revoking other browsers signs c out, and tells the owner.
    expect(await db.accountSession.count({ where: { playerId: player.id } })).toBe(2);
    await page.goto("/account");
    await page.getByRole("button", { name: "Sign out other browsers", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Other sessions signed out");
    expect(await sessionOf(c)).toBeNull();
    expect((await sessionOf(a)).id).toBe(player.id);
    expect(lastMail(email).subject).toContain("signed out");
    await c.close();

    // Expired and made-up sessions are simply not signed in.
    await db.accountSession.updateMany({ where: { playerId: player.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await sessionOf(a)).toBeNull();
    const fake = await newBrowser(browser);
    await fake.addCookies([{ name: "pw_session", value: `s1_${"ab".repeat(32)}`, url: origin }]);
    expect(await sessionOf(fake)).toBeNull();
    await fake.close();

    // Layouts at phone and desktop widths, in each state.
    const layout = await newBrowser(browser);
    const view = await layout.newPage();
    const fits = async () => {
      for (const width of [320, 360, 390, 768, 1280]) {
        await view.setViewportSize({ width, height: 900 });
        expect(await view.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      }
    };
    await view.goto("/account");
    await expect(view.getByLabel("Email address")).toBeVisible();
    await fits();
    await view.screenshot({ path: test.info().outputPath("account-signed-out-1280.png"), fullPage: true });
    await view.setViewportSize({ width: 390, height: 844 });
    await view.screenshot({ path: test.info().outputPath("account-signed-out-390.png"), fullPage: true });
    await view.getByLabel("Email address").fill("not-an-email");
    await view.getByRole("button", { name: "Email me a code", exact: true }).click();
    await expect(view.getByTestId("email-sign-in").getByRole("alert")).toContainText("valid email");
    const shown = address("layout");
    await view.getByLabel("Email address").fill(shown);
    await view.getByRole("button", { name: "Email me a code", exact: true }).click();
    await expect(view.getByLabel("6-digit code")).toBeVisible();
    await fits();
    await view.setViewportSize({ width: 390, height: 844 });
    await view.screenshot({ path: test.info().outputPath("account-code-390.png"), fullPage: true });
    await expect(view.getByRole("button", { name: /Resend in \d+s/ })).toBeDisabled();
    await view.getByRole("button", { name: "Use a link instead", exact: true }).click();
    await expect(view.getByText(/sign-in link is on its way/)).toBeVisible();
    await view.screenshot({ path: test.info().outputPath("account-link-390.png"), fullPage: true });
    await view.getByRole("button", { name: "Use a different email", exact: true }).click();
    await expect(view.getByLabel("Email address")).toBeVisible();
    await layout.close();
  } finally {
    await a.close();
    await b.close();
  }
});
