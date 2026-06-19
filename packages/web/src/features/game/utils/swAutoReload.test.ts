// Unit tests for the service-worker auto-reload guard (swAutoReload.ts).
//
// Only initSwAutoReload is exported; the guards (the module-let `refreshing`,
// the RELOAD_ONCE_KEY sessionStorage flag, isActiveQuestion, doReload and
// handleActivatedUpdate) are private. We exercise them THROUGH initSwAutoReload
// plus a faked "controllerchange" event and faked zustand stores.
//
// The two stores are mocked so we can drive `status` per test and replay
// `subscribe` callbacks to simulate a status transition. navigator /
// window.location.reload / sessionStorage are stubbed via vi.stubGlobal. Module
// state (`refreshing`, the once-flag closure) is reset by vi.resetModules() +
// a fresh dynamic import inside each test, so cases stay independent and
// deterministic (no real timers / network). Mirrors the package's vitest
// conventions (describe/it/expect, 2-space indent, no semicolons).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Status = { name: string } | null

// vi.hoisted so the vi.mock factories below can close over this mutable state.
const h = vi.hoisted(() => ({
  playerStatus: null as Status,
  managerStatus: null as Status,
  subs: [] as Array<() => void>,
}))

vi.mock("@razzoozle/web/features/game/stores/player", () => ({
  usePlayerStore: {
    getState: () => ({ status: h.playerStatus }),
    subscribe: (cb: () => void) => {
      h.subs.push(cb)
      return () => {}
    },
  },
}))

vi.mock("@razzoozle/web/features/game/stores/manager", () => ({
  useManagerStore: {
    getState: () => ({ status: h.managerStatus }),
    subscribe: (cb: () => void) => {
      h.subs.push(cb)
      return () => {}
    },
  },
}))

const RELOAD_ONCE_KEY = "rzl_sw_reloaded"

let ccListeners: Array<() => void>
let reloadMock: ReturnType<typeof vi.fn>
let sessionStore: Map<string, string>

const setupGlobals = (controller: object | null): void => {
  ccListeners = []
  reloadMock = vi.fn()
  sessionStore = new Map<string, string>()

  vi.stubGlobal("navigator", {
    serviceWorker: {
      controller,
      addEventListener: (ev: string, cb: () => void) => {
        if (ev === "controllerchange") {
          ccListeners.push(cb)
        }
      },
    },
  })

  vi.stubGlobal("window", { location: { reload: reloadMock } })

  vi.stubGlobal("sessionStorage", {
    getItem: (k: string): string | null => sessionStore.get(k) ?? null,
    setItem: (k: string, v: string): void => {
      sessionStore.set(k, v)
    },
  })
}

const fireControllerChange = (): void => {
  for (const cb of ccListeners) {
    cb()
  }
}

beforeEach(() => {
  vi.resetModules()
  h.playerStatus = null
  h.managerStatus = null
  h.subs = []
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("initSwAutoReload", () => {
  it("first-ever SW install does not reload", async () => {
    setupGlobals(null)
    const { initSwAutoReload } = await import("./swAutoReload")

    initSwAutoReload()
    fireControllerChange()

    expect(reloadMock).not.toHaveBeenCalled()
  })

  it("genuine update reloads when not in an active question", async () => {
    setupGlobals({})
    h.playerStatus = { name: "SHOW_LEADERBOARD" }
    h.managerStatus = null
    const { initSwAutoReload } = await import("./swAutoReload")

    initSwAutoReload()
    fireControllerChange()

    expect(reloadMock).toHaveBeenCalledTimes(1)
    expect(sessionStore.get(RELOAD_ONCE_KEY)).toBe("1")
  })

  it("respects the sessionStorage once-flag", async () => {
    setupGlobals({})
    sessionStore.set(RELOAD_ONCE_KEY, "1")
    h.playerStatus = { name: "SHOW_LEADERBOARD" }
    h.managerStatus = null
    const { initSwAutoReload } = await import("./swAutoReload")

    initSwAutoReload()
    fireControllerChange()

    expect(reloadMock).not.toHaveBeenCalled()
  })

  it("defers reload during an active question then reloads on transition", async () => {
    setupGlobals({})
    h.playerStatus = { name: "SHOW_QUESTION" }
    h.managerStatus = null
    const { initSwAutoReload } = await import("./swAutoReload")

    initSwAutoReload()
    fireControllerChange()

    // Active question — reload must be deferred, and a store subscription armed.
    expect(reloadMock).not.toHaveBeenCalled()
    expect(h.subs.length).toBeGreaterThan(0)

    // Status leaves the active phase; replaying the subscriptions fires the
    // pending reload exactly once (the one-shot `done` guard prevents repeats).
    h.playerStatus = { name: "SHOW_LEADERBOARD" }
    for (const cb of h.subs) {
      cb()
    }

    expect(reloadMock).toHaveBeenCalledTimes(1)
  })
})
