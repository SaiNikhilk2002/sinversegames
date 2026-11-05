import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against production builds of both services:
 *   pnpm build && pnpm test:e2e
 * Existing servers on :3200 / :4200 are reused when already running.
 *
 * Tests create players and matches, so servers started here always use the
 * local database (`pnpm db:local`), never whatever DATABASE_URL is in .env.
 * Set E2E_DATABASE_URL to point them somewhere else on purpose.
 */
const env = { DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://platform:platform@localhost:5433/platform" };

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  // E2E_EXPECT_TIMEOUT is for running against a remote database, where each query is far slower.
  expect: { timeout: Number(process.env.E2E_EXPECT_TIMEOUT ?? 10_000) },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3200",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "pnpm --filter @platform/realtime start",
      url: "http://localhost:4200/health",
      reuseExistingServer: true,
      timeout: 60_000,
      cwd: "../..",
      env,
    },
    {
      command: "pnpm --filter @platform/web start",
      url: "http://localhost:3200",
      reuseExistingServer: true,
      timeout: 120_000,
      cwd: "../..",
      env,
    },
  ],
});
