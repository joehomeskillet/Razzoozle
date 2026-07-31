/**
 * WP-03 garden asset loader — fallback, progress, concurrency, unload, preload.
 * Pure unit tests with injected load adapters (no WebGL / network).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  GARDEN_BUNDLE_NAMES,
  GARDEN_BUNDLES,
  getGardenBundle,
  isGardenBundleName,
  listBundlesByPriority,
} from "../garden-asset-manifest"
import {
  createGardenAssetLoader,
  createPixiAssetLoaderFn,
  createPlaceholderAssetLoaderFn,
  loadBundle as defaultLoadBundle,
  preloadBundle as defaultPreloadBundle,
  resetDefaultGardenAssetLoader,
  setDefaultGardenAssetLoader,
  unloadBundle as defaultUnloadBundle,
} from "../garden-asset-loader"
import type { LoadProgressCallback } from "../garden-asset-types"

/**
 * Deterministic pixi.js module mock — drives the real
 * `createPixiAssetLoaderFn` seam (including Assets.init rejections) without
 * WebGL. Per-test behavior is injected via one-shot `mock*Once` calls, so no
 * state leaks between tests.
 */
const pixiAssetsMock = vi.hoisted(() => ({
  init: vi.fn(),
  add: vi.fn(),
  load: vi.fn(),
  unload: vi.fn(),
}))

vi.mock("pixi.js", () => ({ Assets: pixiAssetsMock }))

afterEach(() => {
  resetDefaultGardenAssetLoader()
})

describe("garden-asset-manifest", () => {
  it("defines exactly 11 garden bundles with priorities", () => {
    expect(GARDEN_BUNDLE_NAMES).toHaveLength(11)
    expect(Object.keys(GARDEN_BUNDLES)).toHaveLength(11)

    expect(GARDEN_BUNDLES.boot.priority).toBe("boot")
    expect(GARDEN_BUNDLES["garden-background"].priority).toBe("eager")
    expect(GARDEN_BUNDLES["garden-common"].priority).toBe("eager")
    expect(GARDEN_BUNDLES["shared-ui"].priority).toBe("eager")
    expect(GARDEN_BUNDLES["garden-flower-violet"].priority).toBe("lazy")
    expect(GARDEN_BUNDLES["garden-flower-blue"].priority).toBe("lazy")
    expect(GARDEN_BUNDLES["garden-flower-orange"].priority).toBe("lazy")
    expect(GARDEN_BUNDLES["garden-flower-green"].priority).toBe("lazy")
    expect(GARDEN_BUNDLES["garden-effects-low"].priority).toBe("lazy")
    expect(GARDEN_BUNDLES["garden-effects-high"].priority).toBe("lazy")
    expect(GARDEN_BUNDLES["garden-audio"].priority).toBe("lazy")
  })

  it("exposes AssetBundle shape (name, assets, priority, optional size)", () => {
    for (const name of GARDEN_BUNDLE_NAMES) {
      const bundle = GARDEN_BUNDLES[name]
      expect(bundle.name).toBe(name)
      expect(bundle.priority).toMatch(/^(boot|eager|lazy)$/)
      expect(Object.keys(bundle.assets).length).toBeGreaterThan(0)
      expect(typeof bundle.size === "number" || bundle.size === undefined).toBe(
        true,
      )
    }
  })

  it("isGardenBundleName / getGardenBundle / listBundlesByPriority", () => {
    expect(isGardenBundleName("boot")).toBe(true)
    expect(isGardenBundleName("nope")).toBe(false)
    expect(getGardenBundle("boot")?.name).toBe("boot")
    expect(getGardenBundle("missing")).toBeUndefined()

    const bootEager = listBundlesByPriority(["boot", "eager"])
    expect(bootEager.map((b) => b.name).sort()).toEqual(
      ["boot", "garden-background", "garden-common", "shared-ui"].sort(),
    )
  })
})

