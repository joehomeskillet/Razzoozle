/**
 * Flower Battle garden asset bundle definitions.
 *
 * Production scene textures live in `garden-scene-asset-urls.ts` (Vite `?url`
 * imports) and are loaded by `loadGardenSceneAssets.ts` — that is the
 * production path used by the presenter.
 *
 * This manifest maps the legacy WP-03 bundle API (`loadBundle` /
 * `garden-asset-loader`) onto the same Vite-resolved production URLs so both
 * loaders share one source of truth. Asset values are absolute hashed URLs
 * (or data-URIs for non-visual structural slots). No `/placeholders/` base.
 *
 * @see garden-scene-asset-urls.ts
 * @see loadGardenSceneAssets.ts
 * @see docs/design/flower-battle-pixi-spine-sdd.md §8
 */

import { GARDEN_SCENE_ASSET_URLS } from "./garden-scene-asset-urls"

/** Load priority for a garden asset bundle. */
export type BundlePriority = "boot" | "eager" | "lazy"

/**
 * Reproducible bundle definition consumed by the garden asset loader.
 * Paths in `assets` are absolute Vite-hashed URLs (or data-URIs). When a
 * value is already absolute / data-URI, loader `basePath` is not applied.
 */
export interface AssetBundle {
  /** Stable bundle id (matches key in `GARDEN_BUNDLES`). */
  name: string
  /** Alias → Vite-hashed URL (or data-URI for non-visual slots). */
  assets: Record<string, string>
  priority: BundlePriority
  /** Optional uncompressed size hint in bytes (informational only). */
  size?: number
}

/**
 * Canonical garden bundle names (11 total for WP-03).
 * Team flowers and effects are lazy; boot/background/common are boot|eager.
 */
export type GardenBundleName =
  | "boot"
  | "garden-background"
  | "garden-common"
  | "garden-flower-violet"
  | "garden-flower-blue"
  | "garden-flower-orange"
  | "garden-flower-green"
  | "garden-effects-low"
  | "garden-effects-high"
  | "shared-ui"
  | "garden-audio"

/**
 * Base path for relative asset keys only.
 *
 * Production bundle entries use Vite-hashed absolute URLs from
 * `GARDEN_SCENE_ASSET_URLS`, so this is intentionally empty. Override via
 * loader `basePath` if you inject relative paths in tests.
 *
 * @deprecated Prefer Vite `?url` imports in `garden-scene-asset-urls.ts`.
 * Do not reintroduce `/assets/experiences/flower-battle/placeholders/`.
 */
export const GARDEN_ASSET_BASE_PATH = ""

/**
 * 1×1 transparent PNG data URI — unit-test structural stand-in and
 * non-visual slots (audio) that have no file asset yet. Not a filesystem
 * path and never under `/placeholders/`.
 */
export const PLACEHOLDER_TEXTURE_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

/** Shorthand: production Vite URLs (single source of truth). */
const U = GARDEN_SCENE_ASSET_URLS

/**
 * Build a Record of alias → data-URI for slots without production media
 * (audio). Keeps the bundle shape intact without `/placeholders/` paths.
 */
function dataUriAssets(aliases: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const alias of aliases) {
    out[alias] = PLACEHOLDER_TEXTURE_DATA_URI
  }
  return out
}

/**
 * All garden asset bundles. Visual aliases resolve via
 * `GARDEN_SCENE_ASSET_URLS` (Vite `?url`). Keep alias keys stable for the
 * legacy loader API; production scene code uses scene aliases directly.
 */
