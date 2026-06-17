// Characterization tests for services/config.ts — the on-disk config/theme/result
// persistence layer. These assert the module's ACTUAL current behaviour against a
// real temp config directory driven through `process.env.CONFIG_PATH`.
//
// IMPORTANT module-loading note: config.ts captures the config root ONCE at import
// time (`const inContainerPath = process.env.CONFIG_PATH`). To point each test at
// its own fresh temp dir we set the env var in beforeEach, then `vi.resetModules()`
// + a dynamic `import()` so the module re-reads CONFIG_PATH. Every test gets an
// isolated tmp tree that is removed in afterEach.

import { THEME_SLOTS } from "@razzoozle/common/constants"
import { DEFAULT_THEME } from "@razzoozle/common/types/theme"
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

// Minimal valid 1x1 PNG as a base64 data URL — a real, cwebp-decodable payload.
const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC"

// A theme object that satisfies themeValidator (every required field present).
const VALID_THEME = {
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
  },
}

beforeEach(() => {
  prevConfigPath = process.env.CONFIG_PATH
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rahoot-config-test-"))
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

describe("getGameConfig()", () => {
  it("back-fills defaults for a bare { managerPassword } config", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "game.json"),
      JSON.stringify({ managerPassword: "SECRET" }),
    )

    const config = await loadConfig()
    const cfg = config.getGameConfig()

    // The provided field is preserved verbatim.
    expect(cfg.managerPassword).toBe("SECRET")
    // The whole lowLatencyMode block is back-filled from the validator defaults.
    expect(cfg.lowLatencyMode).toEqual({
      enabled: false,
      clockSync: true,
      preloadNextQuestion: true,
      answerAck: true,
      scoreboardBroadcastThrottleMs: 100,
      maxLatencyCompensationMs: 150,
    })
  })

  it("falls back to validator defaults on a malformed game.json (does not throw)", async () => {
    // Invalid JSON — JSON.parse throws, caught, then `validator.parse({})` runs.
    fs.writeFileSync(path.join(tmpDir, "game.json"), "{ not valid json ]]]")

    const config = await loadConfig()

    let cfg: ReturnType<ConfigModule["getGameConfig"]> | undefined
    expect(() => {
      cfg = config.getGameConfig()
    }).not.toThrow()

    // Default managerPassword + full default lowLatencyMode block.
    expect(cfg?.managerPassword).toBe("PASSWORD")
    expect(cfg?.lowLatencyMode.enabled).toBe(false)
    expect(cfg?.lowLatencyMode.maxLatencyCompensationMs).toBe(150)
  })

  it("falls back to defaults when game.json is valid JSON but the wrong shape", async () => {
    // ManagerPassword has the wrong type ⇒ safeParse fails ⇒ default fallback.
    fs.writeFileSync(
      path.join(tmpDir, "game.json"),
      JSON.stringify({ managerPassword: 12345 }),
    )

    const config = await loadConfig()
    const cfg = config.getGameConfig()

    // Note: the bad value is discarded; the schema default ("PASSWORD") wins.
    expect(cfg.managerPassword).toBe("PASSWORD")
    expect(cfg.lowLatencyMode.enabled).toBe(false)
  })

  it("throws when game.json does not exist", async () => {
    const config = await loadConfig()

    expect(() => config.getGameConfig()).toThrow("Game config not found")
  })
})

