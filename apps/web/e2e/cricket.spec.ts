import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  CricketMatch,
  STEP,
  sinverseCricket,
  type BallLog,
  type BowlingInput,
} from "@platform/engines/sinverse-cricket";
import { calibratedShot } from "../../../packages/engines/test/cricket-fixtures";
import { enterName, expectNoHorizontalOverflow } from "./helpers";

test.use({
  trace: "off",
  launchOptions: { args: ["--enable-unsafe-swiftshader"] },
}); // Signed run tokens/session cookies are not evidence artifacts.
const evidence = "../../artifacts/cricket";
async function range(page: Page, label: string, value: number) {
  await page
    .getByRole("slider", { name: label, exact: true })
    .evaluate((element, v) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(element, String(v));
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
}
async function start(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/play/sinverse-cricket");
  await enterName(page, "Cricket Browser QA");
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/solo/start") && r.request().method() === "POST",
  );
  await page.getByTestId("start-run").click();
  const run = await (await response).json();
  await expect(page.getByTestId("sinverse-cricket")).toBeVisible();
  return run;
}
async function swingAt(root: Locator, tick: number) {
  return root.evaluate(
    (element, target) =>
      new Promise<number>((resolve, reject) => {
        const deadline = setTimeout(() => {
          observer.disconnect();
          reject(Error("Swing window did not arrive"));
        }, 12000);
        const check = () => {
          const at = Number((element as HTMLElement).dataset.ballTick);
          if (at >= target) {
            observer.disconnect();
            clearTimeout(deadline);
            (
              element.querySelector(
                '[data-testid="cricket-primary"]',
              ) as HTMLButtonElement
            ).click();
            resolve(at);
          }
        };
        const observer = new MutationObserver(check);
        observer.observe(element, {
          attributes: true,
          attributeFilter: ["data-ball-tick"],
        });
        check();
      }),
    tick,
  );
}

