// Tests for the theme-revision (#12 WP-18) persistence layer in services/config.ts:
// the per-save rolling revision ring (theme-revisions.json) + the setTheme snapshot
// trigger. Mirrors the theme-template/config test style: a fresh temp config dir per
// test driven through process.env.CONFIG_PATH, with vi.resetModules() so config.ts
// re-reads it.
//
// Coverage: save → ring (cap at THEME_REVISIONS_MAX, newest-first) → restore round-trip
// (setTheme captures the pre-overwrite theme) → missing-file → [] → invalid-entry skip.

import { THEME_REVISIONS_MAX } from "@razzoozle/common/constants"
import { DEFAULT_THEME, type Theme } from "@razzoozle/common/types/theme"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

type ConfigModule = typeof import("@razzoozle/socket/services/config")

let tmpDir: string
let prevConfigPath: string | undefined

const loadConfig = async (): Promise<ConfigModule> => {
  vi.resetModules()

  return import("@razzoozle/socket/services/config")
}

// A theme object that satisfies themeValidator (every required field present).
const VALID_THEME: Theme = {
  ...DEFAULT_THEME,
  style: "flat",
  colorPrimary: "#ff9900",
  colorSecondary: "#1a140b",
  colorText: "#ffffff",
  answerColors: ["#E69F00", "#56B4E9", "#3DBFA0", "#CC79A7"],
  answerTextColor: "#ffffff",
  accentColor: "#ff9900",
  radius: 16,
  scrim: 40,
  appTitle: null,
  logo: null,
  showBranding: true,
  backgrounds: {
    auth: null,
    managerGame: null,
    playerGame: null,
    animated: DEFAULT_THEME.backgrounds.animated,
    animatedCss: "",
  },
}

const themeWith = (colorPrimary: string): Theme => ({
  ...VALID_THEME,
  colorPrimary,
})

const revisionsFile = () => path.join(tmpDir, "theme-revisions.json")

