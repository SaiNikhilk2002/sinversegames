import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { localIdentityFixture } from "./account";

interface Bucket {
  put(
    key: string,
    value: Uint8Array,
    options?: { httpMetadata: { contentType: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(keys: string[]): Promise<void>;
}
const valid = (key: string) => /^[a-f0-9]{32}\/(small|full)\.webp$/.test(key);
async function bucket() {
  try {
    return (
      (
        (await getCloudflareContext({ async: true })).env as unknown as {
          AVATARS?: Bucket;
        }
      ).AVATARS ?? null
    );
  } catch {
    return null;
  }
}
function localDirectory() {
  return localIdentityFixture() ? process.env.AVATAR_LOCAL_DIR : null;
}
export async function avatarStorageAvailable() {
  return !!localDirectory() || !!(await bucket());
}
export async function putAvatar(key: string, bytes: Uint8Array) {
  if (!valid(key)) throw Error("invalid_avatar_key");
  const store = await bucket();
  if (store) {
    await store.put(key, bytes, {
      httpMetadata: { contentType: "image/webp" },
    });
    return;
  }
  const directory = localDirectory();
  if (!directory) throw Error("Avatar storage is not configured.");
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const target = path.resolve(directory, key);
  if (!target.startsWith(path.resolve(directory) + path.sep))
    throw Error("invalid_avatar_path");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes, { flag: "wx" });
}
export async function readAvatar(key: string) {
  if (!valid(key)) return null;
  const store = await bucket();
  if (store) {
    const object = await store.get(key);
    return object ? new Uint8Array(await object.arrayBuffer()) : null;
  }
  const directory = localDirectory();
  if (!directory) return null;
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    return new Uint8Array(await fs.readFile(path.resolve(directory, key)));
  } catch {
    return null;
  }
}
export async function deleteAvatar(key: string) {
  if (!/^[a-f0-9]{32}$/.test(key)) return;
  const keys = [`${key}/small.webp`, `${key}/full.webp`];
  const store = await bucket();
  if (store) {
    await store.delete(keys);
    return;
  }
  const directory = localDirectory();
  if (directory) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    for (const file of keys)
      await fs.unlink(path.resolve(directory, file)).catch(() => {});
  }
}