describe("garden-asset-loader", () => {
  it("loads a known bundle without fallback and fires progress", async () => {
    const progress: Array<[number, number]> = []
    const onProgress: LoadProgressCallback = (loaded, total) => {
      progress.push([loaded, total])
    }

    const loader = createGardenAssetLoader({
      loadAssets: createPlaceholderAssetLoaderFn(),
    })

    const result = await loader.loadBundle("boot", onProgress)

    expect(result.fallback).toBe(false)
    expect(result.error).toBeUndefined()
    expect(result.name).toBe("boot")
    expect(Object.keys(result.resources).length).toBeGreaterThan(0)
    expect(loader.getBundleStatus("boot")).toBe("loaded")

    expect(progress.length).toBeGreaterThan(0)
    const last = progress[progress.length - 1]!
    expect(last[0]).toBe(last[1])
    expect(last[1]).toBeGreaterThan(0)
  })

  it("returns fallback signal on network/load error — never throws", async () => {
    const networkError = new Error("Network request failed")
    const loader = createGardenAssetLoader({
      loadAssets: async () => {
        throw networkError
      },
    })

    let thrown: unknown
    let result
    try {
      result = await loader.loadBundle("garden-background")
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeUndefined()
    expect(result).toBeDefined()
    expect(result!.fallback).toBe(true)
    expect(result!.resources).toEqual({})
    expect(result!.error?.name).toBe("garden-background")
    expect(result!.error?.message).toMatch(/Network request failed/)
    expect(result!.error?.cause).toBe(networkError)
    expect(loader.getBundleStatus("garden-background")).toBe("error")
  })

  it("returns fallback for unknown bundle names without crash", async () => {
    const loader = createGardenAssetLoader()
    const result = await loader.loadBundle("does-not-exist")

    expect(result.fallback).toBe(true)
    expect(result.error?.message).toMatch(/Unknown garden asset bundle/)
    expect(loader.getBundleStatus("does-not-exist")).toBe("error")
  })

  it("does not crash match flow when multiple bundles fail", async () => {
    const loader = createGardenAssetLoader({
      loadAssets: async () => {
        throw new Error("CDN down")
      },
    })

    const results = await Promise.all([
      loader.loadBundle("boot"),
      loader.loadBundle("garden-flower-violet"),
      loader.loadBundle("garden-effects-high"),
    ])

    for (const r of results) {
      expect(r.fallback).toBe(true)
      expect(r.error).toBeDefined()
    }
  })

  it("dedupes concurrent loads of the same bundle", async () => {
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const loader = createGardenAssetLoader({
      loadAssets: async (assets, onProgress) => {
        calls += 1
        const total = Object.keys(assets).length
        onProgress?.(0, total)
        await gate
        onProgress?.(total, total)
        return Object.fromEntries(
          Object.keys(assets).map((k) => [k, { ok: true }]),
        )
      },
    })

    const p1 = loader.loadBundle("garden-common")
    const p2 = loader.loadBundle("garden-common")
    const p3 = loader.loadBundle("garden-common")

    expect(loader.getBundleStatus("garden-common")).toBe("loading")
    release()

    const [a, b, c] = await Promise.all([p1, p2, p3])
    expect(calls).toBe(1)
    expect(a.fallback).toBe(false)
    expect(b.resources).toBe(a.resources)
    expect(c.name).toBe("garden-common")
    expect(loader.getBundleStatus("garden-common")).toBe("loaded")
  })

  it("unloadBundle frees tracked memory and updates status", async () => {
    const unloaded: string[][] = []
    const loader = createGardenAssetLoader({
      loadAssets: createPlaceholderAssetLoaderFn(),
      unloadAssets: async (aliases) => {
        unloaded.push([...aliases])
      },
    })

    const loaded = await loader.loadBundle("garden-flower-blue")
    expect(loaded.fallback).toBe(false)
    expect(loader.getLoadedAssets("garden-flower-blue")).toBeDefined()

    await loader.unloadBundle("garden-flower-blue")

    expect(unloaded).toHaveLength(1)
    expect(unloaded[0]!.length).toBeGreaterThan(0)
    expect(loader.getLoadedAssets("garden-flower-blue")).toBeUndefined()
    expect(loader.getBundleStatus("garden-flower-blue")).toBe("unloaded")
  })

  it("preloadBundle starts without blocking the caller", async () => {
    let started = false
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const loader = createGardenAssetLoader({
      loadAssets: async (assets, onProgress) => {
        started = true
        const total = Object.keys(assets).length
        onProgress?.(0, total)
        await gate
        onProgress?.(total, total)
        return Object.fromEntries(
          Object.keys(assets).map((k) => [k, { preloaded: true }]),
        )
      },
    })

    const before = Date.now()
    loader.preloadBundle("garden-effects-low")
    const elapsed = Date.now() - before

    // preload must return immediately (not await the slow load)
    expect(elapsed).toBeLessThan(50)
    // allow microtask to start the load
    await Promise.resolve()
    expect(started).toBe(true)
    expect(loader.getBundleStatus("garden-effects-low")).toBe("loading")

    release()
    // drain microtasks until status settles
    for (let i = 0; i < 10; i += 1) {
      if (loader.getBundleStatus("garden-effects-low") === "loaded") break
      await Promise.resolve()
    }
    expect(loader.getBundleStatus("garden-effects-low")).toBe("loaded")
  })

  it("module-level helpers use the configured default loader", async () => {
    const loader = createGardenAssetLoader({
      loadAssets: async () => {
        throw new Error("mock fail")
      },
    })
    setDefaultGardenAssetLoader(loader)

    const result = await defaultLoadBundle("boot")
    expect(result.fallback).toBe(true)

    defaultPreloadBundle("garden-common")
    await defaultUnloadBundle("boot")
    expect(loader.getBundleStatus("boot")).toBe("unloaded")
  })

  it("progress callback receives monotonic loaded counts up to total", async () => {
    const samples: number[] = []
    const loader = createGardenAssetLoader({
      loadAssets: async (assets, onProgress) => {
        const keys = Object.keys(assets)
        const total = keys.length
        for (let i = 0; i <= total; i += 1) {
          onProgress?.(i, total)
        }
        return Object.fromEntries(keys.map((k) => [k, true]))
      },
    })

    await loader.loadBundle("garden-effects-high", (loaded, total) => {
      samples.push(loaded)
      expect(loaded).toBeLessThanOrEqual(total)
      expect(total).toBeGreaterThan(0)
    })

    expect(samples[0]).toBe(0)
    expect(samples[samples.length - 1]).toBe(
      Object.keys(GARDEN_BUNDLES["garden-effects-high"].assets).length,
    )
  })

  it("tracks statuses across load/error/unload", async () => {
    let fail = false
    const loader = createGardenAssetLoader({
      loadAssets: async (assets, onProgress) => {
        if (fail) throw new Error("boom")
        const total = Object.keys(assets).length
        onProgress?.(total, total)
        return Object.fromEntries(Object.keys(assets).map((k) => [k, { k }]))
      },
    })

    expect(loader.getBundleStatus("boot")).toBe("idle")
    await loader.loadBundle("boot")
    expect(loader.getBundleStatuses().boot).toBe("loaded")

    fail = true
    await loader.loadBundle("garden-common")
    expect(loader.getBundleStatuses()["garden-common"]).toBe("error")

    await loader.unloadBundle("boot")
    expect(loader.getBundleStatuses().boot).toBe("unloaded")
  })
})

describe("garden-asset-loader crash safety", () => {
  it("survives thrown non-Error values from the adapter", async () => {
    const loader = createGardenAssetLoader({
      loadAssets: async () => {
        // Non-Error throw must still become fallback, not a crash.
        // eslint-disable-next-line no-throw-literal, @typescript-eslint/only-throw-error
        throw { code: "E_NET", detail: "upstream" }
      },
    })

    const result = await loader.loadBundle("boot")
    expect(result.fallback).toBe(true)
    expect(result.error?.message).toMatch(/Failed to load bundle: boot/)
  })

  it("unload of never-loaded bundle is a no-op", async () => {
    const loader = createGardenAssetLoader()
    await expect(loader.unloadBundle("boot")).resolves.toBeUndefined()
    expect(loader.getBundleStatus("boot")).toBe("idle")
  })
})

describe("createPixiAssetLoaderFn with mocked pixi.js", () => {
  beforeEach(() => {
    pixiAssetsMock.init.mockReset()
    pixiAssetsMock.add.mockReset()
    pixiAssetsMock.load.mockReset()
    pixiAssetsMock.unload.mockReset()
  })

  it("propagates Assets.init rejection as fallback (not swallowed)", async () => {
    const initError = new Error("Pixi init failed: WebGL context lost")
    pixiAssetsMock.init.mockRejectedValueOnce(initError)

    const loader = createGardenAssetLoader({
      loadAssets: createPixiAssetLoaderFn("/test-base"),
    })

    const result = await loader.loadBundle("boot")

    // The real Pixi seam was exercised (not a generic loadAssets fake)...
    expect(pixiAssetsMock.init).toHaveBeenCalledTimes(1)
    expect(pixiAssetsMock.init).toHaveBeenCalledWith(
      expect.objectContaining({ basePath: "/test-base" }),
    )
    // ...the init rejection became a fallback result, not a crash...
    expect(result.fallback).toBe(true)
    expect(result.error?.message).toMatch(/Pixi init failed/)
    expect(loader.getBundleStatus("boot")).toBe("error")
    // ...and the original rejection survives in the cause chain: loadBundle
    // wraps the loader-thrown error whose own `cause` is the init error.
    const thrown = result.error?.cause
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).cause).toBe(initError)
    // Asset loading must never be attempted after a failed init.
    expect(pixiAssetsMock.add).not.toHaveBeenCalled()
    expect(pixiAssetsMock.load).not.toHaveBeenCalled()
  })

  it("does not swallow Assets.init rejection at the loader seam", async () => {
    const initError = new Error("init exploded")
    pixiAssetsMock.init.mockRejectedValueOnce(initError)

    const loadAssets = createPixiAssetLoaderFn("/test-base")
    await expect(loadAssets({ a: "a.png" })).rejects.toThrow(/init exploded/)
  })

  it("shares one Assets.init across concurrent loads and caches the rejection", async () => {
    const initError = new Error("init boom")
    pixiAssetsMock.init.mockRejectedValueOnce(initError)

    const loader = createGardenAssetLoader({
      loadAssets: createPixiAssetLoaderFn("/test-base"),
    })

    const [a, b] = await Promise.all([
      loader.loadBundle("boot"),
      loader.loadBundle("garden-common"),
    ])
    expect(a.fallback).toBe(true)
    expect(b.fallback).toBe(true)
    // init ran exactly once even under concurrency.
    expect(pixiAssetsMock.init).toHaveBeenCalledTimes(1)

    // A later load reuses the cached rejection instead of re-running init.
    const c = await loader.loadBundle("garden-flower-blue")
    expect(c.fallback).toBe(true)
    expect(c.error?.message).toMatch(/init boom/)
    expect(pixiAssetsMock.init).toHaveBeenCalledTimes(1)
  })

  it("loads via Pixi Assets when init succeeds", async () => {
    pixiAssetsMock.init.mockResolvedValueOnce(undefined)
    pixiAssetsMock.load.mockResolvedValueOnce({
      "boot-clear-color": { placeholder: true },
      "boot-logo-mark": { placeholder: true },
    })

    const loader = createGardenAssetLoader({
      loadAssets: createPixiAssetLoaderFn("/test-base"),
    })

    const result = await loader.loadBundle("boot")
    expect(result.fallback).toBe(false)
    expect(result.resources).toEqual({
      "boot-clear-color": { placeholder: true },
      "boot-logo-mark": { placeholder: true },
    })
    expect(pixiAssetsMock.add).toHaveBeenCalled()
    expect(pixiAssetsMock.load).toHaveBeenCalledTimes(1)
    expect(loader.getBundleStatus("boot")).toBe("loaded")
  })
})

