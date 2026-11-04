import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { normalizeAvatar } from "../src/avatars";
describe("Avatar decoding and normalization", () => {
  it.each(["jpeg", "png", "webp"] as const)(
    "decodes %s, crops 64/256 and strips metadata",
    async (format) => {
      const bytes = await sharp({
        create: { width: 90, height: 140, channels: 3, background: "#7365d8" },
      })
        .withMetadata({ orientation: 6 })
        .toFormat(format)
        .toBuffer();
      const result = await normalizeAvatar(bytes, `image/${format}`);
      for (const [name, size] of [
        ["small", 64],
        ["full", 256],
      ] as const) {
        const meta = await sharp(
          Buffer.from(result[name], "base64"),
        ).metadata();
        expect(meta).toMatchObject({
          format: "webp",
          width: size,
          height: size,
        });
        expect(meta.exif).toBeUndefined();
        expect(meta.icc).toBeUndefined();
      }
    },
  );
  it("rejects spoofed MIME, executable/SVG, truncation, oversize and excess dimensions", async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    await expect(normalizeAvatar(png, "image/jpeg")).rejects.toThrow();
    for (const bytes of [
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      Buffer.from("MZ executable"),
      png.subarray(0, 25),
      Buffer.alloc(5 * 1024 * 1024 + 1),
    ])
      await expect(normalizeAvatar(bytes, "image/png")).rejects.toThrow();
    const huge = await sharp({
      create: { width: 4097, height: 1, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    await expect(normalizeAvatar(huge, "image/png")).rejects.toThrow();
  });
  it("rejects animated WebP rather than silently accepting only its first frame", async () => {
    const pixels = Buffer.alloc(8 * 16 * 3, 128);
    pixels.fill(240, 8 * 8 * 3);
    const animated = await sharp(pixels, {
      raw: { width: 8, height: 16, channels: 3, pageHeight: 8 },
    })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(
      2,
    );
    await expect(normalizeAvatar(animated, "image/webp")).rejects.toThrow();
  });
});
