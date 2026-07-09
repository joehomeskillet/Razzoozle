// Tests for the quiz-archive toggle + catalog (question bank) storage layer in
// services/config.ts. Mirrors services/__tests__/config.test.ts: config.ts
// captures CONFIG_PATH ONCE at import time, so each test sets a fresh tmp dir in
// beforeEach then vi.resetModules() + dynamic import() so the module re-reads it.

import type { Question } from "@razzoozle/common/types/game"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"

type ConfigModule = typeof import("@razzoozle/socket/services/config")

let tmpDir: string
let prevConfigPath: string | undefined
let config: ConfigModule

const loadConfig = async (): Promise<void> => {
  vi.resetModules()
  config = await import("@razzoozle/socket/services/config")
}

// A valid choice question (passes questionValidator.superRefine). Typed as the
// validated Question shape so it can be passed straight into saveCatalogEntry.
const validQuestion = (overrides: Record<string, unknown> = {}): Question => ({
  question: "What is the capital of France?",
  type: "choice",
  answers: ["Paris", "London", "Berlin", "Madrid"],
  solutions: [0],
  cooldown: 5,
  time: 20,
  ...overrides,
})

beforeEach(async () => {
  prevConfigPath = process.env.CONFIG_PATH
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rahoot-catalog-test-"))
  process.env.CONFIG_PATH = tmpDir

  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})

  await loadConfig()
  config.initConfig()
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

// ── Quiz archive ─────────────────────────────────────────────────────────────

describe("setQuizzArchived + getQuizzMeta", () => {
  it("initConfig creates the catalog dir", () => {
    expect(fs.existsSync(path.join(tmpDir, "catalog"))).toBe(true)
  })

  it("getQuizzMeta reflects archived=false + questionCount for a fresh quiz", () => {
    const meta = config.getQuizzMeta().find((m) => m.id === "example")
    expect(meta).toBeTruthy()
    expect(meta!.archived).toBe(false)
    // EXAMPLE_QUIZZ ships with 4 questions.
    expect(meta!.questionCount).toBe(4)
  })

  it("flips the archived flag on disk and getQuizzMeta reflects it", () => {
    config.setQuizzArchived("example", true)

    const onDisk = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "quizz", "example.json"), "utf-8"),
    )
    expect(onDisk.archived).toBe(true)

    const meta = config.getQuizzMeta().find((m) => m.id === "example")
    expect(meta!.archived).toBe(true)
    // questionCount is unaffected by archiving.
    expect(meta!.questionCount).toBe(4)

    // Toggle back off.
    config.setQuizzArchived("example", false)
    expect(config.getQuizzMeta().find((m) => m.id === "example")!.archived).toBe(
      false,
    )
  })

  it("throws on an unknown quiz id", () => {
    expect(() => config.setQuizzArchived("does-not-exist", true)).toThrow()
  })

  it("rejects a path-traversal id before touching the filesystem", () => {
    expect(() => config.setQuizzArchived("../evil", true)).toThrow("Invalid id")
  })
})

// ── Catalog CRUD ─────────────────────────────────────────────────────────────