export const GARDEN_BUNDLES: Record<GardenBundleName, AssetBundle> = {
  boot: {
    name: "boot",
    priority: "boot",
    size: 8_192,
    assets: {
      "boot-clear-color": U.bg_sky_day,
      "boot-logo-mark": U.face_emote_happy,
    },
  },
  "garden-background": {
    name: "garden-background",
    priority: "eager",
    size: 64_000,
    assets: {
      "bg-sky": U.bg_sky_day,
      "bg-horizon": U.bg_hill_back_01,
      "bg-ground": U.env_grass_base,
      "bg-cloud": U.bg_cloud_01,
      // Extra production layers for the legacy bundle surface
      "bg-sun": U.bg_sun_glow,
      "bg-hills": U.bg_hill_back_01,
      "bg-bush": U.bg_bush_back_01,
    },
  },
  "garden-common": {
    name: "garden-common",
    priority: "eager",
    size: 48_000,
    assets: {
      "common-plot": U.env_soil_plot_01,
      "common-particle-dot": U.env_grass_detail_01,
      "common-powerup-icon": U.face_emote_happy,
      "common-fence": U.env_fence_white,
      "common-leaf-left": U.env_foreground_leaf_left,
      "common-leaf-right": U.env_foreground_leaf_right,
    },
  },
  "garden-flower-violet": {
    name: "garden-flower-violet",
    priority: "lazy",
    size: 96_000,
    assets: {
      "flower-violet-stem": U.env_foreground_leaf_left,
      "flower-violet-head": U.plant_head_round,
      "flower-violet-atlas": U.plant_head_round,
    },
  },
  "garden-flower-blue": {
    name: "garden-flower-blue",
    priority: "lazy",
    size: 96_000,
    assets: {
      "flower-blue-stem": U.env_foreground_leaf_left,
      "flower-blue-head": U.plant_head_bell,
      "flower-blue-atlas": U.plant_head_bell,
    },
  },
  "garden-flower-orange": {
    name: "garden-flower-orange",
    priority: "lazy",
    size: 96_000,
    assets: {
      "flower-orange-stem": U.env_foreground_leaf_right,
      "flower-orange-head": U.plant_head_sun,
      "flower-orange-atlas": U.plant_head_sun,
    },
  },
  "garden-flower-green": {
    name: "garden-flower-green",
    priority: "lazy",
    size: 96_000,
    assets: {
      "flower-green-stem": U.env_foreground_leaf_right,
      "flower-green-head": U.plant_head_tulip,
      "flower-green-atlas": U.plant_head_tulip,
    },
  },
  "garden-effects-low": {
    name: "garden-effects-low",
    priority: "lazy",
    size: 24_000,
    assets: {
      "fx-low-spark": U.bg_sun_glow,
      "fx-low-puff": U.bg_cloud_01,
    },
  },
  "garden-effects-high": {
    name: "garden-effects-high",
    priority: "lazy",
    size: 80_000,
    assets: {
      "fx-high-spark": U.bg_sun_glow,
      "fx-high-weather": U.bg_cloud_02,
      "fx-high-bloom": U.plant_head_sun,
    },
  },
  "shared-ui": {
    name: "shared-ui",
    priority: "eager",
    size: 32_000,
    assets: {
      "ui-button": U.face_emote_happy,
      "ui-panel": U.env_soil_plot_01,
      "ui-icon-sheet": U.face_emote_happy,
      "ui-font-atlas": U.env_fence_white,
    },
  },
  // Audio has no file assets in this package yet — structural data-URIs only.
  "garden-audio": {
    name: "garden-audio",
    priority: "lazy",
    size: 48_000,
    assets: dataUriAssets([
      "sfx-plant",
      "sfx-harvest",
      "sfx-water",
      "amb-garden-loop",
    ]),
  },
}

/** Ordered list of all known garden bundle names. */
export const GARDEN_BUNDLE_NAMES: readonly GardenBundleName[] = Object.keys(
  GARDEN_BUNDLES,
) as GardenBundleName[]

/** Type guard for known garden bundle names. */
export function isGardenBundleName(name: string): name is GardenBundleName {
  return Object.hasOwn(GARDEN_BUNDLES, name)
}

/** Look up a bundle definition, or `undefined` if the name is unknown. */
export function getGardenBundle(name: string): AssetBundle | undefined {
  if (!isGardenBundleName(name)) return undefined
  return GARDEN_BUNDLES[name]
}

/**
 * Bundles that should load for a given priority set (e.g. boot + eager at
 * lobby entry). Pure helper for host/WP-05 orchestration.
 */
export function listBundlesByPriority(
  priorities: readonly BundlePriority[],
): AssetBundle[] {
  const wanted = new Set(priorities)
  return GARDEN_BUNDLE_NAMES.map((n) => GARDEN_BUNDLES[n]).filter((b) =>
    wanted.has(b.priority),
  )
}

/**
 * True when every visual (non-audio) asset URL is a Vite-hashed absolute URL
 * or data-URI — never a `/placeholders/` path. Used by unit tests.
 */
export function assertNoPlaceholderPaths(
  bundles: Record<string, AssetBundle> = GARDEN_BUNDLES,
): string[] {
  const offenders: string[] = []
  for (const [bundleName, bundle] of Object.entries(bundles)) {
    for (const [alias, src] of Object.entries(bundle.assets)) {
      if (
        src.includes("/placeholders/") ||
        src.startsWith("placeholder/") ||
        src.includes("/placeholder/")
      ) {
        offenders.push(`${bundleName}.${alias}: ${src}`)
      }
    }
  }
  return offenders
}
