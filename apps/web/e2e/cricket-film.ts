import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { STEP } from "@platform/engines/sinverse-cricket";

/** Shared helpers for the on-demand Cricket footage specs (real match screen, real controls). */

export async function range(page: Page, label: string, value: number) {
  await page.getByRole("slider", { name: label, exact: true }).evaluate((element, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, String(v));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

/** Clicks a match control the moment the live ball reaches `tick`. */
export function clickAt(root: Locator, testId: string, tick: number) {
  return root.evaluate(
    (element, [id, target]) =>
      new Promise<number>((resolve, reject) => {
        const deadline = setTimeout(() => (observer.disconnect(), reject(Error(`${id} window did not arrive`))), 30000);
        const check = () => {
          const at = Number((element as HTMLElement).dataset.ballTick);
          const button = element.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;
          if (at >= (target as number) && button && !button.disabled) {
            observer.disconnect();
            clearTimeout(deadline);
            button.click();
            resolve(at);
          }
        };
        const observer = new MutationObserver(check);
        observer.observe(element, { attributes: true, attributeFilter: ["data-ball-tick"] });
        check();
      }),
    [testId, tick] as const,
  );
}

/** Plays frames (data URLs with times in ms) into a WebM at their real timing. */
export async function encode(browser: Browser, frames: { at: number; data: string }[]) {
  const page = await browser.newPage();
  const base64 = await page.evaluate(async (list) => {
    const img = new Image();
    const first = await new Promise<HTMLImageElement>((r) => ((img.onload = () => r(img)), (img.src = list[0]!.data)));
    const canvas = document.createElement("canvas");
    canvas.width = first.naturalWidth;
    canvas.height = first.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.start();
    for (let i = 0; i < list.length; i++) {
      const frame = new Image();
      await new Promise((r) => ((frame.onload = r), (frame.src = list[i]!.data)));
      ctx.drawImage(frame, 0, 0);
      const gap = i + 1 < list.length ? list[i + 1]!.at - list[i]!.at : 120;
      await new Promise((r) => setTimeout(r, gap));
    }
    await new Promise((r) => ((recorder.onstop = r), recorder.stop()));
    const blob = new Blob(chunks, { type: "video/webm" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, frames);
  await page.close();
  return Buffer.from(base64, "base64");
}

export type FilmOptions = {
  name: string;
  camera: string;
  /** Replay ticks to film, start and end (the end is clamped to the replay). */
  from: number;
  to?: number;
  /** Replay speed; 0.5 gives 2x slow motion at real timing. */
  speed?: number;
  /** Contact sheet directory (committed) and video/stills directory (not committed). */
  sheets: string;
  videos: string;
  /** Contact sheet image type; JPEG keeps full-resolution sheets small. */
  sheetType?: "png" | "jpeg";
  /** Milliseconds to keep filming after the replay's last frame (reactions and celebrations play on). */
  tail?: number;
};

/** Opens the last ball's replay and films it from the real match screen. */
export async function film(page: Page, browser: Browser, o: FilmOptions) {
  const slider = page.getByRole("slider", { name: "Replay position", exact: true });
  if (!(await slider.isVisible().catch(() => false))) await page.keyboard.press("KeyP");
  await expect(slider).toBeVisible({ timeout: 8000 });
  const pause = page.getByRole("button", { name: "Pause replay", exact: true });
  if (await pause.isVisible()) await pause.click({ timeout: 2000 });
  const speed = o.speed ?? 1;
  await page.getByLabel("Replay speed").selectOption(String(speed));
  await page.getByLabel("Camera", { exact: true }).selectOption(o.camera);
  const end = Math.min(Number(await slider.getAttribute("max")), o.to ?? Infinity);
  await range(page, "Replay position", o.from);
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Play replay", exact: true }).click();
  // Off the controls, so the replay strip fades back as it does for a viewer.
  await page.mouse.move(Math.round((page.viewportSize()?.width ?? 1280) / 2), 120);
  const frames: { at: number; data: string }[] = [],
    started = Date.now(),
    length = ((end - o.from) * STEP * 1000) / speed + (o.tail ?? 600);
  while (Date.now() - started < length) {
    const shot = await page.screenshot({ type: "jpeg", quality: 82 });
    frames.push({ at: Date.now() - started, data: `data:image/jpeg;base64,${shot.toString("base64")}` });
  }
  const pauseAgain = page.getByRole("button", { name: "Pause replay", exact: true });
  if (await pauseAgain.isVisible()) await pauseAgain.click({ timeout: 2000 });
  mkdirSync(o.videos, { recursive: true });
  writeFileSync(`${o.videos}/${o.name}.webm`, await encode(browser, frames));
  // Every fourth frame as a full-size still, for close review.
  mkdirSync(`${o.videos}/${o.name}`, { recursive: true });
  frames.forEach((f, i) => i % 4 === 0 && writeFileSync(`${o.videos}/${o.name}/${String(i).padStart(3, "0")}-${(f.at / 1000).toFixed(2)}s.jpg`, Buffer.from(f.data.split(",")[1]!, "base64")));
  // A contact sheet of eight evenly spaced frames, with replay-time captions.
  const picks = Array.from({ length: 8 }, (_, i) => frames[Math.min(frames.length - 1, Math.floor((i / 7) * (frames.length - 1)))]!);
  const width = page.viewportSize()?.width ?? 1280;
  const sheet = await browser.newPage({ viewport: { width, height: 400 } });
  await sheet.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(4,1fr)">${picks.map((f) => `<figure style="margin:0;position:relative"><img style="width:100%" src="${f.data}"><figcaption style="position:absolute;top:4px;left:6px;color:#fff;font:600 ${Math.round(width / 100)}px system-ui;text-shadow:0 1px 2px #000">${((f.at / 1000) * speed).toFixed(2)} s</figcaption></figure>`).join("")}</body>`);
  mkdirSync(o.sheets, { recursive: true });
  await sheet.screenshot({ path: `${o.sheets}/${o.name}.${o.sheetType === "jpeg" ? "jpg" : "png"}`, fullPage: true, ...(o.sheetType === "jpeg" ? { type: "jpeg" as const, quality: 80 } : {}) });
  await sheet.close();
  await page.getByTestId("cricket-replay-close").click();
  await page.waitForTimeout(800);
  return { frames: frames.length, fps: +(frames.length / (length / 1000)).toFixed(1), speed };
}

/** Pauses the open replay on an exact tick and saves a full-resolution still. */
export async function still(page: Page, tick: number, camera: string, path: string) {
  const slider = page.getByRole("slider", { name: "Replay position", exact: true });
  if (!(await slider.isVisible().catch(() => false))) await page.keyboard.press("KeyP");
  await expect(slider).toBeVisible({ timeout: 8000 });
  const pause = page.getByRole("button", { name: "Pause replay", exact: true });
  if (await pause.isVisible()) await pause.click({ timeout: 2000 });
  await page.getByLabel("Camera", { exact: true }).selectOption(camera);
  await range(page, "Replay position", Math.max(0, tick - 30));
  await page.waitForTimeout(300);
  await range(page, "Replay position", tick);
  await page.mouse.move(Math.round((page.viewportSize()?.width ?? 1280) / 2), 120);
  await page.waitForTimeout(900);
  // A paused replay shows its control strip; it is hidden for the still only.
  await page.locator(".cr-replay").evaluate((e) => ((e as HTMLElement).style.visibility = "hidden"));
  await page.screenshot({ path, type: "jpeg", quality: 90 });
  await page.locator(".cr-replay").evaluate((e) => ((e as HTMLElement).style.visibility = ""));
}