test("Cricket: play both innings through real controls, replay, verify and save once", async ({
  browser,
}) => {
  test.setTimeout(300000);
  mkdirSync(evidence, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
    recordVideo: {
      dir: "../../.data/cricket/video",
      size: { width: 960, height: 676 },
    },
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const run = await start(page),
    root = page.getByTestId("sinverse-cricket");
  await page.getByLabel("Graphics", { exact: true }).selectOption("low");
  await expect(root).toHaveAttribute("data-draw-calls", /\d+/, {
    timeout: 20000,
  });
  await page.screenshot({ path: `${evidence}/stadium-desktop.png` });
  const model = new CricketMatch(run.seed, run.config);
  await page.getByLabel("Toss call").selectOption(model.tossFace);
  await page
    .getByRole("button", { name: "Call the toss", exact: true })
    .click();
  model.toss({ k: "toss", call: model.tossFace, decision: "bat", t: 0 });
  await page
    .getByRole("button", { name: "More control +", exact: true })
    .click();
  await page.getByLabel("Relaxed presentation pace").uncheck();
  let modelTime = 0,
    replayed = false;
  const metrics: unknown[] = [];
  while ((await root.getAttribute("data-phase")) !== "finished") {
    if ((await root.getAttribute("data-phase")) === "interval") {
      await page.screenshot({ path: `${evidence}/innings-interval.png` });
      await page.getByTestId("cricket-primary").click();
      model.nextInnings();
      continue;
    }
    const seq = Number(await root.getAttribute("data-seq")),
      batting = (await root.getAttribute("data-batting")) === "true";
    let selected = batting ? calibratedShot(model) : null;
    if (selected) {
      selected = {
        ...selected,
        face: Number((Math.round(selected.face / 0.02) * 0.02).toFixed(2)),
      };
      await page
        .getByLabel("Shot", { exact: true })
        .selectOption(selected.kind);
      await range(page, "Aim", 0);
      await range(page, "Power", 1);
      await range(page, "Bat face", selected.face);
    }
    await page.getByTestId("cricket-primary").click();
    if (!batting) {
      await page.waitForTimeout(560);
      await page.getByTestId("cricket-primary").click();
    }
    await expect(root).toHaveAttribute("data-live", "true");
    if (selected) selected.tick = await swingAt(root, selected.tick);
    if (seq === 0) {
      await page.screenshot({ path: `${evidence}/batting-live.png` });
      await page
        .getByRole("button", { name: "Pause match", exact: true })
        .click();
      const tick = await root.getAttribute("data-ball-tick");
      await page.waitForTimeout(200);
      expect(await root.getAttribute("data-ball-tick")).toBe(tick);
      await page
        .getByRole("button", { name: "Return to the middle", exact: true })
        .click();
    }
    await expect(root).toHaveAttribute("data-seq", String(seq + 1), {
      timeout: 30000,
    });
    await expect(page.getByTestId("cricket-commentary")).not.toContainText(
      "integrity check",
    );
    if (batting) {
      const move = {
        bowling: null,
        shot: selected,
        runAt: [],
        field: model.fieldForAI(),
      };
      const delivery = model.createDelivery(move);
      delivery.complete();
      modelTime += Math.ceil(delivery.tick * STEP * 1000) + 2000;
      expect(
        model.record(
          { k: "ball", seq, ...move, digest: delivery.digest, t: modelTime },
          delivery,
        ),
      ).toBe(true);
    }
    metrics.push(
      await root.evaluate((e) =>
        Object.fromEntries(
          [...e.attributes]
            .filter((a) => a.name.startsWith("data-"))
            .map((a) => [a.name, a.value]),
        ),
      ),
    );
    if (!replayed) {
      replayed = true;
      const score = await page.getByTestId("cricket-score").innerText();
      await page
        .getByRole("button", { name: "Replay last delivery", exact: true })
        .click();
      await range(page, "Replay position", 120);
      await page
        .getByLabel("Replay speed", { exact: true })
        .selectOption("0.5");
      await page.getByLabel("Camera", { exact: true }).selectOption("side");
      await page.screenshot({ path: `${evidence}/replay-side.png` });
      await page.getByTestId("cricket-replay-close").click();
      expect(await page.getByTestId("cricket-score").innerText()).toBe(score);
      expect(await root.getAttribute("data-seq")).toBe(String(seq + 1));
    }
  }
  await page.screenshot({ path: `${evidence}/match-finish.png` });
  const request = page.waitForRequest(
    (r) => r.url().endsWith("/api/solo/submit") && r.method() === "POST",
  );
  await page.getByTestId("cricket-save").click();
  const payload = (await request).postDataJSON();
  const verified = sinverseCricket.verify(run.seed, run.config, payload.log);
  expect(verified.ok).toBe(true);
  await expect(page.getByTestId("score-verified")).toBeVisible({
    timeout: 20000,
  });
  expect(await page.getByTestId("solo-results").innerText()).not.toContain(
    "couldn't",
  );
  expect(
    (
      await page.request.post("/api/solo/submit", {
        data: payload,
        headers: { origin: "http://localhost:3200" },
      })
    ).status(),
  ).toBe(409);
  await page.screenshot({
    path: `${evidence}/verified-scorebook.png`,
    fullPage: true,
  });
  await page.goto("/profile");
  await expect(page.getByText("Sinverse Cricket").first()).toBeVisible();
  expect(errors).toEqual([]);
  writeFileSync(
    `${evidence}/duel-evidence.json`,
    JSON.stringify(
      {
        seed: run.seed,
        config: run.config,
        verified: verified.ok ? verified.result : null,
        deliveryCount: payload.log.length - 1,
        metrics,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  await context.close();
  await page.video()!.saveAs(`${evidence}/duel-desktop.webm`);
});

test("Cricket: seven responsive widths, touch layout, keyboard focus and renderer lifecycle", async ({
  browser,
}) => {
  test.setTimeout(150000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  const root = page.getByTestId("sinverse-cricket"),
    layouts = [];
  await page.getByLabel("Graphics", { exact: true }).selectOption("tactical");
  for (const width of [320, 360, 390, 430, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 960 });
    await expectNoHorizontalOverflow(page);
    const bounds = await root.boundingBox();
    expect(bounds!.x).toBe(0);
    expect(bounds!.width).toBe(width);
    const toss = page.getByRole("button", {
      name: "Call the toss",
      exact: true,
    });
    await expect(toss).toBeInViewport();
    layouts.push({
      width,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    });
    if (width === 320)
      await page.screenshot({ path: `${evidence}/toss-320.png` });
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await page
    .getByRole("button", { name: "Call the toss", exact: true })
    .click();
  await expect(page.getByTestId("cricket-primary")).toBeInViewport();
  await page.screenshot({ path: `${evidence}/controls-320.png` });
  await page.getByRole("button", { name: "Pause match", exact: true }).click();
  await page.keyboard.press("Tab");
  expect(
    await page
      .locator("[data-cricket-panel]")
      .evaluate((e) => e.contains(document.activeElement)),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Controls & rules", exact: true })
    .click();
  await expect(page.getByText("Every ball is a decision.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Pause match", exact: true }).click();
  await page.getByRole("button", { name: "Leave match", exact: true }).click();
  await expect(root).toHaveCount(0);
  await expect(page.getByTestId("start-run")).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
  await page.getByTestId("start-run").click();
  await page.getByLabel("Graphics", { exact: true }).selectOption("low");
  await expect(page.getByText("3D ground ready", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await page
    .getByTestId("cricket-canvas")
    .evaluate((c) =>
      c.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
  await expect(root).toHaveAttribute("data-renderer", "tactical");
  expect(errors).toEqual([]);
  writeFileSync(
    `${evidence}/responsive-evidence.json`,
    JSON.stringify(
      {
        layouts,
        shortScreen: { width: 320, height: 640 },
        touch: true,
        reducedMotion: true,
        contextLossFallback: true,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  await context.close();
});

test("Cricket: unavailable WebGL2 falls back and the tactical over remains playable", async ({
  browser,
}) => {
  const context = await browser.newContext({
      viewport: { width: 430, height: 932 },
    }),
    page = await context.newPage();
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === "webgl2") return null;
      return original.apply(this, [type, ...args] as never);
    } as typeof original;
  });
  await start(page);
  await expect(page.getByTestId("sinverse-cricket")).toHaveAttribute(
    "data-renderer",
    "tactical",
  );
  await page
    .getByRole("button", { name: "Call the toss", exact: true })
    .click();
  await page.getByTestId("cricket-primary").click();
  if (await page.getByRole("meter", { name: "Release timing" }).isVisible()) {
    await page.waitForTimeout(560);
    await page.getByTestId("cricket-primary").click();
  }
  await expect(page.getByTestId("sinverse-cricket")).toHaveAttribute(
    "data-seq",
    "1",
    { timeout: 30000 },
  );
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${evidence}/tactical-430.png` });
  await context.close();
});
