// Tests for the theme-template (#28) persistence layer in services/config.ts and
// the apply-on-create emit in services/game. The CRUD half mirrors the
// catalog/config test style: a fresh temp config dir per test driven through
// process.env.CONFIG_PATH, with vi.resetModules() so config.ts re-reads it.
//
// The apply-on-create half builds a real Game with a quiz carrying a themeId and
// a matching on-disk template, then asserts MANAGER.THEME is emitted to the game
// room with the template's theme (and that a quiz without a themeId emits none).

import { EVENTS } from "@razzoozle/common/constants"
import type { Quizz } from "@razzoozle/common/types/game"
import { DEFAULT_THEME, type Theme } from "@razzoozle/common/types/theme"
import type { Server, Socket } from "@razzoozle/common/types/game/socket"
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
  },
}

beforeEach(() => {
  prevConfigPath = process.env.CONFIG_PATH
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rahoot-theme-tpl-test-"))
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

describe("theme-template CRUD round-trip", () => {
  it("saveThemeTemplate → getThemeTemplates / getThemeTemplateById", async () => {
    const config = await loadConfig()

    expect(config.getThemeTemplates()).toHaveLength(0)

    const { id } = config.saveThemeTemplate({
      name: "Sommer Theme",
      theme: VALID_THEME,
    })

    // id is a safe slug derived from the name.
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/)

    const list = config.getThemeTemplates()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(id)
    expect(list[0].name).toBe("Sommer Theme")
    expect(list[0].theme.colorPrimary).toBe("#ff9900")

    const byId = config.getThemeTemplateById(id)
    expect(byId).not.toBeNull()
    expect(byId!.id).toBe(id)
    expect(byId!.theme.accentColor).toBe("#ff9900")
  })

  it("saving twice under the same name overwrites (one file, stable id)", async () => {
    const config = await loadConfig()

    const first = config.saveThemeTemplate({
      name: "Sommer Theme",
      theme: VALID_THEME,
    })

    const second = config.saveThemeTemplate({
      name: "Sommer Theme",
      theme: { ...VALID_THEME, colorPrimary: "#00ff00" },
    })

    // Same display name → reuse the existing id (overwrite in place).
    expect(second.id).toBe(first.id)

    const list = config.getThemeTemplates()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(first.id)
    // The overwrite carried the new theme through.
    expect(list[0].theme.colorPrimary).toBe("#00ff00")

    // Only one file landed on disk.
    const files = fs
      .readdirSync(path.join(tmpDir, "theme-templates"))
      .filter((f) => f.endsWith(".json"))
    expect(files).toHaveLength(1)
  })

  it("getThemeTemplatesMeta returns only {id,name}", async () => {
    const config = await loadConfig()

    const { id } = config.saveThemeTemplate({
      name: "Winter",
      theme: VALID_THEME,
    })

    const meta = config.getThemeTemplatesMeta()
    expect(meta).toEqual([{ id, name: "Winter" }])
  })

  it("getThemeTemplateById returns null for an unknown id", async () => {
    const config = await loadConfig()

    expect(config.getThemeTemplateById("does-not-exist")).toBeNull()
  })

  it("deleteThemeTemplate removes the file", async () => {
    const config = await loadConfig()

    const { id } = config.saveThemeTemplate({
      name: "Throwaway",
      theme: VALID_THEME,
    })

    expect(config.getThemeTemplates()).toHaveLength(1)

    config.deleteThemeTemplate(id)

    expect(config.getThemeTemplates()).toHaveLength(0)
    expect(config.getThemeTemplateById(id)).toBeNull()
  })

  it("deleteThemeTemplate throws on a missing id", async () => {
    const config = await loadConfig()

    expect(() => config.deleteThemeTemplate("nope")).toThrow(
      "errors:themeTemplate.notFound",
    )
  })

  it("getThemeTemplates skips an invalid on-disk file", async () => {
    const config = await loadConfig()

    config.saveThemeTemplate({ name: "Good", theme: VALID_THEME })

    const dir = path.join(tmpDir, "theme-templates")
    fs.writeFileSync(path.join(dir, "broken.json"), "{ not valid }")
    fs.writeFileSync(
      path.join(dir, "wrong-shape.json"),
      JSON.stringify({ name: "x" }),
    )

    const list = config.getThemeTemplates()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe("Good")
  })

  it("assertSafeId guards every theme-template path interpolation", async () => {
    const config = await loadConfig()

    expect(() => config.getThemeTemplateById("../evil")).toThrow("Invalid id")
    expect(() => config.deleteThemeTemplate("../../etc/passwd")).toThrow(
      "Invalid id",
    )
  })

  it("initConfig bootstraps the theme-templates dir", async () => {
    const config = await loadConfig()

    config.initConfig()

    expect(fs.existsSync(path.join(tmpDir, "theme-templates"))).toBe(true)
  })
})

// ── Apply per-quiz theme on game create (#28) ───────────────────────────────

interface FakeSocket {
  id: string
  handshake: { auth: { clientId?: string } }
  emitted: Array<{ event: string; payload: unknown }>
  joined: string[]
  emit: (event: string, payload?: unknown) => boolean
  join: (room: string) => void
  to: (room: string) => { emit: (event: string, payload?: unknown) => boolean }
}

const ioEmitted: Array<{ target: string; event: string; payload: unknown }> = []

const makeFakeSocket = (id: string, clientId: string): FakeSocket => {
  const socket: FakeSocket = {
    id,
    handshake: { auth: { clientId } },
    emitted: [],
    joined: [],
    emit(event, payload) {
      socket.emitted.push({ event, payload })

      return true
    },
    join(room) {
      socket.joined.push(room)
    },
    to(room) {
      return {
        emit(event, payload) {
          ioEmitted.push({ target: room, event, payload })

          return true
        },
      }
    },
  }

  return socket
}

const fakeIo = {
  to(room: string) {
    return {
      emit(event: string, payload?: unknown) {
        ioEmitted.push({ target: room, event, payload })

        return true
      },
    }
  },
} as unknown as Server

const makeQuizz = (themeId?: string): Quizz => ({
  subject: "Theme Quiz",
  ...(themeId ? { themeId } : {}),
  questions: [
    {
      question: "Q1",
      type: "choice",
      answers: ["A", "B", "C", "D"],
      solutions: [0],
      cooldown: 1,
      time: 5,
    },
  ],
})

describe("per-quiz theme on game create", () => {
  beforeEach(() => {
    ioEmitted.length = 0
  })

  afterEach(async () => {
    const { default: Registry } = await import(
      "@razzoozle/socket/services/registry"
    )
    Registry.getInstance().cleanup()
  })

  it("emits MANAGER.THEME to the game room with the template theme", async () => {
    const config = await loadConfig()
    const { id } = config.saveThemeTemplate({
      name: "Lobby Look",
      theme: VALID_THEME,
    })

    const { default: Game } = await import("@razzoozle/socket/services/game")
    const { default: Registry } = await import(
      "@razzoozle/socket/services/registry"
    )

    const socket = makeFakeSocket("mgr-sock", "mgr-client")
    const game = new Game(
      fakeIo,
      socket as unknown as Socket,
      makeQuizz(id),
    )
    Registry.getInstance().addGame(game)

    const themeEmits = ioEmitted.filter(
      (e) => e.event === EVENTS.MANAGER.THEME && e.target === game.gameId,
    )

    expect(themeEmits).toHaveLength(1)
    expect(
      (themeEmits[0].payload as { colorPrimary: string }).colorPrimary,
    ).toBe("#ff9900")
  })

  it("emits NO MANAGER.THEME when the quiz has no themeId", async () => {
    await loadConfig()

    const { default: Game } = await import("@razzoozle/socket/services/game")
    const { default: Registry } = await import(
      "@razzoozle/socket/services/registry"
    )

    const socket = makeFakeSocket("mgr-sock", "mgr-client")
    const game = new Game(fakeIo, socket as unknown as Socket, makeQuizz())
    Registry.getInstance().addGame(game)

    const themeEmits = ioEmitted.filter(
      (e) => e.event === EVENTS.MANAGER.THEME,
    )

    expect(themeEmits).toHaveLength(0)
  })

  it("emits NO MANAGER.THEME when the themeId has no matching template", async () => {
    await loadConfig()

    const { default: Game } = await import("@razzoozle/socket/services/game")
    const { default: Registry } = await import(
      "@razzoozle/socket/services/registry"
    )

    const socket = makeFakeSocket("mgr-sock", "mgr-client")
    const game = new Game(
      fakeIo,
      socket as unknown as Socket,
      makeQuizz("ghost-template"),
    )
    Registry.getInstance().addGame(game)

    const themeEmits = ioEmitted.filter(
      (e) => e.event === EVENTS.MANAGER.THEME,
    )

    expect(themeEmits).toHaveLength(0)
  })
})
