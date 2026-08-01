/**
 * Legacy garden asset loader (WP-03) — thin, failure-tolerant wrapper over
 * PixiJS Assets.
 *
 * **Non-production for the presenter garden scene.** Production path is
 * `loadGardenSceneAssets` + `GARDEN_SCENE_ASSET_URLS` (Vite `?url` imports).
 * This loader remains for the legacy bundle API (`loadBundle` / boot /
 * team-lazy orchestration) and unit tests.
 *
 * Contract:
 * - `loadBundle` never throws; failures return `{ fallback: true, error }`.
 * - Match must continue; host maps fallback → StaticFallback (WP-02).
 * - Concurrent loads of the same name share one in-flight promise.
 * - `preloadBundle` is fire-and-forget (does not block the caller).
 * - `unloadBundle` releases tracked resources for memory cleanup.
 *
 * Manifest assets are Vite-hashed absolute URLs (see garden-asset-manifest);
 * `basePath` is only applied to relative test paths. Never uses `/placeholders/`.
 */

import {
  GARDEN_ASSET_BASE_PATH,
  getGardenBundle,
  PLACEHOLDER_TEXTURE_DATA_URI,
  type AssetBundle,
} from "./garden-asset-manifest"
import type {
  Assets,
  BundleError,
  BundleStatus,
  GardenAssetLoaderDeps,
  LoadProgressCallback,
} from "./garden-asset-types"

/** Public API surface for a loader instance. */
export interface GardenAssetLoader {
  loadBundle: (
    name: string,
    onProgress?: LoadProgressCallback,
  ) => Promise<Assets>
  unloadBundle: (name: string) => Promise<void>
  preloadBundle: (name: string) => void
  getBundleStatus: (name: string) => BundleStatus
  getBundleStatuses: () => Readonly<Record<string, BundleStatus>>
  getLoadedAssets: (name: string) => Assets | undefined
  /** Test / teardown helper — clears tracking without calling unload adapters. */
  reset: () => void
}

function joinBasePath(basePath: string, relative: string): string {
  if (
    relative.startsWith("data:") ||
    relative.startsWith("http://") ||
    relative.startsWith("https://") ||
    relative.startsWith("/")
  ) {
    return relative
  }
  const base = basePath.endsWith("/") ? basePath : `${basePath}/`
  return `${base}${relative.replace(/^\//, "")}`
}

function resolveBundleAssets(
  bundle: AssetBundle,
  basePath: string,
): Record<string, string> {
  const resolved: Record<string, string> = {}
  for (const [alias, src] of Object.entries(bundle.assets)) {
    resolved[alias] = joinBasePath(basePath, src)
  }
  return resolved
}

/**
 * Default loader used when no PixiJS environment is available (unit tests /
 * SSR). Resolves every alias to a 1×1 placeholder resource object.
 */
export function createPlaceholderAssetLoaderFn(): (
  assets: Record<string, string>,
  onProgress?: LoadProgressCallback,
) => Promise<Record<string, unknown>> {
  return async (assets, onProgress) => {
    const aliases = Object.keys(assets)
    const total = aliases.length
    const resources: Record<string, unknown> = {}
    let loaded = 0
    onProgress?.(0, total)
    for (const alias of aliases) {
      resources[alias] = {
        alias,
        src: assets[alias] ?? PLACEHOLDER_TEXTURE_DATA_URI,
        placeholder: true,
      }
      loaded += 1
      onProgress?.(loaded, total)
    }
    return resources
  }
}

/**
 * PixiJS-backed loader. Dynamically imports `pixi.js` so pure unit tests that
 * inject fakes never touch WebGL. Failures propagate to the outer catch so
 * `loadBundle` can convert them into fallback results.
 */
export function createPixiAssetLoaderFn(
  basePath: string,
): (
  assets: Record<string, string>,
  onProgress?: LoadProgressCallback,
) => Promise<Record<string, unknown>> {
  // One-shot init shared by every call: concurrent loads await the same
  // promise, and a rejected init stays rejected (deterministic degradation
  // to fallback — no mid-match WebGL retry storms).
  let initPromise: Promise<void> | null = null

  return async (assets, onProgress) => {
    const { Assets: PixiAssets } = await import("pixi.js")
    initPromise ??= PixiAssets.init({
      basePath,
      // Skip browser format detection in constrained environments.
      skipDetections: true,
    }).catch((err: unknown) => {
      // Never swallow init failures: rethrow with the original error as
      // `cause` so `loadBundle` converts it into a fallback result.
      const cause = err instanceof Error ? err : new Error(String(err))
      throw new Error(cause.message, { cause })
    })
    await initPromise

    const aliases = Object.keys(assets)
    const total = Math.max(aliases.length, 1)
    onProgress?.(0, total)

    for (const [alias, src] of Object.entries(assets)) {
      PixiAssets.add({ alias, src })
    }

    const loaded = await PixiAssets.load(aliases, (progress: number) => {
      const count = Math.min(total, Math.round(progress * total))
      onProgress?.(count, total)
    })

    onProgress?.(total, total)

    const normalized: Record<string, unknown> = {}

    if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) {
      const loadedObj = loaded as Record<string, unknown>
      for (const [alias, src] of Object.entries(assets)) {
        if (alias in loadedObj && loadedObj[alias] !== undefined) {
          normalized[alias] = loadedObj[alias]
        } else if (src in loadedObj && loadedObj[src] !== undefined) {
          normalized[alias] = loadedObj[src]
        } else {
          const matchKey = Object.keys(loadedObj).find(
            (k) =>
              k === alias || k === src || k.endsWith(src) || src.endsWith(k),
          )
          if (matchKey && loadedObj[matchKey] !== undefined) {
            normalized[alias] = loadedObj[matchKey]
          } else {
            try {
              const res = PixiAssets.get?.(alias)
              if (res !== undefined) {
                normalized[alias] = res
              }
            } catch {
              // Best-effort lookup fallback
            }
          }
        }
      }
      return normalized
    }

    // Single-asset load returns the resource directly.
    if (aliases.length === 1 && loaded !== undefined) {
      return { [aliases[0]!]: loaded }
    }
    return {}
  }
}

