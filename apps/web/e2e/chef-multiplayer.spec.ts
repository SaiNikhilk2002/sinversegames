import { expect, test, type Page } from "@playwright/test";
import { createPrivateRoom, enterName, expectNoHorizontalOverflow, joinByInvite, newPlayer } from "./helpers";

const EVIDENCE = process.env.CQ_EVIDENCE_DIR;
const shot = async (page: Page, name: string) => { if (EVIDENCE) await page.screenshot({ path: `${EVIDENCE}/${name}.png` }); };
const watchErrors = (page: Page, errors: string[]) => page.on("pageerror", (e) => errors.push(e.message));

/** Cooks through visible controls by following the coach, like the campaign spec. */
async function cookDuel(page: Page) {
  const until = Date.now() + 200_000;
  while (Date.now() < until && !(await page.getByTestId("cr-judging").isVisible().catch(() => false))) {
    if (await page.getByTestId("cr-done").isVisible().catch(() => false)) { await page.waitForTimeout(300); continue; }
    const waiting = page.locator('.cq-ticket[data-status="waiting"]');
    if (!await waiting.count()) { await page.waitForTimeout(100); continue; }
    if (!await page.locator('.cq-ticket-selected[data-status="waiting"]').count()) await waiting.first().click().catch(() => {});
    const guide = page.getByTestId("cq-guide");
    const action = await guide.getAttribute("data-next-action", { timeout: 800 }).catch(() => null);
    const click = (locator: ReturnType<Page["locator"]>) => locator.click({ timeout: 1000 }).catch(() => {});
    if (action === "ingredient") {
      const portions = Number(await guide.getAttribute("data-next-portions").catch(() => 1));
      await click(page.getByRole("button", { name: `${portions} portion${portions > 1 ? "s" : ""}`, exact: true }));
      await click(page.getByTestId(`cq-ingredient-${await guide.getAttribute("data-next-ingredient").catch(() => "")}`));
    } else if (action === "begin") await click(page.getByTestId("cq-begin"));
    else if (action === "gesture") { await click(page.getByTestId("cq-follow-marker")); await page.waitForTimeout(90); }
    else if (action === "heat") await click(page.getByRole("button", { name: `Heat ${await guide.getAttribute("data-next-heat").catch(() => "")}`, exact: true }));
    else if (action === "flip") await click(page.getByTestId("cq-flip"));
    else if (action === "stir") await click(page.getByTestId("cq-stir"));
    else if (action === "lift") await click(page.getByTestId("cq-lift"));
    else if (action === "serve") {
      await click(page.getByRole("button", { name: `Finish: ${await guide.getAttribute("data-next-garnish").catch(() => "")}`, exact: true }));
      await click(page.getByTestId("cq-serve"));
    } else await page.waitForTimeout(100);
  }
  await expect(page.getByTestId("cr-judging")).toBeVisible();
}

