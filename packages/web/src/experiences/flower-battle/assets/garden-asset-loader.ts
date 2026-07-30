/**
 * Garden asset loader (WP-03) — thin, failure-tolerant wrapper over PixiJS Assets.
 *
 * Contract:
 * - `loadBundle` never throws; failures return `{ fallback: true, error }`.
 * - Match must continue; host maps fallback → StaticFallback (WP-02).
 * - Concurrent loads of the same name share one in-flight promise.
 * - `preloadBundle` is fire-and-forget (does not block the caller).
 * - `unloadBundle` releases tracked resources for memory cleanup.
 *
 * Real graphics (WP-04+): keep aliases stable, replace relative paths in the
 * manifest, and either set `basePath` or Vite-import URLs into the manifest.
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
  let initPromise: Promise<void> | null = null

  return async (assets, onProgress) => {
    const { Assets: PixiAssets } = await import("pixi.js")
    if (!initPromise) {
      initPromise = PixiAssets.init({
        basePath,
        // Skip browser format detection in constrained environments.
        skipDetections: true,
      }).catch(() => {
        // init may already have run; subsequent loads still work.
      })
    }
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

    if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) {
      return loaded as Record<string, unknown>
    }

    // Single-asset load returns the resource directly.
    if (aliases.length === 1) {
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
  const loadAssets =
    deps.loadAssets ??
    // Prefer placeholder path when no custom loader — avoids accidental WebGL
    // in unit tests. Production hosts should pass createPixiAssetLoaderFn().
    createPlaceholderAssetLoaderFn()
  const unloadAssets = deps.unloadAssets ?? createDefaultUnloader()

  const statusByName = new Map<string, BundleStatus>()
  const loadedByName = new Map<string, Assets>()
  const inflight = new Map<string, Promise<Assets>>()
  /** Aliases currently held for each loaded bundle (for unload). */
  const aliasesByName = new Map<string, string[]>()

  function setStatus(name: string, status: BundleStatus): void {
    statusByName.set(name, status)
  }

  function makeError(name: string, message: string, cause?: unknown): BundleError {
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

  async function loadBundle(
    name: string,
    onProgress?: LoadProgressCallback,
  ): Promise<Assets> {
    const existingInflight = inflight.get(name)
    if (existingInflight) {
      // Share the load; still fan progress if a late subscriber arrives mid-flight
      // is best-effort only (primary progress already owned by first caller).
      return existingInflight
    }

    const cached = loadedByName.get(name)
    if (cached && !cached.fallback && statusByName.get(name) === "loaded") {
      const total = Object.keys(cached.resources).length
      onProgress?.(total, total)
      return cached
    }

    const work = (async (): Promise<Assets> => {
      const bundle = getGardenBundle(name)
      if (!bundle) {
        onProgress?.(0, 0)
        return fallbackResult(name, `Unknown garden asset bundle: ${name}`)
      }

      setStatus(name, "loading")
      const resolved = resolveBundleAssets(bundle, basePath)
      const total = Object.keys(resolved).length

      try {
        const resources = await loadAssets(resolved, onProgress)
        const result: Assets = {
          name,
          resources: resources ?? {},
          fallback: false,
        }
        setStatus(name, "loaded")
        loadedByName.set(name, result)
        aliasesByName.set(name, Object.keys(resolved))
        onProgress?.(total, total)
        return result
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : `Failed to load bundle: ${name}`
        // Ensure progress observers see a terminal state without throwing.
        onProgress?.(0, total)
        return fallbackResult(name, message, cause)
      }
    })()

    inflight.set(name, work)
    try {
      return await work
    } finally {
      inflight.delete(name)
    }
  }

  async function unloadBundle(name: string): Promise<void> {
    const aliases = aliasesByName.get(name) ?? []
    try {
      await unloadAssets(aliases)
    } catch {
      // Unload is best-effort; tracking is still cleared.
    }
    aliasesByName.delete(name)
    loadedByName.delete(name)
    if (statusByName.get(name) === "loaded" || statusByName.get(name) === "error") {
      setStatus(name, "unloaded")
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
 * Convenience: configure the default loader for production PixiJS loading.
 * Call once near app boot or before GardenBattleCanvasHost mounts.
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