function createDefaultUnloader(): (
  aliases: readonly string[],
) => Promise<void> {
  return async (aliases) => {
    if (aliases.length === 0) return
    try {
      const { Assets: PixiAssets } = await import("pixi.js")
      await PixiAssets.unload([...aliases])
    } catch {
      // Best-effort: pure-placeholder loads have nothing in the Pixi cache.
    }
  }
}

/**
 * Create an isolated garden asset loader (preferred in tests).
 * Production code may use the module-level helpers that share a default instance.
 */
export function createGardenAssetLoader(
  deps: GardenAssetLoaderDeps = {},
): GardenAssetLoader {
  const basePath = deps.basePath ?? GARDEN_ASSET_BASE_PATH
  const loadAssets = deps.loadAssets ?? createPixiAssetLoaderFn(basePath)
  const unloadAssets = deps.unloadAssets ?? createDefaultUnloader()

  const statusByName = new Map<string, BundleStatus>()
  const loadedByName = new Map<string, Assets>()
  const inflight = new Map<string, Promise<Assets>>()
  const inflightUnloads = new Map<string, Promise<void>>()
  /** Aliases currently held for each loaded bundle (for unload). */
  const aliasesByName = new Map<string, string[]>()
  const progressCallbacksByName = new Map<string, Set<LoadProgressCallback>>()

  function setStatus(name: string, status: BundleStatus): void {
    statusByName.set(name, status)
  }

  function makeError(
    name: string,
    message: string,
    cause?: unknown,
  ): BundleError {
    return { name, message, cause }
  }

  function fallbackResult(
    name: string,
    message: string,
    cause?: unknown,
  ): Assets {
    const error = makeError(name, message, cause)
    const result: Assets = {
      name,
      resources: {},
      fallback: true,
      error,
    }
    setStatus(name, "error")
    loadedByName.set(name, result)
    return result
  }

  function dispatchProgress(name: string, loaded: number, total: number): void {
    const callbacks = progressCallbacksByName.get(name)
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(loaded, total)
        } catch {
          // Ignore errors in user callbacks
        }
      }
    }
  }

  async function loadBundle(
    name: string,
    onProgress?: LoadProgressCallback,
  ): Promise<Assets> {
    const existingInflight = inflight.get(name)
    const cached = loadedByName.get(name)
    if (
      !existingInflight &&
      cached &&
      !cached.fallback &&
      statusByName.get(name) === "loaded"
    ) {
      const total = Object.keys(cached.resources).length
      try {
        onProgress?.(total, total)
      } catch {
        // Ignore errors in user callbacks
      }
      return cached
    }

    if (onProgress) {
      let callbacks = progressCallbacksByName.get(name)
      if (!callbacks) {
        callbacks = new Set()
        progressCallbacksByName.set(name, callbacks)
      }
      callbacks.add(onProgress)
    }

    if (existingInflight) {
      return existingInflight
    }

    const work = (async (): Promise<Assets> => {
      const bundle = getGardenBundle(name)
      if (!bundle) {
        dispatchProgress(name, 0, 0)
        return fallbackResult(name, `Unknown garden asset bundle: ${name}`)
      }

      setStatus(name, "loading")
      const resolved = resolveBundleAssets(bundle, basePath)
      const aliases = Object.keys(resolved)
      const total = aliases.length

      try {
        const resources = await loadAssets(resolved, (loaded, t) => {
          dispatchProgress(name, loaded, t)
        })

        const loadedKeys = resources ? Object.keys(resources) : []
        const isComplete =
          resources != null &&
          aliases.every(
            (alias) => alias in resources && resources[alias] !== undefined,
          )

        if (!isComplete) {
          dispatchProgress(name, total, total)
          return fallbackResult(
            name,
            `Manifest count mismatch for bundle ${name}: expected ${total} assets, got ${loadedKeys.length}`,
          )
        }

        const result: Assets = {
          name,
          resources,
          fallback: false,
        }

        // If unloadBundle was called while load was in flight, do not resurrect assets (Finding 1)
        if (statusByName.get(name) === "unloaded") {
          try {
            await unloadAssets(aliases)
          } catch {
            // Best-effort cleanup
          }
          dispatchProgress(name, total, total)
          return result
        }

        setStatus(name, "loaded")
        loadedByName.set(name, result)
        aliasesByName.set(name, aliases)
        dispatchProgress(name, total, total)
        return result
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : `Failed to load bundle: ${name}`
        // Ensure progress observers see a terminal state without throwing.
        dispatchProgress(name, total, total)
        return fallbackResult(name, message, cause)
      }
    })()

    inflight.set(name, work)
    try {
      return await work
    } finally {
      inflight.delete(name)
      progressCallbacksByName.delete(name)
    }
  }

  async function unloadBundle(name: string): Promise<void> {
    const existingInflightUnload = inflightUnloads.get(name)
    if (existingInflightUnload) {
      return existingInflightUnload
    }

    const currentStatus = statusByName.get(name)
    if (
      currentStatus === "unloaded" ||
      currentStatus === "idle" ||
      currentStatus === undefined
    ) {
      return
    }

    const unloadWork = (async (): Promise<void> => {
      if (statusByName.get(name) === "loading") {
        setStatus(name, "unloaded")
        const loadPromise = inflight.get(name)
        if (loadPromise) {
          try {
            await loadPromise
          } catch {
            // Best-effort load await
          }
        }
        return
      }

      const aliases = aliasesByName.get(name) ?? []
      await unloadAssets(aliases)
      aliasesByName.delete(name)
      loadedByName.delete(name)
      setStatus(name, "unloaded")
    })()

    inflightUnloads.set(name, unloadWork)
    try {
      await unloadWork
    } finally {
      inflightUnloads.delete(name)
    }
  }

  function preloadBundle(name: string): void {
    // Fire-and-forget: never reject to the host event loop.
    void loadBundle(name).catch(() => {
      // loadBundle is non-throwing; this is a safety net only.
    })
  }

  function getBundleStatus(name: string): BundleStatus {
    return statusByName.get(name) ?? "idle"
  }

  function getBundleStatuses(): Readonly<Record<string, BundleStatus>> {
    const out: Record<string, BundleStatus> = {}
    for (const [key, value] of statusByName) {
      out[key] = value
    }
    return out
  }

  function getLoadedAssets(name: string): Assets | undefined {
    return loadedByName.get(name)
  }

  function reset(): void {
    statusByName.clear()
    loadedByName.clear()
    inflight.clear()
    aliasesByName.clear()
  }

  return {
    loadBundle,
    unloadBundle,
    preloadBundle,
    getBundleStatus,
    getBundleStatuses,
    getLoadedAssets,
    reset,
  }
}