test.describe("Cuisine multiplayer", () => {
  test("Chef Rivals: two real browsers cook at once and face the judges", async ({ browser }) => {
    test.setTimeout(420_000);
    const a = await newPlayer(browser, "Asha"), b = await newPlayer(browser, "Ben");
    const errors: string[] = [];
    watchErrors(a.page, errors); watchErrors(b.page, errors);
    const code = await createPrivateRoom(a.page, "chef-rivals", a.name);
    await joinByInvite(b.page, code, b.name);
    await b.page.getByRole("button", { name: "I'm ready" }).click();
    await expect(a.page.getByRole("button", { name: "Start game" })).toBeEnabled();
    await a.page.getByRole("button", { name: "Start game" }).click();

    // Same challenge for both.
    await expect(a.page.getByTestId("cr-reveal")).toBeVisible();
    await expect(a.page.getByTestId("chef-rivals")).toBeVisible();
    const theme = await a.page.getByTestId("cr-theme").textContent();
    await expect(b.page.getByTestId("cr-theme")).toHaveText(theme!);
    await expect(b.page.getByTestId("cr-mystery")).toHaveText((await a.page.getByTestId("cr-mystery").textContent())!);
    await a.page.waitForTimeout(3200);
    await shot(a.page, "10-rivals-reveal");
    await expect(a.page.getByTestId("cr-countdown")).toBeVisible({ timeout: 10_000 });
    await expect(a.page.getByTestId("chef-rivals")).toHaveAttribute("data-phase", "cooking", { timeout: 10_000 });

    // Both chefs are on stage, and each sees the other move.
    await expect(a.page.getByTestId("cr-lane-self")).toBeVisible();
    await expect(a.page.getByTestId("cr-lane-rival")).toBeVisible();
    const seenMoving = expect(a.page.getByTestId("cr-lane-rival")).not.toHaveAttribute("data-pose", "idle", { timeout: 20_000 });
    const [, , ] = await Promise.all([cookDuel(a.page), cookDuel(b.page), seenMoving.then(() => shot(a.page, "11-rivals-cooking"))]);

    // Reveal, then the skip control, for both.
    await a.page.getByTestId("cr-skip").click();
    await expect(a.page.getByTestId("cr-judging")).toHaveAttribute("data-finished", "true");
    await expect(a.page.getByTestId("cr-secret")).toBeVisible();
    await expect(b.page.getByTestId("cr-judging")).toHaveAttribute("data-finished", "true", { timeout: 15_000 });
    const [headA, headB] = [await a.page.getByTestId("cr-headline").textContent(), await b.page.getByTestId("cr-headline").textContent()];
    expect(headA === "A dead heat!" ? headB === "A dead heat!" : [headA, headB].filter((h) => h === "You win the duel!").length === 1).toBe(true);
    const selfA = Number((await a.page.getByTestId("cr-total-self").textContent())!.replaceAll(",", ""));
    const rivalB = Number((await b.page.getByTestId("cr-total-rival").textContent())!.replaceAll(",", ""));
    expect(selfA).toBe(rivalB);
    expect(selfA).toBeGreaterThan(0);
    await shot(a.page, "12-rivals-judging");

    await a.page.setViewportSize({ width: 320, height: 640 });
    await expectNoHorizontalOverflow(a.page);
    await a.page.setViewportSize({ width: 1280, height: 720 });

    // Rematch starts a fresh duel.
    await b.page.getByRole("button", { name: "Ready for a rematch", exact: true }).click();
    await expect(a.page.getByTestId("rematch")).toBeEnabled({ timeout: 10_000 });
    await a.page.getByTestId("rematch").click();
    await expect(a.page.getByTestId("cr-reveal")).toBeVisible({ timeout: 10_000 });
    expect(errors).toEqual([]);
    await a.context.close(); await b.context.close();
  });

  test("Chef Rivals fits a phone, and reconnecting restores the kitchen", async ({ browser }) => {
    test.setTimeout(120_000);
    const a = await newPlayer(browser, "Pia", { width: 360, height: 640 }), b = await newPlayer(browser, "Omar");
    const code = await createPrivateRoom(a.page, "chef-rivals", a.name);
    await joinByInvite(b.page, code, b.name);
    await b.page.getByRole("button", { name: "I'm ready" }).click();
    await a.page.getByRole("button", { name: "Start game" }).click();
    await expect(a.page.getByTestId("chef-rivals")).toHaveAttribute("data-phase", "cooking", { timeout: 20_000 });
    await expectNoHorizontalOverflow(a.page);
    await expect(a.page.getByTestId("cr-lane-self")).toBeInViewport();
    await expect(a.page.getByTestId("cr-clock")).toBeInViewport();
    const first = a.page.locator(".cq-ingredients button").first();
    await expect(first).toBeInViewport();
    await shot(a.page, "13-rivals-phone");
    const guide = a.page.getByTestId("cq-guide");
    await a.page.getByTestId(`cq-ingredient-${await guide.getAttribute("data-next-ingredient")}`).click();
    const next = await guide.getAttribute("data-next-ingredient");
    // The guide updates from the browser's prediction at once; the server has the
    // action only once it acknowledges it. Reloading before that loses an action
    // the server never saw (under load the race was lost: the restored kitchen
    // rightly showed the step before). Reconnection is what's tested here.
    await expect(a.page.getByTestId("chef-rivals")).toHaveAttribute("data-pending", "false", { timeout: 15_000 });
    await a.page.reload();
    await expect(a.page.getByTestId("chef-rivals")).toBeVisible({ timeout: 20_000 });
    await expect(a.page.getByTestId("cq-guide")).toHaveAttribute("data-next-ingredient", next ?? "", { timeout: 15_000 });
    await a.context.close(); await b.context.close();
  });

  test("Kitchen Rush Co-op: two chefs complete an order together in one kitchen", async ({ browser }) => {
    test.setTimeout(420_000);
    const a = await newPlayer(browser, "Grill"), b = await newPlayer(browser, "Plate");
    const errors: string[] = [];
    watchErrors(a.page, errors); watchErrors(b.page, errors);
    const code = await createPrivateRoom(a.page, "kitchen-rush-co-op", a.name);
    await joinByInvite(b.page, code, b.name);
    await b.page.getByRole("button", { name: "I'm ready" }).click();
    await a.page.getByRole("button", { name: "Start game" }).click();
    await expect(a.page.getByTestId("kc-intro")).toBeVisible();
    await shot(a.page, "20-coop-intro");
    await expect(a.page.getByTestId("kitchen-coop")).toHaveAttribute("data-phase", "cooking", { timeout: 15_000 });
    await expect(a.page.getByTestId("kc-seat-0")).toBeEnabled({ timeout: 8000 });

    // One grills, one builds the plate, each seeing the other.
    await a.page.getByTestId("crate-patty-raw").click();
    await expect(a.page.getByTestId("kc-holding")).toContainText("Raw patty");
    await expect(b.page.getByTestId("kc-cook-other")).toHaveAttribute("data-pose", "gather");
    await a.page.getByTestId("station-grill-0").click();
    await expect(b.page.getByTestId("station-grill-0")).toHaveAttribute("data-state", "working");
    await b.page.getByTestId("crate-bun").click();
    await b.page.getByTestId("kc-plate-0").click();
    await shot(a.page, "21-coop-cooking");
    await expect(b.page.getByTestId("station-grill-0")).toHaveAttribute("data-state", /done|burning/, { timeout: 8000 });
    await b.page.getByTestId("station-grill-0").click();
    await b.page.getByTestId("kc-plate-0").click();

    // Both reach for the plate at once. Exactly one gets it.
    await Promise.all([a.page.getByTestId("kc-plate-0").click(), b.page.getByTestId("kc-plate-0").click()]);
    await a.page.waitForTimeout(300);
    const holding = [await a.page.getByTestId("kc-holding").textContent(), await b.page.getByTestId("kc-holding").textContent()];
    expect(holding.filter((h) => h?.includes("Plate 1"))).toHaveLength(1);

    const server = holding[0]?.includes("Plate 1") ? a.page : b.page;
    await server.getByTestId("kc-seat-0").click();
    await expect(a.page.getByTestId("kc-served")).toHaveText("1");
    await expect(b.page.getByTestId("kc-served")).toHaveText("1");
    await expect(a.page.getByTestId("kc-score")).not.toContainText(/^Team score0$/);

    // Everyone else walks out; the shift ends and the team sees one shared result.
    await expect(a.page.getByTestId("kc-results")).toBeVisible({ timeout: 300_000 });
    await expect(b.page.getByTestId("kc-results")).toBeVisible();
    expect(await a.page.getByTestId("kc-team-score").textContent()).toBe(await b.page.getByTestId("kc-team-score").textContent());
    await expect(a.page.getByTestId("kc-results")).toContainText("Food passed between chefs");
    await shot(a.page, "22-coop-results");
    await expectNoHorizontalOverflow(a.page);
    expect(errors).toEqual([]);
    await a.context.close(); await b.context.close();
  });

  test("the co-op kitchen fits a phone, with every control reachable", async ({ browser }) => {
    test.setTimeout(90_000);
    const a = await newPlayer(browser, "Phone", { width: 360, height: 640 }), b = await newPlayer(browser, "Mate");
    const code = await createPrivateRoom(a.page, "kitchen-rush-co-op", a.name);
    await joinByInvite(b.page, code, b.name);
    await b.page.getByRole("button", { name: "I'm ready" }).click();
    await a.page.getByRole("button", { name: "Start game" }).click();
    await expect(a.page.getByTestId("kitchen-coop")).toHaveAttribute("data-phase", "cooking", { timeout: 15_000 });
    await expectNoHorizontalOverflow(a.page);
    for (const id of ["kc-seat-0", "station-grill-0", "crate-bun", "kc-plate-0", "kc-trash", "kc-status"]) await expect(a.page.getByTestId(id)).toBeInViewport();
    await shot(a.page, "23-coop-phone");
    await a.context.close(); await b.context.close();
  });
});

