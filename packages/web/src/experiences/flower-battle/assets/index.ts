/**
 * Flower Battle garden asset pipeline (WP-03).
 *
 * Integration (WP-02 host / WP-05 scene):
 * 1. On canvas mount: `await loadBundle('boot', onProgress)` before scene init.
 * 2. Progress → HTML loading overlay (do not block match if fallback).
 * 3. When teams known: `preloadBundle('garden-flower-' + colorKey)`.
 * 4. Quality tier: load `garden-effects-low` or `garden-effects-high`.
 * 5. On `result.fallback === true`: keep match alive; show StaticFallback.
 * 6. After match: `unloadBundle` for lazy team/effect bundles.
 *
 * Real art (WP-04+): update paths in `GARDEN_BUNDLES` and optionally call
 * `configurePixiGardenAssetLoader(basePath)` with CDN/Vite public base.
 */

export {
  configurePixiGardenAssetLoader,
  createGardenAssetLoader,
  createPlaceholderAssetLoaderFn,
  createPixiAssetLoaderFn,
  getBundleStatus,
  getBundleStatuses,
  getLoadedAssets,
  loadBundle,
  preloadBundle,
  resetDefaultGardenAssetLoader,
  setDefaultGardenAssetLoader,
  unloadBundle,
} from "./garden-asset-loader"

export type { GardenAssetLoader } from "./garden-asset-loader"

export {
  GARDEN_ASSET_BASE_PATH,
  GARDEN_BUNDLE_NAMES,
  GARDEN_BUNDLES,
  getGardenBundle,
  isGardenBundleName,
  listBundlesByPriority,
  PLACEHOLDER_TEXTURE_DATA_URI,
} from "./garden-asset-manifest"

export type {
  AssetBundle,
  BundlePriority,
  GardenBundleName,
} from "./garden-asset-manifest"

export type {
  Assets,
  BundleError,
  BundleStatus,
  GardenAssetLoaderDeps,
  LoadProgress,
  LoadProgressCallback,
} from "./garden-asset-types"
