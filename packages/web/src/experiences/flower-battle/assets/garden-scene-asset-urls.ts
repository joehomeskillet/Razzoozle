/**
 * Vite-resolved URLs for Flower Battle production garden textures.
 *
 * Mix of:
 * - CC0 Kenney PNGs via Tiddybub/2d-assets @ e0cbe0d (background-elements)
 * - Razzoozle-internal CC0 SVGs (sky gradient, fence strip, lawn, soil, heads)
 *
 * Paths are hashed by the bundler; never hard-code public absolute URLs.
 */

import skyDayUrl from "../../../assets/experiences/flower-battle/optimized/fixed/sky-day.svg?url"
import sunKenneyUrl from "../../../assets/experiences/flower-battle/optimized/fixed/kenney-sun-01.png?url"
import cloud01Url from "../../../assets/experiences/flower-battle/optimized/fixed/kenney-cloud-01.png?url"
import cloud02Url from "../../../assets/experiences/flower-battle/optimized/fixed/kenney-cloud-02.png?url"
import cloud03Url from "../../../assets/experiences/flower-battle/optimized/fixed/kenney-cloud-03.png?url"
import cloud04Url from "../../../assets/experiences/flower-battle/optimized/fixed/kenney-cloud-04.png?url"
// Full Kenney "sample" plates are complete scenes (sky+hills) — too heavy as
// single layers. Keep vector silhouettes for horizon depth.
import distantHillsUrl from "../../../assets/experiences/flower-battle/optimized/fixed/distant-hills-01.svg?url"
import distantBushesUrl from "../../../assets/experiences/flower-battle/optimized/fixed/distant-bushes-01.svg?url"
import tree01Url from "../../../assets/experiences/flower-battle/optimized/fixed/kenney-tree-01.png?url"
import tree02Url from "../../../assets/experiences/flower-battle/optimized/fixed/kenney-tree-02.png?url"
import tree03Url from "../../../assets/experiences/flower-battle/optimized/fixed/kenney-tree-03.png?url"
import tree04Url from "../../../assets/experiences/flower-battle/optimized/fixed/kenney-tree-04.png?url"
import tree05Url from "../../../assets/experiences/flower-battle/optimized/fixed/kenney-tree-05.png?url"
import tree06Url from "../../../assets/experiences/flower-battle/optimized/fixed/kenney-tree-06.png?url"
import fenceUrl from "../../../assets/experiences/flower-battle/optimized/fixed/fence-white-01.svg?url"
import lawnUrl from "../../../assets/experiences/flower-battle/optimized/fixed/lawn-01.svg?url"
import lawnDetailUrl from "../../../assets/experiences/flower-battle/optimized/fixed/kenney-grass-tuft-01.png?url"
import lawnDetail02Url from "../../../assets/experiences/flower-battle/optimized/fixed/kenney-grass-tuft-02.png?url"
import lawnDetail03Url from "../../../assets/experiences/flower-battle/optimized/fixed/kenney-grass-tuft-03.png?url"
import soilPlotUrl from "../../../assets/experiences/flower-battle/optimized/fixed/soil-plot-team-01.svg?url"
import foregroundLeafLeftUrl from "../../../assets/experiences/flower-battle/optimized/fixed/foreground-leaf-left.svg?url"
import foregroundLeafRightUrl from "../../../assets/experiences/flower-battle/optimized/fixed/foreground-leaf-right.svg?url"
import foregroundBushUrl from "../../../assets/experiences/flower-battle/optimized/fixed/foreground-bush-01.svg?url"
import flowerHeadRoundUrl from "../../../assets/experiences/flower-battle/optimized/fixed/flower-head-round.svg?url"
import flowerHeadBellUrl from "../../../assets/experiences/flower-battle/optimized/fixed/flower-head-bell.svg?url"
import flowerHeadSunUrl from "../../../assets/experiences/flower-battle/optimized/fixed/flower-head-sun.svg?url"
import flowerHeadTulipUrl from "../../../assets/experiences/flower-battle/optimized/fixed/flower-head-tulip.svg?url"
import faceHappyUrl from "../../../assets/experiences/flower-battle/optimized/fixed/face-emotes-face-emote-happy-01.svg?url"
import plantStemUrl from "../../../assets/experiences/flower-battle/optimized/fixed/plant-stem-01.svg?url"
import plantLeafUrl from "../../../assets/experiences/flower-battle/optimized/fixed/plant-leaf-01.svg?url"
// Fluent-derived production plant stages (full source colors preserved).
import plantSharedSeedlingUrl from "../../../assets/experiences/flower-battle/optimized/plants/shared/seedling.svg?url"
import plantSharedSproutUrl from "../../../assets/experiences/flower-battle/optimized/plants/shared/sprout.svg?url"
import plantPotUrl from "../../../assets/experiences/flower-battle/optimized/plants/shared/pot.svg?url"
import plantVioletBudUrl from "../../../assets/experiences/flower-battle/optimized/plants/violet-hibiscus/bud.svg?url"
import plantVioletHalfUrl from "../../../assets/experiences/flower-battle/optimized/plants/violet-hibiscus/half-bloom.svg?url"
import plantVioletFullUrl from "../../../assets/experiences/flower-battle/optimized/plants/violet-hibiscus/full-bloom.svg?url"
import plantBlueBudUrl from "../../../assets/experiences/flower-battle/optimized/plants/blue-tulip/bud.svg?url"
import plantBlueHalfUrl from "../../../assets/experiences/flower-battle/optimized/plants/blue-tulip/half-bloom.svg?url"
import plantBlueFullUrl from "../../../assets/experiences/flower-battle/optimized/plants/blue-tulip/full-bloom.svg?url"
import plantOrangeBudUrl from "../../../assets/experiences/flower-battle/optimized/plants/orange-sunflower/bud.svg?url"
import plantOrangeHalfUrl from "../../../assets/experiences/flower-battle/optimized/plants/orange-sunflower/half-bloom.svg?url"
import plantOrangeFullUrl from "../../../assets/experiences/flower-battle/optimized/plants/orange-sunflower/full-bloom.svg?url"
import plantGreenBudUrl from "../../../assets/experiences/flower-battle/optimized/plants/green-blossom/bud.svg?url"
import plantGreenHalfUrl from "../../../assets/experiences/flower-battle/optimized/plants/green-blossom/half-bloom.svg?url"
import plantGreenFullUrl from "../../../assets/experiences/flower-battle/optimized/plants/green-blossom/full-bloom.svg?url"

