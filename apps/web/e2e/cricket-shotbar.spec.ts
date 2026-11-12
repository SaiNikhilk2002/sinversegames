import { expect, test } from "@playwright/test";
import { CricketMatch } from "@platform/engines/sinverse-cricket";
import { finishCricketToss } from "./cricket-helpers";
import { enterName } from "./helpers";

/**
 * The batting shot selector in a real match: families and shots by keyboard
 * and pointer, it stays clear of the field, and "Leave" never swings.
 */
test("Cricket: the shot selector picks real shots, stays off the field, and Leave lets the ball go", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/play/sinverse-cricket");
  await enterName(page, "Shot QA");
  const response = page.waitForResponse((r) => r.url().endsWith("/api/solo/start") && r.request().method() === "POST");
  await page.getByTestId("start-run").click();
  const run = await (await response).json();
  const root = page.getByTestId("sinverse-cricket");
  await finishCricketToss(page, new CricketMatch(run.seed, run.config).tossFace, "bat");
  const bar = page.getByTestId("cricket-shotbar");
  await expect(bar).toBeVisible();

  // Below the field: never over the ball or the batter.
  const field = await page.getByRole("region", { name: "Match presentation" }).boundingBox(),
    box = await bar.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(field!.y + field!.height - 1);

  // Keyboard: a family key picks its first shot, the same key again steps on.
  await root.focus();
  await page.keyboard.press("Digit5");
  await expect(bar).toHaveAttribute("data-shot", "lofted-straight");
  await page.keyboard.press("Digit5");
  await expect(bar).toHaveAttribute("data-shot", "lofted-cover");
  await expect(root).toHaveAttribute("data-intent", "loft");
  // Pointer: a family tab, then a shot.
  await bar.getByRole("tab", { name: /Leg side/ }).click();
  await bar.getByRole("radio", { name: "Pull" }).click();
  await expect(bar).toHaveAttribute("data-shot", "pull");
  await expect(bar.getByRole("radio", { name: "Pull" })).toHaveAttribute("aria-checked", "true");
  await expect(bar).toContainText("Back foot");
  await expect(root).toHaveAttribute("data-intent", "pull");

  // Leave: pressing to play during the ball does not swing.
  await bar.getByRole("tab", { name: /Defend/ }).click();
  await bar.getByRole("radio", { name: "Leave" }).click();
  await expect(bar).toHaveAttribute("data-shot", "leave");
  const seq = Number(await root.getAttribute("data-seq"));
  await page.getByTestId("cricket-primary").click();
  await expect(root).toHaveAttribute("data-live", "true");
  await expect.poll(async () => Number(await root.getAttribute("data-ball-z")), { timeout: 20000 }).toBeGreaterThan(2);
  await root.focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("cricket-primary")).not.toHaveText(/Shot committed/);
  await expect(root).toHaveAttribute("data-seq", String(seq + 1), { timeout: 60000 });
  // The speed gun reads the ball once it's been bowled.
  await expect(page.getByTestId("cricket-speed")).toHaveText(/^\d{2,3} km\/h · /);
  expect(errors).toEqual([]);
});