beforeEach(() => {
  prevConfigPath = process.env.CONFIG_PATH
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rahoot-theme-rev-test-"))
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

  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

describe("theme-revision persistence", () => {
  it("getThemeRevisions returns [] when the file is missing", async () => {
    const config = await loadConfig()

    expect(fs.existsSync(revisionsFile())).toBe(false)
    expect(config.getThemeRevisions()).toEqual([])
  })

  it("saveThemeRevision → getThemeRevisions / getThemeRevisionById (newest-first)", async () => {
    const config = await loadConfig()

    // Ids are `rev-${Date.now()}`; two saves in the same ms would collide. Force
    // distinct, increasing timestamps so getThemeRevisionById resolves uniquely.
    let now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockImplementation(() => (now += 1000))

    const { id: firstId } = config.saveThemeRevision(themeWith("#111111"))
    const { id: secondId } = config.saveThemeRevision(themeWith("#222222"))

    expect(firstId).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(secondId).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(firstId).not.toBe(secondId)

    const list = config.getThemeRevisions()
    expect(list).toHaveLength(2)
    // unshift newest → index 0 is the most recently saved.
    expect(list[0].theme.colorPrimary).toBe("#222222")
    expect(list[1].theme.colorPrimary).toBe("#111111")

    const byId = config.getThemeRevisionById(firstId)
    expect(byId).not.toBeNull()
    expect(byId!.id).toBe(firstId)
    expect(byId!.theme.colorPrimary).toBe("#111111")
    expect(typeof byId!.createdAt).toBe("string")
  })

  it("getThemeRevisionById returns null for an unknown id", async () => {
    const config = await loadConfig()

    config.saveThemeRevision(VALID_THEME)

    expect(config.getThemeRevisionById("does-not-exist")).toBeNull()
  })

  it("caps the ring at THEME_REVISIONS_MAX (oldest dropped)", async () => {
    const config = await loadConfig()

    // Save MAX + 3 revisions, each tagged with a distinct primary color.
    for (let i = 0; i < THEME_REVISIONS_MAX + 3; i++) {
      const hex = `#${i.toString(16).padStart(6, "0")}`
      config.saveThemeRevision(themeWith(hex))
    }

    const list = config.getThemeRevisions()
    expect(list).toHaveLength(THEME_REVISIONS_MAX)
    // Newest is the last saved; the 3 oldest were dropped.
    const newestHex = `#${(THEME_REVISIONS_MAX + 2)
      .toString(16)
      .padStart(6, "0")}`
    const oldestKeptHex = `#${(3).toString(16).padStart(6, "0")}`
    expect(list[0].theme.colorPrimary).toBe(newestHex)
    expect(list[list.length - 1].theme.colorPrimary).toBe(oldestKeptHex)
  })

  it("getThemeRevisions skips an invalid on-disk entry", async () => {
    const config = await loadConfig()

    config.saveThemeRevision(themeWith("#abcdef"))

    // Hand-write a file that mixes one valid + one broken entry.
    const valid = config.getThemeRevisions()[0]
    fs.writeFileSync(
      revisionsFile(),
      JSON.stringify([valid, { id: "x", createdAt: "now" }]),
    )

    const list = config.getThemeRevisions()
    expect(list).toHaveLength(1)
    expect(list[0].theme.colorPrimary).toBe("#abcdef")
  })

  it("tolerates a { revisions: [...] } wrapper shape", async () => {
    const config = await loadConfig()

    config.saveThemeRevision(themeWith("#0a0b0c"))
    const valid = config.getThemeRevisions()[0]
    fs.writeFileSync(
      revisionsFile(),
      JSON.stringify({ revisions: [valid] }),
    )

    const list = config.getThemeRevisions()
    expect(list).toHaveLength(1)
    expect(list[0].theme.colorPrimary).toBe("#0a0b0c")
  })
})

describe("setTheme snapshot trigger", () => {
  it("snapshots the CURRENT on-disk theme before overwrite (default snapshot=true)", async () => {
    const config = await loadConfig()

    // First save: nothing on disk yet → snapshots the DEFAULT_THEME.
    config.setTheme(themeWith("#aaaaaa"))
    // Second save: snapshots the just-written #aaaaaa theme before writing #bbbbbb.
    config.setTheme(themeWith("#bbbbbb"))

    expect(config.getTheme().colorPrimary).toBe("#bbbbbb")

    const list = config.getThemeRevisions()
    expect(list).toHaveLength(2)
    // Newest revision is the pre-overwrite #aaaaaa theme captured on the 2nd save.
    expect(list[0].theme.colorPrimary).toBe("#aaaaaa")
  })

  it("does NOT snapshot when called with { snapshot: false }", async () => {
    const config = await loadConfig()

    config.setTheme(themeWith("#cccccc"), { snapshot: false })

    expect(config.getTheme().colorPrimary).toBe("#cccccc")
    expect(config.getThemeRevisions()).toEqual([])
  })

  it("restore round-trip: setTheme(rev.theme) re-applies a captured revision and is itself undoable", async () => {
    const config = await loadConfig()

    // Establish an initial theme + capture a revision via a 2nd save.
    config.setTheme(themeWith("#d10000")) // snapshots DEFAULT
    config.setTheme(themeWith("#00d100")) // snapshots #d10000

    const revToRestore = config
      .getThemeRevisions()
      .find((r) => r.theme.colorPrimary === "#d10000")
    expect(revToRestore).toBeDefined()

    const beforeCount = config.getThemeRevisions().length

    // Restore: applies the captured theme AND snapshots the current (#00d100).
    const restored = config.setTheme(revToRestore!.theme, { snapshot: true })

    expect(restored.colorPrimary).toBe("#d10000")
    expect(config.getTheme().colorPrimary).toBe("#d10000")

    const after = config.getThemeRevisions()
    // The pre-restore #00d100 state is now a new revision (restore is undoable).
    expect(after.length).toBe(beforeCount + 1)
    expect(after[0].theme.colorPrimary).toBe("#00d100")
  })
})
