import { defineConfig } from "tsup";

// Bundles the server, its workspace packages (which ship as TypeScript source)
// and all third-party dependencies into one self-contained ESM file, so the
// production image needs no node_modules.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: [/.*/],
  // Optional backends pg probes for but this server never uses.
  external: ["pg-native", "pg-cloudflare", "cloudflare:sockets"],
  // CommonJS dependencies (pg, socket.io) call require() for Node built-ins.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
