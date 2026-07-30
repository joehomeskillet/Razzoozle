/**
 * Shared types for the Flower Battle garden asset pipeline (WP-03).
 */

/**
 * Progress reported while a bundle loads.
 * `loaded` / `total` are asset counts (not bytes).
 */
export interface LoadProgress {
  loaded: number
  total: number
}

/** Progress callback signature for `loadBundle`. */
export type LoadProgressCallback = (loaded: number, total: number) => void

/** Non-throwing error description when a bundle fails to load. */
export interface BundleError {
  /** Bundle name that failed. */
  name: string
  message: string
  cause?: unknown
}

/**
 * Lifecycle status tracked per bundle.
 * - idle: never requested
 * - loading: in flight
 * - loaded: available in memory
 * - error: last attempt failed (fallback used)
 * - unloaded: was loaded, then released
 */
export type BundleStatus =
  | "idle"
  | "loading"
  | "loaded"
  | "error"
  | "unloaded"

/**
 * Result of `loadBundle`. Never thrown — failures set `fallback: true`.
 * Named `Assets` to match the WP-03 contract (not PixiJS `Assets` class).
 */
export interface Assets {
  name: string
  /** Alias → loaded resource (texture stub, Pixi Texture, etc.). */
  resources: Record<string, unknown>
  /**
   * When true, the bundle is not usable for the full scene — host should
   * keep the match alive and may switch to StaticFallback (WP-02).
   */
  fallback: boolean
  error?: BundleError
}

/**
 * Low-level load adapter (PixiJS Assets or test fake).
 * Paths are already resolved (basePath applied by the loader).
 */
export type BundleAssetLoaderFn = (
  assets: Record<string, string>,
  onProgress?: LoadProgressCallback,
) => Promise<Record<string, unknown>>

/** Low-level unload adapter. */
export type BundleAssetUnloaderFn = (
  aliases: readonly string[],
) => Promise<void>

/** Optional dependencies for `createGardenAssetLoader` (test injection). */
export interface GardenAssetLoaderDeps {
  /** Override base path for relative asset keys. */
  basePath?: string
  /** Replace the default (Pixi-backed or placeholder) loader. */
  loadAssets?: BundleAssetLoaderFn
  /** Replace the default unloader. */
  unloadAssets?: BundleAssetUnloaderFn
}
