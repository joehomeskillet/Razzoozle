/**
 * Garden layer → imported-CC0-SVG alias map (WP-19-LAYER-REFACTOR).
 *
 * Each entry is the stable PixiJS Assets alias used by the loader; the actual
 * file path lives under `packages/web/src/assets/experiences/flower-battle/
 * optimized/fixed/` (see `generate-manifest.mjs` for the canonical mapping).
 *
 * Layers without an SVG candidate (flower-teams, weather, powerup, presenter
 * hud, event banner) stay procedural / empty in `gardenLayers.ts` and are
 * intentionally omitted from this map.
 *
 * The aliases must remain stable across releases — they are the contract
 * between the loader pipeline and the layer builders.
 */

export const GARDEN_LAYER_ASSET_ALIASES = {
  sky: "bg_sky_day",
  distantHills: "bg_hill_back_01",
  distantBushes: "bg_bush_back_01",
  midTrees: "bg_tree_mid_01",
  fence: "env_fence_white",
  grass: "env_grass_base",
  soilPlots: "env_soil_plot_01",
  foregroundLeafLeft: "env_foreground_leaf_left",
  foregroundLeafRight: "env_foreground_leaf_right",
  foregroundBush: "env_foreground_bush_01",
} as const

export type GardenLayerAssetAliasKey = keyof typeof GARDEN_LAYER_ASSET_ALIASES

export type GardenLayerAssetAlias =
  (typeof GARDEN_LAYER_ASSET_ALIASES)[GardenLayerAssetAliasKey]
