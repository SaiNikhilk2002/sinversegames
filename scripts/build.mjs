// Root `pnpm build` / `pnpm run build`.
//
// Locally and in every other CI it is the Node build used by `pnpm start:*` and
// the Playwright suite: Prisma clients, then the Next.js and realtime builds.
//
// Inside Cloudflare Workers Builds (which sets WORKERS_CI=1) it builds the
// OpenNext Worker instead, by running the existing `pnpm cloudflare:build`.
// Workers Builds may fall back to its default `pnpm run build` followed by
// `npx wrangler preview` (or `npx wrangler deploy`) from the repository root,
// and both of those need apps/web/.open-next/worker.js. `cloudflare:build`
// keeps its own isolation and artifact checks, so they run on both paths.
//
// SINVERSE_BUILD_TARGET=node|cloudflare overrides the detection explicitly.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GUARD = "SINVERSE_ROOT_BUILD_ACTIVE";

export function selectTarget(env) {
  const explicit = env.SINVERSE_BUILD_TARGET;
  if (explicit !== undefined && explicit !== "") {
    if (explicit !== "node" && explicit !== "cloudflare")
      throw new Error(`SINVERSE_BUILD_TARGET must be "node" or "cloudflare", not "${explicit}"`);
    return explicit;
  }
  return env.WORKERS_CI === "1" ? "cloudflare" : "node";
}

export function buildSteps(target) {
  const generate = ["--filter", "@platform/db", "generate"];
  return target === "cloudflare"
    ? [generate, ["cloudflare:build"]]
    : [generate, ["-r", "--filter", "@platform/web", "--filter", "@platform/realtime", "build"]];
}

function main() {
  // The Cloudflare path runs OpenNext, which runs apps/web's own `build`
  // (`next build`), never this one. Refuse re-entry rather than loop.
  if (process.env[GUARD] === "1")
    throw new Error("Root build re-entered itself; a nested script must not call the root `build`.");
  const target = selectTarget(process.env);
  console.log(`ROOT_BUILD_TARGET ${target}` + (process.env.WORKERS_CI === "1" ? " (Workers Builds detected)" : ""));
  // pnpm sets npm_execpath to its own entry point when it runs a script.
  const pnpm = process.env.npm_execpath;
  for (const args of buildSteps(target)) {
    const [command, argv] = !pnpm
      ? ["pnpm", args]
      : /\.(?:c?js|mjs)$/.test(pnpm)
        ? [process.execPath, [pnpm, ...args]]
        : [pnpm, args];
    console.log(`> pnpm ${args.join(" ")}`);
    const result = spawnSync(command, argv, {
      cwd: root,
      stdio: "inherit",
      shell: command === "pnpm" && process.platform === "win32",
      env: { ...process.env, [GUARD]: "1" },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      return;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
