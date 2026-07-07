// e2e/playwright.config.ts — Playwright E2E SKELETON (not wired into CI yet).
// All specs in this dir are `test.skip` until data-testid instrumentation
// lands on the web client (see game-lifecycle.spec.ts TODOs + Week-2 plan in
// scratchpad/RESEARCH-testing-cicd.md).
//
// enable: pnpm add -D @playwright/test
// (intentionally NOT added to package.json yet — this is structure-only).
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github-actions" : "list",
  // Both dev servers: the web client (vite, :3000) proxies/connects to the
  // socket backend (:3001, node) or the rust server (see the `backend` loop
  // in game-lifecycle.spec.ts — rust runs standalone, port managed there).
  webServer: [
    {
      command: "pnpm --filter @razzoozle/socket run dev",
      url: "http://localhost:3001/healthz",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @razzoozle/web run dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
