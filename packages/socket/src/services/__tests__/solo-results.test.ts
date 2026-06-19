// Characterization tests for the solo-play leaderboard layer in services/config.ts
// (getSoloResults + appendSoloResult). These assert the module's ACTUAL current
// behaviour against a real temp config directory driven through `process.env.CONFIG_PATH`.
//
// IMPORTANT module-loading note: config.ts captures the config root ONCE at import
// time (`const inContainerPath = process.env.CONFIG_PATH`). To point each test at
// its own fresh temp dir we set the env var in beforeEach, then `vi.resetModules()`
// + a dynamic `import()` so the module re-reads CONFIG_PATH. Every test gets an
// isolated tmp tree that is removed in afterEach.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

// The module-under-test, re-imported per test against the fresh CONFIG_PATH.
type ConfigModule = typeof import("@razzoozle/socket/services/config")

let tmpDir: string
let prevConfigPath: string | undefined

// (Re)load config.ts so it captures the current process.env.CONFIG_PATH.
const loadConfig = async (): Promise<ConfigModule> => {
  vi.resetModules()

  return import("@razzoozle/socket/services/config")
}

// Write a solo-results file directly to disk for the given quiz id.
const writeSoloResults = (id: string, contents: string) => {
  const dir = path.join(tmpDir, "solo-results")
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${id}.json`), contents)
}

const makeEntry = (overrides: Record<string, unknown> = {}) => ({
  playerName: "alice",
  score: 100,
  answeredAt: "2026-06-04T00:00:00.000Z",
  ...overrides,
})

beforeEach(() => {
  prevConfigPath = process.env.CONFIG_PATH
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rahoot-solo-test-"))
  process.env.CONFIG_PATH = tmpDir
  // Silence the module's diagnostic warn/error logs on the malformed-file paths.
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

describe("getSoloResults()", () => {
  it("returns [] when the solo-results file does not exist", async () => {
    const config = await loadConfig()

    expect(config.getSoloResults("quiz-1")).toEqual([])
  })

  it("returns [] when the file is valid JSON but not an array", async () => {
    const config = await loadConfig()
    writeSoloResults("quiz-1", JSON.stringify({ playerName: "alice" }))

    expect(config.getSoloResults("quiz-1")).toEqual([])
  })

  it("filters out a bad-shaped entry while keeping the well-formed ones", async () => {
    const config = await loadConfig()
    writeSoloResults(
      "quiz-1",
      JSON.stringify([
        makeEntry({ playerName: "alice", score: 100 }),
        // score is the wrong type ⇒ filtered out by flatMap guard.
        makeEntry({ playerName: "mallory", score: "high" }),
        makeEntry({ playerName: "bob", score: 50 }),
      ]),
    )

    const results = config.getSoloResults("quiz-1")
    expect(results).toHaveLength(2)
    expect(results.map((r) => r.playerName)).toEqual(["alice", "bob"])
  })

  it("returns [] on malformed JSON without throwing", async () => {
    const config = await loadConfig()
    writeSoloResults("quiz-1", "{ not valid json ]]]")

    let results: ReturnType<ConfigModule["getSoloResults"]> | undefined
    expect(() => {
      results = config.getSoloResults("quiz-1")
    }).not.toThrow()
    expect(results).toEqual([])
  })
})

describe("appendSoloResult()", () => {
  it("round-trips a single entry (creates dir + file on a fresh volume)", async () => {
    const config = await loadConfig()

    const entry = makeEntry({ playerName: "alice", score: 100 })
    config.appendSoloResult("quiz-1", entry)

    const results = config.getSoloResults("quiz-1")
    expect(results).toEqual([entry])

    // The solo-results dir/file were created under the temp config root.
    const onDisk = path.join(tmpDir, "solo-results", "quiz-1.json")
    expect(fs.existsSync(onDisk)).toBe(true)
  })

  it("caps to SOLO_RESULTS_MAX_ENTRIES=1000, retaining the NEWEST (WAVE-A)", async () => {
    const config = await loadConfig()

    for (let i = 0; i < 1001; i++) {
      config.appendSoloResult(
        "quiz-1",
        makeEntry({ playerName: `player-${i}`, score: i }),
      )
    }

    const results = config.getSoloResults("quiz-1")
    expect(results).toHaveLength(1000)
    // The oldest (player-0) was dropped; the slice(-1000) keeps 1..1000.
    expect(results[0].playerName).toBe("player-1")
    expect(results[results.length - 1].playerName).toBe("player-1000")
  })
})
