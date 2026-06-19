// Unit tests for persistAchievements (achievementsStore.ts) — the increment-merge
// localStorage writer extracted verbatim from Result.tsx.
//
// localStorage is stubbed via vi.stubGlobal with a Map-backed fake (mirrors the
// sessionStorage stub in swAutoReload.test.ts). Each test gets a fresh store and
// unstubs in afterEach so cases stay independent. To exercise the catch-all, we
// stub a localStorage whose getItem/setItem throw, or seed a corrupt-JSON value.
// Mirrors the package's vitest conventions (describe/it/expect, 2-space indent,
// no semicolons).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { persistAchievements } from "@razzoozle/web/features/game/utils/achievementsStore"

const LS_KEY = "rahoot_achievements"

let store: Map<string, string>

const setupStorage = (): void => {
  store = new Map<string, string>()

  vi.stubGlobal("localStorage", {
    getItem: (k: string): string | null => store.get(k) ?? null,
    setItem: (k: string, v: string): void => {
      store.set(k, v)
    },
  })
}

const read = (): Record<string, number> =>
  JSON.parse(store.get(LS_KEY) ?? "{}") as Record<string, number>

beforeEach(() => {
  setupStorage()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("persistAchievements", () => {
  it("increments the count of an existing key", () => {
    store.set(LS_KEY, JSON.stringify({ first_correct: 2 }))

    persistAchievements(["first_correct"])

    expect(read()).toEqual({ first_correct: 3 })
  })

  it("initializes a new key at count 1 when storage is empty", () => {
    persistAchievements(["speed_demon"])

    expect(read()).toEqual({ speed_demon: 1 })
  })

  it("applies a multi-id batch, mixing increments and inits", () => {
    store.set(LS_KEY, JSON.stringify({ streak_3: 1 }))

    persistAchievements(["streak_3", "streak_5", "streak_3"])

    // streak_3 seen twice in the batch on top of the stored 1; streak_5 is new.
    expect(read()).toEqual({ streak_3: 3, streak_5: 1 })
  })

  it("does nothing for an empty id list", () => {
    persistAchievements([])

    expect(store.has(LS_KEY)).toBe(false)
  })

  it("does not throw when the stored value is corrupt JSON", () => {
    store.set(LS_KEY, "{not valid json")

    expect(() => persistAchievements(["lucky_guess"])).not.toThrow()
  })

  it("does not throw when localStorage.getItem throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("getItem blocked")
      },
      setItem: () => {},
    })

    expect(() => persistAchievements(["underdog"])).not.toThrow()
  })

  it("does not throw when localStorage.setItem throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: (): string | null => null,
      setItem: () => {
        throw new Error("setItem blocked / quota exceeded")
      },
    })

    expect(() => persistAchievements(["perfect_game"])).not.toThrow()
  })
})