describe("garden-asset-loader monotonic progress on failure", () => {
  it("does not reset progress to 0 on init failure (monotonic)", async () => {
    const progress: Array<[number, number]> = []
    const initError = new Error("init failed")

    const loader = createGardenAssetLoader({
      loadAssets: async (_, onProgress) => {
        onProgress?.(0, 1)
        throw initError
      },
    })

    await loader.loadBundle("boot", (loaded, total) => {
      progress.push([loaded, total])
    })

    // Progress should be monotonic: 0 -> 1 (not 0 -> 0)
    expect(progress.length).toBeGreaterThanOrEqual(2)
    const last = progress[progress.length - 1]!
    expect(last[0]).toBe(last[1])
    expect(last[1]).toBeGreaterThan(0)
  })
})

describe("garden-asset-loader idempotent unload", () => {
  it("multiple unload calls are idempotent (no-op after first)", async () => {
    const unloaded: string[][] = []
    const loader = createGardenAssetLoader({
      loadAssets: createPlaceholderAssetLoaderFn(),
      unloadAssets: async (aliases) => {
        unloaded.push([...aliases])
      },
    })

    await loader.loadBundle("garden-flower-blue")
    expect(loader.getBundleStatus("garden-flower-blue")).toBe("loaded")

    await loader.unloadBundle("garden-flower-blue")
    expect(loader.getBundleStatus("garden-flower-blue")).toBe("unloaded")
    expect(unloaded).toHaveLength(1)

    // Second unload should be no-op
    await loader.unloadBundle("garden-flower-blue")
    expect(loader.getBundleStatus("garden-flower-blue")).toBe("unloaded")
    expect(unloaded).toHaveLength(1) // No additional call

    // Third unload should also be no-op
    await loader.unloadBundle("garden-flower-blue")
    expect(unloaded).toHaveLength(1)
  })

  it("unload of unknown bundle is no-op and leaves status idle", async () => {
    const loader = createGardenAssetLoader()
    await expect(loader.unloadBundle("unknown-bundle")).resolves.toBeUndefined()
    expect(loader.getBundleStatus("unknown-bundle")).toBe("idle")
  })

  it("unload of error-state bundle is idempotent", async () => {
    const loader = createGardenAssetLoader({
      loadAssets: async () => {
        throw new Error("load failed")
      },
    })

    await loader.loadBundle("boot")
    expect(loader.getBundleStatus("boot")).toBe("error")

    await loader.unloadBundle("boot")
    expect(loader.getBundleStatus("boot")).toBe("unloaded")

    // Second unload should be no-op
    await loader.unloadBundle("boot")
    expect(loader.getBundleStatus("boot")).toBe("unloaded")
  })
})

