import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// All apps share the repository-root .env file. Next has already loaded (and
// cached) env for apps/web, so force a reload from the root. Real environment
// variables always take precedence over .env files.
loadEnvConfig(path.resolve(import.meta.dirname, "../.."), process.env.NODE_ENV !== "production", console, true);

const realtimeUrl = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4200";
const realtimeWs = realtimeUrl.replace(/^http/, "ws");
const isDev = process.env.NODE_ENV !== "production";
// Set by open-next.config.ts when building the Cloudflare Worker.
const isCloudflare = process.env.NEXT_BUILD_TARGET === "cloudflare";

// Next.js injects small inline bootstrap scripts, hence 'unsafe-inline' for scripts;
// everything else is locked to our own origin and the realtime server.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${realtimeUrl} ${realtimeWs}${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@platform/shared", "@platform/engines", "@platform/db"],
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  // Workers can't compile wasm from bytes at runtime; use the Prisma client
  // generated for workerd, which imports the query compiler as a wasm module.
  ...(isCloudflare && {
    turbopack: {
      resolveAlias: { "#prisma-client": "../../packages/db/src/generated/prisma-workerd/client.ts" },
    },
    // pg loads its Workers socket shim (an optional dependency) only when
    // running on workerd, so Node-based file tracing never sees it.
    outputFileTracingIncludes: {
      "/**": ["../../node_modules/.pnpm/pg@*/node_modules/pg-cloudflare/**", "../../node_modules/.pnpm/pg-cloudflare@*/**"],
    },
    // Three is loaded only by the browser scene. Its package ships example
    // decoder WASM files which broad tracing otherwise copies into the Worker.
    // Client chunks remain in .open-next/assets and are not excluded here.
    outputFileTracingExcludes: {
      "/**": ["../../node_modules/.pnpm/three@*/node_modules/three/**", "node_modules/three/**"],
    },
  }),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), fullscreen=(self)" },
          ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
        ],
      },
    ];
  },
};

export default nextConfig;