describe("catalog CRUD round-trip", () => {
  it("saveCatalogEntry → getCatalog round-trip (id slug, source default, addedAt)", async () => {
    const entry = await config.saveCatalogEntry({ question: validQuestion() })

    expect(entry.id).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(entry.source).toBe("manual")
    expect(typeof entry.addedAt).toBe("string")
    expect(entry.question.question).toBe("What is the capital of France?")

    const list = config.getCatalog()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(entry.id)
    expect(list[0].question.question).toBe("What is the capital of France?")

    // The file lives inside catalog/ under the entry id.
    const onDisk = fs.readdirSync(path.join(tmpDir, "catalog"))
    expect(onDisk).toEqual([`${entry.id}.json`])
  })

  it("honours an explicit source (e.g. approve-to-catalog)", async () => {
    const entry = await config.saveCatalogEntry({
      question: validQuestion(),
      source: "submission",
    })
    expect(entry.source).toBe("submission")
  })

  it("always yields distinct ids for repeated saves (normalizeFilename adds a random id)", async () => {
    const a = await config.saveCatalogEntry({ question: validQuestion() })
    const b = await config.saveCatalogEntry({ question: validQuestion() })
    const c = await config.saveCatalogEntry({ question: validQuestion() })

    expect(new Set([a.id, b.id, c.id]).size).toBe(3)
    expect(config.getCatalog()).toHaveLength(3)
  })

  it("dedupes with a -2/-3 suffix when the derived id collides", async () => {
    // normalizeFilename normally appends a random nanoid so two saves never
    // collide; to exercise the collision-dedupe path we pin it to a constant
    // slug, then re-import config so it binds to the mocked util.
    vi.resetModules()
    vi.doMock("@razzoozle/socket/utils/game", async () => {
      const actual = await vi.importActual<
        typeof import("@razzoozle/socket/utils/game")
      >("@razzoozle/socket/utils/game")

      return { ...actual, normalizeFilename: () => "fixed-slug" }
    })

    const cfg = await import("@razzoozle/socket/services/config")
    cfg.initConfig()

    const a = await cfg.saveCatalogEntry({ question: validQuestion() })
    const b = await cfg.saveCatalogEntry({ question: validQuestion() })
    const c = await cfg.saveCatalogEntry({ question: validQuestion() })

    expect(a.id).toBe("fixed-slug")
    expect(b.id).toBe("fixed-slug-2")
    expect(c.id).toBe("fixed-slug-3")
    expect(cfg.getCatalog()).toHaveLength(3)

    vi.doUnmock("@razzoozle/socket/utils/game")
  })

  it("rejects an invalid question via catalogAddValidator (superRefine)", () => {
    // A 'choice' with a valid answers array but NO solution fails superRefine.
    expect(() =>
      config.saveCatalogEntry({
        question: validQuestion({ solutions: undefined }),
      }),
    ).toThrow()
    expect(config.getCatalog()).toHaveLength(0)
  })

  it("updateCatalogEntry replaces the question + preserves id/addedAt", async () => {
    const entry = await config.saveCatalogEntry({ question: validQuestion() })
    const updated = await config.updateCatalogEntry(entry.id, {
      question: validQuestion({ question: "What is the capital of Spain?" }),
      tags: ["geo"],
    })

    expect(updated.id).toBe(entry.id)
    expect(updated.addedAt).toBe(entry.addedAt)
    expect(updated.question.question).toBe("What is the capital of Spain?")
    expect(updated.tags).toEqual(["geo"])

    expect(config.getCatalogById(entry.id)!.question.question).toBe(
      "What is the capital of Spain?",
    )
  })

  it("updateCatalogEntry throws on a missing id", () => {
    expect(() =>
      config.updateCatalogEntry("nope", { question: validQuestion() }),
    ).toThrow("errors:catalog.notFound")
  })

  it("deleteCatalogEntry removes the file", async () => {
    const entry = await config.saveCatalogEntry({ question: validQuestion() })
    expect(config.getCatalog()).toHaveLength(1)

    await config.deleteCatalogEntry(entry.id)
    expect(config.getCatalog()).toHaveLength(0)
    expect(config.getCatalogById(entry.id)).toBeNull()
  })

  it("deleteCatalogEntry throws on a missing id", () => {
    expect(() => config.deleteCatalogEntry("nope")).toThrow(
      "errors:catalog.notFound",
    )
  })

  it("getCatalog skips an invalid on-disk file (like getSubmissions)", () => {
    config.saveCatalogEntry({ question: validQuestion() })

    // Plant a malformed catalog file.
    fs.writeFileSync(
      path.join(tmpDir, "catalog", "broken.json"),
      JSON.stringify({ not: "a catalog entry" }),
    )

    const list = config.getCatalog()
    expect(list).toHaveLength(1)
    expect(list[0].question.question).toBe("What is the capital of France?")
  })

  it("assertSafeId guards every catalog path interpolation", () => {
    expect(() => config.getCatalogById("../evil")).toThrow("Invalid id")
    expect(() =>
      config.updateCatalogEntry("../evil", { question: validQuestion() }),
    ).toThrow("Invalid id")
    expect(() => config.deleteCatalogEntry("../evil")).toThrow("Invalid id")

    // Nothing escaped the catalog dir.
    expect(fs.existsSync(path.join(tmpDir, "evil.json"))).toBe(false)
  })
})
