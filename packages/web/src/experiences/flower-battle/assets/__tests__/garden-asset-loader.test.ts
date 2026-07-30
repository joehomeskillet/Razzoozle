/**
 * WP-03 garden asset loader — fallback, progress, concurrency, unload, preload.
 * Pure unit tests with injected load adapters (no WebGL / network).
 */

import { afterEach, describe, expect, it } from "vitest"

import {
  GARDEN_BUNDLE_NAMES,
  GARDEN_BUNDLES,
  getGardenBundle,
  isGardenBundleName,
  listBundlesByPriority,
} from "../garden-asset-manifest"
import {
  createGardenAssetLoader,
  createPlaceholderAssetLoaderFn,
  loadBundle as defaultLoadBundle,
  preloadBundle as defaultPreloadBundle,
  resetDefaultGardenAssetLoader,
  setDefaultGardenAssetLoader,
  unloadBundle as defaultUnloadBundle,
} from "../garden-asset-loader"
import type { LoadProgressCallback } from "../garden-asset-types"

afterEach(() => {
  resetDefaultGardenAssetLoader()
})

describe("garden-asset-manifest", () => {
  it("defines exactly 9 garden bundles with priorities", () => {
    expect(GARDEN_BUNDLE_NAMES).toHaveLength(9)
    expect(Object.keys(GARDEN_BUNDLES)).toHaveLength(9)

    expect(GARDEN_BUNDLES.boot.priority).toBe("boot")
    expect(GARDEN_BUNDLES["garden-background"].priority).toBe("eager")
    expect(GARDEN_BUNDLES["garden-common"].priority).toBe("eager")
    expect(GARDEN_BUNDLES["garden-flower-violet"].priority).toBe("lazy")
    expect(GARDEN_BUNDLES["garden-flower-blue"].priority).toBe("lazy")
    expect(GARDEN_BUNDLES["garden-flower-orange"].priority).toBe("lazy")
    expect(GARDEN_BUNDLES["garden-flower-green"].priority).toBe("lazy")
    expect(GARDEN_BUNDLES["garden-effects-low"].priority).toBe("lazy")
    expect(GARDEN_BUNDLES["garden-effects-high"].priority).toBe("lazy")
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
      ["boot", "garden-background", "garden-common"].sort(),
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
        return Object.fromEntries(
          Object.keys(assets).map((k) => [k, { k }]),
        )
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