describe("WP-03 review findings regression suite", () => {
  it("finding 1: load completion must not resurrect assets after unload", async () => {
    let releaseLoad!: () => void
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = resolve
    })
    const unloadedAliases: string[][] = []

    const loader = createGardenAssetLoader({
      loadAssets: async (assets, onProgress) => {
        const keys = Object.keys(assets)
        onProgress?.(0, keys.length)
        await loadGate
        onProgress?.(keys.length, keys.length)
        return Object.fromEntries(keys.map((k) => [k, { data: k }]))
      },
      unloadAssets: async (aliases) => {
        unloadedAliases.push([...aliases])
      },
    })

    const loadPromise = loader.loadBundle("boot")
    expect(loader.getBundleStatus("boot")).toBe("loading")

    // Trigger unload while load is still in flight
    const unloadPromise = loader.unloadBundle("boot")
    expect(loader.getBundleStatus("boot")).toBe("unloaded")

    // Now release the load adapter
    releaseLoad()
    await loadPromise
    await unloadPromise

    // Status remains unloaded and asset is not stored in loadedByName
    expect(loader.getBundleStatus("boot")).toBe("unloaded")
    expect(loader.getLoadedAssets("boot")).toBeUndefined()
    expect(unloadedAliases).toHaveLength(1)
    expect(unloadedAliases[0]).toEqual(["boot-clear-color", "boot-logo-mark"])
  })

  it("finding 2: deduped concurrent callers must all receive progress callbacks", async () => {
    let releaseLoad!: () => void
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = resolve
    })

    const loader = createGardenAssetLoader({
      loadAssets: async (assets, onProgress) => {
        const keys = Object.keys(assets)
        onProgress?.(0, keys.length)
        await loadGate
        onProgress?.(keys.length, keys.length)
        return Object.fromEntries(keys.map((k) => [k, { data: k }]))
      },
    })

    const prog1: Array<[number, number]> = []
    const prog2: Array<[number, number]> = []

    const p1 = loader.loadBundle("boot", (l, t) => prog1.push([l, t]))
    const p2 = loader.loadBundle("boot", (l, t) => prog2.push([l, t]))

    releaseLoad()
    await Promise.all([p1, p2])

    expect(prog1.length).toBeGreaterThan(0)
    expect(prog2.length).toBeGreaterThan(0)
    expect(prog1[prog1.length - 1]).toEqual([2, 2])
    expect(prog2[prog2.length - 1]).toEqual([2, 2])
  })

  it("finding 2: cached loads notify only their current callback once", async () => {
    const loader = createGardenAssetLoader({
      loadAssets: createPlaceholderAssetLoaderFn(),
    })
    const initial = await loader.loadBundle("boot")
    let firstCachedCalls = 0
    let secondCachedCalls = 0

    const firstCached = await loader.loadBundle("boot", () => {
      firstCachedCalls += 1
    })

    expect(firstCached).toBe(initial)
    expect(firstCachedCalls).toBe(1)

    const secondCached = await loader.loadBundle("boot", () => {
      secondCachedCalls += 1
    })

    expect(secondCached).toBe(initial)
    expect(firstCachedCalls).toBe(1)
    expect(secondCachedCalls).toBe(1)
  })

  it("finding 3: concurrent unload calls adapter once", async () => {
    let unloadCalls = 0
    let releaseUnload!: () => void
    const unloadGate = new Promise<void>((resolve) => {
      releaseUnload = resolve
    })

    const loader = createGardenAssetLoader({
      loadAssets: createPlaceholderAssetLoaderFn(),
      unloadAssets: async () => {
        unloadCalls += 1
        await unloadGate
      },
    })

    await loader.loadBundle("boot")
    expect(loader.getBundleStatus("boot")).toBe("loaded")

    const u1 = loader.unloadBundle("boot")
    const u2 = loader.unloadBundle("boot")

    releaseUnload()
    await Promise.all([u1, u2])

    expect(unloadCalls).toBe(1)
    expect(loader.getBundleStatus("boot")).toBe("unloaded")
  })

  it("finding 3: failed unload preserves retryable loaded state", async () => {
    let failUnload = true
    const loader = createGardenAssetLoader({
      loadAssets: createPlaceholderAssetLoaderFn(),
      unloadAssets: async () => {
        if (failUnload) {
          throw new Error("GPU unload failed")
        }
      },
    })

    await loader.loadBundle("boot")
    expect(loader.getBundleStatus("boot")).toBe("loaded")

    // Failed unload throws and leaves state as loaded
    await expect(loader.unloadBundle("boot")).rejects.toThrow(
      "GPU unload failed",
    )
    expect(loader.getBundleStatus("boot")).toBe("loaded")
    expect(loader.getLoadedAssets("boot")).toBeDefined()

    // Retry unload after fixing adapter
    failUnload = false
    await expect(loader.unloadBundle("boot")).resolves.toBeUndefined()
    expect(loader.getBundleStatus("boot")).toBe("unloaded")
    expect(loader.getLoadedAssets("boot")).toBeUndefined()
  })

  it("finding 4: normalizes Pixi v8 URL keys to alias result keys", async () => {
    pixiAssetsMock.init.mockResolvedValueOnce(undefined)
    // Pixi returns keys formatted as full path URLs
    pixiAssetsMock.load.mockResolvedValueOnce({
      "/test-base/placeholder/boot-clear-color.png": { tex: 1 },
      "/test-base/placeholder/boot-logo-mark.png": { tex: 2 },
    })

    const loadAssets = createPixiAssetLoaderFn("/test-base")
    const res = await loadAssets({
      "boot-clear-color": "placeholder/boot-clear-color.png",
      "boot-logo-mark": "placeholder/boot-logo-mark.png",
    })

    expect(res["boot-clear-color"]).toEqual({ tex: 1 })
    expect(res["boot-logo-mark"]).toEqual({ tex: 2 })
  })

  it("finding 5: public default loader does not report fake placeholder success", async () => {
    pixiAssetsMock.init.mockRejectedValueOnce(new Error("No WebGL context"))

    const loader = createGardenAssetLoader()
    const result = await loader.loadBundle("boot")

    expect(result.fallback).toBe(true)
    expect(result.error?.message).toMatch(/No WebGL context/)
    expect(loader.getBundleStatus("boot")).toBe("error")
  })

  it("finding 6: manifest count mismatch returns fallback result", async () => {
    const loader = createGardenAssetLoader({
      loadAssets: async () => {
        // Return incomplete resources missing boot-logo-mark
        return {
          "boot-clear-color": { ok: true },
        }
      },
    })

    const result = await loader.loadBundle("boot")

    expect(result.fallback).toBe(true)
    expect(result.error?.message).toMatch(/Manifest count mismatch/)
    expect(loader.getBundleStatus("boot")).toBe("error")
  })
})
