// Pre-install (seed) integration test for the plugin pipeline (services/config.ts):
// on a fresh config volume, initConfig() should copy the first-party
// examples/plugins/config-editor/ bundle into config/plugins/config-editor/ and
// register it (enabled) in config/plugins/index.json — so it shows up in the
// manager Plugins tab out of the box, with no ZIP import.
//
// Mirrors plugin-install.test.ts: a fresh temp config dir per test driven through
// process.env.CONFIG_PATH, with vi.resetModules() so config.ts re-reads it, so
// the test never pollutes the real config directory. The example bundle is
// located deterministically (no cwd dependency) via the PLUGIN_EXAMPLES_PATH
// override, pointed either at the real repo bundle or at an in-test fixture.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"

type ConfigModule = typeof import("@razzoozle/socket/services/config")

const loadConfig = async (): Promise<ConfigModule> => {
  vi.resetModules()

  return import("@razzoozle/socket/services/config")
}

// The real first-party example bundle, relative to this test file:
// .../packages/socket/src/services/__tests__/ -> repo source root.
const realExampleDir = fileURLToPath(
  new URL("../../../../../examples/plugins/config-editor", import.meta.url),
)

let tmpDir: string
let prevConfigPath: string | undefined
let prevExamplesPath: string | undefined

beforeEach(() => {
  prevConfigPath = process.env.CONFIG_PATH
  prevExamplesPath = process.env.PLUGIN_EXAMPLES_PATH
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rahoot-plugin-seed-"))
  process.env.CONFIG_PATH = tmpDir
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  const restore = (key: string, prev: string | undefined): void => {
    if (prev === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = prev
    }
  }
  restore("CONFIG_PATH", prevConfigPath)
  restore("PLUGIN_EXAMPLES_PATH", prevExamplesPath)
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("config-editor example plugin seeding (initConfig)", () => {
  it("seeds the example plugin (enabled) + extracts ui.js on a fresh config", async () => {
    process.env.PLUGIN_EXAMPLES_PATH = realExampleDir

    const config = await loadConfig()
    config.initConfig()

    // (a) readPlugins() contains config-editor, enabled.
    const installed = config.readPlugins()
    const mine = installed.find((p) => p.id === "config-editor")
    expect(mine).toBeDefined()
    expect(mine!.name).toBe("Config Editor")
    expect(mine!.version).toBe("1.0.0")
    expect(mine!.enabled).toBe(true)
    expect(mine!.capabilities).toContain("MANAGER_TAB")
    expect(mine!.capabilities).toContain("CONFIG")

    // (b) the bundle files landed on disk under config/plugins/config-editor/.
    const pluginRoot = path.join(tmpDir, "plugins", "config-editor")
    expect(fs.existsSync(path.join(pluginRoot, "ui.js"))).toBe(true)
    expect(fs.existsSync(path.join(pluginRoot, "plugin.json"))).toBe(true)
    expect(fs.existsSync(path.join(pluginRoot, "assets", "styles.css"))).toBe(
      true,
    )

    // (c) index.json on disk references it.
    const indexFile = path.join(tmpDir, "plugins", "index.json")
    expect(fs.readFileSync(indexFile, "utf-8")).toContain("config-editor")
  })

  it("works with a fixture example bundle present (no real repo dependency)", async () => {
    // Build a minimal fixture bundle in a temp dir and point the resolver at it.
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-fixture-"))
    fs.writeFileSync(
      path.join(fixture, "plugin.json"),
      JSON.stringify({
        formatVersion: 1,
        id: "config-editor",
        version: "1.0.0",
        name: "Config Editor",
        capabilities: ["MANAGER_TAB", "CONFIG"],
        tab: { nameKey: "Config Editor", icon: "Settings", gated: "always" },
        hooks: { client: "ui.js" },
        config: {},
        sandbox: "none",
      }),
    )
    fs.writeFileSync(
      path.join(fixture, "ui.js"),
      "window.razzoozle && window.razzoozle.registerTab({})",
    )
    fs.mkdirSync(path.join(fixture, "assets"))
    fs.writeFileSync(path.join(fixture, "assets", "styles.css"), ".x{}")

    process.env.PLUGIN_EXAMPLES_PATH = fixture

    try {
      const config = await loadConfig()
      config.initConfig()

      expect(config.readPlugins().some((p) => p.id === "config-editor")).toBe(
        true,
      )
      const pluginRoot = path.join(tmpDir, "plugins", "config-editor")
      expect(fs.existsSync(path.join(pluginRoot, "ui.js"))).toBe(true)
      expect(
        fs.existsSync(path.join(pluginRoot, "assets", "styles.css")),
      ).toBe(true)
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true })
    }
  })

  it("is idempotent: re-running initConfig never duplicates or clobbers", async () => {
    process.env.PLUGIN_EXAMPLES_PATH = realExampleDir

    const config = await loadConfig()
    config.initConfig()

    // A manager edits the seeded ui.js after install.
    const uiPath = path.join(tmpDir, "plugins", "config-editor", "ui.js")
    fs.writeFileSync(uiPath, "// edited by manager")

    // Re-run init (e.g. server reboot): the existing install must be untouched.
    config.initConfig()

    expect(fs.readFileSync(uiPath, "utf-8")).toBe("// edited by manager")
    const matches = config
      .readPlugins()
      .filter((p) => p.id === "config-editor")
    expect(matches).toHaveLength(1)
  })

  it("skips silently when no example bundle exists (no crash)", async () => {
    // Point the override at a non-existent dir; the other candidates
    // (cwd-relative, /app/...) also won't resolve under the temp config root.
    process.env.PLUGIN_EXAMPLES_PATH = path.join(tmpDir, "does-not-exist")

    const config = await loadConfig()
    // Must not throw.
    expect(() => config.initConfig()).not.toThrow()
  })
})
