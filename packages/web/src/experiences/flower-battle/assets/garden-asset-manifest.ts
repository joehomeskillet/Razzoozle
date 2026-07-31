/**
 * Flower Battle garden asset bundle definitions (WP-03).
 *
 * Placeholder structure only — no production graphics. Real textures / Spine
 * rigs land in WP-04+; swap the relative paths in `assets` and optionally set
 * `GARDEN_ASSET_BASE_PATH` (or pass `basePath` into the loader) so PixiJS
 * `Assets.init({ basePath })` resolves them. Prefer Vite `import url from
 * '…/optimized/…'` for hashed production URLs instead of hard-coded paths.
 *
 * @see docs/design/flower-battle-pixi-spine-sdd.md §8
 * @see docs/design/wp-02-03-canvas-host-prep.md
 */

/** Load priority for a garden asset bundle. */
export type BundlePriority = "boot" | "eager" | "lazy"

/**
 * Reproducible bundle definition consumed by the garden asset loader.
 * Paths in `assets` are relative to the configured base path (never absolute
 * host paths).
 */
export interface AssetBundle {
  /** Stable bundle id (matches key in `GARDEN_BUNDLES`). */
  name: string
  /** Alias → relative asset path (or data-URI placeholder). */
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
 * Default base path for garden assets. Overridable via loader `basePath` or
 * PixiJS `Assets.init({ basePath })`. Not a hard-coded filesystem path.
 */
export const GARDEN_ASSET_BASE_PATH =
  "/assets/experiences/flower-battle/placeholders/"

/** 1×1 transparent PNG data URI — structure tests without network/WebGL. */
export const PLACEHOLDER_TEXTURE_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

function placeholderAssets(aliases: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const alias of aliases) {
    // Relative key under basePath; tests inject data-URI loaders and ignore path.
    out[alias] = `placeholder/${alias}.png`
  }
  return out
}

/**
 * All garden asset bundles. Keep small and declarative; real art is WP-04+.
 */
export const GARDEN_BUNDLES: Record<GardenBundleName, AssetBundle> = {
  boot: {
    name: "boot",
    priority: "boot",
    size: 8_192,
    assets: placeholderAssets(["boot-clear-color", "boot-logo-mark"]),
  },
  "garden-background": {
    name: "garden-background",
    priority: "eager",
    size: 64_000,
    assets: placeholderAssets([
      "bg-sky",
      "bg-horizon",
      "bg-ground",
      "bg-cloud",
    ]),
  },
  "garden-common": {
    name: "garden-common",
    priority: "eager",
    size: 48_000,
    assets: placeholderAssets([
      "common-plot",
      "common-particle-dot",
      "common-powerup-icon",
    ]),
  },
  "garden-flower-violet": {
    name: "garden-flower-violet",
    priority: "lazy",
    size: 96_000,
    assets: placeholderAssets([
      "flower-violet-stem",
      "flower-violet-head",
      "flower-violet-atlas",
    ]),
  },
  "garden-flower-blue": {
    name: "garden-flower-blue",
    priority: "lazy",
    size: 96_000,
    assets: placeholderAssets([
      "flower-blue-stem",
      "flower-blue-head",
      "flower-blue-atlas",
    ]),
  },
  "garden-flower-orange": {
    name: "garden-flower-orange",
    priority: "lazy",
    size: 96_000,
    assets: placeholderAssets([
      "flower-orange-stem",
      "flower-orange-head",
      "flower-orange-atlas",
    ]),
  },
  "garden-flower-green": {
    name: "garden-flower-green",
    priority: "lazy",
    size: 96_000,
    assets: placeholderAssets([
      "flower-green-stem",
      "flower-green-head",
      "flower-green-atlas",
    ]),
  },
  "garden-effects-low": {
    name: "garden-effects-low",
    priority: "lazy",
    size: 24_000,
    assets: placeholderAssets(["fx-low-spark", "fx-low-puff"]),
  },
  "garden-effects-high": {
    name: "garden-effects-high",
    priority: "lazy",
    size: 80_000,
    assets: placeholderAssets([
      "fx-high-spark",
      "fx-high-weather",
      "fx-high-bloom",
    ]),
  },
  "shared-ui": {
    name: "shared-ui",
    priority: "eager",
    size: 32_000,
    assets: placeholderAssets([
      "ui-button",
      "ui-panel",
      "ui-icon-sheet",
      "ui-font-atlas",
    ]),
  },
  "garden-audio": {
    name: "garden-audio",
    priority: "lazy",
    size: 48_000,
    assets: placeholderAssets([
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