/** Stable Pixi / diagnostics alias → Vite-hashed asset URL. */
export const GARDEN_SCENE_ASSET_URLS = {
  bg_sky_day: skyDayUrl,
  bg_sun_glow: sunKenneyUrl,
  bg_cloud_01: cloud01Url,
  bg_cloud_02: cloud02Url,
  bg_cloud_03: cloud03Url,
  bg_cloud_04: cloud04Url,
  bg_hill_back_01: distantHillsUrl,
  bg_bush_back_01: distantBushesUrl,
  /** Compat alias — primary mid tree. */
  bg_tree_mid_01: tree01Url,
  bg_tree_02: tree02Url,
  bg_tree_03: tree03Url,
  bg_tree_04: tree04Url,
  bg_tree_05: tree05Url,
  bg_tree_06: tree06Url,
  env_fence_white: fenceUrl,
  env_grass_base: lawnUrl,
  env_grass_detail_01: lawnDetailUrl,
  env_grass_detail_02: lawnDetail02Url,
  env_grass_detail_03: lawnDetail03Url,
  env_soil_plot_01: soilPlotUrl,
  env_foreground_leaf_left: foregroundLeafLeftUrl,
  env_foreground_leaf_right: foregroundLeafRightUrl,
  env_foreground_bush_01: foregroundBushUrl,
  plant_head_round: flowerHeadRoundUrl,
  plant_head_bell: flowerHeadBellUrl,
  plant_head_sun: flowerHeadSunUrl,
  plant_head_tulip: flowerHeadTulipUrl,
  face_emote_happy: faceHappyUrl,
  /** Tintable stem / leaf body for the legacy fallback plant. */
  plant_stem_01: plantStemUrl,
  plant_leaf_01: plantLeafUrl,
  /** Full-color Fluent pot shared by every HQ plant. */
  plant_pot_01: plantPotUrl,
  // Fluent-derived production plant stages (full source colors preserved).
  plant_shared_seedling: plantSharedSeedlingUrl,
  plant_shared_sprout: plantSharedSproutUrl,
  plant_violet_bud: plantVioletBudUrl,
  plant_violet_half: plantVioletHalfUrl,
  plant_violet_full: plantVioletFullUrl,
  plant_blue_bud: plantBlueBudUrl,
  plant_blue_half: plantBlueHalfUrl,
  plant_blue_full: plantBlueFullUrl,
  plant_orange_bud: plantOrangeBudUrl,
  plant_orange_half: plantOrangeHalfUrl,
  plant_orange_full: plantOrangeFullUrl,
  plant_green_bud: plantGreenBudUrl,
  plant_green_half: plantGreenHalfUrl,
  plant_green_full: plantGreenFullUrl,
} as const

export type GardenSceneAssetAlias = keyof typeof GARDEN_SCENE_ASSET_URLS

/** Mandatory aliases for the happy-path garden scene (no silent fallback). */
export const GARDEN_SCENE_REQUIRED_ALIASES = [
  "bg_sky_day",
  "bg_sun_glow",
  "bg_cloud_01",
  "bg_cloud_02",
  "bg_cloud_03",
  "bg_hill_back_01",
  "bg_bush_back_01",
  "bg_tree_mid_01",
  "bg_tree_02",
  "bg_tree_03",
  "env_fence_white",
  "env_grass_base",
  "env_soil_plot_01",
  "env_foreground_leaf_left",
  "env_foreground_leaf_right",
  "plant_head_round",
  "plant_head_bell",
  "plant_head_sun",
  "plant_head_tulip",
  "plant_stem_01",
  "plant_leaf_01",
  "plant_pot_01",
  // Fluent-derived production plant stages (full source colors preserved).
  "plant_shared_seedling",
  "plant_shared_sprout",
  "plant_violet_bud",
  "plant_violet_half",
  "plant_violet_full",
  "plant_blue_bud",
  "plant_blue_half",
  "plant_blue_full",
  "plant_orange_bud",
  "plant_orange_half",
  "plant_orange_full",
  "plant_green_bud",
  "plant_green_half",
  "plant_green_full",
] as const satisfies readonly GardenSceneAssetAlias[]

export type GardenSceneRequiredAlias =
  (typeof GARDEN_SCENE_REQUIRED_ALIASES)[number]
