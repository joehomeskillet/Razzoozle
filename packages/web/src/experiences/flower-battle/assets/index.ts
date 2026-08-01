/**
 * Flower Battle garden asset pipeline.
 *
 * **Production (presenter garden scene):**
 * 1. `GARDEN_SCENE_ASSET_URLS` — Vite `?url` imports of optimized textures
 * 2. `loadGardenSceneAssets(palette)` — bake SVG colours, rasterise, diagnose
 * 3. Host (`attachGardenPixiApplication`) wires textures into `GardenScene`
 *
 * **Legacy bundle API (WP-03, non-production for the scene):**
 * 1. `loadBundle('boot' | …)` — failure-tolerant Pixi Assets wrapper
 * 2. Bundles in `GARDEN_BUNDLES` point at the same Vite URLs (no `/placeholders/`)
 * 3. On `result.fallback === true`: keep match alive; show StaticFallback
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
  assertNoPlaceholderPaths,
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

export {
  GARDEN_SCENE_ASSET_URLS,
  GARDEN_SCENE_REQUIRED_ALIASES,
} from "./garden-scene-asset-urls"

export type {
  GardenSceneAssetAlias,
  GardenSceneRequiredAlias,
} from "./garden-scene-asset-urls"

export {
  bakeSvgForPixi,
  clearGardenAssetDiagnostics,
  hexToCssColor,
  loadGardenSceneAssets,
  publishGardenAssetDiagnostics,
} from "./loadGardenSceneAssets"

export type {
  GardenAssetDiagnostics,
  GardenSceneLoadedAssets,
  PlantBodyTextures,
  PlantHeadTextures,
} from "./loadGardenSceneAssets"
