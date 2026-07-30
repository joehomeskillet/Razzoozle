import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const viteConfigPath = resolve(__dirname, "../vite.config.ts")
const viteConfigSource = readFileSync(viteConfigPath, "utf8")

describe("PWA update config (vite.config.ts)", () => {
  it("uses autoUpdate with manual registration and aggressive SW takeover", () => {
    expect(viteConfigSource).toMatch(/registerType:\s*["']autoUpdate["']/)
    expect(viteConfigSource).toMatch(/injectRegister:\s*false/)
    expect(viteConfigSource).toMatch(/skipWaiting:\s*true/)
    expect(viteConfigSource).toMatch(/clientsClaim:\s*true/)
    expect(viteConfigSource).toMatch(/navigateFallback:\s*null/)
    expect(viteConfigSource).toMatch(/handler:\s*["']NetworkFirst["']/)
  })
})