test.describe("Motion and mode entry", () => {
  test("the menu lists only playable modes, and each one really opens", async ({ page }) => {
    await page.goto("/play/cuisine-quest"); await enterName(page, "ModeFan");
    const modes = page.getByTestId("cq-modes");
    await expect(modes).toBeVisible();
    await shot(page, "30-modes");
    await expect(modes.locator("a, [aria-current]")).toHaveCount(4);
    await expect(modes).not.toContainText("Mystery Basket");
    await expect(modes).not.toContainText("Coming soon");
    await expect(page.getByTestId("cq-mode-chef-rivals")).toContainText("2 players");
    await expect(page.getByTestId("cq-mode-kitchen-rush-coop")).toContainText("2–4 players");
    await page.getByTestId("cq-mode-chef-rivals").click();
    await expect(page).toHaveURL(/\/play\/chef-rivals$/);
    await expect(page.getByRole("button", { name: "Create private room" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/play\/cuisine-quest$/);
    await expect(page.getByTestId("cq-campaign")).toBeVisible();
  });

  test("route changes keep the URL, back button and fixed layouts correct, with no errors", async ({ page }) => {
    const errors: string[] = [];
    watchErrors(page, errors);
    await page.goto("/");
    for (const [link, url] of [["Games", /\/games$/], ["Leaderboard", /\/leaderboard/], ["Profile", /\/profile/]] as const) {
      await page.getByRole("navigation").getByRole("link", { name: link, exact: true }).first().click();
      await expect(page).toHaveURL(url);
    }
    await page.goBack(); await expect(page).toHaveURL(/\/leaderboard/);
    await page.goBack(); await expect(page).toHaveURL(/\/games$/);
    await page.goForward(); await expect(page).toHaveURL(/\/leaderboard/);
    // The route fade must finish, and must not trap the page in a transformed state.
    await expect.poll(() => page.locator(".sg-page").first().evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    expect(await page.locator(".sg-page").first().evaluate((el) => getComputedStyle(el).transform)).toBe("none");
    expect(errors).toEqual([]);
  });

  test("low effects and reduced motion switch on, persist, and leave pages working", async ({ page }) => {
    await page.goto("/games");
    const root = page.locator("html");
    await expect(root).not.toHaveClass(/low-effects/);
    await page.getByRole("button", { name: "Settings", exact: true }).first().click();
    await page.getByRole("switch", { name: "Low effects", exact: true }).click();
    await expect(root).toHaveClass(/low-effects/);
    await page.getByRole("switch", { name: "Reduce motion", exact: true }).click();
    await expect(root).toHaveClass(/reduce-motion/);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.reload();
    await expect(root).toHaveClass(/low-effects/);
    await expect(root).toHaveClass(/reduce-motion/);
    const card = page.locator(".sg-stagger > *").first();
    await expect(card).toBeVisible();
    expect(await card.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    await card.focus();
    await expect(card).toBeFocused();
  });

  test("the OS reduced-motion preference removes the route fade", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/games");
    const fade = await page.locator(".sg-page").first().evaluate((el) => getComputedStyle(el).animationDuration);
    expect(parseFloat(fade)).toBeLessThan(0.02);
    await context.close();
  });
});
