import { expect, type Page } from "@playwright/test";

/** Exercise the airborne call and post-reveal decision; no test hook bypasses the toss. */
export async function finishCricketToss(page: Page, call: "heads" | "tails" = "heads", decision: "bat" | "bowl" = "bat", manual = true) {
  const root = page.getByTestId("sinverse-cricket");
  if ((await root.getAttribute("data-ceremony")) !== "flight") {
    await root.focus();
    await page.keyboard.press("Space");
  }
  await expect(root).toHaveAttribute("data-ceremony", "flight");
  await page.getByRole("button", { name: call === "heads" ? "Heads" : "Tails", exact: true }).click();
  await expect(root).toHaveAttribute("data-call", call);
  await expect(root).toHaveAttribute("data-ceremony", "decision", { timeout: 20000 });
  const choose = page.getByRole("button", { name: decision === "bat" ? "Bat first" : "Bowl first", exact: true });
  const continueButton = page.getByRole("button", { name: "Continue to the middle", exact: true });
  await expect(choose.or(continueButton)).toBeVisible();
  if (await choose.isVisible()) await choose.click();
  else await continueButton.click();
  // Entry can finish while a slow software GPU is processing a click. Wait for its
  // state rather than racing a skip button which legitimately unmounts itself.
  await expect(root).toHaveAttribute("data-ceremony", "done", { timeout: 15000 });
  if (manual) {
    await page.getByRole("button", { name: "Pause match", exact: true }).click();
    await page.getByLabel("Continuous match flow").uncheck();
    await page.getByLabel("Touch / assist controls").check();
    await page.getByRole("button", { name: "Return to the middle", exact: true }).click();
  }
}