// ── Module-level default instance (GardenBattleCanvasHost integration) ─────

let defaultLoader: GardenAssetLoader | null = null

function getDefaultLoader(): GardenAssetLoader {
  if (!defaultLoader) {
    defaultLoader = createGardenAssetLoader()
  }
  return defaultLoader
}

/**
 * Load a garden asset bundle. Never throws — check `result.fallback`.
 * Progress: `(loaded, total)` asset counts.
 */
export function loadBundle(
  name: string,
  onProgress?: LoadProgressCallback,
): Promise<Assets> {
  return getDefaultLoader().loadBundle(name, onProgress)
}

/** Release resources for a previously loaded bundle. */
export function unloadBundle(name: string): Promise<void> {
  return getDefaultLoader().unloadBundle(name)
}

/** Start a background load without awaiting (lazy team / effects bundles). */
export function preloadBundle(name: string): void {
  getDefaultLoader().preloadBundle(name)
}

export function getBundleStatus(name: string): BundleStatus {
  return getDefaultLoader().getBundleStatus(name)
}

export function getBundleStatuses(): Readonly<Record<string, BundleStatus>> {
  return getDefaultLoader().getBundleStatuses()
}

export function getLoadedAssets(name: string): Assets | undefined {
  return getDefaultLoader().getLoadedAssets(name)
}

/**
 * Replace the process-wide default loader (tests / host boot with Pixi).
 * Pass `null` to discard and recreate on next use.
 */
export function setDefaultGardenAssetLoader(
  loader: GardenAssetLoader | null,
): void {
  defaultLoader = loader
}

/** Reset default loader tracking (unit tests). */
export function resetDefaultGardenAssetLoader(): void {
  defaultLoader?.reset()
  defaultLoader = null
}

/**
 * Configure the default loader for PixiJS bundle loading (legacy path).
 *
 * Presenter garden scene should use `loadGardenSceneAssets` instead.
 * `basePath` defaults to empty — manifest entries are already absolute
 * Vite-hashed URLs. Pass a relative base only when injecting test paths.
 */
export function configurePixiGardenAssetLoader(
  basePath: string = GARDEN_ASSET_BASE_PATH,
): GardenAssetLoader {
  const loader = createGardenAssetLoader({
    basePath,
    loadAssets: createPixiAssetLoaderFn(basePath),
  })
  setDefaultGardenAssetLoader(loader)
  return loader
}
