import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  oldToNewTabKeyMap,
  resolveDefaultManagerTab,
  BUILTIN_TABS,
} from "./index"

describe("Manager Configuration Tabs", () => {
  describe("oldToNewTabKeyMap", () => {
    it("maps all 4 old German/alternate keys to new English keys", () => {
      expect(oldToNewTabKeyMap).toEqual({
        klassen: "classes",
        schueler: "students",
        ki: "ai",
        quizz: "quiz",
      })
    })

    it("has exactly 4 entries", () => {
      expect(Object.keys(oldToNewTabKeyMap)).toHaveLength(4)
    })
  })

  describe("resolveDefaultManagerTab localStorage migration", () => {
    const STORAGE_KEY = "rahoot_manager_tab"

    beforeEach(() => {
      const storageMock: Record<string, string> = {}
      vi.stubGlobal("window", {
        localStorage: {
          getItem: (key: string) => storageMock[key] ?? null,
          setItem: (key: string, value: string) => {
            storageMock[key] = value
          },
          clear: () => {
            Object.keys(storageMock).forEach((key) => delete storageMock[key])
          },
        },
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it("maps stale old key from localStorage to new key (klassen→classes)", () => {
      const storage = (window as any).localStorage
      storage.setItem(STORAGE_KEY, "klassen")

      const result = resolveDefaultManagerTab({
        devMode: false,
        klassenEnabled: true,
        role: "admin",
      })

      expect(result).toBe("classes")
    })

    it("maps stale old key from localStorage (schueler→students)", () => {
      const storage = (window as any).localStorage
      storage.setItem(STORAGE_KEY, "schueler")

      const result = resolveDefaultManagerTab({
        devMode: false,
        klassenEnabled: true,
        role: "admin",
      })

      expect(result).toBe("students")
    })

    it("maps stale old key from localStorage (ki→ai)", () => {
      const storage = (window as any).localStorage
      storage.setItem(STORAGE_KEY, "ki")

      const result = resolveDefaultManagerTab({
        devMode: false,
        klassenEnabled: false,
        role: "admin",
      })

      expect(result).toBe("ai")
    })

    it("maps stale old key from localStorage (quizz→quiz)", () => {
      const storage = (window as any).localStorage
      storage.setItem(STORAGE_KEY, "quizz")

      const result = resolveDefaultManagerTab({
        devMode: false,
        klassenEnabled: false,
        role: "user",
      })

      expect(result).toBe("quiz")
    })

    it("returns new key (not fallback) when stale old key is in storage and allowed", () => {
      const storage = (window as any).localStorage
      storage.setItem(STORAGE_KEY, "klassen")

      // With klassenEnabled=true, "classes" (migrated from "klassen") should be allowed
      const result = resolveDefaultManagerTab({
        devMode: false,
        klassenEnabled: true,
        role: "user",
      })

      // Should return "classes" (migrated), not "play" (fallback)
      expect(result).toBe("classes")
    })

    it("returns fallback when stale old key maps to tab not currently allowed (e.g., klassenEnabled=false)", () => {
      const storage = (window as any).localStorage
      storage.setItem(STORAGE_KEY, "klassen")

      // With klassenEnabled=false, "classes" is not allowed
      const result = resolveDefaultManagerTab({
        devMode: false,
        klassenEnabled: false,
        role: "user",
      })

      // Should fall back to first allowed tab ("play")
      expect(result).toBe("play")
    })

    it("returns fallback when localStorage has invalid/unknown key", () => {
      const storage = (window as any).localStorage
      storage.setItem(STORAGE_KEY, "invalid_tab_xyz")

      const result = resolveDefaultManagerTab({
        devMode: false,
        klassenEnabled: false,
        role: "user",
      })

      // Should fall back to first allowed tab
      expect(result).toBe("play")
    })

    it("returns fallback when localStorage is empty", () => {
      const storage = (window as any).localStorage
      storage.clear()

      const result = resolveDefaultManagerTab({
        devMode: false,
        klassenEnabled: false,
        role: "user",
      })

      // Should fall back to first allowed tab
      expect(result).toBe("play")
    })

    it("uses new key when already stored (not migrated), matching current BUILTIN_TABS", () => {
      const storage = (window as any).localStorage
      storage.setItem(STORAGE_KEY, "classes")

      const result = resolveDefaultManagerTab({
        devMode: false,
        klassenEnabled: true,
        role: "admin",
      })

      // Should return "classes" as-is (no mapping needed)
      expect(result).toBe("classes")
    })
  })

  describe("BUILTIN_TABS key consistency", () => {
    it("all BUILTIN_TABS keys are unique", () => {
      const keys = BUILTIN_TABS.map((t) => t.key)
      const uniqueKeys = new Set(keys)
      expect(uniqueKeys.size).toBe(keys.length)
    })

    it("contains all expected manager config tabs after migration", () => {
      const keys = BUILTIN_TABS.map((t) => t.key)
      const expectedKeys = [
        "play",
        "quiz",
        "catalog",
        "classes",
        "students",
        "media",
        "results",
        "submissions",
        "profile",
        "gamemode",
        "ai",
        "achievements",
        "running",
        "users",
        "design",
        "labels",
        "dev",
      ]
      expect(keys.sort()).toEqual(expectedKeys.sort())
    })

    it("does NOT contain old German keys (klassen, schueler, quizz, ki)", () => {
      const keys = BUILTIN_TABS.map((t) => t.key)
      expect(keys).not.toContain("klassen")
      expect(keys).not.toContain("schueler")
      expect(keys).not.toContain("quizz")
      expect(keys).not.toContain("ki")
    })
  })
})
