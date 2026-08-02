// packages/web/src/__tests__/e2e/playwright.config.ts — local config for
// the FB-HUD-3 visual screenshot spec. Mirrors the e2e/ root config but
// scoped to the spec's own directory so `pnpm exec playwright test` from
// packages/web runs without the e2e/ twins / webServer coupling.
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
