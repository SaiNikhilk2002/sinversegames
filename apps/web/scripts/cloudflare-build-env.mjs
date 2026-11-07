// First step of `cf:build`. Outside Workers Builds it only reports.
//
// NEXT_PUBLIC_REALTIME_URL is compiled into the Worker (socket target and the
// CSP connect-src), so a Preview build compiled with the production realtime
// URL would send Preview players to production realtime. Inside Workers Builds
// a non-production branch build with that URL stops here, before anything is
// built or published. An unset URL compiles to http://localhost:4200, which
// cannot reach production.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const PRODUCTION_BRANCH = "main";
export const PRODUCTION_REALTIME_HOSTS = ["rt.sinversegames.com"];

export function checkBuildEnv(env) {
  const ci = env.WORKERS_CI === "1";
  const branch = env.WORKERS_CI_BRANCH ?? "";
  const url = env.NEXT_PUBLIC_REALTIME_URL ?? "";
  let host = "";
  if (url) {
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      throw new Error(`NEXT_PUBLIC_REALTIME_URL is not a valid URL: "${url}"`);
    }
  }
  const realtime = !url ? "unset (compiles to http://localhost:4200)" : host;
  if (!ci) return { ci, branch: null, production: null, realtime };
  // An empty branch is treated as non-production: the stricter choice.
  const production = branch === PRODUCTION_BRANCH;
  if (!production && PRODUCTION_REALTIME_HOSTS.includes(host))
    throw new Error(
      `Refusing a non-production build (branch "${branch || "unknown"}") with the production realtime URL. ` +
        "Set NEXT_PUBLIC_REALTIME_URL for non-production builds to a non-production realtime service, " +
        "or leave it unset. See docs/CLOUDFLARE_DEFAULT_BUILD.md.",
    );
  return { ci, branch, production, realtime };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log("CLOUDFLARE_BUILD_ENV " + JSON.stringify(checkBuildEnv(process.env)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
