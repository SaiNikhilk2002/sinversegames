import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against production builds of both services:
 *   pnpm build && pnpm test:e2e
 * Existing servers on :3000 / :4000 are reused when already running.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
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
    },
    {
      command: "pnpm --filter @platform/web start",
      url: "http://localhost:3200",
      reuseExistingServer: true,
      timeout: 120_000,
      cwd: "../..",
    },
  ],
});