describe("saveBackgroundImage()", () => {
  it("rejects a non-image dataUrl with errors:theme.invalidImage", async () => {
    const config = await loadConfig()

    await expect(
      config.saveBackgroundImage("auth", "data:text/plain;base64,aGVsbG8="),
    ).rejects.toThrow("errors:theme.invalidImage")
  })

  it("rejects an outright non-dataUrl string", async () => {
    const config = await loadConfig()

    await expect(
      config.saveBackgroundImage("auth", "not-a-data-url"),
    ).rejects.toThrow("errors:theme.invalidImage")
  })

  it("rejects an unknown slot with errors:theme.invalidSlot", async () => {
    const config = await loadConfig()

    await expect(
      // @ts-expect-error — exercising the runtime slot guard with a bad slot.
      config.saveBackgroundImage("nope", PNG_1PX),
    ).rejects.toThrow("errors:theme.invalidSlot")
  })

  it("rejects a payload over the 8MB cap with errors:theme.imageTooLarge", async () => {
    const config = await loadConfig()

    // > 8MB of decoded bytes. base64 inflates ~4/3, so build the base64 directly.
    const bytes = 8 * 1024 * 1024 + 1
    const bigBase64 = Buffer.alloc(bytes, 0).toString("base64")
    const bigDataUrl = `data:image/png;base64,${bigBase64}`

    await expect(config.saveBackgroundImage("auth", bigDataUrl)).rejects.toThrow(
      "errors:theme.imageTooLarge",
    )
  })

  it("persists a valid image and returns its /theme/<file> path", async () => {
    const config = await loadConfig()

    const result = await config.saveBackgroundImage("auth", PNG_1PX)

    expect(result).toMatch(/^\/media\/backgrounds\/auth-\d+\.webp$/)
    const onDisk = path.join(tmpDir, result.replace(/^\//, ""))
    expect(fs.existsSync(onDisk)).toBe(true)
  })

  it("removes the prior file for the same slot on re-upload", async () => {
    const config = await loadConfig()
    const themeDir = path.join(tmpDir, "media", "backgrounds")

    const first = await config.saveBackgroundImage("auth", PNG_1PX)
    const firstAbs = path.join(tmpDir, first.replace(/^\//, ""))
    expect(fs.existsSync(firstAbs)).toBe(true)

    // Force Date.now() forward so the second filename differs from the first.
    // A Date.now spy (not fake timers) is used because toWebp spawns a real
    // cwebp child process whose close event would never fire under fake timers.
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5_000)
    const second = await config.saveBackgroundImage("auth", PNG_1PX)
    dateSpy.mockRestore()

    expect(second).not.toBe(first)
    // The previous "auth-*" file is gone; only the new one remains for the slot.
    const authFiles = fs
      .readdirSync(themeDir)
      .filter((f) => f.startsWith("auth-"))
    expect(authFiles).toHaveLength(1)
    expect(fs.existsSync(firstAbs)).toBe(false)
  })

  it("does not touch a DIFFERENT slot's file when re-uploading", async () => {
    const config = await loadConfig()
    const themeDir = path.join(tmpDir, "media", "backgrounds")

    await config.saveBackgroundImage("auth", PNG_1PX)
    await config.saveBackgroundImage("managerGame", PNG_1PX)

    // Re-upload auth; managerGame must survive. A Date.now spy (not fake timers)
    // is used because toWebp spawns a real cwebp child process whose close event
    // would never fire under fake timers.
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5_000)
    await config.saveBackgroundImage("auth", PNG_1PX)
    dateSpy.mockRestore()

    const files = fs.readdirSync(themeDir)
    expect(files.filter((f) => f.startsWith("auth-"))).toHaveLength(1)
    expect(files.filter((f) => f.startsWith("managerGame-"))).toHaveLength(1)
  })

  it("accepts every real THEME_SLOT", async () => {
    const config = await loadConfig()

    for (const slot of THEME_SLOTS) {
      const out = await config.saveBackgroundImage(slot, PNG_1PX)
      expect(out).toMatch(
        new RegExp(`^/media/backgrounds/${slot}-\\d+\\.webp$`),
      )
    }
  })
})

describe("setTheme() / getTheme() round-trip", () => {
  it("returns DEFAULT_THEME when no theme file exists", async () => {
    const config = await loadConfig()

    expect(config.getTheme()).toEqual(DEFAULT_THEME)
  })

  it("round-trips a valid theme through themeValidator", async () => {
    const config = await loadConfig()

    const saved = config.setTheme(VALID_THEME)
    // SetTheme returns the parsed/validated theme.
    expect(saved.colorPrimary).toBe("#ff9900")

    const loaded = config.getTheme()
    expect(loaded).toEqual(saved)
    expect(loaded).toEqual(VALID_THEME)
  })

  it("throws on an invalid theme payload (bad hex color)", async () => {
    const config = await loadConfig()

    expect(() =>
      config.setTheme({ ...VALID_THEME, colorPrimary: "not-a-color" }),
    ).toThrow("errors:theme.invalidColor")
  })

  it("getTheme() falls back to DEFAULT_THEME on a malformed theme.json", async () => {
    const config = await loadConfig()
    const themeDir = path.join(tmpDir, "theme")
    fs.mkdirSync(themeDir)
    fs.writeFileSync(path.join(themeDir, "theme.json"), "{{ broken")

    expect(config.getTheme()).toEqual(DEFAULT_THEME)
  })

  it("getTheme() falls back to DEFAULT_THEME when theme.json is valid JSON but wrong shape", async () => {
    const config = await loadConfig()
    const themeDir = path.join(tmpDir, "theme")
    fs.mkdirSync(themeDir)
    fs.writeFileSync(
      path.join(themeDir, "theme.json"),
      JSON.stringify({ colorPrimary: "#fff" }), // Missing required fields
    )

    expect(config.getTheme()).toEqual(DEFAULT_THEME)
  })
})

describe("getResultById() — gameResultValidator path", () => {
  const VALID_RESULT = {
    id: "abc",
    subject: "Sample Quiz",
    date: "2026-06-04T00:00:00.000Z",
    players: [{ username: "alice", points: 100, rank: 1 }],
    questions: [{ anything: true }],
  }

  const writeResult = (id: string, contents: string) => {
    const resultsDir = path.join(tmpDir, "results")
    fs.mkdirSync(resultsDir, { recursive: true })
    fs.writeFileSync(path.join(resultsDir, `${id}.json`), contents)
  }

  it("returns the validated result for a well-formed file", async () => {
    const config = await loadConfig()
    writeResult("abc", JSON.stringify(VALID_RESULT))

    const result = config.getResultById("abc")
    expect(result.id).toBe("abc")
    expect(result.subject).toBe("Sample Quiz")
    expect(result.players).toHaveLength(1)
  })

  it("throws 'not found' when the result file does not exist", async () => {
    const config = await loadConfig()

    expect(() => config.getResultById("missing")).toThrow(
      'Result "missing" not found',
    )
  })

  it("throws 'not found' on a corrupt (invalid JSON) result file", async () => {
    const config = await loadConfig()
    writeResult("corrupt", "{ this is : not json ]")

    // JSON.parse throws inside getResultById; it is NOT caught there, so the
    // raw SyntaxError propagates — characterize that ACTUAL behaviour.
    // (Bug note: unlike getGameConfig/getTheme, getResultById does not wrap
    // JSON.parse in try/catch, so a corrupt-JSON file surfaces a SyntaxError
    // rather than the friendly 'not found'. See notes.)
    expect(() => config.getResultById("corrupt")).toThrow()
  })

  it("throws 'not found' on a schema-invalid (wrong shape) result file", async () => {
    const config = await loadConfig()
    // Valid JSON, but players entries are missing required fields ⇒ safeParse
    // fails ⇒ treated as not found.
    writeResult(
      "badshape",
      JSON.stringify({
        id: "badshape",
        subject: "x",
        date: "2026-06-04",
        players: [{ username: "a" }], // Missing points + rank
        questions: [],
      }),
    )

    expect(() => config.getResultById("badshape")).toThrow(
      'Result "badshape" not found',
    )
  })
})

describe("path-traversal guard (assertSafeId)", () => {
  // Defense-in-depth: ids come straight from a socket client. resolve() would
  // normalize "../" segments and let a crafted id read/delete arbitrary .json
  // files (e.g. "../game" leaks managerPassword). The guard rejects anything
  // outside the safe [A-Za-z0-9_-] charset BEFORE it touches the filesystem.

  const writeResult = (id: string, contents: string) => {
    const resultsDir = path.join(tmpDir, "results")
    fs.mkdirSync(resultsDir, { recursive: true })
    fs.writeFileSync(path.join(resultsDir, `${id}.json`), contents)
  }

  const writeQuizz = (id: string, contents: string) => {
    const quizzDir = path.join(tmpDir, "quizz")
    fs.mkdirSync(quizzDir, { recursive: true })
    fs.writeFileSync(path.join(quizzDir, `${id}.json`), contents)
  }

  it("getResultById('../game') is rejected (cannot escape to game.json)", async () => {
    const config = await loadConfig()
    // Seed a game.json next to the results dir to prove it is NOT reachable.
    fs.writeFileSync(
      path.join(tmpDir, "game.json"),
      JSON.stringify({ managerPassword: "SECRET" }),
    )

    expect(() => config.getResultById("../game")).toThrow("Invalid id")
  })

  it("getResultById('../../etc/passwd') is rejected", async () => {
    const config = await loadConfig()

    expect(() => config.getResultById("../../etc/passwd")).toThrow("Invalid id")
  })

  it("getQuizzById('../foo') is rejected", async () => {
    const config = await loadConfig()

    expect(() => config.getQuizzById("../foo")).toThrow("Invalid id")
  })

  it("deleteResult('a/b') is rejected (no path separators allowed)", async () => {
    const config = await loadConfig()

    expect(() => config.deleteResult("a/b")).toThrow("Invalid id")
  })

  it("deleteQuizz('../foo') is rejected", async () => {
    const config = await loadConfig()

    expect(() => config.deleteQuizz("../foo")).toThrow("Invalid id")
  })

  it("updateQuizz('../foo', data) is rejected before any write", async () => {
    const config = await loadConfig()

    expect(() => config.updateQuizz("../foo", {})).toThrow("Invalid id")
  })

  it("a normal uuid-like id still works on an existing result fixture", async () => {
    const config = await loadConfig()
    const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
    writeResult(
      id,
      JSON.stringify({
        id,
        subject: "Sample Quiz",
        date: "2026-06-04T00:00:00.000Z",
        players: [{ username: "alice", points: 100, rank: 1 }],
        questions: [{ anything: true }],
      }),
    )

    const result = config.getResultById(id)
    expect(result.id).toBe(id)
    expect(result.subject).toBe("Sample Quiz")
  })

  it("a normal slug id still works on an existing quizz fixture", async () => {
    const config = await loadConfig()
    const id = "example"
    writeQuizz(
      id,
      JSON.stringify({
        subject: "Example",
        questions: [
          {
            question: "Q?",
            answers: ["a", "b"],
            solutions: [0],
            time: 10,
            cooldown: 5,
          },
        ],
      }),
    )

    const quizz = config.getQuizzById(id)
    expect(quizz.id).toBe(id)
  })
})
