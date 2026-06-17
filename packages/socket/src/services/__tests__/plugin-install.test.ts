// Install + security integration test for the plugin pipeline (services/config.ts):
// build a ZIP of the first-party examples/plugins/config-editor/ files in-memory
// (JSZip), call importPluginZip(buf), then assert the install registers the
// plugin + lands the files on disk, AND that the PUBLIC asset resolver
// (resolvePluginAsset) serves ui.js + assets/** but NEVER plugin.json/server.js.
//
// Mirrors skeleton.test.ts: a fresh temp config dir per test driven through
// process.env.CONFIG_PATH, with vi.resetModules() so config.ts re-reads it, so
// the test never pollutes the real config directory.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"

type ConfigModule = typeof import("@razzoozle/socket/services/config")

const loadConfig = async (): Promise<ConfigModule> => {
  vi.resetModules()

  return import("@razzoozle/socket/services/config")
}

// Resolve examples/plugins/config-editor/ relative to this test file:
// .../packages/socket/src/services/__tests__/ -> repo source root.
const exampleDir = fileURLToPath(
  new URL("../../../../../examples/plugins/config-editor", import.meta.url),
)

// Build an install ZIP from the real example files on disk (plugin.json + ui.js
// + assets/**), keyed by their path relative to the example dir.
const buildExampleZip = async (): Promise<Buffer> => {
  const zip = new JSZip()

  const add = (abs: string): void => {
    for (const name of fs.readdirSync(abs)) {
      const child = path.join(abs, name)
      if (fs.statSync(child).isDirectory()) {
        add(child)

        continue
      }
      const rel = path.relative(exampleDir, child).split(path.sep).join("/")
      zip.file(rel, fs.readFileSync(child))
    }
  }

  add(exampleDir)

  return (await zip.generateAsync({ type: "nodebuffer" })) as Buffer
}

let tmpDir: string
let prevConfigPath: string | undefined

beforeEach(() => {
  prevConfigPath = process.env.CONFIG_PATH
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rahoot-plugin-test-"))
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

describe("config-editor example plugin install", () => {
  it("installs the example plugin and registers it (enabled)", async () => {
    const config = await loadConfig()

    const record = await config.importPluginZip(await buildExampleZip())

    // (a) importPluginZip returns the InstalledPlugin record.
    expect(record.id).toBe("config-editor")
    expect(record.name).toBe("Config Editor")
    expect(record.version).toBe("1.0.0")
    expect(record.enabled).toBe(true)
    expect(record.capabilities).toContain("CONFIG")

    // (b) config/plugins/index.json contains it, enabled.
    const installed = config.readPlugins()
    const mine = installed.find((p) => p.id === "config-editor")
    expect(mine).toBeDefined()
    expect(mine!.enabled).toBe(true)

    const indexFile = path.join(tmpDir, "plugins", "index.json")
    expect(fs.existsSync(indexFile)).toBe(true)
    expect(fs.readFileSync(indexFile, "utf-8")).toContain("config-editor")
  })

  it("extracts ui.js + plugin.json to config/plugins/config-editor/", async () => {
    const config = await loadConfig()
    await config.importPluginZip(await buildExampleZip())

    // (c) the extracted files exist on disk.
    const pluginRoot = path.join(tmpDir, "plugins", "config-editor")
    expect(fs.existsSync(path.join(pluginRoot, "ui.js"))).toBe(true)
    expect(fs.existsSync(path.join(pluginRoot, "plugin.json"))).toBe(true)
    expect(fs.existsSync(path.join(pluginRoot, "assets", "styles.css"))).toBe(
      true,
    )
  })

  it("PUBLIC resolver serves ui.js + assets but DENIES plugin.json/server.js", async () => {
    const config = await loadConfig()
    await config.importPluginZip(await buildExampleZip())

    // (d) the security guarantee on the unauthenticated /plugins/:id/:path route.
    const ui = config.resolvePluginAsset("config-editor", "ui.js")
    expect(ui).not.toBeNull()
    expect(ui!.contentType).toContain("text/javascript")
    expect(ui!.buffer.toString("utf-8")).toContain("registerTab")

    const asset = config.resolvePluginAsset("config-editor", "assets/styles.css")
    expect(asset).not.toBeNull()
    expect(asset!.contentType).toContain("text/css")

    // The manifest must NEVER be served on the public route…
    expect(config.resolvePluginAsset("config-editor", "plugin.json")).toBeNull()
    // …nor a server hook (even if one were present on disk).
    fs.writeFileSync(
      path.join(tmpDir, "plugins", "config-editor", "server.js"),
      "module.exports = {}",
    )
    expect(config.resolvePluginAsset("config-editor", "server.js")).toBeNull()
  })
})
