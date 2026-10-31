import { defineConfig } from "tsup";

// Bundles the server and its workspace packages (which ship as TypeScript
// source) into a single ESM file. Third-party dependencies stay external.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: [/^@platform\//],
  // Transitive deps of @platform/db are CommonJS/native-ish: load them from node_modules at runtime.
  external: ["pg", "@prisma/adapter-pg", /^@prisma\/client/],
});
