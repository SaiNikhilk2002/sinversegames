import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Read by next.config.ts during the `next build` that OpenNext runs (the child
// process inherits this environment), to swap in the Workers Prisma client.
process.env.NEXT_BUILD_TARGET = "cloudflare";

// Prerendered pages are served from Workers static assets. The app has no ISR
// or time-based revalidation (data pages are force-dynamic), so no R2/KV cache
// is needed.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
