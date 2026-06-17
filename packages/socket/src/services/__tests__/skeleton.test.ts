// Tests for the skeleton ZIP export/import (services/config.ts): the
// buildSkeletonZip -> importSkeletonZip round-trip + the import-side security
// guards (entry-count cap, malformed/invalid manifest). Mirrors the config/
// theme-template test style: a fresh temp config dir per test driven through
// process.env.CONFIG_PATH, with vi.resetModules() so config.ts re-reads it.

import { DEFAULT_THEME, type Theme } from "@razzoozle/common/types/theme"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"

type ConfigModule = typeof import("@razzoozle/socket/services/config")

const loadConfig = async (): Promise<ConfigModule> => {
  vi.resetModules()

  return import("@razzoozle/socket/services/config")
}

let tmpDir: string
let prevConfigPath: string | undefined

beforeEach(() => {
  prevConfigPath = process.env.CONFIG_PATH
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rahoot-skeleton-test-"))
  process.env.CONFIG_PATH = tmpDir
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  if (prevConfigPath === undefined) {
    delete process.env.CONFIG_PATH
  } else {
    process.env.CONFIG_PATH = prevConfigPath
  }
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("skeleton export/import", () => {
  it("round-trips the theme and bumps skeletonVersion", async () => {
    const config = await loadConfig()
    const theme: Theme = {
      ...DEFAULT_THEME,
      colorPrimary: "#123456",
      stateColors: { correct: "#0f0f0f", wrong: "#abcdef" },
      teamColors: {
        red: "#111111",
        blue: "#222222",
        green: "#333333",
        yellow: "#444444",
      },
    }
    config.setTheme(theme)

    const buf = await config.buildSkeletonZip()
    expect(buf.length).toBeGreaterThan(0)

    const imported = await config.importSkeletonZip(buf)
    expect(imported.colorPrimary).toBe("#123456")
    expect(imported.stateColors.correct).toBe("#0f0f0f")
    expect(imported.teamColors.green).toBe("#333333")
    // import bumps the version (0 -> 1) and persists.
    expect(imported.skeletonVersion).toBe(1)
    expect(config.getTheme().colorPrimary).toBe("#123456")
  })

  it("always ships theme.css + theme.js + SKELETON.md (scaffold when unset)", async () => {
    const config = await loadConfig()
    config.setTheme({ ...DEFAULT_THEME, colorPrimary: "#abcdef" })

    const buf = await config.buildSkeletonZip()
    const zip = await JSZip.loadAsync(buf)

    expect(zip.file("skeleton.json")).not.toBeNull()
    expect(zip.file("theme.css")).not.toBeNull()
    expect(zip.file("theme.js")).not.toBeNull()
    expect(zip.file("SKELETON.md")).not.toBeNull()

    const css = await zip.file("theme.css")!.async("string")
    expect(css).toContain("--color-primary: #abcdef;")
    const js = await zip.file("theme.js")!.async("string")
    expect(js).toContain("window.razzoozle")
  })

  it("ships animations.css + themed demo preview pages", async () => {
    const config = await loadConfig()
    config.setTheme({ ...DEFAULT_THEME, colorPrimary: "#abcdef" })

    const zip = await JSZip.loadAsync(await config.buildSkeletonZip())

    expect(zip.file("animations.css")).not.toBeNull()
    expect(zip.file("demo/phone-game.html")).not.toBeNull()
    expect(zip.file("demo/lobby.html")).not.toBeNull()
    expect(zip.file("demo/presentation.html")).not.toBeNull()

    // The demo pages are themed from the live theme (colorPrimary baked in).
    const phone = await zip.file("demo/phone-game.html")!.async("string")
    expect(phone).toContain("#abcdef")
  })

  it("ships + restores custom CSS/JS and flips the enable flags", async () => {
    const config = await loadConfig()
    config.setTheme({ ...DEFAULT_THEME })
    config.setSkeletonAsset("css", ".banner{color:red}")
    config.setSkeletonAsset("js", "window.x = 1")

    const buf = await config.buildSkeletonZip()
    const imported = await config.importSkeletonZip(buf)

    expect(imported.customCssEnabled).toBe(true)
    expect(imported.customJsEnabled).toBe(true)
    expect(config.getSkeletonAsset("css")).toContain("color:red")
    expect(config.getSkeletonAsset("js")).toContain("window.x")
  })

  it("rejects a zip exceeding the entry-count cap", async () => {
    const config = await loadConfig()
    const zip = new JSZip()
    zip.file(
      "skeleton.json",
      JSON.stringify({ formatVersion: 1, name: "x", theme: DEFAULT_THEME }),
    )
    for (let i = 0; i < 250; i++) {
      zip.file(`assets/f${i}.webp`, "x")
    }
    const buf = (await zip.generateAsync({ type: "nodebuffer" })) as Buffer

    await expect(config.importSkeletonZip(buf)).rejects.toThrow()
  })

  it("rejects an invalid theme in the manifest", async () => {
    const config = await loadConfig()
    const zip = new JSZip()
    zip.file(
      "skeleton.json",
      JSON.stringify({
        formatVersion: 1,
        name: "x",
        theme: { ...DEFAULT_THEME, colorPrimary: "not-a-color" },
      }),
    )
    const buf = (await zip.generateAsync({ type: "nodebuffer" })) as Buffer

    await expect(config.importSkeletonZip(buf)).rejects.toThrow()
  })

  it("rejects a zip with no manifest", async () => {
    const config = await loadConfig()
    const zip = new JSZip()
    zip.file("theme.css", ".x{}")
    const buf = (await zip.generateAsync({ type: "nodebuffer" })) as Buffer

    await expect(config.importSkeletonZip(buf)).rejects.toThrow()
  })
})
