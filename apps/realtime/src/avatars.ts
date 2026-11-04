import sharp from "sharp";
import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyAvatarJob } from "@platform/shared/identity";

const MAX = 5 * 1024 * 1024;
export async function normalizeAvatar(bytes: Buffer, contentType: string) {
  const detected = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    ? "image/jpeg"
    : bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "image/png"
      : bytes.subarray(0, 4).toString() === "RIFF" &&
          bytes.subarray(8, 12).toString() === "WEBP"
        ? "image/webp"
        : null;
  if (bytes.length > MAX || !bytes.length || detected !== contentType)
    throw Error("invalid_image");
  if (detected === "image/png") {
    for (let at = 8; at + 12 <= bytes.length; ) {
      const length = bytes.readUInt32BE(at);
      if (length > bytes.length - at - 12) throw Error("invalid_image");
      const chunk = bytes.toString("ascii", at + 4, at + 8);
      if (chunk === "acTL") throw Error("animated_image");
      at += length + 12;
      if (chunk === "IEND") break;
    }
  }
  if (
    detected === "image/webp" &&
    bytes.toString("ascii", 12, 16) === "VP8X" &&
    bytes[20]! & 2
  )
    throw Error("animated_image");
  const image = sharp(bytes, {
    limitInputPixels: 4096 * 4096,
    failOn: "warning",
    animated: false,
  }).timeout({ seconds: 5 });
  const meta = await image.metadata();
  if (
    !meta.width ||
    !meta.height ||
    meta.width > 4096 ||
    meta.height > 4096 ||
    (meta.pages ?? 1) > 1 ||
    !["jpeg", "png", "webp"].includes(meta.format ?? "")
  )
    throw Error("invalid_image");
  const make = (size: number) =>
    image
      .clone()
      .rotate()
      .resize(size, size, { fit: "cover", position: "centre" })
      .toColourspace("srgb")
      .webp({ quality: 82, effort: 3 })
      .toBuffer();
  const [small, full] = await Promise.all([make(64), make(256)]);
  return { small: small.toString("base64"), full: full.toString("base64") };
}
export function avatarHandler(secret: string) {
  let active = 0;
  const used = new Map<string, number>();
  return async (req: IncomingMessage, res: ServerResponse) => {
    const respond = (status: number, body: unknown) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(body));
    };
    try {
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      if (!token) return respond(401, { error: "unauthorized" });
      const job = await verifyAvatarJob(token, secret);
      const now = Date.now();
      for (const [key, time] of used) if (time < now) used.delete(key);
      if (used.has(job.jti) || used.size >= 2000)
        return respond(401, { error: "invalid_job" });
      used.set(job.jti, now + 60000);
    } catch {
      return respond(401, { error: "unauthorized" });
    }
    if (active >= 2) return respond(429, { error: "busy" });
    active++;
    req.setTimeout(10000, () => req.destroy());
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const part of req) {
        size += part.length;
        if (size > MAX) {
          respond(413, { error: "too_large" });
          req.resume();
          return;
        }
        chunks.push(part);
      }
      const result = await normalizeAvatar(
        Buffer.concat(chunks),
        req.headers["content-type"] ?? "",
      );
      respond(200, result);
    } catch {
      respond(400, { error: "invalid_image" });
    } finally {
      active--;
    }
  };
}
