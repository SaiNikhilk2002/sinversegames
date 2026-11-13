import { defineConfig } from "vitest/config";

/**
 * Long-running cricket benchmarks and the stress run, kept out of `pnpm test`.
 * Run from packages/engines, e.g. `pnpm bench:cricket`; set CRICKET_MATCHES to change the size.
 */
export default defineConfig({ test: { include: ["bench/*.run.ts"], testTimeout: 3_600_000, pool: "forks", fileParallelism: false, silent: false } });
