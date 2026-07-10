// e2e/playwright.config.ts — Playwright E2E harness for answer-flow / twins.
// Twins (node/rust) run externally — no webServer. baseURL via E2E_BASE_URL.
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  // Config lives in e2e/; specs are siblings of this file.
  testDir: ".",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  // No webServer: Orchestrator / ops start node|rust twins externally.
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    // Playwright's default actionTimeout is 0 = INFINITE: a click on an
    // unmounting element (e.g. deadline-race answer vs question end) retries
    // forever and .catch() never fires. Bound it so races reject fast.
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
