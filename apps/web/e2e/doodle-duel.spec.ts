import { expect, test, type Page } from "@playwright/test";
import { createPrivateRoom, joinByInvite, newPlayer } from "./helpers";

async function drawSquiggle(page: Page) {
  await page.getByTestId("doodle-canvas").scrollIntoViewIfNeeded();
  const box = (await page.getByTestId("doodle-canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.down();
  for (let i = 0; i <= 20; i++) {
    await page.mouse.move(box.x + box.width * (0.2 + i * 0.03), box.y + box.height * (0.3 + Math.sin(i / 3) * 0.2), { steps: 2 });
  }
  await page.mouse.up();
}

/** Counts non-white pixels on the canvas — proof that strokes arrived and rendered. */
const inkPixels = (page: Page) =>
  page.getByTestId("doodle-canvas").evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 16) if (data[i]! < 200) n++;
    return n;
  });

async function playTurn(drawer: Page, guesser: Page, turn = 0) {
  const options = drawer.getByTestId("word-options");
  await expect(options).toBeVisible();
  await options.getByRole("button").first().click();
  const word = (await drawer.getByTestId("secret-word").textContent())!.trim();
  expect(word.length).toBeGreaterThan(1);

  // The guesser sees only blanks — never the word.
  await expect(guesser.getByTestId("word-mask")).toBeVisible();
  expect(await guesser.content()).not.toContain(`>${word}<`);

  await expect(drawer.getByTestId("word-options")).toBeHidden();
  await drawSquiggle(drawer);
  const diag = await drawer.getByTestId("doodle-canvas").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width * 0.2, r.y + r.height * 0.3);
    return `strokes=${(el as HTMLElement).dataset.strokes ?? "?"} hit=${hit?.tagName} size=${(el as HTMLCanvasElement).width}x${(el as HTMLCanvasElement).height}`;
  });
  await expect.poll(() => inkPixels(drawer), { message: `turn ${turn}: drawer canvas shows the stroke (${diag})` }).toBeGreaterThan(20);
  await expect.poll(() => inkPixels(guesser), { message: "drawing should sync to the guesser" }).toBeGreaterThan(20);

  await guesser.getByLabel("Your guess").fill("definitely not it");
  await guesser.keyboard.press("Enter");
  await expect(drawer.getByTestId("guess-log")).toContainText("definitely not it");

  await guesser.getByLabel("Your guess").fill(word.toUpperCase());
  await guesser.keyboard.press("Enter");
  await expect(drawer.getByTestId("guess-log")).toContainText("guessed the word!");
  // The public log never shows the answer text.
  await expect(drawer.getByTestId("guess-log")).not.toContainText(word.toUpperCase());
  await expect(guesser.getByTestId("turn-results")).toBeVisible();
  return word;
}

test("two players complete a Doodle Duel match with synced drawing and server scoring", async ({ browser }) => {
  const a = await newPlayer(browser, "Pia");
  const b = await newPlayer(browser, "Quinn");
  const code = await createPrivateRoom(a.page, "doodle-duel", a.name);
  await a.page.getByRole("radio", { name: "1", exact: true }).click();
  await a.page.getByRole("radio", { name: "30s", exact: true }).click();
  await joinByInvite(b.page, code, b.name);
  await b.page.getByRole("button", { name: "I'm ready" }).click();
  await a.page.getByRole("button", { name: "Start game" }).click();
  await expect(a.page.getByTestId("doodle-duel")).toBeVisible();
  await expect(b.page.getByTestId("doodle-duel")).toBeVisible();

  // Two turns: each player draws once.
  for (let turn = 0; turn < 2; turn++) {
    // Wait (through the reveal screen) for whichever player is offered words next.
    const aDraws = await Promise.race([
      a.page.getByTestId("word-options").waitFor({ timeout: 20_000 }).then(() => true),
      b.page.getByTestId("word-options").waitFor({ timeout: 20_000 }).then(() => false),
    ]);
    const [drawer, guesser] = aDraws ? [a.page, b.page] : [b.page, a.page];
    await playTurn(drawer, guesser, turn);
  }

  await expect(a.page.getByTestId("results")).toBeVisible({ timeout: 20_000 });
  await expect(b.page.getByTestId("results")).toBeVisible();
  // Both players guessed once and drew once, so both scored server-side.
  const scores = await a.page.locator('[data-testid^="score-"]').allTextContents();
  expect(scores).toHaveLength(2);
  for (const s of scores) expect(parseInt(s, 10)).toBeGreaterThan(100);

  await a.context.close();
  await b.context.close();
});
